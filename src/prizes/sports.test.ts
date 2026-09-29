import { describe, expect, it } from 'vitest';
import { DEMO_COURSE, DEMO_PARS } from '../sports/golf/demo';
import { placeResults, type SwimResult } from '../sports/swimming/results';
import type { StandingRow } from '../sports/types';
import type { GolfCardDoc, GolfRoundFull } from '../lib/data/golf';
import type { PrizeSlot, TournamentPodium, TournamentPrize } from '../lib/data/prizes';
import { initialPicks, payloadOf, planDelivery, planNotes } from './award';
import { cardModel } from './card';
import { prizeCategories } from './catalog';
import {
  golfComp,
  golfPrizeBoard,
  golfProvider,
  koEventOf,
  nightProvider,
  playoffComp,
  playoffDate,
  playoffProvider,
  racketNightComp,
  racketPrizeDoubles,
  racketTourneyComp,
  racketTourneyPlace,
  racketTourneyProvider,
  swimComp,
  swimProvider,
  teamKoComp,
  teamKoFinished,
  teamKoProvider,
} from './sports';

const brief = (p: { status: string; units: { ref: string; players: { id: string }[] }[] } | null) =>
  p ? [p.status, p.units.map((u) => `${u.ref}[${u.players.map((x) => x.id).join(',')}]`)] : null;
const slot = (category: 'equipo' | 'individual' | 'pareja', division: string, place: 1 | 2 | 3) => ({ category, division, place });

