import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rename } from 'fs/promises'
import { resolve } from 'path'

const WIDGET = 'nss-demo'

const renameCssPlugin = () => ({
  name: 'rename-css',
  closeBundle: async () => {
    const outDir = resolve(__dirname, '../../public/js/react')
    try { await rename(`${outDir}/style.css`, `${outDir}/${WIDGET}.css`) } catch {}
  }
})

export default defineConfig({
  plugins: [react(), renameCssPlugin()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    lib: {
      entry: `src/${WIDGET}/main.jsx`,
      name: 'NssDemoWidget',
      fileName: () => `${WIDGET}.js`,
      formats: ['iife']
    },
    outDir: '../../public/js/react',
    emptyOutDir: false
  }
})
