import { describe, expect, it } from 'vitest';
import type { LeagueMonthActivity, SnapProfile } from '../snapshot';
import { snapLeague, snapMember, snapProfile } from '../testkit';
import {
  capPerDay,
  capPerRivalMonth,
  establishedFrom,
  isEstablished,
  isRealLeagueMonth,
  podiumAwards,
  podiumLevels,
  rankWith,
  realLeagueFilter,
  realLeagueMonths,
  swimPodiumLevels,
  topWithTies,
  weightySeason,
  weightyMonth,
  weightyYear,
} from './gates';

const profiles = (...list: SnapProfile[]) => new Map(list.map((p) => [p.id, p]));
const month = (m: string, users: string[], players: string[] = users.map((u) => `p-${u}`), league_id = 'L'): LeagueMonthActivity => ({ league_id, month: m, users, players });

describe('cuentas establecidas (§1.7.4)', () => {
  it('7 días después de creadas y nunca si están bloqueadas', () => {
    const p = snapProfile('u', { created_at: '2026-10-01T15:00:00Z' });
    expect(establishedFrom(p)).toBe('2026-10-08');
    expect(isEstablished(p, '2026-10-07')).toBe(false);
    expect(isEstablished(p, '2026-10-31')).toBe(true);
    expect(isEstablished({ ...p, blocked_at: '2026-10-20T00:00:00Z' }, '2026-10-31')).toBe(false);
    expect(isEstablished(undefined, '2026-10-31')).toBe(false);
  });

  it('las de BowlingX, desde su primer juego importado', () => {
    const p = snapProfile('u', { created_at: '2026-10-01T15:00:00Z', bowlingx: true, first_import_on: '2025-03-04' });
    expect(establishedFrom(p)).toBe('2025-03-04');
    expect(isEstablished(p, '2025-03-31')).toBe(true);
  });
});

describe('liga real', () => {
  const ps = profiles(...['a', 'b', 'c', 'd', 'e'].map((id) => snapProfile(id)), snapProfile('late', { created_at: '2026-11-20T00:00:00Z' }));
  const league = snapLeague('L');

  it('4 cuentas establecidas con actividad en el mes o en los dos anteriores', () => {
    const months = [month('2026-08', ['a']), month('2026-09', ['b', 'c']), month('2026-10', ['d']), month('2026-11', ['d'])];
    const input = { league, months, profiles: ps };
    expect(isRealLeagueMonth(input, '2026-10')).toBe(true);
    // Noviembre ya no ve agosto: b, c y d son 3.
    expect(isRealLeagueMonth(input, '2026-11')).toBe(false);
    expect([...realLeagueMonths(input)].sort()).toEqual(['2026-10']);
    // En las de cuenta, la cuenta evaluada no cuenta entre las 4.
    expect(isRealLeagueMonth({ ...input, exclude: 'd' }, '2026-10')).toBe(false);
  });

  it('sin retroactivo: una cuenta creada después no vuelve real un mes pasado', () => {
    const months = [month('2026-10', ['a', 'b', 'c', 'late'])];
    expect(isRealLeagueMonth({ league, months, profiles: ps }, '2026-10')).toBe(false);
    expect(isRealLeagueMonth({ league, months: [...months, month('2026-12', ['late'])], profiles: ps }, '2026-12')).toBe(true);
  });

  it('un torneo suelto cuenta todo el torneo', () => {
    const months = [month('2026-06', ['a', 'b']), month('2026-10', ['c', 'd'])];
    expect(isRealLeagueMonth({ league, months, profiles: ps }, '2026-10')).toBe(false);
    expect(isRealLeagueMonth({ league: snapLeague('L', { kind: 'torneo' }), months, profiles: ps }, '2026-10')).toBe(true);
  });

  it('con menores: 2 cuentas de staff y 6 jugadores activos', () => {
    const minors = snapLeague('L', { has_minors: true });
    const members = [snapMember('L', 'a', 'owner'), snapMember('L', 'b', 'admin'), snapMember('L', 'c')];
    const six = month('2026-10', [], ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']);
    expect(isRealLeagueMonth({ league: minors, months: [six], profiles: ps, members }, '2026-10')).toBe(true);
    expect(isRealLeagueMonth({ league: minors, months: [six], profiles: ps, members: members.slice(1) }, '2026-10')).toBe(false);
    expect(isRealLeagueMonth({ league: minors, months: [month('2026-10', [], ['k1', 'k2'])], profiles: ps, members }, '2026-10')).toBe(false);
  });

  it('filtro de varias ligas', () => {
    const months = [month('2026-10', ['a', 'b', 'c', 'd']), month('2026-10', ['a'], ['p-a'], 'M')];
    const isReal = realLeagueFilter([league, snapLeague('M')], { months, profiles: ps });
    expect([isReal('L', '2026-10'), isReal('M', '2026-10'), isReal('X', '2026-10')]).toEqual([true, false, false]);
  });

  it('liga con peso para el mes, la temporada y el año', () => {
    const months = [month('2026-10', ['a', 'b', 'c', 'd'], ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])];
    expect(weightyMonth({ league, months, profiles: ps }, '2026-10')).toBe(true);
    expect(weightyMonth({ league, months: [month('2026-10', ['a', 'b', 'c', 'd'])], profiles: ps }, '2026-10')).toBe(false);
    expect(weightySeason({ competitors: 6, establishedAccounts: 4, writers: 1 })).toBe(true);
    expect(weightySeason({ competitors: 12, establishedAccounts: 1, writers: 2 })).toBe(true);
    expect(weightySeason({ competitors: 11, establishedAccounts: 3, writers: 5 })).toBe(false);
    expect(weightyYear({ players: 8, establishedAccounts: 4 })).toBe(true);
    expect(weightyYear({ players: 7, establishedAccounts: 9 })).toBe(false);
  });
});

