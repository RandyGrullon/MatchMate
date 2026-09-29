/**
 * Premios del torneo (20260929001200_premios_torneo.sql, docs/premios-torneo.md): elegir la insignia de cada lugar
 * (set_tournament_prizes), el podio que calcula el servidor (tournament_podium: boliche por scratch y handicap igual
 * que src/lib/stats.ts, cuadros de raqueta, relámpago y playoffs), entregar y corregir (deliver_tournament_prizes: por
 * estado deseado, 14 días, cerrar, push), golf, natación y noches (el orden lo arma el teléfono: el servidor revisa que
 * jugaron y que nadie se lo da a sí mismo), la convivencia con el creador de insignias (cupos, topes, índice único,
 * fusiones, el guardia del vínculo), quién ve qué, el tiempo real y el torneo nuevo del boliche con sus reglas.
 *
 * Mundo: el de fixture.ts (liga privada «Liga del Banco»: dueño org, admin sofi, miembro luis) con jugadores de org y
 * sofi y los invitados Pedro, Gina, Rafa y Toño. Cada prueba en su transacción (se deshace al final).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { bowlingStandings, entryLine } from '../../src/lib/stats';
import type { BowlingEvent, Entry } from '../../src/lib/types';
import { DEMO_COURSE } from '../../src/sports/golf/demo';

let db: TestDb;
let w: World;
/** Jugadores de la liga privada: org, sofi y luis con cuenta; pedro, gina, rafa y tono sin cuenta. */
let P: { org: string; sofi: string; luis: string; pedro: string; gina: string; rafa: string; tono: string };

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  P = {
    org: await player(db, w.priv, 'Org', w.u.org),
    sofi: await player(db, w.priv, 'Sofi', w.u.sofi),
    luis: w.p.luis,
    pedro: w.p.pedro,
    gina: await player(db, w.priv, 'Gina'),
    rafa: await player(db, w.priv, 'Rafa'),
    tono: await player(db, w.priv, 'Toño'),
  };
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;
interface Slot {
  id: string;
  category: string;
  division: string;
  label: string;
  place: number;
  badgeId: string;
  title: string;
  winners: Json[];
  verified: boolean;
  deliveredAt: string | null;
  deliveredBy: string | null;
  editableUntil: string | null;
}
interface Prize {
  id: string;
  leagueId: string;
  scope: string;
  refId: string;
  period: string;
  closedAt: string | null;
  closedBy: string | null;
  slots: Slot[];
}
interface Unit {
  ref: string;
  name: string;
  teamId: string | null;
  /** played: en equipos y lados de raqueta, si apareció en la alineación. */
  players: { id: string; name: string; played?: boolean }[];
}
interface PodiumSlot {
  slotId: string;
  verified: boolean;
  status: string;
  finished: boolean;
  units: Unit[];
  holders: { awardId: string; playerId: string; teamId: string | null }[];
  withdrawn: string[];
}
interface Podium {
  prizeId: string;
  kind: string | null;
  verified: boolean;
  slots: PodiumSlot[];
}
interface Delivery {
  added: number;
  revoked: number;
  unchanged: number;
  notified: number;
  prize: Prize;
}
type Want = { slot_id: string; units: { ref: string; players: string[] }[] };

const NEW_RPC = ['close_tournament_prizes', 'deliver_tournament_prizes', 'set_tournament_prizes', 'tournament_podium'];
const PRIVATE_FNS = [
  'emit_tournament_prizes', 'prize_allowed', 'prize_bowling_lines', 'prize_bowling_rank', 'prize_category_order', 'prize_comp',
  'prize_comp_name', 'prize_decided_at', 'prize_default_label', 'prize_default_period', 'prize_finished', 'prize_json', 'prize_match_at',
  'prize_match_winner', 'prize_place_label', 'prize_players_json', 'prize_playoff_place', 'prize_racket_doubles',
  'prize_racket_place', 'prize_ref_exists', 'prize_server_podium', 'prize_side_unit', 'prize_slot_title', 'prize_team_ko_place',
  'prize_team_unit', 'prize_unit_players', 'prize_uuid',
];
const CAMPEON = { name: 'Campeón', shape: 'shield', palette: 'oro', icon: 'trophy', limit_kind: 'unica', template: 'champion' };
const SUB = { name: 'Subcampeón', shape: 'shield', palette: 'plata', icon: 'medal', limit_kind: 'unica', template: 'runner_up' };
const MARK = 'sin-foto';

/** Un diseño de la liga (del creador); devuelve su id. */
const design = async (lid: string, extra: Json = {}, who = w.u.org) =>
  (await db.rpc<{ id: string }>(who, 'save_league_badge', { p_league: lid, p_id: null, p_design: { ...CAMPEON, ...extra } })).id;
const setPrizes = (who: string, lid: string, scope: string, ref: string, slots: Json[], period: string | null = 'OCT 2026') =>
  db.rpc<Prize | null>(who, 'set_tournament_prizes', { p_league: lid, p_scope: scope, p_ref: ref, p_period: period, p_slots: slots });
const podium = (who: string, prize: string) => db.rpc<Podium>(who, 'tournament_podium', { p_prize: prize });
const deliver = (who: string, prize: string, want: Want[], notify = true) =>
  db.rpc<Delivery>(who, 'deliver_tournament_prizes', { p_prize: prize, p_podium: want, p_notify: notify });
/** Lo que propone el servidor (todos marcados) para esos lugares. */
const proposal = (p: Podium, slots: string[] = p.slots.map((s) => s.slotId)): Want[] =>
  p.slots
    .filter((s) => slots.includes(s.slotId))
    .map((s) => ({ slot_id: s.slotId, units: s.units.map((u) => ({ ref: u.ref, players: u.players.map((x) => x.id) })) }));
const slotOf = (p: Prize, category: string, place: number, division = '') =>
  p.slots.find((s) => s.category === category && s.place === place && s.division === division)!;
const st = (p: Podium, slot: string) => p.slots.find((s) => s.slotId === slot)!;
const refs = (s: PodiumSlot) => s.units.map((u) => u.ref).sort();
const ids = (s: PodiumSlot, ref: string) => s.units.find((u) => u.ref === ref)!.players.map((x) => x.id).sort();
const sorted = (xs: string[]) => [...xs].sort();
const awards = (where = 'true', params: unknown[] = []) =>
  db.admin<Json>(
    `select id, badge_id, player_id, team_id, period, division, note, awarded_by, prize_slot_id, revoked_at is not null as revoked,
            revoke_reason
       from public.league_badge_awards where ${where} order by awarded_at, player_id, id`,
    params,
  );
const holders = async (slot: string) =>
  (await db.admin<{ player_id: string }>('select player_id from public.league_badge_awards where prize_slot_id = $1 and revoked_at is null', [slot])).map(
    (r) => r.player_id,
  );
/** Hoy (en la zona de la liga) más n días. */
const day = async (lid: string, n: number) => (await db.admin<{ d: string }>('select (private.signup_today($1) + $2::int)::text as d', [lid, n]))[0].d;
let phoneN = 0;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/premios-${++phoneN}`,
  ]);
const pushes = (uid: string) =>
  db.admin<{ title: string; body: string; url: string; tag: string }>('select title, body, url, tag from public.push_outbox where user_id = $1 order by id', [uid]);

// ---------------------------------------------------------------------------------------------------------
// Boliche

interface Bowl {
  ev: string;
  tA: string;
  tB: string;
  tC: string;
}

/** Torneo del boliche (por defecto de ayer) en la liga privada: 3 juegos, 230/80 %, equipos de 2 (reglas null). */
async function bowlEvent(opts: { date?: string; percent?: number; ind?: string | null; team?: string | null; name?: string } = {}): Promise<Bowl> {
  const date = opts.date ?? (await day(w.priv, -1));
  const [{ id: ev }] = await db.admin<{ id: string }>(
    `insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent, individual_rank_by, team_rank_by, team_size)
     values ($1, 'torneo', $2, $3, 3, 230, $4, $5, $6, 2) returning id`,
    [w.priv, opts.name ?? 'Copa Aniversario', date, opts.percent ?? 80, opts.ind ?? null, opts.team ?? null],
  );
  const team = async (name: string, order: number) =>
    (await db.admin<{ id: string }>('insert into public.teams (league_id, event_id, name, sort_order) values ($1, $2, $3, $4) returning id', [w.priv, ev, name, order]))[0].id;
  return { ev, tA: await team('Los Strikers', 1), tB: await team('Los Spares', 2), tC: await team('Los Ceros', 3) };
}

/** Una participación (photos por defecto: todos los juegos con puntaje verificados). */
async function bowl(ev: string, pid: string, team: string | null, average: number, scores: (number | null)[], photos?: (string | null)[], override: number | null = null) {
  await db.admin(
    `insert into public.entries (league_id, event_id, player_id, team_id, average, handicap_override, scores, photos)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [w.priv, ev, pid, team, average, override, scores, photos ?? scores.map((s) => (s == null ? null : MARK))],
  );
}

/**
 * El torneo de siempre (230/80 %). Individual con handicap: org 762, luis 720, sofi 714, pedro 702, rafa 618.
 * Equipos por scratch: Los Spares (org 690 + sofi 570 = 1260; gina inscrita sin jugar) y Los Strikers (luis 600 +
 * pedro 510 = 1110). Los Ceros sin nadie.
 */
async function copa(opts: Parameters<typeof bowlEvent>[0] = {}) {
  const b = await bowlEvent(opts);
  await bowl(b.ev, P.luis, b.tA, 180, [200, 210, 190]);
  await bowl(b.ev, P.pedro, b.tA, 150, [180, 170, 160]);
  await bowl(b.ev, P.sofi, b.tB, 170, [190, 190, 190]);
  await bowl(b.ev, P.org, b.tB, 200, [230, 220, 240]);
  await bowl(b.ev, P.gina, b.tB, 160, [null, null, null]);
  await bowl(b.ev, P.rafa, null, 160, [150, 150, 150]);
  return b;
}

/** Copa con sus premios: Campeón (Única) al equipo y al individual, Subcampeón al 2.º individual. */
async function copaPrizes(opts: Parameters<typeof bowlEvent>[0] = {}) {
  const b = await copa(opts);
  const champ = await design(w.priv);
  const sub = await design(w.priv, SUB);
  const prize = (await setPrizes(w.u.org, w.priv, 'evento', b.ev, [
    { category: 'equipo', place: 1, badge_id: champ },
    { category: 'individual', place: 1, badge_id: champ },
    { category: 'individual', place: 2, badge_id: sub },
  ]))!;
  return {
    ...b,
    champ,
    sub,
    prize,
    team1: slotOf(prize, 'equipo', 1).id,
    ind1: slotOf(prize, 'individual', 1).id,
    ind2: slotOf(prize, 'individual', 2).id,
  };
}

/** Orden simple por una clave de texto (igual en los dos lados de la comparación). */
const byKey =
  <K extends string>(k: K) =>
  (a: Record<K, unknown>, b: Record<K, unknown>) =>
    String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0;

/** La clasificación del boliche como la arma el teléfono (bowlingStandings de src/lib/stats.ts). */
async function tsStandings(ev: string) {
  const [e] = await db.admin<Json>('select * from public.events where id = $1', [ev]);
  const teams = await db.admin<Json>('select id, name, sort_order from public.teams where event_id = $1', [ev]);
  const rows = await db.admin<Json>('select id, event_id, player_id, team_id, average, handicap_override, scores, photos from public.entries where event_id = $1', [ev]);
  const event = {
    id: e.id,
    type: e.type,
    name: e.name,
    date: '',
    games: e.games,
    hcpBase: e.hcp_base,
    hcpPercent: e.hcp_percent,
    teams: Object.fromEntries(teams.map((t) => [t.id, { name: t.name, order: t.sort_order }])),
    playerCount: 0,
    individualRankBy: e.individual_rank_by ?? undefined,
    teamRankBy: e.team_rank_by ?? undefined,
  } as unknown as BowlingEvent;
  const entries: Entry[] = rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    playerId: r.player_id,
    teamId: r.team_id,
    average: r.average,
    handicapOverride: r.handicap_override,
    scores: r.scores,
    photos: r.photos,
  }));
  const lines = entries.map((x) => entryLine(x, event)).filter((l) => l.games > 0);
  // La clasificación oficial del teléfono: la de la tarjeta de premios (bowlingStandings, solo juegos verificados).
  const st = bowlingStandings(event, entries);
  return {
    lines: lines
      .map((l) => ({ player_id: l.entry.playerId, games: l.games, scratch: l.scratch, total: l.total }))
      .sort(byKey('player_id')),
    individual: st.individual.map(({ row, pos }) => ({ ref: `p:${row.entry.playerId}`, pos })).sort(byKey('ref')),
    teams: st.teams.map(({ row, pos }) => ({ ref: `t:${row.teamId}`, pos })).sort(byKey('ref')),
  };
}

