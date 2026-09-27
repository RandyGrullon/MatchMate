// Migración de BowlingX (Firebase) a MatchMate (Supabase). Paso a paso en docs/migracion.md.
//
//   node scripts/migrar/cli.mjs exportar --cuenta-servicio <cuenta.json> --salida <carpeta>
//   node scripts/migrar/cli.mjs probar-clave --auth users.json --hash hash.txt --correo tu@correo.com
//   node scripts/migrar/cli.mjs importar --datos <carpeta> --auth users.json --hash hash.txt [--destino supabase]
//   node scripts/migrar/cli.mjs torneo <archivo.json> --liga <id> [--reemplazar]
//
// Carga los .ts con el ejecutor de módulos de Vite (como scripts/icons/load-ts.mjs): no hay que compilar nada.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { module } = await runnerImport('/scripts/migrar/main.ts', { configFile: false, logLevel: 'silent', root: ROOT });
const code = await module.main(process.argv.slice(2), { root: ROOT });
// Sale de una vez (supabase-js deja temporizadores abiertos).
process.exit(code);
