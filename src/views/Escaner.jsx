import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { formatMoney } from '../utils/format'
import {
  SETCODE_REGEX,
  buscarPorCodigo,
  calcularPrecio,
  PRECIO,
} from '../data/ygoprodeck'

// =====================================================================
//  ESCÁNER DE CARTAS (vista oculta, se abre con  #escaner)
//  Apuntás la cámara al código de set de la carta (ej: RA03-SP001),
//  el OCR lo lee, YGOPRODeck trae nombre/rareza/imagen y se arma una
//  lista que se descarga como CSV con el formato de la planilla.
// =====================================================================

const LS_ITEMS = 'buta.escaner.items'
const LS_COTIZACION = 'buta.escaner.cotizacion'

const CONDICIONES = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
]

// Zona del cuadro guía, como fracción del video (el código va ahí adentro).
const GUIA = { x: 0.1, y: 0.4, w: 0.8, h: 0.2 }

function leerItems() {
  try {
    const raw = localStorage.getItem(LS_ITEMS)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// Filas con el formato exacto de la planilla (plantilla-stock.csv).
const CSV_HEADERS = [
  'nombre', 'categoria', 'set', 'rareza', 'condicion', 'precio', 'stock',
  'preventa', 'pedido', 'expansion', 'subtipo', 'imagen', 'descripcion',
]

function itemAFila(it) {
  return {
    nombre: it.nombre,
    categoria: 'carta',
    set: it.codigo,
    rareza: it.rareza,
    condicion: it.condicion,
    precio: it.precio,
    stock: it.cantidad,
    preventa: 'FALSE',
    pedido: 'FALSE',
    expansion: it.setNombre,
    subtipo: '',
    imagen: it.imagen,
    descripcion: it.idioma,
  }
}

export default function Escaner() {
  const [items, setItems] = useState(leerItems)
  const [cotizacion, setCotizacion] = useState(
    () => Number(localStorage.getItem(LS_COTIZACION)) || 0,
  )
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [estado, setEstado] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [pendiente, setPendiente] = useState(null) // carta encontrada, a confirmar
  const [codigoManual, setCodigoManual] = useState('')
  const [aviso, setAviso] = useState('')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const workerRef = useRef(null)
  const loopRef = useRef(false) // el loop de OCR sigue vivo
  const pausadoRef = useRef(false) // pausa mientras hay carta pendiente
  const canvasRef = useRef(null)
  const avisoTimer = useRef(null)

  // ---- persistencia -------------------------------------------------
  useEffect(() => {
    localStorage.setItem(LS_ITEMS, JSON.stringify(items))
  }, [items])

  useEffect(() => {
    localStorage.setItem(LS_COTIZACION, String(cotizacion || 0))
  }, [cotizacion])

  useEffect(() => () => apagarCamara(), [])

  function mostrarAviso(texto) {
    setAviso(texto)
    clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(''), 2500)
  }

  // ---- cámara + OCR -------------------------------------------------
  async function prenderCamara() {
    setEstado('Pidiendo permiso de cámara…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      setCamaraActiva(true)
      // El <video> se monta recién al cambiar el estado.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
      setEstado('Cargando lector (primera vez tarda unos segundos)…')
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        tessedit_pageseg_mode: '7', // una sola línea de texto
      })
      workerRef.current = worker
      setEstado('Encuadrá el código de la carta dentro del recuadro.')
      loopRef.current = true
      pausadoRef.current = false
      loopOcr()
    } catch (e) {
      apagarCamara()
      setEstado(
        e?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Podés cargar el código a mano abajo.'
          : 'No se pudo abrir la cámara. Podés cargar el código a mano abajo.',
      )
    }
  }

  function apagarCamara() {
    loopRef.current = false
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    workerRef.current?.terminate().catch(() => {})
    workerRef.current = null
    setCamaraActiva(false)
    clearTimeout(avisoTimer.current)
  }

  // Recorta la zona del cuadro guía, la agranda y mejora el contraste.
  function capturarZona() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const sx = video.videoWidth * GUIA.x
    const sy = video.videoHeight * GUIA.y
    const sw = video.videoWidth * GUIA.w
    const sh = video.videoHeight * GUIA.h
    const escala = 3
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    canvas.width = sw * escala
    canvas.height = sh * escala
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    // Escala de grises + estiramiento de contraste (ayuda al OCR).
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = img.data
    let min = 255
    let max = 0
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      d[i] = g
      if (g < min) min = g
      if (g > max) max = g
    }
    const rango = Math.max(1, max - min)
    for (let i = 0; i < d.length; i += 4) {
      const g = ((d[i] - min) / rango) * 255
      d[i] = d[i + 1] = d[i + 2] = g
    }
    ctx.putImageData(img, 0, 0)
    return canvas
  }

  async function loopOcr() {
    while (loopRef.current) {
      if (!pausadoRef.current && workerRef.current) {
        try {
          const canvas = capturarZona()
          if (canvas) {
            const { data } = await workerRef.current.recognize(canvas)
            const texto = (data?.text || '').toUpperCase()
            const m = SETCODE_REGEX.exec(texto.replace(/\s+/g, ''))
            if (m && loopRef.current && !pausadoRef.current) {
              await encontrado(m[0])
            }
          }
        } catch {
          /* frame malo: se intenta de nuevo */
        }
      }
      await new Promise((r) => setTimeout(r, 350))
    }
  }

  async function encontrado(codigo) {
    pausadoRef.current = true
    setBuscando(true)
    setEstado(`Código leído: ${codigo}. Buscando carta…`)
    const carta = await buscarPorCodigo(codigo).catch(() => null)
    setBuscando(false)
    if (carta) {
      navigator.vibrate?.(60)
      setPendiente(carta)
      setEstado('')
    } else {
      setEstado(`Leí "${codigo}" pero no encontré la carta. Seguí intentando.`)
      // Pausa breve para no re-leer el mismo código erróneo al instante.
      setTimeout(() => {
        pausadoRef.current = false
      }, 1200)
    }
  }

  // ---- alta manual ---------------------------------------------------
  async function buscarManual(e) {
    e.preventDefault()
    const codigo = codigoManual.trim().toUpperCase()
    if (!codigo) return
    setBuscando(true)
    setEstado(`Buscando ${codigo}…`)
    const carta = await buscarPorCodigo(codigo).catch(() => null)
    setBuscando(false)
    if (carta) {
      pausadoRef.current = true
      setPendiente(carta)
      setEstado('')
      setCodigoManual('')
    } else {
      setEstado(`No encontré ninguna carta con el código ${codigo}.`)
    }
  }

  // ---- lista ---------------------------------------------------------
  function agregarPendiente() {
    const c = pendiente
    if (!c) return
    setItems((prev) => {
      const i = prev.findIndex((it) => it.codigo === c.codigo)
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 }
        return copia
      }
      return [
        {
          id: `${c.codigo}-${Date.now()}`,
          nombre: c.nombre,
          codigo: c.codigo,
          setNombre: c.setNombre,
          rareza: c.rareza,
          idioma: c.idioma,
          imagen: c.imagen,
          precioUsd: c.precioUsd,
          precio: calcularPrecio(c.precioUsd, cotizacion),
          cantidad: 1,
          condicion: 'Near Mint',
        },
        ...prev,
      ]
    })
    mostrarAviso(`Agregada: ${c.nombre}`)
    cerrarPendiente()
  }

  function cerrarPendiente() {
    setPendiente(null)
    pausadoRef.current = false
    if (camaraActiva) setEstado('Encuadrá el código de la carta dentro del recuadro.')
  }

  function editarItem(id, campo, valor) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)),
    )
  }

  function cambiarCantidad(id, delta) {
    setItems((prev) =>
      prev
        .map((it) =>
          it.id === id ? { ...it, cantidad: it.cantidad + delta } : it,
        )
        .filter((it) => it.cantidad > 0),
    )
  }

  function recalcularPrecios() {
    setItems((prev) =>
      prev.map((it) =>
        it.precioUsd > 0
          ? { ...it, precio: calcularPrecio(it.precioUsd, cotizacion) }
          : it,
      ),
    )
    mostrarAviso('Precios recalculados con la cotización actual.')
  }

  function vaciarLista() {
    if (window.confirm('¿Vaciar la lista escaneada?')) setItems([])
  }

  // ---- export ---------------------------------------------------------
  function descargarCsv() {
    const filas = [CSV_HEADERS.join(',')]
    for (const it of items) {
      const f = itemAFila(it)
      filas.push(CSV_HEADERS.map((h) => csvCell(f[h])).join(','))
    }
    // BOM para que Excel/Sheets detecten UTF-8.
    const BOM = String.fromCharCode(0xfeff)
    const blob = new Blob([BOM + filas.join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stock-escaneado-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function copiarFilas() {
    const filas = items.map((it) => {
      const f = itemAFila(it)
      return CSV_HEADERS.map((h) => f[h]).join('\t')
    })
    try {
      await navigator.clipboard.writeText(filas.join('\n'))
      mostrarAviso('Filas copiadas: pegalas directo en la planilla.')
    } catch {
      mostrarAviso('No se pudo copiar. Usá "Descargar CSV".')
    }
  }

  const totalCartas = items.reduce((acc, it) => acc + it.cantidad, 0)

  // ---- UI --------------------------------------------------------------
  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 px-4 pb-10 pt-4">
      {/* Encabezado propio (la vista es privada, sin menú de la tienda) */}
      <header className="flex items-center gap-3">
        <img
          src={config.logo}
          alt=""
          className="h-9 w-9 rounded-full object-contain"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Escáner de cartas</h1>
          <p className="text-xs text-[var(--color-muted)]">
            Herramienta privada · las filas salen con el formato de la planilla
          </p>
        </div>
        <a
          href="./"
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          Tienda
        </a>
      </header>

      {/* Cámara */}
      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {camaraActiva ? (
          <div className="relative">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="block w-full"
            />
            {/* Cuadro guía: el código de la carta va acá adentro */}
            <div
              className="pointer-events-none absolute rounded-lg border-2 border-[var(--color-brand)]"
              style={{
                left: `${GUIA.x * 100}%`,
                top: `${GUIA.y * 100}%`,
                width: `${GUIA.w * 100}%`,
                height: `${GUIA.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              }}
            />
            <button
              onClick={apagarCamara}
              className="absolute right-2 top-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white hover:bg-black/80"
            >
              Apagar
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="text-4xl">📷</span>
            <p className="text-sm text-[var(--color-muted)]">
              Apuntá la cámara al <strong>código de set</strong> de la carta
              (abajo a la derecha del arte, ej.{' '}
              <code className="rounded bg-[var(--color-surface-2)] px-1">
                RA03-SP001
              </code>
              ).
            </p>
            <button
              onClick={prenderCamara}
              className="rounded-xl bg-[var(--color-brand)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--color-brand-dark)]"
            >
              Prender cámara
            </button>
          </div>
        )}
        {(estado || buscando) && (
          <p className="border-t border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)]">
            {buscando ? 'Buscando carta…' : estado}
          </p>
        )}
      </section>

      {/* Alta manual (fallback del OCR) */}
      <form onSubmit={buscarManual} className="flex gap-2">
        <input
          value={codigoManual}
          onChange={(e) => setCodigoManual(e.target.value)}
          placeholder="O escribí el código: RA03-SP001"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm placeholder:text-[var(--color-faint)]"
        />
        <button
          type="submit"
          disabled={buscando || !codigoManual.trim()}
          className="rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Buscar
        </button>
      </form>

      {/* Cotización del dólar (misma regla de precios que el importador) */}
      <section className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <label htmlFor="cotizacion" className="flex-1 text-sm">
          Cotización USD
          <span className="block text-xs text-[var(--color-faint)]">
            precio = USD × cotización × {(1 + PRECIO.MARGEN / 100).toFixed(2)}{' '}
            + {PRECIO.RECARGO_FIJO}
          </span>
        </label>
        <input
          id="cotizacion"
          type="number"
          inputMode="numeric"
          min="0"
          value={cotizacion || ''}
          onChange={(e) => setCotizacion(Number(e.target.value) || 0)}
          placeholder="1600"
          className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-right text-sm"
        />
        <button
          onClick={recalcularPrecios}
          disabled={!items.length || !cotizacion}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Recalcular
        </button>
      </section>

      {/* Lista escaneada */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Lista{' '}
            <span className="text-sm font-normal text-[var(--color-muted)]">
              ({totalCartas} {totalCartas === 1 ? 'carta' : 'cartas'})
            </span>
          </h2>
          {items.length > 0 && (
            <button
              onClick={vaciarLista}
              className="text-sm text-[var(--color-faint)] hover:text-[var(--color-ink)]"
            >
              Vaciar
            </button>
          )}
        </div>

        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-faint)]">
            Todavía no escaneaste ninguna carta.
          </p>
        )}

        {items.map((it) => (
          <article
            key={it.id}
            className="flex gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
              {it.imagen ? (
                <img
                  src={it.imagen}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl">
                  🃏
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.nombre}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {it.codigo} · {it.rareza || 'Sin rareza'}
                {it.idioma ? ` · ${it.idioma}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={it.condicion}
                  onChange={(e) => editarItem(it.id, 'condicion', e.target.value)}
                  aria-label="Condición"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs"
                >
                  {CONDICIONES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                  $
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={it.precio || ''}
                    placeholder="0"
                    onChange={(e) =>
                      editarItem(it.id, 'precio', Number(e.target.value) || 0)
                    }
                    aria-label="Precio"
                    className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-right text-xs"
                  />
                </label>
                {it.precioUsd > 0 && (
                  <span className="text-xs text-[var(--color-faint)]">
                    (US$ {it.precioUsd})
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => cambiarCantidad(it.id, -1)}
                  aria-label="Restar una"
                  className="h-7 w-7 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-2)]"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold">
                  {it.cantidad}
                </span>
                <button
                  onClick={() => cambiarCantidad(it.id, 1)}
                  aria-label="Sumar una"
                  className="h-7 w-7 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-2)]"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-[var(--color-muted)]">
                {formatMoney(it.precio * it.cantidad)}
              </span>
            </div>
          </article>
        ))}
      </section>

      {/* Export */}
      {items.length > 0 && (
        <section className="sticky bottom-3 flex gap-2">
          <button
            onClick={descargarCsv}
            className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-3 font-semibold text-white shadow-lg hover:bg-[var(--color-brand-dark)]"
          >
            Descargar CSV ({totalCartas})
          </button>
          <button
            onClick={copiarFilas}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold hover:bg-[var(--color-surface-2)]"
          >
            Copiar filas
          </button>
        </section>
      )}

      {/* Aviso flotante */}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white shadow-lg">
            {aviso}
          </p>
        </div>
      )}

      {/* Carta encontrada: confirmar antes de agregar */}
      {pendiente && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={cerrarPendiente}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-3">
              <div className="h-32 w-22 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
                {pendiente.imagen ? (
                  <img
                    src={pendiente.imagen}
                    alt=""
                    className="h-full w-full object-contain"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <div className="flex h-full w-16 items-center justify-center text-3xl">
                    🃏
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold leading-snug">{pendiente.nombre}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {pendiente.codigo}
                  {pendiente.rareza ? ` · ${pendiente.rareza}` : ''}
                </p>
                <p className="text-xs text-[var(--color-faint)]">
                  {pendiente.setNombre}
                </p>
                <p className="mt-2 text-sm">
                  {pendiente.precioUsd > 0 ? (
                    <>
                      US$ {pendiente.precioUsd} →{' '}
                      <strong>
                        {formatMoney(
                          calcularPrecio(pendiente.precioUsd, cotizacion),
                        )}
                      </strong>
                    </>
                  ) : (
                    <span className="text-[var(--color-faint)]">
                      Sin precio de referencia (lo cargás a mano)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={agregarPendiente}
                className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white hover:bg-[var(--color-brand-dark)]"
              >
                Agregar
              </button>
              <button
                onClick={cerrarPendiente}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm hover:bg-[var(--color-surface-2)]"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
