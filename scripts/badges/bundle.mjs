// Empaqueta el motor de las insignias para la Edge Function `insignias` (Deno), docs/insignias.md §3.1.
//
//   pnpm badges:bundle             escribe supabase/functions/_shared/badges-engine.gen.js (y su .d.ts)
//   pnpm badges:bundle --check     solo revisa que esté al día (sale con 1 si no)
//
// Deno exige la extensión en los imports y el tsc de la app no la acepta, así que el motor (src/badges/edge.ts y todo
// lo que importa: catálogo, reglas, evaluadores y los helpers de src/lib y src/sports) va en un solo ESM sin imports.
// Usa rolldown, el empaquetador que ya trae Vite (no hay que instalar nada). La cabecera guarda el hash de todo el
// código fuente que entra (y de este script); src/badges/bundle.test.ts lo recalcula y falla si el archivo quedó
// viejo. Cada vez que cambia el motor: `pnpm badges:bundle`, y se sube el archivo generado con el cambio.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Raíz del repo (con / al final). */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ENTRY = 'src/badges/edge.ts';
export const OUT_JS = 'supabase/functions/_shared/badges-engine.gen.js';
export const OUT_DTS = 'supabase/functions/_shared/badges-engine.gen.d.ts';
/** Lo que exporta el archivo generado. */
export const EXPORTS = ['SOURCE_HASH', 'evaluateJob', 'pushLabel', 'withPushLabels'];
const SELF = 'scripts/badges/bundle.mjs';

/** Tipos del archivo generado. Sueltos (sin importar src/badges): Deno los lee por `@ts-self-types`. */
export const DTS = `// GENERADO por scripts/badges/bundle.mjs (pnpm badges:bundle): no se edita a mano.
// Tipos de badges-engine.gen.js. Los completos están en src/badges (types.ts, snapshot.ts); aquí van sueltos para
// que Deno no tenga que importar nada.

/** Una decisión del motor (BadgeDecision de src/badges/types.ts): plana, como la lee private.badge_apply. */
export interface EngineDecision {
  kind: 'award' | 'review' | 'revoke' | 'progress' | 'adopt';
  badge_key: string;
  sport: string;
  player_id: string | null;
  user_id: string | null;
  league_id: string | null;
  [key: string]: unknown;
}

/** Hash del código fuente con que se generó (el mismo de la cabecera). */
export declare const SOURCE_HASH: string;
/** evaluate(job, snapshot, now) con los nombres para el push (context.name y context.level_name). */
export declare function evaluateJob(job: unknown, snapshot: unknown, now?: number | string): EngineDecision[];
export declare function withPushLabels(decisions: readonly EngineDecision[]): EngineDecision[];
export declare function pushLabel(decision: EngineDecision): { name: string; level_name?: string } | null;
`;

const lf = (text) => text.replace(/\r\n?/g, '\n');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const posix = (path) => path.split(sep).join('/');

/** rolldown, el de Vite (con pnpm no está en la raíz de node_modules). */
async function loadRolldown() {
  const fromRoot = createRequire(join(ROOT, 'package.json'));
  const entry = createRequire(fromRoot.resolve('vite')).resolve('rolldown');
  return import(pathToFileURL(entry).href);
}

/**
 * Hash del código fuente: cada archivo del grafo (ruta relativa y su contenido con saltos de línea LF, así da lo
 * mismo en Windows y en Linux) y este script. Un archivo nuevo o que se deja de importar cambia el grafo, y para eso
 * tuvo que cambiar otro que ya estaba: el hash lo ve siempre.
 */
export function sourceHash(files) {
  const lines = [...files]
    .map(({ path, text }) => `${path}\0${sha256(lf(text))}`)
    .sort()
    .join('\n');
  return `sha256-${sha256(lines)}`;
}

/** Las líneas de la cabecera: `// fuente: sha256-…` y `// salida: sha256-…`. */
export function headerHashes(text) {
  return {
    source: /^\/\/ fuente: (sha256-[0-9a-f]{64})/m.exec(text)?.[1] ?? null,
    output: /^\/\/ salida: (sha256-[0-9a-f]{64})/m.exec(text)?.[1] ?? null,
  };
}

/** El código después de la cabecera (lo que cubre `salida`). */
export const bodyOf = (text) => lf(text).split('\n// ---\n').slice(1).join('\n// ---\n');

/**
 * Empaqueta en memoria. Devuelve {js, dts, sourceHash, modules}: `js` es el archivo completo (cabecera + código).
 * Falla si algo del grafo viene de node_modules, si queda un import o si sale más de un archivo.
 */
