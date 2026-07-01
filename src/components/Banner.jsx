import { useState } from 'react'
import { config } from '../config'

// Banner decorativo (imagen) arriba de todo. Se controla desde config.banner.
export default function Banner() {
  const [error, setError] = useState(false)
  const b = config.banner

  if (!b || !b.activo || !b.imagen || error) return null

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-5">
      <img
        src={b.imagen}
        alt={b.alt || ''}
        onError={() => setError(true)}
        className="h-24 w-full rounded-xl border border-[var(--color-border)] object-cover object-center shadow-sm sm:h-32 md:h-40"
      />
    </div>
  )
}
