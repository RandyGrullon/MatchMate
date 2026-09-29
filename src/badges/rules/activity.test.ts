import { describe, expect, it } from 'vitest';
import { act } from '../testkit';
import {
  activeDays,
  activeMonths,
  dedupeActivity,
  familiesOf,
  firstActivity,
  firstWindowDays,
  inRealLeagues,
  leagueMonths,
  monthStreak,
  officialOnly,
  sportsWithDays,
  weighDays,
  weightByMonth,
  weightedTotal,
} from './activity';

describe('días activos (§1.7.3)', () => {
  it('uno por cuenta y fecha, sin importar cuántas ligas', () => {
    const days = activeDays([
      act('p1', '2026-10-06', { user_id: 'u1', league_id: 'A' }),
      act('p2', '2026-10-06', { user_id: 'u1', league_id: 'B', sport: 'golf', official: false }),
      act('p1', '2026-10-07', { user_id: 'u1', league_id: 'A' }),
      act('p9', '2026-10-06', { league_id: 'A' }),
    ]);
    expect(days.map((d) => [d.holder, d.date, d.weight, d.leagues.length])).toEqual([
      ['p9', '2026-10-06', 1, 1],
      ['u1', '2026-10-06', 2, 2],
      ['u1', '2026-10-07', 1, 1],
    ]);
    // Por jugador: cada jugador por su lado.
    expect(activeDays([act('p1', '2026-10-06', { user_id: 'u1' }), act('p2', '2026-10-06', { user_id: 'u1' })], 'player')).toHaveLength(2);
  });

  it('lo que vino solo por plantilla queda marcado y no es oficial', () => {
    const [d] = activeDays([act('p1', '2026-10-06', { sport: 'football', roster: true })]);
    expect([d.rosterOnly, d.official]).toEqual([true, false]);
    const [e] = activeDays([act('p1', '2026-10-06', { sport: 'football', roster: true }), act('p1', '2026-10-06', { sport: 'football' })]);
    expect([e.rosterOnly, e.official]).toEqual([false, true]);
  });

  it('golf y natación valen 2, con tope de 4 por semana ISO', () => {
    // Semana del 5 al 11 de octubre de 2026: tres rondas de golf y un día de boliche.
    const days = activeDays([
      act('p', '2026-10-05', { sport: 'golf' }),
      act('p', '2026-10-06', { sport: 'golf' }),
      act('p', '2026-10-07', { sport: 'golf' }),
      act('p', '2026-10-08'),
      act('p', '2026-10-12'),
    ]);
    const w = weighDays(days);
    expect(w.map((d) => d.weight)).toEqual([2, 2, 0, 0, 1]);
    expect(weightedTotal(w)).toBe(5);
  });

  it('mes activo con 2 días ponderados: una ronda de golf basta', () => {
    const w = weighDays(activeDays([act('p', '2026-09-20', { sport: 'golf' }), act('p', '2026-10-01'), act('p', '2026-11-03'), act('p', '2026-11-20')]));
    expect(Object.fromEntries(weightByMonth(w))).toEqual({ '2026-09': 2, '2026-10': 1, '2026-11': 2 });
    expect(activeMonths(w)).toEqual(['2026-09', '2026-11']);
  });
});

