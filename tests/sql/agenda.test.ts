/**
 * «¿Dónde juego esta semana?» (public_agenda, 20260929000700_temporadas.sql): lo que viene en las ligas públicas sin
 * menores donde uno se puede apuntar y hay lugar (boliche con «Voy», rondas de golf abiertas, noches y torneos de
 * raqueta con inscripción abierta), con y sin cuenta, los filtros, lo que ya es mío y el tope sin cuenta.
 *
 * Mundo: el de fixture.ts (liga pública de boliche «Liga Abierta» de otro, con horario «Martes 7 pm»; liga privada
 * «Liga del Banco»), más una liga pública de pádel «Pádel Club» y una de golf «Golf Abierto». Las fechas van a partir
 * de BASE (dentro de 40 días) para no depender del día en que corre la prueba. Cada prueba en su transacción.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { DEMO_COURSE } from '../../src/sports/golf/demo';

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

interface Item {
  eventId: string;
  leagueId: string;
  leagueName: string;
  sport: string;
  leagueKind: string;
  type: string;
  name: string;
  date: string;
  time: string | null;
  timeLabel: string | null;
  venue: string;
  join: string;
  cap: number | null;
  taken: number | null;
  spotsLeft: number | null;
  waitlist: number | null;
  until: string | null;
  categories: { id: string; name: string; cap: number | null; taken: number; spotsLeft: number | null }[] | null;
  mine: boolean;
  url: string;
}
interface Agenda {
  from: string;
  days: number;
  items: Item[];
}

/** Hoy en RD más n días ('YYYY-MM-DD'). */
async function day(n: number): Promise<string> {
  const [{ d }] = await db.admin<{ d: string }>(`select to_char((now() at time zone 'America/Santo_Domingo')::date + $1::integer, 'YYYY-MM-DD') as d`, [n]);
  return d;
}
/** El primer martes desde ese día. */
async function tuesdayFrom(d: string): Promise<string> {
  const [{ t }] = await db.admin<{ t: string }>(`select to_char($1::date + ((9 - extract(isodow from $1::date)::integer) % 7), 'YYYY-MM-DD') as t`, [d]);
  return t;
}
const agenda = (who: string, args: Record<string, unknown> = {}) => db.rpc<Agenda>(who, 'public_agenda', args);
const ids = (a: Agenda) => a.items.map((i) => i.eventId);

let BASE: string;

async function padel() {
  const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'public', sport: 'padel', requirePhoto: false });
  await db.admin(`update public.leagues set rules = $2, venue = 'Club Naco', schedule = 'Jueves 8:00 pm' where id = $1`, [lid, { match: { sport: 'padel' } }]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.luis, 'member', 'luis');
  const p = { luis: await player(db, lid, 'Luis', w.u.luis), pedro: await player(db, lid, 'Pedro'), ana: await player(db, lid, 'Ana') };
  const night = (date: string, signup: Record<string, unknown>, players: string[] = [], name = 'Americano') =>
    db.rpc<string>(w.u.org, 'create_event', {
      p_league: lid,
      p_type: 'americano',
      p_date: date,
      p_name: name,
      p_start_time: '19:30',
      p_config: { format: 'americano', players, courts: ['Cancha 1'], points: { mode: 'total', target: 24 }, signup },
    });
  return { lid, p, night };
}