describe('las competencias de cada deporte', () => {
  const ev = { id: 'e1', name: '', date: '2026-10-12' };
  const cats = (c: Parameters<typeof prizeCategories>[0] | null) => (c ? prizeCategories(c).map((x) => [x.category, x.division, x.label, x.title]) : null);

  it('dobles o singles como prize_racket_doubles: el pádel siempre; si no, lo que diga la liga, y sin eso el deporte', () => {
    expect(racketPrizeDoubles('padel', { match: { doubles: false } })).toBe(true);
    expect(racketPrizeDoubles('tennis', {})).toBe(false);
    expect(racketPrizeDoubles('tennis', { match: { doubles: true } })).toBe(true);
    expect(racketPrizeDoubles('pickleball', null)).toBe(true);
    expect(racketPrizeDoubles('pickleball', { match: { doubles: false } })).toBe(false);
    expect(racketPrizeDoubles('pickleball', { match: { doubles: 'no' } })).toBe(true);
  });

  it('raqueta: el torneo por categorías (parejas en dobles, individual en singles) y las noches', () => {
    const categories = [
      { id: 'A', name: 'Categoría A' },
      { id: 'B', name: '  Damas   Open  ' },
    ];
    const padel = racketTourneyComp('l', { ...ev, name: 'Open de Pádel' }, { sport: 'padel', leagueRules: {}, categories });
    expect(padel).toMatchObject({ scope: 'evento', refId: 'e1', kind: 'racket_tourney', sport: 'padel', name: 'Open de Pádel', date: '2026-10-12' });
    expect(cats(padel)).toEqual([
      ['pareja', 'A', 'Categoría A', 'Parejas · Categoría A'],
      ['pareja', 'B', 'Damas Open', 'Parejas · Damas Open'],
    ]);
    expect(cats(racketTourneyComp('l', ev, { sport: 'tennis', leagueRules: {}, categories }))?.map((c) => c[3])).toEqual(['Individual · Categoría A', 'Individual · Damas Open']);
    expect(racketTourneyComp('l', ev, { sport: 'tennis', leagueRules: {}, categories }).name).toMatch(/^Torneo del 12/);
    expect(cats(racketNightComp('l', ev, 'padel'))).toEqual([['individual', '', '', 'Individual']]);
    expect(racketNightComp('l', ev, 'pickleball')?.name).toMatch(/^Noche del 12/);
    // El tenis no tiene noches.
    expect(racketNightComp('l', ev, 'tennis')).toBeNull();
  });

  it('equipos: el relámpago solo en un torneo suelto (con su evento) y los playoffs', () => {
    const ko = teamKoComp('l', { kind: 'torneo', sport: 'football', event: ev, leagueName: 'Copa del Barrio' });
    expect(ko).toMatchObject({ scope: 'evento', refId: 'e1', kind: 'team_ko', name: 'Copa del Barrio' });
    expect(cats(ko)).toEqual([['equipo', '', '', 'Equipos']]);
    expect(teamKoComp('l', { kind: 'liga', sport: 'football', event: ev, leagueName: 'Liga' })).toBeNull();
    expect(teamKoComp('l', { kind: 'torneo', sport: 'football', event: null, leagueName: 'Copa' })).toBeNull();
    // El evento del relámpago es uno solo (como la base): el primero de tipo torneo por creación, entre por donde se entre.
    const at = (iso: string | null) => (iso ? { toMillis: () => Date.parse(iso) } : null);
    const events = [
      { id: 'b', type: 'torneo', createdAt: at('2026-10-02T00:00:00Z') },
      { id: 'j', type: 'jornada', createdAt: at('2026-09-01T00:00:00Z') },
      { id: 'a', type: 'torneo', createdAt: at('2026-10-01T00:00:00Z') },
      { id: 'c', type: 'torneo', createdAt: null },
    ];
    expect(koEventOf(events)?.id).toBe('a');
    expect(koEventOf(events.filter((e) => e.type !== 'torneo'))).toBeNull();
    // La cinta del playoff: el mes de su último juego con hora (en la zona de la liga); sin juegos, hoy.
    const series = { series: [{ id: 's1' }, { id: 's2' }] } as Parameters<typeof playoffDate>[0];
    const games = [
      { seriesId: 's1', scheduledAt: '2026-10-30T23:00:00Z', status: 'confirmed' },
      { seriesId: 's2', scheduledAt: '2026-11-02T03:30:00Z', status: 'confirmed' },
      { seriesId: 's2', scheduledAt: '2026-12-01T20:00:00Z', status: 'void' },
      { seriesId: null, scheduledAt: '2027-01-01T20:00:00Z', status: 'confirmed' },
    ];
    expect(playoffDate(series, games, 'America/Santo_Domingo', Date.parse('2027-02-01T12:00:00Z'))).toBe('2026-11-01');
    expect(playoffDate(series, [], 'America/Santo_Domingo', Date.parse('2027-02-01T12:00:00Z'))).toBe('2027-02-01');
    const po = playoffComp('l', { id: 'po', name: 'Playoffs 2026' }, 'basketball', '2026-11-02');
    expect(po).toMatchObject({ scope: 'playoff', refId: 'po', kind: 'playoff', name: 'Playoffs 2026', date: '2026-11-02' });
    expect(cats(po)).toEqual([['equipo', '', '', 'Equipos']]);
  });

  it('golf: la ronda suelta es su evento; la de un torneo, el torneo entero', () => {
    const round = golfComp('l', { eventId: 'e1', tournamentId: null, name: '', date: '2026-10-12' });
    expect(round).toMatchObject({ scope: 'evento', refId: 'e1', kind: 'golf' });
    expect(round.name).toMatch(/^Ronda del 12/);
    expect(golfComp('l', { eventId: 'e1', tournamentId: 't', name: 'Abierto', date: '2026-10-12' })).toMatchObject({ scope: 'golf_torneo', refId: 't', name: 'Abierto' });
    expect(cats(round)).toEqual([
      ['individual', '', '', 'Individual'],
      ['individual', 'gross', 'Gross', 'Individual · Gross'],
      ['individual', 'neto', 'Neto', 'Individual · Neto'],
    ]);
  });

  it('natación: clubes e individual (todos, femenino y masculino); el control de marcas no tiene premios', () => {
    const meet = swimComp('l', { id: 'm', type: 'encuentro', name: 'Copa Delfín', date: '2026-10-12' });
    expect(meet).toMatchObject({ scope: 'evento', refId: 'm', kind: 'swim', sport: 'swimming' });
    expect(cats(meet)).toEqual([
      ['equipo', '', '', 'Clubes'],
      ['individual', '', '', 'Individual'],
      ['individual', 'F', 'Femenino', 'Individual · Femenino'],
      ['individual', 'M', 'Masculino', 'Individual · Masculino'],
    ]);
    expect(swimComp('l', { id: 'm', type: 'control', name: '', date: '2026-10-12' })).toBeNull();
  });
});

// ---------- Golf ----------

const round = (eventId: string, extra: Partial<GolfRoundFull> = {}): GolfRoundFull => ({
  eventId,
  courseId: 'demo',
  courseName: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: { format: 'stroke', basis: 'net', allowance: 95 },
  shotgun: false,
  tournamentId: null,
  roundNo: null,
  closed: true,
  closedAt: null,
  course: DEMO_COURSE,
  ...extra,
});

const card = (eventId: string, playerId: string, strokes: (number | null)[], extra: Partial<GolfCardDoc> = {}): GolfCardDoc => ({
  id: `${eventId}-${playerId}`,
  eventId,
  playerId,
  teeId: 'azul',
  hcpIndex: 0,
  courseHcp: 0,
  playingHcp: 0,
  groupNo: 1,
  startHole: 1,
  strokes,
  putts: strokes.map(() => null),
  pickedUp: strokes.map(() => false),
  signed: true,
  signedAt: null,
  scoredAt: '2026-10-12T14:00:00Z',
  dq: false,
  ...extra,
});

