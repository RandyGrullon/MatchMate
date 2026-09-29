/**
 * La prueba de humo de la base real (scripts/supabase/smoke.sql) corrida en PGlite con el shim y las migraciones,
 * igual que el resto de las pruebas SQL. Comprueba que pasa entera, que no deja nada (termina en ROLLBACK), que
 * se puede repetir, que de verdad detecta una base rota y que corta sin escribir si un cliente la partiera en
 * sentencias sueltas.
 *
 * Correr solo esta: npx vitest run -c vitest.sql.config.ts tests/sql/smoke.test.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootDb } from './harness';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SMOKE_FILE = join(ROOT, 'scripts', 'supabase', 'smoke.sql');
const SMOKE = readFileSync(SMOKE_FILE, 'utf8');

interface SmokeRun {
  notices: string[];
  error: Error | null;
  /** Filas del resumen final (paso, ok). */
  summary: { paso: number; ok: string }[];
}

/** Corre el archivo entero en una sola llamada (como `supabase db query -f`), juntando los NOTICE. */
async function runSmoke(db: PGlite, sql = SMOKE): Promise<SmokeRun> {
  const notices: string[] = [];
  try {
    const results = await db.exec(sql, { onNotice: (n) => notices.push(n.message ?? '') });
    const summary = (results.find((r) => r.fields.some((f) => f.name === 'paso'))?.rows ?? []) as SmokeRun['summary'];
    return { notices, error: null, summary };
  } catch (e) {
    // La transacción quedó abortada: se cierra como lo haría la conexión al terminar.
    await db.exec('rollback').catch(() => undefined);
    return { notices, error: e as Error, summary: [] };
  }
}

/** Cuántas filas quedan de lo que la prueba toca (tiene que ser lo mismo antes y después). */
async function footprint(db: PGlite): Promise<Record<string, number>> {
  const tables = [
    'auth.users', 'public.profiles', 'public.leagues', 'public.league_members', 'public.players', 'public.events', 'public.entries',
    'public.submissions', 'public.matches', 'public.teams', 'public.team_players', 'public.golf_cards', 'public.swim_entries',
    'public.push_subscriptions', 'public.push_outbox', 'public.league_announcements', 'public.admin_audit', 'public.tombstones',
    'public.league_invites', 'public.legal_acceptances', 'public.reports', 'public.event_lanes', 'private.league_creations',
    'public.seasons', 'public.season_awards', 'public.playoffs', 'public.playoff_series', 'public.solo_sessions',
    'public.solo_likes', 'private.logo_uploads', 'private.op_log', 'private.rate_limits',
  ];
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = (await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0].n;
  return out;
}

