// Carga un módulo TypeScript de src/ desde Node con el ejecutor de módulos de Vite (sin compilar aparte).
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

/** Raíz del repo (con / al final). */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** `path` desde la raíz del repo, p. ej. '/src/components/splash/brand.ts'. */
export async function loadTs(path) {
  const { module } = await runnerImport(path, { configFile: false, logLevel: 'silent', root: ROOT });
  return module;
}
