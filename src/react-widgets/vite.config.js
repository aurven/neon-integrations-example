import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rename } from 'fs/promises'
import { resolve } from 'path'

// Vite 5.4 IIFE lib builds ignore cssFileName; this plugin renames style.css post-build.
const renameCssPlugin = () => ({
  name: 'rename-css',
  closeBundle: async () => {
    const outDir = resolve(__dirname, '../../public/js/react')
    try {
      await rename(`${outDir}/style.css`, `${outDir}/neon-grid-widget.css`)
    } catch {
      // file may already be named correctly
    }
  }
})

export default defineConfig({
  plugins: [react(), renameCssPlugin()],
  build: {
    lib: {
      entry: 'src/main.jsx',
      name: 'NeonGridWidget',
      fileName: () => 'neon-grid-widget.js',
      formats: ['iife']
    },
    outDir: '../../public/js/react',
    emptyOutDir: false
  }
})
