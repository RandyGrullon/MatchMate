/**
 * Insignias, el motor (20260929000810_insignias_motor.sql y 20260929000880_insignias_temporadas.sql): la cola y los
 * triggers que la llenan, la foto de datos de cada trabajo (badge_snapshot), aplicar decisiones (badge_apply) con un
 * motor falso que devuelve decisiones fijas (idempotencia, reactivar, revocar provisionales, avales, progreso,
 * copias de respaldo, en seco), los avisos agrupados con horas tranquilas, la tarea diaria, la rareza, las RPC de la
 * app (badge_notices, badges_backfill) y de la Edge Function (solo service_role), y las temporadas cuando existen.
 *
 * Las funciones de private se llaman como superusuario con la hora (p_now) fija: así las horas tranquilas y los
 * días de la tarea diaria no dependen de cuándo corre la prueba.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, SERVICE, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';
import { DEMO_COURSE } from '../../src/sports/golf/demo';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEASONS_SQL = readFileSync(join(ROOT, 'supabase', 'migrations', '20260929000880_insignias_temporadas.sql'), 'utf8');

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
interface Job {
  id: number;
  kind: string;
  league_id: string | null;
  user_id: string | null;
  ref: string;
  payload: Json;
  run_after: string;
  attempts: number;
  locked: boolean;
  last_error: string | null;
}

/** Mediodía de Santo Domingo (UTC−4) de un día de octubre de 2026. */
const at = (day: number, hour = 12, min = 0) => new Date(Date.UTC(2026, 9, day, hour + 4, min)).toISOString();
const NOON = at(5);
const iso = (v: unknown) => new Date(v as string).toISOString();

const jobs = (where = 'true', params: unknown[] = []) =>
  db.admin<Job>(
    `select id, kind, league_id, user_id, ref, payload, run_after, attempts, locked_at is not null as locked, last_error
       from private.badge_queue where ${where} order by id`,
    params,
  );
const enqueue = async (kind: string, league: string | null, user: string | null, ref: string, payload: Json = {}, runAfter = NOON) => {
  await db.admin('select private.badge_enqueue($1, $2, $3, $4, $5::jsonb, $6::timestamptz)', [kind, league, user, ref, payload, runAfter]);
  const [j] = await jobs('kind = $1 and ref = $2 and league_id is not distinct from $3 and user_id is not distinct from $4 and locked_at is null', [
    kind,
    ref,
    league,
    user,
  ]);
  return j.id;
};
const apply = async (job: number, decisions: Json[], now = NOON) =>
  (await db.admin<{ r: Json }>('select private.badge_apply($1, $2::jsonb, $3::timestamptz) as r', [job, JSON.stringify(decisions), now]))[0].r;
const snapshot = async (job: number, now = NOON) =>
  (await db.admin<{ r: Json & Record<string, Json[]> }>('select private.badge_snapshot($1, $2::timestamptz) as r', [job, now]))[0].r;
const notices = async (now: string) => (await db.admin<{ n: number }>('select private.badge_send_notices($1::timestamptz) as n', [now]))[0].n;
const daily = async (now: string) => (await db.admin<{ r: Json }>('select private.badges_daily($1::timestamptz) as r', [now]))[0].r;
const awards = (where = 'true', params: unknown[] = []) =>
  db.admin<Json>(
    `select id, badge_key, sport, level, period_key, player_id, user_id, league_id, status, hidden, refs, context, revoke_reason,
            notified_at, seen_at, firm_at, awarded_at
       from public.badge_awards where ${where} order by awarded_at, id`,
    params,
  );
const pushes = (uid: string) =>
  db.admin<{ title: string; body: string; url: string; tag: string }>(
    'select title, body, url, tag from public.push_outbox where user_id = $1 order by id',
    [uid],
  );
let phoneN = 0;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/insignias-${++phoneN}`,
  ]);

/** Decisiones del motor falso (planas, como BadgeDecision). */
const give = (f: Json): Json => ({
  kind: 'award',
  badge_key: 'bowling_games',
  sport: 'bowling',
  level: 1,
  period_key: '-',
  player_id: null,
  user_id: null,
  league_id: null,
  status: 'provisional',
  refs: [],
  context: { name: 'Líneas jugadas', level_name: 'bronce' },
  ...f,
});
const revoke = (f: Json): Json => ({ kind: 'revoke', badge_key: 'bowling_games', sport: 'bowling', level: 1, period_key: '-', player_id: null, user_id: null, league_id: null, reason: 'evidencia', ...f });
const toUser = (uid: string) => ({ user_id: uid, league_id: null, player_id: null });
const toPlayer = (pid: string, lid: string) => ({ player_id: pid, league_id: lid, user_id: null });

/** Liga de pádel con dos parejas (luis + ana contra otra + nuevo) y un partido programado. */
async function padel() {
  const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'private', sport: 'padel', requirePhoto: false });
  await db.admin(`update public.leagues set rules = '{"match": {"sport": "padel"}}' where id = $1`, [lid]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const [uid, n] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
  ] as const)
    await member(db, lid, uid, 'member', n);
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
  };
  const match = async (extra: Json = {}) =>
    (
      await db.rpc<string[]>(w.u.sofi, 'create_matches', {
        p_league: lid,
        p_matches: [
          {
            sides: [
              { side: 1, players: [{ player_id: p.luis }, { player_id: p.ana }] },
              { side: 2, players: [{ player_id: p.otra }, { player_id: p.nuevo }] },
            ],
            ...extra,
          },
        ],
      })
    )[0];
  return { lid, p, match };
}

/** Un juego contado de luis en el torneo e9 no; en su liga privada, un torneo con un 200 con foto. */
async function counted(score = 200, photo = 'importado') {
  const ev = await event(db, w.priv, 'torneo', '2026-10-01', 3, 'Copa');
  const id = await entry(db, w.priv, ev, w.p.luis, [score], [photo]);
  return { ev, id };
}

describe('permisos', () => {
  it('la app: badge_notices (con sesión) y badges_backfill (superadmin); lo del motor, nadie de la app', async () => {
    const rows = await db.admin<{ fn: string; anon: boolean; auth: boolean; service: boolean; definer: boolean }>(
      `select n.nspname || '.' || p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as service, p.prosecdef as definer
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('badge_notices', 'badges_backfill', 'badge_claim', 'badge_snapshot', 'badge_apply',
                                                     'badge_fail', 'badge_finish')
        order by 1`,
    );
    expect(rows).toEqual([
      { fn: 'public.badge_apply', anon: false, auth: false, service: true, definer: true },
      { fn: 'public.badge_claim', anon: false, auth: false, service: true, definer: true },
      { fn: 'public.badge_fail', anon: false, auth: false, service: true, definer: true },
      { fn: 'public.badge_finish', anon: false, auth: false, service: true, definer: true },
      { fn: 'public.badge_notices', anon: false, auth: true, service: true, definer: true },
      { fn: 'public.badge_snapshot', anon: false, auth: false, service: true, definer: true },
      { fn: 'public.badges_backfill', anon: false, auth: true, service: true, definer: true },
    ]);
    // Nada de private: ni la app ni service_role (la Edge Function entra por las RPC de public).
    const priv = await db.admin<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and (p.proname like 'badge%' or p.proname = 'cron_badges' or p.proname = 'kick_badges')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
               or has_function_privilege('service_role', p.oid, 'execute'))`,
    );
    expect(priv).toEqual([]);
    for (const who of [ANON, w.u.org, w.u.dios]) {
      await fails(db.as(who, 'select public.badge_claim(5)'), DENIED);
      await fails(db.as(who, `select public.badge_apply(1, '[]'::jsonb)`), DENIED);
      await fails(db.as(who, 'select private.badges_daily(now())'), DENIED);
      await fails(db.as(who, 'select id from private.badge_queue'), DENIED);
    }
    await fails(db.as(SERVICE, 'select private.badge_snapshot(1, now())'), DENIED);
    await fails(db.rpc(ANON, 'badge_notices', {}), DENIED);
    await fails(db.rpc(w.u.org, 'badges_backfill', {}), DENIED);
    expect(await db.as(SERVICE, 'select public.badge_claim(5) as r')).toEqual([{ r: [] }]);
  });
});

