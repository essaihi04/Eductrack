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
        // NE PAS découper les bibliothèques liées à React (recharts/d3, leaflet,
        // framer-motion, supabase, router…) : leurs dépendances croisées créent
        // des cycles entre chunks et l'app plante au chargement avec
        // « Cannot access 'X' before initialization ». Seules les libs feuilles,
        // déjà chargées à la demande, sont isolées.
        manualChunks: {
          'jspdf': ['jspdf', 'jspdf-autotable']
        }
      }
    }
  }
})
