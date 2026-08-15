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
    // Sourcemaps DÉSACTIVÉES par défaut : elles pesaient ~18 Mo et faisaient
    // dépasser la limite de tas de Node sur le VPS (« JavaScript heap out of
    // memory » pendant « rendering chunks »). Pour les régénérer ponctuellement :
    // VITE_SOURCEMAP=true npm run build
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    rollupOptions: {
      output: {
        // Découpage des grosses dépendances : réduit le pic mémoire du build et
        // évite un bundle principal de plusieurs Mo rechargé à chaque déploiement.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('jspdf')) return 'jspdf';
          if (id.includes('exceljs')) return 'exceljs';
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('html2canvas')) return 'html2canvas';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('leaflet')) return 'leaflet';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router')) return 'router';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
        }
      }
    }
  }
})
