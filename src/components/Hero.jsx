import { useState } from 'react'
import { config } from '../config'

export default function Hero() {
  const [yugiOk, setYugiOk] = useState(true)
  const [logoOk, setLogoOk] = useState(true)

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] px-6 py-7 text-white shadow-lg shadow-blue-900/30">
      {/* Logo Yu-Gi-Oh! de fondo, tenue */}
      {logoOk && (
        <img
          src={import.meta.env.BASE_URL + 'yugioh-logo.png'}
          alt=""
          aria-hidden="true"
          onError={() => setLogoOk(false)}
          className="pointer-events-none absolute -right-6 top-2 w-64 opacity-10 mix-blend-luminosity"
        />
      )}

      <div className="relative z-10 max-w-lg">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Bienvenido a {config.storeName}
        </h1>
        <p className="mt-2 text-sm text-blue-100">
          Singles, productos sellados, accesorios y preventas. Armá tu pedido
          y lo coordinamos por WhatsApp.
        </p>
      </div>

      {/* Personaje decorativo */}
      {yugiOk && (
        <img
          src={import.meta.env.BASE_URL + 'yugi.png'}
          alt=""
          aria-hidden="true"
          onError={() => setYugiOk(false)}
          className="pointer-events-none absolute -bottom-4 right-4 hidden h-48 drop-shadow-2xl sm:block"
        />
      )}
    </section>
  )
}
