import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarPorIds } from '../data/ygoprodeck'

// =====================================================================
//  PÓSTER DE DECKLIST (vista oculta, se abre con  #poster)
//  Subís un archivo .ydk (o pegás su contenido), se identifican las
//  cartas por passcode en YGOPRODeck y se genera un póster estilo
//  "ganador de torneo" (título, jugador, grilla del mazo y carta
//  destacada) listo para descargar como PNG y publicar en redes.
//
//  Assets del póster (en public/poster/): fondos elegibles (fondo-N.png)
//  y dos capas ya posicionadas sobre el mismo lienzo que los fondos:
//  logo-buta.png (jabalí) y logo-yugioh.png. Si faltan, se dibuja un
//  fondo de reemplazo y se omiten los logos.
//  Tipografía: Funnel Sans (Google Fonts). ExtraBold con trazo negro
//  para título y jugador; Light para las etiquetas del mazo.
// =====================================================================

const LS_DATOS = 'buta.poster.datos'

const RESULTADOS = ['GANADOR', 'FINALISTA', 'TOP 4', 'TOP 8', 'TOP 16']

// El póster es cuadrado, del mismo tamaño que las imágenes de fondo.
const W = 1600
const H = 1600
const M = 70 // margen exterior
const IZQ_W = 1000 // ancho de la columna del mazo (10 cartas por fila)

const ASSETS = import.meta.env.BASE_URL + 'poster/'
const FONDOS = ['fondo-1.jpg', 'fondo-2.jpg', 'fondo-3.jpg']
const OVERLAY_BUTA = 'logo-buta.png'
const OVERLAY_YGO = 'logo-yugioh.png'

const FUENTES_URL =
  'https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@300;800&display=swap'

// images.ygoprodeck.com no manda encabezados CORS, así que dibujar esas
// imágenes dejaría el canvas "tainted" (sin poder exportar el PNG). Se
// pasan por el proxy de weserv, que sí permite CORS.
function conCors(url) {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}`
}
function imagenChica(id) {
  return conCors(`https://images.ygoprodeck.com/images/cards_small/${id}.jpg`)
}
function imagenGrande(id) {
  return conCors(`https://images.ygoprodeck.com/images/cards/${id}.jpg`)
}

function parseYdk(texto) {
  const main = []
  const extra = []
  const side = []
  let destino = main
  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.trim()
    if (!linea) continue
    if (/^#main/i.test(linea)) { destino = main; continue }
    if (/^#extra/i.test(linea)) { destino = extra; continue }
    if (/^!side/i.test(linea)) { destino = side; continue }
    if (linea.startsWith('#') || linea.startsWith('!')) continue
    const id = Number(linea)
    if (Number.isFinite(id) && id > 0) destino.push(id)
  }
  return { main, extra, side }
}

function datosGuardados() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DATOS) || '{}')
    return typeof d === 'object' && d ? d : {}
  } catch {
    return {}
  }
}

