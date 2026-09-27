import { defineConfig } from 'vitest/config';

// Pruebas de firestore.rules contra el emulador (las lanza `pnpm test:reglas`).
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 20000, fileParallelism: false },
});
