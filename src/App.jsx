import { useEffect, useRef, useState } from 'react'
import { StoreProvider, useStore } from './store/StoreContext'
import Header from './components/Header'
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
    <div className="min-h-full">
      <Header
        view={view}
        setView={setView}
        applyFilter={applyFilter}
        onInicio={irAInicio}
      />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {view === 'catalogo' && <Catalog filter={filter} setFilter={setFilter} />}
        {view === 'carrito' && <Cart onSeguirComprando={irAInicio} />}
      </main>
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
