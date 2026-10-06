/**
 * Insignias de punta a punta: la base de verdad (PGlite con todas las migraciones), la Edge Function `insignias`
 * (supabase/functions/insignias/core.ts) por su API REST de mentira con la clave secreta (service_role) y el motor
 * EMPAQUETADO tal como lo carga Deno (supabase/functions/_shared/badges-engine.gen.js). Así se prueba el contrato
 * entre badge_snapshot, el motor y badge_apply, y los permisos de las RPC de la función.
 *
 * Además, 20260929001190_insignias_cron_supabase.sql (solo Supabase) contra un pg_cron de mentira: programa
 * mm-insignias y mm-insignias-diario, se puede volver a correr y sin pg_cron no hace nada.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleRequest, type BadgesDeps } from '../../supabase/functions/insignias/core';
import { SOURCE_HASH, evaluateJob } from '../../supabase/functions/_shared/badges-engine.gen.js';
import { MIGRATIONS_DIR, SERVICE, TestDb, type SqlError } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

const CRON_SQL = readFileSync(join(MIGRATIONS_DIR, '20260929001190_insignias_cron_supabase.sql'), 'utf8');
const SECRET = 'secreto-del-cron-de-prueba-0123456789';
const BASE = 'https://proyecto.test/rest/v1/rpc/';

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  await db.admin('delete from private.badge_queue');
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, unknown>;

/** PostgREST contra esta base, como service_role: `select public.<fn>(args por nombre)`. */
function rest() {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    expect(url.startsWith(BASE)).toBe(true);
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_secret_prueba');
    const fn = url.slice(BASE.length);
    const args = JSON.parse(String(init?.body ?? '{}')) as Json;
    calls.push(fn);
    const keys = Object.keys(args);
    const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
    try {
      const rows = await db.as<{ r: unknown }>(SERVICE, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, values);
      return new Response(JSON.stringify(rows[0]?.r ?? null));
    } catch (e) {
      return new Response(JSON.stringify({ code: (e as SqlError).code ?? 'P0001', message: (e as Error).message }), { status: 400 });
    }
  }) as typeof fetch;
  return { calls, fetchFn };
}

function call(evaluate: BadgesDeps['evaluate'] = (job, snapshot, now) => evaluateJob(job, snapshot, now)) {
  const r = rest();
  const lines: string[] = [];
  const env: Record<string, string> = {
    CRON_SECRET: SECRET,
    SUPABASE_URL: 'https://proyecto.test',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_prueba' }),
  };
  const run = async () => {
    const res = await handleRequest(
      new Request('https://proyecto.test/functions/v1/insignias', { method: 'POST', headers: { 'x-cron-secret': SECRET }, body: '{}' }),
      { env: (name) => env[name], fetch: r.fetchFn, evaluate, engine: SOURCE_HASH, log: (l) => lines.push(l) },
    );
    return { status: res.status, body: (await res.json()) as Json };
  };
  return { run, calls: r.calls, lines };
}

/**
 * La práctica e1 (22 de septiembre) de la liga privada, ya real (§1.7.4: 4 cuentas establecidas con actividad en
 * el mes, sin contar la que se evalúa): org, sofi, ana y otra juegan con foto, y luis sus 3 líneas. Cada
 * participación encola su trabajo 'resultado'.
 */
