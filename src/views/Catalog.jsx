import { useMemo, useState } from 'react'
import { useStore } from '../store/StoreContext'
import { CATEGORIES } from '../config'
import ProductCard from '../components/ProductCard'
import Hero from '../components/Hero'
import ConsultaCarta from '../components/ConsultaCarta'

const BASE = { categoria: 'todos', expansion: null, subtipo: null, preventa: false }

export default function Catalog({ filter, setFilter }) {
  const { products, loading, error, hasSheet, refresh } = useStore()
  const [query, setQuery] = useState('')
  const [soloStock, setSoloStock] = useState(false)
  const [orden, setOrden] = useState('precio-desc')

  function setCat(categoria) {
    setFilter({ ...BASE, categoria })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const lista = products.filter((p) => {
      if (filter.preventa && !p.preventa) return false
      if (filter.expansion && p.expansion !== filter.expansion) return false
      if (filter.subtipo && p.subtipo !== filter.subtipo) return false
      if (filter.categoria !== 'todos' && p.categoria !== filter.categoria)
        return false
      if (soloStock && p.stock <= 0) return false
      if (!q) return true
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.set || '').toLowerCase().includes(q) ||
        (p.rareza || '').toLowerCase().includes(q)
      )
    })

    // Comparador de precio que manda los productos sin precio ($0) al final.
    const porPrecio = (dir) => (a, b) => {
      const a0 = a.precio <= 0
      const b0 = b.precio <= 0
      if (a0 && b0) return 0
      if (a0) return 1
      if (b0) return -1
      return dir === 'asc' ? a.precio - b.precio : b.precio - a.precio
    }
    const porNombre = (dir) => (a, b) => {
      const cmp = a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
      return dir === 'asc' ? cmp : -cmp
    }

    if (orden === 'az') lista.sort(porNombre('asc'))
    else if (orden === 'za') lista.sort(porNombre('desc'))
    else if (orden === 'precio-asc') lista.sort(porPrecio('asc'))
    else if (orden === 'precio-desc') lista.sort(porPrecio('desc'))

    return lista
  }, [products, query, filter, soloStock, orden])

  const activeLabel = describeFilter(filter)
  const showEmpty = !loading && filtered.length === 0

  return (
    <div className="space-y-5">
      <Hero />

      {/* Consulta por cartas a pedido */}
      <ConsultaCarta />

      {/* Aviso si la planilla no está configurada */}
      {!hasSheet && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          Mostrando <b>datos de ejemplo</b>. Configurá el link de la planilla en{' '}
          <code className="rounded bg-amber-500/20 px-1">src/config.js</code> para
          cargar tu stock real.
        </div>
      )}

      {/* Error de descarga */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <span>No se pudo actualizar el stock: {error}</span>
          <button
            onClick={refresh}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar carta, set o rareza…"
          className="w-full flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <CatButton active={isAll(filter)} onClick={() => setCat('todos')}>
            Todos
          </CatButton>
          {CATEGORIES.map((c) => (
            <CatButton
              key={c.id}
              active={filter.categoria === c.id && !filter.preventa}
              onClick={() => setCat(c.id)}
            >
              {c.label}
            </CatButton>
          ))}
          <label className="ml-1 flex cursor-pointer select-none items-center gap-1.5 text-sm text-[var(--color-muted)]">
            <input
              type="checkbox"
              checked={soloStock}
              onChange={(e) => setSoloStock(e.target.checked)}
              className="accent-[var(--color-brand)]"
            />
            Con stock
          </label>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            aria-label="Ordenar"
            className="ml-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)]"
          >
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="az">Nombre: A → Z</option>
            <option value="za">Nombre: Z → A</option>
          </select>
        </div>
      </div>

      {/* Chip de filtro activo + contador de resultados */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <div>
          {activeLabel && (
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-light)] px-3 py-1 font-medium text-[var(--color-brand)]">
              {activeLabel}
              <button
                onClick={() => setFilter(BASE)}
                className="text-[var(--color-brand)]/70 hover:text-[var(--color-brand)]"
                title="Quitar filtro"
              >
                ✕
              </button>
            </span>
          )}
        </div>
        {!loading && filtered.length > 0 && (
          <span className="shrink-0 text-xs text-[var(--color-faint)]">
            {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}
          </span>
        )}
      </div>

      {/* Grilla / estados */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : showEmpty ? (
        <p className="py-16 text-center text-[var(--color-faint)]">
          No se encontraron productos.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function isAll(f) {
  return f.categoria === 'todos' && !f.preventa && !f.expansion && !f.subtipo
}

function describeFilter(f) {
  if (f.expansion) return `${f.preventa ? 'Preventa' : 'Set'} · ${f.expansion}`
  if (f.preventa) return 'Preventa'
  if (f.subtipo) return `Accesorios · ${f.subtipo}`
  return null
}

// Tarjeta "fantasma" mientras carga el stock (animación solo de opacidad)
function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-b-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="aspect-[3/4] animate-pulse bg-[var(--color-surface-2)]" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="flex items-end justify-between pt-1">
          <div className="h-5 w-16 animate-pulse rounded bg-[var(--color-surface-2)]" />
          <div className="h-7 w-20 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
        </div>
      </div>
    </div>
  )
}

function CatButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-lg px-3 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-[var(--color-brand)] text-white'
          : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand)]')
      }
    >
      {children}
    </button>
  )
}