/** Lo mismo, del servidor. */
async function sqlStandings(ev: string) {
  const ranked = async (category: string) =>
    (await db.admin<{ ref: string; pos: number }>(`select unit ->> 'ref' as ref, pos from private.prize_bowling_rank($1, $2)`, [ev, category])).sort(byKey('ref'));
  return {
    lines: (await db.admin<{ player_id: string; games: number; scratch: number; total: number }>('select player_id, games, scratch, total from private.prize_bowling_lines($1)', [ev])).sort(byKey('player_id')),
    individual: await ranked('individual'),
    teams: await ranked('equipo'),
  };
}

describe('permisos y contrato', () => {
  it('las 4 RPC: solo con sesión, security definer y pasan por require_uid; las ayudas nadie de la app', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true })));
    const priv = await db.admin<{ fn: string; open: boolean }>(
      `select p.proname as fn, (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')) as open
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [PRIVATE_FNS],
    );
    expect(priv).toEqual(PRIVATE_FNS.map((fn) => ({ fn, open: false })));
    const b = await copa();
    await fails(db.rpc(ANON, 'set_tournament_prizes', { p_league: w.priv, p_scope: 'evento', p_ref: b.ev, p_period: null, p_slots: [] }), '42501');
    await fails(db.rpc(ANON, 'tournament_podium', { p_prize: b.ev }), '42501');
    await fails(db.as(w.u.org, 'select * from private.prize_bowling_lines($1)', [b.ev]), '42501');
    await fails(db.as(w.u.org, 'select * from private.prize_allowed($1, $2, $3)', [w.priv, 'evento', b.ev]), '42501');
  });

  it('las tablas tienen RLS y nadie escribe directo', async () => {
    const { prize, ind1 } = await copaPrizes();
    for (const who of [w.u.org, w.u.dios, w.u.luis]) {
      await fails(db.as(who, `update public.tournament_prizes set period = 'X' where id = $1`, [prize.id]), '42501');
      await fails(db.as(who, `delete from public.tournament_prize_slots where id = $1`, [ind1]), '42501');
      await fails(db.as(who, `insert into public.tournament_prizes (league_id, scope, event_id) values ($1, 'evento', $2)`, [w.priv, w.e.e1]), '42501');
    }
  });
});

describe('quién ve qué', () => {
  it('quien ve la liga ve los premios (sin cuenta en una pública); de fuera, nada de una privada', async () => {
    const { prize } = await copaPrizes();
    const pubBadge = await design(w.pub, {}, w.u.otro);
    const pubPrize = (await setPrizes(w.u.otro, w.pub, 'evento', w.e.e9, [{ category: 'individual', place: 1, badge_id: pubBadge }]))!;
    const seen = async (who: string) =>
      [
        ...(await db.as<{ id: string }>(who, 'select id from public.tournament_prizes')).map((r) => r.id),
        ...(await db.as<{ id: string }>(who, 'select prize_id as id from public.tournament_prize_slots')).map((r) => r.id),
      ].sort();
    expect(await seen(ANON)).toEqual([pubPrize.id, pubPrize.id]);
    expect(await seen(w.u.extra)).toEqual([pubPrize.id, pubPrize.id]);
    expect(await seen(w.u.luis)).toEqual(sorted([prize.id, prize.id, prize.id, prize.id, pubPrize.id, pubPrize.id]));
  });

  it('prize_slot_id se lee; borrar el evento se lleva la premiación (tombstones) y deja las insignias', async () => {
    const c = await copaPrizes();
    const d = await deliver(w.u.org, c.prize.id, proposal(await podium(w.u.org, c.prize.id)));
    expect(d.added).toBe(4);
    const mine = await db.asUser(w.u.luis, 'select prize_slot_id from public.league_badge_awards where player_id = $1', [P.luis]);
    expect(mine).toEqual([{ prize_slot_id: c.ind2 }]);
    await db.rpc(w.u.org, 'delete_event', { p_event: c.ev });
    expect(await db.count('public.tournament_prizes', 'id = $1', [c.prize.id])).toBe(0);
    expect(await db.count('public.tournament_prize_slots', 'prize_id = $1', [c.prize.id])).toBe(0);
    expect(await db.count('public.league_badge_awards', 'prize_slot_id = any ($1) and revoked_at is null', [[c.team1, c.ind1, c.ind2]])).toBe(4);
    expect(await db.count('public.tombstones', `tbl = 'tournament_prizes' and row_key = $1`, [c.prize.id])).toBe(1);
    expect(await db.count('public.tombstones', `tbl = 'tournament_prize_slots' and row_key = any ($1)`, [[c.team1, c.ind1, c.ind2]])).toBe(3);
  });
});

describe('guardar (set_tournament_prizes)', () => {
  it('guarda el conjunto completo: cinta por defecto, títulos de la regla, idempotente y reemplaza', async () => {
    const b = await copa({ date: '2026-10-03' });
    const champ = await design(w.priv);
    const sub = await design(w.priv, SUB);
    const p = (await setPrizes(w.u.org, w.priv, 'evento', b.ev, [
      { category: 'individual', place: 1, badge_id: champ },
      { category: 'equipo', division: '', place: 1, badge_id: champ },
    ], null))!;
    expect(p).toMatchObject({ leagueId: w.priv, scope: 'evento', refId: b.ev, period: 'OCT 2026', closedAt: null });
    expect(p.slots.map((s) => [s.category, s.place, s.title, s.label, s.badgeId, s.verified, s.deliveredAt])).toEqual([
      ['equipo', 1, 'Equipos (scratch)', '', champ, false, null],
      ['individual', 1, 'Individual (handicap)', '', champ, false, null],
    ]);
    // Otra vez lo mismo: la misma premiación, los mismos lugares.
    const again = (await setPrizes(w.u.org, w.priv, 'evento', b.ev, [
      { category: 'equipo', place: 1, badge_id: champ },
      { category: 'individual', place: 1, badge_id: champ },
    ], null))!;
    expect(again.id).toBe(p.id);
    expect(again.slots.map((s) => s.id)).toEqual(p.slots.map((s) => s.id));
    // Reemplaza: el equipo se va, el 2.º individual llega, la cinta cambia.
    const next = (await setPrizes(w.u.sofi, w.priv, 'evento', b.ev, [
      { category: 'individual', place: 1, badge_id: champ },
      { category: 'individual', place: 2, badge_id: sub, label: 'Mixto' },
    ], 'ANIV 2026'))!;
    expect(next.period).toBe('ANIV 2026');
    expect(next.slots.map((s) => [s.category, s.place, s.badgeId, s.label])).toEqual([
      ['individual', 1, champ, ''],
      ['individual', 2, sub, 'Mixto'],
    ]);
    expect(next.slots[0].id).toBe(p.slots[1].id);
    expect(await db.count('public.tournament_prizes', 'event_id = $1', [b.ev])).toBe(1);
    // [] sin nada entregado: la premiación se borra.
    expect(await setPrizes(w.u.org, w.priv, 'evento', b.ev, [])).toBeNull();
    expect(await db.count('public.tournament_prizes', 'event_id = $1', [b.ev])).toBe(0);
  });

  it('permisos: la política del creador («Solo yo» deja fuera a un admin; «elegidos», un miembro marcado)', async () => {
    const b = await copa();
    const champ = await design(w.priv);
    const slots = [{ category: 'individual', place: 1, badge_id: champ }];
    await fails(setPrizes(w.u.luis, w.priv, 'evento', b.ev, slots), DENIED);
    await db.rpc(w.u.org, 'set_badge_policy', { p_league: w.priv, p_policy: 'owner' });
    await fails(setPrizes(w.u.sofi, w.priv, 'evento', b.ev, slots), DENIED);
    const p = (await setPrizes(w.u.org, w.priv, 'evento', b.ev, slots))!;
    // Entregar no es elegir: sofi (admin) igual puede ver el podio y entregar.
    expect((await podium(w.u.sofi, p.id)).slots[0].status).toBe('listo');
    await db.rpc(w.u.org, 'set_badge_policy', { p_league: w.priv, p_policy: 'chosen' });
    await db.rpc(w.u.org, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.luis, p_on: true });
    await setPrizes(w.u.luis, w.priv, 'evento', b.ev, slots);
    await fails(podium(w.u.ana, p.id), DENIED);
    await fails(db.rpc(w.u.ana, 'close_tournament_prizes', { p_prize: p.id }), DENIED);
  });

  it('valida: competencia, diseño, categorías, lugares, textos y topes', async () => {
    const b = await copa();
    const champ = await design(w.priv);
    const one = (x: Json = {}) => [{ category: 'individual', place: 1, badge_id: champ, ...x }];
    const otherLeague = await design(w.pub, {}, w.u.otro);
    const archived = await design(w.priv, { name: 'Vieja', status: 'archivada' });
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ badge_id: otherLeague })), 'no_existe');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ badge_id: archived })), 'no_activa');
    await fails(setPrizes(w.u.org, w.priv, 'evento', w.e.e9, one()), 'no_existe');
    await fails(setPrizes(w.u.org, '00000000-0000-0000-0000-000000000000', 'evento', b.ev, one()), 'no_existe');
    // Una práctica no tiene premios; una categoría que no corresponde tampoco.
    await fails(setPrizes(w.u.org, w.priv, 'evento', w.e.e1, one()), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'otro', b.ev, one()), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ category: 'pareja' })), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ division: 'A' })), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ place: 4 })), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ place: '1' })), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ badgeId: champ })), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, [...one(), ...one()]), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, Array.from({ length: 25 }, () => one()[0])), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ label: 'Categoría muy larga' })), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one(), 'Diciembre 2026'), 'invalido');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one(), 'PUTA 2026'), 'texto_bloqueado');
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one({ label: 'mierda' })), 'texto_bloqueado');
    // Sin equipos ni jugadores por equipo, el boliche no premia equipos.
    const [{ id: solo }] = await db.admin<{ id: string }>(
      `insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent) values ($1, 'torneo', 'Solo', '2026-10-10', 3, 230, 80) returning id`,
      [w.priv],
    );
    await fails(setPrizes(w.u.org, w.priv, 'evento', solo, one({ category: 'equipo' })), 'invalido');
    await setPrizes(w.u.org, w.priv, 'evento', solo, one());
    // 30 guardados o entregas por hora por cuenta.
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ($1, now(), 30)
                    on conflict (key) do update set window_start = now(), hits = 30`, [`premios:u:${w.u.org}`]);
    await fails(setPrizes(w.u.org, w.priv, 'evento', b.ev, one()), 'rate_limited');
    await setPrizes(w.u.sofi, w.priv, 'evento', b.ev, one());
  });

  it('un lugar entregado no cambia ni se borra, ni la cinta; después de quitarlo, sí', async () => {
    const c = await copaPrizes();
    await deliver(w.u.org, c.prize.id, proposal(await podium(w.u.org, c.prize.id), [c.ind1]));
    const all = [
      { category: 'equipo', place: 1, badge_id: c.champ },
      { category: 'individual', place: 1, badge_id: c.champ },
      { category: 'individual', place: 2, badge_id: c.sub },
    ];
    await fails(setPrizes(w.u.org, w.priv, 'evento', c.ev, [all[0], all[2]]), 'ya_entregado');
    await fails(setPrizes(w.u.org, w.priv, 'evento', c.ev, [all[0], { ...all[1], badge_id: c.sub }, all[2]]), 'ya_entregado');
    await fails(setPrizes(w.u.org, w.priv, 'evento', c.ev, [all[0], { ...all[1], label: 'Otra' }, all[2]]), 'ya_entregado');
    await fails(setPrizes(w.u.org, w.priv, 'evento', c.ev, all, 'NOV 2026'), 'ya_entregado');
    await fails(setPrizes(w.u.org, w.priv, 'evento', c.ev, []), 'ya_entregado');
    // Los que no se entregaron sí cambian; la misma cinta y el mismo lugar pasan.
    await setPrizes(w.u.org, w.priv, 'evento', c.ev, [all[1], { ...all[2], badge_id: c.champ }], 'OCT 2026');
    // Se quita (units []) y ya se puede cambiar.
    const d = await deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [] }]);
    expect(d).toMatchObject({ added: 0, revoked: 1 });
    const p = (await setPrizes(w.u.org, w.priv, 'evento', c.ev, [{ ...all[1], badge_id: c.sub }], 'NOV 2026'))!;
    expect(p.slots.map((s) => [s.place, s.badgeId])).toEqual([[1, c.sub]]);
    expect(p.period).toBe('NOV 2026');
  });
});

