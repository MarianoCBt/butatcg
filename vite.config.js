import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// base: en build usamos rutas relativas para que funcione publicado en una
// subcarpeta (GitHub Pages: /usuario.github.io/<repo>/). En dev queda en '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
}))
