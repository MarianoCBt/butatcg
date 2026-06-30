import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { config } from '../config'
import Dropdown, { DropdownItem } from './Dropdown'

export default function Header({ view, setView, applyFilter, onInicio }) {
  const { cartCount, expansiones, accesorioTipos, sets } = useStore()
  const [logoOk, setLogoOk] = useState(true)

  function goCatalog(filter) {
    applyFilter(filter)
    setView('catalogo')
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        {/* Logo */}
        <button onClick={onInicio} className="group flex items-center gap-2.5">
          {logoOk ? (
            <img
              src={config.logo}
              alt={config.storeName}
              onError={() => setLogoOk(false)}
              className="h-10 w-10 object-contain transition group-hover:scale-105"
            />
          ) : (
            <span className="text-2xl">🐗</span>
          )}
          <span className="text-xl font-extrabold italic uppercase tracking-tight">
            <span className="text-[var(--color-ink)]">Buta</span>
            <span className="text-[var(--color-brand)]"> TCG</span>
          </span>
        </button>

        {/* Navegación */}
        <nav className="ml-auto flex items-center gap-0.5">
          <button onClick={onInicio} className={navCls(view === 'catalogo')}>
            Inicio
          </button>

          {/* Preventa */}
          <Dropdown label="Preventa">
            {expansiones.length === 0 && (
              <span className="block px-4 py-2 text-sm text-[var(--color-faint)]">
                Sin preventas activas
              </span>
            )}
            {expansiones.map((exp) => (
              <DropdownItem
                key={exp}
                onClick={() =>
                  goCatalog({ categoria: 'todos', expansion: exp, preventa: true })
                }
              >
                {exp}
              </DropdownItem>
            ))}
            {expansiones.length > 0 && (
              <DropdownItem
                onClick={() => goCatalog({ categoria: 'todos', preventa: true })}
              >
                Ver todas las preventas
              </DropdownItem>
            )}
          </Dropdown>

          {/* Sets */}
          <Dropdown label="Sets anteriores">
            {sets.length === 0 && (
              <span className="block px-4 py-2 text-sm text-[var(--color-faint)]">
                Sin sets cargados
              </span>
            )}
            {sets.map((s) => (
              <DropdownItem
                key={s}
                onClick={() => goCatalog({ categoria: 'todos', expansion: s })}
              >
                {s}
              </DropdownItem>
            ))}
          </Dropdown>

          {/* Accesorios */}
          <Dropdown label="Accesorios">
            <DropdownItem onClick={() => goCatalog({ categoria: 'accesorio' })}>
              Todos los accesorios
            </DropdownItem>
            {accesorioTipos.map((t) => (
              <DropdownItem
                key={t}
                onClick={() => goCatalog({ categoria: 'accesorio', subtipo: t })}
              >
                {t}
              </DropdownItem>
            ))}
          </Dropdown>

          {/* Torneos (link externo) */}
          <a
            href={config.torneosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={navCls(false)}
          >
            Torneos <span className="text-[var(--color-faint)]">↗</span>
          </a>

          {/* Carrito */}
          <button
            onClick={() => setView('carrito')}
            className={'flex items-center gap-2 ' + navCls(view === 'carrito')}
          >
            <span className="relative">
              <CartIcon className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </span>
            Carrito
          </button>
        </nav>
      </div>

      {/* Línea de acento */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--color-brand)]/40 to-transparent" />
    </header>
  )
}

function navCls(active) {
  return (
    'px-3 py-2 text-sm font-medium transition ' +
    (active
      ? 'text-[var(--color-ink)] font-semibold'
      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]')
  )
}

function CartIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.1 11a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2L21 7H5.2" />
    </svg>
  )
}
