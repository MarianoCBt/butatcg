// =====================================================================
//  Consulta a YGOPRODeck por código de set (ej: "RA03-SP001").
//  Usado por el Escáner de cartas (vista oculta #escaner).
//  El precio de referencia (set_price) que devuelve la API es el de
//  TCGPlayer para esa impresión/rareza.
// =====================================================================

const SETINFO_API = 'https://db.ygoprodeck.com/api/v7/cardsetsinfo.php'
const CARDINFO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

// Códigos como "RA03-SP001": prefijo del set + región (o nada) + número.
export const SETCODE_REGEX = /\b([A-Z0-9]{2,5})-([A-Z]{0,3})(\d{3,4})\b/

// Regiones/idiomas válidos que aparecen en los códigos de set.
const REGIONES = [
  'EN', 'SP', 'FR', 'DE', 'IT', 'PT', 'JP', 'JA', 'KR', 'AE', 'TC', 'SC',
  'E', 'F', 'G', 'I', 'P', 'S', 'K', 'A', 'C',
]

// Región del código -> idioma legible (para la columna descripción).
const IDIOMAS = {
  '': 'Inglés',
  EN: 'Inglés',
  E: 'Inglés',
  A: 'Inglés',
  AE: 'Inglés',
  SP: 'Español',
  S: 'Español',
  FR: 'Francés',
  F: 'Francés',
  C: 'Francés',
  DE: 'Alemán',
  G: 'Alemán',
  IT: 'Italiano',
  I: 'Italiano',
  PT: 'Portugués',
  P: 'Portugués',
  JP: 'Japonés',
  JA: 'Japonés',
  KR: 'Coreano',
  K: 'Coreano',
  TC: 'Chino tradicional',
  SC: 'Chino simplificado',
}

export function idiomaDeCodigo(codigo) {
  const m = SETCODE_REGEX.exec(codigo || '')
  return m ? IDIOMAS[m[2]] || '' : ''
}

// ---------------------------------------------------------------------
//  Extracción tolerante de códigos desde texto de OCR.
//  El OCR confunde caracteres parecidos (O↔0, S↔5, I↔1, B↔8…); acá se
//  prueban las combinaciones que forman un código válido.
// ---------------------------------------------------------------------

const LETRA_A_DIGITO = {
  O: '0', Q: '0', D: '0', U: '0',
  I: '1', L: '1',
  Z: '2',
  A: '4',
  S: '5',
  G: '6',
  T: '7',
  B: '8',
}
const DIGITO_A_LETRA = {
  0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B',
}

function aDigitos(s) {
  const r = [...s].map((c) => LETRA_A_DIGITO[c] || c).join('')
  return /^\d+$/.test(r) ? r : null
}

function aLetras(s) {
  return [...s].map((c) => DIGITO_A_LETRA[c] || c).join('')
}

// Variantes del prefijo del set: los dígitos suelen ir al final
// (RA03, MP24, LED9), así que si el OCR leyó "RAO3" probamos "RA03".
function variantesPrefijo(pre) {
  const out = [pre]
  for (let corte = 2; corte < pre.length; corte++) {
    const cabeza = pre.slice(0, corte)
    if (!/^[A-Z]+$/.test(cabeza)) continue
    const cola = aDigitos(pre.slice(corte))
    if (cola && !out.includes(cabeza + cola)) out.push(cabeza + cola)
  }
  return out
}

/**
 * Extrae posibles códigos de set de un texto leído por OCR, corrigiendo
 * confusiones típicas. Devuelve una lista de candidatos (puede ser vacía),
 * ordenada de más a menos probable.
 */
export function extraerCodigos(textoCrudo) {
  const texto = String(textoCrudo || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, ' ')
  const candidatos = []
  const re = /([A-Z0-9]{2,5})\s*-\s*([A-Z0-9]{3,7})/g
  let m
  while ((m = re.exec(texto))) {
    const [, preCrudo, cola] = m
    for (const pre of variantesPrefijo(preCrudo)) {
      // La cola es región (0-3 letras) + número (3-4 dígitos).
      // Probamos primero la región de 2 letras, que es lo más común.
      for (const lenRegion of [2, 0, 1, 3]) {
        const region = aLetras(cola.slice(0, lenRegion))
        const num = aDigitos(cola.slice(lenRegion))
        if (!num || num.length < 3 || num.length > 4) continue
        if (lenRegion > 0 && !REGIONES.includes(region)) continue
        candidatos.push(`${pre}-${region}${num}`)
      }
    }
  }
  return [...new Set(candidatos)]
}

// ---------------------------------------------------------------------
//  Búsqueda en la API
// ---------------------------------------------------------------------

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
 * (`precioUsd` = precio de referencia de TCGPlayer) o `null`.
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