async function realLeagueNight() {
  const people = [w.u.org, w.u.sofi, w.u.ana, w.u.otra, w.u.luis];
  await db.admin(`update public.profiles set created_at = '2026-01-05T12:00:00Z' where id = any ($1)`, [people]);
  await db.admin(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'member', 'otra')`, [w.priv, w.u.otra]);
  // Cada juego con su foto del marcador (el id de la foto, como lo guarda la app).
  const photos = () => [1, 2, 3].map(() => crypto.randomUUID());
  for (const [i, uid] of people.slice(0, 4).entries()) {
    const [{ id }] = await db.admin<{ id: string }>('insert into public.players (league_id, name, user_id) values ($1, $2, $3) returning id', [
      w.priv,
      `Jugador ${i}`,
      uid,
    ]);
    await db.admin('insert into public.entries (league_id, event_id, player_id, scores, photos) values ($1, $2, $3, $4, $5)', [
      w.priv,
      w.e.e1,
      id,
      [140, 150, 160],
      photos(),
    ]);
  }
  await db.admin('update public.entries set scores = $2, photos = $3 where id = $1', [w.e1Luis, [150, 162, 171], photos()]);
}

/** Solo luis juega (la liga no es real: el motor no da nada, pero el trabajo corre). */
async function luisPlays() {
  const photos = [1, 2, 3].map(() => crypto.randomUUID());
  await db.admin('update public.entries set scores = $2, photos = $3 where id = $1', [w.e1Luis, [150, 162, 171], photos]);
}

const queue = () => db.admin<{ kind: string; ref: string; attempts: number; locked: boolean; last_error: string | null }>(
  `select kind, ref, attempts, locked_at is not null as locked, last_error from private.badge_queue order by id`,
);
const awards = () =>
  db.admin<{ badge_key: string; sport: string; level: number; user_id: string | null; player_id: string | null; status: string; context: Json }>(
    'select badge_key, sport, level, user_id, player_id, status, context from public.badge_awards order by badge_key, level',
  );

describe('Edge Function insignias con la base y el motor empaquetado', () => {
  it('resultados nuevos: toma los trabajos, el motor decide y la base aplica (con el nombre para el push)', async () => {
    await realLeagueNight();
    const jobs = await queue();
    expect(jobs.map((j) => j.kind)).toEqual(['resultado', 'resultado', 'resultado', 'resultado', 'resultado']);

    const f = call();
    const { status, body } = await f.run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ claimed: 5, applied: 5, failed: 0, gone: 0, released: 0, remaining: 0, chained: false, engine: SOURCE_HASH });
    // Toma 5 (lo que pidió): pide otra tanda, que viene vacía, y cierra.
    expect(f.calls).toEqual([
      'badge_claim',
      ...Array.from({ length: 5 }, () => ['badge_snapshot', 'badge_apply']).flat(),
      'badge_claim',
      'badge_finish',
    ]);

    // Su primera línea de boliche, de cuenta, para cada uno; con el nombre del deporte para el aviso.
    const got = await awards();
    const debuts = got.filter((a) => a.badge_key === 'debut');
    expect(new Set(debuts.map((a) => a.user_id))).toEqual(new Set([w.u.org, w.u.sofi, w.u.ana, w.u.otra, w.u.luis]));
    for (const a of debuts) {
      expect(a).toMatchObject({ sport: 'bowling', level: 0, player_id: null });
      expect(a.context).toMatchObject({ v: 1, name: 'Primera línea' });
    }
    for (const a of got) expect(a.context.name, a.badge_key).toEqual(expect.any(String));
    expect(body.awarded).toBe(got.length);
    // Los trabajos se fueron; quedan los avisos agrupados de cada cuenta (los resuelve SQL: badge_send_notices).
    expect((await queue()).every((j) => j.kind === 'aviso')).toBe(true);

    // Otra llamada: no hay nada que correr; y el mismo resultado otra vez no repite nada (idempotente).
    expect((await f.run()).body).toMatchObject({ claimed: 0 });
    await db.admin('select private.badge_enqueue($1, $2, null, $3, $4::jsonb)', [
      'resultado',
      w.priv,
      `entry:${w.e1Luis}`,
      JSON.stringify({ players: [w.p.luis] }),
    ]);
    expect((await f.run()).body).toMatchObject({ claimed: 1, applied: 1, awarded: 0 });
    expect(await awards()).toEqual(got);
  });

  it('en una liga que no es real el trabajo corre igual y no da nada', async () => {
    await luisPlays();
    expect((await call().run()).body).toMatchObject({ claimed: 1, applied: 1, failed: 0, awarded: 0 });
    expect(await awards()).toEqual([]);
    expect(await queue()).toEqual([]);
  });

  it('si el motor falla, el trabajo vuelve a la cola con el error y el intento contado', async () => {
    await luisPlays();
    const f = call(() => {
      throw new Error('fallo de prueba');
    });
    expect((await f.run()).body).toMatchObject({ claimed: 1, applied: 0, failed: 1 });
    expect(await queue()).toEqual([{ kind: 'resultado', ref: `entry:${w.e1Luis}`, attempts: 1, locked: false, last_error: 'motor: Error: fallo de prueba' }]);
    expect(await awards()).toEqual([]);
  });

  it('el historial (§3.5): en seco no escribe insignias y deja el resumen; de verdad, todas juntas con un solo aviso por cuenta', async () => {
    await realLeagueNight();
    // La base son las cuentas activas el último año según el reloj de la base: la práctica fue hace dos semanas.
    await db.admin(`update public.events set date = (now() at time zone private.badge_tz())::date - 14 where id = $1`, [w.e.e1]);
    await db.admin('delete from private.badge_queue');
    const f = call();

    // En seco (lo que hace primero el superadmin): un trabajo por la liga y uno por cada cuenta con jugadores en ella.
    const dry = await db.rpc<{ runId: string; dryRun: boolean; jobs: number; leagues: number; accounts: number }>(w.u.dios, 'badges_backfill', { p_league: w.priv });
    expect(dry).toMatchObject({ dryRun: true, leagues: 1 });
    expect(dry.accounts).toBeGreaterThanOrEqual(5);
    expect((await f.run()).body).toMatchObject({ claimed: dry.jobs, applied: dry.jobs, failed: 0 });
    expect(await awards()).toEqual([]);
    expect(await queue()).toEqual([]);
    const summary = await db.admin<{ badge_key: string; sport: string; level: number; holders: number; base: number }>(
      'select badge_key, sport, level, holders, base from private.badge_dry_runs where run_id = $1 order by badge_key, sport, level',
      [dry.runId],
    );
    expect(summary).toContainEqual({ badge_key: 'debut', sport: 'bowling', level: 0, holders: 5, base: 5 });

    // De verdad: lo mismo queda escrito, marcado como del historial y ya avisado (el push sale uno por cuenta al final).
    const real = await db.rpc<{ runId: string; jobs: number }>(w.u.dios, 'badges_backfill', { p_league: w.priv, p_dry_run: false });
    const second = await f.run();
    console.log(JSON.stringify(second.body), JSON.stringify(await queue()), f.lines.join(' | '));
    const got = await awards();
    expect(new Set(got.filter((a) => a.badge_key === 'debut').map((a) => a.user_id))).toEqual(new Set([w.u.org, w.u.sofi, w.u.ana, w.u.otra, w.u.luis]));
    for (const a of got) expect(a.context).toMatchObject({ historial: true, name: expect.any(String) });
    const notices = await db.admin<{ kind: string; ref: string; user_id: string }>(`select kind, ref, user_id from private.badge_queue order by user_id`);
    expect(notices.every((j) => j.kind === 'aviso' && j.ref === 'historial')).toBe(true);
    expect(new Set(notices.map((j) => j.user_id))).toEqual(new Set([w.u.org, w.u.sofi, w.u.ana, w.u.otra, w.u.luis]));
    expect(await db.count('public.badge_awards', 'notified_at is null')).toBe(0);
  });

  it('una copia de respaldo pasa a la cuenta cuando el jugador sin cuenta la reclama (§1.6)', async () => {
    await realLeagueNight();
    await db.admin('delete from private.badge_queue');
    // Un jugador sin cuenta con su copia de respaldo de una insignia de cuenta (la ganó antes de tener cuenta).
    const [{ id: loose }] = await db.admin<{ id: string }>('insert into public.players (league_id, name) values ($1, $2) returning id', [w.priv, 'Sin cuenta']);
    await db.admin(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'member', 'nuevo')`, [w.priv, w.u.nuevo]);
    await db.admin(
      `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status, awarded_at, firm_at, context, notified_at)
       values ('bowling_games', 'bowling', 1, '-', $1, $2, 'firme', now() - interval '30 days', now() - interval '23 days', '{"v": 1}', now())`,
      [loose, w.priv],
    );
    // La cuenta nueva lo reclama (vincular encola 'vinculo'): la copia pasa a la cuenta sin aviso nuevo.
    await db.admin('update public.players set user_id = $2 where id = $1', [loose, w.u.nuevo]);
    expect((await queue()).map((j) => [j.kind, j.ref])).toEqual([['vinculo', `player:${loose}`]]);
    expect((await call().run()).body).toMatchObject({ claimed: 1, applied: 1, failed: 0 });
    const moved = await db.admin<{ player_id: string | null; user_id: string | null; league_id: string | null; status: string }>(
      `select player_id, user_id, league_id, status from public.badge_awards where badge_key = 'bowling_games'`,
    );
    expect(moved).toEqual([{ player_id: null, user_id: w.u.nuevo, league_id: null, status: 'firme' }]);
    expect(await db.count('public.badge_awards', 'notified_at is null')).toBe(0);
  });

  it('un admin que se reclama a sí mismo (aprobado al instante): de ese jugador solo cuenta lo verificado, por la foto y no por el trabajo', async () => {
    await realLeagueNight();
    await db.admin('delete from private.badge_queue');
    // Pedro, sin cuenta, tiene la copia de respaldo provisional de una insignia de cuenta (su historial sin verificar).
    await db.admin(
      `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status, awarded_at, firm_at, context)
       values ('bowling_games', 'bowling', 1, '-', $1, $2, 'provisional', now() - interval '2 days', now() + interval '5 days', '{"v": 1}')`,
      [w.p.pedro, w.priv],
    );
    // sofi (admin) dice que es Pedro: su reclamo se aprueba solo.
    await db.rpc(w.u.sofi, 'request_player_claim', { p_player: w.p.pedro });
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.pedro])).toEqual([{ user_id: w.u.sofi }]);
    expect((await queue()).map((j) => j.kind)).toContain('vinculo');
    // La función pasa el trabajo tal cual sale de la cola (sin verified_only): lo dice la foto.
    const seen: unknown[] = [];
    const f = call((job, snapshot, now) => {
      seen.push(...((snapshot as { players?: { id: string; verified_only?: boolean }[] }).players ?? []).filter((x) => x.id === w.p.pedro));
      return evaluateJob(job, snapshot, now);
    });
    expect((await f.run()).body).toMatchObject({ failed: 0 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((x) => (x as { verified_only?: boolean }).verified_only === true)).toBe(true);
    // La copia provisional no pasa a la cuenta: se retira.
    expect(
      await db.admin(`select player_id, user_id, status, revoke_reason from public.badge_awards where badge_key = 'bowling_games'`),
    ).toEqual([{ player_id: w.p.pedro, user_id: null, status: 'revocada', revoke_reason: 'evidencia' }]);
    // Un resultado después (no un vínculo): la foto lo sigue marcando.
    await db.admin('select private.badge_enqueue($1, $2, null, $3, $4::jsonb)', ['resultado', w.priv, `player:${w.p.pedro}`, JSON.stringify({ players: [w.p.pedro] })]);
    seen.length = 0;
    expect((await f.run()).body).toMatchObject({ failed: 0 });
    expect(seen).toEqual([expect.objectContaining({ id: w.p.pedro, verified_only: true })]);
  });

  it('cada tipo de trabajo corre de punta a punta con el motor de verdad sin que la base rechace lo que decide', async () => {
    await realLeagueNight();
    const f = call();
    expect((await f.run()).body).toMatchObject({ failed: 0 });
    const kinds: [string, string | null, string | null, string][] = [
      ['cuenta', null, w.u.luis, 'cuenta'],
      ['cuenta', null, w.u.org, 'cuenta'],
      ['mes', w.priv, null, '2026-09'],
      ['mes', null, w.u.luis, '2026-09'],
      ['anio', w.priv, null, '2025'],
      ['anio', null, w.u.luis, '2025'],
      ['evento', w.priv, null, `event:${w.e.e1}`],
      ['revisar', w.priv, null, `entry:${w.e1Luis}`],
      ['vinculo', w.priv, w.u.luis, `player:${w.p.luis}`],
    ];
    for (const [kind, league, user, ref] of kinds) {
      await db.admin(`select private.badge_enqueue($1, $2, $3, $4, '{}'::jsonb, now() - interval '1 minute')`, [kind, league, user, ref]);
    }
    const body = (await f.run()).body;
    expect(await queue().then((q) => q.filter((j) => j.last_error))).toEqual([]);
    expect(body).toMatchObject({ claimed: kinds.length, applied: kinds.length, failed: 0 });
  });

  it('pádel de punta a punta: partidos confirmados por el rival en una liga real, su mes y sus cuentas', async () => {
    const people = [w.u.org, w.u.sofi, w.u.luis, w.u.ana, w.u.otra, w.u.nuevo];
    await db.admin(`update public.profiles set created_at = '2026-01-05T12:00:00Z' where id = any ($1)`, [people]);
    const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'private', sport: 'padel', requirePhoto: false });
    await db.admin(`update public.leagues set rules = '{"match": {"sport": "padel"}}' where id = $1`, [lid]);
    await member(db, lid, w.u.org, 'owner', 'org');
    const names = ['sofi', 'luis', 'ana', 'otra', 'nuevo'];
    for (const [i, uid] of people.slice(1).entries()) await member(db, lid, uid, 'member', names[i]);
    const p: Record<string, string> = {};
    for (const [i, uid] of people.entries()) p[uid] = await player(db, lid, `Jugador ${i}`, uid);
    const play = async (a: [string, string], b: [string, string], by: string, confirm: string) => {
      const [m] = await db.rpc<string[]>(w.u.org, 'create_matches', {
        p_league: lid,
        p_matches: [
          {
            sides: [
              { side: 1, players: a.map((u) => ({ player_id: p[u] })) },
              { side: 2, players: b.map((u) => ({ player_id: p[u] })) },
            ],
          },
        ],
      });
      await db.rpc(by, 'finish_match', { p_match: m, p_score: { text: '6-4 6-3', sides: [2, 0] }, p_winner: 1 });
      await db.rpc(confirm, 'confirm_result', { p_match: m });
      return m;
    };
    await play([w.u.luis, w.u.ana], [w.u.otra, w.u.nuevo], w.u.luis, w.u.otra);
    await play([w.u.org, w.u.sofi], [w.u.luis, w.u.ana], w.u.sofi, w.u.ana);
    await play([w.u.otra, w.u.nuevo], [w.u.org, w.u.sofi], w.u.nuevo, w.u.org);
    const month = (await db.admin<{ m: string }>(`select to_char(now() at time zone 'America/Santo_Domingo', 'YYYY-MM') as m`))[0].m;
    for (const [kind, league_, user, ref] of [
      ['cuenta', null, w.u.luis, 'cuenta'],
      ['mes', lid, null, month],
      ['mes', null, w.u.otra, month],
      ['vinculo', lid, w.u.ana, `player:${p[w.u.ana]}`],
    ] as [string, string | null, string | null, string][]) {
      await db.admin(`select private.badge_enqueue($1, $2, $3, $4, '{}'::jsonb, now() - interval '1 minute')`, [kind, league_, user, ref]);
    }
    // Lo propuesto espera 48 h; lo confirmado corre ya: todo lo de ahora sale en una llamada.
    const f = call();
    const body = (await f.run()).body;
    expect(await queue().then((q) => q.filter((j) => j.last_error))).toEqual([]);
    expect(body).toMatchObject({ failed: 0 });
    expect(Number(body.claimed)).toBeGreaterThanOrEqual(7);
    // Cada cuenta que jugó tiene su debut de pádel, con el nombre para el push.
    const debuts = (await awards()).filter((a) => a.badge_key === 'debut' && a.sport === 'padel');
    expect(new Set(debuts.map((a) => a.user_id))).toEqual(new Set(people));
    for (const a of debuts) expect(a.context).toMatchObject({ name: expect.any(String) });
  });

  it('las RPC de la función son solo de service_role', async () => {
    const rpcs = [
      'select public.badge_claim(1)',
      'select public.badge_snapshot(1)',
      `select public.badge_apply(1, '[]')`,
      `select public.badge_fail(1, 'x')`,
      'select public.badge_finish()',
    ];
    for (const sql of rpcs) {
      await expect(db.as(w.u.luis, sql)).rejects.toMatchObject({ code: '42501' });
    }
  });
});

