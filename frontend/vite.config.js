import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['jspdf', 'jspdf-autotable'],
    force: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'jspdf': ['jspdf', 'jspdf-autotable']
        }
      }
    }
  }
})
