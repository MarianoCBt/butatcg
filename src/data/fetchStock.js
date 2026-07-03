import Papa from 'papaparse'

// Normaliza un encabezado: minúsculas, sin acentos, sin espacios.
function normKey(k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
}

// Acepta TRUE / true / 1 / sí / si / x  como verdadero.
function parseBool(v) {
  const s = String(v || '').trim().toLowerCase()
  return ['true', 'verdadero', 'si', 'sí', 'x', '1'].includes(s)
}

// "$ 1.500" -> 1500 ; "1500" -> 1500
function parseNumber(v) {
  const digits = String(v ?? '').replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

// Normaliza la categoría a uno de los ids conocidos.
function parseCategoria(v) {
  const s = normKey(v)
  if (s.startsWith('sell') || s.includes('booster') || s.includes('box'))
    return 'sellado'
  if (s.startsWith('acces')) return 'accesorio'
  return 'carta'
}

// Convierte una fila (objeto con claves normalizadas) en un producto.
function rowToProduct(row, index, prefix) {
  const get = (...names) => {
    for (const n of names) {
      if (row[n] != null && row[n] !== '') return row[n]
    }
    return ''
  }

  const nombre = String(get('nombre', 'producto', 'name')).trim()
  if (!nombre) return null

  return {
    id:
      String(get('id')).trim() ||
      prefix +
        '-' +
        index +
        '-' +
        nombre.toLowerCase().replace(/\s+/g, '-').slice(0, 24),
    nombre,
    categoria: parseCategoria(get('categoria', 'category', 'tipo')),
    set: String(get('set', 'codigo')).trim(),
    rareza: String(get('rareza', 'rarity')).trim(),
    condicion: String(get('condicion', 'estado')).trim(),
    precio: parseNumber(get('precio', 'price')),
    stock: parseNumber(get('stock', 'cantidad', 'qty')),
    preventa: parseBool(get('preventa', 'preorder')),
    pedido: parseBool(get('pedido', 'apedido')),
    expansion: String(get('expansion')).trim(),
    subtipo: String(get('subtipo', 'tipoaccesorio')).trim(),
    imagen: String(get('imagen', 'image', 'foto', 'url')).trim(),
    descripcion: String(get('descripcion', 'desc')).trim(),
  }
}

// Descarga y parsea UNA hoja publicada como CSV.
// `prefix` diferencia los ids cuando hay varias hojas.
async function fetchSheet(csvUrl, prefix) {
  const sep = csvUrl.includes('?') ? '&' : '?'
  const res = await fetch(csvUrl + sep + 't=' + Date.now()) // evita caché
  if (!res.ok)
    throw new Error('No se pudo leer la planilla (HTTP ' + res.status + ')')
  const text = await res.text()

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normKey,
  })

  return parsed.data
    .map((row, i) => rowToProduct(row, i, prefix))
    .filter(Boolean)
}

// Descarga una o varias hojas y devuelve todos los productos juntos.
// Si UNA hoja falla, seguimos con las demás (solo falla todo si fallan todas).
export async function fetchStock(csvUrls) {
  const urls = (Array.isArray(csvUrls) ? csvUrls : [csvUrls]).filter(Boolean)
  const resultados = await Promise.allSettled(
    urls.map((url, i) => fetchSheet(url, 'h' + i)),
  )
  const ok = resultados.filter((r) => r.status === 'fulfilled')
  if (ok.length === 0 && resultados.length > 0) throw resultados[0].reason
  resultados
    .filter((r) => r.status === 'rejected')
    .forEach((r) =>
      console.warn('Hoja de stock no disponible:', r.reason?.message),
    )
  return ok.flatMap((r) => r.value)
}
