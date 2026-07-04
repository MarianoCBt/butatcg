import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { formatMoney } from '../utils/format'
import { buscarPorCodigo, extraerCodigos } from '../data/ygoprodeck'

// =====================================================================
//  ESCÁNER DE CARTAS (vista oculta, se abre con  #escaner)
//  Apuntás la cámara al código de set de la carta (ej: RA03-SP001),
//  el OCR lo lee, YGOPRODeck trae nombre/rareza/imagen y precio de
//  referencia de TCGPlayer, y se arma una lista que se descarga como
//  CSV con el formato de la planilla. El precio de venta lo cargás vos.
// =====================================================================

const LS_ITEMS = 'buta.escaner.items'

const CONDICIONES = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
]

// Zona del cuadro guía, como fracción del video (el código va ahí adentro).
const GUIA = { x: 0.15, y: 0.42, w: 0.7, h: 0.14 }

// Si un código falló hace menos de esto, no se re-consulta (evita spamear
// la API con la misma lectura errónea en cada frame).
const REINTENTO_MS = 10000

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
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [estado, setEstado] = useState('')
  const [lectura, setLectura] = useState('') // último texto crudo del OCR
  const [buscando, setBuscando] = useState(false)
  const [pendiente, setPendiente] = useState(null) // carta encontrada, a confirmar
  const [codigoManual, setCodigoManual] = useState('')
  const [aviso, setAviso] = useState('')
  const [zoom, setZoom] = useState(null) // { min, max, step, valor } si la cámara lo soporta

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const workerRef = useRef(null)
  const loopRef = useRef(false) // el loop de OCR sigue vivo
  const pausadoRef = useRef(false) // pausa mientras hay carta pendiente
  const canvasRef = useRef(null)
  const debugRef = useRef(null) // canvas visible con la imagen procesada
  const pasadaRef = useRef(0) // alterna el modo de preprocesado
  const fallidosRef = useRef(new Map()) // codigo -> timestamp del último fallo
  const avisoTimer = useRef(null)

  // ---- persistencia -------------------------------------------------
  useEffect(() => {
    localStorage.setItem(LS_ITEMS, JSON.stringify(items))
  }, [items])

  useEffect(() => () => apagarCamara(), [])

  // Conecta el stream al <video> recién cuando el elemento existe.
  useEffect(() => {
    if (camaraActiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [camaraActiva])

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
      const track = stream.getVideoTracks()[0]
      // Enfoque continuo y zoom, si el teléfono los soporta.
      track
        .applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
        .catch(() => {})
      const caps = track.getCapabilities?.()
      if (caps?.zoom) {
        const valor = track.getSettings?.().zoom ?? caps.zoom.min
        setZoom({
          min: caps.zoom.min,
          max: caps.zoom.max,
          step: caps.zoom.step || 0.1,
          valor,
        })
      }
      setCamaraActiva(true)
      setEstado('Cargando lector (la primera vez tarda unos segundos)…')
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        tessedit_pageseg_mode: '7', // una sola línea de texto
      })
      workerRef.current = worker
      setEstado(
        'Encuadrá el código dentro del recuadro, lo más cerca que enfoque.',
      )
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
    setZoom(null)
    setLectura('')
    clearTimeout(avisoTimer.current)
  }

  function aplicarZoom(valor) {
    setZoom((z) => (z ? { ...z, valor } : z))
    streamRef.current
      ?.getVideoTracks()[0]
      ?.applyConstraints({ advanced: [{ zoom: valor }] })
      .catch(() => {})
  }

  // Recorta la zona del cuadro guía y la prepara para el OCR.
  // modo 'bin': umbral adaptativo local (robusto a luz despareja, foils);
  // modo 'gris': escala de grises con contraste estirado.
  // Se alternan los modos entre pasadas: lo que uno pierde, el otro lo lee.
  function capturarZona(modo) {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const sx = video.videoWidth * GUIA.x
    const sy = video.videoHeight * GUIA.y
    const sw = video.videoWidth * GUIA.w
    const sh = video.videoHeight * GUIA.h
    const escala = Math.min(3, Math.max(1, 1400 / sw))
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    canvas.width = Math.round(sw * escala)
    canvas.height = Math.round(sh * escala)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = img.data
    const w = canvas.width
    const h = canvas.height
    const n = w * h
    const gris = new Uint8ClampedArray(n)
    const histo = new Array(256).fill(0)
    for (let i = 0; i < n; i++) {
      const g = Math.round(
        d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114,
      )
      gris[i] = g
      histo[g]++
    }

    if (modo === 'gris') {
      // Contraste estirado entre los percentiles 2 y 98.
      let low = 0
      let acc = 0
      for (let t = 0; t < 256; t++) {
        acc += histo[t]
        if (acc >= n * 0.02) {
          low = t
          break
        }
      }
      let high = 255
      acc = 0
      for (let t = 255; t >= 0; t--) {
        acc += histo[t]
        if (acc >= n * 0.02) {
          high = t
          break
        }
      }
      const rango = Math.max(1, high - low)
      for (let i = 0; i < n; i++) {
        const v = ((gris[i] - low) / rango) * 255
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
      }
    } else {
      // Umbral adaptativo: cada píxel se compara con la media de su
      // vecindario (imagen integral para que sea rápido).
      const iw = w + 1
      const integ = new Float64Array(iw * (h + 1))
      for (let y = 0; y < h; y++) {
        let fila = 0
        for (let x = 0; x < w; x++) {
          fila += gris[y * w + x]
          integ[(y + 1) * iw + x + 1] = integ[y * iw + x + 1] + fila
        }
      }
      const mitad = Math.max(8, Math.round(h / 3))
      const C = 10 // margen: qué tan más oscuro que la media debe ser el trazo
      let oscuros = 0
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - mitad)
        const y1 = Math.min(h - 1, y + mitad)
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - mitad)
          const x1 = Math.min(w - 1, x + mitad)
          const area = (x1 - x0 + 1) * (y1 - y0 + 1)
          const suma =
            integ[(y1 + 1) * iw + x1 + 1] -
            integ[(y1 + 1) * iw + x0] -
            integ[y0 * iw + x1 + 1] +
            integ[y0 * iw + x0]
          const v = gris[y * w + x] * area <= suma - C * area ? 0 : 255
          if (v === 0) oscuros++
          d[(y * w + x) * 4] =
            d[(y * w + x) * 4 + 1] =
            d[(y * w + x) * 4 + 2] =
              v
        }
      }
      // Tesseract espera texto oscuro sobre fondo claro: si quedó mayoría
      // oscura (texto claro sobre carta oscura / foil), se invierte.
      if (oscuros > n / 2) {
        for (let i = 0; i < n; i++) {
          const v = 255 - d[i * 4]
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
        }
      }
    }
    ctx.putImageData(img, 0, 0)

    // Vista de depuración: lo que realmente le llega al OCR.
    const dbg = debugRef.current
    if (dbg) {
      dbg.width = canvas.width
      dbg.height = canvas.height
      dbg.getContext('2d').drawImage(canvas, 0, 0)
    }
    return canvas
  }

  async function loopOcr() {
    while (loopRef.current) {
      if (!pausadoRef.current && workerRef.current) {
        try {
          const modo = pasadaRef.current++ % 2 === 0 ? 'bin' : 'gris'
          const canvas = capturarZona(modo)
          if (canvas) {
            const { data } = await workerRef.current.recognize(canvas)
            const texto = (data?.text || '').replace(/\s+/g, ' ').trim()
            if (texto) setLectura(texto.slice(0, 40))
            const candidatos = filtrarFallidos(extraerCodigos(texto))
            if (candidatos.length && loopRef.current && !pausadoRef.current) {
              await encontrado(candidatos)
            }
          }
        } catch {
          /* frame malo: se intenta de nuevo */
        }
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  // Saca los candidatos que ya fallaron hace poco.
  function filtrarFallidos(candidatos) {
    const ahora = Date.now()
    return candidatos.filter(
      (c) => ahora - (fallidosRef.current.get(c) || 0) > REINTENTO_MS,
    )
  }

  async function encontrado(candidatos) {
    pausadoRef.current = true
    setBuscando(true)
    setEstado(`Código leído: ${candidatos[0]}. Buscando carta…`)
    let carta = null
    for (const codigo of candidatos.slice(0, 3)) {
      carta = await buscarPorCodigo(codigo).catch(() => null)
      if (carta) break
      fallidosRef.current.set(codigo, Date.now())
    }
    setBuscando(false)
    if (carta) {
      navigator.vibrate?.(60)
      setPendiente(carta)
      setEstado('')
    } else {
      setEstado(
        `Leí "${candidatos[0]}" pero no encontré la carta. Seguí intentando.`,
      )
      pausadoRef.current = false
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
          precio: 0, // el precio de venta lo cargás vos
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
    if (camaraActiva)
      setEstado('Encuadrá el código dentro del recuadro, lo más cerca que enfoque.')
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
            {zoom && (
              <div className="absolute inset-x-4 bottom-3 flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2">
                <span className="text-xs text-white">Zoom</span>
                <input
                  type="range"
                  min={zoom.min}
                  max={zoom.max}
                  step={zoom.step}
                  value={zoom.valor}
                  onChange={(e) => aplicarZoom(Number(e.target.value))}
                  aria-label="Zoom de la cámara"
                  className="min-w-0 flex-1 accent-[var(--color-brand)]"
                />
              </div>
            )}
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
        {camaraActiva && (
          <div className="border-t border-[var(--color-border)] px-4 py-2">
            <p className="font-mono text-xs text-[var(--color-faint)]">
              Leyendo: {lectura || '…'}
            </p>
            {/* Imagen procesada que le llega al OCR (para diagnosticar) */}
            <canvas
              ref={debugRef}
              className="mt-2 block w-full rounded-md bg-[var(--color-surface-2)]"
            />
          </div>
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
                    placeholder="precio"
                    onChange={(e) =>
                      editarItem(it.id, 'precio', Number(e.target.value) || 0)
                    }
                    aria-label="Precio"
                    className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-right text-xs"
                  />
                </label>
                {it.precioUsd > 0 && (
                  <span className="text-xs text-[var(--color-faint)]">
                    Ref. TCGPlayer: US$ {it.precioUsd}
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
                      Ref. TCGPlayer:{' '}
                      <strong>US$ {pendiente.precioUsd}</strong>
                    </>
                  ) : (
                    <span className="text-[var(--color-faint)]">
                      Sin precio de referencia en TCGPlayer
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
