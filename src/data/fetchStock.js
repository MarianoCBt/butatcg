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
function rowToProduct(row, index) {
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
      'sheet-' +
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

// Descarga y parsea la planilla publicada como CSV.
// Devuelve un array de productos. Lanza error si la descarga falla.
export async function fetchStock(csvUrl) {
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
    .map((row, i) => rowToProduct(row, i))
    .filter(Boolean)
}
