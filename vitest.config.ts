import { defineConfig } from 'vitest/config';

// Pruebas unitarias. La base de datos (SQL y RLS en PGlite) se prueba aparte con `pnpm test:sql`.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
