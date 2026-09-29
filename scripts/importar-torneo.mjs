// Carga un torneo histórico (JSON sacado del Excel) dentro de una liga de MatchMate.
// Los juegos quedan anotados sin foto ("sin-foto"): "importado" solo lo escribe el importador de BowlingX.
//
//   node scripts/importar-torneo.mjs scripts/datos/torneo-2025.json --liga <id-de-la-liga> [--reemplazar]
//
// El id de la liga es el uuid que sale en el link: <app>/l/<id>.
// Pide el correo y la contraseña de un admin de esa liga en la terminal (no se guardan); o MM_EMAIL y MM_PASSWORD.
// Usa el proyecto de Supabase de .env.local (VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY).
//
// Ahora vive en scripts/migrar/torneo.ts (con las RPC de Supabase); esto es el mismo comando de antes:
// node scripts/migrar/cli.mjs torneo <archivo.json> --liga <id> [--reemplazar]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./migrar/cli.mjs', import.meta.url));
const r = spawnSync(process.execPath, [cli, 'torneo', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