export async function buildEngine() {
  const { rolldown } = await loadRolldown();
  const graph = [];
  const warnings = [];
  const bundle = await rolldown({
    input: join(ROOT, ENTRY),
    cwd: ROOT,
    platform: 'neutral',
    logLevel: 'warn',
    onLog: (level, log) => warnings.push(`${level}: ${log.message}`),
    plugins: [
      {
        name: 'mm-grafo',
        buildEnd() {
          graph.push(...this.getModuleIds());
        },
      },
    ],
  });
  let output;
  try {
    ({ output } = await bundle.generate({ format: 'esm' }));
  } finally {
    await bundle.close();
  }
  if (warnings.length) throw new Error(`rolldown avisó:\n${warnings.join('\n')}`);
  if (output.length !== 1 || output[0].type !== 'chunk') throw new Error(`Salió más de un archivo: ${output.map((o) => o.fileName).join(', ')}`);
  const chunk = output[0];
  if (chunk.imports.length || chunk.dynamicImports.length) throw new Error(`El motor importa algo: ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}`);

  const files = [{ path: SELF, text: readFileSync(join(ROOT, SELF), 'utf8') }];
  for (const id of graph) {
    if (!isAbsolute(id)) throw new Error(`Módulo sin archivo en el grafo: ${id}`);
    const path = posix(relative(ROOT, id));
    if (path.startsWith('..') || path.includes('node_modules/')) throw new Error(`El motor no puede usar dependencias: ${path}`);
    files.push({ path, text: readFileSync(id, 'utf8') });
  }
  const hash = sourceHash(files);
  const body = `${lf(chunk.code).trimEnd()}\nexport const SOURCE_HASH = ${JSON.stringify(hash)};\n`;
  if (/^\s*import[\s{*'"]|\bimport\s*\(|\brequire\s*\(/m.test(body)) throw new Error('El motor empaquetado todavía importa algo.');
  const header = [
    '// @ts-self-types="./badges-engine.gen.d.ts"',
    '// GENERADO por scripts/badges/bundle.mjs (pnpm badges:bundle): no se edita a mano.',
    `// El motor de las insignias (${ENTRY} y lo que importa: ${graph.length} archivos) en un solo ESM sin imports para la`,
    '// Edge Function supabase/functions/insignias (Deno). src/badges/bundle.test.ts falla si quedó viejo.',
    `// fuente: ${hash}`,
    `// salida: sha256-${sha256(body)}`,
    '// ---',
  ].join('\n');
  return { js: `${header}\n${body}`, dts: DTS, sourceHash: hash, modules: graph.length };
}

/**
 * Lo que dice el archivo que está en el repo frente a lo que saldría ahora. Además de las dos líneas de la cabecera,
 * compara el código con el que sale hoy: un cambio de rolldown, de Vite o de la configuración cambia el paquete sin
 * tocar src, y entonces Deno correría otro código que el que prueba Vitest.
 */
export function staleness(fresh, current = existsSync(join(ROOT, OUT_JS)) ? readFileSync(join(ROOT, OUT_JS), 'utf8') : null) {
  if (current === null) return `falta ${OUT_JS}`;
  const { source, output } = headerHashes(current);
  if (source !== fresh.sourceHash) return `${OUT_JS} es de otro código (cabecera ${source ?? 'sin hash'}, ahora ${fresh.sourceHash})`;
  if (output !== `sha256-${sha256(bodyOf(current))}`) return `${OUT_JS} se editó a mano (la salida no es la de la cabecera)`;
  if (bodyOf(current) !== bodyOf(fresh.js)) return `${OUT_JS} no es lo que empaqueta hoy (otra versión de rolldown o de la configuración)`;
  const dts = existsSync(join(ROOT, OUT_DTS)) ? lf(readFileSync(join(ROOT, OUT_DTS), 'utf8')) : null;
  if (dts !== fresh.dts) return `${OUT_DTS} no está al día`;
  return null;
}

async function main(args) {
  const fresh = await buildEngine();
  if (args.includes('--check')) {
    const problem = staleness(fresh);
    if (problem) {
      console.error(`Motor de insignias viejo: ${problem}. Corre: pnpm badges:bundle`);
      return 1;
    }
    console.log(`Motor de insignias al día (${fresh.sourceHash}).`);
    return 0;
  }
  writeFileSync(join(ROOT, OUT_JS), fresh.js);
  writeFileSync(join(ROOT, OUT_DTS), fresh.dts);
  console.log(`${OUT_JS}: ${fresh.modules} archivos, ${Math.round(fresh.js.length / 1024)} KB, ${fresh.sourceHash}`);
  return 0;
}

// Solo cuando se corre como programa (la prueba lo importa).
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
