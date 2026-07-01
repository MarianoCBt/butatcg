import { useState } from 'react'
import { config } from '../config'

// Caja desplegable para consultar por cartas que no están publicadas.
// Cerrada ocupa una sola línea; se expande al tocarla.
export default function ConsultaCarta() {
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const vacio = !texto.trim()

  function consultar() {
    if (vacio) return
    const msg = [
      `*Consulta — ${config.storeName}*`,
      '',
      'Hola! Estoy buscando esta carta que no vi publicada:',
      texto.trim(),
      '',
      '¿La pueden conseguir a pedido?',
    ].join('\n')
    const url = `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-surface)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-[var(--color-brand-light)]/40"
      >
        <span className="text-base">🔎</span>
        <span className="flex-1 text-sm text-[var(--color-ink)]">
          <span className="font-semibold">¿Buscás otra carta?</span>{' '}
          <span className="text-[var(--color-muted)]">
            Consultanos si la conseguimos a pedido.
          </span>
        </span>
        <span
          className={
            'text-xs text-[var(--color-muted)] transition-transform ' +
            (open ? 'rotate-180' : '')
          }
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && consultar()}
            placeholder="Ej: Dark Magician (Ultra Rare) — LOB-EN005"
            autoFocus
            className="w-full flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
          />
          <button
            onClick={consultar}
            disabled={vacio}
            className="shrink-0 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Consultar
          </button>
        </div>
      )}
    </div>
  )
}
