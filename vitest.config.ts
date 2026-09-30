import { defineConfig } from 'vitest/config';

// Pruebas unitarias. La base de datos (SQL y RLS en PGlite) se prueba aparte con `pnpm test:sql`.
export default defineConfig({
  // 20 s: con cientos de archivos en paralelo, las que cargan módulos pesados (jspdf, exceljs, pantallas grandes) pasaban
  // de los 5 s de siempre y fallaban a veces sin estar mal.
  test: { include: ['src/**/*.test.ts'], testTimeout: 20_000 },
});
