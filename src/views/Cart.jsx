import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { config } from '../config'
import { formatMoney } from '../utils/format'
import ConsultaCarta from '../components/ConsultaCarta'

export default function Cart({ onSeguirComprando }) {
  const {
    cartItems,
    cartTotal,
    cartCount,
    setCartQty,
    removeFromCart,
    clearCart,
  } = useStore()

  const [cliente, setCliente] = useState({
    nombre: '',
    entrega: 'retiro',
    notas: '',
  })

  function buildMessage() {
    const lineas = []
    lineas.push(`*Nuevo pedido — ${config.storeName}*`)
    if (cliente.nombre) lineas.push(`Cliente: ${cliente.nombre}`)
    lineas.push(`Entrega: ${cliente.entrega === 'envio' ? 'Envío' : 'Retiro'}`)
    lineas.push('')
    lineas.push('')
    lineas.push('*Pedido:*')
    lineas.push('')
    cartItems.forEach((it, i) => {
      const set = it.set ? ` (${it.set})` : ''
      lineas.push(`• ${it.nombre} x${it.qty}${set}  ${formatMoney(it.subtotal)}`)
      if (i < cartItems.length - 1) lineas.push('') // línea en blanco entre cartas
    })
    lineas.push('')
    lineas.push('')
    lineas.push(`*Total: ${formatMoney(cartTotal)}*`)
    if (cliente.notas) {
      lineas.push('')
      lineas.push(`Notas: ${cliente.notas}`)
    }
    return lineas.join('\n')
  }

  function enviarWhatsApp() {
    const texto = encodeURIComponent(buildMessage())
    const url = `https://wa.me/${config.whatsappNumber}?text=${texto}`
    window.open(url, '_blank')
  }

  if (cartItems.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="py-16 text-center">
          <p className="text-5xl">🛒</p>
          <p className="mt-4 text-lg text-[var(--color-muted)]">
            Tu carrito está vacío
          </p>
          <button
            onClick={onSeguirComprando}
            className="mt-6 rounded-lg bg-[var(--color-brand)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--color-brand-dark)]"
          >
            Ver catálogo
          </button>
        </div>
        <ConsultaCarta />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Lista de items */}
      <div className="space-y-3 lg:col-span-2">
        {cartItems.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--color-surface-2)]">
              {it.imagen ? (
                <img
                  src={it.imagen}
                  alt={it.nombre}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xl opacity-30">🃏</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.nombre}</p>
              <p className="text-xs text-[var(--color-faint)]">
                {formatMoney(it.precio)} c/u
                {it.set ? ` · ${it.set}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)]">
              <button
                onClick={() => setCartQty(it.id, it.qty - 1)}
                className="px-2.5 py-1 text-lg leading-none text-[var(--color-muted)] hover:text-[var(--color-brand)]"
              >
                −
              </button>
              <span className="w-6 text-center text-sm">{it.qty}</span>
              <button
                onClick={() => setCartQty(it.id, it.qty + 1)}
                disabled={it.qty >= it.stock}
                className="px-2.5 py-1 text-lg leading-none text-[var(--color-muted)] hover:text-[var(--color-brand)] disabled:opacity-30"
              >
                +
              </button>
            </div>
            <div className="w-28 shrink-0 text-right">
              <p className="text-sm font-semibold">{formatMoney(it.subtotal)}</p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {it.qty} × {formatMoney(it.precio)}
              </p>
            </div>
            <button
              onClick={() => removeFromCart(it.id)}
              className="shrink-0 rounded-md px-1.5 py-1 text-[var(--color-faint)] transition hover:bg-red-500/10 hover:text-red-400"
              title="Quitar"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={() => {
            if (confirm('¿Vaciar todo el carrito?')) clearCart()
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-400"
        >
          🗑 Vaciar carrito
        </button>

        <ConsultaCarta />
      </div>

      {/* Resumen + datos */}
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="font-semibold">Tus datos</h2>
          <input
            type="text"
            value={cliente.nombre}
            onChange={(e) =>
              setCliente((c) => ({ ...c, nombre: e.target.value }))
            }
            placeholder="Nombre"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
          />
          <div className="flex gap-2">
            <EntregaBtn
              active={cliente.entrega === 'retiro'}
              onClick={() => setCliente((c) => ({ ...c, entrega: 'retiro' }))}
            >
              Retiro
            </EntregaBtn>
            <EntregaBtn
              active={cliente.entrega === 'envio'}
              onClick={() => setCliente((c) => ({ ...c, entrega: 'envio' }))}
            >
              Envío
            </EntregaBtn>
          </div>
          <textarea
            value={cliente.notas}
            onChange={(e) =>
              setCliente((c) => ({ ...c, notas: e.target.value }))
            }
            placeholder="Notas (opcional)"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex justify-between text-sm text-[var(--color-muted)]">
            <span>{cartCount} artículos</span>
            <span>{formatMoney(cartTotal)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-3 text-lg font-bold">
            <span>Total</span>
            <span className="text-[var(--color-brand)]">
              {formatMoney(cartTotal)}
            </span>
          </div>

          {/* Aviso de entrega */}
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-600">
            <span className="text-sm">⏳</span>
            <p>
              <b>La entrega no es inmediata.</b> Las cartas no tienen stock para
              entrega al momento: algunas son <b>preventa</b> y otras{' '}
              <b>a pedido</b>. El tiempo de llegada depende del set; te
              confirmamos los plazos por WhatsApp.
            </p>
          </div>

          <button
            onClick={enviarWhatsApp}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#1faf54] px-4 py-3 font-semibold text-white shadow-md shadow-green-950/20 transition hover:bg-[#1b9a4a] active:scale-[0.99]"
          >
            <WhatsAppIcon className="h-5 w-5 transition group-hover:scale-110" />
            Enviar pedido por WhatsApp
          </button>
          <p className="text-center text-xs text-[var(--color-faint)]">
            Sin pago online. Coordinás el pago por transferencia al
            confirmar.
          </p>
        </div>

        {/* Datos de pago para transferencia */}
        <div className="space-y-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <h2 className="mb-2 font-semibold">Datos para transferir</h2>
          <Row label="Alias" value={config.payment.alias} />
          <Row label="Titular" value={config.payment.titular} />
          <Row label="Banco" value={config.payment.banco} />
        </div>
      </div>
    </div>
  )
}

function EntregaBtn({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ' +
        (active
          ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]')
      }
    >
      {children}
    </button>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-faint)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.18 8.18 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.98-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
    </svg>
  )
}
