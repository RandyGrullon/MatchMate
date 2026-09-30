import { describe, expect, it } from 'vitest';
import { applyRacket, initRacket, resolveRules } from '../../../../sports/racket';
import { racketColumns } from '../bits';
import { racketScore } from '../court/adapters';
import { forLabel, inSeason, pairStandings, playerRecord, pointsRule, racketResultOf, seasonDay, seasonNightTable, seasonPlayerTable, setsLabel, winPct } from './results';
import { mkMatch, pts, sets } from './testMatch';

const RULES = { match: { sport: 'padel' } };
const NOW = Date.parse('2026-10-20T00:00:00Z');

describe('del partido de la base al resultado de la tabla', () => {
  it('con los totales guardados (lo que escriben el modo cancha y «solo resultado»)', () => {
    const m = sets('A', 'B', '6-4 3-6 10-7', 1, { sets: [2, 1], games: [10, 10] });
    expect(racketResultOf(m, 'padel')).toEqual({ id: m.id, side1: 'A', side2: 'B', winner: 1, totals: { sets: [2, 1], games: [10, 10] } });
  });

  it('solo con el texto: se lee con las reglas (el súper tie-break cuenta como un juego)', () => {
    const m = mkMatch({ teams: ['A', 'B'], status: 'confirmed', winner: 1, score: { text: '6-4 3-6 10-7', sides: [2, 1] } });
    expect(racketResultOf(m, 'padel', RULES)?.totals).toMatchObject({ sets: [2, 1], games: [10, 10] });
  });

  it('retiro: se completa el set a favor del ganador (y el súper tie-break que falta)', () => {
    const m = mkMatch({ teams: ['A', 'B'], status: 'confirmed', winner: 2, score: { text: '6-4 2-3 ret.' } });
    // 6-4 2-6 y súper tie-break 0-10 (cuenta como un juego): sets 1-2, juegos 8-11.
    expect(racketResultOf(m, 'padel', RULES)?.totals).toMatchObject({ sets: [1, 2], games: [8, 11] });
  });

  it('W.O.: 6-0 6-0 para el que vino; W.O. de los dos no cuenta', () => {
    const wo = mkMatch({ teams: ['A', 'B'], status: 'walkover', walkoverSide: 1, winner: 2 });
    expect(racketResultOf(wo, 'padel', RULES)).toMatchObject({ walkover: 1, winner: 2, totals: { sets: [0, 2], games: [0, 12] } });
    expect(racketResultOf(mkMatch({ status: 'walkover', walkoverSide: 0 }), 'padel', RULES)).toBeNull();
  });

  it('pickleball: juegos y puntos', () => {
    const m = mkMatch({ teams: ['A', 'B'], status: 'confirmed', winner: 1, score: { text: '11-7 9-11 11-5' } });
    expect(racketResultOf(m, 'pickleball', { match: { sport: 'pickleball', bestOf: 3 } })?.totals).toEqual({ games: [2, 1], points: [31, 23] });
  });
});

