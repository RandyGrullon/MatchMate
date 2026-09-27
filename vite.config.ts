import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: la app queda guardada en el teléfono (abre al instante y sin conexión)
    // y avisa cuando hay una versión nueva. El manifiesto vive en public/manifest.webmanifest.
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        // Notificaciones: push de los recordatorios y abrir la app al tocarlas.
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fuentes', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: {
    // Firebase pesa ~600 kB; va en su propio archivo para que el navegador lo guarde entre versiones.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: 'firebase', test: /node_modules[\/](@firebase|firebase)[\/]/ }],
        },
      },
    },
  },
});
