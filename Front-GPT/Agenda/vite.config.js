import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/agenda': { target: process.env.SGR_API_URL || 'http://127.0.0.1:8765', changeOrigin: true }
    }
  }
})
