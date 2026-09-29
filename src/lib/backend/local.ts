/**
 * Backend local: Postgres de verdad (PGlite) con el shim de Supabase y LAS MISMAS migraciones y políticas RLS.
 * Sirve para desarrollo, pruebas y demo sin cuenta de Supabase. En el navegador guarda la base en IndexedDB
 * (`idb://matchmate`); en Node vive en memoria.
 *
 * Cada `select` y `rpc` corre en su propia transacción como el usuario de la sesión:
 * `set local role authenticated` (o `anon` sin sesión) y `request.jwt.claims` con su id, igual que PostgREST.
 * La cuenta local es solo de demo: la contraseña se guarda con PBKDF2 en `auth.local_passwords`.
 */
import { PGlite, type SerializerOptions, type Transaction } from '@electric-sql/pglite';
import {
  isDeleteConfirmation,
  NOT_CONFIRMED as DELETE_NOT_CONFIRMED,
  OWNED as DELETE_OWNED,
  planBlocker,
  SESSION as DELETE_SESSION,
} from '../../../supabase/functions/delete-account/core';
import { mapAuthError, toBackendError } from './errors';
import { createIdbFileStore, createMemoryFileStore, toDataUrl, type FileStore } from './localFiles';
import { hashPassword, verifyPassword } from './password';
import { buildRpcSql, buildSelectSql, checkIdent, type RpcShape } from './query';
import {
  BackendError,
  type AuthEvent,
  type Backend,
  type BackendAuth,
  type BackendStorage,
  type RealtimeMessage,
  type SelectQuery,
  type Session,
} from './types';

/** Implementación local de una Edge Function (p. ej. una lectura de prueba para `scan-bowling`). */
export type LocalHandler = (body: unknown, ctx: { session: Session | null; backend: Backend }) => unknown;

/** Dónde se recuerda la sesión local (localStorage en el navegador, memoria en Node). */
export interface SessionStore {
  get(): string | null;
  set(value: string | null): void;
}

export interface LocalBackendOptions {
  /** Shim + migraciones, en orden (ver migrations.ts). */
  sql: string[];
  /** Por defecto `idb://matchmate` en el navegador y memoria en Node. */
  dataDir?: string;
  /** Usar una base PGlite ya abierta (pruebas, herramientas): se le aplican los scripts que falten y no se cierra. */
  db?: PGlite;
  sessionStore?: SessionStore;
  /** Por defecto IndexedDB `mm-local-files` en el navegador y memoria en Node. */
  files?: FileStore;
  /** Edge Functions locales, además de las de fábrica. */
  handlers?: Record<string, LocalHandler>;
  /**
   * Demo en el navegador: mientras no haya superadmin, la cuenta que se crea lo es (para poder crear ligas de los
   * deportes en beta y abrirlos). Solo la base local de ese navegador; Supabase nunca pasa por aquí.
   */
  firstUserIsSuper?: boolean;
}

export interface LocalBackend extends Backend {
  readonly mode: 'local';
  /** La base PGlite (como superusuario: sin RLS). Para pruebas, semillas y herramientas. */
  readonly db: PGlite;
  registerHandler(fn: string, handler: LocalHandler): void;
  close(): Promise<void>;
}

export const LOCAL_SESSION_KEY = 'mm:local-session';
export const LOCAL_DATA_DIR = 'idb://matchmate';
/** Canal de NOTIFY que usa `private.emit` en PGlite: payload JSON {topic, event, payload}. */
export const NOTIFY_CHANNEL = 'mm';

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function defaultSessionStore(): SessionStore {
  if (isBrowser()) {
    return {
      get: () => {
        try {
          return localStorage.getItem(LOCAL_SESSION_KEY);
        } catch {
          return null;
        }
      },
      set: (v) => {
        try {
          if (v === null) localStorage.removeItem(LOCAL_SESSION_KEY);
          else localStorage.setItem(LOCAL_SESSION_KEY, v);
        } catch {
          // Modo privado o almacenamiento lleno: la sesión dura lo que dure la pestaña.
        }
      },
    };
  }
  let value: string | null = null;
  return { get: () => value, set: (v) => void (value = v) };
}

