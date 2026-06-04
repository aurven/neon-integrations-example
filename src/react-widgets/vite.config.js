import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.jsx',
      name: 'NeonGridWidget',
      fileName: () => 'neon-grid-widget.js',
      formats: ['iife']
    },
    outDir: '../../public/js/react',
    emptyOutDir: false,
    cssFileName: 'neon-grid-widget'
  }
})