describe('topes (§1.7.7)', () => {
  it('por día y por rival y mes, en orden', () => {
    const games = Array.from({ length: 12 }, (_, i) => ({ day: i < 11 ? '2026-10-06' : '2026-10-07', i }));
    expect(capPerDay(games, (g) => g.day, 10).map((g) => g.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
    const wins = [
      { rival: 'x', m: '2026-10' },
      { rival: 'x', m: '2026-10' },
      { rival: 'y', m: '2026-10' },
      { rival: 'x', m: '2026-10' },
      { rival: 'x', m: '2026-10' },
      { rival: 'x', m: '2026-11' },
    ];
    expect(capPerRivalMonth(wins, (w) => w.rival, (w) => w.m, 3)).toHaveLength(5);
  });
});

describe('podios y empates (§1.7.7, §1.7.8)', () => {
  it('tamaño del podio', () => {
    expect([3, 4, 5, 6, 9, 10].map(podiumLevels)).toEqual([[], [3], [3], [3, 2], [3, 2], [3, 2, 1]]);
    expect([2, 3, 4, 5].map(swimPodiumLevels)).toEqual([[], [3], [3, 2], [3, 2, 1]]);
  });

  const byScore = (a: { s: number }, b: { s: number }) => b.s - a.s;

  it('puestos de competición y ganadores compartidos (hasta 3)', () => {
    const rows = [{ id: 'a', s: 10 }, { id: 'b', s: 12 }, { id: 'c', s: 10 }, { id: 'd', s: 8 }];
    expect(rankWith(rows, byScore).map((r) => [r.row.id, r.place])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
    expect(topWithTies(rows, byScore)).toEqual({ winners: [rows[1]], multiTie: false });
    const four = ['a', 'b', 'c', 'd'].map((id) => ({ id, s: 5 }));
    expect(topWithTies(four, byScore)).toEqual({ winners: [], multiTie: true });
    expect(topWithTies(four.slice(0, 3), byScore).winners).toHaveLength(3);
  });

  it('podio con empates: dos oros y el siguiente es bronce; un puesto de más de 3 no da nada', () => {
    const rows = [{ id: 'a', s: 9 }, { id: 'b', s: 9 }, { id: 'c', s: 7 }, { id: 'd', s: 5 }];
    expect(podiumAwards(rows, byScore, [3, 2, 1]).map((x) => [x.row.id, x.level])).toEqual([
      ['a', 3],
      ['b', 3],
      ['c', 1],
    ]);
    expect(podiumAwards(rows, byScore, [3]).map((x) => x.row.id)).toEqual(['a', 'b']);
    const crowd = [{ id: 'w', s: 10 }, ...['a', 'b', 'c', 'd'].map((id) => ({ id, s: 5 }))];
    expect(podiumAwards(crowd, byScore, [3, 2, 1]).map((x) => [x.row.id, x.level])).toEqual([['w', 3]]);
  });
});
