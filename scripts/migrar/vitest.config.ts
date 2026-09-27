import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas de la migración de BowlingX: `npx vitest run -c scripts/migrar/vitest.config.ts`.
// Las que cargan PGlite con las migraciones de verdad tardan unos segundos cada archivo.
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  test: {
    include: ['scripts/migrar/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
