import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { formatMoney } from '../utils/format'
import { rarezaColor, etiquetaDe } from '../utils/producto'
import ProductModal from './ProductModal'

export default function ProductCard({ product }) {
  const { addToCart, setCartQty, cart } = useStore()
  const [verDetalle, setVerDetalle] = useState(false)
  const inCart = cart[product.id] || 0
  const agotado = product.stock <= 0
  const sinMas = inCart >= product.stock
  const etiqueta = etiquetaDe(product)
  const rarColor = rarezaColor(product.rareza)

  return (
    <div className="flex flex-col overflow-hidden rounded-b-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:shadow-md">
      {/* Imagen (abre la vista ampliada) */}
      <button
        onClick={() => setVerDetalle(true)}
        aria-label={`Ver ${product.nombre} en grande`}
        className="relative flex aspect-[3/4] w-full cursor-zoom-in items-center justify-center bg-[var(--color-surface-2)]"
      >
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
          <span className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]/55 backdrop-blur-[1px]">
            <span className="-rotate-6 rounded-md bg-red-600 px-4 py-1.5 text-sm font-extrabold uppercase tracking-[0.18em] text-white shadow-lg ring-1 ring-white/20">
              Sin stock
            </span>
          </span>
        )}
      </button>

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

      {verDetalle && (
        <ProductModal product={product} onClose={() => setVerDetalle(false)} />
      )}
    </div>
  )
}
