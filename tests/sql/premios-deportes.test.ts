/**
 * Premios del torneo en los otros deportes (docs/premios-torneo.md §5): lo que el teléfono calcula en
 * src/prizes/sports.ts tiene que ser lo que el servidor acepta.
 *
 * - Categorías, etiquetas y títulos: la competencia de cada pantalla (`racketTourneyComp`, `teamKoComp`, `golfComp`…)
 *   con `prizeCategories` (src/prizes/catalog.ts) contra `private.prize_allowed` y lo que guarda
 *   `set_tournament_prizes` (raqueta en dobles y en singles, noches, relámpago, playoffs, golf y natación).
 * - Golf y natación: el podio que arma el teléfono con los datos de la base (`golfProvider`, `swimProvider` con
 *   `placedMeet`) se entrega tal cual con `deliver_tournament_prizes`, sin 'invalido'.
 * - Cuadros de raqueta, relámpago y playoffs: el podio que la tarjeta calcula en el teléfono (`racketTourneyProvider`,
 *   `teamKoProvider`, `playoffProvider`) es el de `tournament_podium`, lugar por lugar (estado y refs).
 *
 * Mundo: el de fixture.ts. Cada prueba en su transacción (se deshace al final).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestDb } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { DEMO_COURSE, DEMO_PARS } from '../../src/sports/golf/demo';
import type { GolfCardDoc, GolfRoundFull } from '../../src/lib/data/golf';
import type { SwimEntry, SwimEventItem } from '../../src/lib/data/swimming';
import { placedMeet } from '../../src/pages/sports/swimming/logic';
import { prizeCategories, type PrizeComp } from '../../src/prizes/catalog';
import type { PodiumProvider } from '../../src/prizes/providers';
import type { Match } from '../../src/lib/data/matchCore';
import {
  golfComp,
  golfProvider,
  playoffComp,
  playoffProvider,
  racketNightComp,
  racketTourneyComp,
  racketTourneyProvider,
  swimComp,
  swimProvider,
  teamKoComp,
  teamKoFinished,
  teamKoProvider,
} from '../../src/prizes/sports';

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

type Json = Record<string, any>;
interface Slot {
  id: string;
  category: 'equipo' | 'individual' | 'pareja';
  division: string;
  label: string;
  place: number;
  title: string;
  winners: { ref: string; players: string[] }[];
}
interface Prize {
  id: string;
  slots: Slot[];
}

const CAMPEON = { name: 'Campeón', shape: 'shield', palette: 'oro', icon: 'trophy', limit_kind: 'unica', template: 'champion' };
const design = async (lid: string) => (await db.rpc<{ id: string }>(w.u.org, 'save_league_badge', { p_league: lid, p_id: null, p_design: CAMPEON })).id;
const setPrizes = (lid: string, scope: string, ref: string, slots: Json[]) =>
  db.rpc<Prize | null>(w.u.org, 'set_tournament_prizes', { p_league: lid, p_scope: scope, p_ref: ref, p_period: 'OCT 2026', p_slots: slots });
const allowed = async (lid: string, scope: string, ref: string) =>
  (await db.admin<{ c: string; d: string }>('select category as c, division as d from private.prize_allowed($1, $2, $3) order by 1, 2', [lid, scope, ref])).map(
    (r) => `${r.c}:${r.d}`,
  );
const day = async (lid: string, n: number) => (await db.admin<{ d: string }>('select (private.signup_today($1) + $2::int)::text as d', [lid, n]))[0].d;
const sportLeague = async (sport: string, kind: 'liga' | 'torneo' = 'liga', rules: Json = {}) => {
  const lid = await league(db, w.u.org, { name: `Liga de ${sport}`, visibility: 'private', sport, kind, requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await db.admin('update public.leagues set rules = $2 where id = $1', [lid, rules]);
  return lid;
};
const insertEvent = async (lid: string, type: string, config: Json = {}, name = '') =>
  (await db.admin<{ id: string }>('insert into public.events (league_id, type, name, date, config) values ($1, $2, $3, $4, $5) returning id', [lid, type, name, '2026-10-10', config]))[0].id;

/**
 * Lo que dice el teléfono de una competencia contra lo que guarda el servidor: las mismas categorías que
 * prize_allowed y, guardando el 1.er lugar de cada una SIN etiqueta (la pone el servidor), la misma etiqueta y el
 * mismo título, en el mismo orden; y el mismo tipo de competencia que tournament_podium.
 */
