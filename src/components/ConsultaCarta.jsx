import { useState } from 'react'
import { config } from '../config'

// Caja para consultar por cartas que no están publicadas (se manda por WhatsApp).
export default function ConsultaCarta() {
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
    <div className="rounded-2xl border border-[var(--color-brand)]/40 bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-brand-light)]/40 p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔎</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[var(--color-ink)]">
            ¿Buscás otra carta que no está publicada?
          </h3>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            Decinos el nombre y te confirmamos si la podemos conseguir a pedido.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && consultar()}
              placeholder="Ej: Dark Magician (Ultra Rare) — LOB-EN005"
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
        </div>
      </div>
    </div>
  )
}
