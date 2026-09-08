import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    // Must NOT be 'frontend'. That folder holds the live hand-written app
    // (index.html, app.js, styles.css) served by FastAPI; with emptyOutDir
    // a build there deletes the running application.
    outDir: 'dist-react',
    emptyOutDir: true
  }
})

