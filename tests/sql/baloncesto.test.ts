/**
 * Baloncesto (20260927000800_baloncesto.sql): convocatoria por partido, anotador de mesa designado, refuerzos,
 * marcador de baloncesto y la hora del servidor. Cada prueba en su transacción (se deshace al final).
 *
 * Mundo (liga pública «Liga de Barrio» de org, admin sofi): equipo Tigres (luis capitán, ana jugadora, pedro sin
 * cuenta) contra Leones (otra delegada, nuevo jugador). mia es miembro con jugador pero sin equipo; extra es
 * anotador de la liga; otro no es de la liga.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;
let mia: string;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  mia = await db.createUser('mia@x.com', 'mia');
});
afterEach(async () => {
  await db.rollback();
});

interface Hoops {
  lid: string;
  p: { luis: string; ana: string; pedro: string; otra: string; nuevo: string; mia: string; extra: string; r1: string; r2: string; r3: string };
  t1: string;
  t2: string;
  match: string;
}

async function hoops(opts: { visibility?: 'public' | 'private'; rules?: Record<string, unknown> } = {}): Promise<Hoops> {
  const lid = await league(db, w.u.org, { name: 'Liga de Barrio', visibility: opts.visibility ?? 'public', sport: 'basketball', requirePhoto: false });
  if (opts.rules) await db.admin('update public.leagues set rules = $2 where id = $1', [lid, opts.rules]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const n of ['luis', 'ana', 'otra', 'nuevo'] as const) await member(db, lid, w.u[n], 'member', n);
  await member(db, lid, mia, 'member', 'mia');
  await member(db, lid, w.u.extra, 'member', 'extra', true);
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    pedro: await player(db, lid, 'Pedro'),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    mia: await player(db, lid, 'Mia', mia),
    extra: await player(db, lid, 'Extra', w.u.extra),
    r1: await player(db, lid, 'Refuerzo 1'),
    r2: await player(db, lid, 'Refuerzo 2'),
    r3: await player(db, lid, 'Refuerzo 3'),
  };
  const t1 = await db.rpc<string>(w.u.org, 'create_season_team', {
    p_league: lid,
    p_name: 'Tigres',
    p_players: [
      { player_id: p.luis, jersey: 7, role: 'captain' },
      { player_id: p.ana, jersey: 10 },
      { player_id: p.pedro, jersey: 12 },
    ],
  });
  const t2 = await db.rpc<string>(w.u.org, 'create_season_team', {
    p_league: lid,
    p_name: 'Leones',
    p_players: [{ player_id: p.otra, role: 'delegate' }, { player_id: p.nuevo, jersey: 4 }],
  });
  const [match] = await db.rpc<string[]>(w.u.org, 'create_matches', {
    p_league: lid,
    p_matches: [{ round: 1, court: 'Cancha 1', format: 'fiba', sides: [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }] }],
  });
  return { lid, p, t1, t2, match };
}

const rsvps = (match: string) =>
  db.admin<{ player_id: string; side: number; status: string }>('select player_id, side, status from public.match_rsvps where match_id = $1 order by side, status', [match]);
/** Un teléfono con push para esa cuenta (sin teléfono no se encola nada). */
const phone = (uid: string, n: number) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [uid, `https://fcm.googleapis.com/fcm/send/${n}`]);
const matchRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.matches where id = $1', [id]))[0];

