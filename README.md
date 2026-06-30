# ButaTCG

Aplicación web personal para compra/venta de Yu-Gi-Oh!: catálogo y carrito (sin
pago online). El pedido se envía por WhatsApp y el pago se coordina por
transferencia. El **stock se administra desde una planilla de Google privada**
(ver [GUIA-PLANILLA.md](GUIA-PLANILLA.md)); el público solo lee el catálogo.

**🌐 Sitio online:** https://marianocbt.github.io/butatcg/

## Publicar cambios (GitHub Pages)

El sitio se publica solo. Cada vez que subís cambios a la rama `main`, un
workflow de GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))
compila y publica en ~1-2 min.

```bash
git add -A
git commit -m "descripción del cambio"
git push
```

Para actualizar el stock no hace falta tocar el código: editás la planilla de
Google y el sitio se actualiza solo (ver [GUIA-IMPORTAR.md](GUIA-IMPORTAR.md)).

## Cómo usarla

```bash
npm install      # solo la primera vez
npm run dev      # desarrollo -> http://localhost:5173
npm run build    # versión optimizada en /dist
npm run preview  # previsualizar la build
```

## Configuración

Editá `src/config.js`:

- **`stockSheetCsvUrl`**: link de tu planilla de Google publicada como CSV
  (paso a paso en [GUIA-PLANILLA.md](GUIA-PLANILLA.md)). Si lo dejás vacío, se
  muestran datos de ejemplo.
- **`whatsappNumber`**: tu número en formato internacional sin `+`, espacios ni
  guiones. Ej. Argentina `11-2345-6789` → `5491123456789`.
- **`payment`**: alias / CBU / titular que se muestran para transferir.
- **`refreshMinutes`**, **`storeName`**, **`tagline`**, moneda, etc.

## Cómo funciona

- **Catálogo**: navegar, buscar y filtrar por categoría; agregar al carrito. El
  stock se lee de la planilla (con caché local y refresco automático).
- **Preventa / Accesorios** (menús del header): se arman solos según las
  columnas `expansion` y `subtipo` de la planilla.
- **Carrito**: ajustar cantidades, cargar datos del cliente y enviar el pedido
  por WhatsApp con el listado y el total ya armados.

El stock viene de Google Sheets (privado para editar, público solo lectura). El
carrito se guarda en el navegador del visitante (`localStorage`).

## Próximas etapas (pendientes)

1. Importar precios desde las páginas proveedoras con cálculos/márgenes.
2. Historial de pedidos / panel de ventas.
