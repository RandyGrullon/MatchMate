/**
 * Arnés de las pruebas SQL: PGlite (Postgres en WASM) con el shim de Supabase y las migraciones en orden.
 *
 * PGlite corre como superusuario y ahí la RLS no se aplica. Por eso cada consulta "como alguien" va dentro
 * de una transacción con `set local role anon|authenticated|service_role` y los claims del JWT en
 * `request.jwt.claims` (lo mismo que hace PostgREST). La prueba canario de seguridad.test.ts confirma que
 * la RLS de verdad se aplica.
 *
 * Aislamiento: cada prueba abre una transacción (`begin()`), arma sus datos y al final `rollback()`. Cada
 * llamada va en un savepoint: si falla, se deshace solo esa llamada (como una petición que falla).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { expect } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
export const SHIM_FILE = join(ROOT, 'supabase', 'local', 'shim.sql');

/** Migraciones que corren en PGlite, en orden (las que terminan en _supabase.sql son solo de Supabase). */
export function localMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_supabase.sql'))
    .sort();
}

/** Base nueva: shim + migraciones. */
export async function bootDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(SHIM_FILE, 'utf8'));
  for (const file of localMigrations()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Visitante sin cuenta. */
export const ANON = 'anon';
/** Clave secreta (service_role: salta la RLS). */
export const SERVICE = 'service';
/** Quién hace la consulta: el uuid de una cuenta, ANON o SERVICE. */
export type Actor = string;

export interface SqlError extends Error {
  code?: string;
}

export class TestDb {
  private inTx = false;

  constructor(readonly pg: PGlite) {}

  static async open(): Promise<TestDb> {
    return new TestDb(await bootDb());
  }

  /** Empieza la transacción de la prueba. */
  async begin() {
    await this.pg.exec('begin');
    this.inTx = true;
  }

  /** Deshace todo lo de la prueba. */
  async rollback() {
    if (!this.inTx) return;
    this.inTx = false;
    await this.pg.exec('rollback');
  }

  /** Como superusuario (sin RLS ni permisos): para armar los datos de la prueba. */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.run<T>(null, null, sql, params);
  }

  /** Como un actor: cuenta (uuid), ANON o SERVICE. */
  async as<T = Record<string, unknown>>(who: Actor, sql: string, params: unknown[] = []): Promise<T[]> {
    if (who === ANON) return this.run<T>('anon', JSON.stringify({ role: 'anon' }), sql, params);
    if (who === SERVICE) return this.run<T>('service_role', JSON.stringify({ role: 'service_role' }), sql, params);
    return this.run<T>('authenticated', JSON.stringify({ sub: who, role: 'authenticated' }), sql, params);
  }

  asUser<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
    return this.as<T>(uid, sql, params);
  }

  asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return this.as<T>(ANON, sql, params);
  }

  asService<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return this.as<T>(SERVICE, sql, params);
  }

  /** Llama una RPC con argumentos por nombre; devuelve lo que retorna (una fila, una columna). */
  async rpc<T = unknown>(who: Actor, fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const rows = await this.as<{ r: T }>(who, sql, keys.map((k) => args[k] ?? null));
    return rows[0]?.r as T;
  }

  /** RPC que devuelve filas (returns table / setof). */
  async rpcRows<T = Record<string, unknown>>(who: Actor, fn: string, args: Record<string, unknown> = {}): Promise<T[]> {
    const keys = Object.keys(args);
    const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
    return this.as<T>(who, sql, keys.map((k) => args[k] ?? null));
  }

  /** Crea una cuenta en auth.users (el trigger le crea el perfil). Devuelve su uuid. */
  async createUser(email: string, name?: string | null, meta: Record<string, unknown> = {}): Promise<string> {
    const metadata = name == null ? meta : { name, ...meta };
    const rows = await this.admin<{ id: string }>('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [
      email,
      metadata,
    ]);
    return rows[0].id;
  }

  /** Cuenta filas como superusuario (para comprobar lo que quedó, sin RLS). */
  async count(table: string, where = 'true', params: unknown[] = []): Promise<number> {
    const rows = await this.admin<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params);
    return rows[0].n;
  }

  private async run<T>(role: string | null, claims: string | null, sql: string, params: unknown[]): Promise<T[]> {
    const own = !this.inTx;
    await this.pg.exec(own ? 'begin' : 'savepoint mm_call');
    try {
      if (role) {
        await this.pg.exec(`set local role ${role}`);
        await this.pg.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      }
      const res = await this.pg.query<T>(sql, params);
      if (own) {
        await this.pg.exec('commit');
      } else {
        await this.pg.exec(`reset role; select set_config('request.jwt.claims', '', true); release savepoint mm_call`);
      }
      return res.rows;
    } catch (e) {
      await this.pg.exec(own ? 'rollback' : 'rollback to savepoint mm_call; release savepoint mm_call');
      throw e;
    }
  }
}

/** Espera que la promesa falle; con `code`, que el error sea ese (mensaje, p. ej. 'no_permitido', o SQLSTATE). */
export async function fails(p: Promise<unknown>, code?: string | string[]): Promise<SqlError> {
  let err: SqlError | null = null;
  try {
    await p;
  } catch (e) {
    err = e as SqlError;
  }
  expect(err, 'se esperaba un error').not.toBeNull();
  if (code) {
    const codes = Array.isArray(code) ? code : [code];
    const got = `${err!.code ?? ''} ${err!.message}`;
    expect(
      codes.some((c) => err!.code === c || err!.message === c),
      `error esperado ${codes.join('|')}, llegó: ${got}`,
    ).toBe(true);
  }
  return err!;
}

/** Espera que la promesa salga bien y devuelve su valor (el error, si hay, sale completo en la prueba). */
export async function ok<T>(p: Promise<T>): Promise<T> {
  return p;
}

/** Error de permisos: nuestra RPC ('no_permitido') o Postgres (42501: sin GRANT o RLS). */
export const DENIED = ['no_permitido', '42501'];
/** Dato inválido: nuestra RPC ('invalido') o una restricción/tipo de Postgres. */
export const INVALID = ['invalido', '23514', '23502', '22P02', '22023', '22003', '23503'];