describe('convocatoria (Voy / No voy / Tal vez)', () => {
  it('cada jugador marca la suya; el lado sale de la plantilla; null la quita', async () => {
    const h = await hoops();
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' });
    await db.rpc(w.u.nuevo, 'set_match_rsvp', { p_match: h.match, p_status: 'maybe' });
    expect(await rsvps(h.match)).toEqual([
      { player_id: h.p.ana, side: 1, status: 'yes' },
      { player_id: h.p.nuevo, side: 2, status: 'maybe' },
    ]);
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'no' });
    expect((await rsvps(h.match)).find((r) => r.player_id === h.p.ana)?.status).toBe('no');
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: null });
    expect(await rsvps(h.match)).toEqual([{ player_id: h.p.nuevo, side: 2, status: 'maybe' }]);
    // Quitar la que no hay no falla. Y deja tombstone al borrar.
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match });
    expect(await db.count('public.tombstones', `tbl = 'match_rsvps' and row_key = $1`, [`${h.match}:${h.p.ana}`])).toBe(1);
  });

  it('el capitán o delegado marca a los de su equipo (también sin cuenta); el admin a cualquiera', async () => {
    const h = await hoops();
    await db.rpc(w.u.luis, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_player: h.p.pedro });
    await db.rpc(w.u.otra, 'set_match_rsvp', { p_match: h.match, p_status: 'no', p_player: h.p.nuevo });
    await fails(db.rpc(w.u.luis, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_player: h.p.nuevo }), DENIED);
    await fails(db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_player: h.p.pedro }), DENIED);
    await fails(db.rpc(w.u.otro, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_player: h.p.pedro }), DENIED);
    await fails(db.rpc(ANON, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_player: h.p.pedro }), DENIED);
    await db.rpc(w.u.sofi, 'set_match_rsvp', { p_match: h.match, p_status: 'maybe', p_player: h.p.nuevo });
    const rows = await db.admin<{ player_id: string; status: string; set_by: string }>('select player_id, status, set_by from public.match_rsvps where match_id = $1', [h.match]);
    expect(rows.find((r) => r.player_id === h.p.pedro)).toEqual({ player_id: h.p.pedro, status: 'yes', set_by: w.u.luis });
    expect(rows.find((r) => r.player_id === h.p.nuevo)).toEqual({ player_id: h.p.nuevo, status: 'maybe', set_by: w.u.sofi });
  });

  it('fuera de la plantilla, estado raro, partido cerrado o liga que no es de equipos: no', async () => {
    const h = await hoops();
    // mia es de la liga pero de ningún equipo; el admin tampoco puede ponerla.
    await fails(db.rpc(mia, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_player: h.p.mia }), 'invalido');
    // Una cuenta de la liga sin jugador (sofi) no tiene «su» convocatoria.
    await fails(db.rpc(w.u.sofi, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' }), 'invalido');
    await fails(db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'si' }), 'invalido');
    await fails(db.rpc(w.u.ana, 'set_match_rsvp', { p_match: randomUUID(), p_status: 'yes' }), 'no_existe');
    await db.admin(`update public.matches set status = 'confirmed', winner_side = 1, score = '{"text":"70-60","sides":[70,60]}' where id = $1`, [h.match]);
    await fails(db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' }), 'cerrado');
    // Liga de pádel: no.
    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'public', sport: 'padel', requirePhoto: false });
    await member(db, padel, w.u.org, 'owner', 'org');
    const pp = await player(db, padel, 'Org', w.u.org);
    const pair = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: padel, p_name: 'Org', p_players: [{ player_id: pp }] });
    const [pm] = await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: padel, p_matches: [{ sides: [{ side: 1, team_id: pair }, { side: 2, label: 'X' }] }] });
    await fails(db.rpc(w.u.org, 'set_match_rsvp', { p_match: pm, p_status: 'yes' }), 'invalido');
    await fails(db.admin(`insert into public.match_rsvps (match_id, player_id, league_id, side, status) values ($1, $2, $3, 1, 'yes')`, [pm, pp, padel]), 'invalido');
  });

  it('con op_id: reintentar no repite; y la liga del renglón es siempre la del partido', async () => {
    const h = await hoops();
    const op = randomUUID();
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_op_id: op });
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_op_id: op });
    expect(await rsvps(h.match)).toHaveLength(1);
    // El mismo op_id desde otra cuenta: duplicado.
    await fails(db.rpc(w.u.nuevo, 'set_match_rsvp', { p_match: h.match, p_status: 'yes', p_op_id: op }), 'duplicado');
    // Ni el superusuario mete una fila con la liga de otro partido.
    await fails(db.admin(`insert into public.match_rsvps (match_id, player_id, league_id, side, status) values ($1, $2, $3, 1, 'yes')`, [h.match, h.p.luis, w.pub]), INVALID);
  });

  it('cambiar el equipo de un lado borra la convocatoria de ese lado', async () => {
    const h = await hoops();
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' });
    await db.rpc(w.u.nuevo, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' });
    const t3 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: h.lid, p_name: 'Gatos' });
    await db.rpc(w.u.org, 'set_match_sides', { p_match: h.match, p_sides: [{ side: 1, team_id: t3 }, { side: 2, team_id: h.t2 }] });
    expect(await rsvps(h.match)).toEqual([{ player_id: h.p.nuevo, side: 2, status: 'yes' }]);
  });

  it('lo ve quien ve la liga (privada: sus miembros)', async () => {
    const h = await hoops({ visibility: 'private' });
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' });
    expect(await db.asUser(w.u.nuevo, 'select player_id from public.match_rsvps where match_id = $1', [h.match])).toHaveLength(1);
    expect(await db.asUser(w.u.otro, 'select player_id from public.match_rsvps where match_id = $1', [h.match])).toHaveLength(0);
    expect(await db.asAnon('select player_id from public.match_rsvps where match_id = $1', [h.match])).toHaveLength(0);
    await fails(db.as(w.u.ana, `update public.match_rsvps set status = 'no'`), '42501');
  });
});

