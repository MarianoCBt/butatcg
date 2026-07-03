import { config } from '../config'

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-[var(--color-border)] bg-[var(--color-surface)]/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="text-lg font-extrabold italic uppercase tracking-tight">
            <span className="text-[var(--color-ink)]">Buta</span>
            <span className="text-[var(--color-brand)]"> TCG</span>
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {config.tagline}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1.5 text-sm sm:items-end">
          <a
            href={`https://wa.me/${config.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--color-brand)] transition hover:text-white"
          >
            Pedidos y consultas por WhatsApp
          </a>
          <a
            href={config.torneosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          >
            Torneos <span className="text-[var(--color-faint)]">↗</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