/** Sentencias de nivel superior del archivo (los bloques $$ … $$ van enteros). Solo para simular un cliente que las parte. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let inDollar = false;
  for (const line of sql.split(/\r?\n/)) {
    if (!inDollar && (line.trim() === '' || line.trim().startsWith('--')) && cur.length === 0) continue;
    cur.push(line);
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) {
      out.push(cur.join('\n'));
      cur = [];
    }
  }
  return out;
}

let db: PGlite;

beforeAll(async () => {
  db = await bootDb();
});
afterAll(async () => {
  await db.close();
});

describe('scripts/supabase/smoke.sql', () => {
  it('empieza con BEGIN, termina con ROLLBACK y no tiene COMMIT', () => {
    const parts = statements(SMOKE).map((s) => s.replace(/^\s*--[^\n]*\n/gm, '').trim().toLowerCase());
    expect(parts[0]).toBe('begin;');
    expect(parts.at(-1)).toBe('rollback;');
    // Ninguna otra sentencia cierra la transacción (commit, end, rollback, savepoint suelto…).
    const closers = parts.slice(1, -1).filter((s) => /^(commit|end|rollback|abort|begin|start|release|savepoint|prepare)\b/.test(s));
    expect(closers).toEqual([]);
  });

  it('pasa entera en PGlite (shim + migraciones) y no deja nada', async () => {
    const before = await footprint(db);
    const run = await runSmoke(db);
    // SMOKE_VERBOSE=1 muestra lo mismo que se vería al correrla contra Supabase.
    if (process.env.SMOKE_VERBOSE) console.log(run.notices.join('\n'));
    expect(run.error?.message ?? null, run.notices.slice(-3).join(' | ')).toBeNull();
    const oks = run.notices.filter((n) => n.startsWith('OK '));
    expect(run.notices.some((n) => n.startsWith('SMOKE OK:'))).toBe(true);
    expect(run.summary.map((r) => `OK ${r.ok}`)).toEqual(oks);
    expect(oks.length).toBeGreaterThanOrEqual(70);
    // Lo que tiene que estar sí o sí.
    for (const step of [
      'OK boliche: el dueño aprueba',
      'OK ranking: un miembro lee',
      'OK pádel: Beto (lado 2) confirma el primero y reclama el segundo',
      'OK pádel: el admin resuelve el reclamo',
      'OK fútbol: la capitana suma a Luis',
      'OK golf: Ana se inscribe',
      'OK natación: el admin publica la serie',
      'OK avisos: league_announce',
      'OK bloqueo: una cuenta bloqueada no envía juegos [falla como debe: bloqueada]',
      'OK permisos: alguien de fuera no ve la liga privada',
      'OK permisos: un miembro no llama admin_overview [falla como debe: no_permitido]',
      'OK permisos: anon no crea ligas [falla como debe: permission denied for function create_league]',
      'OK consola: admin_overview',
      'OK avisos: los envíos aprobados de Ana le llegan al teléfono',
      'OK avisos: Ana apaga y prende los avisos sociales (set_push_prefs)',
      'OK permisos: un miembro no llama admin_storage_usage [falla como debe: no_permitido]',
      'OK usuarios: el dueño se pone su @usuario',
      'OK usuarios: Ana encuentra al dueño por su @usuario',
      'OK invitaciones: el dueño invita a Beto',
      'OK invitaciones: Beto ve la invitación',
      'OK legal: Ana acepta lo vigente',
      'OK legal: el dueño ve los reportes de su liga sin quién reportó',
      'OK legal: el dueño no decide el reporte de su propio juego [falla como debe: no_permitido]',
      'OK legal: el superadmin ve quién reportó',
      'OK legal: lo que descartó el dueño no se vuelve a decidir [falla como debe: cerrado]',
      'OK organizador: league_pending, pistas del torneo por equipo con su aviso y suspend_day_preview de hoy',
      'OK permisos: anon no ve ligas privadas; sí ve los deportes, las ligas públicas',
      'OK playoffs: el admin arma la final',
      'OK temporadas: el admin cierra la temporada con el campeón',
      'OK agenda: «¿Dónde juego esta semana?» responde sin cuenta',
      'OK sueltos: el dueño ve solo el compartido de Ana',
      'OK logo: el dueño pone y cambia el logo',
    ]) {
      expect(oks.some((n) => n.startsWith(step)), step).toBe(true);
    }
    // ROLLBACK: la base queda igual que antes (tampoco quedan las ayudas de pg_temp).
    expect(await footprint(db)).toEqual(before);
    expect((await db.query(`select count(*)::int as n from pg_proc p where p.pronamespace = pg_my_temp_schema()`)).rows).toEqual([{ n: 0 }]);
  });

  it('se puede correr otra vez (cuentas y ligas nuevas cada vez)', async () => {
    const run = await runSmoke(db);
    expect(run.error?.message ?? null, run.notices.slice(-3).join(' | ')).toBeNull();
  });

  it('detecta una base rota: el bloqueo no bloquea', async () => {
    const [{ def }] = (await db.query<{ def: string }>(`select pg_get_functiondef('private.is_blocked(uuid)'::regprocedure) as def`)).rows;
    await db.exec(`create or replace function private.is_blocked(p_user uuid) returns boolean
                   language sql stable security definer set search_path = '' as $$ select false $$`);
    try {
      const run = await runSmoke(db);
      expect(run.error?.message).toMatch(/^FAIL bloqueo: una cuenta bloqueada no envía juegos: tenía que fallar y pasó/);
      expect(run.notices.some((n) => n.startsWith('SMOKE OK'))).toBe(false);
    } finally {
      await db.exec(def);
    }
  });

  it('detecta una base rota: cualquiera es admin de cualquier liga', async () => {
    const [{ def }] = (await db.query<{ def: string }>(`select pg_get_functiondef('private.is_admin(uuid)'::regprocedure) as def`)).rows;
    await db.exec(`create or replace function private.is_admin(p_league uuid) returns boolean
                   language sql stable security definer set search_path = '' as $$ select true $$`);
    try {
      const run = await runSmoke(db);
      expect(run.error?.message).toMatch(/^FAIL permisos: un miembro no aprueba envíos: tenía que fallar y pasó/);
    } finally {
      await db.exec(def);
    }
  });

  it('detecta una base rota: una liga privada visible para todos', async () => {
    await db.exec(`create policy smoke_leak on public.leagues for select to authenticated using (true)`);
    try {
      const run = await runSmoke(db);
      expect(run.error?.message).toMatch(/^FAIL boliche: Ana ve la liga privada antes de unirse/);
    } finally {
      await db.exec('drop policy smoke_leak on public.leagues');
    }
  });

  it('sin dejar rastro también cuando falla', async () => {
    const before = await footprint(db);
    await db.exec(`create policy smoke_leak on public.leagues for select to authenticated using (true)`);
    try {
      expect((await runSmoke(db)).error).not.toBeNull();
    } finally {
      await db.exec('drop policy smoke_leak on public.leagues');
    }
    expect(await footprint(db)).toEqual(before);
  });

  it('si un cliente partiera el archivo en sentencias sueltas (cada una con su COMMIT), no escribe nada aunque siga después de los errores', async () => {
    const before = await footprint(db);
    const parts = statements(SMOKE);
    expect(parts[0].trim().toLowerCase()).toBe('begin;');
    const errors: { at: number; message: string }[] = [];
    try {
      // Sin el BEGIN: cada sentencia es su propia transacción (autocommit), y el cliente sigue aunque una falle.
      for (const [i, part] of parts.slice(1).entries()) {
        try {
          await db.exec(part);
        } catch (e) {
          errors.push({ at: i + 1, message: (e as Error).message });
        }
      }
    } finally {
      await db.exec('discard temp');
      await db.exec(`reset role; select set_config('request.jwt.claims', '', false), set_config('request.headers', '', false)`);
    }
    // Lo primero que falla es el previo (antes de crear cuentas), y la creación de cuentas también se niega.
    expect(errors[0].message).toMatch(/^SMOKE ABORTADO: no corre dentro de una sola transacción/);
    expect(parts[errors[0].at]).toMatch(/perform pg_temp\.guard\(\)/);
    const users = parts.findIndex((p) => p.includes('insert into auth.users'));
    expect(errors.find((e) => e.at === users)?.message).toMatch(/^SMOKE ABORTADO/);
    expect(await footprint(db)).toEqual(before);
  });
});
