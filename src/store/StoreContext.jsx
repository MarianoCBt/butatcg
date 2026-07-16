import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { config } from '../config'
import { seedProducts } from '../data/seed'
import { fetchStock } from '../data/fetchStock'

const StoreContext = createContext(null)

const LS_CART = 'buta.carrito'
const LS_CACHE = 'buta.stock.cache'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Acepta la config nueva (lista de hojas) y la vieja (una sola URL).
const SHEET_URLS = (
  Array.isArray(config.stockSheetCsvUrls)
    ? config.stockSheetCsvUrls
    : [config.stockSheetCsvUrl]
).filter(Boolean)

export function StoreProvider({ children }) {
  const hasSheet = SHEET_URLS.length > 0

  // Productos: arrancan del caché o del seed; luego se refrescan de la hoja.
  const [products, setProducts] = useState(() =>
    hasSheet ? load(LS_CACHE, []) : seedProducts,
  )
  const [loading, setLoading] = useState(hasSheet)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // carrito: { [productId]: cantidad }
  const [cart, setCart] = useState(() => load(LS_CART, {}))
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    if (!hasSheet) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchStock(SHEET_URLS)
      if (!mounted.current) return
      setProducts(data)
      setLastUpdated(Date.now())
      localStorage.setItem(LS_CACHE, JSON.stringify(data))
    } catch (e) {
      if (!mounted.current) return
      setError(e.message || 'No se pudo actualizar el stock')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [hasSheet])

  // Carga inicial + refresco automático
  useEffect(() => {
    mounted.current = true
    if (hasSheet) {
      refresh()
      const ms = Math.max(1, config.refreshMinutes || 10) * 60 * 1000
      const id = setInterval(refresh, ms)
      return () => {
        mounted.current = false
        clearInterval(id)
      }
    }
    return () => {
      mounted.current = false
    }
  }, [hasSheet, refresh])

  // Persistir carrito
  useEffect(() => {
    localStorage.setItem(LS_CART, JSON.stringify(cart))
  }, [cart])

  // ---- Carrito ----
  function addToCart(id, qty = 1) {
    setCart((prev) => {
      const product = products.find((p) => p.id === id)
      const max = product ? product.stock : 99
      const current = prev[id] || 0
      const next = Math.min(current + qty, max)
      return { ...prev, [id]: next }
    })
  }

  function setCartQty(id, qty) {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) {
        delete next[id]
      } else {
        const product = products.find((p) => p.id === id)
        const max = product ? product.stock : 99
        next[id] = Math.min(qty, max)
      }
      return next
    })
  }

  function removeFromCart(id) {
    setCart((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function clearCart() {
    setCart({})
  }

  // ---- Derivados ----
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((p) => p.id === id)
        if (!product) return null
        return { ...product, qty, subtotal: product.precio * qty }
      })
      .filter(Boolean)
  }, [cart, products])

  const cartCount = useMemo(
    () => cartItems.reduce((acc, it) => acc + it.qty, 0),
    [cartItems],
  )

  const cartTotal = useMemo(
    () => cartItems.reduce((acc, it) => acc + it.subtotal, 0),
    [cartItems],
  )

  // Expansiones distintas entre los productos en preventa o a pedido
  // (el menú/links de "Preventa" incluyen ambos).
  const expansiones = useMemo(() => {
    const set = new Set()
    products.forEach((p) => {
      if ((p.preventa || p.pedido) && p.expansion) set.add(p.expansion)
    })
    return [...set]
  }, [products])

  // Tipos de accesorio distintos
  const accesorioTipos = useMemo(() => {
    const set = new Set()
    products.forEach((p) => {
      if (p.categoria === 'accesorio' && p.subtipo) set.add(p.subtipo)
    })
    return [...set]
  }, [products])

  // Todos los sets (expansiones) distintos, ordenados alfabéticamente
  const sets = useMemo(() => {
    const s = new Set()
    products.forEach((p) => {
      if (p.expansion) s.add(p.expansion)
    })
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [products])

  const value = {
    products,
    loading,
    error,
    lastUpdated,
    hasSheet,
    refresh,
    expansiones,
    accesorioTipos,
    sets,
    cart,
    cartItems,
    cartCount,
    cartTotal,
    addToCart,
    setCartQty,
    removeFromCart,
    clearCart,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return ctx
}
