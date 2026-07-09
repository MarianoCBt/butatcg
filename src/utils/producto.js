// Helpers de presentación de productos (compartidos por card y modal).

// Color de la rareza según el tipo (tokens definidos en index.css)
export function rarezaColor(rareza) {
  const r = (rareza || '').toLowerCase()
  if (r.includes('starlight')) return 'var(--rar-starlight)'
  if (r.includes('secret')) return 'var(--rar-secret)'
  if (r.includes('ultra')) return 'var(--rar-ultra)'
  if (r.includes('super')) return 'var(--rar-super)'
  if (r.includes('common')) return 'var(--rar-common)'
  return null
}

// Etiqueta del producto: preventa tiene prioridad sobre pedido; si no, nada.
export function etiquetaDe(product) {
  if (product.preventa)
    return { texto: 'Preventa', color: 'var(--color-brand)' }
  if (product.pedido) return { texto: 'Pedido', color: 'var(--color-pedido)' }
  return null
}

// Versión grande de la imagen (YGOPRODeck sirve /cards_small/ y /cards/).
export function imagenGrande(url) {
  return url ? url.replace('/cards_small/', '/cards/') : url
}