/** Golpes por hoyo: el par más `delta` en los hoyos que diga. */
const pars = (delta: (i: number) => number = () => 0) => DEMO_PARS.map((p, i) => p + delta(i));
const nameOf = (id: string) => id.toUpperCase();

describe('golf', () => {
  // Neto: ana +2 bruto con 4 de handicap (−2 neto); beto par sin handicap (E); caro −1 bruto (−1 neto); dani DQ.
  const r = round('r');
  const cards = [
    card('r', 'ana', pars((i) => (i < 2 ? 1 : 0)), { playingHcp: 4 }),
    card('r', 'beto', pars()),
    card('r', 'caro', pars((i) => (i === 0 ? -1 : 0))),
    card('r', 'dani', pars((i) => (i === 0 ? -2 : 0)), { dq: true }),
  ];

  it('oficial (neto), gross y neto de una ronda suelta; el descalificado no entra', () => {
    const golf = golfProvider({ rounds: [r], cards }, nameOf);
    expect(brief(golf(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]']]);
    expect(brief(golf(slot('individual', 'neto', 2)))).toEqual(['listo', ['p:caro[caro]']]);
    // Gross: caro −1, beto E, ana +2 (dani, aunque hizo −2, está descalificado).
    expect(brief(golf(slot('individual', 'gross', 1)))).toEqual(['listo', ['p:caro[caro]']]);
    expect(brief(golf(slot('individual', 'gross', 3)))).toEqual(['listo', ['p:ana[ana]']]);
    expect(golfPrizeBoard({ rounds: [r], cards }, 'gross').find((x) => x.id === 'dani')?.rank).toBeNull();
    expect(golf(slot('individual', '', 1))!.units[0]).toEqual({ ref: 'p:ana', name: 'ANA', teamId: null, players: [{ id: 'ana', name: 'ANA' }] });
  });

  it('solo cuentan las tarjetas de esa ronda', () => {
    const other = card('otra', 'zoe', pars((i) => (i < 5 ? -1 : 0)));
    expect(golfPrizeBoard({ rounds: [r], cards: [...cards, other] }, '').map((x) => x.id)).not.toContain('zoe');
  });

  it('torneo de varias rondas: la suma con la competencia de la 1.ª ronda; quien faltó a una ronda no entra', () => {
    const gross = { format: 'stroke' as const, basis: 'gross' as const, allowance: 100 };
    const r1 = round('r1', { tournamentId: 't', roundNo: 1, competition: gross });
    const r2 = round('r2', { tournamentId: 't', roundNo: 2, competition: { format: 'stableford', basis: 'net' } });
    const tc = [
      card('r1', 'ana', pars((i) => (i === 0 ? -1 : 0))),
      card('r2', 'ana', pars((i) => (i === 0 ? 1 : 0))),
      card('r1', 'beto', pars()),
      card('r2', 'beto', pars((i) => (i === 0 ? 1 : 0))),
      // caro ganó la ronda 1 pero no jugó la 2.
      card('r1', 'caro', pars((i) => (i < 3 ? -1 : 0))),
    ];
    const golf = golfProvider({ rounds: [r2, r1], cards: tc }, nameOf);
    expect(brief(golf(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]']]);
    expect(brief(golf(slot('individual', '', 2)))).toEqual(['listo', ['p:beto[beto]']]);
    expect(golf(slot('individual', '', 3))?.status).toBe('vacio');
    // Un torneo de una sola ronda también suma como torneo (no hay premio de ronda suelta dentro de un torneo).
    expect(golfPrizeBoard({ rounds: [r1], cards: tc }, '').map((x) => [x.id, x.rank])).toEqual([
      ['caro', 1],
      ['ana', 2],
      ['beto', 3],
    ]);
  });

  it('empate que el countback no rompe: se la llevan los dos', () => {
    const tied = [card('r', 'ana', pars()), card('r', 'beto', pars()), card('r', 'caro', pars((i) => (i === 0 ? 1 : 0)))];
    const golf = golfProvider({ rounds: [round('r', { competition: { format: 'stroke', basis: 'gross' } })], cards: tied }, nameOf);
    expect(brief(golf(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]', 'p:beto[beto]']]);
    expect(golf(slot('individual', '', 2))?.status).toBe('vacio');
  });

  it('más de 3 empatados no se entrega sola; sin rondas, sin resultado; otra categoría, el teléfono no sabe', () => {
    const four = ['ana', 'beto', 'caro', 'dani'].map((id) => card('r', id, pars()));
    const src = { rounds: [round('r', { competition: { format: 'stroke', basis: 'gross' } })], cards: four };
    expect(golfProvider(src, nameOf)(slot('individual', '', 1))?.status).toBe('empate_multiple');
    expect(golfProvider({ rounds: [], cards }, nameOf)(slot('individual', '', 1))?.status).toBe('sin_resultado');
    expect(golfProvider({ rounds: [r], cards }, nameOf)(slot('equipo', '', 1))).toBeNull();
    expect(golfProvider({ rounds: [r], cards }, nameOf)(slot('individual', 'F', 1))).toBeNull();
  });
});

// ---------- Natación ----------

describe('natación', () => {
  const s = (swimmerId: string, teamId: string | null, time: number | null, over: Partial<SwimResult> = {}): SwimResult => ({
    entryId: `${swimmerId}-${time}`,
    swimmerId,
    teamId,
    gender: 'F',
    ageGroup: null,
    time,
    status: 'ok',
    ...over,
  });
  const placed = [
    // 50 libre F: ana (Delfines) 6, bea (Tiburones) 4, eva (Delfines) 3.
    ...placeResults([s('ana', 'del', 3000), s('bea', 'tib', 3100), s('eva', 'del', 3200)]),
    // 50 libre M: luis (Tiburones) 6, juan (Delfines) 4; pepe (Tiburones) DQ.
    ...placeResults([s('luis', 'tib', 2900, { gender: 'M' }), s('juan', 'del', 3000, { gender: 'M' }), s('pepe', 'tib', 2800, { gender: 'M', status: 'dq' })]),
    // 100 libre F: bea 6, ana 4.
    ...placeResults([s('bea', 'tib', 7000), s('ana', 'del', 7100)]),
  ];
  const names = { swimmer: (id: string) => id.toUpperCase(), club: (id: string) => (id === 'del' ? 'Delfines' : 'Tiburones') };
  const swim = swimProvider(placed, names);

  it('clubes: por teamPoints, y la unidad lleva a los nadadores del club que nadaron (el DQ no)', () => {
    // Delfines 6 + 3 + 4 + 4 = 17; Tiburones 4 + 6 + 6 = 16.
    const first = swim(slot('equipo', '', 1));
    expect(brief(first)).toEqual(['listo', ['c:del[ana,eva,juan]']]);
    expect(first!.units[0]).toMatchObject({ name: 'Delfines', teamId: null, detail: '17 puntos' });
    expect(brief(swim(slot('equipo', '', 2)))).toEqual(['listo', ['c:tib[bea,luis]']]);
    expect(swim(slot('equipo', '', 3))?.status).toBe('vacio');
  });

  it('un club que solo tuvo descalificados no entra (no hay a quién darle)', () => {
    const rows = [...placed, ...placeResults([s('zoe', 'orcas', 2500, { status: 'dq' })])];
    expect(swimProvider(rows, names)(slot('equipo', '', 3))?.status).toBe('vacio');
  });

  it('nadador del encuentro: todos, femenino y masculino', () => {
    // ana 10 (1 oro, 1 plata), bea 10 (1 oro, 1 plata): comparten el 1.º; luis 6; juan 4; eva 3.
    expect(brief(swim(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]', 'p:bea[bea]']]);
    expect(swim(slot('individual', '', 2))?.status).toBe('vacio');
    expect(brief(swim(slot('individual', '', 3)))).toEqual(['listo', ['p:luis[luis]']]);
    expect(brief(swim(slot('individual', 'F', 3)))).toEqual(['listo', ['p:eva[eva]']]);
    expect(brief(swim(slot('individual', 'M', 1)))).toEqual(['listo', ['p:luis[luis]']]);
    expect(brief(swim(slot('individual', 'M', 2)))).toEqual(['listo', ['p:juan[juan]']]);
    // pepe solo tiene un DQ: no entra.
    expect(swim(slot('individual', 'M', 3))?.status).toBe('vacio');
  });

  it('sin tiempos todavía: sin resultado; otra categoría: el teléfono no sabe', () => {
    const none = swimProvider([], names);
    expect(none(slot('individual', '', 1))?.status).toBe('sin_resultado');
    expect(none(slot('equipo', '', 1))?.status).toBe('sin_resultado');
    expect(swim(slot('pareja', '', 1))).toBeNull();
    expect(swim(slot('equipo', 'F', 1))).toBeNull();
  });
});

// ---------- Noches ----------

describe('noches de raqueta', () => {
  const row = (id: string, rank: number, played: number): StandingRow => ({
    id,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    for: 0,
    against: 0,
    diff: 0,
    extra: {},
    rank,
  });

  it('los 3 primeros que jugaron; empates comparten el lugar', () => {
    const night = nightProvider([row('ana', 1, 5), row('beto', 2, 5), row('caro', 2, 4), row('dani', 4, 5), row('eli', 5, 0)], nameOf);
    expect(brief(night(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]']]);
    expect(brief(night(slot('individual', '', 2)))).toEqual(['listo', ['p:beto[beto]', 'p:caro[caro]']]);
    expect(night(slot('individual', '', 3))?.status).toBe('vacio');
  });

  it('quien no jugó ningún partido que cuente no entra aunque la tabla le dé puesto', () => {
    expect(nightProvider([row('ana', 1, 0), row('beto', 1, 0)], nameOf)(slot('individual', '', 1))?.status).toBe('sin_resultado');
    expect(brief(nightProvider([row('ana', 1, 2), row('beto', 1, 0)], nameOf)(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]']]);
    expect(nightProvider([row('ana', 1, 2)], nameOf)(slot('pareja', 'A', 1))).toBeNull();
  });

  it('quien solo descansó no deja vacío el lugar: sube el siguiente y los empates se respetan', () => {
    const night = nightProvider([row('eli', 1, 0), row('ana', 2, 4), row('beto', 3, 4), row('caro', 3, 4), row('dani', 5, 4)], nameOf);
    expect(brief(night(slot('individual', '', 1)))).toEqual(['listo', ['p:ana[ana]']]);
    expect(brief(night(slot('individual', '', 2)))).toEqual(['listo', ['p:beto[beto]', 'p:caro[caro]']]);
    expect(night(slot('individual', '', 3))?.status).toBe('vacio');
  });
});

// ---------- Cuadros (para la tarjeta: la misma cuenta del servidor) ----------

type M = Parameters<typeof racketTourneyPlace>[2][number];

/** Un partido ya jugado (por defecto confirmado y lo ganó el lado 1). */
const m = (
  id: string,
  key: string,
  sides: [{ team?: string | null; label?: string; players?: string[] }, { team?: string | null; label?: string; players?: string[] }],
  o: { status?: M['status']; winner?: 1 | 2 | null; walkover?: 0 | 1 | 2 | null; proposedAt?: string | null; series?: string | null } = {},
): M => ({
  id,
  bracketKey: key,
  status: o.status ?? 'confirmed',
  winner: o.winner === undefined ? 1 : o.winner,
  walkoverSide: o.walkover ?? null,
  proposedAt: o.proposedAt ?? null,
  seriesId: o.series ?? null,
  sides: sides.map((s, i) => ({
    side: (i + 1) as 1 | 2,
    teamId: s.team ?? null,
    label: s.label ?? (s.team ? `Pareja ${s.team}` : ''),
    seed: null,
    players: (s.players ?? []).map((playerId) => ({ playerId, side: (i + 1) as 1 | 2, position: null, jersey: null, sub: false })),
  })) as M['sides'],
});

const NOW = Date.parse('2026-10-12T12:00:00Z');
const rosters: Record<string, string[]> = { t1: ['a1', 'a2'], t2: ['b1', 'b2'], t3: ['c1', 'c2'], t4: ['d1', 'd2'] };
const names = { nameOf, rosterOf: (t: string) => rosters[t] ?? [], teamName: (t: string) => `Equipo ${t}` };
const refs = (r: { status: string; units: { ref: string }[] } | null) => (r ? [r.status, r.units.map((u) => u.ref).sort()] : null);

describe('raqueta: el cuadro de cada categoría (private.prize_racket_place)', () => {
  const cat = { id: 'A', seeds: ['t1', 't2', 't3', 't4'], thirdPlace: false };
  const semis = [m('s1', 'A-R1-1', [{ team: 't1' }, { team: 't4' }]), m('s2', 'A-R1-2', [{ team: 't2' }, { team: 't3' }], { winner: 2 })];

  it('final normal: campeón, subcampeón y, sin partido por el 3.º, los dos semifinalistas', () => {
    const racket = racketTourneyProvider([cat], [...semis, m('f', 'A-R2-1', [{ team: 't1' }, { team: 't3' }], { winner: 2 })], names, NOW);
    expect(refs(racket(slot('pareja', 'A', 1)))).toEqual(['listo', ['t:t3']]);
    expect(refs(racket(slot('pareja', 'A', 2)))).toEqual(['listo', ['t:t1']]);
    expect(refs(racket(slot('pareja', 'A', 3)))).toEqual(['listo', ['t:t2', 't:t4']]);
    // La unidad lleva a los de la plantilla si el partido no tiene jugadores.
    expect(racket(slot('pareja', 'A', 1))!.units[0].players.map((p) => p.id)).toEqual(['c1', 'c2']);
    expect(racket(slot('pareja', 'B', 1))).toBeNull();
    expect(racket(slot('equipo', 'A', 1))).toBeNull();
  });

  it('final por W.O. (2.º vacío), final sin confirmar (sin resultado) y partido por el 3.º', () => {
    const wo = racketTourneyProvider([cat], [...semis, m('f', 'A-R2-1', [{ team: 't1' }, { team: 't3' }], { status: 'walkover', winner: null, walkover: 2 })], names, NOW);
    expect(refs(wo(slot('pareja', 'A', 1)))).toEqual(['listo', ['t:t1']]);
    expect(refs(wo(slot('pareja', 'A', 2)))).toEqual(['vacio', []]);
    const proposed = m('f', 'A-R2-1', [{ team: 't1' }, { team: 't3' }], { status: 'finished', proposedAt: new Date(NOW - 3600_000).toISOString() });
    expect(racketTourneyProvider([cat], [...semis, proposed], names, NOW)(slot('pareja', 'A', 1))?.status).toBe('sin_resultado');
    // A las 48 h cuenta sola.
    expect(refs(racketTourneyProvider([cat], [...semis, proposed], names, NOW + 48 * 3600_000)(slot('pareja', 'A', 1)))).toEqual(['listo', ['t:t1']]);
    const withP3 = { ...cat, thirdPlace: true };
    const final = m('f', 'A-R2-1', [{ team: 't1' }, { team: 't3' }]);
    expect(racketTourneyProvider([withP3], [...semis, final], names, NOW)(slot('pareja', 'A', 3))?.status).toBe('sin_resultado');
    const p3 = m('p3', 'A-P3', [{ team: 't4' }, { team: 't2' }], { winner: 2 });
    expect(refs(racketTourneyProvider([withP3], [...semis, final, p3], names, NOW)(slot('pareja', 'A', 3)))).toEqual(['listo', ['t:t2']]);
    // Un partido anulado no cuenta.
    expect(racketTourneyProvider([cat], [...semis, { ...final, status: 'void' }], names, NOW)(slot('pareja', 'A', 1))?.status).toBe('sin_resultado');
  });

  it('singles y lados sin pareja: p:<jugador> con uno solo, s:<partido>:<lado> con varios', () => {
    const singles = racketTourneyProvider([{ id: 'B', seeds: ['x', 'y'] }], [m('fb', 'B-R1-1', [{ players: ['x'] }, { players: ['y'] }], { winner: 2 })], names, NOW);
    expect(refs(singles(slot('individual', 'B', 1)))).toEqual(['listo', ['p:y']]);
    expect(singles(slot('individual', 'B', 1))!.units[0].name).toBe('Y');
    const loose = racketTourneyProvider([{ id: 'C', seeds: ['x', 'y'] }], [m('fc', 'C-R1-1', [{ players: ['e', 'f'], label: 'Eva / Fede' }, { players: ['g', 'h'] }])], names, NOW);
    expect(refs(loose(slot('pareja', 'C', 1)))).toEqual(['listo', ['s:fc:1']]);
    expect(loose(slot('pareja', 'C', 3))?.status).toBe('vacio');
    expect(racketTourneyProvider([{ id: 'D', seeds: ['x'] }], [], names, NOW)(slot('pareja', 'D', 1))?.status).toBe('sin_resultado');
  });
});

describe('equipos: relámpago y playoffs (private.prize_team_ko_place y prize_playoff_place)', () => {
  const ko = [
    m('r1', 'R1-1', [{ team: 't1' }, { team: 't4' }]),
    m('r2', 'R1-2', [{ team: 't2' }, { team: 't3' }]),
    m('f', 'R2-1', [{ team: 't1', players: ['a1', 'x'] }, { team: 't2', players: ['b1'] }]),
    m('p3', 'P3', [{ team: 't4' }, { team: 't3' }], { winner: 2 }),
    m('v', 'R3-1', [{ team: 't1' }, { team: 't3' }], { status: 'void' }),
  ];

  it('relámpago: campeón (con el refuerzo que jugó), subcampeón y 3.º; sin P3 vacío; final sin contar, sin resultado', () => {
    const tk = teamKoProvider(ko, names, NOW);
    expect(refs(tk(slot('equipo', '', 1)))).toEqual(['listo', ['t:t1']]);
    expect(tk(slot('equipo', '', 1))!.units[0]).toMatchObject({ name: 'Equipo t1', teamId: 't1' });
    expect(tk(slot('equipo', '', 1))!.units[0].players.map((p) => p.id).sort()).toEqual(['a1', 'a2', 'x']);
    expect(refs(tk(slot('equipo', '', 2)))).toEqual(['listo', ['t:t2']]);
    expect(refs(tk(slot('equipo', '', 3)))).toEqual(['listo', ['t:t3']]);
    expect(teamKoProvider(ko.filter((x) => x.id !== 'p3'), names, NOW)(slot('equipo', '', 3))?.status).toBe('vacio');
    const pending = ko.map((x) => (x.id === 'f' ? { ...x, status: 'finished' as const, proposedAt: new Date(NOW).toISOString() } : x));
    expect(teamKoProvider(pending, names, NOW)(slot('equipo', '', 1))?.status).toBe('sin_resultado');
    expect(teamKoFinished(ko, NOW)).toBe(true);
    expect(teamKoFinished(pending, NOW)).toBe(false);
    // Los juegos de un playoff no cuentan.
    expect(teamKoFinished(ko.map((x) => ({ ...x, seriesId: 'serie' })), NOW)).toBe(false);
    expect(tk(slot('individual', '', 1))).toBeNull();
  });

  it('playoff: campeón, subcampeón y los dos semifinalistas; activo, sin resultado', () => {
    const series = (id: string, round: number, slotN: number, a: string, b: string, winner: string | null, next: string | null, bye = false) => ({
      id,
      playoffId: 'po',
      round,
      slot: slotN,
      bestOf: 1,
      teamA: a,
      teamB: b,
      seedA: null,
      seedB: null,
      labelA: null,
      labelB: null,
      winsA: 0,
      winsB: 0,
      winner,
      bye,
      nextSeries: next,
      nextSide: null,
    });
    const po = {
      status: 'finished' as const,
      winner: 't1',
      series: [series('fin', 2, 1, 't1', 't2', 't1', null), series('s1', 1, 1, 't1', 't4', 't1', 'fin'), series('s2', 1, 2, 't2', 't3', 't2', 'fin')],
    };
    const games = [m('g', 'PO2-1', [{ team: 't1', players: ['a1'] }, { team: 't2', players: ['b1', 'x'] }], { series: 'fin' })];
    const pp = playoffProvider(po, games, names);
    expect(refs(pp(slot('equipo', '', 1)))).toEqual(['listo', ['t:t1']]);
    expect(refs(pp(slot('equipo', '', 2)))).toEqual(['listo', ['t:t2']]);
    expect(pp(slot('equipo', '', 2))!.units[0].players.map((p) => p.id).sort()).toEqual(['b1', 'b2', 'x']);
    expect(refs(pp(slot('equipo', '', 3)))).toEqual(['listo', ['t:t3', 't:t4']]);
    expect(playoffProvider({ ...po, status: 'active' }, games, names)(slot('equipo', '', 1))?.status).toBe('sin_resultado');
  });
});

// ---------- Con la tarjeta y la entrega de todos los deportes (card.ts y award.ts) ----------

describe('con la tarjeta y «Entregar premios»', () => {
  const pslot = (id: string, category: PrizeSlot['category'], division: string, place: 1 | 2 | 3, over: Partial<PrizeSlot> = {}): PrizeSlot => ({
    id,
    category,
    division,
    label: '',
    place,
    badgeId: 'B1',
    title: '',
    winners: [],
    verified: false,
    deliveredAt: null,
    deliveredBy: null,
    editableUntil: null,
    updatedAt: '',
    ...over,
  });
  const prizeOf = (slots: PrizeSlot[]): TournamentPrize => ({
    id: 'Z1',
    leagueId: 'L1',
    scope: 'evento',
    refId: 'E1',
    period: 'OCT 2026',
    closedAt: null,
    closedBy: null,
    createdAt: '',
    updatedAt: '',
    slots,
  });
  /** Lo que responde tournament_podium donde el orden lo arma el teléfono. */
  const phoneServer = (slots: PrizeSlot[], finished: boolean): TournamentPodium => ({
    prizeId: 'Z1',
    kind: 'swim',
    verified: false,
    slots: slots.map((s) => ({ slotId: s.id, verified: false, status: 'telefono', finished, units: [], holders: [], withdrawn: [] })),
  });
  const sw = (swimmerId: string, teamId: string, time: number, gender: 'F' | 'M' = 'F'): SwimResult => ({ entryId: `${swimmerId}-${time}`, swimmerId, teamId, gender, ageGroup: null, time, status: 'ok' });
  const placed = [
    ...placeResults([sw('ana', 'del', 3000), sw('bea', 'tib', 3100)]),
    ...placeResults([sw('luis', 'tib', 2900, 'M'), sw('juan', 'del', 3000, 'M')]),
  ];
  const swimNames = { swimmer: (id: string) => id.toUpperCase(), club: (id: string) => (id === 'del' ? 'Delfines' : 'Tiburones') };
  const meet = swimComp('L1', { id: 'E1', type: 'encuentro', name: 'Copa Delfín', date: '2026-10-12' })!;

  it('natación: el podio del teléfono se entrega; quien está en el podio (aquí, en su club) no se lo entrega', () => {
    const slots = [pslot('S1', 'equipo', '', 1), pslot('S2', 'individual', 'F', 1), pslot('S3', 'individual', 'M', 1)];
    const plans = planDelivery(prizeOf(slots), phoneServer(slots, true), { comp: meet, phone: swimProvider(placed, swimNames), myPlayers: ['juan'] });
    // Delfines 6 + 4 = 10, Tiburones 4 + 6 = 10: comparten el 1.º.
    expect(plans.map((p) => [p.title, p.status, p.units.map((u) => u.ref), p.selfBlocked, p.deliverable])).toEqual([
      ['Clubes', 'listo', ['c:del', 'c:tib'], true, false],
      ['Individual · Femenino', 'listo', ['p:ana'], false, true],
      ['Individual · Masculino', 'listo', ['p:luis'], false, true],
    ]);
    expect(payloadOf(plans, initialPicks(plans))).toEqual([
      { slotId: 'S2', units: [{ ref: 'p:ana', players: ['ana'] }] },
      { slotId: 'S3', units: [{ ref: 'p:luis', players: ['luis'] }] },
    ]);
    // Encuentro sin finalizar: nada se entrega todavía.
    const open = planDelivery(prizeOf(slots), phoneServer(slots, false), { comp: meet, phone: swimProvider(placed, swimNames) });
    expect(open.every((p) => !p.deliverable)).toBe(true);
    expect(planNotes(open[1], open)).toEqual([{ tone: 'info', text: 'Todavía sin resultado final.' }]);
  });

  it('la tarjeta: «Por ahora» con el podio del teléfono y el aviso «El podio cambió» después de entregar', () => {
    const slots = [pslot('S2', 'individual', 'F', 1)];
    const before = cardModel(meet, prizeOf(slots), [], { podium: swimProvider(placed, swimNames), admin: true });
    expect(before.sections.map((s) => s.title)).toEqual(['Individual · Femenino']);
    expect(before.sections[0].rows[0].current?.units.map((u) => [u.ref, u.detail])).toEqual([['p:ana', '6 puntos']]);
    const given = [pslot('S2', 'individual', 'F', 1, { deliveredAt: '2026-10-12T20:00:00Z', winners: [{ ref: 'p:bea', name: 'BEA', teamId: null, players: ['bea'] }] })];
    expect(cardModel(meet, prizeOf(given), [], { podium: swimProvider(placed, swimNames), admin: true }).podiumChanged).toBe(true);
    const same = [pslot('S2', 'individual', 'F', 1, { deliveredAt: '2026-10-12T20:00:00Z', winners: [{ ref: 'p:ana', name: 'ANA', teamId: null, players: ['ana'] }] })];
    expect(cardModel(meet, prizeOf(same), [], { podium: swimProvider(placed, swimNames), admin: true }).podiumChanged).toBe(false);
  });

  it('relámpago: el servidor manda el podio; la tarjeta compara lo entregado con la final de la pantalla', () => {
    const ko = teamKoComp('L1', { kind: 'torneo', sport: 'basketball', event: { id: 'E1', name: 'Copa', date: '2026-10-12' }, leagueName: 'Copa' })!;
    const final = m('f', 'R1-1', [{ team: 't1' }, { team: 't2' }], { winner: 2 });
    const given = [pslot('S1', 'equipo', '', 1, { deliveredAt: '2026-10-12T20:00:00Z', verified: true, winners: [{ ref: 't:t1', name: 'Equipo t1', teamId: 't1', players: ['a1', 'a2'] }] })];
    const card = cardModel(ko, prizeOf(given), [], { podium: teamKoProvider([final], names, NOW), admin: true });
    expect(card.sections.map((s) => s.title)).toEqual(['Equipos']);
    expect(card.podiumChanged).toBe(true);
    // El podio del servidor manda en la entrega (el del teléfono no se usa: no hay 'telefono').
    const server: TournamentPodium = {
      prizeId: 'Z1',
      kind: 'team_ko',
      verified: true,
      slots: [{ slotId: 'S1', verified: true, status: 'listo', finished: true, units: [teamKoProvider([final], names, NOW)(slot('equipo', '', 1))!.units[0]], holders: [], withdrawn: [] }],
    };
    const plans = planDelivery(prizeOf([pslot('S1', 'equipo', '', 1)]), server, { comp: ko, phone: teamKoProvider([final], names, NOW), myPlayers: ['b1'] });
    // Con el orden comprobado por el servidor, quien ganó se entrega su premio.
    expect(plans.map((p) => [p.status, p.units.map((u) => u.ref), p.selfBlocked, p.deliverable])).toEqual([['listo', ['t:t2'], false, true]]);
  });
});
