import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/StoreContext'
import { formatMoney } from '../utils/format'
import { rarezaColor, etiquetaDe, imagenGrande } from '../utils/producto'

// Vista ampliada de un producto: imagen grande + detalles + agregar al carrito.
export default function ProductModal({ product, onClose }) {
  const { addToCart, setCartQty, cart } = useStore()
  const inCart = cart[product.id] || 0
  const agotado = product.stock <= 0
  const sinMas = inCart >= product.stock
  const etiqueta = etiquetaDe(product)
  const rarColor = rarezaColor(product.rareza)

  // Cerrar con Escape y bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Portal al <body>: si quedara dentro de la card, su transform/translate
  // convertiría a la card en containing block y el modal no cubriría la pantalla.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={product.nombre}
    >
      {/* Fondo */}
      <button
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl [animation:modal-in_.18s_ease-out] sm:flex-row">
        {/* Imagen */}
        <div className="flex shrink-0 items-center justify-center bg-[var(--color-surface-2)] p-4 sm:w-1/2 sm:p-6">
          {product.imagen ? (
            <img
              src={imagenGrande(product.imagen)}
              alt={product.nombre}
              onError={(e) => {
                // Si no existe la versión grande, caemos a la chica.
                if (e.currentTarget.src !== product.imagen)
                  e.currentTarget.src = product.imagen
              }}
              className={
                'max-h-[38vh] w-auto rounded object-contain drop-shadow-xl sm:max-h-[74vh] ' +
                (agotado ? 'grayscale' : '')
              }
            />
          ) : (
            <span className="py-16 text-6xl opacity-20">🃏</span>
          )}
        </div>

        {/* Detalles */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold leading-snug text-[var(--color-ink)]">
              {product.nombre}
            </h2>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[var(--color-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {etiqueta && (
              <span
                className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: etiqueta.color }}
              >
                {etiqueta.texto}
              </span>
            )}
            {agotado && (
              <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Sin stock
              </span>
            )}
          </div>

          {/* Ficha */}
          <dl className="space-y-1.5 text-sm">
            {product.set && <Fila label="Set">{product.set}</Fila>}
            {product.expansion && (
              <Fila label="Expansión">{product.expansion}</Fila>
            )}
            {product.rareza && (
              <Fila label="Rareza">
                <span
                  className="font-semibold"
                  style={rarColor ? { color: rarColor } : undefined}
                >
                  {product.rareza}
                </span>
              </Fila>
            )}
            {!product.preventa && product.condicion && (
              <Fila label="Condición">{product.condicion}</Fila>
            )}
            {product.subtipo && <Fila label="Tipo">{product.subtipo}</Fila>}
          </dl>

          {product.descripcion && (
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">
              {product.descripcion}
            </p>
          )}

          {/* Precio + acción */}
          <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <div>
              <p className="text-2xl font-bold text-[var(--color-brand)]">
                {formatMoney(product.precio)}
              </p>
              <p className="text-xs text-[var(--color-faint)]">
                {product.stock} en stock
              </p>
            </div>
            {inCart > 0 ? (
              <div className="flex items-center overflow-hidden rounded-lg bg-[var(--color-brand)] text-white shadow-sm">
                <button
                  onClick={() => setCartQty(product.id, inCart - 1)}
                  aria-label="Quitar uno"
                  className="px-3 py-2 text-lg leading-none transition hover:bg-[var(--color-brand-dark)]"
                >
                  −
                </button>
                <span className="min-w-7 text-center text-sm font-bold tabular-nums">
                  {inCart}
                </span>
                <button
                  onClick={() => addToCart(product.id)}
                  disabled={sinMas}
                  aria-label="Agregar uno"
                  className="px-3 py-2 text-lg leading-none transition hover:bg-[var(--color-brand-dark)] disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                onClick={() => addToCart(product.id)}
                disabled={agotado}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Agregar al carrito
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Fila({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-[var(--color-faint)]">{label}</dt>
      <dd className="min-w-0 text-[var(--color-ink)]">{children}</dd>
    </div>
  )
}
