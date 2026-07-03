// =====================================================================
//  CONFIGURACIÓN DE LA TIENDA
//  Editá estos valores con los datos reales de tu negocio.
// =====================================================================

export const config = {
  // Nombre que aparece en el encabezado
  storeName: 'ButaTCG',
  tagline: 'Compra y venta de Yu-Gi-Oh!',

  // Logo (archivo dentro de /public). Si no existe, se muestra un emoji.
  logo: import.meta.env.BASE_URL + 'logo.png',

  // Número de WhatsApp al que llegan los pedidos.
  // Formato internacional SIN "+", sin espacios ni guiones.
  // Ejemplo Argentina: 54 + 9 + código de área sin 0 + número.
  //   Para 11-2345-6789  ->  '5491123456789'
  whatsappNumber: '5491150579543',

  // Link externo a la sección de Torneos
  torneosUrl: 'https://l4gash.github.io/buta-tcg-web/index.html',

  // Instagram de la tienda
  instagramUrl: 'https://www.instagram.com/butatcg/',
  instagramUser: '@butatcg',

  // -------------------------------------------------------------------
  //  BANNER decorativo (imagen, arriba de todo). Cambiá la imagen cuando
  //  salga una preventa nueva. Poné activo: false para ocultarlo.
  //  - imagen: URL de la imagen, o '/archivo.webp' si la subís a public/.
  //  Alto del banner: ~96px (celular) / ~128px (tablet) / ~160px (escritorio).
  // -------------------------------------------------------------------
  banner: {
    activo: true,
    imagen:
      'https://i.imgur.com/nwBj2Z4.jpeg',
    alt: 'Nueva preventa',
  },

  // -------------------------------------------------------------------
  //  FUENTE DE STOCK (Google Sheets publicado como CSV)
  //  Podés usar UNA o VARIAS hojas (ej: accesorios / preventas y pedidos /
  //  stock inmediato). El sitio las junta todas en un solo catálogo.
  //
  //  Cómo obtener el link de CADA hoja:
  //   1) Abrí tu planilla en Google Sheets.
  //   2) Archivo → Compartir → Publicar en la web.
  //   3) En el desplegable elegí LA HOJA (no "Todo el documento"),
  //      formato "Valores separados por comas (.csv)".
  //   4) Publicar → copiá el link y agregalo a la lista de abajo.
  //      Cada hoja tiene su propio link (cambia el "gid=").
  //  La planilla queda privada para editar; sólo se publica una vista
  //  de SÓLO LECTURA. Si la lista queda vacía, se muestran datos de ejemplo.
  // -------------------------------------------------------------------
  stockSheetCsvUrls: [
    // Stock inmediato
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vREo5RxJcY3C9pCaOhwM6fqOvfQvV25t5v4Y0Dg0bDv2eyHhHZGY7y7sqh7wl1nJQ/pub?gid=936437257&single=true&output=csv',
    // Preventas y pedidos
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vREo5RxJcY3C9pCaOhwM6fqOvfQvV25t5v4Y0Dg0bDv2eyHhHZGY7y7sqh7wl1nJQ/pub?gid=1984966268&single=true&output=csv',
    // Accesorios
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vREo5RxJcY3C9pCaOhwM6fqOvfQvV25t5v4Y0Dg0bDv2eyHhHZGY7y7sqh7wl1nJQ/pub?gid=516287969&single=true&output=csv',
  ],

  // Cada cuánto refrescar el stock automáticamente (minutos)
  refreshMinutes: 10,

  // Moneda usada para mostrar precios
  currency: 'ARS',
  locale: 'es-AR',

  // Datos para mostrar al cliente al momento de transferir
  payment: {
    alias: 'BUTATCG',
    cbu: '0000177507951004303651',
    titular: 'Mariano Fernando Castro Beltramini',
    banco: 'Astro Pay / Conexion De Altura Sa',
  },
}

// Categorías de productos disponibles en el sistema
export const CATEGORIES = [
  { id: 'carta', label: 'Cartas' },
  { id: 'sellado', label: 'Productos sellados' },
  { id: 'accesorio', label: 'Accesorios' },
]
