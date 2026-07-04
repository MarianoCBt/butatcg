import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { formatMoney } from '../utils/format'
import {
  IDIOMAS_ELEGIBLES,
  buscarPorCodigo,
  buscarPorNombre,
  buscarPorTextoOcr,
  codigoParaIdioma,
  extraerCodigos,
} from '../data/ygoprodeck'

// =====================================================================
//  ESCÁNER DE CARTAS (vista oculta, se abre con  #escaner)
//  Apuntás la cámara al NOMBRE de la carta (el texto grande de arriba,
//  mucho más legible que el código chiquito). El OCR lo lee, YGOPRODeck
//  trae la carta con todas sus impresiones, y elegís de un desplegable
//  la versión (código + rareza) y el idioma de tu copia. También se
//  puede tipear el nombre (con autocompletado) o el código exacto.
//  La lista se exporta como CSV con el formato de la planilla.
// =====================================================================

const LS_ITEMS = 'buta.escaner.items'
const LS_IDIOMA = 'buta.escaner.idioma'

const CONDICIONES = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
]

// Zona del cuadro guía, como fracción del video (el nombre va ahí adentro).
const GUIA = { x: 0.08, y: 0.42, w: 0.84, h: 0.14 }

// Si algo falló o se descartó hace menos de esto, no se vuelve a ofrecer
// (evita que el mismo cuadro reabra el modal o se re-consulte la API).
const REINTENTO_MS = 8000