describe('boliche: el podio del servidor', () => {
  /** Borradores, juegos sin foto, override (también negativo), promedio 0 o con decimales, empates y equipos sin juegos. */
  async function parityEvent() {
    const b = await bowlEvent();
    const extra = async (n: string) => player(db, w.priv, n);
    const [x1, x2, x3] = [await extra('Xavi'), await extra('Yeni'), await extra('Zoe')];
    await bowl(b.ev, P.luis, b.tA, 180, [200, 210, 190]);
    await bowl(b.ev, P.pedro, b.tA, 150, [180, 170, 160], ['foto', null, null]);
    await bowl(b.ev, P.org, b.tB, 0, [240, 240, 240]);
    await bowl(b.ev, P.sofi, b.tB, 170, [150, 150, 150], undefined, 10);
    await bowl(b.ev, P.gina, null, 160.5, [200, 200, 200]);
    await bowl(b.ev, P.rafa, b.tC, 190, [null, null, null]);
    await bowl(b.ev, P.tono, null, 200, [240, 250]);
    await bowl(b.ev, x1, null, 210, [200, 200, 200], undefined, -5);
    await bowl(b.ev, x2, null, 180, [180, 160, 140], [MARK, MARK, MARK]);
    await bowl(b.ev, x3, b.tA, 175, [199, null, 201], [null, null, MARK]);
    return b;
  }

  it('paridad con src/lib/stats.ts (entryLine y bowlingStandings) con reglas null, al revés y 0 %', async () => {
    const b = await parityEvent();
    for (const [ind, team, percent] of [
      [null, null, 80],
      ['scratch', 'hcp', 80],
      ['hcp', 'hcp', 80],
      [null, null, 0],
      ['hcp', 'hcp', 0],
    ] as const) {
      await db.admin('update public.events set individual_rank_by = $2, team_rank_by = $3, hcp_percent = $4 where id = $1', [b.ev, ind, team, percent]);
      const ts = await tsStandings(b.ev);
      const sql = await sqlStandings(b.ev);
      expect(sql, `${ind}/${team}/${percent}`).toEqual(ts);
    }
    // Y hay de todo: empates y un equipo sin juegos que no sale.
    await db.admin('update public.events set individual_rank_by = null, team_rank_by = null, hcp_percent = 80 where id = $1', [b.ev]);
    const s = await sqlStandings(b.ev);
    expect(s.teams.map((t) => t.ref).sort()).toEqual(sorted([`t:${b.tA}`, `t:${b.tB}`]));
    expect(new Set(s.individual.map((x) => x.pos)).size).toBeLessThan(s.individual.length);
  });

  it('con reglas null: equipos por scratch e individual con handicap; al revés, al revés; con 0 %, scratch', async () => {
    const c = await copaPrizes();
    let p = await podium(w.u.sofi, c.prize.id);
    expect(p).toMatchObject({ prizeId: c.prize.id, kind: 'bowling', verified: true });
    expect(refs(st(p, c.team1))).toEqual([`t:${c.tB}`]);
    expect(ids(st(p, c.team1), `t:${c.tB}`)).toEqual(sorted([P.org, P.sofi]));
    expect(st(p, c.team1).units[0]).toMatchObject({ name: 'Los Spares', teamId: c.tB });
    expect(refs(st(p, c.ind1))).toEqual([`p:${P.org}`]);
    expect(refs(st(p, c.ind2))).toEqual([`p:${P.luis}`]);
    expect(p.slots.map((s) => [s.status, s.finished, s.verified])).toEqual([
      ['listo', true, true],
      ['listo', true, true],
      ['listo', true, true],
    ]);
    // Pedro con 600 de scratch: con handicap (792) gana el individual; por scratch empata con luis en el 2.º (org 690).
    // Y con handicap Los Strikers (720 + 792) le ganan a Los Spares (1476); por scratch no (1200 contra 1260).
    await db.admin(`update public.entries set scores = '{200,200,200}' where event_id = $1 and player_id = $2`, [c.ev, P.pedro]);
    p = await podium(w.u.sofi, c.prize.id);
    expect([refs(st(p, c.team1)), refs(st(p, c.ind1)), refs(st(p, c.ind2))]).toEqual([[`t:${c.tB}`], [`p:${P.pedro}`], [`p:${P.org}`]]);
    // Al revés: individual por scratch y equipos con handicap.
    await db.admin(`update public.events set individual_rank_by = 'scratch', team_rank_by = 'hcp' where id = $1`, [c.ev]);
    p = await podium(w.u.sofi, c.prize.id);
    expect([refs(st(p, c.team1)), refs(st(p, c.ind1)), refs(st(p, c.ind2))]).toEqual([
      [`t:${c.tA}`],
      [`p:${P.org}`],
      sorted([`p:${P.luis}`, `p:${P.pedro}`]),
    ]);
    const title = async () => (await db.admin<{ j: Prize }>('select private.prize_json($1) as j', [c.prize.id]))[0].j.slots.map((s) => s.title);
    expect(await title()).toEqual(['Equipos (handicap)', 'Individual (scratch)', 'Individual (scratch)']);
    // Con 0 %: todo por scratch aunque la regla diga handicap.
    await db.admin(`update public.events set individual_rank_by = 'hcp', team_rank_by = 'hcp', hcp_percent = 0 where id = $1`, [c.ev]);
    expect(await title()).toEqual(['Equipos (scratch)', 'Individual (scratch)', 'Individual (scratch)']);
    p = await podium(w.u.sofi, c.prize.id);
    expect([refs(st(p, c.team1)), refs(st(p, c.ind1)), refs(st(p, c.ind2))]).toEqual([
      [`t:${c.tB}`],
      [`p:${P.org}`],
      sorted([`p:${P.luis}`, `p:${P.pedro}`]),
    ]);
  });

  it('empate en el 1.º: dos unidades y el 2.º vacío; cuatro empatados: empate_multiple (no se entrega sola)', async () => {
    const b = await bowlEvent({ percent: 0 });
    await bowl(b.ev, P.luis, null, 0, [200, 200, 200]);
    await bowl(b.ev, P.pedro, null, 0, [210, 190, 200]);
    await bowl(b.ev, P.gina, null, 0, [100, 100, 100]);
    const champ = await design(w.priv);
    const p1 = (await setPrizes(w.u.org, w.priv, 'evento', b.ev, [1, 2, 3].map((place) => ({ category: 'individual', place, badge_id: champ }))))!;
    let p = await podium(w.u.org, p1.id);
    expect(p.slots.map((s) => [s.status, refs(s)])).toEqual([
      ['listo', sorted([`p:${P.luis}`, `p:${P.pedro}`])],
      ['vacio', []],
      ['listo', [`p:${P.gina}`]],
    ]);
    // Empate: se la llevan los dos.
    expect(await deliver(w.u.org, p1.id, proposal(p))).toMatchObject({ added: 3 });
    expect(sorted(await holders(p1.slots[0].id))).toEqual(sorted([P.luis, P.pedro]));
    // Cuatro empatados en el 1.º.
    const b2 = await bowlEvent({ percent: 0, name: 'Copa 2' });
    for (const pid of [P.luis, P.pedro, P.gina, P.rafa]) await bowl(b2.ev, pid, null, 0, [200, 200, 200]);
    const p2 = (await setPrizes(w.u.org, w.priv, 'evento', b2.ev, [{ category: 'individual', place: 1, badge_id: champ }]))!;
    p = await podium(w.u.org, p2.id);
    expect(p.slots[0]).toMatchObject({ status: 'empate_multiple' });
    expect(p.slots[0].units).toHaveLength(4);
    await fails(deliver(w.u.org, p2.id, proposal(p)), 'invalido');
    await fails(deliver(w.u.org, p2.id, [{ slot_id: p2.slots[0].id, units: proposal(p)[0].units.slice(0, 3) }]), 'podio_cambio');
  });

  it('un torneo de mañana (o sin juegos verificados): sin_resultado', async () => {
    const c = await copaPrizes({ date: await day(w.priv, 1) });
    const p = await podium(w.u.org, c.prize.id);
    expect(p.slots.map((s) => [s.status, s.finished, s.units.length])).toEqual([
      ['sin_resultado', false, 0],
      ['sin_resultado', false, 0],
      ['sin_resultado', false, 0],
    ]);
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [{ ref: `p:${P.org}`, players: [P.org] }] }]), 'sin_resultado');
    // Hoy sí (desde el día del torneo), pero con solo borradores no.
    await db.admin('update public.events set date = private.signup_today(league_id) where id = $1', [c.ev]);
    await db.admin(`update public.entries set photos = '{null,null,null}' where event_id = $1`, [c.ev]);
    expect((await podium(w.u.org, c.prize.id)).slots.map((s) => s.status)).toEqual(['sin_resultado', 'sin_resultado', 'sin_resultado']);
    await db.admin(`update public.entries set photos = '{sin-foto,null,null}' where event_id = $1 and player_id = $2`, [c.ev, P.rafa]);
    expect((await podium(w.u.org, c.prize.id)).slots.map((s) => s.status)).toEqual(['sin_resultado', 'listo', 'vacio']);
  });
});

