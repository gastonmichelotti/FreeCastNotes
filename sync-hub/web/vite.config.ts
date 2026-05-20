import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  define: {
    'import.meta.env.VITE_HUB_URL': JSON.stringify(
      process.env.VITE_HUB_URL ?? ''
    ),
  },
})
