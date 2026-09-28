/**
 * Inscripciones de raqueta (20260927001400_inscripciones.sql): «Me apunto» con cupo, fecha límite y lista de espera
 * que sube sola (con push), el admin que sigue armando la lista a mano (y una lista vieja que no pierde a nadie),
 * torneos por categoría con parejas (la suya o una nueva con el compañero elegido) y quién ve qué. Cada prueba en
 * su transacción; el tiempo real al final, con su propia base (NOTIFY solo sale al confirmar).
 *
 * Mundo: liga pública «Pádel Club» (dueño org, admin sofi); miembros con jugador luis, ana, otra, nuevo, extra;
 * pedro sin cuenta. otro no es de la liga (entra solo al apuntarse). Liga privada «Club Privado» para lo que no
 * se ve.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

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
});
afterEach(async () => {
  await db.rollback();
});

const FUTURE = '2030-10-08';

interface Club {
  lid: string;
  p: { luis: string; ana: string; otra: string; nuevo: string; extra: string; pedro: string };
}

async function club(opts: { sport?: string; visibility?: 'public' | 'private'; rules?: Record<string, unknown> } = {}): Promise<Club> {
  const sport = opts.sport ?? 'padel';
  const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: opts.visibility ?? 'public', sport, requirePhoto: false });
  await db.admin(`update public.leagues set rules = $2 where id = $1`, [lid, opts.rules ?? { match: { sport } }]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const [uid, name] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
    [w.u.extra, 'extra'],
  ] as const)
    await member(db, lid, uid, 'member', name);
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    extra: await player(db, lid, 'Extra', w.u.extra),
    pedro: await player(db, lid, 'Pedro'),
  };
  return { lid, p };
}

async function night(c: Club, signup: Record<string, unknown> = { open: true, cap: 4 }, config: Record<string, unknown> = {}, date = FUTURE): Promise<string> {
  return db.rpc<string>(w.u.sofi, 'create_event', {
    p_league: c.lid,
    p_type: 'americano',
    p_date: date,
    p_name: 'Americano del jueves',
    p_config: { format: 'americano', players: [], courts: ['Cancha 1'], points: { mode: 'total', target: 24 }, signup, ...config },
  });
}

const config = async (ev: string) => (await db.admin<{ config: Record<string, unknown> }>('select config from public.events where id = $1', [ev]))[0].config;
const players = async (ev: string) => ((await config(ev)).players ?? []) as string[];
const signup = async (ev: string) => (await config(ev)).signup as { open: boolean; cap: number | null; until: string | null; rev: number };
const rows = async (ev: string) =>
  db.admin<{ entrant_id: string; status: string; category: string | null }>(
    'select entrant_id, status, category from public.event_signups where event_id = $1 order by status, queued_at, entrant_id',
    [ev],
  );
const statusOf = async (ev: string, entrant: string) => (await rows(ev)).find((r) => r.entrant_id === entrant)?.status ?? null;
const join = (uid: string, ev: string, args: Record<string, unknown> = {}) =>
  db.rpc<{ status: string; position: number; entrant_id: string; category: string | null }>(uid, 'join_signup', { p_event: ev, ...args });
const updateConfig = (ev: string, cfg: Record<string, unknown>, who = w.u.sofi) => db.rpc(who, 'update_event', { p_event: ev, p_patch: { config: cfg } });

async function subscribe(...uids: string[]) {
  let n = 0;
  for (const uid of uids) {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
      uid,
      `https://fcm.googleapis.com/fcm/send/cupo-${uid}-${n++}`,
    ]);
  }
}

const pushes = (ev: string) =>
  db.admin<{ user_id: string; title: string; body: string; url: string }>(
    `select user_id, title, body, url from public.push_outbox where tag like $1 order by user_id`,
    [`cupo:${ev}:%`],
  );

describe('ajustes', () => {
  it('se sanean: cupo 2–64, fecha límite válida, nada de más; rev lo pone la base', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 16, until: '2030-10-07T20:00:00-04:00', rev: 99 });
    expect(await signup(ev)).toEqual({ open: true, cap: 16, until: '2030-10-08T00:00:00.000Z', rev: 0 });
    for (const bad of [{ cap: 1 }, { cap: 65 }, { cap: 4.5 }, { cap: '8' }, { until: 'mañana' }, { open: 'si' }, { otro: 1 }]) {
      await fails(night(c, bad), INVALID);
    }
    await fails(night(c, [] as unknown as Record<string, unknown>), INVALID);
    // Sin tope ni fecha: también sirve (y sin «signup» no hay inscripción).
    expect(await signup(await night(c, { open: false }))).toEqual({ open: false, cap: null, until: null, rev: 0 });
    const plain = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: c.lid, p_type: 'americano', p_date: FUTURE, p_config: { format: 'americano', signup: null } });
    expect(await config(plain)).not.toHaveProperty('signup');
  });

  it('no se pueden quitar una vez puestos (la lista de espera nunca se pierde)', async () => {
    const c = await club();
    const ev = await night(c);
    const cfg = await config(ev);
    const { signup: _s, ...rest } = cfg;
    await updateConfig(ev, { ...rest, courts: ['Cancha 1', 'Cancha 2'] });
    expect((await config(ev)).courts).toEqual(['Cancha 1', 'Cancha 2']);
    expect(await signup(ev)).toMatchObject({ open: true, cap: 4 });
  });

  it('solo en noches de pádel/pickleball y torneos de raqueta', async () => {
    const c = await club();
    const liga = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: c.lid, p_type: 'liga', p_date: FUTURE, p_config: { signup: { open: true } } });
    await fails(join(w.u.luis, liga), INVALID);
    const tennis = await club({ sport: 'tennis' });
    const t = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: tennis.lid, p_type: 'liga', p_date: FUTURE, p_config: { signup: { open: true } } });
    await fails(join(w.u.luis, t), INVALID);
    await fails(join(w.u.luis, randomUUID()), 'no_existe');
    await fails(db.admin(`insert into public.event_signups (event_id, league_id, entrant_id, player_id, status) values ($1, $2, $3, $3, 'in')`, [liga, c.lid, c.p.luis]), INVALID);
  });
});

describe('«Me apunto» en la noche', () => {
  it('entra hasta llenar el cupo; después, a la lista de espera en orden', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 3 });
    expect(await join(w.u.luis, ev)).toEqual({ status: 'in', position: 1, entrant_id: c.p.luis, category: null });
    expect(await join(w.u.ana, ev)).toMatchObject({ status: 'in', position: 2 });
    expect(await join(w.u.otra, ev)).toMatchObject({ status: 'in', position: 3 });
    expect(await join(w.u.nuevo, ev)).toMatchObject({ status: 'wait', position: 1 });
    expect(await join(w.u.extra, ev)).toMatchObject({ status: 'wait', position: 2 });
    expect(await players(ev)).toEqual([c.p.luis, c.p.ana, c.p.otra]);
    expect((await db.admin<{ player_count: number }>('select player_count from public.events where id = $1', [ev]))[0].player_count).toBe(3);
    expect((await signup(ev)).rev).toBe(3);
    // Otra vez: lo mismo, sin repetir.
    expect(await join(w.u.nuevo, ev)).toMatchObject({ status: 'wait', position: 1 });
    expect(await db.count('public.event_signups', 'event_id = $1', [ev])).toBe(5);
  });

  it('cerrada, pasada la fecha límite, del evento que ya pasó o que ya empezó: «cerrado»', async () => {
    const c = await club();
    await fails(join(w.u.luis, await night(c, { open: false, cap: 4 })), 'cerrado');
    await fails(join(w.u.luis, await night(c, { open: true, until: '2020-01-01T00:00:00Z' })), 'cerrado');
    await fails(join(w.u.luis, await night(c, { open: true }, {}, '2020-01-01')), 'cerrado');
    const started = await night(c, { open: true }, { round: 1 });
    await fails(join(w.u.luis, started), 'cerrado');
  });

  it('sin tope entran todos', async () => {
    const c = await club();
    const ev = await night(c, { open: true });
    for (const uid of [w.u.luis, w.u.ana, w.u.otra, w.u.nuevo, w.u.extra]) expect((await join(uid, ev)).status).toBe('in');
    expect(await players(ev)).toHaveLength(5);
  });

  it('liga pública: quien no es miembro entra a la liga al apuntarse; privada: no', async () => {
    const c = await club();
    const ev = await night(c);
    const r = await join(w.u.otro, ev);
    expect(r.status).toBe('in');
    expect(await db.count('public.league_members', 'league_id = $1 and user_id = $2', [c.lid, w.u.otro])).toBe(1);
    expect(await db.count('public.players', 'id = $1 and user_id = $2', [r.entrant_id, w.u.otro])).toBe(1);
    const priv = await club({ visibility: 'private' });
    const pev = await night(priv);
    await fails(join(w.u.otro, pev), ['no_existe', ...DENIED]);
    await fails(join(ANON, ev), DENIED);
  });

  it('el admin ya lo tenía en la lista: queda apuntado sin repetirse', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 4 }, { players: [c.p.pedro, c.p.ana] });
    expect(await join(w.u.ana, ev)).toMatchObject({ status: 'in', position: 2 });
    expect(await players(ev)).toEqual([c.p.pedro, c.p.ana]);
  });
});

describe('«Ya no puedo» y la lista de espera que sube sola', () => {
  it('se baja uno: entra el primero de la espera y le llega el push', async () => {
    const c = await club();
    await subscribe(w.u.nuevo, w.u.extra, w.u.ana);
    const ev = await night(c, { open: true, cap: 2 });
    await join(w.u.luis, ev);
    await join(w.u.ana, ev);
    await join(w.u.nuevo, ev);
    await join(w.u.extra, ev);
    const rev = (await signup(ev)).rev;
    expect(await db.rpc(w.u.ana, 'leave_signup', { p_event: ev })).toBe(true);
    expect(await players(ev)).toEqual([c.p.luis, c.p.nuevo]);
    expect(await statusOf(ev, c.p.nuevo)).toBe('in');
    expect(await statusOf(ev, c.p.extra)).toBe('wait');
    expect(await statusOf(ev, c.p.ana)).toBeNull();
    expect((await signup(ev)).rev).toBeGreaterThan(rev);
    const got = await pushes(ev);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ user_id: w.u.nuevo, title: 'Entraste: Americano del jueves', url: `/l/${c.lid}/e/${ev}` });
    expect(got[0].body).toContain('Se liberó un cupo');
    // Ya no estaba: false.
    expect(await db.rpc(w.u.ana, 'leave_signup', { p_event: ev })).toBe(false);
    // Bajarse de la espera no mueve la lista.
    expect(await db.rpc(w.u.extra, 'leave_signup', { p_event: ev })).toBe(true);
    expect(await players(ev)).toEqual([c.p.luis, c.p.nuevo]);
  });

  it('solo el propio o el admin; ya empezada, solo el admin (y ya no sube nadie)', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 2 });
    await join(w.u.luis, ev);
    await join(w.u.ana, ev);
    await join(w.u.otra, ev);
    await fails(db.rpc(w.u.otra, 'leave_signup', { p_event: ev, p_entrant: c.p.luis }), DENIED);
    // Sin nada que bajar: false (no es de nadie de esta cuenta).
    expect(await db.rpc(w.u.nuevo, 'leave_signup', { p_event: ev })).toBe(false);
    await db.admin(`update public.events set config = config || '{"round": 1}' where id = $1`, [ev]);
    await fails(db.rpc(w.u.luis, 'leave_signup', { p_event: ev }), 'cerrado');
    expect(await db.rpc(w.u.sofi, 'leave_signup', { p_event: ev, p_entrant: c.p.luis })).toBe(true);
    expect(await players(ev)).toEqual([c.p.ana]);
    expect(await statusOf(ev, c.p.otra)).toBe('wait');
    // De la espera sí se puede salir aunque ya empezó.
    expect(await db.rpc(w.u.otra, 'leave_signup', { p_event: ev })).toBe(true);
    expect(await statusOf(ev, c.p.otra)).toBeNull();
  });

  it('la espera sigue el orden de llegada aunque todo pase en el mismo instante', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 2 });
    for (const uid of [w.u.luis, w.u.ana, w.u.extra, w.u.nuevo, w.u.otra]) await join(uid, ev);
    expect(await join(w.u.extra, ev)).toMatchObject({ status: 'wait', position: 1 });
    expect(await join(w.u.nuevo, ev)).toMatchObject({ status: 'wait', position: 2 });
    expect(await join(w.u.otra, ev)).toMatchObject({ status: 'wait', position: 3 });
    await db.rpc(w.u.luis, 'leave_signup', { p_event: ev });
    await db.rpc(w.u.ana, 'leave_signup', { p_event: ev });
    expect(await players(ev)).toEqual([c.p.extra, c.p.nuevo]);
    expect(await join(w.u.otra, ev)).toMatchObject({ status: 'wait', position: 1 });
  });

  it('sin cupo la lista llega hasta 64 y lo demás espera', async () => {
    const c = await club();
    const many: string[] = [];
    for (let i = 0; i < 63; i++) many.push(await player(db, c.lid, `Jugador ${i + 1}`));
    const ev = await night(c, { open: true }, { players: many });
    expect(await join(w.u.luis, ev)).toMatchObject({ status: 'in', position: 64 });
    expect(await join(w.u.ana, ev)).toMatchObject({ status: 'wait', position: 1 });
  });

  it('el admin sube el cupo: entran los que esperaban', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 2 });
    for (const uid of [w.u.luis, w.u.ana, w.u.otra, w.u.nuevo]) await join(uid, ev);
    const cfg = await config(ev);
    await updateConfig(ev, { ...cfg, signup: { ...(cfg.signup as object), cap: 3 } });
    expect(await players(ev)).toEqual([c.p.luis, c.p.ana, c.p.otra]);
    expect(await statusOf(ev, c.p.nuevo)).toBe('wait');
  });
});

describe('el admin sigue armando la lista a mano', () => {
  it('saca a un apuntado (lista al día): sale y entra el primero de la espera', async () => {
    const c = await club();
    await subscribe(w.u.otra);
    const ev = await night(c, { open: true, cap: 2 });
    for (const uid of [w.u.luis, w.u.ana, w.u.otra]) await join(uid, ev);
    const cfg = await config(ev);
    await updateConfig(ev, { ...cfg, players: [c.p.ana] });
    expect(await players(ev)).toEqual([c.p.ana, c.p.otra]);
    expect(await statusOf(ev, c.p.luis)).toBeNull();
    expect(await statusOf(ev, c.p.otra)).toBe('in');
    expect((await pushes(ev)).map((p) => p.user_id)).toEqual([w.u.otra]);
  });

  it('pone en la lista a alguien de la espera: entra (con push); a alguien sin la app: cuenta para el cupo', async () => {
    const c = await club();
    await subscribe(w.u.nuevo);
    const ev = await night(c, { open: true, cap: 2 });
    for (const uid of [w.u.luis, w.u.ana, w.u.nuevo]) await join(uid, ev);
    const cfg = await config(ev);
    await updateConfig(ev, { ...cfg, players: [c.p.luis, c.p.ana, c.p.nuevo, c.p.pedro] });
    expect(await statusOf(ev, c.p.nuevo)).toBe('in');
    expect((await pushes(ev)).map((p) => p.user_id)).toEqual([w.u.nuevo]);
    // Lista llena (4 de 2): el que llega va a la espera.
    expect((await join(w.u.otra, ev)).status).toBe('wait');
  });

  it('una lista vieja (otro rev: alguien se apuntó mientras tanto) no pierde a nadie', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 8 });
    await join(w.u.luis, ev);
    const stale = await config(ev);
    await join(w.u.ana, ev);
    await updateConfig(ev, { ...stale, courts: ['Central'], players: [c.p.luis, c.p.pedro] });
    expect(await players(ev)).toEqual([c.p.luis, c.p.pedro, c.p.ana]);
    expect((await config(ev)).courts).toEqual(['Central']);
    expect(await statusOf(ev, c.p.ana)).toBe('in');
  });

  it('set_signup: meter (aunque pase el cupo), a la espera, subir de la espera (con push) y sacar; solo el admin', async () => {
    const c = await club();
    await subscribe(w.u.ana, w.u.otra);
    const ev = await night(c, { open: true, cap: 2 });
    await join(w.u.luis, ev);
    expect(await db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.pedro, p_status: 'in' })).toBe('in');
    expect(await players(ev)).toEqual([c.p.luis, c.p.pedro]);
    expect(await db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.ana, p_status: 'wait' })).toBe('wait');
    // Meterla aunque la lista esté llena: entra (con push).
    expect(await db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.ana, p_status: 'in' })).toBe('in');
    expect(await players(ev)).toEqual([c.p.luis, c.p.pedro, c.p.ana]);
    expect((await pushes(ev)).map((p) => p.user_id)).toEqual([w.u.ana]);
    expect(await db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.pedro, p_status: null })).toBeNull();
    expect(await players(ev)).toEqual([c.p.luis, c.p.ana]);
    // Pasar a la espera a alguien de la lista: va al final de la espera y entra la primera que esperaba.
    expect((await join(w.u.otra, ev)).status).toBe('wait');
    expect(await db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.ana, p_status: 'wait' })).toBe('wait');
    expect(await players(ev)).toEqual([c.p.luis, c.p.otra]);
    expect(await statusOf(ev, c.p.otra)).toBe('in');
    await fails(db.rpc(w.u.luis, 'set_signup', { p_event: ev, p_entrant: c.p.ana, p_status: 'in' }), DENIED);
    await fails(db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.ana, p_status: 'maybe' }), INVALID);
    await fails(db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: w.p.pedro, p_status: 'in' }), INVALID);
  });

  it('una pantalla que no conoce la inscripción (guarda sin «signup») no pierde a nadie ni los ajustes', async () => {
    const c = await club();
    const ev = await night(c, { open: true, cap: 4 });
    await join(w.u.luis, ev);
    const { signup: _s, ...rest } = await config(ev);
    // Otra pantalla que no conoce la inscripción guarda la lista sin Luis: nadie apuntado se pierde.
    await updateConfig(ev, { ...rest, players: [c.p.pedro] });
    expect(await players(ev)).toEqual([c.p.pedro, c.p.luis]);
    expect(await signup(ev)).toMatchObject({ open: true, cap: 4 });
  });
});

describe('torneo', () => {
  async function tourney(c: Club, categories: { id: string; name: string; pairs?: string[] }[], signup: Record<string, unknown> = { open: true, cap: 2 }) {
    return db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: c.lid,
      p_type: 'torneo',
      p_date: FUTURE,
      p_name: 'Torneo de octubre',
      p_config: {
        v: 1,
        format: 'torneo',
        categories: categories.map((x) => ({ pairs: [], groups: 0, perGroup: 2, thirdPlace: true, ...x })),
        courts: [],
        points: 'standard',
        signup,
      },
    });
  }
  const pairsOf = async (ev: string) =>
    Object.fromEntries(((await config(ev)).categories as { id: string; pairs: string[] }[]).map((x) => [x.id, x.pairs]));
  const pair = (c: Club, name: string, ids: string[]) =>
    db.rpc<string>(w.u.sofi, 'create_season_team', { p_league: c.lid, p_name: name, p_players: ids.map((player_id) => ({ player_id })) });

  it('dobles: con su pareja (la única que tiene) o con el compañero elegido (la pareja se crea una vez)', async () => {
    const c = await club();
    await subscribe(w.u.luis, w.u.ana);
    const ev = await tourney(c, [{ id: 'A', name: 'Categoría A' }]);
    const t1 = await pair(c, 'Luis / Ana', [c.p.luis, c.p.ana]);
    expect(await join(w.u.ana, ev)).toMatchObject({ status: 'in', entrant_id: t1, category: 'A', position: 1 });
    // Al compañero le llega que lo apuntaron (a quien apuntó, no).
    const told = await db.admin<{ user_id: string; title: string; body: string }>(`select user_id, title, body from public.push_outbox where tag like $1`, [`pareja:${ev}:%`]);
    expect(told.map((x) => x.user_id)).toEqual([w.u.luis]);
    expect(told[0]).toMatchObject({ title: 'Te apuntaron: Torneo de octubre' });
    expect(told[0].body).toContain('Ana los apuntó como pareja.');
    const r = await join(w.u.otra, ev, { p_partner: c.p.pedro });
    expect(r).toMatchObject({ status: 'in', category: 'A', position: 2 });
    const team = await db.admin<{ name: string; event_id: string | null }>('select name, event_id from public.teams where id = $1', [r.entrant_id]);
    expect(team).toEqual([{ name: 'Otra / Pedro', event_id: null }]);
    expect(await db.count('public.team_players', 'team_id = $1', [r.entrant_id])).toBe(2);
    expect(await pairsOf(ev)).toEqual({ A: [t1, r.entrant_id] });
    // Pedro (sin cuenta) ya está en una pareja apuntada: nadie más puede apuntarse con él.
    await fails(join(w.u.nuevo, ev, { p_partner: c.p.pedro }), 'duplicado');
    // Cupo lleno: a la espera, con la misma pareja otra vez no crea otra.
    const wait = await join(w.u.nuevo, ev, { p_partner: c.p.extra });
    expect(wait).toMatchObject({ status: 'wait', position: 1 });
    expect(await join(w.u.extra, ev, { p_partner: c.p.nuevo })).toMatchObject({ status: 'wait', entrant_id: wait.entrant_id });
    // Sin pareja y sin compañero: no se sabe con quién.
    const solo = await club();
    const ev2 = await tourney(solo, [{ id: 'A', name: 'A' }]);
    await fails(join(w.u.luis, ev2), INVALID);
    await fails(join(w.u.luis, ev2, { p_partner: solo.p.luis }), INVALID);
    // Una pareja de otro no sirve.
    const other = await pair(solo, 'Ana / Otra', [solo.p.ana, solo.p.otra]);
    await fails(join(w.u.luis, ev2, { p_team: other }), INVALID);
  });

  it('cupo y espera por categoría; la categoría se elige si hay varias', async () => {
    const c = await club({ sport: 'tennis' });
    const ev = await tourney(c, [
      { id: 'A', name: 'Categoría A' },
      { id: 'B', name: 'Categoría B' },
    ]);
    await fails(join(w.u.luis, ev), INVALID);
    await fails(join(w.u.luis, ev, { p_category: 'Z' }), INVALID);
    expect(await join(w.u.luis, ev, { p_category: 'A' })).toMatchObject({ status: 'in', entrant_id: c.p.luis, category: 'A' });
    expect(await join(w.u.ana, ev, { p_category: 'A' })).toMatchObject({ status: 'in' });
    expect(await join(w.u.otra, ev, { p_category: 'A' })).toMatchObject({ status: 'wait', position: 1 });
    expect(await join(w.u.nuevo, ev, { p_category: 'B' })).toMatchObject({ status: 'in', position: 1 });
    expect(await pairsOf(ev)).toEqual({ A: [c.p.luis, c.p.ana], B: [c.p.nuevo] });
    // Se baja uno de la B: nadie de la A sube a la B.
    await db.rpc(w.u.nuevo, 'leave_signup', { p_event: ev });
    expect(await statusOf(ev, c.p.otra)).toBe('wait');
    // Se baja uno de la A: sube la de la A.
    await db.rpc(w.u.luis, 'leave_signup', { p_event: ev });
    expect(await pairsOf(ev)).toEqual({ A: [c.p.ana, c.p.otra], B: [] });
    // El admin la cambia de categoría: su inscripción la sigue.
    await db.rpc(w.u.sofi, 'set_signup', { p_event: ev, p_entrant: c.p.otra, p_status: 'in', p_category: 'B' });
    expect(await pairsOf(ev)).toEqual({ A: [c.p.ana], B: [c.p.otra] });
    expect((await rows(ev)).find((r) => r.entrant_id === c.p.otra)?.category).toBe('B');
  });

  it('con los grupos armados ya no sube nadie ni se baja nadie solo', async () => {
    const c = await club({ sport: 'tennis' });
    const ev = await tourney(c, [{ id: 'A', name: 'Categoría A' }], { open: true, cap: 2 });
    for (const uid of [w.u.luis, w.u.ana, w.u.otra]) await join(uid, ev);
    const cfg = await config(ev);
    const cats = cfg.categories as Record<string, unknown>[];
    await updateConfig(ev, { ...cfg, categories: [{ ...cats[0], groups: 1, groupsOf: [[c.p.luis, c.p.ana]] }] });
    await fails(db.rpc(w.u.luis, 'leave_signup', { p_event: ev }), 'cerrado');
    await fails(join(w.u.nuevo, ev), 'cerrado');
    await db.rpc(w.u.sofi, 'leave_signup', { p_event: ev, p_entrant: c.p.luis });
    expect(await pairsOf(ev)).toEqual({ A: [c.p.ana] });
    expect(await statusOf(ev, c.p.otra)).toBe('wait');
  });

  it('dobles: cualquiera de la pareja la baja', async () => {
    const c = await club();
    const ev = await tourney(c, [{ id: 'A', name: 'A' }]);
    const r = await join(w.u.luis, ev, { p_partner: c.p.ana });
    expect(await db.rpc(w.u.ana, 'leave_signup', { p_event: ev })).toBe(true);
    expect(await pairsOf(ev)).toEqual({ A: [] });
    expect(await statusOf(ev, r.entrant_id)).toBeNull();
  });
});

describe('quién ve qué', () => {
  it('liga pública: cualquiera ve la lista; privada: solo sus miembros; nadie escribe directo', async () => {
    const c = await club();
    const ev = await night(c);
    await join(w.u.luis, ev);
    expect(await db.asAnon('select entrant_id from public.event_signups where event_id = $1', [ev])).toHaveLength(1);
    const priv = await club({ visibility: 'private' });
    const pev = await night(priv);
    await join(w.u.luis, pev);
    expect(await db.asUser(w.u.otro, 'select entrant_id from public.event_signups where event_id = $1', [pev])).toHaveLength(0);
    expect(await db.asUser(w.u.ana, 'select entrant_id from public.event_signups where event_id = $1', [pev])).toHaveLength(1);
    await fails(db.asUser(w.u.luis, `delete from public.event_signups where event_id = $1`, [pev]), DENIED);
    await fails(db.asUser(w.u.luis, `update public.event_signups set status = 'in' where event_id = $1`, [pev]), DENIED);
  });

  it('borrar el evento borra la lista (con su marca de borrado)', async () => {
    const c = await club();
    const ev = await night(c);
    await join(w.u.luis, ev);
    await db.rpc(w.u.sofi, 'delete_event', { p_event: ev });
    expect(await db.count('public.event_signups', 'event_id = $1', [ev])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'event_signups' and row_key = $1`, [`${ev}:${c.p.luis}`])).toBe(1);
  });
});

describe('tiempo real', () => {
  interface Msg {
    topic: string;
    event: string;
    payload: Record<string, unknown>;
  }
  let rt: TestDb;
  const msgs: Msg[] = [];

  beforeAll(async () => {
    rt = await TestDb.open();
    await rt.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw) as Msg));
  });
  afterAll(async () => {
    await rt.pg.close();
  });

  it('apuntarse y bajarse avisan al evento y a la liga («signups»)', async () => {
    const world = await makeWorld(rt);
    const lid = await league(rt, world.u.org, { name: 'En vivo', visibility: 'public', sport: 'padel', requirePhoto: false });
    await member(rt, lid, world.u.org, 'owner', 'org');
    await member(rt, lid, world.u.luis, 'member', 'luis');
    await player(rt, lid, 'Luis', world.u.luis);
    const ev = await rt.rpc<string>(world.u.org, 'create_event', {
      p_league: lid,
      p_type: 'americano',
      p_date: FUTURE,
      p_config: { format: 'americano', players: [], signup: { open: true, cap: 8 } },
    });
    msgs.length = 0;
    await rt.rpc(world.u.luis, 'join_signup', { p_event: ev });
    await new Promise((r) => setTimeout(r, 50));
    const got = msgs.filter((m) => m.event === 'signups');
    expect(got.some((m) => m.topic === `event:${ev}` && m.payload.op === 'insert')).toBe(true);
    expect(got.some((m) => m.topic === `league:${lid}` && m.payload.event_id === ev)).toBe(true);
    // La lista (config.players) cambia con el aviso de eventos de siempre.
    expect(msgs.some((m) => m.topic === `league:${lid}` && m.event === 'events')).toBe(true);
    msgs.length = 0;
    await rt.rpc(world.u.luis, 'leave_signup', { p_event: ev });
    await new Promise((r) => setTimeout(r, 50));
    expect(msgs.some((m) => m.event === 'signups' && m.topic === `event:${ev}` && m.payload.op === 'delete')).toBe(true);
  });
});