async function same(comp: PrizeComp | null) {
  expect(comp).not.toBeNull();
  const c = comp!;
  const ts = prizeCategories(c);
  expect(ts.map((x) => `${x.category}:${x.division}`).sort()).toEqual(await allowed(c.lid, c.scope, c.refId));
  const badge = await design(c.lid);
  const prize = (await setPrizes(
    c.lid,
    c.scope,
    c.refId,
    ts.map((x) => ({ category: x.category, division: x.division, place: 1, badge_id: badge })),
  ))!;
  expect(prize.slots.map((s) => [s.category, s.division, s.label, s.title])).toEqual(ts.map((x) => [x.category, x.division, x.label, x.title]));
  const podium = await db.rpc<{ kind: string }>(w.u.org, 'tournament_podium', { p_prize: prize.id });
  expect(podium.kind).toBe(c.kind);
}

/** Un evento como lo lee la pantalla (id, nombre y día). */
const named = (id: string, name = '') => ({ id, name, date: '2026-10-10' });

describe('categorías, etiquetas y títulos: el teléfono y el servidor dicen lo mismo', () => {
  const categories = [
    { id: 'A', name: 'Categoría A' },
    { id: 'B', name: '  Damas   Open  ' },
    { id: 'C', name: 'Categoría Avanzados Plus' },
  ];
  const tourneyConfig = { v: 1, format: 'torneo', categories: categories.map((c) => ({ ...c, pairs: [], groups: 0, perGroup: 2, thirdPlace: true })), courts: [], points: 'standard' };

  it('raqueta: torneo por categorías (dobles y singles) y noches', async () => {
    for (const [sport, rules] of [
      ['padel', {}],
      ['padel', { match: { doubles: false } }],
      ['tennis', {}],
      ['tennis', { match: { doubles: true } }],
      ['pickleball', {}],
      ['pickleball', { match: { doubles: false } }],
    ] as [string, Json][]) {
      const lid = await sportLeague(sport, 'liga', rules);
      await same(racketTourneyComp(lid, named(await insertEvent(lid, 'torneo', tourneyConfig, 'Open'), 'Open'), { sport, leagueRules: rules, categories }));
    }
    const padel = await sportLeague('padel');
    await same(racketNightComp(padel, named(await insertEvent(padel, 'americano', { format: 'americano', players: [] })), 'padel'));
    const pickle = await sportLeague('pickleball');
    await same(racketNightComp(pickle, named(await insertEvent(pickle, 'mexicano', { format: 'mexicano', players: [] })), 'pickleball'));
  });

  it('equipos: relámpago (el evento del torneo suelto) y playoffs', async () => {
    for (const sport of ['basketball', 'football', 'futsal']) {
      const lid = await sportLeague(sport, 'torneo');
      await same(teamKoComp(lid, { kind: 'torneo', sport, event: named(await insertEvent(lid, 'torneo', {}, 'Copa'), 'Copa'), leagueName: 'Copa' }));
    }
    const lid = await sportLeague('basketball');
    const teams: string[] = [];
    for (const name of ['A', 'B']) teams.push((await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [lid, name]))[0].id);
    const [{ id: season }] = await db.admin<{ id: string }>(`select id from public.seasons where league_id = $1 and status = 'active'`, [lid]);
    const [{ id: po }] = await db.admin<{ id: string }>(`insert into public.playoffs (league_id, season_id, best_of, seeds) values ($1, $2, '{1}', $3) returning id`, [
      lid,
      season,
      teams,
    ]);
    await same(playoffComp(lid, { id: po, name: 'Playoffs' }, 'basketball', '2026-10-10'));
  });

  it('golf (ronda suelta y torneo) y natación (encuentro y torneo)', async () => {
    const g = await golfLeague();
    await same(golfComp(g.lid, { eventId: await golfRound(g, []), tournamentId: null, name: 'Medalla', date: '2026-10-10' }));
    const t = await db.rpc<{ tournament_id: string; event_ids: string[] }>(w.u.org, 'golf_create_tournament', {
      p_league: g.lid,
      p_name: 'Abierto',
      p_dates: ['2026-10-10', '2026-10-11'],
      p_course: g.course,
    });
    await same(golfComp(g.lid, { eventId: t.event_ids[0], tournamentId: t.tournament_id, name: 'Abierto', date: '2026-10-11' }));
    const swim = await sportLeague('swimming');
    for (const type of ['encuentro', 'torneo']) await same(swimComp(swim, { ...named(await insertEvent(swim, type, {}, 'Copa Delfín'), 'Copa Delfín'), type }));
  });
});