describe('la cola', () => {
  it('lo repetido sin tomar se junta (jugadores sin repetir, la hora más temprana); lo tomado no', async () => {
    const a = await enqueue('resultado', w.priv, null, 'entry:x', { players: [w.p.luis] }, at(5, 13));
    const b = await enqueue('resultado', w.priv, null, 'entry:x', { players: [w.p.pedro, w.p.luis] }, at(5, 12));
    expect(b).toBe(a);
    const [j] = await jobs();
    expect(new Set(j.payload.players as string[])).toEqual(new Set([w.p.luis, w.p.pedro]));
    expect(iso(j.run_after)).toBe(at(5, 12));
    // 'evento' espera al último; 'aviso' se queda con su hora.
    await enqueue('evento', w.priv, null, 'event:x', {}, at(5, 12));
    await enqueue('evento', w.priv, null, 'event:x', {}, at(6, 12));
    await enqueue('aviso', null, w.u.luis, 'push', {}, at(5, 12));
    await enqueue('aviso', null, w.u.luis, 'push', {}, at(5, 18));
    expect((await jobs(`kind in ('evento', 'aviso')`)).map((x) => iso(x.run_after))).toEqual([at(6, 12), at(5, 12)]);
    // Tomado: uno nuevo igual entra aparte.
    await db.admin('select private.badge_claim(10, $1::timestamptz)', [at(7)]);
    await enqueue('resultado', w.priv, null, 'entry:x', { players: [w.p.luis] });
    expect(await db.count('private.badge_queue', `ref = 'entry:x'`)).toBe(2);
  });

  it('badge_claim: vencidos, sin avisos, sube attempts; lo tomado hace 10+ min vuelve; 5 intentos ya no', async () => {
    await enqueue('resultado', w.priv, null, 'entry:a', {}, at(5, 10));
    await enqueue('resultado', w.priv, null, 'entry:b', {}, at(5, 14));
    await enqueue('aviso', null, w.u.luis, 'push', {}, at(5, 10));
    const claim = async (now: string, n = 25) =>
      (await db.admin<{ r: { id: number; ref: string; attempts: number; kind: string }[] }>('select private.badge_claim($1, $2::timestamptz) as r', [n, now]))[0].r;
    const first = await claim(at(5, 12));
    expect(first.map((x) => [x.ref, x.attempts])).toEqual([['entry:a', 1]]);
    expect(await claim(at(5, 12, 5))).toEqual([]);
    expect((await claim(at(5, 12, 11))).map((x) => [x.ref, x.attempts])).toEqual([['entry:a', 2]]);
    // A las 3 pm: b venció y a lleva 10+ min tomado (la función se cayó).
    expect((await claim(at(5, 15))).map((x) => [x.ref, x.attempts])).toEqual([
      ['entry:a', 3],
      ['entry:b', 1],
    ]);
    await db.admin(`update private.badge_queue set attempts = 5, locked_at = null`);
    expect(await claim(at(6))).toEqual([]);
  });

  it('badge_fail: vuelve a la cola con espera y el error; si entró otro igual, se juntan', async () => {
    const id = await enqueue('resultado', w.priv, null, 'entry:a', { players: [w.p.luis] }, at(5, 10));
    await db.admin('select private.badge_claim(5, $1::timestamptz)', [at(5, 12)]);
    await db.admin('select private.badge_fail($1, $2, $3::timestamptz)', [id, 'boom', at(5, 12)]);
    let [j] = await jobs();
    expect([j.locked, j.attempts, j.last_error, iso(j.run_after)]).toEqual([false, 1, 'boom', at(5, 12, 2)]);
    await db.admin('select private.badge_claim(5, $1::timestamptz)', [at(5, 13)]);
    await enqueue('resultado', w.priv, null, 'entry:a', { players: [w.p.pedro] }, at(5, 13));
    await db.admin('select private.badge_fail($1, $2, $3::timestamptz)', [id, 'otra vez', at(5, 13)]);
    [j] = await jobs();
    expect(j.id).not.toBe(id);
    expect([j.attempts, j.last_error, new Set(j.payload.players as string[])]).toEqual([2, 'otra vez', new Set([w.p.luis, w.p.pedro])]);
  });
});