describe('qué sale', () => {
  beforeEach(async () => {
    BASE = await day(40);
  });

  it('boliche de ligas públicas con «Voy»: hora del evento o la del horario de la liga; lo privado no', async () => {
    const tue = await tuesdayFrom(BASE);
    const withTime = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'torneo', p_date: tue, p_name: 'Copa de octubre', p_start_time: '18:15' });
    const bySchedule = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'practica', p_date: tue });
    const priv = await db.rpc<string>(w.u.org, 'create_event', { p_league: w.priv, p_type: 'practica', p_date: tue });
    await db.rpc(w.u.otro, 'set_rsvp', { p_event: bySchedule, p_going: true, p_player: w.p.p1 });
    const a = await agenda(w.u.luis, { p_from: BASE });
    expect(a).toMatchObject({ from: BASE, days: 14 });
    expect(ids(a)).not.toContain(priv);
    const copa = a.items.find((i) => i.eventId === withTime)!;
    expect(copa).toEqual({
      eventId: withTime,
      leagueId: w.pub,
      leagueName: 'Liga Abierta',
      sport: 'bowling',
      leagueKind: 'liga',
      // El logo de la liga (20260929001000_sueltos_logos.sql): sin logo, null.
      logoPath: null,
      type: 'torneo',
      name: 'Copa de octubre',
      date: tue,
      time: '18:15',
      timeLabel: '6:15 pm',
      venue: 'Bolera',
      join: 'rsvp',
      cap: null,
      taken: 0,
      spotsLeft: null,
      waitlist: null,
      until: null,
      categories: null,
      mine: false,
      url: `/l/${w.pub}/e/${withTime}`,
    });
    expect(a.items.find((i) => i.eventId === bySchedule)).toMatchObject({ time: '19:00', timeLabel: '7:00 pm', taken: 1 });
    // Por día y hora: el torneo de las 6:15 va antes que la práctica de las 7.
    expect(ids(a).indexOf(withTime)).toBeLessThan(ids(a).indexOf(bySchedule));
  });

  it('raqueta: noches con inscripción abierta y lugar (con cupo o sin tope); llenas, cerradas o vencidas no', async () => {
    const c = await padel();
    const d = await day(41);
    const open = await c.night(d, { open: true, cap: 4 }, [c.p.pedro]);
    const full = await c.night(d, { open: true, cap: 2 }, [c.p.pedro, c.p.ana], 'Llena');
    const closed = await c.night(d, { open: false, cap: 8 }, [], 'Cerrada');
    const late = await c.night(d, { open: true, cap: 8, until: '2020-01-01T00:00:00Z' }, [], 'Vencida');
    const free = await c.night(d, { open: true }, [], 'Sin tope');
    const noSignup = await db.rpc<string>(w.u.org, 'create_event', {
      p_league: c.lid,
      p_type: 'americano',
      p_date: d,
      p_config: { format: 'americano', players: [], courts: ['Cancha 1'], points: { mode: 'total', target: 24 } },
    });
    // Alguien en espera en la llena.
    await db.rpc(w.u.luis, 'join_signup', { p_event: full });
    const a = await agenda(ANON, { p_from: BASE, p_sport: 'padel' });
    expect(ids(a).sort()).toEqual([open, free].sort());
    expect(a.items.find((i) => i.eventId === open)).toMatchObject({
      join: 'signup',
      cap: 4,
      taken: 1,
      spotsLeft: 3,
      waitlist: 0,
      time: '19:30',
      timeLabel: '7:30 pm',
      venue: 'Club Naco',
      categories: null,
      mine: false,
    });
    expect(a.items.find((i) => i.eventId === free)).toMatchObject({ cap: null, taken: 0, spotsLeft: null });
    for (const e of [full, closed, late, noSignup]) expect(ids(a)).not.toContain(e);
    // Se llena: ya no sale.
    await db.rpc(w.u.org, 'set_signup', { p_event: open, p_entrant: c.p.ana, p_status: 'in' });
    await db.rpc(w.u.luis, 'join_signup', { p_event: open });
    expect((await agenda(ANON, { p_from: BASE, p_sport: 'padel' })).items.find((i) => i.eventId === open)).toMatchObject({ taken: 3, spotsLeft: 1 });
    await db.rpc(w.u.org, 'set_signup', { p_event: open, p_entrant: await player(db, c.lid, 'Mia'), p_status: 'in' });
    expect(ids(await agenda(ANON, { p_from: BASE, p_sport: 'padel' }))).toEqual([free]);
  });

  it('raqueta: torneo por categoría (lugar en alguna)', async () => {
    const c = await padel();
    const d = await day(42);
    const pair = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: c.lid, p_name: 'Pedro / Ana', p_players: [{ player_id: c.p.pedro }, { player_id: c.p.ana }] });
    const t = await db.rpc<string>(w.u.org, 'create_event', {
      p_league: c.lid,
      p_type: 'torneo',
      p_date: d,
      p_name: 'Torneo',
      p_config: {
        v: 1,
        format: 'torneo',
        categories: [
          { id: 'A', name: 'Primera', pairs: [pair], groups: 0, perGroup: 2, thirdPlace: true },
          { id: 'B', name: 'Segunda', pairs: [], groups: 0, perGroup: 2, thirdPlace: true },
        ],
        courts: [],
        points: 'standard',
        signup: { open: true, cap: 2 },
      },
    });
    const a = await agenda(w.u.luis, { p_from: BASE, p_sport: 'padel' });
    expect(a.items.find((i) => i.eventId === t)).toMatchObject({
      join: 'signup',
      cap: 2,
      taken: 1,
      spotsLeft: 3,
      categories: [
        { id: 'A', name: 'Primera', cap: 2, taken: 1, spotsLeft: 1 },
        { id: 'B', name: 'Segunda', cap: 2, taken: 0, spotsLeft: 2 },
      ],
    });
  });

  it('golf: rondas abiertas; cerradas no; un deporte cerrado no sale', async () => {
    const lid = await league(db, w.u.org, { name: 'Golf Abierto', visibility: 'public', sport: 'golf', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    await player(db, lid, 'Org', w.u.org);
    const course = await db.rpc<string>(w.u.org, 'golf_save_course', {
      p_league: lid,
      p_name: 'Campo',
      p_holes: DEMO_COURSE.holes.map((h) => ({ par: h.par, si: h.si })),
      p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
    });
    const r1 = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: lid, p_date: await day(43), p_course: course });
    const r2 = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: lid, p_date: await day(44), p_course: course });
    await db.rpc(w.u.org, 'golf_register', { p_event: r1 });
    await db.admin(`update public.golf_rounds set status = 'cerrada' where event_id = $1`, [r2]);
    const a = await agenda(w.u.org, { p_from: BASE, p_sport: 'golf' });
    expect(a.items.map((i) => [i.eventId, i.join, i.taken, i.mine])).toEqual([[r1, 'golf', 1, true]]);
    await db.admin(`update public.sport_status set status = 'closed' where id = 'golf'`);
    expect((await agenda(w.u.org, { p_from: BASE, p_sport: 'golf' })).items).toEqual([]);
  });
});

