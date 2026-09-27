import { describe, expect, it } from 'vitest';
import { inSeason, pairStandings, playerRecord, racketResultOf, seasonNightTable, seasonPlayerTable, winPct } from './results';
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

  it('noches de la temporada: puntos totales, ganados y promedio', () => {
    const t = seasonNightTable(matches, { now: NOW });
    expect(t[0]).toMatchObject({ id: 'luis', nights: 2, played: 3, points: 38, won: 1 });
    expect(t.find((r) => r.id === 'ana')).toMatchObject({ nights: 2, played: 3, points: 34, avg: 11.3 });
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
