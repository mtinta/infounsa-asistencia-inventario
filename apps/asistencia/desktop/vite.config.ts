import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5174
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-vendor'
          }
          if (id.includes('node_modules/html5-qrcode')) {
            return 'scanner-vendor'
          }
        }
      }
    }
  }
})