describe('entregar (boliche)', () => {
  it('da la insignia a cada uno (equipo con su team_id, cinta, división y nota), avisa y el admin que ganó se la entrega', async () => {
    const c = await copaPrizes();
    for (const uid of [w.u.org, w.u.sofi, w.u.luis]) await phone(uid);
    // sofi (admin) está en el podio de equipos: con el orden verificado puede entregarlo.
    const d = await deliver(w.u.sofi, c.prize.id, proposal(await podium(w.u.sofi, c.prize.id)));
    expect(d).toMatchObject({ added: 4, revoked: 0, unchanged: 0, notified: 4 });
    const rows = await awards('prize_slot_id is not null');
    const view = rows.map((a) => [a.player_id, a.badge_id, a.team_id, a.period, a.division, a.note, a.awarded_by, a.prize_slot_id]);
    expect(view).toEqual(
      expect.arrayContaining([
        [P.org, c.champ, c.tB, 'OCT 2026', '', '1.er lugar · Equipos (scratch) · Copa Aniversario', w.u.sofi, c.team1],
        [P.sofi, c.champ, c.tB, 'OCT 2026', '', '1.er lugar · Equipos (scratch) · Copa Aniversario', w.u.sofi, c.team1],
        [P.org, c.champ, null, 'OCT 2026', '', '1.er lugar · Individual (handicap) · Copa Aniversario', w.u.sofi, c.ind1],
        [P.luis, c.sub, null, 'OCT 2026', '', '2.º lugar · Individual (handicap) · Copa Aniversario', w.u.sofi, c.ind2],
      ]),
    );
    expect(rows).toHaveLength(4);
    // Gina estaba inscrita en Los Spares pero no jugó: no recibe.
    expect(await db.count('public.league_badge_awards', 'player_id = $1', [P.gina])).toBe(0);
    expect(await pushes(w.u.luis)).toEqual([
      {
        title: '¡Tienes una insignia nueva!',
        body: 'Liga del Banco: te llevas “Subcampeón” por el 2.º lugar en Copa Aniversario. Tócala para verla.',
        url: `/u/${w.u.luis}?tab=insignias`,
        tag: `insignia:${rows.find((a) => a.player_id === P.luis)!.id}`,
      },
    ]);
    expect((await pushes(w.u.org)).map((x) => x.body)).toEqual([
      'Liga del Banco: te llevas “Campeón” por el 1.er lugar en Copa Aniversario. Tócala para verla.',
      'Liga del Banco: te llevas “Campeón” por el 1.er lugar en Copa Aniversario. Tócala para verla.',
    ]);
    // La foto de los ganadores, la primera entrega y el orden verificado.
    const s = slotOf(d.prize, 'equipo', 1);
    expect(s).toMatchObject({ verified: true, deliveredBy: w.u.sofi });
    expect(s.deliveredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.editableUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.winners).toEqual([{ ref: `t:${c.tB}`, name: 'Los Spares', teamId: c.tB, players: expect.arrayContaining([P.org, P.sofi]) }]);
    // El jugador la ve en su perfil (el mismo camino que el creador) y en sus avisos.
    const prof = await db.rpc<{ leagueAwards: Json[] }>(w.u.luis, 'profile_badges', { p_user: w.u.luis });
    expect(prof.leagueAwards.map((a) => [a.badgeId, a.note])).toEqual([[c.sub, '2.º lugar · Individual (handicap) · Copa Aniversario']]);
    const notices = await db.rpc<{ leagueAwards: Json[] }>(w.u.org, 'badge_notices', {});
    expect(notices.leagueAwards).toHaveLength(2);
    expect(notices.leagueAwards.map((a) => a.teamName).sort()).toEqual(['Los Spares', null].sort());
  });

  it('otra vez lo mismo no cambia nada; desmarcar quita; agregar a alguien de fuera o cambiar el ref: podio_cambio', async () => {
    const c = await copaPrizes();
    await phone(w.u.luis);
    const want = proposal(await podium(w.u.org, c.prize.id));
    await deliver(w.u.org, c.prize.id, want);
    const before = await db.count('public.push_outbox');
    expect(await deliver(w.u.org, c.prize.id, want)).toMatchObject({ added: 0, revoked: 0, unchanged: 4, notified: 0 });
    expect(await db.count('public.league_badge_awards', 'prize_slot_id is not null')).toBe(4);
    expect(await db.count('public.push_outbox')).toBe(before);
    // Desmarcar a sofi del equipo.
    const d = await deliver(w.u.org, c.prize.id, [{ slot_id: c.team1, units: [{ ref: `t:${c.tB}`, players: [P.org] }] }]);
    expect(d).toMatchObject({ added: 0, revoked: 1, unchanged: 1 });
    expect(await holders(c.team1)).toEqual([P.org]);
    // Y se vuelve a marcar.
    expect(await deliver(w.u.org, c.prize.id, want.filter((x) => x.slot_id === c.team1))).toMatchObject({ added: 1, unchanged: 1 });
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.team1, units: [{ ref: `t:${c.tB}`, players: [P.org, P.sofi, P.luis] }] }]), 'podio_cambio');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.team1, units: [{ ref: `t:${c.tA}`, players: [P.luis] }] }]), 'podio_cambio');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [{ ref: `p:${P.luis}`, players: [P.luis] }] }]), 'podio_cambio');
    await fails(
      deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [{ ref: `p:${P.org}`, players: [P.org] }, { ref: `p:${P.luis}`, players: [P.luis] }] }]),
      'podio_cambio',
    );
    // Forma: lugar de otra premiación, repetido, jugador repetido, de otra liga, claves raras, más de 3 unidades.
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: w.priv, units: [] }]), 'no_existe');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [] }, { slot_id: c.ind1, units: [] }]), 'invalido');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.team1, units: [{ ref: `t:${c.tB}`, players: [P.org, P.org] }] }]), 'invalido');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [{ ref: `p:${w.p.p1}`, players: [w.p.p1] }] }]), 'invalido');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [], extra: 1 } as unknown as Want]), 'invalido');
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind1, units: [{ ref: `p:${P.org}`, players: [{ id: P.org }] }] } as unknown as Want]), 'invalido');
    await fails(deliver(w.u.luis, c.prize.id, want), DENIED);
  });

  it('corregir un juego y entregar otra vez: retira con «Corrección del podio», quita el push pendiente y da al nuevo', async () => {
    const c = await copaPrizes();
    for (const uid of [w.u.sofi, w.u.luis]) await phone(uid);
    const old = proposal(await podium(w.u.org, c.prize.id));
    await deliver(w.u.org, c.prize.id, old);
    const luisAward = (await awards('player_id = $1', [P.luis]))[0];
    expect(await pushes(w.u.luis)).toHaveLength(1);
    // Luis tenía 100 en el 3.er juego (no 190): baja a 630 y sofi (714) queda 2.ª.
    await db.admin(`update public.entries set scores = '{200,210,100}' where event_id = $1 and player_id = $2`, [c.ev, P.luis]);
    await fails(deliver(w.u.org, c.prize.id, old), 'podio_cambio');
    const now = await podium(w.u.org, c.prize.id);
    expect(refs(st(now, c.ind2))).toEqual([`p:${P.sofi}`]);
    // La pantalla del admin ve a luis como quien lo tiene hoy.
    expect(st(now, c.ind2).holders.map((h) => h.playerId)).toEqual([P.luis]);
    const d = await deliver(w.u.org, c.prize.id, proposal(now, [c.ind2]));
    expect(d).toMatchObject({ added: 1, revoked: 1, unchanged: 0, notified: 1 });
    expect((await awards('id = $1', [luisAward.id]))[0]).toMatchObject({ revoked: true, revoke_reason: 'Corrección del podio' });
    expect(await pushes(w.u.luis)).toEqual([]);
    expect(await holders(c.ind2)).toEqual([P.sofi]);
    expect(slotOf(d.prize, 'individual', 2).winners).toEqual([{ ref: `p:${P.sofi}`, name: 'Sofi', teamId: null, players: [P.sofi] }]);
    // Quitar un premio que el dueño retiró a mano: la vista previa lo muestra aparte (desmarcado).
    const sofiAward = (await awards('prize_slot_id = $1 and revoked_at is null', [c.ind2]))[0];
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: sofiAward.id, p_reason: 'No jugó limpio' });
    const after = await podium(w.u.org, c.prize.id);
    expect(st(after, c.ind2)).toMatchObject({ holders: [], withdrawn: [P.sofi] });
    // Y entregar lo mismo sin ella no se lo devuelve.
    expect(await deliver(w.u.org, c.prize.id, [{ slot_id: c.ind2, units: [] }])).toMatchObject({ added: 0, revoked: 0 });
  });

  it('14 días después (o cerrada), solo el dueño corrige; sin cambios no hay error', async () => {
    const c = await copaPrizes();
    const want = proposal(await podium(w.u.org, c.prize.id));
    await deliver(w.u.sofi, c.prize.id, want);
    await db.admin(`update public.tournament_prize_slots set delivered_at = now() - interval '15 days' where id = $1`, [c.team1]);
    const drop = [{ slot_id: c.team1, units: [{ ref: `t:${c.tB}`, players: [P.org] }] }];
    await fails(deliver(w.u.sofi, c.prize.id, drop), 'cerrado');
    expect(await deliver(w.u.sofi, c.prize.id, want)).toMatchObject({ added: 0, revoked: 0 });
    // Los demás lugares (entregados hoy) sí.
    expect(await deliver(w.u.sofi, c.prize.id, [{ slot_id: c.ind2, units: [] }])).toMatchObject({ revoked: 1 });
    expect(await deliver(w.u.org, c.prize.id, drop)).toMatchObject({ revoked: 1 });
    // Cerrar: ahí todo queda para el dueño (y cerrar otra vez no hace nada).
    await db.rpc(w.u.sofi, 'close_tournament_prizes', { p_prize: c.prize.id });
    const [{ closed_at: at }] = await db.admin<{ closed_at: string }>('select closed_at::text from public.tournament_prizes where id = $1', [c.prize.id]);
    await db.rpc(w.u.org, 'close_tournament_prizes', { p_prize: c.prize.id });
    expect(await db.admin('select closed_at::text, closed_by from public.tournament_prizes where id = $1', [c.prize.id])).toEqual([
      { closed_at: at, closed_by: w.u.sofi },
    ]);
    await fails(deliver(w.u.sofi, c.prize.id, want.filter((x) => x.slot_id === c.ind2)), 'cerrado');
    expect(await deliver(w.u.org, c.prize.id, want.filter((x) => x.slot_id === c.ind2))).toMatchObject({ added: 1 });
    await fails(db.rpc(w.u.luis, 'close_tournament_prizes', { p_prize: c.prize.id }), DENIED);
    await fails(db.rpc(w.u.org, 'close_tournament_prizes', { p_prize: w.priv }), 'no_existe');
  });

  it('si la competencia deja de admitir premios (el torneo pasó a práctica), no se da nada pero se puede quitar', async () => {
    const c = await copaPrizes();
    await deliver(w.u.org, c.prize.id, proposal(await podium(w.u.org, c.prize.id)));
    await db.admin(`update public.events set type = 'practica' where id = $1`, [c.ev]);
    const p = await podium(w.u.org, c.prize.id);
    expect(p).toMatchObject({ kind: null, verified: false });
    expect(p.slots.map((s) => s.status)).toEqual(['sin_resultado', 'sin_resultado', 'sin_resultado']);
    await fails(deliver(w.u.org, c.prize.id, [{ slot_id: c.ind2, units: [{ ref: `p:${P.luis}`, players: [P.luis] }] }]), 'sin_resultado');
    expect(await deliver(w.u.org, c.prize.id, [{ slot_id: c.ind2, units: [] }])).toMatchObject({ revoked: 1 });
  });

  it('sin push con p_notify false ni en una liga con menores; un diseño archivado no se da (sí se quita)', async () => {
    const c = await copaPrizes();
    for (const uid of [w.u.org, w.u.sofi, w.u.luis]) await phone(uid);
    const want = proposal(await podium(w.u.org, c.prize.id));
    expect(await deliver(w.u.sofi, c.prize.id, want.filter((x) => x.slot_id === c.ind2), false)).toMatchObject({ added: 1, notified: 0 });
    await db.admin('update public.leagues set require_photo = false, has_minors = true where id = $1', [w.priv]);
    expect(await deliver(w.u.sofi, c.prize.id, want.filter((x) => x.slot_id === c.ind1))).toMatchObject({ added: 1, notified: 0 });
    expect(await db.count('public.push_outbox', `tag like 'insignia:%'`)).toBe(0);
    await db.rpc(w.u.org, 'archive_league_badge', { p_id: c.champ, p_archived: true });
    await fails(deliver(w.u.sofi, c.prize.id, want.filter((x) => x.slot_id === c.team1)), 'no_activa');
    expect(await deliver(w.u.sofi, c.prize.id, [{ slot_id: c.ind1, units: [] }])).toMatchObject({ revoked: 1 });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Raqueta: torneo por categorías y noches

interface Club {
  lid: string;
  p: string[];
  /** Parejas de temporada (t[i] con p[2i] y p[2i+1]). */
  t: string[];
}

/** Liga de pádel (dobles): dueño org, admin sofi; 8 jugadores (luis y sofi con cuenta) en 4 parejas; 2 sueltos. */
async function padelClub(): Promise<Club> {
  const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'private', sport: 'padel', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  const p = [await player(db, lid, 'Luis', w.u.luis), await player(db, lid, 'Sofi', w.u.sofi)];
  for (const n of ['Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabo', 'Hugo']) p.push(await player(db, lid, n));
  const t: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [{ id }] = await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [lid, `Pareja ${i + 1}`]);
    await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $4), ($1, $3, $4)', [id, p[2 * i], p[2 * i + 1], lid]);
    t.push(id);
  }
  return { lid, p, t };
}

interface Side {
  team?: string | null;
  label: string;
  players?: string[];
}

/** Un partido ya jugado (por defecto confirmado y lo ganó el lado 1). */
async function match(
  lid: string,
  sides: [Side, Side],
  opts: { event?: string | null; key?: string | null; status?: string; winner?: number | null; walkover?: number | null; proposedAgo?: string | null; series?: string | null } = {},
): Promise<string> {
  const [{ id }] = await db.admin<{ id: string }>(
    `insert into public.matches (league_id, event_id, bracket_key, status, winner_side, walkover_side, proposed_at, series_id)
     values ($1, $2, $3, $4, $5, $6, now() - $7::interval, $8) returning id`,
    [
      lid,
      opts.event ?? null,
      opts.key ?? null,
      opts.status ?? 'confirmed',
      opts.winner === undefined ? 1 : opts.winner,
      opts.walkover ?? null,
      opts.proposedAgo ?? '1 hour',
      opts.series ?? null,
    ],
  );
  for (const [i, s] of sides.entries()) {
    await db.admin('insert into public.match_sides (match_id, side, league_id, team_id, label) values ($1, $2, $3, $4, $5)', [id, i + 1, lid, s.team ?? null, s.label]);
    for (const pid of s.players ?? []) {
      await db.admin('insert into public.match_players (match_id, player_id, league_id, side) values ($1, $2, $3, $4)', [id, pid, lid, i + 1]);
    }
  }
  return id;
}

const pair = (c: Club, i: number): Side => ({ team: c.t[i], label: `Pareja ${i + 1}`, players: [c.p[2 * i], c.p[2 * i + 1]] });

