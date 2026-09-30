import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Puerto 5273 para no chocar con el Vite del frontend original (:5173).
// Todo lo que empiece con /api va por proxy a la API de SGR (:8765), así el
// browser nunca hace cross-origin y no dependemos del CORS del backend.
export default defineConfig(({ mode }) => {
  const target = process.env.SGR_API || 'http://127.0.0.1:8765'
  return {
    plugins: [react()],
    server: {
      port: Number(process.env.SGR_UI_PORT) || 5273,
      strictPort: false,
      proxy: {
        '/api': { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        '/uploads': { target, changeOrigin: true },
      },
    },
    build: { outDir: 'dist', sourcemap: mode !== 'production', chunkSizeWarningLimit: 900 },
  }
})
