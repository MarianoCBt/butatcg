// =====================================================================
//  Consulta a YGOPRODeck por código de set (ej: "RA03-SP001").
//  Usado por el Escáner de cartas (vista oculta #escaner).
// =====================================================================

const SETINFO_API = 'https://db.ygoprodeck.com/api/v7/cardsetsinfo.php'
const CARDINFO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

// Códigos como "RA03-SP001": prefijo del set + región (o nada) + número.
export const SETCODE_REGEX = /\b([A-Z0-9]{2,5})-([A-Z]{0,3})(\d{3,4})\b/

// Región del código -> idioma legible (para la columna descripción).
const IDIOMAS = {
  '': 'Inglés',
  EN: 'Inglés',
  SP: 'Español',
  S: 'Español',
  FR: 'Francés',
  F: 'Francés',
  DE: 'Alemán',
  G: 'Alemán',
  IT: 'Italiano',
  I: 'Italiano',
  PT: 'Portugués',
  P: 'Portugués',
  JP: 'Japonés',
  KR: 'Coreano',
}

export function idiomaDeCodigo(codigo) {
  const m = SETCODE_REGEX.exec(codigo || '')
  return m ? IDIOMAS[m[2]] || '' : ''
}

// La base de YGOPRODeck indexa los códigos en inglés (región EN o sin
// región). Si la carta es de otro idioma, probamos también su código EN.
function variantesDeCodigo(codigo) {
  const m = SETCODE_REGEX.exec(codigo)
  if (!m) return [codigo]
  const [, set, region, num] = m
  const variantes = [codigo]
  if (region !== 'EN') {
    variantes.push(`${set}-EN${num}`)
    variantes.push(`${set}-${num}`)
  }
  return variantes
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json().catch(() => null)
}

// Devuelve la imagen chica de una carta por id (mismo patrón que la planilla).
function imagenPorId(id) {
  return id ? `https://images.ygoprodeck.com/images/cards_small/${id}.jpg` : ''
}

/**
 * Busca una carta por código de set. Devuelve
 * `{ nombre, codigo, setNombre, rareza, precioUsd, imagen, idioma }`
 * o `null` si no se encontró.
 */
export async function buscarPorCodigo(codigoCrudo) {
  const codigo = String(codigoCrudo || '').trim().toUpperCase()
  if (!codigo) return null

  for (const variante of variantesDeCodigo(codigo)) {
    const data = await fetchJson(
      `${SETINFO_API}?setcode=${encodeURIComponent(variante)}`,
    )
    if (!data || data.error || !data.name) continue

    let imagen = imagenPorId(data.id)
    if (!imagen) {
      // Algunas respuestas viejas no traen id: buscamos la imagen por nombre.
      const info = await fetchJson(
        `${CARDINFO_API}?name=${encodeURIComponent(data.name)}`,
      )
      imagen = info?.data?.[0]?.card_images?.[0]?.image_url_small || ''
    }

    return {
      nombre: data.name,
      codigo, // el código físico escaneado (conserva el idioma real)
      setNombre: data.set_name || '',
      rareza: data.set_rarity || '',
      precioUsd: parseFloat(data.set_price) || 0,
      imagen,
      idioma: idiomaDeCodigo(codigo),
    }
  }
  return null
}

// Misma regla de precios que scripts/importar-stock.mjs:
//   precio = usd * cotización * (1 + margen%) + recargo fijo, redondeado.
export const PRECIO = { MARGEN: 36, RECARGO_FIJO: 800, REDONDEO: 100 }

export function calcularPrecio(usd, cotizacion) {
  if (!usd || usd <= 0 || !cotizacion || cotizacion <= 0) return 0
  const costo = usd * cotizacion
  const p = costo * (1 + PRECIO.MARGEN / 100) + PRECIO.RECARGO_FIJO
  return Math.round(p / PRECIO.REDONDEO) * PRECIO.REDONDEO
}