// ---------------------------------------------------------------------------------------------------------
// El podio del teléfono se entrega tal cual

/** Lo que el teléfono manda a deliver_tournament_prizes: los lugares 'listo' con todos marcados. */
const want = (slots: Slot[], provider: PodiumProvider) =>
  slots
    .map((s) => ({ s, p: provider({ category: s.category, division: s.division, place: s.place as 1 | 2 | 3 })! }))
    .filter((x) => x.p.status === 'listo')
    .map((x) => ({ slot_id: x.s.id, units: x.p.units.map((u) => ({ ref: u.ref, players: u.players.map((p) => p.id) })) }));
const winnersOf = (p: Prize) => Object.fromEntries(p.slots.map((s) => [`${s.division || '-'}:${s.place}`, s.winners.map((u) => u.ref).sort()]));

interface Golf {
  lid: string;
  course: string;
  p: Record<'luis' | 'ana' | 'pedro' | 'gina' | 'rafa', string>;
}

async function golfLeague(): Promise<Golf> {
  const lid = await sportLeague('golf');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    pedro: await player(db, lid, 'Pedro'),
    gina: await player(db, lid, 'Gina'),
    rafa: await player(db, lid, 'Rafa'),
  };
  const course = await db.rpc<string>(w.u.org, 'golf_save_course', {
    p_league: lid,
    p_name: 'Campo de ejemplo',
    p_holes: DEMO_COURSE.holes.map((x) => ({ par: x.par, si: x.si })),
    p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
  });
  return { lid, course, p };
}

async function golfRound(g: Golf, players: string[]) {
  const ev = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: g.lid, p_date: await day(g.lid, -1), p_course: g.course, p_name: 'Medalla' });
  if (players.length) await db.rpc(w.u.org, 'golf_add_players', { p_event: ev, p_players: players.map((player_id) => ({ player_id })) });
  return ev;
}

/** La ronda y sus tarjetas como las lee el teléfono (src/lib/data/golf.ts toRound/toCard). */
async function golfFromDb(ev: string): Promise<{ rounds: GolfRoundFull[]; cards: GolfCardDoc[] }> {
  const [r] = await db.admin<Json>('select * from public.golf_rounds where event_id = $1', [ev]);
  const cards = await db.admin<Json>('select * from public.golf_cards where event_id = $1', [ev]);
  return {
    rounds: [
      {
        eventId: r.event_id,
        courseId: r.course_id,
        courseName: r.course_name,
        holes: r.holes === 9 ? 9 : 18,
        nine: r.nine,
        competition: r.competition,
        shotgun: r.shotgun,
        tournamentId: r.tournament_id,
        roundNo: r.round_no,
        closed: r.status === 'cerrada',
        closedAt: null,
        course: r.course,
      },
    ],
    cards: cards.map((c) => ({
      id: c.id,
      eventId: c.event_id,
      playerId: c.player_id,
      teeId: c.tee_id,
      hcpIndex: c.hcp_index,
      courseHcp: c.course_hcp,
      playingHcp: c.playing_hcp,
      groupNo: c.group_no,
      startHole: c.start_hole,
      strokes: c.strokes,
      putts: c.putts,
      pickedUp: c.picked_up,
      signed: c.status === 'firmada',
      signedAt: null,
      scoredAt: c.scored_at,
      dq: c.dq,
    })),
  };
}

