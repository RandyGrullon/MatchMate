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
  // PGlite (Postgres en el navegador, solo para el modo local de desarrollo y demo) trae su propio WASM.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            // Cada uno en su archivo: el navegador lo guarda entre versiones, y PGlite solo se baja en modo local.
            { name: 'supabase', test: /node_modules[\/]@supabase[\/]/ },
            { name: 'pglite', test: /node_modules[\/]@electric-sql[\/]pglite[\/]/ },
            { name: 'firebase', test: /node_modules[\/](@firebase|firebase)[\/]/ },
          ],
        },
      },
    },
  },
});
