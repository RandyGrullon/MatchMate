/**
 * Lógica de la Edge Function purge-photos, en TypeScript puro y SIN imports (Deno exige la extensión `.ts` en las
 * rutas y el tsc de la app no la acepta). index.ts la conecta con Deno.serve y le pasa lo que comparte con send-push
 * (el secreto comparado completo, la clave secreta y la API REST de send-push/core.ts). Pruebas:
 * src/lib/purgePhotosFunction.test.ts (Vitest); las RPC, con la base de verdad, en tests/sql/avisos-telefono.test.ts.
 *
 * Cada llamada (la hace pg_net una vez al día desde el cron 'mm-limpiar-fotos', 20260929000510_avisos_telefono_supabase.sql):
 * 1. exige la cabecera `x-cron-secret` igual al secreto CRON_SECRET (el mismo que está en Vault como 'cron_secret');
 *    la función va con verify_jwt = false;
 * 2. vacía private.storage_purge_queue bucket por bucket (`purge_queue_take` y `purge_queue_done`, solo service_role):
 *    primero 'scoreboards' (fotos borradas, también al borrar un evento o una liga) y después 'logos' (el logo cambiado
 *    o quitado, el de una liga borrada, las reservas sin usar; 20260929001000_sueltos_logos.sql). De cada uno toma
 *    hasta 500 rutas, las borra de ESE bucket con la API de Storage (de a 100) y las saca de la cola. Las de un grupo
 *    que Storage no aceptó se quedan: se vuelven a tomar al otro día (a los 10 intentos la base deja de darlas). Las
 *    fotos se piden sin `p_bucket` (la base lo pone en 'scoreboards'): así sirve igual con una base de antes de 001000;
 *    ahí la llamada de los logos falla (se registra) y las fotos se borran igual;
 * 3. pide los archivos huérfanos (`storage_orphans`: en 'scoreboards' hace más de 30 días y sin fila en photos) y los
 *    borra. Los logos no tienen huérfanos: cada subida se reserva antes y lo que no se usa entra a la cola.
 *
 * El registro va en JSON (una línea por cosa que pasó y el resumen al final), solo con números: nunca rutas ni ids.
 */

/** El bucket de las fotos del marcador (20260926001100_storage_supabase.sql). */
export const BUCKET = 'scoreboards';
/** El bucket público de los logos de las ligas (20260929001010_logos_supabase.sql). */
export const LOGOS_BUCKET = 'logos';
/** Los buckets de la cola, en el orden en que se vacían (la cola dice de cuál es cada ruta). */
export const PURGE_BUCKETS = [BUCKET, LOGOS_BUCKET] as const;
export type PurgeBucket = (typeof PURGE_BUCKETS)[number];
/** Rutas por llamada, de la cola y de huérfanos (la base da de 1 a 1000). */
export const TAKE_LIMIT = 500;
/** Rutas por cada DELETE a Storage. */
export const REMOVE_CHUNK = 100;
/** Letras de una ruta como mucho (las de la app: '<liga>/<foto>.webp', unas 80). */
const MAX_PATH = 512;

