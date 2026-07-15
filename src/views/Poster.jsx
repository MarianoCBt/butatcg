import { useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'
import { buscarPorIds } from '../data/ygoprodeck'

// =====================================================================
//  PÓSTER DE DECKLIST (vista oculta, se abre con  #poster)
//  Subís un archivo .ydk (o pegás su contenido), se identifican las
//  cartas por passcode en YGOPRODeck y se genera un póster estilo
//  "ganador de torneo" (título, jugador, grilla del mazo y carta
//  destacada) listo para descargar como PNG y publicar en redes.
// =====================================================================

const LS_DATOS = 'buta.poster.datos'

const RESULTADOS = ['GANADOR', 'FINALISTA', 'TOP 4', 'TOP 8', 'TOP 16']

// Tamaño del póster (4:5, formato feed de Instagram).
const W = 1080
const H = 1350
const M = 48 // margen exterior
const IZQ_W = 660 // ancho de la columna del mazo (10 cartas por fila)

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

// Variable CSS del tema -> color usable en canvas.
function token(nombre, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(nombre)
    .trim()
  return v || fallback
}

// PRNG con semilla fija: las estrellas del fondo no "bailan" al redibujar.
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

  const canvasRef = useRef(null)
  const imagenesRef = useRef(new Map()) // url -> Promise<Image|null>
  const dibujoTokenRef = useRef(0)
  const avisoTimer = useRef(null)

  useEffect(() => {
    localStorage.setItem(LS_DATOS, JSON.stringify({ evento, jugador, resultado }))
  }, [evento, jugador, resultado])

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
          img.onerror = () => resolve(null)
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
      const brand = token('--color-brand', '#3b6df0')
      const ink = token('--color-ink', '#e7ecf5')
      const muted = token('--color-muted', '#9aa7bd')
      const surface2 = token('--color-surface-2', '#1e2533')
      const borde = token('--color-border', '#2b3344')

      // Cargar todas las imágenes antes de dibujar.
      const idsGrilla = [...deck.main, ...deck.extra, ...deck.side]
      const [imgsChicas, imgDestacada, imgYgo, imgLogo] = await Promise.all([
        Promise.all(idsGrilla.map((id) => cargarImagen(imagenChica(id)))),
        destacadaId ? cargarImagen(imagenGrande(destacadaId)) : null,
        cargarImagen(import.meta.env.BASE_URL + 'yugioh-logo.png'),
        cargarImagen(config.logo),
      ])
      if (dibujoTokenRef.current !== miToken) return
      const imgPorId = new Map(idsGrilla.map((id, i) => [id, imgsChicas[i]]))

      const ctx = canvas.getContext('2d')
      const F = (peso, px) => `${peso} ${px}px Inter, system-ui, sans-serif`

      // --- fondo espacial ---
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#070a13'
      ctx.fillRect(0, 0, W, H)
      for (const [cx, cy, r, alfa] of [
        [W * 0.85, H * 0.1, 500, 0.16],
        [W * 0.05, H * 0.9, 420, 0.12],
      ]) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, `rgba(59, 109, 240, ${alfa})`)
        g.addColorStop(1, 'rgba(59, 109, 240, 0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }
      const rand = mulberry32(20241206)
      for (let i = 0; i < 260; i++) {
        const x = rand() * W
        const y = rand() * H
        const r = rand() * 1.3 + 0.3
        ctx.fillStyle = `rgba(231, 236, 245, ${0.15 + rand() * 0.55})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // --- pincelada azul detrás del título ---
      ctx.save()
      ctx.translate(W / 2, 132)
      ctx.rotate(-0.12)
      ctx.strokeStyle = 'rgba(59, 109, 240, 0.5)'
      ctx.shadowColor = brand
      ctx.shadowBlur = 40
      for (const [rx, ry, lw, a0, a1] of [
        [300, 86, 26, -2.7, 0.7],
        [318, 104, 13, 0.9, 3.1],
        [272, 74, 8, 2.3, 4.2],
      ]) {
        ctx.beginPath()
        ctx.lineWidth = lw
        ctx.ellipse(0, 0, rx, ry, 0, a0, a1)
        ctx.stroke()
      }
      ctx.restore()

      // --- textos del encabezado ---
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = ink
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
      ctx.shadowBlur = 14
      let pxTitulo = 64
      ctx.font = F(900, pxTitulo)
      while (pxTitulo > 30 && ctx.measureText(evento.toUpperCase()).width > W - 2 * M) {
        pxTitulo -= 2
        ctx.font = F(900, pxTitulo)
      }
      ctx.fillText(evento.toUpperCase(), W / 2, 140)
      ctx.font = F(700, 32)
      ctx.fillText(fecha, W / 2, 190)

      if (jugador) {
        ctx.font = F(800, 50)
        ctx.fillText(`👑 ${jugador}`, W / 2, 272)
      }
      if (resultado) {
        ctx.fillStyle = muted
        ctx.font = F(700, 34)
        if ('letterSpacing' in ctx) ctx.letterSpacing = '8px'
        ctx.fillText(resultado.toUpperCase(), W / 2, 322)
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
      }
      ctx.shadowBlur = 0

      // --- helpers de la grilla ---
      function panel(x, y, w, h) {
        ctx.fillStyle = 'rgba(13, 16, 24, 0.72)'
        ctx.strokeStyle = borde
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, 10)
        ctx.fill()
        ctx.stroke()
      }
      function carta(id, x, y, w, h) {
        const img = imgPorId.get(id)
        if (img) {
          ctx.drawImage(img, x, y, w, h)
        } else {
          ctx.fillStyle = surface2
          ctx.strokeStyle = borde
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(x, y, w, h, 4)
          ctx.fill()
          ctx.stroke()
          ctx.font = `${Math.round(h * 0.35)}px system-ui`
          ctx.textAlign = 'center'
          ctx.fillText('🃏', x + w / 2, y + h * 0.62)
        }
      }
      // Dibuja una sección (etiqueta + grilla) y devuelve la y siguiente.
      function seccion(ids, x, y, porFila, cardW, etiqueta, etiquetaDer) {
        if (!ids.length) return y
        const gap = porFila === 10 ? 4 : 3
        const cardH = Math.round(cardW * 1.459)
        const filas = Math.ceil(ids.length / porFila)
        ctx.textAlign = 'left'
        ctx.fillStyle = muted
        ctx.font = F(600, 20)
        ctx.fillText(etiqueta, x + 2, y + 18)
        if (etiquetaDer) {
          ctx.textAlign = 'right'
          ctx.fillText(etiquetaDer, x + IZQ_W - 2, y + 18)
        }
        y += 30
        const altoGrilla = filas * (cardH + gap) - gap
        panel(x - 10, y - 10, IZQ_W + 20, altoGrilla + 20)
        ids.forEach((id, i) => {
          carta(
            id,
            x + (i % porFila) * (cardW + gap),
            y + Math.floor(i / porFila) * (cardH + gap),
            cardW,
            cardH,
          )
        })
        return y + altoGrilla + 34
      }

      // --- grillas del mazo ---
      const deckTop = 360
      let y = deckTop
      const etiquetaStats = stats
        ? `Monster: ${stats.monster}   Spell: ${stats.spell}   Trap: ${stats.trap}`
        : ''
      y = seccion(deck.main, M, y, 10, 62, `Main Deck: ${deck.main.length}`, etiquetaStats)
      y = seccion(deck.extra, M, y, 15, 41, `Extra Deck: ${deck.extra.length}`)
      y = seccion(deck.side, M, y, 15, 41, `Side Deck: ${deck.side.length}`)

      // --- carta destacada (columna derecha) ---
      const fx = M + IZQ_W + 24
      const fw = W - M - fx
      if (imgDestacada) {
        const fh = Math.round(fw * 1.459)
        ctx.save()
        ctx.shadowColor = brand
        ctx.shadowBlur = 34
        ctx.drawImage(imgDestacada, fx, deckTop + 30, fw, fh)
        ctx.restore()
        if (imgLogo) {
          const lw = 150
          const lh = (imgLogo.height / imgLogo.width) * lw
          ctx.drawImage(imgLogo, fx + fw / 2 - lw / 2, deckTop + 30 + fh + 36, lw, lh)
        }
      }

      // --- pie ---
      if (imgYgo) {
        const lh = 84
        const lw = (imgYgo.width / imgYgo.height) * lh
        ctx.drawImage(imgYgo, W / 2 - lw / 2, H - 150, lw, lh)
      }
      ctx.textAlign = 'center'
      ctx.fillStyle = muted
      ctx.font = F(600, 22)
      ctx.fillText(`${config.storeName} · ${config.instagramUser}`, W / 2, H - 32)
    }

    dibujar()
  }, [deck, cartas, stats, evento, fecha, jugador, resultado, destacadaId])

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
                  className="w-full max-w-135 rounded-xl border border-[var(--color-border)]"
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