/** Torneo por categorías: A con las 4 parejas (sin 3.er lugar), B con dos lados sueltos. */
async function tourney(c: Club, opts: { thirdPlace?: boolean } = {}) {
  const config = {
    v: 1,
    format: 'torneo',
    categories: [
      { id: 'A', name: 'Categoría A', pairs: c.t, seeds: c.t, groups: 0, perGroup: 2, thirdPlace: opts.thirdPlace ?? false },
      { id: 'B', name: 'Categoría B', pairs: [], seeds: ['x', 'y'], groups: 0, perGroup: 2, thirdPlace: false },
    ],
    courts: [],
    points: 'standard',
  };
  const [{ id: ev }] = await db.admin<{ id: string }>(
    `insert into public.events (league_id, type, name, date, config) values ($1, 'torneo', 'Open de Pádel', $2, $3) returning id`,
    [c.lid, await day(c.lid, -1), config],
  );
  // Semifinales (1 le gana a 4, 2 le gana a 3), final (1 le gana a 2) y la final de la B entre dos lados sin pareja.
  const semi1 = await match(c.lid, [pair(c, 0), pair(c, 3)], { event: ev, key: 'A-R1-1' });
  const semi2 = await match(c.lid, [pair(c, 1), pair(c, 2)], { event: ev, key: 'A-R1-2' });
  const final = await match(c.lid, [pair(c, 0), pair(c, 1)], { event: ev, key: 'A-R2-1' });
  const finalB = await match(
    c.lid,
    [
      { label: 'Eva / Fede', players: [c.p[6], c.p[7]] },
      { label: 'Gabo / Hugo', players: [c.p[8], c.p[9]] },
    ],
    { event: ev, key: 'B-R1-1', winner: 2 },
  );
  const badge = await design(c.lid);
  const prize = (await setPrizes(w.u.org, c.lid, 'evento', ev, [
    ...[1, 2, 3].map((place) => ({ category: 'pareja', division: 'A', place, badge_id: badge })),
    { category: 'pareja', division: 'B', place: 1, badge_id: badge },
    { category: 'pareja', division: 'B', place: 3, badge_id: badge },
  ]))!;
  return { ev, semi1, semi2, final, finalB, badge, prize };
}

describe('raqueta: torneo por categorías', () => {
  it('final normal: campeón, subcampeón y los dos semifinalistas (sin partido por el 3.º); lado sin pareja', async () => {
    const c = await padelClub();
    const t = await tourney(c);
    expect(t.prize.slots.map((s) => [s.division, s.place, s.title, s.label])).toEqual([
      ['A', 1, 'Parejas · Categoría A', 'Categoría A'],
      ['A', 2, 'Parejas · Categoría A', 'Categoría A'],
      ['A', 3, 'Parejas · Categoría A', 'Categoría A'],
      ['B', 1, 'Parejas · Categoría B', 'Categoría B'],
      ['B', 3, 'Parejas · Categoría B', 'Categoría B'],
    ]);
    const p = await podium(w.u.sofi, t.prize.id);
    expect(p.kind).toBe('racket_tourney');
    const [a1, a2, a3, b1, b3] = t.prize.slots.map((s) => st(p, s.id));
    expect([a1.status, refs(a1)]).toEqual(['listo', [`t:${c.t[0]}`]]);
    expect(ids(a1, `t:${c.t[0]}`)).toEqual(sorted([c.p[0], c.p[1]]));
    expect([a2.status, refs(a2)]).toEqual(['listo', [`t:${c.t[1]}`]]);
    expect([a3.status, refs(a3)]).toEqual(['listo', sorted([`t:${c.t[2]}`, `t:${c.t[3]}`])]);
    expect([b1.status, refs(b1)]).toEqual(['listo', [`s:${t.finalB}:2`]]);
    expect(b1.units[0]).toMatchObject({ name: 'Gabo / Hugo', teamId: null });
    expect([b3.status, refs(b3)]).toEqual(['vacio', []]);
    // Sofi (admin) está en la pareja campeona: se la entrega igual (orden verificado).
    const d = await deliver(w.u.sofi, t.prize.id, proposal(p));
    expect(d).toMatchObject({ added: 10 });
    expect((await awards('prize_slot_id = $1', [a1.slotId])).map((a) => [a.team_id, a.division])).toEqual([
      [c.t[0], 'Categoría A'],
      [c.t[0], 'Categoría A'],
    ]);
    expect((await awards('prize_slot_id = $1', [b1.slotId])).map((a) => a.team_id)).toEqual([null, null]);
  });

  it('final por W.O. (el 2.º vacío), partido por el 3.º (jugado, por W.O. o pendiente) y final solo propuesta', async () => {
    const c = await padelClub();
    const t = await tourney(c);
    const [a1, a2, a3] = t.prize.slots.map((s) => s.id);
    await db.admin(`update public.matches set status = 'walkover', walkover_side = 2 where id = $1`, [t.final]);
    let p = await podium(w.u.org, t.prize.id);
    expect([st(p, a1).status, refs(st(p, a1))]).toEqual(['listo', [`t:${c.t[0]}`]]);
    expect(st(p, a2).status).toBe('vacio');
    // Partido por el 3.º: lo gana la pareja 3; sin él, eran los dos semifinalistas.
    const p3 = await match(c.lid, [pair(c, 2), pair(c, 3)], { event: t.ev, key: 'A-P3' });
    p = await podium(w.u.org, t.prize.id);
    expect(refs(st(p, a3))).toEqual([`t:${c.t[2]}`]);
    await db.admin(`update public.matches set status = 'walkover', walkover_side = 2 where id = $1`, [p3]);
    expect(st(await podium(w.u.org, t.prize.id), a3).status).toBe('vacio');
    await db.admin(`update public.matches set status = 'scheduled', walkover_side = null, winner_side = null where id = $1`, [p3]);
    expect(st(await podium(w.u.org, t.prize.id), a3).status).toBe('sin_resultado');
    // El cuadro pide 3.er lugar y todavía no está el partido: sin_resultado.
    await db.admin('delete from public.matches where id = $1', [p3]);
    const cfg = (await db.admin<{ config: Json }>('select config from public.events where id = $1', [t.ev]))[0].config;
    cfg.categories[0].thirdPlace = true;
    await db.admin('update public.events set config = $2 where id = $1', [t.ev, cfg]);
    expect(st(await podium(w.u.org, t.prize.id), a3).status).toBe('sin_resultado');
    // Final propuesta hace 1 h: no cuenta todavía; a las 48 h (o confirmada), sí.
    await db.admin(`update public.matches set status = 'finished', walkover_side = null, winner_side = 1 where id = $1`, [t.final]);
    p = await podium(w.u.org, t.prize.id);
    expect([st(p, a1).status, st(p, a1).finished]).toEqual(['sin_resultado', false]);
    await fails(deliver(w.u.org, t.prize.id, [{ slot_id: a1, units: [{ ref: `t:${c.t[0]}`, players: [c.p[0]] }] }]), 'sin_resultado');
    await db.admin(`update public.matches set proposed_at = now() - interval '49 hours' where id = $1`, [t.final]);
    expect(st(await podium(w.u.org, t.prize.id), a1).status).toBe('listo');
    expect(await deliver(w.u.org, t.prize.id, [{ slot_id: a1, units: [{ ref: `t:${c.t[0]}`, players: [c.p[0]] }] }])).toMatchObject({ added: 1 });
  });

  it('lado sin alineación: la plantilla de la pareja que ya estaba cuando quedó el resultado (played: false)', async () => {
    const c = await padelClub();
    await db.admin(`update public.team_players set created_at = now() - interval '2 days' where league_id = $1`, [c.lid]);
    const t = await tourney(c);
    await db.admin('delete from public.match_players where match_id = $1', [t.final]);
    let a1 = st(await podium(w.u.org, t.prize.id), t.prize.slots[0].id);
    expect(a1.units[0].players.map((x) => [x.id, x.played])).toEqual([
      [c.p[0], false],
      [c.p[1], false],
    ]);
    // Sofi entró a la pareja después de la final: no cuenta.
    await db.admin('update public.team_players set created_at = now() where team_id = $1 and player_id = $2', [c.t[0], c.p[1]]);
    a1 = st(await podium(w.u.org, t.prize.id), t.prize.slots[0].id);
    expect(a1.units[0].players.map((x) => x.id)).toEqual([c.p[0]]);
    // Con alineación (las semifinales), played: true.
    const a3 = st(await podium(w.u.org, t.prize.id), t.prize.slots[2].id);
    expect(a3.units.flatMap((u) => u.players.map((x) => x.played))).toEqual([true, true, true, true]);
  });

  it('las categorías son las del torneo: pareja en dobles, individual en singles; otra categoría: invalido', async () => {
    const c = await padelClub();
    const t = await tourney(c);
    await fails(setPrizes(w.u.org, c.lid, 'evento', t.ev, [{ category: 'individual', division: 'A', place: 1, badge_id: t.badge }]), 'invalido');
    await fails(setPrizes(w.u.org, c.lid, 'evento', t.ev, [{ category: 'pareja', division: 'Z', place: 1, badge_id: t.badge }]), 'invalido');
    await fails(setPrizes(w.u.org, c.lid, 'evento', t.ev, [{ category: 'pareja', place: 1, badge_id: t.badge }]), 'invalido');
  });
});

