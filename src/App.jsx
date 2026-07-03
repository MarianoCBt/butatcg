import { useEffect, useRef, useState } from 'react'
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

function Shell() {
  const { expansiones } = useStore()
  const [view, setView] = useState('catalogo')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const inicializado = useRef(false)

  // La última preventa agregada = la última expansión en preventa de la lista.
  const ultimaPreventa = expansiones[expansiones.length - 1] || null

  // Al cargar (cuando ya hay expansiones), mostrar la última preventa por defecto.
  useEffect(() => {
    if (!inicializado.current && ultimaPreventa) {
      inicializado.current = true
      setFilter({ ...EMPTY_FILTER, preventa: true, expansion: ultimaPreventa })
    }
  }, [ultimaPreventa])

  // Al cambiar de vista, volver arriba (si no, el carrito abre "scrolleado").
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  function irAInicio() {
    setFilter(
      ultimaPreventa
        ? { ...EMPTY_FILTER, preventa: true, expansion: ultimaPreventa }
        : EMPTY_FILTER,
    )
    setView('catalogo')
  }

  function applyFilter(partial) {
    setFilter({ ...EMPTY_FILTER, ...partial })
    setView('catalogo')
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

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