describe('racha de meses con comodín', () => {
  const months = (...ms: string[]) => ms;
  it('cuenta los meses seguidos hasta el final', () => {
    expect(monthStreak(months('2026-01', '2026-02', '2026-03'), '2026-03')).toBe(3);
    expect(monthStreak([], '2026-03')).toBe(0);
  });

  it('un hueco suelto no corta ni suma', () => {
    expect(monthStreak(months('2026-01', '2026-02', '2026-04', '2026-05'), '2026-05')).toBe(4);
    // El mes evaluado puede ser el hueco.
    expect(monthStreak(months('2026-01', '2026-02', '2026-03'), '2026-04')).toBe(3);
  });

  it('dos meses seguidos sin jugar la cortan', () => {
    expect(monthStreak(months('2026-01', '2026-02', '2026-05', '2026-06'), '2026-06')).toBe(2);
    expect(monthStreak(months('2026-01', '2026-02'), '2026-04')).toBe(0);
  });

  it('dos huecos dentro de 12 meses la cortan; a 12 meses o más, no', () => {
    // Huecos en marzo y agosto (5 meses): vale el de agosto, se corta en marzo.
    expect(monthStreak(months('2026-01', '2026-02', '2026-04', '2026-05', '2026-06', '2026-07', '2026-09'), '2026-09')).toBe(5);
    // Huecos en marzo de 2026 y marzo de 2027 (12 meses): valen los dos.
    const all: string[] = [];
    for (let y = 2026; y <= 2027; y++) for (let m = 1; m <= 12; m++) all.push(`${y}-${String(m).padStart(2, '0')}`);
    const withGaps = all.filter((m) => m !== '2026-03' && m !== '2027-03');
    expect(monthStreak(withGaps, '2027-12')).toBe(22);
  });
});

describe('arranque, deportes y familias', () => {
  it('días en los primeros 30 desde el primer día activo', () => {
    const days = activeDays(['2026-10-05', '2026-10-06', '2026-10-20', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => act('p', d)));
    expect(firstWindowDays(days)).toEqual({ first: '2026-10-05', last: '2026-11-03', days: 4 });
    expect(firstWindowDays([])).toBeNull();
  });

  it('deportes con 3 días o más; fútbol y sala van aparte', () => {
    const acts = [
      ...['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => act('p', d, { sport: 'football' })),
      ...['2026-10-01', '2026-10-02'].map((d) => act('p', d, { sport: 'futsal' })),
      ...['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03'].map((d) => act('p', d, { sport: 'padel' })),
      ...['2026-10-01', '2026-10-08', '2026-10-15'].map((d) => act('p', d, { sport: 'golf' })),
    ];
    const sports = sportsWithDays(acts);
    expect(sports.sort()).toEqual(['football', 'golf', 'padel']);
    expect([...familiesOf(sports)].sort()).toEqual(['racket', 'series', 'team']);
    expect(firstActivity(acts, 'golf')).toBe('2026-10-01');
    expect(firstActivity(acts, 'swimming')).toBeNull();
  });
});

describe('actividad por liga y mes', () => {
  it('cuentas y jugadores con actividad válida; la plantilla no cuenta para liga real', () => {
    const rows = leagueMonths([
      act('p1', '2026-10-01', { user_id: 'u1' }),
      act('p1', '2026-10-09', { user_id: 'u1' }),
      act('p2', '2026-10-01'),
      act('p3', '2026-10-01', { user_id: 'u3', roster: true }),
      act('p1', '2026-11-01', { user_id: 'u1', league_id: 'M' }),
    ]);
    expect(rows).toEqual([
      { league_id: 'L', month: '2026-10', users: ['u1'], players: ['p1', 'p2'] },
      { league_id: 'M', month: '2026-11', users: ['u1'], players: ['p1'] },
    ]);
  });

  it('filtra ligas no reales, lo oficial y los repetidos', () => {
    const acts = [act('p1', '2026-10-01'), act('p1', '2026-10-01', { official: false }), act('p2', '2026-11-01', { league_id: 'M', official: false })];
    expect(inRealLeagues(acts, (l, m) => l === 'L' && m === '2026-10')).toHaveLength(2);
    expect(officialOnly(acts)).toHaveLength(1);
    const d = dedupeActivity([act('p1', '2026-10-01', { official: false, roster: true }), act('p1', '2026-10-01', { user_id: 'u1' })]);
    expect(d).toEqual([act('p1', '2026-10-01', { official: true, roster: false, user_id: 'u1' })]);
  });
});
