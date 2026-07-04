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

// Idiomas elegibles al cargar una carta y la región que va en el código.
export const IDIOMAS_ELEGIBLES = [
  'Inglés',
  'Español',
  'Francés',
  'Alemán',
  'Italiano',
  'Portugués',
]
const REGION_POR_IDIOMA = {
  Inglés: 'EN',
  Español: 'SP',
  Francés: 'FR',
  Alemán: 'DE',
  Italiano: 'IT',
  Portugués: 'PT',
}

// Reescribe la región de un código según el idioma de la copia física
// (RA05-EN028 + Español -> RA05-SP028). Para inglés se deja como está.
export function codigoParaIdioma(codigo, idioma) {
  const region = REGION_POR_IDIOMA[idioma]
  const m = SETCODE_REGEX.exec(codigo || '')
  if (!m || !region || region === 'EN') return codigo
  return `${m[1]}-${region}${m[3]}`
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

// ---------------------------------------------------------------------
//  Búsqueda por NOMBRE (el texto grande de la carta: mucho más legible
//  para el OCR que el código). Devuelve la carta con TODAS sus
//  impresiones (card_sets) para elegir la versión en un desplegable.
// ---------------------------------------------------------------------

function normalizarNombre(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

// Similitud de Dice sobre bigramas (0..1): tolera letras mal leídas.
function bigramas(s) {
  const m = new Map()
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2)
    m.set(b, (m.get(b) || 0) + 1)
  }
  return m
}

function similitud(a, b) {
  if (!a || !b) return 0
  const ba = bigramas(a)
  const bb = bigramas(b)
  let inter = 0
  for (const [bg, na] of ba) inter += Math.min(na, bb.get(bg) || 0)
  const total = a.length - 1 + (b.length - 1)
  return total > 0 ? (2 * inter) / total : 0
}

function mapearCarta(c) {
  return {
    id: c.id,
    nombre: c.name,
    imagen: c.card_images?.[0]?.image_url_small || imagenPorId(c.id),
    sets: (c.card_sets || []).map((s) => ({
      codigo: s.set_code || '',
      setNombre: s.set_name || '',
      rareza: s.set_rarity || '',
      precioUsd: parseFloat(s.set_price) || 0,
    })),
  }
}

/** Busca cartas cuyo nombre contenga `texto` (para el autocompletado). */
export async function buscarPorNombre(texto, num = 12) {
  const q = String(texto || '').trim()
  if (q.length < 3) return []
  const data = await fetchJson(
    `${CARDINFO_API}?fname=${encodeURIComponent(q)}&num=${num}&offset=0`,
  )
  return (data?.data || []).map(mapearCarta)
}

/**
 * A partir del texto ruidoso del OCR, intenta identificar UNA carta.
 * Prueba la frase completa y, si no hay resultados, las palabras más
 * largas; elige el resultado más parecido al texto leído.
 * Devuelve `{ ...carta, score }` o `null`.
 */
export async function buscarPorTextoOcr(textoCrudo) {
  // Limpieza suave para consultar (conserva guiones y apóstrofes, que
  // forman parte de muchos nombres) y normalización dura para comparar.
  const qCruda = String(textoCrudo || '')
    .replace(/[^A-Za-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const q = normalizarNombre(qCruda)
  if (q.replace(/[^A-Z]/g, '').length < 6) return null

  // Consultas en orden: frase completa, palabras largas y, si ninguna
  // existe (letras mal leídas), los prefijos de 4 letras de las palabras
  // más largas (el arranque de una palabra suele leerse bien).
  const palabras = [...new Set(qCruda.split(' '))]
    .filter((p) => p.length >= 4)
    .sort((a, b) => b.length - a.length)
  const consultas = [
    qCruda,
    ...palabras.slice(0, 3),
    ...palabras.slice(0, 2).map((p) => p.slice(0, 4)),
  ].filter((c, i, arr) => c.length >= 4 && arr.indexOf(c) === i)

  let resultados = []
  for (const consulta of consultas) {
    resultados = await buscarPorNombre(consulta, 30)
    if (resultados.length) break
  }

  let mejor = null
  let mejorScore = 0
  for (const r of resultados) {
    const s = similitud(normalizarNombre(r.nombre), q)
    if (s > mejorScore) {
      mejorScore = s
      mejor = r
    }
  }
  return mejor && mejorScore >= 0.55 ? { ...mejor, score: mejorScore } : null
}
