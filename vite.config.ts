import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3001,
    host: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/android/**', '**/ios/**'],
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
  },
})
