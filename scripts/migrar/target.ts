/**
 * Dónde se carga la migración:
 *
 * - `local`: PGlite en memoria con el shim y LAS MISMAS migraciones (el ensayo en seco: cada fila pasa por los
 *   CHECK, las FK y los triggers de verdad) — o una base PGlite que se le pase (pruebas).
 * - `supabase`: el proyecto de verdad con la clave secreta (service_role): cuentas por la API de admin de Auth,
 *   filas por upsert (PostgREST) y fotos a Storage.
 *
 * Las dos hacen upsert por la clave de cada tabla: correr la importación otra vez no duplica nada.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLocalBackend, type LocalBackend, type SessionStore } from '../../src/lib/backend/local';
import type { FileStore } from '../../src/lib/backend/localFiles';
import { CONFLICT_KEYS, type PhotoFile, type Row, type TableName, type UserPlan } from './types';

export interface Target {
  readonly kind: 'local' | 'supabase';
  /** Cuentas que ya existen (para no crear otra con el mismo correo). */
  listUsers(): Promise<{ id: string; email: string | null }[]>;
  /** Crea la cuenta; 'exists' si ya estaba (mismo id). */
  createUser(u: UserPlan): Promise<'created' | 'exists'>;
  upsert(table: TableName, rows: Row[]): Promise<void>;
  updateProfile(id: string, patch: { firebase_uid: string; is_superadmin: boolean }): Promise<void>;
  /** Rutas que ya están en el bucket dentro de esas carpetas (ligas). */
  existingFiles(bucket: string, folders: string[]): Promise<Set<string>>;
  upload(file: PhotoFile, data: Uint8Array): Promise<void>;
  /** Filas de una tabla (sin RLS) de esas ligas. */
  read(table: 'players' | 'events' | 'teams' | 'entries', leagueIds: string[]): Promise<Row[]>;
  /** Cuántas filas hay de esas ligas (profiles: las que tienen firebase_uid). */
  count(table: TableName, leagueIds: string[]): Promise<number>;
  close(): Promise<void>;
}

/** Shim + migraciones desde el disco (Node), en orden y sin las que son solo de Supabase. */
export function loadSqlFromDisk(root: string): string[] {
  const dir = join(root, 'supabase', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_supabase.sql'))
    .sort();
  return [readFileSync(join(root, 'supabase', 'local', 'shim.sql'), 'utf8'), ...files.map((f) => readFileSync(join(dir, f), 'utf8'))];
}

export const memorySession = (value: string | null = null): SessionStore => ({ get: () => value, set: (v) => void (value = v) });

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Nombre inválido: ${s}`);
  return `"${s}"`;
};

/** Columna para filtrar por liga. */
const leagueCol = (table: TableName) => (table === 'leagues' ? 'id' : 'league_id');

// ---------- Local (PGlite) ----------

export interface LocalTarget extends Target {
  readonly kind: 'local';
  /** El backend local sobre la misma base (pruebas: actuar como alguien). */
  readonly backend: LocalBackend;
}

export async function createLocalTarget(opts: { root: string; files?: FileStore }): Promise<LocalTarget> {
  const backend = await createLocalBackend({ sql: loadSqlFromDisk(opts.root), sessionStore: memorySession(), files: opts.files });
  const db = backend.db;
  const asService = <T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return fn(tx);
    });

  return {
    kind: 'local',
    backend,
    async listUsers() {
      return (await db.query<{ id: string; email: string | null }>('select id, email from auth.users')).rows;
    },
    async createUser(u) {
      const other = (await db.query<{ id: string }>('select id from auth.users where lower(email) = $1', [u.email])).rows[0];
      if (other) {
        if (other.id === u.id) return 'exists';
        throw new Error(`Ya existe otra cuenta con el correo ${u.email}`);
      }
      // Como GoTrue: el trigger on_auth_user_created le crea el perfil con el nombre de la metadata.
      await db.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at)
         values ($1, 'authenticated', 'authenticated', $2, $3, case when $4 then now() end, $5::jsonb, $6::jsonb, $7)`,
        [
          u.id,
          u.email,
          u.passwordHash ?? '',
          u.emailConfirmed,
          JSON.stringify({ provider: 'email', providers: ['email'], firebase_uid: u.firebaseUid }),
          JSON.stringify({ name: u.name }),
          u.createdAt,
        ],
      );
      return 'created';
    },
    async upsert(table, rows) {
      if (!rows.length) return;
      const keys = CONFLICT_KEYS[table];
      const cols = Object.keys(rows[0]).map(ident);
      const updates = Object.keys(rows[0])
        .filter((c) => !keys.includes(c))
        .map((c) => `${ident(c)} = excluded.${ident(c)}`);
      const sql = `insert into public.${ident(table)} (${cols.join(', ')})
        select ${cols.join(', ')} from jsonb_populate_recordset(null::public.${ident(table)}, $1::jsonb)
        on conflict (${keys.map(ident).join(', ')}) do ${updates.length ? `update set ${updates.join(', ')}` : 'nothing'}`;
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        try {
          await asService((tx) => tx.query(sql, [JSON.stringify(chunk)]));
        } catch (e) {
          throw new Error(`${table}: ${(e as Error).message}${(e as { detail?: string }).detail ? ` (${(e as { detail?: string }).detail})` : ''}`);
        }
      }
    },
    async updateProfile(id, patch) {
      await asService((tx) => tx.query('update public.profiles set firebase_uid = $2, is_superadmin = is_superadmin or $3 where id = $1', [id, patch.firebase_uid, patch.is_superadmin]));
    },
    // El almacén local no lista carpetas: se vuelve a guardar (es en memoria y reemplaza lo mismo).
    existingFiles: async () => new Set<string>(),
    async upload(file, data) {
      if (!opts.files) return; // Ensayo en seco: solo se comprobó que la foto se puede leer.
      await opts.files.put(`${file.bucket}/${file.path}`, { data: data.slice().buffer as ArrayBuffer, contentType: file.contentType });
    },
    async read(table, leagueIds) {
      const res = await db.query<{ data: Row[] }>(
        `select coalesce(json_agg(t), '[]'::json) as data from public.${ident(table)} t where t.league_id = any($1::uuid[])`,
        [leagueIds],
      );
      return res.rows[0]?.data ?? [];
    },
    async count(table, leagueIds) {
      const sql =
        table === 'profiles'
          ? 'select count(*)::int as n from public.profiles where firebase_uid is not null'
          : `select count(*)::int as n from public.${ident(table)} where ${ident(leagueCol(table))} = any($1::uuid[])`;
      return (await db.query<{ n: number }>(sql, table === 'profiles' ? [] : [leagueIds])).rows[0].n;
    },
    close: () => backend.close(),
  };
}