describe('tabla de parejas (desempates del pádel)', () => {
  it('ganar 3, perder 1, W.O. 0; tres empatados: minitabla, sets, juegos y luego el directo entre los dos que quedan', () => {
    const list = [
      sets('A', 'B', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }),
      sets('B', 'C', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }),
      sets('C', 'A', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }),
      sets('A', 'D', '6-0 6-0', 1, { sets: [2, 0], games: [12, 0] }),
      sets('B', 'D', '6-1 6-1', 1, { sets: [2, 0], games: [12, 2] }),
      mkMatch({ teams: ['C', 'D'], status: 'walkover', walkoverSide: 2, winner: 1 }),
      // Por confirmar (dentro de las 48 h): no cuenta todavía.
      sets('D', 'A', '6-0 6-0', 1, { sets: [2, 0], games: [12, 0] }, { status: 'finished', proposedAt: '2026-10-19T12:00:00Z' }),
    ];
    const t = pairStandings('padel', ['A', 'B', 'C', 'D'], list, { rules: RULES, now: NOW });
    // A, B y C con 7: la minitabla empata (1 ganado cada uno) y la dif. de sets también (+2); por juegos A y C
    // (+12) quedan arriba de B (+10), y entre A y C decide el directo (C le ganó a A).
    expect(t.map((r) => [r.id, r.points, r.rank, r.decidedBy ?? null])).toEqual([
      ['C', 7, 1, null],
      ['A', 7, 2, 'enfrentamiento directo'],
      ['B', 7, 3, 'dif. de juegos'],
      ['D', 2, 4, 'puntos'],
    ]);
    expect(t.find((r) => r.id === 'D')).toMatchObject({ played: 3, lost: 3, extra: { walkovers: 1 } });
    // Con 2 y 0 por partido cambia la suma.
    expect(pairStandings('padel', ['A', 'D'], list, { scheme: '2-0', now: NOW })[0]).toMatchObject({ id: 'A', points: 2 });
  });
});