/** El cliente REST de send-push/core.ts (createRestClient). */
export interface RestClient {
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

/** Lo que se comparte con send-push (send-push/core.ts); aquí no se puede importar nada. */
export interface SharedHelpers {
  sameSecret(given: string, expected: string): boolean;
  secretKey(env: (name: string) => string | undefined): string | null;
  createRestClient(url: string, key: string, fetchFn: typeof fetch): RestClient;
}

export interface PurgeDeps {
  env(name: string): string | undefined;
  fetch: typeof fetch;
  shared: SharedHelpers;
  log?(line: string): void;
}

/** Lo que devuelve cada llamada (y lo que va al registro). */
export interface PurgeCounts {
  /** Rutas tomadas de la cola (de los dos buckets). */
  queued: number;
  /** De esas, borradas de su bucket (o que ya no estaban) y sacadas de la cola. */
  purged: number;
  /** De las borradas, cuántas eran logos. */
  logos: number;
  /** Huérfanos que dio la base. */
  orphans: number;
  /** De esos, borrados del bucket. */
  orphansRemoved: number;
  /** Rutas que Storage no aceptó (se reintentan) o que no se mandaron por raras. */
  failed: number;
}

export class StorageError extends Error {
  constructor(readonly status: number | null) {
    super(`storage: ${status == null ? 'sin respuesta' : `HTTP ${status}`}`);
    this.name = 'StorageError';
  }
}

export interface StorageClient {
  /** Borra estas rutas del bucket. Las que ya no existen no son error. Lanza StorageError si Storage no lo aceptó. */
  remove(bucket: string, paths: string[]): Promise<void>;
}

/**
 * La API de Storage con la clave secreta (salta las políticas del bucket), sin supabase-js: `DELETE
 * /storage/v1/object/<bucket>` con `{prefixes: [...]}`, lo mismo que hace `storage.from(bucket).remove(paths)`. Las
 * claves nuevas (`sb_secret_…`) van solo en `apikey`; la vieja (un JWT) también en Authorization, como en send-push.
 */
export function createStorageClient(url: string, key: string, fetchFn: typeof fetch): StorageClient {
  const base = `${url.replace(/\/+$/, '')}/storage/v1/object/`;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) headers.Authorization = `Bearer ${key}`;
  return {
    async remove(bucket, paths) {
      let res: Response;
      try {
        res = await fetchFn(base + encodeURIComponent(bucket), { method: 'DELETE', headers, body: JSON.stringify({ prefixes: paths }) });
      } catch {
        throw new StorageError(null);
      }
      // Se lee la respuesta para soltar la conexión (trae los objetos borrados; no hace falta).
      await res.text().catch(() => '');
      if (!res.ok) throw new StorageError(res.status);
    },
  };
}

/** ¿Se puede mandar a Storage? '<liga>/<foto>.webp' y parecidas; nunca vacía, con '/' al principio, '..' o control. */
export function isSafePath(path: unknown): path is string {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH) return false;
  if (path.startsWith('/') || path.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return !path.split('/').some((part) => part === '' || part === '.' || part === '..');
}

/** Filas `{path}` de la base (returns table) → rutas únicas y seguras, en orden. Lo demás cuenta como raro. */
export function pathsOf(rows: unknown): { paths: string[]; skipped: number } {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of list) {
    const path = row && typeof row === 'object' ? (row as { path?: unknown }).path : row;
    if (!isSafePath(path)) skipped++;
    else seen.add(path);
  }
  return { paths: [...seen], skipped };
}

export function chunk<T>(items: readonly T[], size = REMOVE_CHUNK): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, Math.floor(size));
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * Borra `paths` del bucket (`bucket`, las fotos si no se dice) de a `size`, un grupo a la vez. Devuelve las que
 * salieron bien y cuántas no. Nunca lanza: un grupo que falla no frena a los demás.
 */
export async function removeInChunks(
  storage: StorageClient,
  paths: readonly string[],
  size = REMOVE_CHUNK,
  bucket: PurgeBucket = BUCKET,
): Promise<{ removed: string[]; failed: number; statuses: (number | null)[] }> {
  const removed: string[] = [];
  const statuses: (number | null)[] = [];
  let failed = 0;
  for (const group of chunk(paths, size)) {
    try {
      await storage.remove(bucket, group);
      removed.push(...group);
    } catch (e) {
      failed += group.length;
      statuses.push(e instanceof StorageError ? e.status : null);
    }
  }
  return { removed, failed, statuses };
}

export function emptyPurgeCounts(): PurgeCounts {
  return { queued: 0, purged: 0, logos: 0, orphans: 0, orphansRemoved: 0, failed: 0 };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const statusOf = (e: unknown): number | null => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
};