describe('raqueta: noches', () => {
  it('el teléfono arma el podio: quien no jugó no recibe, nadie se lo da a sí mismo, desde el día de la noche', async () => {
    const c = await padelClub();
    const [{ id: ev }] = await db.admin<{ id: string }>(
      `insert into public.events (league_id, type, name, date, config) values ($1, 'americano', '', $2, $3) returning id`,
      [c.lid, await day(c.lid, 1), { format: 'americano', players: c.p.slice(0, 4) }],
    );
    await match(c.lid, [{ label: 'Luis / Sofi', players: [c.p[0], c.p[1]] }, { label: 'Ana / Bea', players: [c.p[2], c.p[3]] }], { event: ev });
    const badge = await design(c.lid);
    const prize = (await setPrizes(w.u.org, c.lid, 'evento', ev, [{ category: 'individual', place: 1, badge_id: badge }]))!;
    const slot = prize.slots[0];
    expect(slot.title).toBe('Individual');
    let p = await podium(w.u.org, prize.id);
    expect(p).toMatchObject({ kind: 'racket_night', verified: false });
    expect(p.slots[0]).toMatchObject({ status: 'telefono', finished: false, units: [] });
    const give = (who: string, pid: string) => deliver(who, prize.id, [{ slot_id: slot.id, units: [{ ref: `p:${pid}`, players: [pid] }] }]);
    await fails(give(w.u.org, c.p[2]), 'sin_resultado');
    await db.admin('update public.events set date = private.signup_today(league_id) where id = $1', [ev]);
    p = await podium(w.u.org, prize.id);
    expect(p.slots[0]).toMatchObject({ status: 'telefono', finished: true });
    await fails(give(w.u.org, c.p[5]), 'invalido');
    await fails(deliver(w.u.org, prize.id, [{ slot_id: slot.id, units: [{ ref: `p:${c.p[2]}`, players: [c.p[3]] }] }]), 'invalido');
    await fails(deliver(w.u.org, prize.id, [{ slot_id: slot.id, units: [{ ref: `c:${c.p[2]}`, players: [c.p[2]] }] }]), 'invalido');
    // Sofi jugó: no se lo entrega a sí misma; el dueño sí.
    await fails(give(w.u.sofi, c.p[1]), 'a_si_mismo');
    const d = await give(w.u.org, c.p[1]);
    expect(d).toMatchObject({ added: 1 });
    expect(slotOf(d.prize, 'individual', 1)).toMatchObject({ verified: false, winners: [{ ref: `p:${c.p[1]}`, name: 'Sofi', teamId: null, players: [c.p[1]] }] });
    expect((await awards('prize_slot_id = $1', [slot.id]))[0].note).toMatch(/^1\.er lugar · Individual · Noche del \d+ [a-z]{3}$/);
    // Un anulado no cuenta como jugado.
    await db.admin(`update public.matches set status = 'void' where event_id = $1`, [ev]);
    await fails(give(w.u.org, c.p[2]), 'invalido');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Equipos: relámpago y playoffs

interface Hoops {
  lid: string;
  /** Equipos a, b, c, d con dos jugadores cada uno (r[team] = su plantilla). */
  t: Record<'a' | 'b' | 'c' | 'd', string>;
  r: Record<'a' | 'b' | 'c' | 'd', string[]>;
  /** Refuerzo que no está en ninguna plantilla. */
  x: string;
}

async function hoops(kind: 'liga' | 'torneo'): Promise<Hoops> {
  const lid = await league(db, w.u.org, { name: kind === 'torneo' ? 'Copa Relámpago' : 'Liga de Barrio', visibility: 'public', sport: 'basketball', kind, requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  const t = {} as Hoops['t'];
  const r = {} as Hoops['r'];
  for (const k of ['a', 'b', 'c', 'd'] as const) {
    const [{ id }] = await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [lid, `Equipo ${k.toUpperCase()}`]);
    t[k] = id;
    r[k] = [await player(db, lid, `${k.toUpperCase()}1`), await player(db, lid, `${k.toUpperCase()}2`)];
    // La plantilla es de antes del torneo (solo cuenta quien ya estaba cuando quedó el resultado).
    await db.admin(
      `insert into public.team_players (team_id, player_id, league_id, created_at) values ($1, $2, $4, now() - interval '2 days'), ($1, $3, $4, now() - interval '2 days')`,
      [id, r[k][0], r[k][1], lid],
    );
  }
  return { lid, t, r, x: await player(db, lid, 'Refuerzo') };
}

const teamSide = (h: Hoops, k: 'a' | 'b' | 'c' | 'd', players: string[] = []): Side => ({ team: h.t[k], label: `Equipo ${k.toUpperCase()}`, players });

describe('equipos: torneo relámpago', () => {
  it('campeón, subcampeón y 3.º (partido P3); un refuerzo que jugó entra; sin P3 el 3.º queda vacío', async () => {
    const h = await hoops('torneo');
    const [{ id: ev }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'torneo', 'Copa Relámpago', $2) returning id`, [h.lid, await day(h.lid, -1)]);
    await match(h.lid, [teamSide(h, 'a'), teamSide(h, 'd')], { key: 'R1-1' });
    await match(h.lid, [teamSide(h, 'b'), teamSide(h, 'c')], { key: 'R1-2' });
    const final = await match(h.lid, [teamSide(h, 'a', [h.r.a[0], h.x]), teamSide(h, 'b', [h.r.b[0]])], { key: 'R2-1' });
    const p3 = await match(h.lid, [teamSide(h, 'd'), teamSide(h, 'c')], { key: 'P3', winner: 2 });
    // Un partido anulado de una ronda más alta no cuenta.
    await match(h.lid, [teamSide(h, 'a'), teamSide(h, 'c')], { key: 'R3-1', status: 'void' });
    const badge = await design(h.lid);
    const prize = (await setPrizes(w.u.org, h.lid, 'evento', ev, [1, 2, 3].map((place) => ({ category: 'equipo', place, badge_id: badge }))))!;
    expect(prize.slots.map((s) => s.title)).toEqual(['Equipos', 'Equipos', 'Equipos']);
    await fails(setPrizes(w.u.org, h.lid, 'evento', ev, [{ category: 'individual', place: 1, badge_id: badge }]), 'invalido');
    const [s1, s2, s3] = prize.slots.map((s) => s.id);
    let p = await podium(w.u.org, prize.id);
    expect(p.kind).toBe('team_ko');
    expect([refs(st(p, s1)), refs(st(p, s2)), refs(st(p, s3))]).toEqual([[`t:${h.t.a}`], [`t:${h.t.b}`], [`t:${h.t.c}`]]);
    expect(ids(st(p, s1), `t:${h.t.a}`)).toEqual(sorted([...h.r.a, h.x]));
    const d = await deliver(w.u.org, prize.id, proposal(p));
    expect(d).toMatchObject({ added: 7 });
    expect((await awards('prize_slot_id = $1', [s1])).map((a) => a.team_id)).toEqual([h.t.a, h.t.a, h.t.a]);
    // Sin partido por el 3.º: vacío. Con la final propuesta hace nada: sin resultado.
    await db.admin('delete from public.matches where id = $1', [p3]);
    expect(st(await podium(w.u.org, prize.id), s3).status).toBe('vacio');
    await db.admin(`update public.matches set status = 'finished', proposed_at = now() where id = $1`, [final]);
    p = await podium(w.u.org, prize.id);
    expect([st(p, s1).status, st(p, s2).status]).toEqual(['sin_resultado', 'sin_resultado']);
  });
  it('la plantilla cuenta con quien ya estaba al quedar el resultado: entrar al campeón después de la final no da el premio', async () => {
    const h = await hoops('torneo');
    const [{ id: ev }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'torneo', 'Copa Relámpago', $2) returning id`, [h.lid, await day(h.lid, -1)]);
    // Final sin alineaciones (solo resultado): el campeón es A con la plantilla de antes.
    await match(h.lid, [teamSide(h, 'a'), teamSide(h, 'b')], { key: 'R1-1' });
    const badge = await design(h.lid);
    const prize = (await setPrizes(w.u.org, h.lid, 'evento', ev, [{ category: 'equipo', place: 1, badge_id: badge }]))!;
    const s1 = prize.slots[0].id;
    // Después de la final, sofi (admin, de ningún equipo) entra a la plantilla de A, y un capitán agrega a un amigo.
    const sofi = await player(db, h.lid, 'Sofi', w.u.sofi);
    await db.rpc(w.u.sofi, 'set_team_player', { p_team: h.t.a, p_player: sofi });
    const amigo = await player(db, h.lid, 'Amigo');
    await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $3)', [h.t.a, amigo, h.lid]);
    let p = await podium(w.u.sofi, prize.id);
    expect(ids(st(p, s1), `t:${h.t.a}`)).toEqual(sorted(h.r.a));
    // Sin alineaciones nadie «jugó»: la pantalla marca a toda la plantilla.
    expect(st(p, s1).units[0].players.map((x) => x.played)).toEqual([false, false]);
    await fails(deliver(w.u.sofi, prize.id, [{ slot_id: s1, units: [{ ref: `t:${h.t.a}`, players: [sofi] }] }]), 'podio_cambio');
    await fails(deliver(w.u.sofi, prize.id, [{ slot_id: s1, units: [{ ref: `t:${h.t.a}`, players: [...h.r.a, amigo] }] }]), 'podio_cambio');
    expect(await deliver(w.u.sofi, prize.id, proposal(p))).toMatchObject({ added: 2 });
    // Con alineación en la final: played marca a quien jugó (un refuerzo también) y la plantilla de antes sigue.
    const h2 = await hoops('torneo');
    const [{ id: ev2 }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'torneo', 'Copa 2', $2) returning id`, [h2.lid, await day(h2.lid, -1)]);
    await match(h2.lid, [teamSide(h2, 'a', [h2.r.a[0], h2.x]), teamSide(h2, 'b', [h2.r.b[0]])], { key: 'R1-1' });
    const b2 = await design(h2.lid);
    const pz = (await setPrizes(w.u.org, h2.lid, 'evento', ev2, [{ category: 'equipo', place: 1, badge_id: b2 }]))!;
    p = await podium(w.u.org, pz.id);
    const played = Object.fromEntries(st(p, pz.slots[0].id).units[0].players.map((x) => [x.id, x.played]));
    expect(played).toEqual({ [h2.r.a[0]]: true, [h2.x]: true, [h2.r.a[1]]: false });
  });

  it('un solo premio por torneo relámpago: otro evento de la liga no premia al mismo campeón otra vez', async () => {
    const h = await hoops('torneo');
    const [{ id: ev }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date, created_at) values ($1, 'torneo', 'Copa Relámpago', $2, now() - interval '1 day') returning id`, [h.lid, await day(h.lid, -1)]);
    await match(h.lid, [teamSide(h, 'a'), teamSide(h, 'b')], { key: 'R1-1' });
    const badge = await design(h.lid);
    const prize = (await setPrizes(w.u.org, h.lid, 'evento', ev, [{ category: 'equipo', place: 1, badge_id: badge }]))!;
    expect(await deliver(w.u.org, prize.id, proposal(await podium(w.u.org, prize.id)))).toMatchObject({ added: 2 });
    // Un admin crea otro evento de tipo torneo en la misma liga: no admite premios.
    const other = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: h.lid, p_type: 'torneo', p_date: await day(h.lid, -1) });
    expect(await db.admin('select * from private.prize_allowed($1, $2, $3)', [h.lid, 'evento', other])).toEqual([]);
    await fails(setPrizes(w.u.org, h.lid, 'evento', other, [{ category: 'equipo', place: 1, badge_id: badge }]), 'invalido');
    expect(await db.count('public.league_badge_awards', 'player_id = any ($1) and revoked_at is null', [h.r.a])).toBe(2);
  });
});

