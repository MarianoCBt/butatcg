import { useState } from 'react'
import { config } from '../config'

// Banner de imagen arriba de todo. Se controla desde config.banner.
// Al tocarlo, va a la última preventa (sin efecto de hover).
export default function Banner({ onClick }) {
  const [error, setError] = useState(false)
  const b = config.banner

  if (!b || !b.activo || !b.imagen || error) return null

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-5">
      <button
        onClick={onClick}
        aria-label={b.alt || 'Ver preventa'}
        className="block w-full overflow-hidden rounded-xl border border-[var(--color-border)] shadow-sm"
      >
        <img
          src={b.imagen}
          alt={b.alt || ''}
          onError={() => setError(true)}
          className="h-36 w-full object-cover object-center sm:h-52 md:h-64"
        />
      </button>
    </div>
  )
}