describe('el podio que arma el teléfono lo acepta el servidor', () => {
  it('golf: oficial (neto), gross y neto, con un empate y un descalificado', async () => {
    const g = await golfLeague();
    const ev = await golfRound(g, Object.values(g.p));
    const card = (pid: string, delta: (i: number) => number, hcp = 0, dq = false) =>
      db.admin('update public.golf_cards set strokes = $3, putts = $4, picked_up = $5, playing_hcp = $6, dq = $7, scored_at = now() where event_id = $1 and player_id = $2', [
        ev,
        pid,
        DEMO_PARS.map((p, i) => p + delta(i)),
        DEMO_PARS.map(() => null),
        DEMO_PARS.map(() => false),
        hcp,
        dq,
      ]);
    // Neto: ana −2 (+2 con 4 de handicap), luis y pedro E (empatan con la misma tarjeta), gina +1; rafa descalificado.
    await card(g.p.ana, (i) => (i < 2 ? 1 : 0), 4);
    await card(g.p.luis, () => 0);
    await card(g.p.pedro, () => 0);
    await card(g.p.gina, (i) => (i === 0 ? 1 : 0));
    await card(g.p.rafa, (i) => (i === 0 ? -3 : 0), 0, true);
    await db.rpc(w.u.org, 'golf_close_round', { p_event: ev });
    const badge = await design(g.lid);
    const prize = (await setPrizes(
      g.lid,
      'evento',
      ev,
      prizeCategories({ kind: 'golf' }).flatMap((c) => [1, 2, 3].map((place) => ({ category: c.category, division: c.division, place, badge_id: badge }))),
    ))!;
    const src = await golfFromDb(ev);
    const names = new Map(Object.entries(g.p).map(([k, v]) => [v, k]));
    const d = await db.rpc<{ added: number; prize: Prize }>(w.u.org, 'deliver_tournament_prizes', {
      p_prize: prize.id,
      p_podium: want(prize.slots, golfProvider(src, (id) => names.get(id) ?? id)),
    });
    const p = (k: keyof Golf['p']) => `p:${g.p[k]}`;
    expect(winnersOf(d.prize)).toEqual({
      // Oficial (stroke neto) y neto: ana; luis y pedro comparten el 2.º (no hay 3.º); gina 4.ª.
      '-:1': [p('ana')],
      '-:2': [p('luis'), p('pedro')].sort(),
      '-:3': [],
      'neto:1': [p('ana')],
      'neto:2': [p('luis'), p('pedro')].sort(),
      'neto:3': [],
      // Gross: luis y pedro comparten el 1.º (E); gina y ana detrás (rafa, descalificado, no entra).
      'gross:1': [p('luis'), p('pedro')].sort(),
      'gross:2': [],
      'gross:3': [p('gina')],
    });
    expect(d.added).toBe(9);
  });

  it('natación: clubes y nadador del encuentro (todos, femenino y masculino) con los datos de la base', async () => {
    const lid = await sportLeague('swimming');
    const club = async (name: string) => (await db.admin<{ id: string }>('insert into public.swim_clubs (league_id, name) values ($1, $2) returning id', [lid, name]))[0].id;
    const del = await club('Delfines');
    const tib = await club('Tiburones');
    const sw: Record<string, string> = {};
    for (const n of ['Ana', 'Bea', 'Eva', 'Luis', 'Juan', 'Pepe']) sw[n] = await player(db, lid, n);
    const ev = await insertEvent(lid, 'encuentro', {}, 'Copa Delfín');
    const race = async (num: number, gender: string) =>
      (
        await db.admin<{ id: string }>(
          `insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, $3, 50, 'libre', 25, $4) returning id`,
          [lid, ev, num, gender],
        )
      )[0].id;
    const enter = (se: string, who: string, clubId: string, time: number | null, status = 'ok', group: string | null = null) =>
      db.admin(
        'insert into public.swim_entries (league_id, event_id, swim_event_id, player_id, club_id, time_cs, status, age_group, result_at) values ($1, $2, $3, $4, $5, $6, $7, $8, now())',
        [lid, ev, se, sw[who], clubId, time, status, group],
      );
    const f1 = await race(1, 'F');
    const m1 = await race(2, 'M');
    const f2 = await race(3, 'F');
    await enter(f1, 'Ana', del, 3000);
    await enter(f1, 'Bea', tib, 3100);
    await enter(f1, 'Eva', del, 3200);
    await enter(m1, 'Luis', tib, 2900);
    await enter(m1, 'Juan', del, 3000);
    await enter(m1, 'Pepe', tib, 2800, 'dq');
    await enter(f2, 'Bea', tib, 7000);
    await enter(f2, 'Ana', del, 7100);
    await db.admin('update public.swim_meets set finalized_at = now() where event_id = $1', [ev]);
    const badge = await design(lid);
    const prize = (await setPrizes(
      lid,
      'evento',
      ev,
      prizeCategories({ kind: 'swim' }).flatMap((c) => [1, 2, 3].map((place) => ({ category: c.category, division: c.division, place, badge_id: badge }))),
    ))!;
    // Lo que lee el teléfono (toSwimEvent/toSwimEntry) y la tabla de puntos del encuentro.
    const [meet] = await db.admin<{ points: number[] }>('select points from public.swim_meets where event_id = $1', [ev]);
    const events: SwimEventItem[] = (await db.admin<Json>('select * from public.swim_events where event_id = $1', [ev])).map((r) => ({
      id: r.id,
      meetId: r.event_id,
      num: r.num,
      distance: r.distance,
      stroke: r.stroke,
      pool: r.pool,
      gender: r.gender,
      ageGroups: r.age_groups ?? [],
    }));
    const entries: SwimEntry[] = (await db.admin<Json>('select * from public.swim_entries where event_id = $1', [ev])).map((r) => ({
      id: r.id,
      meetId: r.event_id,
      swimEventId: r.swim_event_id,
      playerId: r.player_id,
      clubId: r.club_id,
      ageGroup: r.age_group,
      seed: r.seed_cs,
      heat: r.heat,
      lane: r.lane,
      time: r.time_cs,
      status: r.status,
      resultAt: r.result_at,
    }));
    const placed = placedMeet(events, entries, meet.points);
    const names = { swimmer: (id: string) => id, club: (id: string) => (id === del ? 'Delfines' : 'Tiburones') };
    const d = await db.rpc<{ added: number; prize: Prize }>(w.u.org, 'deliver_tournament_prizes', {
      p_prize: prize.id,
      p_podium: want(prize.slots, swimProvider(placed, names)),
    });
    const byCat = (cat: string) =>
      Object.fromEntries(
        d.prize.slots.filter((s) => s.category === cat).map((s) => [`${s.division || '-'}:${s.place}`, s.winners.map((u) => ({ ...u, players: [...u.players].sort() }))]),
      );
    const p = (n: string) => `p:${sw[n]}`;
    // Clubes: Delfines 6 + 3 + 4 + 4 = 17 (ana, eva y juan); Tiburones 4 + 6 + 6 = 16 (bea y luis: pepe, DQ, no).
    expect(byCat('equipo')).toEqual({
      '-:1': [{ ref: `c:${del}`, name: 'Delfines', teamId: null, players: [sw.Ana, sw.Eva, sw.Juan].sort() }],
      '-:2': [{ ref: `c:${tib}`, name: 'Tiburones', teamId: null, players: [sw.Bea, sw.Luis].sort() }],
      '-:3': [],
    });
    // Nadador: ana y bea 10 (un oro y una plata cada una); luis 6; juan 4; eva 3.
    const refs = Object.fromEntries(Object.entries(byCat('individual')).map(([k, v]) => [k, v.map((u) => u.ref).sort()]));
    expect(refs).toEqual({
      '-:1': [p('Ana'), p('Bea')].sort(),
      '-:2': [],
      '-:3': [p('Luis')],
      'F:1': [p('Ana'), p('Bea')].sort(),
      'F:2': [],
      'F:3': [p('Eva')],
      'M:1': [p('Luis')],
      'M:2': [p('Juan')],
      'M:3': [],
    });
    expect(d.added).toBe(13);
  });

  it('natación: un club grande (más de 30 nadadores) recibe entero; más de 100 por unidad no', async () => {
    const lid = await sportLeague('swimming');
    const [{ id: del }] = await db.admin<{ id: string }>(`insert into public.swim_clubs (league_id, name) values ($1, 'Delfines') returning id`, [lid]);
    const ev = await insertEvent(lid, 'encuentro', {}, 'Copa Delfín');
    const [{ id: race }] = await db.admin<{ id: string }>(
      `insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, 1, 50, 'libre', 25, 'F') returning id`,
      [lid, ev],
    );
    const swimmers: string[] = [];
    for (let i = 0; i < 40; i++) {
      const id = await player(db, lid, `Nadadora ${i + 1}`);
      swimmers.push(id);
      await db.admin(
        `insert into public.swim_entries (league_id, event_id, swim_event_id, player_id, club_id, time_cs, status, result_at) values ($1, $2, $3, $4, $5, $6, 'ok', now())`,
        [lid, ev, race, id, del, 3000 + i],
      );
    }
    await db.admin('update public.swim_meets set finalized_at = now() where event_id = $1', [ev]);
    const prize = (await setPrizes(lid, 'evento', ev, [{ category: 'equipo', place: 1, badge_id: await design(lid) }]))!;
    const d = await db.rpc<{ added: number }>(w.u.org, 'deliver_tournament_prizes', {
      p_prize: prize.id,
      p_podium: [{ slot_id: prize.slots[0].id, units: [{ ref: `c:${del}`, players: swimmers }] }],
    });
    expect(d.added).toBe(40);
    const many = [...swimmers, ...Array.from({ length: 61 }, () => crypto.randomUUID())];
    await expect(
      db.rpc(w.u.org, 'deliver_tournament_prizes', { p_prize: prize.id, p_podium: [{ slot_id: prize.slots[0].id, units: [{ ref: `c:${del}`, players: many }] }] }),
    ).rejects.toThrow(/invalido/);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Cuadros y playoffs: la tarjeta del teléfono dice el mismo podio que el servidor

interface Side {
  team?: string | null;
  label: string;
  players?: string[];
}

/** Un partido ya jugado (por defecto confirmado y lo ganó el lado 1). */
async function match(
  lid: string,
  sides: [Side, Side],
  o: { event?: string | null; key?: string | null; status?: string; winner?: number | null; walkover?: number | null; series?: string | null } = {},
) {
  const [{ id }] = await db.admin<{ id: string }>(
    `insert into public.matches (league_id, event_id, bracket_key, status, winner_side, walkover_side, proposed_at, series_id)
     values ($1, $2, $3, $4, $5, $6, now() - interval '1 hour', $7) returning id`,
    [lid, o.event ?? null, o.key ?? null, o.status ?? 'confirmed', o.winner === undefined ? 1 : o.winner, o.walkover ?? null, o.series ?? null],
  );
  for (const [i, s] of sides.entries()) {
    await db.admin('insert into public.match_sides (match_id, side, league_id, team_id, label) values ($1, $2, $3, $4, $5)', [id, i + 1, lid, s.team ?? null, s.label]);
    for (const pid of s.players ?? []) await db.admin('insert into public.match_players (match_id, player_id, league_id, side) values ($1, $2, $3, $4)', [id, pid, lid, i + 1]);
  }
  return id;
}

/** Los partidos de la liga como los lee el teléfono (los campos que usan los podios). */
async function matchesFromDb(lid: string): Promise<Match[]> {
  const rows = await db.admin<Json>('select * from public.matches where league_id = $1 order by created_at, id', [lid]);
  const sides = await db.admin<Json>('select s.* from public.match_sides s join public.matches m on m.id = s.match_id where m.league_id = $1', [lid]);
  const players = await db.admin<Json>('select p.* from public.match_players p join public.matches m on m.id = p.match_id where m.league_id = $1', [lid]);
  return rows.map(
    (r) =>
      ({
        id: r.id,
        bracketKey: r.bracket_key,
        status: r.status,
        winner: r.winner_side,
        walkoverSide: r.walkover_side,
        proposedAt: r.proposed_at ? new Date(r.proposed_at).toISOString() : null,
        seriesId: r.series_id,
        sides: [1, 2].map((side) => {
          const s = sides.find((x) => x.match_id === r.id && x.side === side);
          return {
            side,
            teamId: s?.team_id ?? null,
            label: s?.label ?? '',
            seed: null,
            players: players.filter((p) => p.match_id === r.id && p.side === side).map((p) => ({ playerId: p.player_id, side, position: null, jersey: null, sub: false })),
          };
        }),
      }) as unknown as Match,
  );
}

/** Las plantillas de las parejas y equipos de la liga. */
async function rostersFromDb(lid: string) {
  const rows = await db.admin<{ team_id: string; player_id: string }>('select team_id, player_id from public.team_players where league_id = $1', [lid]);
  return (teamId: string) => rows.filter((r) => r.team_id === teamId).map((r) => r.player_id);
}

/** El podio del servidor y el del teléfono, lugar por lugar: [clave, estado, refs]. */
async function compare(prizeId: string, slots: Slot[], provider: PodiumProvider) {
  const p = await db.rpc<{ slots: { slotId: string; status: string; units: { ref: string }[] }[] }>(w.u.org, 'tournament_podium', { p_prize: prizeId });
  const key = (s: Slot) => `${s.division || '-'}:${s.place}`;
  const server = slots.map((s) => {
    const q = p.slots.find((x) => x.slotId === s.id)!;
    return [key(s), q.status, q.units.map((u) => u.ref).sort()];
  });
  const phone = slots.map((s) => {
    const q = provider({ category: s.category, division: s.division, place: s.place as 1 | 2 | 3 })!;
    return [key(s), q.status, q.units.map((u) => u.ref).sort()];
  });
  expect(phone).toEqual(server);
  return server;
}

describe('cuadros y playoffs: la tarjeta del teléfono dice el mismo podio que el servidor', () => {
  it('raqueta: final normal, W.O., 3.er lugar (sin P3, con P3 pendiente y jugado) y lados sin pareja', async () => {
    const lid = await sportLeague('padel');
    const p: string[] = [];
    for (const n of ['Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabo', 'Hugo', 'Ines', 'Juan']) p.push(await player(db, lid, n));
    const t: string[] = [];
    for (let i = 0; i < 4; i++) {
      const [{ id }] = await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [lid, `Pareja ${i + 1}`]);
      await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $4), ($1, $3, $4)', [id, p[2 * i], p[2 * i + 1], lid]);
      t.push(id);
    }
    const categories = [
      { id: 'A', name: 'Categoría A', pairs: t, seeds: t, groups: 0, perGroup: 2, thirdPlace: false },
      { id: 'B', name: 'Categoría B', pairs: [], seeds: ['x', 'y'], groups: 0, perGroup: 2, thirdPlace: false },
      { id: 'C', name: 'Categoría C', pairs: t, seeds: t, groups: 0, perGroup: 2, thirdPlace: true },
    ];
    const ev = await insertEvent(lid, 'torneo', { v: 1, format: 'torneo', categories, courts: [], points: 'standard' }, 'Open');
    const pair = (i: number): Side => ({ team: t[i], label: `Pareja ${i + 1}` });
    await match(lid, [pair(0), pair(3)], { event: ev, key: 'A-R1-1' });
    await match(lid, [pair(1), pair(2)], { event: ev, key: 'A-R1-2', winner: 2 });
    await match(lid, [{ ...pair(0), players: [p[0], p[1]] }, pair(2)], { event: ev, key: 'A-R2-1' });
    await match(lid, [{ label: 'Eva / Fede', players: [p[4], p[5]] }, { label: 'Juan', players: [p[9]] }], { event: ev, key: 'B-R1-1', winner: null, status: 'walkover', walkover: 1 });
    await match(lid, [pair(0), pair(3)], { event: ev, key: 'C-R1-1' });
    await match(lid, [pair(1), pair(2)], { event: ev, key: 'C-R1-2' });
    const finalC = await match(lid, [pair(0), pair(1)], { event: ev, key: 'C-R2-1', winner: 2 });
    const badge = await design(lid);
    const all = (divs: string[]) => divs.flatMap((division) => [1, 2, 3].map((place) => ({ category: 'pareja', division, place, badge_id: badge })));
    const prize = (await setPrizes(lid, 'evento', ev, all(['A', 'B', 'C'])))!;
    const phone = async () =>
      racketTourneyProvider(categories, await matchesFromDb(lid), { nameOf: (id) => id, rosterOf: await rostersFromDb(lid) }, Date.now());
    expect(await compare(prize.id, prize.slots, await phone())).toEqual([
      ['A:1', 'listo', [`t:${t[0]}`]],
      ['A:2', 'listo', [`t:${t[2]}`]],
      ['A:3', 'listo', [`t:${t[1]}`, `t:${t[3]}`].sort()],
      ['B:1', 'listo', [`p:${p[9]}`]],
      ['B:2', 'vacio', []],
      ['B:3', 'vacio', []],
      ['C:1', 'listo', [`t:${t[1]}`]],
      ['C:2', 'listo', [`t:${t[0]}`]],
      ['C:3', 'sin_resultado', []],
    ]);
    // El 3.er lugar de la C: por W.O.; y después jugado.
    const p3 = await match(lid, [pair(3), pair(2)], { event: ev, key: 'C-P3', status: 'walkover', winner: null, walkover: 2 });
    expect((await compare(prize.id, prize.slots, await phone())).at(-1)).toEqual(['C:3', 'vacio', []]);
    await db.admin(`update public.matches set status = 'confirmed', winner_side = 2, walkover_side = null where id = $1`, [p3]);
    expect((await compare(prize.id, prize.slots, await phone())).at(-1)).toEqual(['C:3', 'listo', [`t:${t[2]}`]]);
    // Final propuesta hace un rato: todavía no cuenta.
    await db.admin(`update public.matches set status = 'finished' where id = $1`, [finalC]);
    expect((await compare(prize.id, prize.slots, await phone())).slice(6)).toEqual([
      ['C:1', 'sin_resultado', []],
      ['C:2', 'sin_resultado', []],
      ['C:3', 'sin_resultado', []],
    ]);
  });

  it('relámpago y playoffs', async () => {
    const hoops = async (kind: 'liga' | 'torneo') => {
      const lid = await sportLeague('basketball', kind);
      const t: string[] = [];
      for (const k of ['A', 'B', 'C', 'D']) {
        const [{ id }] = await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [lid, `Equipo ${k}`]);
        for (const n of [1, 2]) await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $3)', [id, await player(db, lid, `${k}${n}`), lid]);
        t.push(id);
      }
      return { lid, t, x: await player(db, lid, 'Refuerzo') };
    };
    const side = (h: { t: string[] }, i: number, players: string[] = []): Side => ({ team: h.t[i], label: `Equipo ${'ABCD'[i]}`, players });
    const names = async (lid: string) => ({ nameOf: (id: string) => id, rosterOf: await rostersFromDb(lid), teamName: (id: string) => id });

    // Relámpago.
    const k = await hoops('torneo');
    const ev = await insertEvent(k.lid, 'torneo', {}, 'Copa');
    await match(k.lid, [side(k, 0), side(k, 3)], { key: 'R1-1' });
    await match(k.lid, [side(k, 1), side(k, 2)], { key: 'R1-2' });
    await match(k.lid, [side(k, 0, [k.x]), side(k, 1)], { key: 'R2-1' });
    await match(k.lid, [side(k, 3), side(k, 2)], { key: 'P3', winner: 2 });
    await match(k.lid, [side(k, 0), side(k, 2)], { key: 'R3-1', status: 'void' });
    const badge = await design(k.lid);
    const ko = (await setPrizes(k.lid, 'evento', ev, [1, 2, 3].map((place) => ({ category: 'equipo', place, badge_id: badge }))))!;
    expect(await compare(ko.id, ko.slots, teamKoProvider(await matchesFromDb(k.lid), await names(k.lid), Date.now()))).toEqual([
      ['-:1', 'listo', [`t:${k.t[0]}`]],
      ['-:2', 'listo', [`t:${k.t[1]}`]],
      ['-:3', 'listo', [`t:${k.t[2]}`]],
    ]);
    expect(teamKoFinished(await matchesFromDb(k.lid), Date.now())).toBe(true);

    // Playoff.
    const h = await hoops('liga');
    const [{ id: season }] = await db.admin<{ id: string }>(`select id from public.seasons where league_id = $1 and status = 'active'`, [h.lid]);
    const [{ id: po }] = await db.admin<{ id: string }>(
      `insert into public.playoffs (league_id, season_id, status, best_of, seeds, winner) values ($1, $2, 'finished', '{1,1}', $3, $4) returning id`,
      [h.lid, season, h.t, h.t[0]],
    );
    const series = async (round: number, slotN: number, a: string, b: string, winner: string, next: string | null) =>
      (
        await db.admin<{ id: string }>(
          `insert into public.playoff_series (playoff_id, league_id, round, slot, best_of, team_a, team_b, winner, next_series)
           values ($1, $2, $3, $4, 1, $5, $6, $7, $8) returning id`,
          [po, h.lid, round, slotN, a, b, winner, next],
        )
      )[0].id;
    const fin = await series(2, 1, h.t[0], h.t[1], h.t[0], null);
    await series(1, 1, h.t[0], h.t[3], h.t[0], fin);
    await series(1, 2, h.t[1], h.t[2], h.t[1], fin);
    await match(h.lid, [side(h, 0), side(h, 1, [h.x])], { key: 'PO2-1', series: fin });
    const b2 = await design(h.lid);
    const pz = (await setPrizes(h.lid, 'playoff', po, [1, 2, 3].map((place) => ({ category: 'equipo', place, badge_id: b2 }))))!;
    const seriesRows = await db.admin<Json>('select * from public.playoff_series where playoff_id = $1', [po]);
    const playoff = {
      status: 'finished' as const,
      winner: h.t[0],
      series: seriesRows.map((s) => ({ id: s.id, round: s.round, slot: s.slot, teamA: s.team_a, teamB: s.team_b, winner: s.winner, bye: s.bye, nextSeries: s.next_series })),
    } as unknown as Parameters<typeof playoffProvider>[0];
    expect(await compare(pz.id, pz.slots, playoffProvider(playoff, await matchesFromDb(h.lid), await names(h.lid)))).toEqual([
      ['-:1', 'listo', [`t:${h.t[0]}`]],
      ['-:2', 'listo', [`t:${h.t[1]}`]],
      ['-:3', 'listo', [`t:${h.t[2]}`, `t:${h.t[3]}`].sort()],
    ]);
    await db.admin(`update public.playoffs set status = 'active' where id = $1`, [po]);
    await compare(pz.id, pz.slots, playoffProvider({ ...playoff, status: 'active' }, await matchesFromDb(h.lid), await names(h.lid)));
  });
});