// PRNG con semilla fija (para el fondo de reemplazo, si faltan los assets).
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function Poster() {
  const guardado = useMemo(datosGuardados, [])
  const [deck, setDeck] = useState(null) // { main, extra, side }
  const [cartas, setCartas] = useState(null) // Map id -> { nombre, tipo }
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const [pegando, setPegando] = useState(false)
  const [textoPegado, setTextoPegado] = useState('')

  const [evento, setEvento] = useState(guardado.evento || 'YACS CÓRDOBA BUTA')
  const [fecha, setFecha] = useState(() => {
    const hoy = new Date()
    const dd = String(hoy.getDate()).padStart(2, '0')
    const mm = String(hoy.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}`
  })
  const [jugador, setJugador] = useState(guardado.jugador || '')
  const [resultado, setResultado] = useState(guardado.resultado || 'GANADOR')
  const [destacadaId, setDestacadaId] = useState('')
  const [fondo, setFondo] = useState(
    Number.isInteger(guardado.fondo) && guardado.fondo < FONDOS.length
      ? guardado.fondo
      : 0,
  )

  const canvasRef = useRef(null)
  const imagenesRef = useRef(new Map()) // url -> Promise<Image|null>
  const dibujoTokenRef = useRef(0)
  const avisoTimer = useRef(null)

  useEffect(() => {
    localStorage.setItem(
      LS_DATOS,
      JSON.stringify({ evento, jugador, resultado, fondo }),
    )
  }, [evento, jugador, resultado, fondo])

  // Funnel Sans se carga solo en esta vista (el resto del sitio usa la
  // fuente del sistema).
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FUENTES_URL
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  function avisar(texto) {
    setAviso(texto)
    clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(''), 4000)
  }

  // ---- carga del .ydk ------------------------------------------------

  async function cargarTexto(texto, nombre) {
    setError('')
    setCargando(true)
    try {
      const d = parseYdk(texto)
      const total = d.main.length + d.extra.length + d.side.length
      if (!total) {
        throw new Error('No se encontraron cartas. ¿Es un archivo .ydk?')
      }
      const mapa = await buscarPorIds([...d.main, ...d.extra, ...d.side])
      setNombreArchivo(nombre)
      setDeck(d)
      setCartas(mapa)
      const primero = d.main[0] ?? d.extra[0] ?? d.side[0]
      setDestacadaId(String(primero))
    } catch (e) {
      setError(e.message || 'No se pudo leer el mazo.')
    } finally {
      setCargando(false)
    }
  }

  async function cargarArchivo(file) {
    if (!file) return
    cargarTexto(await file.text(), file.name)
  }

  // Cartas únicas en orden main -> extra -> side (para el desplegable).
  const opcionesDestacada = useMemo(() => {
    if (!deck || !cartas) return []
    const secciones = [
      ['Main Deck', deck.main],
      ['Extra Deck', deck.extra],
      ['Side Deck', deck.side],
    ]
    return secciones.map(([nombre, ids]) => ({
      nombre,
      cartas: [...new Set(ids)].map((id) => ({
        id,
        nombre: cartas.get(id)?.nombre || `#${id}`,
      })),
    }))
  }, [deck, cartas])

  // Conteo monstruo/mágica/trampa del main (como en el póster original).
  const stats = useMemo(() => {
    if (!deck || !cartas) return null
    const s = { monster: 0, spell: 0, trap: 0 }
    for (const id of deck.main) {
      const tipo = cartas.get(id)?.tipo || ''
      if (tipo.includes('Monster')) s.monster++
      else if (tipo.includes('Spell')) s.spell++
      else if (tipo.includes('Trap')) s.trap++
    }
    return s
  }, [deck, cartas])

  // ---- dibujo --------------------------------------------------------

  function cargarImagen(url) {
    if (!imagenesRef.current.has(url)) {
      imagenesRef.current.set(
        url,
        new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => {
            // No dejar el fallo cacheado: se reintenta al redibujar.
            imagenesRef.current.delete(url)
            resolve(null)
          }
          img.src = url
        }),
      )
    }
    return imagenesRef.current.get(url)
  }

  useEffect(() => {
    if (!deck || !cartas) return
    const miToken = ++dibujoTokenRef.current

    async function dibujar() {
      const canvas = canvasRef.current
      if (!canvas) return

      // Cargar fuentes e imágenes antes de dibujar. `fonts.load` puede
      // resolver vacío si la hoja de Google Fonts todavía no se parseó,
      // así que se reintenta un rato antes de rendirse (y en ese caso se
      // dibuja con la fuente del sistema).
      for (let intento = 0; intento < 20; intento++) {
        try {
          await Promise.all([
            document.fonts.load('800 100px "Funnel Sans"'),
            document.fonts.load('300 30px "Funnel Sans"'),
          ])
        } catch {
          break
        }
        if (
          document.fonts.check('800 100px "Funnel Sans"') &&
          document.fonts.check('300 30px "Funnel Sans"')
        ) {
          break
        }
        await new Promise((r) => setTimeout(r, 150))
        if (dibujoTokenRef.current !== miToken) return
      }
      const idsGrilla = [...deck.main, ...deck.extra, ...deck.side]
      const [imgsChicas, imgDestacada, imgFondo, imgButa, imgYgo] =
        await Promise.all([
          Promise.all(idsGrilla.map((id) => cargarImagen(imagenChica(id)))),
          destacadaId ? cargarImagen(imagenGrande(destacadaId)) : null,
          cargarImagen(ASSETS + FONDOS[fondo]),
          cargarImagen(ASSETS + OVERLAY_BUTA),
          cargarImagen(ASSETS + OVERLAY_YGO),
        ])
      if (dibujoTokenRef.current !== miToken) return
      const imgPorId = new Map(idsGrilla.map((id, i) => [id, imgsChicas[i]]))

      const ctx = canvas.getContext('2d')
      const F = (peso, px) => `${peso} ${px}px "Funnel Sans", system-ui, sans-serif`

      // Dibuja una imagen cubriendo todo el lienzo (tipo object-cover).
      function capa(img) {
        const s = Math.max(W / img.width, H / img.height)
        const dw = img.width * s
        const dh = img.height * s
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
      }

      // --- fondo ---
      ctx.clearRect(0, 0, W, H)
      if (imgFondo) {
        capa(imgFondo)
      } else {
        // Reemplazo si faltan los assets: cielo estrellado simple.
        ctx.fillStyle = '#070a13'
        ctx.fillRect(0, 0, W, H)
        const rand = mulberry32(20241206)
        for (let i = 0; i < 320; i++) {
          const x = rand() * W
          const y = rand() * H
          const r = rand() * 1.8 + 0.4
          ctx.fillStyle = `rgba(231, 236, 245, ${0.15 + rand() * 0.55})`
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // --- textos del encabezado ---
      // Título y jugador: Funnel Sans ExtraBold con trazo negro de 10px.
      function textoConTrazo(texto, x, y, px, trazo = 10) {
        ctx.font = F(800, px)
        ctx.lineJoin = 'round'
        ctx.miterLimit = 2
        ctx.lineWidth = trazo
        ctx.strokeStyle = '#000'
        ctx.strokeText(texto, x, y)
        ctx.fillStyle = '#fff'
        ctx.fillText(texto, x, y)
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const titulo = evento.toUpperCase()
      let pxTitulo = 100
      ctx.font = F(800, pxTitulo)
      while (pxTitulo > 40 && ctx.measureText(titulo).width > W - 2 * M) {
        pxTitulo -= 2
        ctx.font = F(800, pxTitulo)
      }
      textoConTrazo(titulo, W / 2, 160, pxTitulo)
      if (fecha) textoConTrazo(fecha, W / 2, 228, 42, 8)
      if (jugador) textoConTrazo(`👑 ${jugador}`, W / 2, 322, 72)
      if (resultado) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = '10px'
        textoConTrazo(resultado.toUpperCase(), W / 2, 384, 40, 8)
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
      }

      // --- helpers de la grilla ---
      function panel(x, y, w, h) {
        ctx.fillStyle = 'rgba(5, 7, 12, 0.55)'
        ctx.strokeStyle = 'rgba(231, 236, 245, 0.25)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, 12)
        ctx.fill()
        ctx.stroke()
      }
      function carta(id, x, y, w, h) {
        const img = imgPorId.get(id)
        if (img) {
          ctx.drawImage(img, x, y, w, h)
        } else {
          ctx.fillStyle = 'rgba(30, 37, 51, 0.9)'
          ctx.strokeStyle = 'rgba(231, 236, 245, 0.25)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(x, y, w, h, 5)
          ctx.fill()
          ctx.stroke()
          ctx.font = `${Math.round(h * 0.35)}px system-ui`
          ctx.textAlign = 'center'
          ctx.fillText('🃏', x + w / 2, y + h * 0.62)
        }
      }
      // Dibuja una sección (etiqueta + grilla) y devuelve la y siguiente.
      // Etiquetas en Funnel Sans Light.
      function seccion(ids, x, y, porFila, cardW, etiqueta, etiquetaDer) {
        if (!ids.length) return y
        // El gap reparte el sobrante para llenar el ancho de la columna.
        const gap = Math.floor((IZQ_W - porFila * cardW) / (porFila - 1))
        const cardH = Math.round(cardW * 1.459)
        const filas = Math.ceil(ids.length / porFila)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#fff'
        ctx.font = F(300, 28)
        ctx.fillText(etiqueta, x + 2, y + 26)
        if (etiquetaDer) {
          ctx.textAlign = 'right'
          ctx.fillText(etiquetaDer, x + IZQ_W - 2, y + 26)
        }
        y += 34
        const altoGrilla = filas * (cardH + gap) - gap
        panel(x - 12, y - 12, IZQ_W + 24, altoGrilla + 24)
        ids.forEach((id, i) => {
          carta(
            id,
            x + (i % porFila) * (cardW + gap),
            y + Math.floor(i / porFila) * (cardH + gap),
            cardW,
            cardH,
          )
        })
        return y + altoGrilla + 20
      }

      // --- grillas del mazo ---
      // Apretado para que el side termine antes del logo de Yu-Gi-Oh!
      // (la capa logo-yugioh.png ocupa y≈1424-1536).
      const deckTop = 390
      let y = deckTop
      const etiquetaStats = stats
        ? `Monster: ${stats.monster}   Spell: ${stats.spell}   Trap: ${stats.trap}`
        : ''
      y = seccion(deck.main, M, y, 10, 93, `Main Deck: ${deck.main.length}`, etiquetaStats)
      y = seccion(deck.extra, M, y, 15, 54, `Extra Deck: ${deck.extra.length}`)
      y = seccion(deck.side, M, y, 15, 54, `Side Deck: ${deck.side.length}`)

      // --- carta destacada (columna derecha) ---
      const fx = M + IZQ_W + 40
      const fw = W - M - fx
      if (imgDestacada) {
        const fh = Math.round(fw * 1.459)
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
        ctx.shadowBlur = 40
        ctx.drawImage(imgDestacada, fx, deckTop + 26, fw, fh)
        ctx.restore()
      }

      // --- logos (capas ya posicionadas sobre el mismo lienzo) ---
      if (imgButa) capa(imgButa)
      if (imgYgo) capa(imgYgo)
    }

    dibujar()
  }, [deck, cartas, stats, evento, fecha, jugador, resultado, destacadaId, fondo])

  // ---- exportar ------------------------------------------------------

  function aBlob() {
    return new Promise((resolve, reject) => {
      try {
        canvasRef.current.toBlob((blob) => {
          blob ? resolve(blob) : reject(new Error('sin blob'))
        }, 'image/png')
      } catch (e) {
        reject(e)
      }
    })
  }

  async function descargar() {
    try {
      const blob = await aBlob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const base = (jugador || 'deck').toLowerCase().replace(/[^a-z0-9ñ]+/gi, '-')
      a.download = `poster-${base}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch {
      avisar('No se pudo exportar la imagen.')
    }
  }

  async function copiar() {
    try {
      const blob = await aBlob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      avisar('Imagen copiada al portapapeles.')
    } catch {
      avisar('No se pudo copiar (probá con Descargar PNG).')
    }
  }

  // ---- UI --------------------------------------------------------------

  const inputCls =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition-[opacity] focus:border-[var(--color-brand)]'
  const labelCls = 'mb-1 block text-xs font-semibold text-[var(--color-muted)]'

  return (
    <div className="min-h-full px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-ink)]">
              🖼️ Póster de decklist
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              Subí un .ydk y generá la imagen del ganador para redes.
            </p>
          </div>
          <a
            href="#"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] transition-[opacity] hover:opacity-80"
          >
            ← Volver a la tienda
          </a>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* ---- panel de datos ---- */}
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
            {/* zona de carga */}
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setArrastrando(true)
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastrando(false)
                cargarArchivo(e.dataTransfer.files?.[0])
              }}
              className={`block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center text-sm transition-[opacity] hover:opacity-90 ${
                arrastrando
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-light)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]'
              }`}
            >
              <input
                type="file"
                accept=".ydk,.txt"
                className="hidden"
                onChange={(e) => {
                  cargarArchivo(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <span className="text-2xl">📄</span>
              <p className="mt-1 font-semibold text-[var(--color-ink)]">
                {nombreArchivo || 'Elegí o arrastrá el archivo .ydk'}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {deck
                  ? `Main ${deck.main.length} · Extra ${deck.extra.length} · Side ${deck.side.length}`
                  : 'El que exporta EDOPro / Omega / Neuron'}
              </p>
            </label>

            <button
              type="button"
              onClick={() => setPegando(!pegando)}
              className="self-start text-xs text-[var(--color-muted)] underline transition-[opacity] hover:opacity-80"
            >
              {pegando ? 'Ocultar' : 'O pegá el contenido del .ydk'}
            </button>
            {pegando && (
              <div>
                <textarea
                  rows={5}
                  value={textoPegado}
                  onChange={(e) => setTextoPegado(e.target.value)}
                  placeholder={'#main\n14558127\n…'}
                  className={`${inputCls} font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={() => cargarTexto(textoPegado, 'pegado')}
                  disabled={!textoPegado.trim() || cargando}
                  className="mt-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition-[opacity] hover:bg-[var(--color-brand-dark)] disabled:opacity-50"
                >
                  Leer lista
                </button>
              </div>
            )}

            {cargando && (
              <p className="text-sm text-[var(--color-muted)]">
                Buscando cartas en YGOPRODeck…
              </p>
            )}
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            {/* datos del póster */}
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div>
                <label className={labelCls}>Evento</label>
                <input
                  value={evento}
                  onChange={(e) => setEvento(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Fecha</label>
                <input
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Jugador</label>
                <input
                  value={jugador}
                  onChange={(e) => setJugador(e.target.value)}
                  placeholder="Nombre y apellido"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Resultado</label>
                <input
                  list="poster-resultados"
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  className={inputCls}
                />
                <datalist id="poster-resultados">
                  {RESULTADOS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Carta destacada</label>
                <select
                  value={destacadaId}
                  onChange={(e) => setDestacadaId(e.target.value)}
                  disabled={!deck}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  {opcionesDestacada.map((grupo) =>
                    grupo.cartas.length ? (
                      <optgroup key={grupo.nombre} label={grupo.nombre}>
                        {grupo.cartas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </select>
              </div>
              <div>
                <label className={labelCls}>Fondo</label>
                <div className="flex gap-2">
                  {FONDOS.map((archivo, i) => (
                    <button
                      key={archivo}
                      type="button"
                      onClick={() => setFondo(i)}
                      title={`Fondo ${i + 1}`}
                      className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-[opacity] hover:opacity-80 ${
                        fondo === i
                          ? 'border-[var(--color-brand)]'
                          : 'border-[var(--color-border)]'
                      }`}
                    >
                      <img
                        src={ASSETS + archivo}
                        alt={`Fondo ${i + 1}`}
                        className="h-full w-full bg-[var(--color-surface-2)] object-cover"
                        onError={(e) => (e.target.style.visibility = 'hidden')}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ---- vista previa ---- */}
          <div className="min-w-0 flex-1">
            {deck ? (
              <>
                <canvas
                  ref={canvasRef}
                  width={W}
                  height={H}
                  className="w-full max-w-140 rounded-xl border border-[var(--color-border)]"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={descargar}
                    className="rounded-lg bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white transition-[opacity] hover:bg-[var(--color-brand-dark)]"
                  >
                    ⬇️ Descargar PNG
                  </button>
                  <button
                    type="button"
                    onClick={copiar}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition-[opacity] hover:opacity-80"
                  >
                    📋 Copiar imagen
                  </button>
                  {aviso && (
                    <span className="text-sm text-[var(--color-muted)]">{aviso}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
                La vista previa aparece acá al cargar un .ydk
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
