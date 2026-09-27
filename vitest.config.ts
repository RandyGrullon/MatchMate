import { defineConfig } from 'vitest/config';

// Pruebas unitarias (sin Firebase). Las reglas se prueban aparte con `pnpm test:reglas`.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