async function readInput(req: Request): Promise<{ limit: number; orphans: boolean }> {
  let input: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) input = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Cuerpo vacío o que no es JSON: lo normal (el cron manda '{}').
  }
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.min(1000, Math.max(1, Math.floor(input.limit))) : TAKE_LIMIT;
  return { limit, orphans: input.orphans !== false };
}

/** Atiende una llamada (ver arriba). Responde JSON con los números. */
export async function handlePurgeRequest(req: Request, deps: PurgeDeps): Promise<Response> {
  const write = deps.log ?? ((line: string) => console.log(line));
  const log = (level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) =>
    write(JSON.stringify({ fn: 'purge-photos', level, event, ...extra }));
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const expected = (deps.env('CRON_SECRET') ?? '').trim();
  if (expected.length < 16) {
    log('error', 'config', { detail: 'falta CRON_SECRET (o tiene menos de 16 letras)' });
    return json({ error: 'config' }, 503);
  }
  if (!deps.shared.sameSecret((req.headers.get('x-cron-secret') ?? '').trim(), expected)) return json({ error: 'no_permitido' }, 401);

  const input = await readInput(req);
  const url = deps.env('SUPABASE_URL');
  const key = deps.shared.secretKey(deps.env);
  if (!url || !key) {
    log('error', 'config', { detail: 'faltan SUPABASE_URL o la clave secreta' });
    return json({ error: 'config' }, 503);
  }
  const db = deps.shared.createRestClient(url, key, deps.fetch);
  const storage = createStorageClient(url, key, deps.fetch);
  const counts = emptyPurgeCounts();
  let ok = true;

  // 1. La cola de lo borrado, bucket por bucket: cada ruta se borra solo del bucket del que la dio la base.
  for (const bucket of PURGE_BUCKETS) {
    // Las fotos, sin p_bucket (la base pone 'scoreboards'): también con una base de antes de los logos.
    const which = bucket === BUCKET ? {} : { p_bucket: bucket };
    try {
      const { paths, skipped } = pathsOf(await db.rpc<unknown>('purge_queue_take', { p_limit: input.limit, ...which }));
      counts.queued += paths.length + skipped;
      counts.failed += skipped;
      if (paths.length) {
        const r = await removeInChunks(storage, paths, REMOVE_CHUNK, bucket);
        counts.failed += r.failed;
        if (r.failed) log('warn', 'storage', { bucket, failed: r.failed, statuses: r.statuses });
        if (r.removed.length) {
          // Si no se puede avisar, se vuelven a tomar mañana: borrar otra vez lo que ya no está no es error.
          try {
            await db.rpc<number>('purge_queue_done', { p_paths: r.removed, ...which });
            counts.purged += r.removed.length;
            if (bucket === LOGOS_BUCKET) counts.logos += r.removed.length;
          } catch (e) {
            ok = false;
            log('error', 'queue_done', { bucket, removed: r.removed.length, status: statusOf(e) });
          }
        }
      }
    } catch (e) {
      ok = false;
      log('error', 'take', { bucket, status: statusOf(e) });
    }
  }

  // 2. Los archivos sin fila en photos.
  if (input.orphans) {
    try {
      const { paths, skipped } = pathsOf(await db.rpc<unknown>('storage_orphans', { p_limit: input.limit }));
      counts.orphans = paths.length + skipped;
      counts.failed += skipped;
      if (paths.length) {
        const r = await removeInChunks(storage, paths);
        counts.orphansRemoved = r.removed.length;
        counts.failed += r.failed;
        if (r.failed) log('warn', 'storage', { failed: r.failed, statuses: r.statuses, orphans: true });
      }
    } catch (e) {
      ok = false;
      log('error', 'orphans', { status: statusOf(e) });
    }
  }

  log(ok && !counts.failed ? 'info' : 'warn', 'summary', { ...counts });
  return json(counts, ok ? 200 : 502);
}