describe('equipos: playoffs', () => {
  it('campeón, subcampeón y los dos semifinalistas; un refuerzo de la final entra; activo: sin_resultado', async () => {
    const h = await hoops('liga');
    const [{ id: season }] = await db.admin<{ id: string }>(`select id from public.seasons where league_id = $1 and status = 'active'`, [h.lid]);
    const [{ id: po }] = await db.admin<{ id: string }>(
      `insert into public.playoffs (league_id, season_id, status, best_of, seeds, winner) values ($1, $2, 'finished', '{1,1}', $3, $4) returning id`,
      [h.lid, season, [h.t.a, h.t.b, h.t.c, h.t.d], h.t.a],
    );
    const series = async (round: number, slot: number, a: string, b: string, winner: string, next: string | null) =>
      (
        await db.admin<{ id: string }>(
          `insert into public.playoff_series (playoff_id, league_id, round, slot, best_of, team_a, team_b, label_a, label_b, winner, next_series)
           values ($1, $2, $3, $4, 1, $5, $6, 'A', 'B', $7, $8) returning id`,
          [po, h.lid, round, slot, a, b, winner, next],
        )
      )[0].id;
    const fin = await series(2, 1, h.t.a, h.t.b, h.t.a, null);
    await series(1, 1, h.t.a, h.t.d, h.t.a, fin);
    await series(1, 2, h.t.b, h.t.c, h.t.b, fin);
    await match(h.lid, [teamSide(h, 'a', [h.r.a[0]]), teamSide(h, 'b', [h.r.b[0], h.x])], { key: 'PO2-1', series: fin });
    const badge = await design(h.lid);
    const prize = (await setPrizes(w.u.org, h.lid, 'playoff', po, [1, 2, 3].map((place) => ({ category: 'equipo', place, badge_id: badge }))))!;
    expect(prize).toMatchObject({ scope: 'playoff', refId: po });
    const [s1, s2, s3] = prize.slots.map((s) => s.id);
    let p = await podium(w.u.sofi, prize.id);
    expect(p.kind).toBe('playoff');
    expect([refs(st(p, s1)), refs(st(p, s2)), refs(st(p, s3))]).toEqual([[`t:${h.t.a}`], [`t:${h.t.b}`], sorted([`t:${h.t.c}`, `t:${h.t.d}`])]);
    expect(ids(st(p, s2), `t:${h.t.b}`)).toEqual(sorted([...h.r.b, h.x]));
    expect(await deliver(w.u.sofi, prize.id, proposal(p))).toMatchObject({ added: 9 });
    await db.admin(`update public.playoffs set status = 'active' where id = $1`, [po]);
    p = await podium(w.u.sofi, prize.id);
    expect(p.slots.map((s) => s.status)).toEqual(['sin_resultado', 'sin_resultado', 'sin_resultado']);
    // Borrar el playoff se lleva la premiación (las insignias se quedan).
    await db.admin('delete from public.playoffs where id = $1', [po]);
    expect(await db.count('public.tournament_prizes', 'id = $1', [prize.id])).toBe(0);
    expect(await db.count('public.league_badge_awards', 'prize_slot_id = any ($1) and revoked_at is null', [[s1, s2, s3]])).toBe(9);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Golf y natación

interface Golf {
  lid: string;
  p: { org: string; sofi: string; luis: string; ana: string; pedro: string; extra: string };
  course: string;
}

async function golfLeague(): Promise<Golf> {
  const lid = await league(db, w.u.org, { name: 'Golf del Club', visibility: 'private', sport: 'golf', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  const p = {
    org: await player(db, lid, 'Org', w.u.org),
    sofi: await player(db, lid, 'Sofi', w.u.sofi),
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    pedro: await player(db, lid, 'Pedro'),
    extra: await player(db, lid, 'Extra'),
  };
  const course = await db.rpc<string>(w.u.sofi, 'golf_save_course', {
    p_league: lid,
    p_name: 'Campo de ejemplo',
    p_holes: DEMO_COURSE.holes.map((x) => ({ par: x.par, si: x.si })),
    p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
  });
  return { lid, p, course };
}

/** Ronda suelta de ayer con tarjetas de luis, sofi, pedro (con golpes) y ana (sin golpes). */
async function golfRound(g: Golf, players: string[] = [g.p.luis, g.p.sofi, g.p.pedro, g.p.ana]) {
  const ev = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: g.lid, p_date: await day(g.lid, -1), p_course: g.course, p_name: 'Medalla de octubre' });
  await db.rpc(w.u.org, 'golf_add_players', { p_event: ev, p_players: players.map((player_id) => ({ player_id })) });
  await db.admin('update public.golf_cards set scored_at = now() where event_id = $1 and player_id <> $2', [ev, g.p.ana]);
  return ev;
}

describe('golf', () => {
  it('individual, gross y neto; ronda abierta sin resultado; sin tarjeta, sin golpes o DQ no recibe; nadie a sí mismo', async () => {
    const g = await golfLeague();
    const ev = await golfRound(g);
    const badge = await design(g.lid);
    const prize = (await setPrizes(w.u.org, g.lid, 'evento', ev, [
      { category: 'individual', place: 1, badge_id: badge },
      { category: 'individual', division: 'gross', place: 1, badge_id: badge },
      { category: 'individual', division: 'neto', place: 1, badge_id: badge },
    ]))!;
    expect(prize.slots.map((s) => [s.division, s.title, s.label])).toEqual([
      ['', 'Individual', ''],
      ['gross', 'Individual · Gross', 'Gross'],
      ['neto', 'Individual · Neto', 'Neto'],
    ]);
    const [main] = prize.slots.map((s) => s.id);
    const give = (who: string, pid: string, slot = main) => deliver(who, prize.id, [{ slot_id: slot, units: [{ ref: `p:${pid}`, players: [pid] }] }]);
    expect((await podium(w.u.org, prize.id)).slots.map((s) => [s.status, s.finished])).toEqual([
      ['telefono', false],
      ['telefono', false],
      ['telefono', false],
    ]);
    await fails(give(w.u.org, g.p.pedro), 'sin_resultado');
    await db.rpc(w.u.org, 'golf_close_round', { p_event: ev });
    expect((await podium(w.u.org, prize.id)).slots[0]).toMatchObject({ status: 'telefono', finished: true });
    await fails(give(w.u.org, g.p.extra), 'invalido');
    await fails(give(w.u.org, g.p.ana), 'invalido');
    await db.admin('update public.golf_cards set dq = true where event_id = $1 and player_id = $2', [ev, g.p.luis]);
    await fails(give(w.u.org, g.p.luis), 'invalido');
    await fails(give(w.u.sofi, g.p.sofi), 'a_si_mismo');
    expect(await give(w.u.org, g.p.sofi)).toMatchObject({ added: 1 });
    // Quitárselo sí puede (y cambiarlo por otro).
    expect(await give(w.u.sofi, g.p.pedro)).toMatchObject({ added: 1, revoked: 1 });
    const rows = await awards('prize_slot_id = $1', [main]);
    expect(rows).toHaveLength(2);
    expect(rows.map((a) => [a.player_id, a.revoked, a.note])).toEqual(
      expect.arrayContaining([
        [g.p.sofi, true, '1.er lugar · Individual · Medalla de octubre'],
        [g.p.pedro, false, '1.er lugar · Individual · Medalla de octubre'],
      ]),
    );
  });

  it('torneo de varias rondas: el premio es del torneo (no de la ronda) y se entrega con todas cerradas', async () => {
    const g = await golfLeague();
    const r = await db.rpc<{ tournament_id: string; event_ids: string[] }>(w.u.org, 'golf_create_tournament', {
      p_league: g.lid,
      p_name: 'Abierto del Club',
      p_dates: ['2026-10-10', '2026-10-11'],
      p_course: g.course,
    });
    await db.rpc(w.u.org, 'golf_add_players', { p_event: r.event_ids[1], p_players: [{ player_id: g.p.pedro }] });
    await db.admin('update public.golf_cards set scored_at = now() where event_id = $1', [r.event_ids[1]]);
    const badge = await design(g.lid);
    await fails(setPrizes(w.u.org, g.lid, 'evento', r.event_ids[0], [{ category: 'individual', place: 1, badge_id: badge }]), 'invalido');
    const prize = (await setPrizes(w.u.org, g.lid, 'golf_torneo', r.tournament_id, [{ category: 'individual', place: 1, badge_id: badge }], null))!;
    expect(prize).toMatchObject({ scope: 'golf_torneo', refId: r.tournament_id, period: 'OCT 2026' });
    const give = () => deliver(w.u.org, prize.id, [{ slot_id: prize.slots[0].id, units: [{ ref: `p:${g.p.pedro}`, players: [g.p.pedro] }] }]);
    await db.rpc(w.u.org, 'golf_close_round', { p_event: r.event_ids[1] });
    await fails(give(), 'sin_resultado');
    await db.rpc(w.u.org, 'golf_close_round', { p_event: r.event_ids[0] });
    const d = await give();
    expect(d).toMatchObject({ added: 1 });
    expect((await awards('prize_slot_id = $1', [prize.slots[0].id]))[0].note).toBe('1.er lugar · Individual · Abierto del Club');
  });
});

describe('natación', () => {
  it('club y nadador del encuentro: c: solo con nadadores de ese club que nadaron; encuentro sin finalizar: sin resultado', async () => {
    const lid = await league(db, w.u.org, { name: 'Club Acuático', visibility: 'private', sport: 'swimming', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    const club = async (name: string) => (await db.admin<{ id: string }>('insert into public.swim_clubs (league_id, name) values ($1, $2) returning id', [lid, name]))[0].id;
    const [delfines, tiburones] = [await club('Delfines'), await club('Tiburones')];
    const [s1, s2, s3, s4] = [await player(db, lid, 'Nadia'), await player(db, lid, 'Nico'), await player(db, lid, 'Nora'), await player(db, lid, 'Noel')];
    const [{ id: ev }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'encuentro', 'Copa Delfín', $2) returning id`, [lid, '2026-10-10']);
    const [{ id: se }] = await db.admin<{ id: string }>(
      `insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, 1, 50, 'libre', 25, 'F') returning id`,
      [lid, ev],
    );
    const enter = (pid: string, clubId: string, time: number | null, status = 'ok') =>
      db.admin('insert into public.swim_entries (league_id, event_id, swim_event_id, player_id, club_id, time_cs, status) values ($1, $2, $3, $4, $5, $6, $7)', [
        lid, ev, se, pid, clubId, time, status,
      ]);
    await enter(s1, delfines, 3100);
    await enter(s2, tiburones, 3200);
    await enter(s3, delfines, 3000, 'dq');
    await enter(s4, delfines, null);
    const badge = await design(lid);
    const prize = (await setPrizes(w.u.org, lid, 'evento', ev, [
      { category: 'equipo', place: 1, badge_id: badge },
      { category: 'individual', place: 1, badge_id: badge },
      { category: 'individual', division: 'F', place: 1, badge_id: badge },
    ]))!;
    expect(prize.slots.map((s) => [s.category, s.division, s.title, s.label])).toEqual([
      ['equipo', '', 'Clubes', ''],
      ['individual', '', 'Individual', ''],
      ['individual', 'F', 'Individual · Femenino', 'Femenino'],
    ]);
    const [clubSlot, ind, fem] = prize.slots.map((s) => s.id);
    const give = (slot: string, ref: string, players: string[]) => deliver(w.u.org, prize.id, [{ slot_id: slot, units: [{ ref, players }] }]);
    await fails(give(clubSlot, `c:${delfines}`, [s1]), 'sin_resultado');
    await db.admin('update public.swim_meets set finalized_at = now() where event_id = $1', [ev]);
    await fails(give(clubSlot, `c:${delfines}`, [s2]), 'invalido');
    await fails(give(clubSlot, `c:${delfines}`, [s1, s3]), 'invalido');
    await fails(give(clubSlot, `c:${delfines}`, [s4]), 'invalido');
    await fails(give(clubSlot, `p:${s1}`, [s1]), 'invalido');
    await fails(give(ind, `c:${delfines}`, [s1]), 'invalido');
    await fails(give(ind, `p:${s3}`, [s3]), 'invalido');
    const d = await give(clubSlot, `c:${delfines}`, [s1]);
    expect(d).toMatchObject({ added: 1 });
    expect(slotOf(d.prize, 'equipo', 1).winners).toEqual([{ ref: `c:${delfines}`, name: 'Delfines', teamId: null, players: [s1] }]);
    expect(await give(fem, `p:${s2}`, [s2])).toMatchObject({ added: 1 });
    expect((await awards('prize_slot_id = $1', [fem]))[0]).toMatchObject({ division: 'Femenino', team_id: null, note: '1.er lugar · Individual · Femenino · Copa Delfín' });
    // Un control de marcas no tiene premios.
    const [{ id: ctrl }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, date) values ($1, 'control', '2026-10-11') returning id`, [lid]);
    await fails(setPrizes(w.u.org, lid, 'evento', ctrl, [{ category: 'individual', place: 1, badge_id: badge }]), 'invalido');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Con el creador de insignias

describe('con el creador de insignias', () => {
  it('un premio no usa el cupo del diseño ni choca con un regalo; el mismo jugador gana por equipo y en individual', async () => {
    const c = await copaPrizes();
    await deliver(w.u.org, c.prize.id, proposal(await podium(w.u.org, c.prize.id)));
    // org ganó por equipos y en individual: dos «Campeón · OCT 2026» vigentes.
    expect(await db.count('public.league_badge_awards', 'player_id = $1 and badge_id = $2 and revoked_at is null', [P.org, c.champ])).toBe(2);
    // La Única «Campeón» con la misma cinta, de regalo: no hay cupo_lleno por los premios (ni duplicado para org).
    await db.rpc(w.u.sofi, 'award_league_badge', { p_badge: c.champ, p_players: [P.org], p_period: 'OCT 2026' });
    await fails(db.rpc(w.u.sofi, 'award_league_badge', { p_badge: c.champ, p_players: [P.pedro], p_period: 'OCT 2026' }), 'cupo_lleno');
    await fails(db.rpc(w.u.sofi, 'award_league_badge', { p_badge: c.champ, p_players: [P.org], p_period: 'OCT 2026' }), 'duplicado');
    expect(await db.count('public.league_badge_awards', 'player_id = $1 and badge_id = $2 and revoked_at is null', [P.org, c.champ])).toBe(3);
  });

  it('los topes del creador (15 por jugador, 60 por liga, 60 por cuenta) no cuentan los premios', async () => {
    const c = await copaPrizes();
    const gift = await design(w.priv, { name: 'Buen compañero', limit_kind: 'abierta' });
    await db.admin(
      `insert into public.league_badge_awards (badge_id, league_id, player_id, period, awarded_by, prize_slot_id)
       select $1, $2, $3, 'p' || i, $4, gen_random_uuid() from generate_series(1, 60) i`,
      [c.champ, w.priv, P.luis, w.u.org],
    );
    const r = await db.rpc<{ awards: Json[] }>(w.u.org, 'award_league_badge', { p_badge: gift, p_players: [P.luis] });
    expect(r.awards).toHaveLength(1);
  });

  it('juntar jugadores: premios de lugares distintos se quedan los dos; del mismo lugar, uno se retira con «fusión»', async () => {
    const c = await copaPrizes();
    const raw = (pid: string, slot: string, ago: string) =>
      db.admin<{ id: string }>(
        `insert into public.league_badge_awards (badge_id, league_id, player_id, period, awarded_by, awarded_at, prize_slot_id)
         values ($1, $2, $3, 'OCT 2026', $4, now() - $5::interval, $6) returning id`,
        [c.champ, w.priv, pid, w.u.org, ago, slot],
      );
    const [{ id: a }] = await raw(P.tono, c.team1, '2 days');
    const [{ id: b }] = await raw(P.gina, c.ind1, '1 day');
    await db.admin(`update public.tournament_prize_slots set winners = $2 where id = $1`, [c.ind1, [{ ref: `p:${P.gina}`, name: 'Gina', teamId: null, players: [P.gina] }]]);
    await db.rpc(w.u.org, 'merge_league_players', { p_league: w.priv, p_keep: P.tono, p_drop: P.gina });
    expect(await awards('id = any ($1)', [[a, b]])).toEqual([
      expect.objectContaining({ id: a, player_id: P.tono, revoked: false }),
      expect.objectContaining({ id: b, player_id: P.tono, revoked: false }),
    ]);
    // La foto de los ganadores sigue al que queda.
    expect((await db.admin<{ winners: Json[] }>('select winners from public.tournament_prize_slots where id = $1', [c.ind1]))[0].winners).toEqual([
      { ref: `p:${P.tono}`, name: 'Gina', teamId: null, players: [P.tono] },
    ]);
    const zeta = await player(db, w.priv, 'Zeta');
    const [{ id: x }] = await raw(zeta, c.team1, '1 hour');
    await db.rpc(w.u.org, 'merge_league_players', { p_league: w.priv, p_keep: P.tono, p_drop: zeta });
    expect((await awards('id = $1', [x]))[0]).toMatchObject({ player_id: P.tono, revoked: true, revoke_reason: 'fusión' });
    expect((await awards('id = $1', [a]))[0]).toMatchObject({ revoked: false });
  });

  it('el jugador de un admin junto con el invitado al que le entregó un premio verificado: no se retira; en golf, sí', async () => {
    // Boliche: pedro (invitado) ganó el individual y sofi lo entregó; después resulta que pedro era sofi.
    const b = await bowlEvent();
    await bowl(b.ev, P.pedro, null, 0, [250, 250, 250]);
    await bowl(b.ev, P.luis, null, 0, [100, 100, 100]);
    const champ = await design(w.priv);
    const prize = (await setPrizes(w.u.org, w.priv, 'evento', b.ev, [{ category: 'individual', place: 1, badge_id: champ }]))!;
    await deliver(w.u.sofi, prize.id, proposal(await podium(w.u.sofi, prize.id)));
    await db.rpc(w.u.org, 'merge_league_players', { p_league: w.priv, p_keep: P.sofi, p_drop: P.pedro });
    expect(await awards('prize_slot_id = $1', [prize.slots[0].id])).toEqual([expect.objectContaining({ player_id: P.sofi, revoked: false })]);
    // La marca va en el otorgamiento: borrar el torneo (y con él su lugar premiado) no se la quita en la próxima fusión.
    expect(await db.count('public.league_badge_awards', 'prize_slot_id = $1 and prize_verified', [prize.slots[0].id])).toBe(1);
    await db.rpc(w.u.org, 'delete_event', { p_event: b.ev });
    expect(await db.count('public.tournament_prize_slots', 'id = $1', [prize.slots[0].id])).toBe(0);
    await db.admin('select private.badge_link_guard($1)', [P.sofi]);
    expect(await awards('prize_slot_id = $1', [prize.slots[0].id])).toEqual([expect.objectContaining({ player_id: P.sofi, revoked: false })]);
    // Golf: lo armó el teléfono, así que la regla de siempre (nadie se da insignias a sí mismo).
    const g = await golfLeague();
    const ev = await golfRound(g, [g.p.luis, g.p.pedro]);
    await db.rpc(w.u.org, 'golf_close_round', { p_event: ev });
    const badge = await design(g.lid);
    const gp = (await setPrizes(w.u.org, g.lid, 'evento', ev, [{ category: 'individual', place: 1, badge_id: badge }]))!;
    await deliver(w.u.sofi, gp.id, [{ slot_id: gp.slots[0].id, units: [{ ref: `p:${g.p.pedro}`, players: [g.p.pedro] }] }]);
    await db.rpc(w.u.org, 'merge_league_players', { p_league: g.lid, p_keep: g.p.sofi, p_drop: g.p.pedro });
    expect(await awards('prize_slot_id = $1', [gp.slots[0].id])).toEqual([
      expect.objectContaining({ player_id: g.p.sofi, revoked: true, revoke_reason: 'Se la dio la misma cuenta' }),
    ]);
  });

  it('revoke_league_badge_award sobre un premio sigue sus reglas (el dueño; quien la dio, en 24 h)', async () => {
    const c = await copaPrizes();
    await deliver(w.u.sofi, c.prize.id, proposal(await podium(w.u.sofi, c.prize.id)));
    const [luisA] = await awards('player_id = $1', [P.luis]);
    await fails(db.rpc(w.u.luis, 'revoke_league_badge_award', { p_award: luisA.id }), DENIED);
    await db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: luisA.id });
    const [orgA] = await awards('player_id = $1 and prize_slot_id = $2', [P.org, c.ind1]);
    await db.admin(`update public.league_badge_awards set awarded_at = now() - interval '2 days' where id = $1`, [orgA.id]);
    await fails(db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: orgA.id }), DENIED);
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: orgA.id, p_reason: 'Se equivocó el marcador' });
    // Un diseño que ya se entregó queda bloqueado y no se borra.
    await fails(db.rpc(w.u.org, 'delete_league_badge', { p_id: c.champ }), 'ya_dada');
  });

  it('revoke_league_badge_award: con los premios cerrados (o el lugar con más de 14 días) solo el dueño quita un premio', async () => {
    const c = await copaPrizes();
    await deliver(w.u.sofi, c.prize.id, proposal(await podium(w.u.sofi, c.prize.id)));
    const [luisA] = await awards('player_id = $1 and prize_slot_id = $2', [P.luis, c.ind2]);
    const [orgA] = await awards('player_id = $1 and prize_slot_id = $2', [P.org, c.team1]);
    // El lugar se entregó hace 15 días (el otorgamiento de sofi es de hoy: «Deshacer» valdría).
    await db.admin(`update public.tournament_prize_slots set delivered_at = now() - interval '15 days' where id = $1`, [c.ind2]);
    await fails(db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: luisA.id }), 'cerrado');
    await db.admin('update public.tournament_prize_slots set delivered_at = now() where id = $1', [c.ind2]);
    // «Cerrar premios»: desde ahí, tampoco (ni sin motivo, que la entrega dejaría desmarcado).
    await db.rpc(w.u.sofi, 'close_tournament_prizes', { p_prize: c.prize.id });
    await fails(db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: luisA.id }), 'cerrado');
    expect((await awards('id = $1', [luisA.id]))[0]).toMatchObject({ revoked: false });
    // El dueño sí.
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: luisA.id, p_reason: 'Se equivocó el marcador' });
    expect((await awards('id = $1', [luisA.id]))[0]).toMatchObject({ revoked: true, revoke_reason: 'Se equivocó el marcador' });
    // Si el torneo se borra, el premio es un otorgamiento más: quien lo dio lo deshace en sus 24 h.
    await db.rpc(w.u.org, 'delete_event', { p_event: c.ev });
    await db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: orgA.id });
    expect((await awards('id = $1', [orgA.id]))[0]).toMatchObject({ revoked: true });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Catálogo, torneo nuevo del boliche y tiempo real