/** jsonb/json: siempre JSON.stringify (PGlite manda los textos crudos y 'hola' no es JSON válido). */
const JSON_SERIALIZERS: SerializerOptions = { 114: (v) => JSON.stringify(v), 3802: (v) => JSON.stringify(v) };

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Aplica los scripts que falten, cada uno en su transacción, y los anota en `mm_local.applied`.
 * Si uno ya aplicado cambió (o hay menos scripts que antes) devuelve 'mismatch': la base hay que recrearla.
 */
async function applyScripts(db: PGlite, sql: string[]): Promise<'ok' | 'mismatch'> {
  await db.exec(`
    create schema if not exists mm_local;
    create table if not exists mm_local.applied (idx int primary key, hash text not null, applied_at timestamptz not null default now());
  `);
  const applied = (await db.query<{ idx: number; hash: string }>('select idx, hash from mm_local.applied order by idx')).rows;
  const hashes = await Promise.all(sql.map(sha256));
  if (applied.length > sql.length || applied.some((r, i) => r.idx !== i || r.hash !== hashes[i])) return 'mismatch';
  for (let i = applied.length; i < sql.length; i++) {
    try {
      await db.transaction(async (tx) => {
        await tx.exec(sql[i]);
        await tx.query('insert into mm_local.applied (idx, hash) values ($1, $2)', [i, hashes[i]]);
      });
    } catch (e) {
      const err = toBackendError(e);
      throw new BackendError(`Falló el script ${i + 1} de ${sql.length} de la base local: ${err.message}`, 'unknown', err.code);
    }
  }
  return 'ok';
}

/** Borra la base de IndexedDB de PGlite (Emscripten la nombra por el punto de montaje: /pglite/<nombre>). */
function deleteIdbDataDir(dataDir: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(`/pglite/${dataDir.slice('idb://'.length)}`);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

async function openDb(opts: LocalBackendOptions): Promise<PGlite> {
  if (opts.db) {
    if ((await applyScripts(opts.db, opts.sql)) === 'mismatch') {
      throw new BackendError('La base PGlite recibida no coincide con los scripts (una migración cambió).', 'unknown');
    }
    return opts.db;
  }
  const dataDir = opts.dataDir ?? (isBrowser() ? LOCAL_DATA_DIR : undefined);
  const create = async () => {
    const db = await PGlite.create(dataDir ? { dataDir } : {});
    // Igual que Supabase: la sesión en UTC (las fechas salen en JSON con +00:00).
    await db.exec(`set time zone 'UTC'`);
    return db;
  };
  // Aplica los scripts; si falla, cierra la base para no dejarla abierta.
  const migrate = async (db: PGlite) => {
    try {
      return await applyScripts(db, opts.sql);
    } catch (e) {
      await db.close();
      throw e;
    }
  };
  let db = await create();
  if ((await migrate(db)) === 'mismatch') {
    await db.close();
    if (!dataDir?.startsWith('idb://')) {
      throw new BackendError(`La base local (${dataDir}) no coincide con las migraciones: bórrala y vuelve a abrir.`, 'unknown');
    }
    // Solo desarrollo: cambió una migración ya aplicada, así que la base local se crea de nuevo (se pierden los datos de prueba).
    console.warn('MatchMate local: cambió una migración ya aplicada; se borra la base local y se crea de nuevo.');
    await deleteIdbDataDir(dataDir);
    db = await create();
    if ((await migrate(db)) === 'mismatch') {
      await db.close();
      throw new BackendError('No se pudo recrear la base local.', 'unknown');
    }
  }
  return db;
}

/** Tabla de contraseñas de la demo local (solo si el shim creó auth.users). Nadie más que el superusuario la ve. */
async function ensureLocalAuth(db: PGlite): Promise<boolean> {
  const has = (await db.query<{ ok: boolean }>(`select to_regclass('auth.users') is not null as ok`)).rows[0]?.ok === true;
  if (!has) return false;
  await db.exec(`
    create table if not exists auth.local_passwords (
      user_id uuid primary key references auth.users (id) on delete cascade,
      hash text not null,
      updated_at timestamptz not null default now()
    );
    revoke all on auth.local_passwords from public;
    do $$
    declare r text;
    begin
      foreach r in array array['anon', 'authenticated', 'service_role'] loop
        if exists (select 1 from pg_roles where rolname = r) then
          execute format('revoke all on auth.local_passwords from %I', r);
        end if;
      end loop;
    end $$;
  `);
  return true;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = /^[a-z0-9][a-z0-9_-]*$/;
/** Bucket público de los logos de las ligas (src/lib/logos.ts): sus políticas se revisan aquí también. */
const LOGOS = 'logos';

interface LocalUser {
  userId: string;
  email: string | null;
}

function parseStored(raw: string | null): LocalUser | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LocalUser>;
    return typeof v.userId === 'string' && UUID.test(v.userId) ? { userId: v.userId, email: v.email ?? null } : null;
  } catch {
    return null;
  }
}