describe('los triggers encolan', () => {
  it('boliche: solo juegos contados; un cambio se junta; borrar revisa (el evento entero, un trabajo)', async () => {
    // El borrador de luis (sin marca) no encola; ponerle foto sí.
    await db.admin('update public.entries set scores = $2 where id = $1', [w.e1Luis, [160]]);
    expect(await jobs()).toEqual([]);
    await db.admin(`update public.entries set photos = '{sin-foto}' where id = $1`, [w.e1Luis]);
    await db.admin(`update public.entries set photos = '{importado}' where id = $1`, [w.e1Luis]);
    expect((await jobs()).map((j) => [j.kind, j.ref, j.league_id, j.payload.players])).toEqual([
      ['resultado', `entry:${w.e1Luis}`, w.priv, [w.p.luis]],
    ]);
    // Mover participaciones de jugador (juntar) no encola.
    await db.admin('delete from private.badge_queue');
    const { ev, id } = await counted();
    await db.admin('delete from private.badge_queue');
    await db.admin('delete from public.entries where id = $1', [id]);
    expect((await jobs()).map((j) => [j.kind, j.ref, j.payload.users])).toEqual([['revisar', `entry:${id}`, [w.u.luis]]]);
    await db.admin('delete from private.badge_queue');
    await entry(db, w.priv, ev, w.p.pedro, [180], ['importado']);
    await entry(db, w.priv, ev, w.p.luis, [190], ['importado']);
    await db.admin('delete from private.badge_queue');
    await db.admin('delete from public.events where id = $1', [ev]);
    expect((await jobs()).map((j) => [j.kind, j.ref, new Set(j.payload.players as string[])])).toEqual([
      ['revisar', `event:${ev}`, new Set([w.p.pedro, w.p.luis])],
    ]);
    // Borrar la liga no encola nada.
    await db.admin('delete from private.badge_queue');
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await jobs()).toEqual([]);
  });

  it('partidos: propuesto a las 48 h, confirmado ya (se juntan), anulado revisa con sus jugadores', async () => {
    const x = await padel();
    const m = await x.match();
    expect(await jobs()).toEqual([]);
    await db.rpc(w.u.luis, 'finish_match', { p_match: m, p_score: { text: '6-4 6-3', sides: [2, 0] }, p_winner: 1 });
    let [j] = await jobs();
    const [{ due }] = await db.admin<{ due: string }>(`select proposed_at + interval '48 hours' as due from public.matches where id = $1`, [m]);
    expect([j.kind, j.ref, iso(j.run_after)]).toEqual(['resultado', `match:${m}`, iso(due)]);
    await db.rpc(w.u.otra, 'confirm_result', { p_match: m });
    [j] = await jobs();
    expect(await db.count('private.badge_queue')).toBe(1);
    expect(iso(j.run_after)).toBe(iso((await db.admin<{ n: string }>('select now() as n'))[0].n));
    await db.admin('delete from private.badge_queue');
    await db.rpc(w.u.sofi, 'void_match', { p_match: m });
    [j] = await jobs();
    expect([j.kind, j.ref, new Set(j.payload.players as string[]), new Set(j.payload.users as string[])]).toEqual([
      'revisar',
      `match:${m}`,
      new Set(Object.values(x.p)),
      new Set([w.u.luis, w.u.ana, w.u.otra, w.u.nuevo]),
    ]);
  });

  it('la final de un cuadro encola el podio del evento 48 h después; borrar un partido que contaba revisa', async () => {
    const x = await padel();
    const [{ id: ev }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'torneo', 'Copa', '2026-10-05') returning id`, [x.lid]);
    const m = await x.match({ event_id: ev, bracket_key: 'R1-1' });
    await db.rpc(w.u.sofi, 'finish_match', { p_match: m, p_score: { text: '6-4 6-3', sides: [2, 0] }, p_winner: 1 });
    const ev48 = await jobs(`kind = 'evento'`);
    expect(ev48.map((j) => j.ref)).toEqual([`event:${ev}`]);
    const [{ ok }] = await db.admin<{ ok: boolean }>(
      `select $1::timestamptz >= now() + interval '47 hours' as ok`,
      [ev48[0].run_after],
    );
    expect(ok).toBe(true);
    await db.admin('delete from private.badge_queue');
    await db.admin('delete from public.matches where id = $1', [m]);
    expect((await jobs()).map((j) => [j.kind, j.ref, (j.payload.players as string[]).length])).toEqual([['revisar', `match:${m}`, 4]]);
  });

  it('golf: cerrar la ronda (tarjetas y podio a las 24 h); natación: finalizar el encuentro', async () => {
    const golf = await league(db, w.u.org, { name: 'Golf', visibility: 'private', sport: 'golf', requirePhoto: false });
    await member(db, golf, w.u.org, 'owner', 'org');
    await member(db, golf, w.u.luis, 'member', 'luis');
    const gl = await player(db, golf, 'Luis', w.u.luis);
    const course = await db.rpc<string>(w.u.org, 'golf_save_course', {
      p_league: golf,
      p_name: 'Campo',
      p_holes: DEMO_COURSE.holes.map((h) => ({ par: h.par, si: h.si })),
      p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
    });
    const ev = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: golf, p_date: '2026-09-20', p_course: course });
    await db.rpc(w.u.org, 'golf_add_players', { p_event: ev, p_players: [{ player_id: gl }] });
    // Una tarjeta firmada con todos los hoyos: antes de cerrar la ronda no encola ni cuenta.
    await db.admin(`update public.golf_cards set strokes = array_fill(5::smallint, array[18]), status = 'firmada', signed_at = now() where event_id = $1`, [ev]);
    expect(await jobs()).toEqual([]);
    const golfDays = () => db.admin('select sport, date::text as date, official, roster from private.badge_activity($1, null, null)', [[gl]]);
    expect(await golfDays()).toEqual([]);
    await db.admin(`update public.golf_rounds set status = 'cerrada', closed_at = now() where event_id = $1`, [ev]);
    expect((await jobs()).map((j) => [j.kind, j.ref, j.payload.players ?? null])).toEqual([
      ['resultado', `round:${ev}`, [gl]],
      ['evento', `event:${ev}`, null],
    ]);
    // G1: cuenta (no oficial: menos de 3 tarjetas).
    expect(await golfDays()).toEqual([{ sport: 'golf', date: '2026-09-20', official: false, roster: false }]);
    // Corregir una tarjeta de una ronda cerrada revisa.
    await db.admin('delete from private.badge_queue');
    await db.admin(`update public.golf_cards set dq = true where event_id = $1`, [ev]);
    expect((await jobs()).map((j) => [j.kind, j.ref.split(':')[0], j.payload.players])).toEqual([['revisar', 'card', [gl]]]);
    expect(await golfDays()).toEqual([]);
    await db.admin('delete from private.badge_queue');

    const swim = await league(db, w.u.org, { name: 'Natación', visibility: 'private', sport: 'swimming', requirePhoto: false });
    await member(db, swim, w.u.org, 'owner', 'org');
    const meet = await db.rpc<string>(w.u.org, 'swim_create_meet', { p_league: swim, p_date: '2026-10-10', p_name: 'Copa' });
    await db.rpc(w.u.org, 'swim_finalize_meet', { p_meet: meet });
    expect((await jobs()).map((j) => [j.kind, j.ref])).toEqual([
      ['resultado', `meet:${meet}`],
      ['evento', `event:${meet}`],
    ]);
    await db.admin('delete from private.badge_queue');
    await db.rpc(w.u.org, 'swim_finalize_meet', { p_meet: meet, p_final: false });
    expect((await jobs()).map((j) => [j.kind, j.ref])).toEqual([['revisar', `meet:${meet}`]]);
  });

  it('vincular y desvincular una cuenta; juntar dos jugadores al aprobar un reclamo', async () => {
    await db.rpc(w.u.org, 'link_account_to_player', { p_player: w.p.pedro, p_user: w.u.ana });
    expect((await jobs()).map((j) => [j.kind, j.user_id, j.ref, j.payload.players])).toEqual([['vinculo', w.u.ana, `player:${w.p.pedro}`, [w.p.pedro]]]);
    await db.admin('delete from private.badge_queue');
    await db.rpc(w.u.org, 'unlink_account', { p_player: w.p.pedro });
    expect((await jobs()).map((j) => [j.kind, j.user_id, j.payload.unlinked])).toEqual([['vinculo', w.u.ana, true]]);

    // Beto se une con su propio jugador y reclama a pedro; al aprobar, se juntan (merge) y se vincula.
    await db.admin('delete from private.badge_queue');
    const beto = await db.createUser('beto@x.com', 'beto');
    const r = await db.rpc<{ player_id: string; claim_id: string }>(beto, 'join_league', { p_code: w.code, p_prefer: w.p.pedro });
    await db.rpc(w.u.org, 'decide_player_claim', { p_claim: r.claim_id, p_approve: true });
    const got = await jobs();
    expect(got.map((j) => [j.kind, j.user_id, j.ref])).toEqual([
      ['vinculo', null, `player:${w.p.pedro}`],
      ['vinculo', beto, `player:${w.p.pedro}`],
    ]);
    expect(got[0].payload.merged).toBe(true);
  });

  it('liga por cajas: al cerrar el mes, la foto del mes (con sus cajas y movimientos) antes de podar', async () => {
    const lid = await league(db, w.u.org, { name: 'Tenis', visibility: 'private', sport: 'tennis', requirePhoto: false });
    await db.admin(`update public.leagues set rules = '{"match": {"sport": "tennis"}}' where id = $1`, [lid]);
    await member(db, lid, w.u.org, 'owner', 'org');
    const ps = [await player(db, lid, 'A'), await player(db, lid, 'B'), await player(db, lid, 'C'), await player(db, lid, 'D')];
    const ev = await db.rpc<string>(w.u.org, 'create_event', { p_league: lid, p_type: 'cajas', p_date: '2026-10-01', p_name: 'Cajas', p_config: { format: 'cajas' } });
    const boxes = [
      [ps[0], ps[1]],
      [ps[2], ps[3]],
    ];
    await db.rpc(w.u.org, 'save_box_month', { p_event: ev, p_month: 1, p_boxes: boxes, p_label: 'Octubre' });
    expect(await jobs()).toEqual([]);
    const moves = [
      { id: ps[2], move: 'sube' },
      { id: ps[1], move: 'baja' },
    ];
    await db.rpc(w.u.org, 'save_box_month', { p_event: ev, p_month: 2, p_boxes: boxes, p_label: 'Noviembre', p_moves: moves });
    const [j] = await jobs();
    expect([j.kind, j.ref, j.league_id]).toEqual(['cajas', `box:${ev}:1`, lid]);
    expect(j.payload).toMatchObject({ n: 1, month: { n: 1, label: 'Octubre', closed: true, boxes, moves } });
    // La foto trae el evento con sus partidos y a los de las cajas.
    const s = await snapshot(j.id);
    expect(s.events.map((e) => e.id)).toEqual([ev]);
    expect(new Set(s.players.map((p) => p.id))).toEqual(new Set(ps));
  });
});

describe('la foto de un trabajo (badge_snapshot)', () => {
  it('resultado de boliche: la carrera de la cuenta en el deporte (todas sus ligas), ligas reales, cuentas y lo que ya tiene', async () => {
    const { ev, id } = await counted(210, 'importado');
    // Luis también juega boliche en otra liga (su cuenta suma las dos); ana nada.
    const other = await league(db, w.u.otro, { name: 'Otra Liga', visibility: 'private', requirePhoto: false });
    await member(db, other, w.u.otro, 'owner', 'otro');
    await member(db, other, w.u.luis, 'member', 'luis');
    const luis2 = await player(db, other, 'Luis', w.u.luis);
    const ev2 = await event(db, other, 'practica', '2026-09-01');
    const e2 = await entry(db, other, ev2, luis2, [150], ['sin-foto']);
    const had = await apply(await enqueue('resultado', null, w.u.luis, 'x'), [give({ ...toUser(w.u.luis), badge_key: 'debut', sport: 'all', level: 0 })]);
    expect(had.ok).toBe(true);
    const [j] = await jobs(`ref = $1`, [`entry:${id}`]);
    const s = await snapshot(j.id);
    expect(s.v).toBe(1);
    expect(s.sport).toBe('bowling');
    expect(s.job).toMatchObject({ id: j.id, kind: 'resultado', league_id: w.priv, ref: `entry:${id}` });
    expect(new Set(s.entries.map((e) => e.id))).toEqual(new Set([id, e2, w.e1Luis]));
    expect(new Set(s.events.map((e) => e.id))).toEqual(new Set([ev, ev2, w.e.e1]));
    expect(new Set(s.leagues.map((l) => l.id))).toEqual(new Set([w.priv, other]));
    expect(s.leagues.find((l) => l.id === w.priv)).toMatchObject({ sport: 'bowling', kind: 'liga', badges_auto: 'todas', has_minors: false, tz: 'America/Santo_Domingo' });
    expect(new Set(s.players.map((p) => p.id))).toEqual(new Set([w.p.luis, luis2]));
    expect(s.profiles.find((p) => p.id === w.u.luis)).toMatchObject({ bowlingx: false, blocked_at: null, first_import_on: null });
    // Ligas reales: por liga y mes, las cuentas y jugadores con actividad válida (el sin-foto del dueño de su liga cuenta).
    expect(s.league_months).toEqual(
      expect.arrayContaining([
        { league_id: w.priv, month: '2026-10', users: [w.u.luis], players: [w.p.luis] },
        { league_id: other, month: '2026-09', users: [w.u.luis], players: [luis2] },
      ]),
    );
    // Staff de sus ligas (juez y parte) y lo que ya tiene su cuenta.
    expect(s.members).toEqual(expect.arrayContaining([expect.objectContaining({ league_id: w.priv, user_id: w.u.org, role: 'owner' })]));
    expect(s.awards.map((a) => a.badge_key)).toEqual(['debut']);
    expect(s.progress).toEqual([]);
  });

  it('juez y parte: el sin-foto del dueño no es actividad salvo que lo apruebe otra cuenta', async () => {
    const pOrg = await player(db, w.priv, 'Org', w.u.org);
    const ev = await event(db, w.priv, 'practica', '2026-10-02');
    await entry(db, w.priv, ev, pOrg, [180], ['sin-foto']);
    const act = () => db.admin<{ n: number }>('select count(*)::int as n from private.badge_activity($1, null, null)', [[pOrg]]);
    expect(await act()).toEqual([{ n: 0 }]);
    await db.admin(
      `insert into public.submissions (league_id, player_id, event_id, scores, status, created_by, reviewed_by, reviewed_at)
       values ($1, $2, $3, '{180}', 'aprobado', $4, $5, now())`,
      [w.priv, pOrg, ev, w.u.org, w.u.sofi],
    );
    expect(await act()).toEqual([{ n: 1 }]);
  });

  it('partidos: los dos lados, alineación, lados y reglas; la actividad oficial', async () => {
    const x = await padel();
    const m = await x.match();
    await db.rpc(w.u.luis, 'finish_match', { p_match: m, p_score: { text: '6-4 6-3', sides: [2, 0] }, p_winner: 1 });
    await db.rpc(w.u.otra, 'confirm_result', { p_match: m });
    const [j] = await jobs();
    const s = await snapshot(j.id);
    expect(s.sport).toBe('padel');
    expect(s.matches.map((r) => [r.id, r.status, r.confirmed_by, 'state' in r])).toEqual([[m, 'confirmed', w.u.otra, false]]);
    expect(s.match_sides).toHaveLength(2);
    expect(new Set(s.match_players.map((r) => r.player_id))).toEqual(new Set(Object.values(x.p)));
    expect(s.league_months).toEqual([{ league_id: x.lid, month: expect.stringMatching(/^\d{4}-\d{2}$/), users: expect.any(Array), players: expect.any(Array) }]);
    expect((s.league_months[0].users as string[]).length).toBe(4);
    const act = await db.admin<{ official: boolean }>('select official from private.badge_activity($1, null, null)', [[x.p.luis]]);
    expect(act).toEqual([{ official: true }]);
  });

  it('equipos: aparecer por alineación o líneas; sin datos, la plantilla (roster); las faltas del estado (Juego limpio)', async () => {
    const lid = await league(db, w.u.org, { name: 'Basket', visibility: 'private', sport: 'basketball', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const a = await player(db, lid, 'Luis', w.u.luis);
    const b = await player(db, lid, 'B');
    const c = await player(db, lid, 'C');
    const t1 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Tigres', p_players: [{ player_id: a }, { player_id: b }] });
    const t2 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones', p_players: [{ player_id: c }] });
    const mk = async () =>
      (await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: lid, p_matches: [{ sides: [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }] }] }))[0];
    const m1 = await mk();
    const m2 = await mk();
    await db.admin(
      `update public.matches set status = 'confirmed', confirmed_at = now(), scheduled_at = '2026-10-03T20:00:00Z', score = $2, state = $3 where id = $1`,
      [
        m1,
        { text: '12-10', sides: [12, 10], lines: `${a}:1:12:0:6:0:1;${c}:2:10:0:5:0:2` },
        { events: [{ type: 'foul', side: 2, kind: 'technical', player: c }, { type: 'foul', side: 1, kind: 'personal', player: a }] },
      ],
    );
    await db.admin(`update public.matches set status = 'confirmed', confirmed_at = now(), scheduled_at = '2026-10-04T20:00:00Z', score = $2 where id = $1`, [
      m2,
      { text: '10-8', sides: [10, 8] },
    ]);
    expect((await jobs()).map((j) => [j.kind, j.ref])).toEqual([
      ['resultado', `match:${m1}`],
      ['resultado', `match:${m2}`],
    ]);
    const days = await db.admin<{ player_id: string; date: string; official: boolean; roster: boolean }>(
      'select player_id, date::text as date, official, roster from private.badge_activity($1, null, null) order by date, player_id',
      [[a, b, c]],
    );
    const who = (id: string) => (id === a ? 'a' : id === b ? 'b' : 'c');
    expect(days.map((d) => [who(d.player_id), d.date, d.official, d.roster]).sort()).toEqual(
      [
        ['a', '2026-10-03', true, false],
        ['c', '2026-10-03', true, false],
        ['a', '2026-10-04', false, true],
        ['b', '2026-10-04', false, true],
        ['c', '2026-10-04', false, true],
      ].sort(),
    );
    // Temporada de baloncesto: cada partido dice si tiene estado y trae solo las faltas técnicas, antideportivas y
    // descalificantes.
    const [{ r }] = await db.admin<{ r: { matches: Json[] } }>(
      'select private.badge_family_rows($1, $2, null, null, null, null, null, true) as r',
      ['basketball', [a]],
    );
    expect(r.matches.map((m) => [m.id, m.has_state, m.fouls])).toEqual([
      [m1, true, [{ side: 2, kind: 'technical', player: c }]],
      [m2, false, []],
    ]);
    expect(r.matches.every((m) => !('state' in m))).toBe(true);
  });

  it('cuenta: su actividad de todos los deportes, felicitaciones, servicio y sus ligas', async () => {
    const { id } = await counted();
    // Ana (miembro de la liga) felicita el juego de luis; sofi aprueba un envío de luis.
    await db.rpc(w.u.ana, 'set_reaction', { p_entry: id, p_type: 'felicitar' });
    const s1 = await snapshot(await enqueue('cuenta', null, w.u.ana, '2026-10-05'));
    expect(s1.cheers).toEqual([expect.objectContaining({ by: w.u.ana, league_id: w.priv, player_id: w.p.luis, user_id: w.u.luis, kind: 'reaction' })]);
    // El felicitado: su primer día activo basta.
    expect(s1.activity).toEqual([expect.objectContaining({ player_id: w.p.luis, sport: 'bowling', official: true })]);
    expect(s1.members).toEqual(expect.arrayContaining([expect.objectContaining({ league_id: w.priv, user_id: w.u.ana, role: 'member' })]));
    await db.admin(
      `insert into public.submissions (league_id, player_id, date, scores, status, created_by, reviewed_by, reviewed_at)
       values ($1, $2, '2026-10-03', '{150}', 'aprobado', $3, $4, $5)`,
      [w.priv, w.p.luis, w.u.luis, w.u.sofi, at(3)],
    );
    const s2 = await snapshot(await enqueue('cuenta', null, w.u.sofi, '2026-10-05'));
    expect(s2.service).toEqual([expect.objectContaining({ user_id: w.u.sofi, league_id: w.priv, date: '2026-10-03', kind: 'submission' })]);
    // El dueño: los jugadores de su liga (con sus primeros días).
    const s3 = await snapshot(await enqueue('cuenta', null, w.u.org, '2026-10-05'));
    expect(s3.activity.map((a) => a.player_id)).toEqual([w.p.luis]);
    expect(s3.leagues.map((l) => l.id)).toEqual([w.priv]);
  });

  it('mes de una liga: el periodo, lo de la liga y la historia de quien jugó ese mes', async () => {
    await counted();
    const s = await snapshot(await enqueue('mes', w.priv, null, '2026-10'));
    expect(s.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(s.entries.map((e) => e.player_id)).toEqual(expect.arrayContaining([w.p.luis]));
    const u = await snapshot(await enqueue('mes', null, w.u.luis, '2026-10'));
    expect(u.activity.map((a) => [a.sport, a.date])).toEqual([['bowling', '2026-10-01']]);
    expect(u.entries).toHaveLength(2);
  });

  it('vínculo: la cuenta con su actividad y si el reclamo lo aprobó la misma cuenta (solo lo verificado)', async () => {
    await db.admin(`update public.players set user_id = $2 where id = $1`, [w.p.pedro, w.u.ana]);
    const [j] = await jobs();
    let s = await snapshot(j.id);
    expect(s.job.payload).toMatchObject({ players: [w.p.pedro], verified_only: false });
    await db.admin(`update public.players set user_id = null where id = $1`, [w.p.pedro]);
    await db.admin(
      `insert into public.player_claims (league_id, player_id, user_id, status, decided_by, decided_at) values ($1, $2, $3, 'approved', $3, now())`,
      [w.priv, w.p.pedro, w.u.sofi],
    );
    await db.admin(`update public.players set user_id = $2 where id = $1`, [w.p.pedro, w.u.sofi]);
    const [k] = await jobs(`user_id = $1`, [w.u.sofi]);
    s = await snapshot(k.id);
    expect(s.job.payload).toMatchObject({ verified_only: true });
  });

  it('un trabajo que ya no existe: null', async () => {
    expect(await snapshot(987654)).toBeNull();
  });

  it('cada tipo de trabajo arma su foto (noche, evento de natación y de golf, año de cuenta, borrado de un evento)', async () => {
    const x = await padel();
    const [{ id: night }] = await db.admin<{ id: string }>(
      `insert into public.events (league_id, type, name, date) values ($1, 'americano', 'Noche', '2026-10-02') returning id`,
      [x.lid],
    );
    const m = await x.match({ event_id: night, format: 'americano' });
    await db.admin(
      `update public.matches set status = 'confirmed', confirmed_at = now(), scheduled_at = '2026-10-02T23:00:00Z',
                                 score = '{"text": "6-2", "sides": [6, 2]}' where id = $1`,
      [m],
    );
    const n = await snapshot(await enqueue('noche', x.lid, null, `event:${night}`));
    expect(n.events.map((e) => e.id)).toEqual([night]);
    expect(n.matches.map((r) => r.id)).toEqual([m]);
    expect(n.players).toHaveLength(4);

    const swim = await league(db, w.u.org, { name: 'Natación', visibility: 'private', sport: 'swimming', requirePhoto: false });
    await member(db, swim, w.u.org, 'owner', 'org');
    const old = await db.rpc<string>(w.u.org, 'swim_create_meet', { p_league: swim, p_date: '2026-09-10', p_name: 'Antes' });
    const meet = await db.rpc<string>(w.u.org, 'swim_create_meet', { p_league: swim, p_date: '2026-10-10', p_name: 'Copa' });
    const later = await db.rpc<string>(w.u.org, 'swim_create_meet', { p_league: swim, p_date: '2026-11-10', p_name: 'Después' });
    const sw = await snapshot(await enqueue('evento', swim, null, `event:${meet}`));
    expect(sw.sport).toBe('swimming');
    // Récords: todo lo de la liga hasta el encuentro (no lo de después).
    expect(new Set(sw.swim_meets.map((r) => r.event_id))).toEqual(new Set([old, meet]));
    expect(later).toBeTruthy();

    const golf = await league(db, w.u.org, { name: 'Golf', visibility: 'private', sport: 'golf', requirePhoto: false });
    const g = await snapshot(await enqueue('evento', golf, null, `gt:00000000-0000-0000-0000-000000000009`));
    expect([g.golf_rounds, g.golf_cards]).toEqual([[], []]);

    await counted();
    const y = await snapshot(await enqueue('anio', null, w.u.luis, '2026'));
    expect(y.period).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    // La noche de pádel y el torneo de boliche.
    expect(y.activity.map((d) => d.sport).sort()).toEqual(['bowling', 'padel']);

    const gone = await snapshot(await enqueue('revisar', w.priv, null, 'event:00000000-0000-0000-0000-000000000009', { players: [w.p.luis], users: [w.u.luis] }));
    expect(gone.players.map((p) => p.id)).toEqual([w.p.luis]);
  });
});

describe('aplicar decisiones (badge_apply)', () => {
  it('da una sola vez (idempotente): provisional con firm_at a 7 días; la firme no cambia', async () => {
    const j1 = await enqueue('resultado', w.priv, null, 'entry:x');
    const d = give({ ...toPlayer(w.p.luis, w.priv), refs: ['entry:x:0'], context: { name: 'Líneas jugadas', values: { games: 30 } } });
    expect(await apply(j1, [d])).toMatchObject({ ok: true, awarded: 1, notices: 1 });
    expect((await jobs()).map((j) => [j.kind, j.user_id])).toEqual([['aviso', w.u.luis]]);
    const j2 = await enqueue('resultado', w.priv, null, 'entry:x');
    expect(await apply(j2, [d])).toMatchObject({ ok: true, awarded: 0, updated: 0 });
    const [a] = await awards();
    expect(a).toMatchObject({ status: 'provisional', player_id: w.p.luis, league_id: w.priv, refs: ['entry:x:0'], context: { v: 1, name: 'Líneas jugadas', values: { games: 30 } } });
    expect(iso(a.firm_at)).toBe(new Date(Date.parse(NOON) + 7 * 86400_000).toISOString());
    // Otra evidencia: se actualiza y se queda; firme: sube; después nada la cambia.
    expect(await apply(await enqueue('resultado', w.priv, null, 'entry:y'), [{ ...d, refs: ['entry:y:1'] }])).toMatchObject({ updated: 1 });
    expect(await apply(await enqueue('resultado', w.priv, null, 'entry:y'), [{ ...d, status: 'firme' }])).toMatchObject({ upgraded: 1 });
    expect(await apply(await enqueue('resultado', w.priv, null, 'entry:y'), [{ ...d, refs: ['otra'] }, revoke(toPlayer(w.p.luis, w.priv))])).toMatchObject({
      updated: 0,
      revoked: 0,
    });
    expect(await awards()).toEqual([expect.objectContaining({ status: 'firme', refs: ['entry:x:0'] })]);
  });

  it('revoca provisionales y en revisión (no firmes), las saca de las destacadas; reactivar solo lo retirado por evidencia', async () => {
    const j = await enqueue('resultado', null, w.u.luis, 'x');
    await apply(j, [
      give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all' }),
      give({ ...toUser(w.u.luis), badge_key: 'multisport', sport: 'all', status: 'firme' }),
      { ...give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_perfect_game', level: 0, period_key: 'g:e:0' }), kind: 'review', reviewers: [] },
    ]);
    const [mileage] = await awards(`badge_key = 'mileage'`);
    await db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [mileage.id] });
    const out = await apply(await enqueue('revisar', null, w.u.luis, 'x'), [
      revoke({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all' }),
      revoke({ ...toUser(w.u.luis), badge_key: 'multisport', sport: 'all' }),
      revoke({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_perfect_game', level: 0, period_key: 'g:e:0' }),
    ]);
    expect(out).toMatchObject({ ok: true, revoked: 2 });
    expect((await awards()).map((a) => [a.badge_key, a.status, a.revoke_reason]).sort()).toEqual([
      ['bowling_perfect_game', 'revocada', 'evidencia'],
      ['mileage', 'revocada', 'evidencia'],
      ['multisport', 'firme', null],
    ]);
    expect((await db.admin<{ f: string[] }>('select featured_badges as f from public.profiles where id = $1', [w.u.luis]))[0].f).toEqual([]);
    // Vuelve a cumplirse: la misma fila se reactiva (y avisa otra vez).
    await db.admin(`update public.badge_awards set seen_at = now(), notified_at = now() where id = $1`, [mileage.id]);
    const again = await apply(await enqueue('resultado', null, w.u.luis, 'x'), [give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all' })], at(6));
    expect(again).toMatchObject({ reactivated: 1, notices: 1 });
    expect(await awards('id = $1', [mileage.id])).toEqual([
      expect.objectContaining({ status: 'provisional', revoke_reason: null, seen_at: null, notified_at: null }),
    ]);
    expect(iso((await awards('id = $1', [mileage.id]))[0].awarded_at)).toBe(at(6));
    // Lo que retiró el superadmin (fraude) no vuelve.
    await db.rpc(w.u.dios, 'super_revoke_badge', { p_award: mileage.id });
    expect(await apply(await enqueue('resultado', null, w.u.luis, 'x'), [give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all' })])).toMatchObject({
      reactivated: 0,
      skipped: 1,
    });
    expect((await awards('id = $1', [mileage.id]))[0].revoke_reason).toBe('fraude');
  });

  it('aval: nace en revisión, avisa a los revisores elegibles (no al jugador ni a quien compite); confirmada, avisa al jugador', async () => {
    for (const u of [w.u.org, w.u.sofi, w.u.luis]) await phone(u);
    const { ev, id: e1 } = await counted(300, 'importado');
    // Sofi compite en el mismo evento: no puede dar el aval.
    const pSofi = await player(db, w.priv, 'Sofi', w.u.sofi);
    await entry(db, w.priv, ev, pSofi, [150], ['importado']);
    await db.admin('delete from private.badge_queue');
    const d = {
      ...give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_perfect_game', level: 0, period_key: `g:${e1}:0`, refs: [`entry:${e1}:0`] }),
      kind: 'review',
      reviewers: [w.u.sofi],
      context: { name: 'Juego perfecto' },
    };
    expect(await apply(await enqueue('resultado', w.priv, null, `entry:${e1}`), [d])).toMatchObject({ ok: true, reviews: 1, notices: 0 });
    const [a] = await awards();
    expect(a).toMatchObject({ status: 'en_revision', firm_at: null });
    expect(await pushes(w.u.org)).toEqual([
      {
        title: 'Hay una hazaña por confirmar',
        body: 'En Liga del Banco: Juego perfecto de Luis. Confírmala si la viste.',
        url: `/l/${w.priv}/admin?tab=insignias`,
        tag: `insignia-aval:${a.id}`,
      },
    ]);
    expect(await pushes(w.u.sofi)).toEqual([]);
    expect(await pushes(w.u.luis)).toEqual([]);
    // Otra vuelta del motor: no repite el push.
    await apply(await enqueue('resultado', w.priv, null, `entry:${e1}`), [d]);
    expect(await pushes(w.u.org)).toHaveLength(1);
    // Un «award» no se salta el aval.
    await apply(await enqueue('resultado', w.priv, null, `entry:${e1}`), [{ ...d, kind: 'award', status: 'firme' }]);
    expect((await awards())[0].status).toBe('en_revision');
    // Lo confirma el dueño: el aviso del jugador (review_badge → badge_signal).
    await db.rpc(w.u.org, 'review_badge', { p_award: a.id, p_ok: true });
    const avisos = await jobs(`kind = 'aviso'`);
    expect(avisos.map((j) => [j.user_id, j.ref])).toEqual([[w.u.luis, 'push']]);
    await db.admin(`update private.badge_queue set run_after = $1 where kind = 'aviso'`, [NOON]);
    expect(await notices(NOON)).toBe(1);
    expect((await pushes(w.u.luis)).map((p) => [p.title, p.body])).toEqual([['¡Te ganaste una insignia!', 'Juego perfecto en Liga del Banco. Tócala para verla.']]);
  });

  it('progreso: se escribe, se cambia y se borra (next_level null)', async () => {
    const p = (value: number, next: number | null) => ({ kind: 'progress', badge_key: 'bowling_games', sport: 'bowling', ...toPlayer(w.p.luis, w.priv), value, target: 30, next_level: next });
    await apply(await enqueue('resultado', w.priv, null, 'x'), [p(12, 1)]);
    await apply(await enqueue('resultado', w.priv, null, 'x'), [p(18.5, 1)]);
    expect(await db.admin('select value, target, next_level from public.badge_progress')).toEqual([{ value: 18.5, target: 30, next_level: 1 }]);
    await apply(await enqueue('resultado', w.priv, null, 'x'), [p(40, null)]);
    expect(await db.count('public.badge_progress')).toBe(0);
  });

  it('adopt: la copia de respaldo del jugador pasa a su cuenta (tombstone); si ya la tenía, queda una sola', async () => {
    const j = await enqueue('resultado', w.priv, null, 'x');
    await apply(j, [
      give({ ...toPlayer(w.p.pedro, w.priv), badge_key: 'month_streak', sport: 'all', status: 'firme' }),
      give({ ...toPlayer(w.p.pedro, w.priv), badge_key: 'mileage', sport: 'all', status: 'firme' }),
    ], at(1));
    await apply(await enqueue('resultado', null, w.u.ana, 'x'), [give({ ...toUser(w.u.ana), badge_key: 'mileage', sport: 'all' })], at(3));
    await db.admin(`update public.players set user_id = $2 where id = $1`, [w.p.pedro, w.u.ana]);
    const adopt = (key: string) => ({ kind: 'adopt', badge_key: key, sport: 'all', level: 1, period_key: '-', player_id: w.p.pedro, league_id: w.priv, user_id: w.u.ana });
    expect(await apply(await enqueue('vinculo', w.priv, w.u.ana, `player:${w.p.pedro}`), [adopt('month_streak'), adopt('mileage')])).toMatchObject({ adopted: 2 });
    expect((await awards()).map((a) => [a.badge_key, a.user_id, a.player_id, a.league_id, a.status, iso(a.awarded_at)]).sort()).toEqual([
      ['mileage', w.u.ana, null, null, 'firme', at(1)],
      ['month_streak', w.u.ana, null, null, 'firme', at(1)],
    ]);
    expect(await db.count('public.tombstones', `tbl = 'badge_awards'`)).toBe(2);
    // De un jugador que no es de esa cuenta: se salta.
    expect(await apply(await enqueue('vinculo', w.priv, w.u.sofi, 'x'), [{ ...adopt('mileage'), user_id: w.u.sofi }])).toMatchObject({ skipped: 1 });
  });

  it('todo o nada: una decisión que no sirve deja el trabajo en la cola con el error y nada aplicado', async () => {
    const j = await enqueue('resultado', w.priv, null, 'x');
    await db.admin('select private.badge_claim(5, $1::timestamptz)', [NOON]);
    const bad = [give(toPlayer(w.p.luis, w.priv)), give({ ...toUser(w.u.luis), league_id: w.priv })];
    const out = await apply(j, bad);
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/invalido/);
    expect(await awards()).toEqual([]);
    const [q] = await jobs();
    expect([q.id, q.locked, q.attempts, iso(q.run_after)]).toEqual([j, false, 1, at(5, 12, 2)]);
    for (const d of [{ kind: 'nada' }, give({ badge_key: 'Mal', ...toUser(w.u.luis) }), give({ ...toUser(w.u.luis), level: 9 }), give({ ...toUser(w.u.luis), status: 'revocada' })]) {
      expect((await apply(j, [d])).ok).toBe(false);
    }
    // Un jugador o una cuenta que ya no existen: se saltan (no fallan).
    expect(await apply(j, [give(toPlayer(w.p.p1, w.priv)), give(toUser('00000000-0000-0000-0000-000000000001'))])).toMatchObject({ ok: true, skipped: 2 });
  });

  it('un periodo queda anotado (badge_runs); en seco el historial no escribe insignias', async () => {
    await apply(await enqueue('mes', w.priv, null, '2026-10'), [give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'player_of_month', level: 0, period_key: '2026-10', status: 'firme' })]);
    expect(await db.admin('select kind, scope, period_key, awarded from private.badge_runs')).toEqual([{ kind: 'mes', scope: w.priv, period_key: '2026-10', awarded: 1 }]);
    const run = '11111111-2222-3333-4444-555555555555';
    const j = await enqueue('historial', w.priv, null, `league:${w.priv}`, { dry_run: true, run_id: run });
    expect(await apply(j, [give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_games' }), give({ ...toUser(w.u.luis), badge_key: 'bowling_games' }), give(toPlayer(w.p.pedro, w.priv))])).toMatchObject({ ok: true });
    expect(await db.count('public.badge_awards', `badge_key = 'bowling_games'`)).toBe(0);
    expect(await db.admin('select badge_key, sport, level, holders from private.badge_dry_runs where run_id = $1', [run])).toEqual([
      { badge_key: 'bowling_games', sport: 'bowling', level: 1, holders: 1 },
    ]);
  });

  it('el historial de verdad: sin push por cada una; un solo aviso por cuenta al final', async () => {
    await phone(w.u.luis);
    const j = await enqueue('historial', w.priv, null, `league:${w.priv}`, { dry_run: false });
    await apply(j, [give({ ...toPlayer(w.p.luis, w.priv), status: 'firme' }), give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all', status: 'firme' })], NOON);
    const all = await awards();
    expect(all.every((a) => (a.context as Json).historial === true && a.notified_at !== null)).toBe(true);
    const [av] = await jobs(`kind = 'aviso'`);
    expect([av.user_id, av.ref, iso(av.run_after)]).toEqual([w.u.luis, 'historial', at(5, 12, 30)]);
    expect(await notices(at(5, 13))).toBe(1);
    expect((await pushes(w.u.luis)).map((p) => [p.title, p.body, p.tag])).toEqual([
      ['¡Tus insignias llegaron!', 'Te dimos 2 insignias por tu historial. ¡Míralas!', 'insignias'],
    ]);
  });
});

describe('avisos (push agrupado)', () => {
  it('una: «¡Te ganaste una insignia!»; varias: agrupadas; solo lo no avisado', async () => {
    await phone(w.u.luis);
    await apply(await enqueue('resultado', w.priv, null, 'x'), [
      give({ ...toUser(w.u.luis), badge_key: 'month_streak', sport: 'all', level: 3, context: { name: 'Constancia', level_name: 'oro' } }),
    ]);
    expect(await notices(NOON)).toBe(1);
    expect(await pushes(w.u.luis)).toEqual([
      { title: '¡Te ganaste una insignia!', body: 'Constancia · oro. Tócala para verla.', url: `/u/${w.u.luis}?tab=insignias`, tag: 'insignias' },
    ]);
    expect(await jobs()).toEqual([]);
    expect((await awards()).every((a) => a.notified_at !== null)).toBe(true);
    // Tres más (7 h después): uno solo con las primeras dos y «1 más».
    await apply(await enqueue('resultado', w.priv, null, 'y'), [
      give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'player_of_month', level: 0, period_key: '2026-09', context: { name: 'Figura del mes' } }),
      give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_club', level: 2, context: { name: 'Club 225' } }),
      give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all', level: 1, context: { name: 'Kilometraje', level_name: 'bronce' } }),
    ], at(5, 19));
    expect(await notices(at(5, 19, 30))).toBe(1);
    expect((await pushes(w.u.luis))[1]).toMatchObject({ title: '¡Te ganaste 3 insignias!', body: 'Club 225, Kilometraje (bronce) y 1 más.' });
  });

  it('horas tranquilas: de 9 pm a 8 am espera a las 8; como mucho uno cada 6 h (lo demás sale junto)', async () => {
    await phone(w.u.luis);
    const night = at(5, 22);
    await apply(await enqueue('resultado', w.priv, null, 'x'), [give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all' })], night);
    const [av] = await jobs();
    expect(iso(av.run_after)).toBe(at(6, 8));
    expect(await notices(at(6, 7))).toBe(0);
    expect(await notices(at(6, 8))).toBe(1);
    // A las 10 otra: espera a las 2 pm (6 h desde el de las 8); a las 3 pm sale con lo que se juntó.
    await apply(await enqueue('resultado', w.priv, null, 'y'), [give({ ...toUser(w.u.luis), badge_key: 'multisport', sport: 'all' })], at(6, 10));
    expect(await notices(at(6, 10))).toBe(0);
    expect(iso((await jobs())[0].run_after)).toBe(at(6, 14));
    await apply(await enqueue('resultado', w.priv, null, 'z'), [give({ ...toUser(w.u.luis), badge_key: 'three_worlds', sport: 'all', level: 0 })], at(6, 11));
    expect(await jobs(`kind = 'aviso'`)).toHaveLength(1);
    expect(await notices(at(6, 15))).toBe(1);
    expect((await pushes(w.u.luis)).map((p) => p.title)).toEqual(['¡Te ganaste una insignia!', '¡Te ganaste 2 insignias!']);
    // Un aviso que vence de noche (el trabajo se atrasó) también espera.
    await apply(await enqueue('resultado', w.priv, null, 'w'), [give({ ...toUser(w.u.luis), badge_key: 'anniversary', sport: 'all' })], at(6, 15, 5));
    expect(await notices(at(6, 23))).toBe(0);
    expect(iso((await jobs())[0].run_after)).toBe(at(7, 8));
  });

  it('sin push: ocultas (privadas por defecto), ligas con menores, jugadores sin cuenta y cuentas bloqueadas', async () => {
    for (const u of [w.u.luis, w.u.ana]) await phone(u);
    const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', hasMinors: true, requirePhoto: false });
    await member(db, kids, w.u.org, 'owner', 'org');
    await member(db, kids, w.u.luis, 'member', 'luis');
    const kLuis = await player(db, kids, 'Luis', w.u.luis);
    const out = await apply(await enqueue('resultado', w.priv, null, 'x'), [
      give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_breakthrough', hidden: true }),
      give({ ...toPlayer(kLuis, kids), badge_key: 'bowling_games' }),
      give({ ...toPlayer(w.p.pedro, w.priv), badge_key: 'bowling_games' }),
    ]);
    expect(out).toMatchObject({ awarded: 3, notices: 0 });
    expect(await jobs()).toEqual([]);
    expect((await awards(`badge_key = 'bowling_breakthrough'`))[0].hidden).toBe(true);
    // Bloqueada después de encolar: no sale, y queda marcada.
    await apply(await enqueue('resultado', null, w.u.ana, 'x'), [give({ ...toUser(w.u.ana), badge_key: 'mileage', sport: 'all' })]);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.ana, p_reason: 'x' });
    expect(await notices(NOON)).toBe(0);
    expect(await pushes(w.u.ana)).toEqual([]);
    expect(await jobs()).toEqual([]);
  });
});

describe('la tarea diaria (badges_daily)', () => {
  it('firmes a los 7 días; podios de boliche a los 3 días (una vez); la rareza', async () => {
    await apply(await enqueue('resultado', w.priv, null, 'x'), [give(toPlayer(w.p.luis, w.priv))], at(1));
    const ev = await event(db, w.priv, 'torneo', '2026-10-02', 3, 'Copa');
    await entry(db, w.priv, ev, w.p.luis, [200], ['importado']);
    await db.admin('delete from private.badge_queue');
    // El 4: el torneo del 1 (Copa de la liga abierta) ya tiene sus 3 días; el nuestro (el 2) todavía no.
    let r = await daily(at(4, 0, 30));
    expect(r).toMatchObject({ firm: 0, events: 1 });
    // El 9 (firm_at = el 8 al mediodía): firme; y el torneo del 2.
    r = await daily(at(9, 0, 30));
    expect(r).toMatchObject({ firm: 1, events: 1 });
    expect((await awards())[0].status).toBe('firme');
    expect((await jobs(`kind = 'evento'`)).map((j) => [j.kind, j.ref])).toEqual([
      ['evento', `event:${w.e.e9}`],
      ['evento', `event:${ev}`],
    ]);
    expect(await daily(at(9, 0, 30))).toMatchObject({ firm: 0, events: 0 });
    // Ya corrió: no se vuelve a encolar.
    for (const j of await jobs()) await apply(j.id, []);
    expect(await daily(at(10, 0, 30))).toMatchObject({ events: 0 });
    // Rareza: 1 de 1 cuenta activa en boliche (base < 50: «nueva»).
    expect(await db.admin('select badge_key, sport, level, holders, base, pct, rarity from public.badge_stats')).toEqual([
      { badge_key: 'bowling_games', sport: 'bowling', level: 1, holders: 1, base: 1, pct: 100, rarity: 'nueva' },
    ]);
  });

  it('el día 3: el mes anterior por liga y por cuenta; el día 1: la foto de la escalera para el día 3', async () => {
    await counted();
    const lid = await league(db, w.u.org, { name: 'Tenis', visibility: 'private', sport: 'tennis', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    const a = await player(db, lid, 'A');
    const b = await player(db, lid, 'B');
    const lad = await db.rpc<string>(w.u.org, 'create_event', { p_league: lid, p_type: 'escalera', p_date: '2026-10-01', p_name: 'Escalera', p_config: {} });
    await db.admin(`insert into public.ladder_rungs (event_id, league_id, entrant_id, player_id, position) values ($1, $2, $3, $3, 1), ($1, $2, $4, $4, 2)`, [lad, lid, a, b]);
    await db.admin('delete from private.badge_queue');
    await daily(at(2, 0, 30));
    expect(await jobs(`kind = 'mes'`)).toEqual([]);
    await daily(new Date(Date.UTC(2026, 10, 1, 4, 30)).toISOString());
    // (El del día 2 de octubre es la foto de septiembre.)
    const [lj] = await jobs(`kind = 'escalera' and ref like '%:2026-10'`);
    expect([lj.ref, iso(lj.run_after)]).toEqual([`ladder:${lad}:2026-10`, new Date(Date.UTC(2026, 10, 3, 4, 5)).toISOString()]);
    expect(lj.payload).toEqual({ month: '2026-10', rungs: [{ entrant_id: a, player_id: a, team_id: null, position: 1 }, { entrant_id: b, player_id: b, team_id: null, position: 2 }] });
    const s = await snapshot(lj.id);
    expect(s.ladder_rungs.map((x) => [x.player_id, x.position, x.event_id])).toEqual([
      [a, 1, lad],
      [b, 2, lad],
    ]);
    expect(s.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    await daily(new Date(Date.UTC(2026, 10, 3, 4, 30)).toISOString());
    expect((await jobs(`kind = 'mes'`)).map((j) => [j.league_id, j.user_id, j.ref])).toEqual([
      [w.priv, null, '2026-10'],
      [null, w.u.luis, '2026-10'],
    ]);
    await daily(new Date(Date.UTC(2026, 10, 4, 4, 30)).toISOString());
    expect(await jobs(`kind = 'mes'`)).toHaveLength(2);
  });

  it('cuentas con algo nuevo de hace 2 días (actividad, felicitaciones, servicio) y sus dueños', async () => {
    const { id } = await counted();
    await db.rpc(w.u.ana, 'set_reaction', { p_entry: id, p_type: 'felicitar' });
    await db.admin(`update public.reactions set created_at = $1`, [at(1, 18)]);
    await db.admin('delete from private.badge_queue');
    await daily(at(3, 0, 30));
    expect(new Set((await jobs(`kind = 'cuenta'`)).map((j) => j.user_id))).toEqual(new Set([w.u.luis, w.u.org, w.u.ana]));
    expect((await jobs(`kind = 'cuenta'`))[0].ref).toBe('2026-10-03');
  });

  it('limpieza: trabajos muertos de 30+ días, periodos de 400+ y corridas en seco de 90+', async () => {
    await db.admin(`insert into private.badge_queue (kind, ref, attempts, created_at) values ('resultado', 'a', 5, $1), ('resultado', 'b', 5, $2)`, [at(1), '2026-08-01T00:00:00Z']);
    await db.admin(`insert into private.badge_runs (kind, scope, period_key, done_at) values ('mes', 'x', '2024-01', '2024-02-03T00:00:00Z'), ('mes', 'x', '2026-09', $1)`, [at(3)]);
    expect(await db.admin('select private.badge_cleanup($1::timestamptz) as r', [at(5)])).toEqual([{ r: { badge_queue: 1, badge_runs: 1, badge_dry_runs: 0 } }]);
  });
});

describe('RPC de la app', () => {
  it('badge_notices: las suyas sin ver; las hazañas que puede confirmar (el superadmin, las vencidas)', async () => {
    const { ev, id: e1 } = await counted(300);
    await apply(await enqueue('resultado', w.priv, null, 'x'), [
      give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_club', level: 3, context: { name: 'Club 250' } }),
      give({ ...toUser(w.u.luis), badge_key: 'mileage', sport: 'all', hidden: true }),
      { ...give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'bowling_perfect_game', level: 0, period_key: `g:${e1}:0`, refs: [`entry:${e1}:0`] }), kind: 'review', reviewers: [] },
    ]);
    const mine = await db.rpc<{ awards: Json[]; unseen: number; reviews: Json[] }>(w.u.luis, 'badge_notices', {});
    expect(mine.unseen).toBe(2);
    expect(mine.awards.map((a) => [a.key, a.scope, a.hidden, a.history])).toEqual(
      expect.arrayContaining([
        ['bowling_club', 'liga', false, false],
        ['mileage', 'cuenta', true, false],
      ]),
    );
    expect(mine.reviews).toEqual([]);
    const org = await db.rpc<{ reviews: Json[] }>(w.u.org, 'badge_notices', {});
    expect(org.reviews).toEqual([expect.objectContaining({ key: 'bowling_perfect_game', playerName: 'Luis', leagueName: 'Liga del Banco', overdue: false, refs: [`entry:${e1}:0`] })]);
    // Sofi juega el mismo evento: no.
    await entry(db, w.priv, ev, await player(db, w.priv, 'Sofi', w.u.sofi), [100], ['importado']);
    expect((await db.rpc<{ reviews: Json[] }>(w.u.sofi, 'badge_notices', {})).reviews).toEqual([]);
    expect((await db.rpc<{ reviews: Json[] }>(w.u.dios, 'badge_notices', {})).reviews).toEqual([]);
    await db.admin(`update public.badge_awards set awarded_at = now() - interval '15 days' where status = 'en_revision'`);
    expect((await db.rpc<{ reviews: Json[] }>(w.u.dios, 'badge_notices', {})).reviews).toEqual([expect.objectContaining({ overdue: true })]);
    // Vistas: ya no salen.
    await db.rpc(w.u.luis, 'mark_badges_seen', { p_ids: mine.awards.map((a) => a.id) });
    expect((await db.rpc<{ unseen: number }>(w.u.luis, 'badge_notices', {})).unseen).toBe(0);
  });

  it('badges_backfill: el superadmin encola el historial (en seco por defecto) con auditoría', async () => {
    const r = await db.rpc<{ runId: string; dryRun: boolean; jobs: number }>(w.u.dios, 'badges_backfill', { p_league: w.priv });
    expect(r).toMatchObject({ dryRun: true, jobs: 1 });
    expect((await jobs()).map((j) => [j.kind, j.league_id, j.ref, j.payload])).toEqual([['historial', w.priv, `league:${w.priv}`, { dry_run: true, run_id: r.runId }]]);
    expect(await db.admin(`select action, target_type, target_id from public.admin_audit where action = 'badges_backfill'`)).toEqual([
      { action: 'badges_backfill', target_type: 'league', target_id: w.priv },
    ]);
    const all = await db.rpc<{ jobs: number }>(w.u.dios, 'badges_backfill', { p_dry_run: false });
    expect(all.jobs).toBeGreaterThanOrEqual(2);
    await fails(db.rpc(w.u.dios, 'badges_backfill', { p_league: '00000000-0000-0000-0000-000000000001' }), 'no_existe');
    // La foto del historial: la liga entera, su actividad y la de sus cuentas.
    await counted();
    const [h] = await jobs(`kind = 'historial' and league_id = $1`, [w.priv]);
    const s = await snapshot(h.id);
    expect(s.players.map((p) => p.id)).toEqual(expect.arrayContaining([w.p.luis, w.p.pedro]));
    expect(s.activity.map((a) => a.player_id)).toEqual([w.p.luis]);
    expect(s).toHaveProperty('cheers');
    expect(s).toHaveProperty('service');
  });
});

describe('la Edge Function (service_role) de punta a punta con un motor falso', () => {
  it('claim → snapshot → apply → finish (avisos); fail deja el error', async () => {
    await phone(w.u.luis);
    const { id } = await counted();
    // A la hora de la prueba puede ser de noche: la cola corre igual, el aviso espera.
    const claimed = (await db.as<{ r: { id: number; kind: string; ref: string }[] }>(SERVICE, 'select public.badge_claim(10) as r'))[0].r;
    expect(claimed.map((j) => [j.kind, j.ref])).toEqual([['resultado', `entry:${id}`]]);
    const snap = (await db.as<{ r: Json }>(SERVICE, 'select public.badge_snapshot($1) as r', [claimed[0].id]))[0].r;
    expect(snap.job).toMatchObject({ id: claimed[0].id, attempts: 1 });
    const decisions = [give({ ...toPlayer(w.p.luis, w.priv), badge_key: 'debut', sport: 'bowling', level: 0, context: { name: 'Primera línea' } })];
    const res = (await db.as<{ r: Json }>(SERVICE, 'select public.badge_apply($1, $2::jsonb) as r', [claimed[0].id, JSON.stringify(decisions)]))[0].r;
    expect(res).toMatchObject({ ok: true, awarded: 1, notices: 1 });
    const fin = (await db.as<{ r: Json }>(SERVICE, 'select public.badge_finish() as r'))[0].r;
    expect(fin).toMatchObject({ remaining: 0, chained: false });
    const quiet = (await db.admin<{ q: boolean }>(`select private.badge_quiet_until(now()) > now() as q`))[0].q;
    expect(fin.notices).toBe(quiet ? 0 : 1);
    // Un trabajo que el motor no pudo evaluar.
    const j = await enqueue('resultado', w.priv, null, 'x', {}, new Date(Date.now() - 60_000).toISOString());
    await db.as(SERVICE, 'select public.badge_claim(10)');
    await db.as(SERVICE, `select public.badge_fail($1, 'evaluate: boom')`, [j]);
    expect((await jobs('id = $1', [j]))[0]).toMatchObject({ locked: false, attempts: 1, last_error: 'evaluate: boom' });
  });
});

describe('temporadas (20260929000880, solo cuando existe public.seasons)', () => {
  it('sin public.seasons no hace nada; con el contrato de temporadas, cerrar una encola «temporada» y la foto trae sus premios', async () => {
    expect(await db.admin(`select to_regclass('public.seasons') is null as none`)).toEqual([{ none: true }]);
    expect(await db.admin(`select private.badge_season_rows(null, null, null, null) as r`)).toEqual([{ r: {} }]);
    await db.pg.exec(SEASONS_SQL);
    expect(await db.admin(`select private.badge_season_rows(null, null, null, null) as r`)).toEqual([{ r: {} }]);

    // El contrato de 20260929000700_temporadas.sql (lo mínimo para probar).
    await db.pg.exec(`
      create table public.seasons (
        id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues (id) on delete cascade,
        name text not null, starts_on date not null, ends_on date not null, status text not null default 'active',
        closed_at timestamptz, closed_by uuid, standings jsonb, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now());
      create table public.season_awards (
        id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons (id) on delete cascade,
        league_id uuid not null, kind text not null, label text not null default '', player_id uuid, team_id uuid, note text);`);
    await db.pg.exec(SEASONS_SQL);
    const [{ id: season }] = await db.admin<{ id: string }>(
      `insert into public.seasons (league_id, name, starts_on, ends_on) values ($1, 'Temporada 2026', '2026-01-01', '2026-12-31') returning id`,
      [w.priv],
    );
    await db.admin(`insert into public.season_awards (season_id, league_id, kind, label, player_id) values ($1, $2, 'campeon', 'Campeón', $3)`, [season, w.priv, w.p.pedro]);
    expect(await jobs()).toEqual([]);
    await db.admin(`update public.seasons set status = 'closed', closed_at = now(), standings = '[{"id": "x"}]' where id = $1`, [season]);
    const [j] = await jobs();
    expect([j.kind, j.league_id, j.ref]).toEqual(['temporada', w.priv, `season:${season}`]);
    await counted();
    const s = await snapshot(j.id);
    expect(s.seasons).toEqual([expect.objectContaining({ id: season, name: 'Temporada 2026', status: 'closed', standings: [{ id: 'x' }] })]);
    expect(s.season_awards).toEqual([expect.objectContaining({ kind: 'campeon', player_id: w.p.pedro })]);
    expect(s.period).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(s.players.map((p) => p.id)).toEqual(expect.arrayContaining([w.p.luis, w.p.pedro]));
    // Revelación: el primer día de cada cuenta en el deporte; Temporada organizada: servicio del staff.
    expect(s.activity).toEqual([expect.objectContaining({ user_id: w.u.luis, date: '2026-10-01' })]);
    expect(s).toHaveProperty('service');
    // El año: «Figura del año» mira si hubo una temporada igual al año.
    const y = await snapshot(await enqueue('anio', w.priv, null, '2026'));
    expect(y.seasons).toEqual([expect.objectContaining({ id: season })]);
    // Ya cerrada: cambiar otra cosa no encola otra vez.
    await db.admin('delete from private.badge_queue');
    await db.admin(`update public.seasons set status = 'closed', name = 'T26' where id = $1`, [season]);
    expect(await jobs()).toEqual([]);
  });
});
