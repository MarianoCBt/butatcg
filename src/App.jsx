import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { StoreProvider, useStore } from './store/StoreContext'
import Header from './components/Header'
import Banner from './components/Banner'
import Footer from './components/Footer'
import Catalog from './views/Catalog'
import Cart from './views/Cart'

const EMPTY_FILTER = {
  categoria: 'todos',
  expansion: null,
  subtipo: null,
  preventa: false,
}

// ---------------------------------------------------------------------
//  Deep links: el filtro activo vive en el hash de la URL, así se pueden
//  compartir links que abren el catálogo ya filtrado. Rutas:
//    #inicio (o vacío)     -> última preventa (portada)
//    #todos                -> todo el catálogo
//    #cartas / #sellados   -> por categoría
//    #accesorios[/Tipo]    -> accesorios (opcionalmente un subtipo)
//    #preventa[/Expansión] -> preventas (opcionalmente una expansión)
//    #set/Expansión        -> un set puntual
//    #carrito              -> el carrito
// ---------------------------------------------------------------------
function parseHash(hash, ultimaPreventa) {
  const inicio = {
    view: 'catalogo',
    filter: ultimaPreventa
      ? { ...EMPTY_FILTER, preventa: true, expansion: ultimaPreventa }
      : EMPTY_FILTER,
  }
  if (!hash || hash === '#' || hash === '#inicio') return inicio
  if (hash === '#carrito') return { view: 'carrito', filter: EMPTY_FILTER }

  const [ruta, arg] = hash.slice(1).split('/')
  const valor = arg ? decodeURIComponent(arg) : null
  switch (ruta) {
    case 'todos':
      return { view: 'catalogo', filter: { ...EMPTY_FILTER } }
    case 'cartas':
      return { view: 'catalogo', filter: { ...EMPTY_FILTER, categoria: 'carta' } }
    case 'sellados':
      return { view: 'catalogo', filter: { ...EMPTY_FILTER, categoria: 'sellado' } }
    case 'accesorios':
      return {
        view: 'catalogo',
        filter: { ...EMPTY_FILTER, categoria: 'accesorio', subtipo: valor },
      }
    case 'preventa':
      return {
        view: 'catalogo',
        filter: { ...EMPTY_FILTER, preventa: true, expansion: valor },
      }
    case 'set':
      return valor
        ? { view: 'catalogo', filter: { ...EMPTY_FILTER, expansion: valor } }
        : inicio
    default:
      return inicio
  }
}

function filterToHash(f) {
  if (f.preventa)
    return f.expansion
      ? `#preventa/${encodeURIComponent(f.expansion)}`
      : '#preventa'
  if (f.expansion) return `#set/${encodeURIComponent(f.expansion)}`
  if (f.subtipo) return `#accesorios/${encodeURIComponent(f.subtipo)}`
  if (f.categoria === 'accesorio') return '#accesorios'
  if (f.categoria === 'carta') return '#cartas'
  if (f.categoria === 'sellado') return '#sellados'
  return '#todos'
}

function Shell({ hash }) {
  const { expansiones } = useStore()

  // La última preventa agregada = la última expansión en preventa de la lista.
  const ultimaPreventa = expansiones[expansiones.length - 1] || null

  // El hash es la única fuente de verdad de vista + filtro.
  const { view, filter } = useMemo(
    () => parseHash(hash, ultimaPreventa),
    [hash, ultimaPreventa],
  )

  // Al cambiar de vista, volver arriba (si no, el carrito abre "scrolleado").
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  const navegar = (h) => {
    window.location.hash = h
  }
  const irAInicio = () => navegar('#inicio')
  const applyFilter = (partial) =>
    navegar(filterToHash({ ...EMPTY_FILTER, ...partial }))
  const setFilter = (f) => navegar(filterToHash(f))
  const setView = (v) => {
    if (v === 'carrito') navegar('#carrito')
    // 'catalogo' no hace nada: applyFilter/irAInicio ya fijan el hash.
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header
        view={view}
        setView={setView}
        applyFilter={applyFilter}
        onInicio={irAInicio}
      />
      {view === 'catalogo' && <Banner onClick={irAInicio} />}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-6 pt-3">
        {view === 'catalogo' && <Catalog filter={filter} setFilter={setFilter} />}
        {view === 'carrito' && <Cart onSeguirComprando={irAInicio} />}
      </main>
      <Footer />
    </div>
  )
}

// Herramientas privadas del dueño (no aparecen en el menú): se abren con
// #escaner y #poster. Van con lazy() para que el visitante común no las
// descargue.
const Escaner = lazy(() => import('./views/Escaner'))
const Poster = lazy(() => import('./views/Poster'))

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()

  if (hash === '#escaner' || hash === '#poster') {
    return (
      <Suspense
        fallback={
          <p className="p-6 text-center text-sm text-[var(--color-muted)]">
            Cargando…
          </p>
        }
      >
        {hash === '#escaner' ? <Escaner /> : <Poster />}
      </Suspense>
    )
  }

  return (
    <StoreProvider>
      <Shell hash={hash} />
    </StoreProvider>
  )
}