describe('anotador de mesa designado', () => {
  it('solo el admin lo pone; tiene que poder anotar ese partido', async () => {
    const h = await hoops();
    await fails(db.rpc(w.u.luis, 'set_match_official', { p_match: h.match, p_user: w.u.luis }), DENIED);
    // mia es miembro sin equipo ni permisos: no puede anotar este partido.
    await fails(db.rpc(w.u.sofi, 'set_match_official', { p_match: h.match, p_user: mia }), 'invalido');
    // otro no es de la liga.
    await fails(db.rpc(w.u.sofi, 'set_match_official', { p_match: h.match, p_user: w.u.otro }), 'no_existe');
    await db.rpc(w.u.sofi, 'set_match_official', { p_match: h.match, p_user: w.u.extra });
    await db.rpc(w.u.sofi, 'set_match_official', { p_match: h.match, p_user: w.u.otra });
    expect(await db.asAnon('select match_id, user_id, name from public.match_officials where match_id = $1', [h.match])).toEqual([
      { match_id: h.match, user_id: w.u.otra, name: 'otra' },
    ]);
    await db.rpc(w.u.sofi, 'set_match_official', { p_match: h.match, p_user: null });
    expect(await db.count('public.match_officials', 'match_id = $1', [h.match])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'match_officials' and row_key = $1`, [h.match])).toBe(1);
  });

  it('si termina el designado (aunque sea delegado de un lado), queda confirmado y no avisa al rival', async () => {
    const h = await hoops();
    await phone(w.u.luis, 1);
    await db.rpc(w.u.org, 'set_match_official', { p_match: h.match, p_user: w.u.otra });
    expect(await db.rpc(w.u.otra, 'claim_scorer', { p_match: h.match })).toMatchObject({ ok: true });
    const r = await db.rpc(w.u.otra, 'finish_match', { p_match: h.match, p_score: { text: '70-64', sides: [70, 64] }, p_winner: 1 });
    expect(r).toEqual({ ok: true, status: 'confirmed' });
    const m = await matchRow(h.match);
    expect(m).toMatchObject({ status: 'confirmed', confirmed_by: w.u.otra, proposed_by: w.u.otra, proposed_side: null, winner_side: 1 });
    expect((m.history as { a: string; note?: string }[]).slice(-2).map((x) => x.a)).toEqual(['finish', 'confirm']);
    expect(await db.count('public.push_outbox', 'tag = $1', [`confirmar:${h.match}`])).toBe(0);
    // Cerrado: ya no se designa.
    await fails(db.rpc(w.u.org, 'set_match_official', { p_match: h.match, p_user: w.u.extra }), 'cerrado');
  });

  it('si termina otro de un lado, queda propuesto y confirma el rival (como siempre)', async () => {
    const h = await hoops();
    await phone(w.u.otra, 2);
    await db.rpc(w.u.org, 'set_match_official', { p_match: h.match, p_user: w.u.extra });
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: h.match, p_score: { text: '80-78', sides: [80, 78] }, p_winner: 1 })).toEqual({
      ok: true,
      status: 'finished',
    });
    expect(await matchRow(h.match)).toMatchObject({ status: 'finished', proposed_side: 1 });
    expect(await db.count('public.push_outbox', 'tag = $1', [`confirmar:${h.match}`])).toBeGreaterThan(0);
    await db.rpc(w.u.otra, 'confirm_result', { p_match: h.match });
    expect((await matchRow(h.match)).status).toBe('confirmed');
  });

  it('solo en ligas de equipos', async () => {
    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'public', sport: 'padel', requirePhoto: false });
    await member(db, padel, w.u.org, 'owner', 'org');
    const [pm] = await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: padel, p_matches: [{ sides: [{ side: 1, label: 'A' }, { side: 2, label: 'B' }] }] });
    await fails(db.rpc(w.u.org, 'set_match_official', { p_match: pm, p_user: w.u.org }), 'invalido');
  });
});

describe('refuerzos y marcador', () => {
  it('como mucho 2 refuerzos por lado (por defecto); los de la plantilla no cuentan', async () => {
    const h = await hoops();
    const roster = [{ player_id: h.p.luis, jersey: 7 }, { player_id: h.p.ana }, { player_id: h.p.pedro }];
    await db.rpc(w.u.luis, 'set_match_players', {
      p_match: h.match,
      p_side: 1,
      p_players: [...roster, { player_id: h.p.r1, sub: true }, { player_id: h.p.r2, jersey: 30, sub: true }],
    });
    await fails(
      db.rpc(w.u.luis, 'set_match_players', {
        p_match: h.match,
        p_side: 1,
        p_players: [...roster, { player_id: h.p.r1 }, { player_id: h.p.r2 }, { player_id: h.p.r3 }],
      }),
      'invalido',
    );
    expect(await db.count('public.match_players', 'match_id = $1 and side = 1', [h.match])).toBe(5);
    // El otro lado tiene su propio cupo.
    await db.rpc(w.u.sofi, 'set_match_players', { p_match: h.match, p_side: 2, p_players: [{ player_id: h.p.r3 }, { player_id: h.p.mia }] });
  });

  it('el límite sale de las reglas del partido (copiadas de la liga)', async () => {
    const h = await hoops({ rules: { match: { variant: '5x5' }, teams: { reinforcements: 0 } } });
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: h.match, p_side: 1, p_players: [{ player_id: h.p.r1 }] }), 'invalido');
    await db.rpc(w.u.luis, 'set_match_players', { p_match: h.match, p_side: 1, p_players: [{ player_id: h.p.luis }] });
    // Con 3 permitidos en el partido, entran 3.
    const [m2] = await db.rpc<string[]>(w.u.org, 'create_matches', {
      p_league: h.lid,
      p_matches: [{ rules: { teams: { reinforcements: 3 } }, sides: [{ side: 1, team_id: h.t1 }, { side: 2, team_id: h.t2 }] }],
    });
    await db.rpc(w.u.org, 'set_match_players', { p_match: m2, p_side: 1, p_players: [{ player_id: h.p.r1 }, { player_id: h.p.r2 }, { player_id: h.p.r3 }] });
    expect(await db.count('public.match_players', 'match_id = $1', [m2])).toBe(3);
  });

  it('el capitán no se salta el tope sumando a su plantilla (o a su lado) a un jugador de otro equipo', async () => {
    const h = await hoops({ rules: { match: { variant: '5x5' }, teams: { reinforcements: 0 } } });
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: h.p.nuevo }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_roster', { p_team: h.t1, p_players: [{ player_id: h.p.ana }, { player_id: h.p.nuevo }] }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: h.match, p_side: 1, p_players: [{ player_id: h.p.luis }, { player_id: h.p.nuevo }] }), 'invalido');
    expect(await db.count('public.match_players', 'match_id = $1', [h.match])).toBe(0);
    // nuevo sigue siendo de los Leones: su convocatoria funciona y la delegada lo puede sacar.
    await db.rpc(w.u.nuevo, 'set_match_rsvp', { p_match: h.match, p_status: 'yes' });
    expect(await rsvps(h.match)).toEqual([{ player_id: h.p.nuevo, side: 2, status: 'yes' }]);
    expect(await db.rpc(w.u.otra, 'remove_team_player', { p_team: h.t2, p_player: h.p.nuevo })).toBe(true);
  });

  it('cada lado de 0 a 300 puntos (en otras ligas no aplica)', async () => {
    const h = await hoops();
    await fails(
      db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: h.match, p_seq: 1, p_state: { v: 1 }, p_score: { text: '301-2', sides: [301, 2] } }),
      'invalido',
    );
    const r = await db.rpc<{ ok: boolean }>(w.u.luis, 'publish_match', {
      p_op_id: randomUUID(),
      p_match: h.match,
      p_seq: 1,
      p_state: { v: 1 },
      p_score: { text: '12-9', sides: [12, 9], lines: 'x' },
    });
    expect(r.ok).toBe(true);
    expect((await matchRow(h.match)).score).toEqual({ text: '12-9', sides: [12, 9], lines: 'x' });
  });
});

describe('hora del servidor y permisos', () => {
  it('server_now: con cuenta y sin cuenta, la hora de ahora', async () => {
    const before = Date.now();
    const a = await db.rpc<string>(ANON, 'server_now');
    const b = await db.rpc<string>(w.u.ana, 'server_now');
    for (const t of [a, b]) {
      const ms = new Date(t).getTime();
      expect(Math.abs(ms - before)).toBeLessThan(60_000);
    }
  });

  it('las RPC nuevas solo con sesión (server_now también sin cuenta); los helpers, de nadie; RLS en las tablas', async () => {
    const rows = await db.admin<{ fn: string; auth: boolean; anon: boolean; definer: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon, p.prosecdef as definer
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('set_match_rsvp', 'set_match_official', 'server_now') order by 1`,
    );
    expect(rows).toEqual([
      { fn: 'server_now', auth: true, anon: true, definer: false },
      { fn: 'set_match_official', auth: true, anon: false, definer: true },
      { fn: 'set_match_rsvp', auth: true, anon: false, definer: true },
    ]);
    const helpers = await db.admin(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and (p.proname like 'bb\\_%' or p.proname like 'team\\_%')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`,
    );
    expect(helpers).toEqual([]);
    const tables = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('match_rsvps', 'match_officials') order by 1`,
    );
    expect(tables).toEqual([
      { relname: 'match_officials', rls: true },
      { relname: 'match_rsvps', rls: true },
    ]);
    for (const t of ['match_rsvps', 'match_officials']) {
      await fails(db.as(w.u.org, `insert into public.${t} default values`), '42501');
      await fails(db.asAnon(`delete from public.${t}`), '42501');
    }
  });
});
