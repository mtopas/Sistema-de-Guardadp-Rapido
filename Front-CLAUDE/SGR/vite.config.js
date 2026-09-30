import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// El frontend habla con la API de SGR a través de un proxy en `/api`, así no
// depende de la lista de orígenes CORS del backend. Destino configurable con
// SGR_API_TARGET (default: API local en :8765).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.SGR_API_TARGET || 'http://127.0.0.1:8765'
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api/, ''),
    },
  }
  return {
    plugins: [react()],
    server: { port: Number(env.SGR_FRONT_PORT || 5180), proxy },
    preview: { port: Number(env.SGR_FRONT_PORT || 5180), proxy },
    build: { chunkSizeWarningLimit: 900 },
  }
})