describe('jugadores', () => {
  const matches = [
    sets(['ana', 'luis'], ['rosa', 'juan'], '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }, { scheduledAt: '2026-10-01T23:00:00Z' }),
    sets(['ana', 'rosa'], ['luis', 'juan'], '4-6 4-6', 2, { sets: [0, 2], games: [8, 12] }, { scheduledAt: '2026-10-02T23:00:00Z' }),
    sets(['ana', 'luis'], ['pedro', 'juan'], '6-2 6-2', 1, { sets: [2, 0], games: [12, 4] }, { scheduledAt: '2026-10-03T23:00:00Z' }),
    pts(1, 'C1', ['ana', 'pedro'], ['luis', 'rosa'], 14, 10, { eventId: 'N1' }),
    pts(2, 'C1', ['ana', 'luis'], ['pedro', 'rosa'], 12, 12, { eventId: 'N1' }),
    pts(1, 'C1', ['ana', 'juan'], ['luis', 'rosa'], 8, 16, { eventId: 'N2' }),
    // Sin terminar: no cuenta.
    sets(['ana', 'luis'], ['rosa', 'juan'], '', 1, { sets: [0, 0], games: [0, 0] }, { status: 'live' }),
  ];

  it('récord: partidos a sets, noches, racha, con cada compañero y contra cada rival', () => {
    const r = playerRecord('ana', matches, { sport: 'padel', now: NOW });
    expect(r.sets).toMatchObject({ played: 3, won: 2, lost: 1, setsFor: 4, setsAgainst: 2, gamesFor: 32, gamesAgainst: 24, streak: { kind: 'G', n: 1 }, last: ['G', 'P', 'G'] });
    expect(r.nights).toEqual({ nights: 2, played: 3, won: 1, drawn: 1, lost: 1, pointsFor: 34, pointsAgainst: 38 });
    expect(r.partners.find((p) => p.id === 'luis')).toEqual({ id: 'luis', played: 3, won: 2, lost: 0, drawn: 1 });
    expect(r.rivals.find((p) => p.id === 'luis')).toEqual({ id: 'luis', played: 3, won: 1, lost: 2, drawn: 0 });
    expect(r.matches).toHaveLength(6);
    expect(winPct(2, 3)).toBe(67);
    expect(winPct(0, 0)).toBeNull();
  });

  it('con la pareja sin jugadores anotados, usa la plantilla', () => {
    const m = sets('T1', 'T2', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] });
    const r = playerRecord('ana', [m], { sport: 'padel', rosterOf: (t) => (t === 'T1' ? ['ana', 'luis'] : ['x', 'y']) });
    expect(r.sets.won).toBe(1);
    expect(r.rivals.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('ranking individual de la temporada (partidos a sets)', () => {
    const t = seasonPlayerTable(matches, { sport: 'padel', now: NOW });
    expect(t[0]).toMatchObject({ id: 'luis', played: 3, won: 3, points: 9 });
    expect(t.find((r) => r.id === 'ana')).toMatchObject({ points: 7, extra: { setsDiff: 2 } });
    expect(t.find((r) => r.id === 'pedro')).toMatchObject({ played: 1, won: 0, points: 1 });
  });

  it('ranking de pickleball: la columna «Jue.» muestra la dif. de juegos (no 0)', () => {
    const m = mkMatch({ a: ['ana'], b: ['luis'], status: 'confirmed', winner: 1, score: { text: '11-5 11-7' } });
    const t = seasonPlayerTable([m], { sport: 'pickleball', rules: { match: { sport: 'pickleball', bestOf: 3, doubles: false } }, now: NOW });
    expect(t.find((r) => r.id === 'ana')).toMatchObject({ for: 22, against: 12, extra: { setsDiff: 2, gamesDiff: 2 } });
    expect(t.find((r) => r.id === 'luis')?.extra.gamesDiff).toBe(-2);
    const col = racketColumns('pickleball').find((c) => c.key === 'sets')!;
    expect(col.label).toBe('Jue.');
    expect(t.map((r) => col.value(r))).toEqual(['+2', '-2']);
    expect(setsLabel('pickleball')).toBe('Juegos');
    expect(setsLabel('padel')).toBe('Sets');
  });

  it('noches de la temporada: puntos totales, ganados y promedio', () => {
    const t = seasonNightTable(matches, { now: NOW });
    expect(t[0]).toMatchObject({ id: 'luis', nights: 2, played: 3, points: 38, won: 1 });
    expect(t.find((r) => r.id === 'ana')).toMatchObject({ nights: 2, played: 3, points: 34, avg: 11.3 });
  });

  it('temporada: la escalera y las cajas cuentan cada partido por su fecha; torneo, liga y noches por la del evento', () => {
    const season = { seasonStart: '2026-01-01', seasonEnd: '2026-06-30' };
    const events = new Map([
      ['LAD', { date: '2025-12-20', type: 'escalera' }],
      ['BOX', { date: '2026-06-01', type: 'cajas' }],
      ['TOR', { date: '2025-12-28', type: 'torneo' }],
      ['NOC', { date: '2026-03-05', type: 'americano' }],
    ]);
    const tz = 'America/Santo_Domingo';
    // Reto de la escalera jugado en marzo (la escalera se creó en diciembre): es de esta temporada.
    const reto = { eventId: 'LAD', scheduledAt: '2026-03-10T23:00:00Z', proposedAt: null, confirmedAt: null };
    expect(seasonDay(reto, events, tz)).toBe('2026-03-10');
    expect(inSeason(season, seasonDay(reto, events, tz))).toBe(true);
    // Sin fecha acordada: la del resultado propuesto; sin ninguna, la del evento.
    expect(seasonDay({ ...reto, scheduledAt: null, proposedAt: '2026-02-02T15:00:00Z' }, events, tz)).toBe('2026-02-02');
    expect(seasonDay({ ...reto, scheduledAt: null }, events, tz)).toBe('2025-12-20');
    // Cajas que empezaron en junio: el partido de julio ya es de la temporada que sigue.
    const julio = { eventId: 'BOX', scheduledAt: null, proposedAt: null, confirmedAt: '2026-07-15T12:00:00Z' };
    expect(inSeason(season, seasonDay(julio, events, tz))).toBe(false);
    // El torneo se queda entero con el día del evento, aunque la final se juegue en enero.
    expect(seasonDay({ eventId: 'TOR', scheduledAt: '2026-01-04T20:00:00Z', proposedAt: null, confirmedAt: null }, events, tz)).toBe('2025-12-28');
    expect(seasonDay({ eventId: 'NOC', scheduledAt: '2026-03-06T02:00:00Z', proposedAt: null, confirmedAt: null }, events, tz)).toBe('2026-03-05');
    // Suelto: su fecha, en la zona de la liga (las 02:00 UTC del 1 de enero son las 22:00 del 31 en Santo Domingo).
    expect(seasonDay({ eventId: null, scheduledAt: '2026-01-01T02:00:00Z', proposedAt: null, confirmedAt: null }, events, tz)).toBe('2025-12-31');
  });

  it('temporada: sin fechas, todo', () => {
    expect(inSeason({ seasonStart: '2026-01-01', seasonEnd: '2026-06-30' }, '2026-07-01')).toBe(false);
    expect(inSeason({ seasonStart: '', seasonEnd: '' }, '2020-01-01')).toBe(true);
    expect(inSeason({ seasonStart: '2026-01-01' }, null)).toBe(true);
  });
});

describe('individual (tenis): el lado es el jugador', () => {
  it('la tabla usa el id del jugador', () => {
    const m = sets(['ana'], ['luis'], '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] });
    expect(racketResultOf(m, 'tennis')).toMatchObject({ side1: 'ana', side2: 'luis' });
    expect(pairStandings('tennis', ['ana', 'luis'], [m], { now: NOW }).map((r) => [r.id, r.points])).toEqual([
      ['ana', 3],
      ['luis', 1],
    ]);
  });
});

describe('ping pong: juegos y puntos, tabla de la ITTF', () => {
  const TT = { match: { sport: 'table_tennis' } };
  const tt = (a: string, b: string, text: string, winner: 1 | 2, extra: Parameters<typeof mkMatch>[0] = {}) =>
    mkMatch({ a: [a], b: [b], status: 'confirmed', winner, score: { text }, ...extra });

  it('el resultado: de los totales, del texto y de un W.O. (11-0 en cada juego que hacía falta)', () => {
    const text = '11-7 9-11 11-5 11-8';
    const saved = sets(['ana'], ['luis'], text, 1, { sets: [3, 1], games: [3, 1] }, { score: { text, sides: [3, 1], totals: { sets: [3, 1], games: [3, 1], points: [42, 31] } } });
    expect(racketResultOf(saved, 'table_tennis', TT)?.totals).toEqual({ games: [3, 1], points: [42, 31] });
    expect(racketResultOf(tt('ana', 'luis', text, 1), 'table_tennis', TT)?.totals).toEqual({ games: [3, 1], points: [42, 31] });
    const wo = mkMatch({ a: ['ana'], b: ['luis'], status: 'walkover', walkoverSide: 2, winner: 1 });
    expect(racketResultOf(wo, 'table_tennis', TT)).toMatchObject({ walkover: 2, winner: 1, totals: { games: [3, 0], points: [33, 0] } });
    // Al mejor de 7 son 4 juegos.
    expect(racketResultOf(wo, 'table_tennis', { match: { sport: 'table_tennis', bestOf: 7 } })?.totals).toEqual({ games: [4, 0], points: [44, 0] });
  });

  it('la tabla usa los puntos de la ITTF (ganar 2, perder 1, W.O. o retiro 0) y no hace caso del esquema', () => {
    expect(pointsRule('table_tennis', '2-0')).toEqual({ win: 2, draw: 0, loss: 1, walkoverLoss: 0, retiredLoss: 0 });
    const list = [tt('ana', 'luis', '11-7 11-9 11-5', 1), mkMatch({ a: ['rosa'], b: ['ana'], status: 'walkover', walkoverSide: 1, winner: 2 })];
    const rows = pairStandings('table_tennis', ['ana', 'luis', 'rosa'], list, { scheme: '2-0', rules: TT, now: NOW });
    expect(rows.map((r) => [r.id, r.points])).toEqual([
      ['ana', 4],
      ['luis', 1],
      ['rosa', 0],
    ]);
    // PF, PC y Dif. son puntos; «Jue.» la dif. de juegos.
    expect(rows[0]).toMatchObject({ for: 33 + 33, against: 21, extra: { gamesDiff: 6 } });
  });

  it('retiro desde la mesa («11-7 3-5 ret.»): el que se retira suma 0 en la tabla y en el ranking; sus juegos cuentan', () => {
    let s = initRacket(resolveRules('table_tennis', {}));
    s = applyRacket(s, { type: 'correct', games: [[11, 7]], score: [3, 5] });
    s = applyRacket(s, { type: 'retire', side: 2 });
    const score = racketScore(s);
    expect(score.text).toBe('11-7 3-5 ret.');
    const m = tt('ana', 'luis', score.text ?? '', 1, { score });
    // Los totales guardados ya vienen completados (11-7 11-5 11-0) y el resultado marca quién se retiró.
    expect(racketResultOf(m, 'table_tennis', TT)).toMatchObject({ winner: 1, retired: 2, totals: { games: [3, 0], points: [33, 12] } });
    expect(racketResultOf(m, 'table_tennis', TT)?.walkover).toBeUndefined();
    const list = [m, tt('luis', 'rosa', '11-3 11-3 11-3', 1)];
    const rows = pairStandings('table_tennis', ['ana', 'luis', 'rosa'], list, { rules: TT, now: NOW });
    // Luis: 0 por el retiro + 2 por ganar; Rosa: 1 por perder jugando. Con 1 por el retiro, Luis tendría 3.
    expect(rows.map((r) => [r.id, r.points])).toEqual([
      ['ana', 2],
      ['luis', 2],
      ['rosa', 1],
    ]);
    expect(rows.find((r) => r.id === 'luis')).toMatchObject({ for: 12 + 33, against: 33 + 9 });
    const season = seasonPlayerTable(list, { sport: 'table_tennis', rules: TT, now: NOW });
    expect(season.find((r) => r.id === 'luis')).toMatchObject({ points: 2, won: 1, lost: 1 });
    // En pádel y tenis el retiro sigue siendo una derrota más (perder 1).
    const padel = mkMatch({ a: ['ana'], b: ['luis'], status: 'confirmed', winner: 1, score: { text: '6-4 3-2 ret.' } });
    expect(racketResultOf(padel, 'padel', RULES)).toMatchObject({ retired: 2 });
    expect(pairStandings('padel', ['ana', 'luis'], [padel], { rules: RULES, now: NOW }).map((r) => [r.id, r.points])).toEqual([
      ['ana', 3],
      ['luis', 1],
    ]);
  });

  it('ranking de la temporada: 2 y 1, con columnas de juegos y puntos', () => {
    const list = [tt('ana', 'luis', '11-7 9-11 11-5 11-8', 1), tt('luis', 'rosa', '11-3 11-3 11-3', 1)];
    const t = seasonPlayerTable(list, { sport: 'table_tennis', rules: TT, now: NOW });
    // Luis perdió jugando (1) y ganó (2); Ana ganó (2); Rosa perdió jugando (1).
    expect(t.map((r) => [r.id, r.points, r.won, r.lost])).toEqual([
      ['luis', 3, 1, 1],
      ['ana', 2, 1, 0],
      ['rosa', 1, 0, 1],
    ]);
    expect(t.find((r) => r.id === 'ana')).toMatchObject({ for: 42, against: 31, extra: { setsDiff: 2, gamesDiff: 2 } });
    const col = racketColumns('table_tennis').find((c) => c.key === 'sets')!;
    expect(col.label).toBe('Jue.');
    expect(racketColumns('table_tennis').map((c) => c.label)).toEqual(['PJ', 'G', 'P', 'Jue.', 'PF', 'PC', 'Dif.']);
    expect([setsLabel('table_tennis'), forLabel('table_tennis')]).toEqual(['Juegos', 'Puntos']);
  });

  it('el récord del jugador: juegos y puntos', () => {
    const rec = playerRecord('ana', [tt('ana', 'luis', '11-7 9-11 11-5 11-8', 1)], { sport: 'table_tennis', rules: TT, now: NOW });
    expect(rec.sets).toMatchObject({ played: 1, won: 1, setsFor: 3, setsAgainst: 1, gamesFor: 42, gamesAgainst: 31 });
  });
});
