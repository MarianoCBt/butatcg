import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { config } from '../config'
import Dropdown, { DropdownItem } from './Dropdown'

export default function Header({ view, setView, applyFilter, onInicio }) {
  const { cartCount, expansiones, accesorioTipos, sets } = useStore()
  const [logoOk, setLogoOk] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  function goCatalog(filter) {
    applyFilter(filter)
    setView('catalogo')
    setMenuOpen(false)
  }

  function inicio() {
    onInicio()
    setMenuOpen(false)
  }

  function irCarrito() {
    setView('carrito')
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-5">
        {/* Logo */}
        <button onClick={inicio} className="group flex items-center gap-2.5">
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

        {/* Navegación escritorio */}
        <nav className="hidden items-center gap-0.5 md:flex">
          <button onClick={inicio} className={navCls(view === 'catalogo')}>
            Inicio
          </button>

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

          <a
            href={config.torneosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={navCls(false)}
          >
            Torneos <span className="text-[var(--color-faint)]">↗</span>
          </a>

          <button
            onClick={() => setView('carrito')}
            className={'flex items-center gap-2 ' + navCls(view === 'carrito')}
          >
            <CartBadge cartCount={cartCount} />
            Carrito
          </button>
        </nav>

        {/* Acciones móvil */}
        <div className="flex items-center gap-1 md:hidden">
          <button
            onClick={irCarrito}
            aria-label="Carrito"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-ink)] transition hover:bg-[var(--color-surface-2)]"
          >
            <CartBadge cartCount={cartCount} />
          </button>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-ink)] transition hover:bg-[var(--color-surface-2)]"
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {/* Menú móvil desplegable */}
      {menuOpen && (
        <nav className="max-h-[75vh] overflow-y-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 md:hidden">
          <button onClick={inicio} className={mobileTop}>
            Inicio
          </button>

          <p className={mobileLabel}>Preventa</p>
          {expansiones.length === 0 && (
            <span className={mobileEmpty}>Sin preventas activas</span>
          )}
          {expansiones.map((exp) => (
            <button
              key={exp}
              onClick={() =>
                goCatalog({ categoria: 'todos', expansion: exp, preventa: true })
              }
              className={mobileSub}
            >
              {exp}
            </button>
          ))}
          {expansiones.length > 0 && (
            <button
              onClick={() => goCatalog({ categoria: 'todos', preventa: true })}
              className={mobileSub}
            >
              Ver todas las preventas
            </button>
          )}

          <p className={mobileLabel}>Sets anteriores</p>
          {sets.length === 0 && (
            <span className={mobileEmpty}>Sin sets cargados</span>
          )}
          {sets.map((s) => (
            <button
              key={s}
              onClick={() => goCatalog({ categoria: 'todos', expansion: s })}
              className={mobileSub}
            >
              {s}
            </button>
          ))}

          <p className={mobileLabel}>Accesorios</p>
          <button
            onClick={() => goCatalog({ categoria: 'accesorio' })}
            className={mobileSub}
          >
            Todos los accesorios
          </button>
          {accesorioTipos.map((t) => (
            <button
              key={t}
              onClick={() => goCatalog({ categoria: 'accesorio', subtipo: t })}
              className={mobileSub}
            >
              {t}
            </button>
          ))}

          <div className="my-2 h-px bg-[var(--color-border)]" />
          <a
            href={config.torneosUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className={mobileTop}
          >
            Torneos ↗
          </a>
          <button onClick={irCarrito} className={mobileTop}>
            Carrito{cartCount > 0 ? ` (${cartCount})` : ''}
          </button>
        </nav>
      )}

      {/* Línea de acento */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--color-brand)]/40 to-transparent" />
    </header>
  )
}

const mobileTop =
  'block w-full rounded-lg px-3 py-2.5 text-left font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-2)]'
const mobileSub =
  'block w-full rounded-lg px-3 py-2 pl-5 text-left text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
const mobileLabel =
  'px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]'
const mobileEmpty = 'block px-3 py-2 pl-5 text-sm text-[var(--color-faint)]'

function navCls(active) {
  return (
    'px-3 py-2 text-sm font-medium transition ' +
    (active
      ? 'text-[var(--color-ink)] font-semibold'
      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]')
  )
}

function CartBadge({ cartCount }) {
  return (
    <span className="relative">
      <CartIcon className="h-5 w-5" />
      {cartCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
          {cartCount}
        </span>
      )}
    </span>
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

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
