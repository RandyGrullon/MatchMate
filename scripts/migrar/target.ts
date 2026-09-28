/**
 * Dónde se carga la migración:
 *
 * - `local`: PGlite en memoria con el shim y LAS MISMAS migraciones (el ensayo en seco: cada fila pasa por los
 *   CHECK, las FK y los triggers de verdad) — o una base PGlite que se le pase (pruebas).
 * - `supabase`: el proyecto de verdad con la clave secreta NUEVA (`sb_secret_…`; las claves viejas anon y
 *   service_role están desactivadas en el proyecto): cuentas por la API de admin de Auth, filas por upsert
 *   (PostgREST, como service_role: salta la RLS pero no los CHECK ni los triggers) y fotos a Storage.
 *
 * Las dos hacen upsert por la clave de cada tabla: correr la importación otra vez no duplica nada. Para volver a
 * cargar al corte también saben leer las claves que ya están, borrar lo que sobra y quitar archivos.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLocalBackend, type LocalBackend, type SessionStore } from '../../src/lib/backend/local';
import type { FileStore } from '../../src/lib/backend/localFiles';
import { CONFLICT_KEYS, type PhotoFile, type Row, type TableName, type UserPlan } from './types';

/** Una cuenta que ya está en el destino. */
export interface ExistingUser {
  id: string;
  email: string | null;
  /** El correo ya está confirmado. */
  emailConfirmed: boolean;
  /** Última vez que entró a MatchMate (null: nunca). */
  lastSignInAt: string | null;
  /** La creó la migración: `app_metadata.firebase_uid` (null en las que se registraron en MatchMate). */
  firebaseUid: string | null;
}

export interface Target {
  readonly kind: 'local' | 'supabase';
  /** Cuentas que ya existen (para no crear otra con el mismo correo y para ponerlas al día al volver a cargar). */
  listUsers(): Promise<ExistingUser[]>;
  /** Crea la cuenta; 'exists' si ya estaba (mismo id). */
  createUser(u: UserPlan): Promise<'created' | 'exists'>;
  /** Da por confirmado el correo de una cuenta que ya existe. */
  confirmEmail(id: string): Promise<void>;
  /**
   * Pone el hash de Firebase de hoy a cuentas creadas por la migración que nunca entraron a MatchMate
   * (RPC migration_sync_passwords). Devuelve cuántas cambió, o null si la base no tiene esa RPC.
   */
  syncPasswords(list: { id: string; hash: string }[]): Promise<number | null>;
  upsert(table: TableName, rows: Row[]): Promise<void>;
  updateProfile(id: string, patch: { firebase_uid: string; is_superadmin: boolean }): Promise<void>;
  /** Rutas que ya están en el bucket dentro de esas carpetas (ligas). */
  existingFiles(bucket: string, folders: string[]): Promise<Set<string>>;
  upload(file: PhotoFile, data: Uint8Array): Promise<void>;
  /** Quita archivos del bucket (fotos que ya no están en BowlingX). */
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  /** Filas de una tabla (sin RLS) de esas ligas. */
  read(table: 'players' | 'events' | 'teams' | 'entries', leagueIds: string[]): Promise<Row[]>;
  /** Solo esas columnas de las filas de esas ligas (para ver qué sobra de una carga anterior). */
  keys(table: TableName, leagueIds: string[], cols: string[]): Promise<Row[]>;
  /** Borra filas por la clave de la tabla (CONFLICT_KEYS): cada fila de `keys` trae esas columnas. */
  remove(table: TableName, keys: Row[]): Promise<void>;
  /** Deja sin cuenta a esos jugadores (antes de pasarle su cuenta a otro jugador de la misma liga). */
  unlinkPlayers(ids: string[]): Promise<void>;
  /** Ids de todas las ligas del destino. */
  leagueIds(): Promise<string[]>;
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

/** De a cuántos se borra o se pregunta por una lista de ids (la URL de PostgREST no puede ser eterna). */
const ID_CHUNK = 100;

function chunks<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

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
  const wrap = (table: string, e: unknown) =>
    new Error(`${table}: ${(e as Error).message}${(e as { detail?: string }).detail ? ` (${(e as { detail?: string }).detail})` : ''}`);