function leerItems() {
  try {
    const raw = localStorage.getItem(LS_ITEMS)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function idiomaGuardado() {
  const v = localStorage.getItem(LS_IDIOMA)
  return IDIOMAS_ELEGIBLES.includes(v) ? v : 'Inglés'
}

function esCodigoDeSet(texto) {
  return /^[A-Z0-9]{2,5}-[A-Z0-9]{3,7}$/i.test(texto.trim())
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
  // Carta encontrada, a confirmar: { nombre, imagen, sets, setIdx, idioma }
  const [pendiente, setPendiente] = useState(null)
  const [entrada, setEntrada] = useState('') // input de nombre o código
  const [sugerencias, setSugerencias] = useState([])
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
  const cooldownRef = useRef(new Map()) // clave -> ts (fallos y descartes recientes)
  const ultimaBusquedaRef = useRef({ q: '', t: 0 }) // throttle de búsqueda por nombre
  const busquedaTokenRef = useRef(0) // descarta respuestas viejas del autocompletado
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

  // Autocompletado por nombre (con debounce; ignora códigos de set).
  useEffect(() => {
    const q = entrada.trim()
    if (q.length < 3 || esCodigoDeSet(q)) {
      setSugerencias([])
      return
    }
    const token = ++busquedaTokenRef.current
    const timer = setTimeout(async () => {
      const rs = await buscarPorNombre(q).catch(() => [])
      if (busquedaTokenRef.current === token) setSugerencias(rs.slice(0, 6))
    }, 400)
    return () => clearTimeout(timer)
  }, [entrada])

  function mostrarAviso(texto) {
    setAviso(texto)
    clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(''), 2500)
  }

  function enCooldown(clave) {
    return Date.now() - (cooldownRef.current.get(clave) || 0) < REINTENTO_MS
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
        tessedit_pageseg_mode: '7', // una sola línea de texto
      })
      workerRef.current = worker
      setEstado('Encuadrá el NOMBRE de la carta dentro del recuadro.')
      loopRef.current = true
      pausadoRef.current = false
      loopOcr()
    } catch (e) {
      apagarCamara()
      setEstado(
        e?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Podés buscar por nombre abajo.'
          : 'No se pudo abrir la cámara. Podés buscar por nombre abajo.',
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
            if (loopRef.current && !pausadoRef.current) {
              // Si en el recuadro hay un código de set, se usa directo;
              // si no, se intenta identificar la carta por el nombre.
              const codigos = extraerCodigos(texto).filter(
                (c) => !enCooldown(c),
              )
              if (codigos.length) await encontradoCodigo(codigos)
              else await intentarNombre(texto)
            }
          }
        } catch {
          /* frame malo: se intenta de nuevo */
        }
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  async function encontradoCodigo(candidatos) {
    pausadoRef.current = true
    setBuscando(true)
    setEstado(`Código leído: ${candidatos[0]}. Buscando carta…`)
    let carta = null
    for (const codigo of candidatos.slice(0, 3)) {
      carta = await buscarPorCodigo(codigo).catch(() => null)
      if (carta) break
      cooldownRef.current.set(codigo, Date.now())
    }
    setBuscando(false)
    if (carta) {
      abrirPendiente(
        {
          nombre: carta.nombre,
          imagen: carta.imagen,
          sets: [
            {
              codigo: carta.codigo,
              setNombre: carta.setNombre,
              rareza: carta.rareza,
              precioUsd: carta.precioUsd,
            },
          ],
        },
        carta.idioma,
      )
    } else {
      setEstado(
        `Leí "${candidatos[0]}" pero no encontré la carta. Seguí intentando.`,
      )
      pausadoRef.current = false
    }
  }

  async function intentarNombre(texto) {
    const q = texto.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
    if (q.replace(/[^A-Z]/g, '').length < 6) return
    const ahora = Date.now()
    const ultima = ultimaBusquedaRef.current
    if (q === ultima.q || ahora - ultima.t < 1500) return
    ultimaBusquedaRef.current = { q, t: ahora }
    const carta = await buscarPorTextoOcr(texto).catch(() => null)
    if (
      carta &&
      loopRef.current &&
      !pausadoRef.current &&
      !enCooldown(carta.nombre)
    ) {
      abrirPendiente(carta)
    }
  }

  function abrirPendiente(carta, idioma) {
    pausadoRef.current = true
    navigator.vibrate?.(60)
    setPendiente({
      nombre: carta.nombre,
      imagen: carta.imagen,
      sets: carta.sets || [],
      setIdx: 0,
      idioma: idioma || idiomaGuardado(),
    })
    setEstado('')
  }

  // ---- alta manual (nombre con autocompletado, o código exacto) ------
  async function buscarManual(e) {
    e.preventDefault()
    const q = entrada.trim()
    if (!q) return
    setBuscando(true)
    setEstado(`Buscando ${q}…`)
    if (esCodigoDeSet(q)) {
      const carta = await buscarPorCodigo(q.toUpperCase()).catch(() => null)
      setBuscando(false)
      if (carta) {
        abrirPendiente(
          {
            nombre: carta.nombre,
            imagen: carta.imagen,
            sets: [
              {
                codigo: carta.codigo,
                setNombre: carta.setNombre,
                rareza: carta.rareza,
                precioUsd: carta.precioUsd,
              },
            ],
          },
          carta.idioma,
        )
        setEntrada('')
        setSugerencias([])
      } else {
        setEstado(`No encontré ninguna carta con el código ${q.toUpperCase()}.`)
      }
      return
    }
    const rs =
      sugerencias.length > 0
        ? sugerencias
        : await buscarPorNombre(q).catch(() => [])
    setBuscando(false)
    if (rs.length) {
      elegirSugerencia(rs[0])
    } else {
      setEstado(`No encontré ninguna carta que se llame "${q}".`)
    }
  }

  function elegirSugerencia(carta) {
    abrirPendiente(carta)
    setEntrada('')
    setSugerencias([])
  }

  // ---- lista ---------------------------------------------------------
  function agregarPendiente() {
    const p = pendiente
    if (!p) return
    const s = p.sets[p.setIdx] || {}
    const codigo = codigoParaIdioma(s.codigo || '', p.idioma)
    const clave = codigo || `${p.nombre}|${s.rareza || ''}`
    localStorage.setItem(LS_IDIOMA, p.idioma)
    cooldownRef.current.set(p.nombre, Date.now())
    setItems((prev) => {
      const i = prev.findIndex(
        (it) => (it.codigo || `${it.nombre}|${it.rareza}`) === clave,
      )
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 }
        return copia
      }
      return [
        {
          id: `${clave}-${Date.now()}`,
          nombre: p.nombre,
          codigo,
          setNombre: s.setNombre || '',
          rareza: s.rareza || '',
          idioma: p.idioma,
          imagen: p.imagen,
          precioUsd: s.precioUsd || 0,
          precio: 0, // el precio de venta lo cargás vos
          cantidad: 1,
          condicion: 'Near Mint',
        },
        ...prev,
      ]
    })
    mostrarAviso(`Agregada: ${p.nombre}`)
    cerrarPendiente(false)
  }

  function cerrarPendiente(registrarDescarte = true) {
    if (registrarDescarte && pendiente) {
      cooldownRef.current.set(pendiente.nombre, Date.now())
    }
    setPendiente(null)
    pausadoRef.current = false
    if (camaraActiva)
      setEstado('Encuadrá el NOMBRE de la carta dentro del recuadro.')
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
  const setElegido = pendiente?.sets[pendiente.setIdx]

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
            {/* Cuadro guía: el nombre de la carta va acá adentro */}
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
              Apuntá la cámara al <strong>nombre de la carta</strong> (el
              texto grande de arriba). Después elegís la versión y el idioma
              de un desplegable.
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

      {/* Alta manual: nombre con autocompletado, o código exacto */}
      <form onSubmit={buscarManual} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="Nombre de la carta o código (RA05-EN028)"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm placeholder:text-[var(--color-faint)]"
          />
          <button
            type="submit"
            disabled={buscando || !entrada.trim()}
            className="rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Buscar
          </button>
        </div>
        {sugerencias.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            {sugerencias.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => elegirSugerencia(s)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-2)]"
                >
                  <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-[var(--color-surface-2)]">
                    {s.imagen && (
                      <img
                        src={s.imagen}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.nombre}
                  </span>
                  <span className="text-xs text-[var(--color-faint)]">
                    {s.sets.length}{' '}
                    {s.sets.length === 1 ? 'versión' : 'versiones'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
                {it.codigo || 'Sin código'} · {it.rareza || 'Sin rareza'}
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

      {/* Carta encontrada: elegir versión + idioma antes de agregar */}
      {pendiente && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => cerrarPendiente()}
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
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{pendiente.nombre}</p>
                <p className="mt-2 text-sm">
                  {setElegido?.precioUsd > 0 ? (
                    <>
                      Ref. TCGPlayer:{' '}
                      <strong>US$ {setElegido.precioUsd}</strong>
                    </>
                  ) : (
                    <span className="text-[var(--color-faint)]">
                      Sin precio de referencia en TCGPlayer
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-xs text-[var(--color-muted)]">
                Versión (código · rareza)
                <select
                  value={pendiente.setIdx}
                  onChange={(e) =>
                    setPendiente((p) => ({
                      ...p,
                      setIdx: Number(e.target.value),
                    }))
                  }
                  className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-sm"
                >
                  {pendiente.sets.map((s, i) => (
                    <option key={`${s.codigo}-${i}`} value={i}>
                      {s.codigo || 'Sin código'} · {s.rareza || 'Sin rareza'}
                    </option>
                  ))}
                  {pendiente.sets.length === 0 && (
                    <option value={0}>Sin versiones conocidas</option>
                  )}
                </select>
              </label>
              {setElegido?.setNombre && (
                <p className="text-xs text-[var(--color-faint)]">
                  {setElegido.setNombre}
                </p>
              )}
              <label className="text-xs text-[var(--color-muted)]">
                Idioma de tu copia
                <select
                  value={pendiente.idioma}
                  onChange={(e) =>
                    setPendiente((p) => ({ ...p, idioma: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-sm"
                >
                  {IDIOMAS_ELEGIBLES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={agregarPendiente}
                className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white hover:bg-[var(--color-brand-dark)]"
              >
                Agregar
              </button>
              <button
                onClick={() => cerrarPendiente()}
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