describe('filtros y quién', () => {
  beforeEach(async () => {
    BASE = await day(40);
  });

  it('por deporte y por días; lo que ya pasó no; por defecto desde hoy y 14 días', async () => {
    const c = await padel();
    const bowl = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'practica', p_date: BASE });
    const later = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'practica', p_date: await day(42) });
    const night = await c.night(BASE, { open: true, cap: 4 });
    expect(ids(await agenda(ANON, { p_from: BASE, p_days: 1 })).sort()).toEqual([bowl, night].sort());
    expect(ids(await agenda(ANON, { p_from: BASE, p_days: 1, p_sport: 'bowling' }))).toEqual([bowl]);
    expect(ids(await agenda(ANON, { p_from: BASE, p_days: 3, p_sport: 'bowling' })).sort()).toEqual([bowl, later].sort());
    // Por defecto: desde hoy. Lo de ayer no sale aunque se pida desde antes.
    const soon = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'practica', p_date: await day(1) });
    const past = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'practica', p_date: await day(-1) });
    const def = await agenda(ANON);
    expect(def).toMatchObject({ from: await day(0), days: 14 });
    expect(ids(def)).toContain(soon);
    expect(ids(def)).not.toContain(bowl);
    expect(ids(await agenda(ANON, { p_from: await day(-3) }))).not.toContain(past);
    // Datos que no sirven.
    for (const bad of [{ p_days: 0 }, { p_days: 32 }, { p_sport: 'curling' }, { p_from: '1990-01-01' }]) await fails(agenda(ANON, bad), INVALID);
  });

  it('«mine»: ya voy, ya estoy apuntado (en la lista o en espera)', async () => {
    const c = await padel();
    const bowl = await db.rpc<string>(w.u.otro, 'create_event', { p_league: w.pub, p_type: 'practica', p_date: BASE });
    const night = await c.night(BASE, { open: true, cap: 4 });
    const mine = async (who: string) => Object.fromEntries((await agenda(who, { p_from: BASE, p_days: 1 })).items.map((i) => [i.eventId, i.mine]));
    expect(await mine(w.u.luis)).toEqual({ [bowl]: false, [night]: false });
    await db.rpc(w.u.luis, 'join_league', { p_league: w.pub });
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: bowl, p_going: true });
    await db.rpc(w.u.luis, 'join_signup', { p_event: night });
    expect(await mine(w.u.luis)).toEqual({ [bowl]: true, [night]: true });
    expect(await mine(w.u.ana)).toEqual({ [bowl]: false, [night]: false });
    expect(await mine(ANON)).toEqual({ [bowl]: false, [night]: false });
  });

  it('sin cuenta: 60 consultas cada 10 minutos; con cuenta no hay tope', async () => {
    for (let i = 0; i < 60; i++) await agenda(ANON, { p_days: 1 });
    await fails(agenda(ANON, { p_days: 1 }), 'rate_limited');
    expect(await agenda(w.u.luis, { p_days: 1 })).toMatchObject({ days: 1 });
    expect(await db.count('private.rate_limits', `key like 'agenda:%'`)).toBe(1);
  });

  it('las ligas privadas nunca salen (tampoco para sus miembros)', async () => {
    const e = await db.rpc<string>(w.u.org, 'create_event', { p_league: w.priv, p_type: 'practica', p_date: BASE });
    for (const who of [ANON, w.u.org, w.u.luis, w.u.dios]) expect(ids(await agenda(who, { p_from: BASE }))).not.toContain(e);
  });
});