  return {
    kind: 'local',
    backend,
    async listUsers() {
      const rows = await db.query<{ id: string; email: string | null; confirmed: boolean; last: string | null; fuid: string | null }>(
        `select id, email, email_confirmed_at is not null as confirmed, last_sign_in_at::text as last,
                nullif(raw_app_meta_data ->> 'firebase_uid', '') as fuid
           from auth.users`,
      );
      return rows.rows.map((r) => ({ id: r.id, email: r.email, emailConfirmed: r.confirmed, lastSignInAt: r.last, firebaseUid: r.fuid }));
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
    async confirmEmail(id) {
      await db.query('update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [id]);
    },
    async syncPasswords(list) {
      const has = (await db.query<{ ok: boolean }>(`select to_regprocedure('public.migration_sync_passwords(jsonb)') is not null as ok`)).rows[0].ok;
      if (!has) return null;
      if (!list.length) return 0;
      return asService(async (tx) => (await tx.query<{ n: number }>('select public.migration_sync_passwords($1::jsonb) as n', [JSON.stringify(list)])).rows[0].n);
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
          throw wrap(table, e);
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
    async removeFiles(bucket, paths) {
      await opts.files?.delete(paths.map((p) => `${bucket}/${p}`));
    },
    async read(table, leagueIds) {
      const res = await db.query<{ data: Row[] }>(
        `select coalesce(json_agg(t), '[]'::json) as data from public.${ident(table)} t where t.league_id = any($1::uuid[])`,
        [leagueIds],
      );
      return res.rows[0]?.data ?? [];
    },
    async keys(table, leagueIds, cols) {
      const res = await db.query<{ data: Row[] }>(
        `select coalesce(json_agg(json_build_object(${cols.map((c) => `'${c}', t.${ident(c)}`).join(', ')})), '[]'::json) as data
           from public.${ident(table)} t where t.${ident(leagueCol(table))} = any($1::uuid[])`,
        [leagueIds],
      );
      return res.rows[0]?.data ?? [];
    },
    async remove(table, keys) {
      if (!keys.length) return;
      const k = CONFLICT_KEYS[table];
      const sql = `delete from public.${ident(table)} t using jsonb_populate_recordset(null::public.${ident(table)}, $1::jsonb) k
                    where ${k.map((c) => `t.${ident(c)} = k.${ident(c)}`).join(' and ')}`;
      try {
        await asService((tx) => tx.query(sql, [JSON.stringify(keys)]));
      } catch (e) {
        throw wrap(table, e);
      }
    },
    async unlinkPlayers(ids) {
      if (!ids.length) return;
      await asService((tx) => tx.query('update public.players set user_id = null where id = any($1::uuid[])', [ids]));
    },
    async leagueIds() {
      return (await db.query<{ id: string }>('select id from public.leagues order by id')).rows.map((r) => r.id);
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
 * Revisa SUPABASE_URL y SUPABASE_SECRET_KEY antes de tocar nada. El proyecto tiene las claves viejas (JWT anon
 * y service_role) desactivadas: solo sirve la Secret key nueva (`sb_secret_…`, Configuración del proyecto ›
 * API Keys). supabase-js la manda en `apikey` y en `Authorization: Bearer` (lo que la puerta de Supabase acepta
 * para las claves nuevas: ahí la cambia por un JWT de service_role). Devuelve la dirección sin la barra final.
 */
export function checkSupabaseEnv(url: string | undefined, key: string | undefined): { url: string; key: string; ref: string | null } {
  const u = (url ?? '').trim().replace(/\/+$/, '');
  const k = (key ?? '').trim();
  if (!u || !k) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (en el entorno o con --env archivo).');
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(`SUPABASE_URL no es una dirección: ${u}`);
  }
  if (parsed.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) throw new Error('SUPABASE_URL tiene que empezar con https://');
  if (parsed.pathname !== '/' && parsed.pathname !== '') throw new Error('SUPABASE_URL es solo la dirección del proyecto (https://REF.supabase.co), sin /rest/v1 ni nada después.');
  if (k.startsWith('eyJ')) {
    throw new Error(
      'SUPABASE_SECRET_KEY es una clave vieja (JWT, «service_role» o «anon»): están desactivadas en el proyecto. ' +
        'Usa la Secret key nueva (empieza con sb_secret_): Supabase › Project Settings › API Keys › Secret keys.',
    );
  }
  if (k.startsWith('sb_publishable_')) throw new Error('SUPABASE_SECRET_KEY es la Publishable key (la de la app). Hace falta la Secret key (sb_secret_…).');
  if (!k.startsWith('sb_secret_')) throw new Error('SUPABASE_SECRET_KEY no parece una Secret key de Supabase (tiene que empezar con sb_secret_).');
  const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname)?.[1] ?? null;
  return { url: parsed.origin, key: k, ref };
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
  // PostgREST del proyecto corta cada respuesta en 500 filas (max_rows): se lee y se escribe de a 500.
  const PAGE = 500;

  return {
    kind: 'supabase',
    async listUsers() {
      const out: ExistingUser[] = [];
      // Hasta una página vacía (el servidor puede dar menos de las que se piden).
      for (let page = 1; ; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw sbError('No se pudieron listar las cuentas (¿la Secret key es de este proyecto?)', error);
        if (!data.users.length) return out;
        for (const u of data.users) {
          const fuid = (u.app_metadata as { firebase_uid?: unknown } | undefined)?.firebase_uid;
          out.push({
            id: u.id,
            email: u.email ?? null,
            emailConfirmed: !!u.email_confirmed_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            firebaseUid: typeof fuid === 'string' && fuid ? fuid : null,
          });
        }
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
    async confirmEmail(id) {
      const { error } = await sb.auth.admin.updateUserById(id, { email_confirm: true });
      if (error) throw sbError(`No se pudo confirmar el correo de ${id}`, error);
    },
    async syncPasswords(list) {
      let n = 0;
      // Una llamada vacía también sirve para saber si la RPC está (probar-destino).
      for (const part of list.length ? chunks(list, 200) : [[]]) {
        const { data, error } = await sb.rpc('migration_sync_passwords', { p_users: part });
        if (error) {
          // PGRST202: PostgREST no conoce la función (falta la migración 20260928000100).
          if ((error as { code?: string }).code === 'PGRST202' || /could not find the function/i.test(error.message)) return null;
          throw sbError('migration_sync_passwords', error);
        }
        n += Number(data ?? 0);
      }
      return n;
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
    async removeFiles(bucket, paths) {
      for (const part of chunks(paths, ID_CHUNK)) {
        const { error } = await sb.storage.from(bucket).remove(part);
        if (error) throw sbError(`No se pudieron borrar fotos de ${bucket}`, error);
      }
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
    async keys(table, leagueIds, cols) {
      const out: Row[] = [];
      for (;;) {
        let q = sb.from(table).select(cols.join(',')).in(leagueCol(table), leagueIds);
        for (const k of CONFLICT_KEYS[table]) q = q.order(k);
        const { data, error } = await q.range(out.length, out.length + PAGE - 1);
        if (error) throw sbError(table, error);
        if (!data.length) return out;
        out.push(...(data as unknown as Row[]));
      }
    },
    async remove(table, keys) {
      const [a, b] = CONFLICT_KEYS[table];
      if (!b) {
        for (const part of chunks(keys.map((k) => String(k[a])), ID_CHUNK)) {
          const { error } = await sb.from(table).delete().in(a, part);
          if (error) throw sbError(table, error);
        }
        return;
      }
      // Clave de dos columnas: por cada valor de la primera, la lista de la segunda.
      const groups = new Map<string, string[]>();
      for (const k of keys) groups.set(String(k[a]), [...(groups.get(String(k[a])) ?? []), String(k[b])]);
      for (const [first, seconds] of groups) {
        for (const part of chunks(seconds, ID_CHUNK)) {
          const { error } = await sb.from(table).delete().eq(a, first).in(b, part);
          if (error) throw sbError(table, error);
        }
      }
    },
    async unlinkPlayers(ids) {
      for (const part of chunks(ids, ID_CHUNK)) {
        const { error } = await sb.from('players').update({ user_id: null }).in('id', part);
        if (error) throw sbError('players', error);
      }
    },
    async leagueIds() {
      const out: string[] = [];
      for (;;) {
        const { data, error } = await sb.from('leagues').select('id').order('id').range(out.length, out.length + PAGE - 1);
        if (error) throw sbError('leagues', error);
        if (!data.length) return out;
        out.push(...(data as { id: string }[]).map((r) => r.id));
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
