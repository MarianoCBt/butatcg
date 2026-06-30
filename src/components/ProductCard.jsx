import { useStore } from '../store/StoreContext'
import { formatMoney } from '../utils/format'

// Color de la rareza según el tipo (usa tokens definidos en index.css)
function rarezaColor(rareza) {
  const r = (rareza || '').toLowerCase()
  if (r.includes('starlight')) return 'var(--rar-starlight)'
  if (r.includes('secret')) return 'var(--rar-secret)'
  if (r.includes('ultra')) return 'var(--rar-ultra)'
  if (r.includes('super')) return 'var(--rar-super)'
  if (r.includes('common')) return 'var(--rar-common)'
  return null
}

export default function ProductCard({ product }) {
  const { addToCart, setCartQty, cart } = useStore()
  const inCart = cart[product.id] || 0
  const agotado = product.stock <= 0
  const sinMas = inCart >= product.stock

  // Etiqueta: preventa tiene prioridad sobre pedido; si no, nada.
  const etiqueta = product.preventa
    ? { texto: 'Preventa', color: 'var(--color-brand)' }
    : product.pedido
      ? { texto: 'Pedido', color: 'var(--color-pedido)' }
      : null

  const rarColor = rarezaColor(product.rareza)

  return (
    <div className="flex flex-col overflow-hidden rounded-b-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:shadow-md">
      <div className="relative flex aspect-[3/4] items-center justify-center bg-[var(--color-surface-2)]">
        {product.imagen ? (
          <img
            src={product.imagen}
            alt={product.nombre}
            loading="lazy"
            className={
              'h-full w-full object-contain transition ' +
              (agotado ? 'grayscale ' : '')
            }
          />
        ) : (
          <span className="px-2 text-center text-4xl opacity-20">🃏</span>
        )}
        {etiqueta && !agotado && (
          <span
            className="absolute bottom-2 left-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow"
            style={{ backgroundColor: etiqueta.color }}
          >
            {etiqueta.texto}
          </span>
        )}
        {agotado && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]/55 backdrop-blur-[1px]">
            <span className="-rotate-6 rounded-md bg-red-600 px-4 py-1.5 text-sm font-extrabold uppercase tracking-[0.18em] text-white shadow-lg ring-1 ring-white/20">
              Sin stock
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--color-ink)]">
          {product.nombre}
        </h3>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--color-muted)]">
          {product.set && <span>{product.set}</span>}
          {product.rareza && (
            <>
              {product.set && <span aria-hidden="true">·</span>}
              <span
                className="font-semibold"
                style={rarColor ? { color: rarColor } : undefined}
              >
                {product.rareza}
              </span>
            </>
          )}
          {!product.preventa && product.condicion && (
            <>
              <span aria-hidden="true">·</span>
              <span>{product.condicion}</span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="text-lg font-bold text-[var(--color-brand)]">
              {formatMoney(product.precio)}
            </p>
            <p className="text-[11px] text-[var(--color-faint)]">
              {product.stock} en stock
            </p>
          </div>
          {inCart > 0 ? (
            <div className="flex items-center overflow-hidden rounded-lg bg-[var(--color-brand)] text-white shadow-sm">
              <button
                onClick={() => setCartQty(product.id, inCart - 1)}
                aria-label="Quitar uno"
                className="px-2.5 py-1.5 text-lg leading-none transition hover:bg-[var(--color-brand-dark)]"
              >
                −
              </button>
              <span className="min-w-6 text-center text-sm font-bold tabular-nums">
                {inCart}
              </span>
              <button
                onClick={() => addToCart(product.id)}
                disabled={sinMas}
                aria-label="Agregar uno"
                className="px-2.5 py-1.5 text-lg leading-none transition hover:bg-[var(--color-brand-dark)] disabled:opacity-40 disabled:hover:bg-transparent"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => addToCart(product.id)}
              disabled={agotado}
              className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Agregar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