describe('catálogo (private.prize_allowed)', () => {
  const allowed = async (lid: string, scope: string, ref: string) =>
    (await db.admin<{ c: string; d: string }>('select category as c, division as d from private.prize_allowed($1, $2, $3) order by 1, 2', [lid, scope, ref])).map(
      (r) => `${r.c}:${r.d}`,
    );

  it('lo que premia cada competencia', async () => {
    const c = await copa();
    expect(await allowed(w.priv, 'evento', c.ev)).toEqual(['equipo:', 'individual:']);
    expect(await allowed(w.priv, 'evento', w.e.e1)).toEqual([]);
    expect(await allowed(w.pub, 'evento', w.e.e9)).toEqual(['individual:']);
    await db.admin('update public.events set team_size = 3 where id = $1', [w.e.e9]);
    expect(await allowed(w.pub, 'evento', w.e.e9)).toEqual(['equipo:', 'individual:']);
    // Raqueta: dobles en pádel (y en pickleball por defecto); singles en tenis (o si la liga lo dice).
    const club = await padelClub();
    const t = await tourney(club);
    expect(await allowed(club.lid, 'evento', t.ev)).toEqual(['pareja:A', 'pareja:B']);
    await db.admin(`update public.leagues set rules = '{"match": {"doubles": false}}' where id = $1`, [club.lid]);
    expect(await allowed(club.lid, 'evento', t.ev)).toEqual(['pareja:A', 'pareja:B']);
    const racket = async (sport: string, rules: Json = {}) => {
      const lid = await league(db, w.u.org, { name: `Club de ${sport}`, visibility: 'private', sport, requirePhoto: false });
      await db.admin('update public.leagues set rules = $2 where id = $1', [lid, rules]);
      const cats = { v: 1, format: 'torneo', categories: [{ id: 'A', name: 'Abierta', pairs: [], groups: 0, perGroup: 2, thirdPlace: false }], courts: [], points: 'standard' };
      const [{ id }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, date, config) values ($1, 'torneo', '2026-10-10', $2) returning id`, [lid, cats]);
      return allowed(lid, 'evento', id);
    };
    expect(await racket('tennis')).toEqual(['individual:A']);
    expect(await racket('tennis', { match: { doubles: true } })).toEqual(['pareja:A']);
    expect(await racket('pickleball')).toEqual(['pareja:A']);
    expect(await racket('pickleball', { match: { doubles: false } })).toEqual(['individual:A']);
    // Relámpago: solo en un torneo suelto de equipos (el evento de una liga normal no).
    const liga = await hoops('liga');
    const [{ id: ev }] = await db.admin<{ id: string }>(`insert into public.events (league_id, type, date) values ($1, 'torneo', '2026-10-10') returning id`, [liga.lid]);
    expect(await allowed(liga.lid, 'evento', ev)).toEqual([]);
    // Una ronda de golf que es parte de un torneo no tiene premio propio.
    const g = await golfLeague();
    const r = await db.rpc<{ tournament_id: string; event_ids: string[] }>(w.u.org, 'golf_create_tournament', {
      p_league: g.lid, p_name: 'Abierto', p_dates: ['2026-10-10'], p_course: g.course,
    });
    expect(await allowed(g.lid, 'evento', r.event_ids[0])).toEqual([]);
    expect(await allowed(g.lid, 'golf_torneo', r.tournament_id)).toEqual(['individual:', 'individual:gross', 'individual:neto']);
    // Una referencia de otra liga no es nada.
    expect(await allowed(w.priv, 'golf_torneo', r.tournament_id)).toEqual([]);
  });
});

describe('torneo nuevo del boliche', () => {
  it('create_event: sin regla escrita nace con individual por handicap y equipos por scratch; lo escrito se respeta', async () => {
    const make = (extra: Json = {}) =>
      db.rpc<string>(w.u.org, 'create_event', { p_league: w.priv, p_type: 'torneo', p_date: '2026-10-10', p_hcp_base: 230, p_hcp_percent: 80, ...extra });
    const rules = async (id: string) => (await db.admin('select individual_rank_by as i, team_rank_by as t from public.events where id = $1', [id]))[0];
    expect(await rules(await make())).toEqual({ i: 'hcp', t: 'scratch' });
    expect(await rules(await make({ p_individual_rank_by: 'scratch', p_team_rank_by: 'hcp' }))).toEqual({ i: 'scratch', t: 'hcp' });
    expect(await rules(await make({ p_type: 'practica' }))).toEqual({ i: null, t: null });
    // Se sigue cambiando en cada evento.
    const id = await make();
    await db.rpc(w.u.org, 'update_event', { p_event: id, p_patch: { team_rank_by: 'hcp' } });
    expect(await rules(id)).toEqual({ i: 'hcp', t: 'hcp' });
    // El torneo suelto, igual que siempre.
    const t = await db.rpc<{ event_id: string }>(w.u.luis, 'create_tournament', { p_name: 'Copa', p_date: '2026-10-10' });
    expect(await rules(t.event_id)).toEqual({ i: 'hcp', t: 'scratch' });
  });
});

describe('tiempo real', () => {
  it("avisa 'badges' con kind 'premio' a la liga (solo ids)", async () => {
    // Los NOTIFY salen al confirmar: una base aparte, sin la transacción de cada prueba.
    const rt = await TestDb.open();
    try {
      const v = await makeWorld(rt);
      const msgs: { topic: string; event: string; payload: Json }[] = [];
      await rt.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw)));
      const settle = async () => {
        await new Promise((r) => setTimeout(r, 50));
        return msgs.splice(0).filter((m) => m.event === 'badges' && m.payload.kind === 'premio');
      };
      const d = (await rt.rpc<{ id: string }>(v.u.org, 'save_league_badge', { p_league: v.priv, p_id: null, p_design: CAMPEON })).id;
      await settle();
      const [{ id: ev }] = await rt.admin<{ id: string }>(`insert into public.events (league_id, type, date) values ($1, 'torneo', '2026-10-10') returning id`, [v.priv]);
      const p = (await rt.rpc<Prize>(v.u.org, 'set_tournament_prizes', {
        p_league: v.priv, p_scope: 'evento', p_ref: ev, p_period: null, p_slots: [{ category: 'individual', place: 1, badge_id: d }],
      }))!;
      expect(await settle()).toEqual([
        { topic: `league:${v.priv}`, event: 'badges', payload: { op: 'insert', ids: [p.id], kind: 'premio' } },
        { topic: `league:${v.priv}`, event: 'badges', payload: { op: 'insert', ids: [p.slots[0].id], kind: 'premio' } },
      ]);
      await rt.rpc(v.u.org, 'set_tournament_prizes', { p_league: v.priv, p_scope: 'evento', p_ref: ev, p_period: null, p_slots: [] });
      expect(await settle()).toEqual([
        { topic: `league:${v.priv}`, event: 'badges', payload: { op: 'delete', ids: [p.slots[0].id], kind: 'premio' } },
        { topic: `league:${v.priv}`, event: 'badges', payload: { op: 'delete', ids: [p.id], kind: 'premio' } },
      ]);
    } finally {
      await rt.pg.close();
    }
  }, 60000);
});
