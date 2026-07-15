import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
      manifest: {
        name: 'Bóveda — Sistema de Guardado Rápido',
        short_name: 'Bóveda',
        description: 'Capturá, organizá y recuperá tus ideas.',
        theme_color: '#0f0520',
        background_color: '#0f0520',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        share_target: {
          action: '/capture',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { text: 'text', url: 'url', title: 'title' },
        },
      },
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