function needCrypto() {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // En el navegador, WebCrypto solo existe en https o localhost (no en http://192.168.x.x).
    throw new BackendError('Las cuentas del modo local necesitan https o localhost.', 'unknown', 'insecure_context');
  }
}

export async function createLocalBackend(opts: LocalBackendOptions): Promise<LocalBackend> {
  const ownsDb = !opts.db;
  const db = await openDb(opts);
  const hasAuth = await ensureLocalAuth(db);
  const store = opts.sessionStore ?? defaultSessionStore();
  const files = opts.files ?? (isBrowser() && typeof indexedDB !== 'undefined' ? createIdbFileStore() : createMemoryFileStore());

  // ---- Sesión ----
  let current = parseStored(store.get());
  let cached: Session | null = null;
  const authListeners = new Set<(event: AuthEvent, session: Session | null) => void>();

  const setCurrent = (u: LocalUser | null) => {
    current = u;
    cached = null;
    store.set(u ? JSON.stringify(u) : null);
  };
  const emit = (event: AuthEvent, session: Session | null) => {
    for (const cb of [...authListeners]) {
      try {
        cb(event, session);
      } catch (e) {
        console.error(e);
      }
    }
  };
  const needAuth = () => {
    if (!hasAuth) throw new BackendError('Falta el esquema auth del shim (supabase/local/shim.sql).', 'unknown');
  };

  // Nombre del perfil (profiles.name) o, si no hay perfil, el nombre con que se registró.
  let withProfiles = (await db.query<{ ok: boolean }>(`select to_regclass('public.profiles') is not null as ok`)).rows[0]?.ok === true;
  async function readUser(userId: string): Promise<{ email: string | null; name: string | null } | null> {
    if (!hasAuth) return null;
    const plain = `select u.email, u.raw_user_meta_data->>'name' as name from auth.users u where u.id = $1`;
    const joined = `select u.email, coalesce(p.name, u.raw_user_meta_data->>'name') as name
      from auth.users u left join public.profiles p on p.id = u.id where u.id = $1`;
    try {
      return (await db.query<{ email: string | null; name: string | null }>(withProfiles ? joined : plain, [userId])).rows[0] ?? null;
    } catch (e) {
      if (!withProfiles) throw toBackendError(e);
      withProfiles = false; // profiles sin columna name: se usa solo el nombre del registro.
      return (await db.query<{ email: string | null; name: string | null }>(plain, [userId])).rows[0] ?? null;
    }
  }

  async function getSession(): Promise<Session | null> {
    const u = current;
    if (!u) return null;
    if (cached?.userId === u.userId) return cached;
    const row = await readUser(u.userId);
    // La cuenta ya no existe (se recreó la base): se cierra la sesión.
    if (!row) {
      if (current === u) setCurrent(null);
      return null;
    }
    const s: Session = { userId: u.userId, email: row.email, name: row.name };
    if (current === u) cached = s;
    return s;
  }

  async function signedIn(u: LocalUser): Promise<Session> {
    setCurrent(u);
    const s = await getSession();
    if (!s) throw new BackendError('No se pudo abrir la sesión.', 'auth', 'session_not_found');
    emit('SIGNED_IN', s);
    return s;
  }

  const auth: BackendAuth = {
    getSession,
    onChange(cb) {
      const wrapped = (e: AuthEvent, s: Session | null) => cb(e, s);
      authListeners.add(wrapped);
      return () => void authListeners.delete(wrapped);
    },
    async signUp(email, password, name, meta) {
      needAuth();
      needCrypto();
      const mail = email.trim().toLowerCase();
      if (!EMAIL.test(mail)) throw mapAuthError({ code: 'email_address_invalid' });
      if (password.length < 6) throw mapAuthError({ code: 'weak_password' });
      const hash = await hashPassword(password);
      const id = await db
        .transaction(async (tx) => {
          const exists = await tx.query('select 1 from auth.users where lower(email) = $1', [mail]);
          if (exists.rows.length) throw mapAuthError({ code: 'email_exists' });
          const row = await tx.query<{ id: string }>(
            `insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, last_sign_in_at)
             values (gen_random_uuid(), $1, $2, now(), now()) returning id`,
            [mail, JSON.stringify({ ...meta, name: name.trim() })],
          );
          const newId = row.rows[0].id;
          await tx.query('insert into auth.local_passwords (user_id, hash) values ($1, $2)', [newId, hash]);
          if (opts.firstUserIsSuper) {
            await tx.query(
              `update public.profiles set is_superadmin = true
                where id = $1 and not exists (select 1 from public.profiles p where p.is_superadmin)`,
              [newId],
            );
          }
          return newId;
        })
        .catch((e) => {
          throw toBackendError(e);
        });
      // En local no hay correo de confirmación: entra de una vez.
      return signedIn({ userId: id, email: mail });
    },
    async signIn(email, password) {
      needAuth();
      needCrypto();
      const mail = email.trim().toLowerCase();
      const row = (
        await db.query<{ id: string; email: string | null; hash: string | null }>(
          `select u.id, u.email, p.hash from auth.users u left join auth.local_passwords p on p.user_id = u.id
           where lower(u.email) = $1 limit 1`,
          [mail],
        )
      ).rows[0];
      if (!row?.hash || !(await verifyPassword(password, row.hash))) throw mapAuthError({ code: 'invalid_credentials' });
      await db.query('update auth.users set last_sign_in_at = now() where id = $1', [row.id]).catch(() => undefined);
      return signedIn({ userId: row.id, email: row.email });
    },
    async signInWithGoogle() {
      throw new BackendError('Google no está disponible en modo local', 'auth', 'provider_disabled');
    },
    async signOut() {
      if (!current) return;
      setCurrent(null);
      emit('SIGNED_OUT', null);
    },
    // En local no hay correos: las cuentas quedan confirmadas al crearse.
    async resendConfirmation() {},
    async resetPassword() {
      throw new BackendError('Recuperar la contraseña no está disponible en modo local (no hay correo).', 'validation', 'email_provider_disabled');
    },
    async updatePassword(password) {
      needAuth();
      needCrypto();
      const u = current;
      if (!u) throw mapAuthError({ code: 'session_not_found' });
      if (password.length < 6) throw mapAuthError({ code: 'weak_password' });
      const hash = await hashPassword(password);
      await db.query(
        `insert into auth.local_passwords (user_id, hash) values ($1, $2)
         on conflict (user_id) do update set hash = excluded.hash, updated_at = now()`,
        [u.userId, hash],
      );
      emit('USER_UPDATED', await getSession());
    },
  };

  // ---- Consultas como el usuario de la sesión ----
  async function asUser<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const u = current;
    const claims = u ? { sub: u.userId, role: 'authenticated', aud: 'authenticated', email: u.email } : { role: 'anon' };
    try {
      return await db.transaction(async (tx) => {
        await tx.exec(`set local role ${u ? 'authenticated' : 'anon'}; set local time zone 'UTC'`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        return fn(tx);
      });
    } catch (e) {
      throw toBackendError(e);
    }
  }

  // Forma de la respuesta de cada función (void / conjunto / uno), leída una vez de pg_proc.
  const shapes = new Map<string, RpcShape>();
  async function shapeOf(fn: string): Promise<RpcShape> {
    checkIdent(fn, 'Función');
    const known = shapes.get(fn);
    if (known) return known;
    const row = (
      await db.query<{ n: number; set: boolean | null; void: boolean | null }>(
        `select count(*)::int as n, bool_or(p.proretset) as set, bool_and(p.prorettype = 'void'::regtype) as void
         from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [fn],
      )
    ).rows[0];
    if (!row?.n) throw new BackendError(`No existe la función public.${fn}`, 'not_found', 'PGRST202');
    const shape: RpcShape = row.void ? 'void' : row.set ? 'set' : 'single';
    shapes.set(fn, shape);
    return shape;
  }

  // ---- Tiempo real: NOTIFY 'mm' → suscriptores del tema ----
  const topics = new Map<string, Set<(msg: RealtimeMessage) => void>>();
  const unlisten = await db.listen(NOTIFY_CHANNEL, (raw) => {
    let msg: { topic?: unknown; event?: unknown; payload?: unknown };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (typeof msg?.topic !== 'string') return;
    for (const cb of [...(topics.get(msg.topic) ?? [])]) {
      try {
        cb({ event: String(msg.event ?? ''), payload: msg.payload ?? null });
      } catch (e) {
        console.error(e);
      }
    }
  });

  // ---- Archivos ----
  const objectUrls = new Map<string, string>();
  const fileKey = (bucket: string, path: string) => {
    if (!BUCKET.test(bucket)) throw new BackendError(`Bucket inválido: ${bucket}`, 'validation');
    if (!path || path.startsWith('/') || path.length > 1024 || path.split('/').some((p) => p === '' || p === '.' || p === '..')) {
      throw new BackendError(`Ruta inválida: ${path}`, 'validation');
    }
    return `${bucket}/${path}`;
  };
  const dropUrl = (key: string) => {
    const url = objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(key);
  };
  /** Un blob: URL por archivo, el mismo cada vez (se suelta al reemplazarlo o borrarlo); en Node, un data: URL. */
  const fileUrl = async (bucket: string, path: string) => {
    const key = fileKey(bucket, path);
    const file = await files.get(key);
    if (!file) throw new BackendError('No existe el archivo.', 'not_found', 'NoSuchKey');
    if (!isBrowser() || typeof URL.createObjectURL !== 'function') return toDataUrl(file);
    let url = objectUrls.get(key);
    if (!url) {
      url = URL.createObjectURL(new Blob([file.data], { type: file.contentType }));
      objectUrls.set(key, url);
    }
    return url;
  };
  const storage: BackendStorage = {
    async upload(bucket, path, data, contentType) {
      const key = fileKey(bucket, path);
      // Como las políticas de Storage: sin cuenta no se sube nada.
      if (!current) throw new BackendError('Entra a tu cuenta para subir archivos.', 'permission', '403');
      // Logos: como mm_logos_upload (20260929001010_logos_supabase.sql), solo un admin de esa liga en su carpeta.
      if (bucket === LOGOS) {
        const ok = await asUser((tx) => tx.query<{ ok: boolean }>('select private.can_upload_logo_path($1) as ok', [path]));
        if (!ok.rows[0]?.ok) throw new BackendError('new row violates row-level security policy', 'permission', '403');
      }
      await files.put(key, { data: await data.arrayBuffer(), contentType });
      dropUrl(key);
    },
    signedUrl: (bucket, path) => fileUrl(bucket, path),
    // Bucket público (logos): lo mismo, también sin cuenta.
    publicUrl: (bucket, path) => fileUrl(bucket, path),
    async remove(bucket, paths) {
      let keys = paths.map((p) => fileKey(bucket, p));
      if (!current) throw new BackendError('Entra a tu cuenta para borrar archivos.', 'permission', '403');
      // Logos: como mm_logos_delete, los de las ligas que administra y los que ya no usa nadie (en la cola de Storage);
      // los demás se saltan sin error, igual que Storage.
      if (bucket === LOGOS) {
        const ok = await asUser((tx) =>
          tx.query<{ path: string }>('select p as path from unnest($1::text[]) as p where private.can_remove_logo_path(p)', [paths]),
        );
        const allowed = new Set(ok.rows.map((r) => r.path));
        keys = keys.filter((_, i) => allowed.has(paths[i]));
      }
      await files.delete(keys);
      keys.forEach(dropUrl);
    },
  };

  // ---- Edge Functions locales ----
  const handlers = new Map<string, LocalHandler>([
    [
      'scan-bowling',
      () => {
        throw new BackendError('La lectura con IA no está disponible en modo local', 'validation');
      },
    ],
    // «Borrar mi cuenta» (en Supabase, la Edge Function delete-account): la misma revisión como la cuenta
    // (prepare_delete_account) y después, como superusuario, el borrado en auth.users que la base sigue en cascada.
    [
      'delete-account',
      async (body, ctx) => {
        const u = current;
        const failure = (f: { code: string; message: string }, kind: 'auth' | 'validation' | 'conflict' | 'unknown') =>
          new BackendError(f.message, kind, f.code);
        if (!u || !ctx.session) throw failure(DELETE_SESSION, 'auth');
        if (!isDeleteConfirmation(body)) throw failure(DELETE_NOT_CONFIRMED, 'validation');
        const blocked = planBlocker(await ctx.backend.rpc('prepare_delete_account'));
        if (blocked) throw failure(blocked, blocked.code === 'servidor' ? 'unknown' : 'conflict');
        try {
          await db.query('delete from auth.users where id = $1', [u.userId]);
        } catch (e) {
          const err = toBackendError(e);
          // Justo quedó dueña de una liga (leagues.owner_id no deja).
          if (err.code === '23503' || err.code === '23001') throw failure(DELETE_OWNED, 'conflict');
          throw err;
        }
        if (current?.userId === u.userId) {
          setCurrent(null);
          emit('SIGNED_OUT', null);
        }
        return { deleted: true };
      },
    ],
    ...Object.entries(opts.handlers ?? {}),
  ]);

  const backend: LocalBackend = {
    mode: 'local',
    db,
    auth,
    storage,
    async select<T = Record<string, unknown>>(q: SelectQuery): Promise<T[]> {
      const { sql, params } = buildSelectSql(q);
      const res = await asUser((tx) => tx.query<{ data: T[] | null }>(sql, params, { serializers: JSON_SERIALIZERS }));
      return res.rows[0]?.data ?? [];
    },
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
      const shape = await shapeOf(fn);
      const { sql, params } = buildRpcSql(fn, args, shape);
      const res = await asUser((tx) => tx.query<{ data?: unknown }>(sql, params, { serializers: JSON_SERIALIZERS }));
      return (shape === 'void' ? null : (res.rows[0]?.data ?? null)) as T;
    },
    subscribe(topic, onMessage) {
      let subs = topics.get(topic);
      if (!subs) topics.set(topic, (subs = new Set()));
      // Envoltura propia: si la misma función se suscribe dos veces, cada cancelación quita una.
      const cb = (m: RealtimeMessage) => onMessage(m);
      subs.add(cb);
      const set = subs;
      return () => {
        set.delete(cb);
        if (!set.size && topics.get(topic) === set) topics.delete(topic);
      };
    },
    async invoke<T = unknown>(fn: string, body: unknown): Promise<T> {
      const handler = handlers.get(fn);
      if (!handler) throw new BackendError(`La función ${fn} no está disponible en modo local`, 'not_found');
      try {
        return (await handler(body, { session: await getSession(), backend })) as T;
      } catch (e) {
        throw toBackendError(e);
      }
    },
    online: () => true,
    registerHandler(fn, handler) {
      handlers.set(fn, handler);
    },
    async close() {
      topics.clear();
      authListeners.clear();
      [...objectUrls.keys()].forEach(dropUrl);
      await unlisten();
      if (ownsDb) await db.close();
    },
  };
  return backend;
}
