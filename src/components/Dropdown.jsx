import { useEffect, useRef, useState } from 'react'

export default function Dropdown({ label, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          'flex items-center gap-1 px-3 py-2 text-sm font-medium transition ' +
          (open
            ? 'text-[var(--color-ink)]'
            : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]')
        }
      >
        {label}
        <span
          className={
            'text-[9px] transition-transform ' + (open ? 'rotate-180' : '')
          }
        >
          ▼
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 max-h-[70vh] min-w-[200px] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl shadow-blue-900/10"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ children, onClick, sub }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-4 py-2 text-left text-sm text-[var(--color-ink)] transition hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand)]"
    >
      {children}
      {sub && <span className="block text-xs text-[var(--color-faint)]">{sub}</span>}
    </button>
  )
}