// ---------- Supabase ----------

/** Error de supabase-js en texto (con el código si viene). */
function sbError(what: string, e: { message?: string; code?: string; details?: string; hint?: string } | null): Error {
  return new Error(`${what}: ${e?.message ?? 'error'}${e?.code ? ` [${e.code}]` : ''}${e?.details ? ` (${e.details})` : ''}`);
}

/**
 * Los scripts no usan tiempo real. En Node 20 no hay WebSocket y supabase-js no arranca sin uno: este lo
 * reemplaza y solo falla si alguien lo usa.
 */
class NoWebSocket {
  constructor() {
    throw new Error('El tiempo real no está disponible en los scripts');
  }
}

/** supabase-js para Node: sin guardar sesión, sin refrescar el token y sin tiempo real. */
export function createNodeClient(url: string, key: string, fetchFn?: typeof fetch): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: NoWebSocket as never },
    ...(fetchFn ? { global: { fetch: fetchFn } } : {}),
  });
}

export function createSupabaseTarget(opts: { url: string; secretKey: string; client?: SupabaseClient }): Target {
  const sb = opts.client ?? createNodeClient(opts.url, opts.secretKey);
  const PAGE = 500;

  return {
    kind: 'supabase',
    async listUsers() {
      const out: { id: string; email: string | null }[] = [];
      // Hasta una página vacía (el servidor puede dar menos de las que se piden).
      for (let page = 1; ; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw sbError('No se pudieron listar las cuentas', error);
        if (!data.users.length) return out;
        out.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null })));
      }
    },
    async createUser(u) {
      const { error } = await sb.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: u.emailConfirmed,
        ...(u.passwordHash ? { password_hash: u.passwordHash } : {}),
        user_metadata: { name: u.name },
        app_metadata: { firebase_uid: u.firebaseUid },
        // Deshabilitada en Firebase: bloqueada (unos 100 años).
        ...(u.banned ? { ban_duration: '876000h' } : {}),
      });
      if (!error) return 'created';
      const code = (error as { code?: string }).code;
      if (code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered|already exists/i.test(error.message)) {
        const { data } = await sb.auth.admin.getUserById(u.id);
        if (data?.user) return 'exists';
      }
      throw sbError(`No se pudo crear la cuenta ${u.email}`, error);
    },
    async upsert(table, rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        const { error } = await sb.from(table).upsert(rows.slice(i, i + PAGE), { onConflict: CONFLICT_KEYS[table].join(','), ignoreDuplicates: false });
        if (error) throw sbError(table, error);
      }
    },
    async updateProfile(id, patch) {
      const change: Record<string, unknown> = { firebase_uid: patch.firebase_uid };
      if (patch.is_superadmin) change.is_superadmin = true;
      const { error } = await sb.from('profiles').update(change).eq('id', id);
      if (error) throw sbError(`profiles ${id}`, error);
    },
    async existingFiles(bucket, folders) {
      const out = new Set<string>();
      for (const folder of folders) {
        for (let offset = 0; ; ) {
          const { data, error } = await sb.storage.from(bucket).list(folder, { limit: 1000, offset });
          if (error) throw sbError(`No se pudo listar ${bucket}/${folder}`, error);
          if (!data.length) break;
          data.forEach((f) => out.add(`${folder}/${f.name}`));
          offset += data.length;
        }
      }
      return out;
    },
    async upload(file, data) {
      const { error } = await sb.storage.from(file.bucket).upload(file.path, data, { contentType: file.contentType, upsert: false });
      if (error && !/exists|duplicate/i.test(error.message)) throw sbError(`No se pudo subir ${file.path}`, error);
    },
    async read(table, leagueIds) {
      const out: Row[] = [];
      // Por páginas hasta una vacía: max_rows del proyecto puede cortar cada respuesta a menos de PAGE.
      for (;;) {
        const { data, error } = await sb.from(table).select('*').in('league_id', leagueIds).order('id').range(out.length, out.length + PAGE - 1);
        if (error) throw sbError(table, error);
        if (!data.length) return out;
        out.push(...(data as Row[]));
      }
    },
    async count(table, leagueIds) {
      let q = sb.from(table).select('*', { count: 'exact', head: true });
      q = table === 'profiles' ? q.not('firebase_uid', 'is', null) : q.in(leagueCol(table), leagueIds);
      const { count, error } = await q;
      if (error) throw sbError(table, error);
      return count ?? 0;
    },
    async close() {},
  };
}