describe('20260929001190_insignias_cron_supabase.sql', () => {
  it('sin pg_cron (PGlite) no hace nada', async () => {
    await db.pg.exec(CRON_SQL);
    expect(await db.admin(`select to_regnamespace('cron') is null as none`)).toEqual([{ none: true }]);
  });

  it('con pg_cron: programa las dos tareas por nombre, reemplaza las viejas y se puede volver a correr', async () => {
    // Un pg_cron de mentira: la extensión «disponible e instalada» (vistas temporales que tapan las del catálogo) y el
    // esquema cron con job, schedule y unschedule como los de pg_cron (unschedule falla si el nombre no existe).
    await db.pg.exec(`
      create temp view pg_available_extensions as select 'pg_cron'::name as name;
      create temp view pg_extension as select 'pg_cron'::name as extname;
      create schema cron;
      create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null);
      create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
        insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
        on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid
      $$;
      create function cron.unschedule(p_name text) returns boolean language plpgsql as $$
      begin
        delete from cron.job where jobname = p_name;
        if not found then
          raise exception 'could not find valid entry for job %', p_name;
        end if;
        return true;
      end $$;
      insert into cron.job (jobname, schedule, command) values ('mm-insignias', '0 * * * *', 'select 1'), ('mm-limpieza', '30 8 * * *', 'select 2');
    `);
    const jobs = () => db.admin<{ jobname: string; schedule: string; command: string }>('select jobname, schedule, command from cron.job order by jobname');
    await db.pg.exec(CRON_SQL);
    const expected = [
      { jobname: 'mm-insignias', schedule: '*/10 * * * *', command: 'select private.cron_badges()' },
      { jobname: 'mm-insignias-diario', schedule: '30 4 * * *', command: 'select private.badges_daily(now())' },
      { jobname: 'mm-limpieza', schedule: '30 8 * * *', command: 'select 2' },
    ];
    expect(await jobs()).toEqual(expected);
    await db.pg.exec(CRON_SQL);
    expect(await jobs()).toEqual(expected);
    // Lo que corren existe y funciona aquí (sin Vault ni pg_net no llaman a nadie).
    await luisPlays();
    for (const { command } of expected.slice(0, 2)) await db.admin(command);
    const [{ r }] = await db.admin<{ r: { due: number; kicked: boolean } }>('select private.cron_badges() as r');
    expect(r.due).toBeGreaterThanOrEqual(1);
    expect(r.kicked).toBe(false);
  });
});
