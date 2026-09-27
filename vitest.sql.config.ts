import { defineConfig } from 'vitest/config';

// Pruebas SQL (esquema, RLS y RPC) con PGlite: `pnpm test:sql`. Cada archivo levanta su propia base.
export default defineConfig({
  test: {
    include: ['tests/sql/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
