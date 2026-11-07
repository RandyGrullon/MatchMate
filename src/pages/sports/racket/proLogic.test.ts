import { describe, expect, it } from 'vitest';
import type { BoxMonth } from '../racket-formats/logic/box';
import { boxMonthExcelInput, competitionExcelName, leagueExcelInput } from './excel';
import type { ScheduleEntrant } from './logic/league';
import { firstJornadas, nextSlotTime } from './logic/league';
import { newNightConfig } from './logic/night';
import { mkMatch, pts, sets } from './logic/testMatch';
import { groupDrafts, missingGroupDrafts, newCategory, seedLevel, sortBySeedLevel } from './logic/tourney';
import { nightFirstSummary, nightPointsEntry } from './night/entry';
import { profileFilters, scopeProfileMatches } from './profileFilters';

/** Lo puro que comparten las pantallas de Pro de raqueta de la web y de la app del teléfono (datos ficticios). */

const names = {
  entrantName: (id: string) => `Pareja ${id}`,
  nameOf: (id: string) => `Jugador ${id}`,
  rosterOf: (id: string) => (id === 'T1' ? ['a', 'b'] : id === 'T2' ? ['c', 'd'] : []),
};

describe('Excel de la liga y de las cajas', () => {
  const m1 = sets('T1', 'T2', '6-4 6-3', 1, { sets: [2, 0], games: [12, 7] }, { round: 1 });
  const m2 = mkMatch({ teams: ['T1', 'T2'], round: 2, status: 'void' });

  it('la liga: la tabla, los jugadores y las palabras del deporte', () => {
    const o = leagueExcelInput({ title: 'Liga de Ejemplo', date: '2026-10-07', matches: [m1], table: [], sport: 'pickleball', names, tz: 'America/Santo_Domingo', courtLabel: 'Cancha', now: 0 });
    expect(o.tables).toEqual([{ name: 'Tabla', rows: [] }]);
    expect(o.forLabel).toBe('Puntos');
    expect(o.setsLabel).toBe('Juegos');
    expect(o.players.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(competitionExcelName(o)).toBe('Liga de Ejemplo - 2026-10-07.xlsx');
  });

  it('las cajas: solo el mes, una tabla por caja y el nombre del mes', () => {
    const month: BoxMonth = { n: 1, label: 'Octubre 2026', start: '2026-10-01', end: '2026-10-31', boxes: [['T1', 'T2'], ['T3', 'T4']], closed: false, moves: [] };
    const o = boxMonthExcelInput({ title: 'Cajas de Ejemplo', eventDate: '2026-09-30', month, matches: [m1, m2], tables: [[]], sport: 'padel', names, courtLabel: 'Cancha', now: 0 });
    expect(o.title).toBe('Cajas de Ejemplo · Octubre 2026');
    expect(o.date).toBe('2026-10-01');
    expect(o.matches).toEqual([m1]);
    expect(o.tables.map((t) => t.name)).toEqual(['Caja 1', 'Caja 2']);
    expect(o.forLabel).toBe('Juegos');
    expect(competitionExcelName({ title: 'Mes: 1/2', date: '2026-10-01' })).toBe('Mes 1 2 - 2026-10-01.xlsx');
  });
});

describe('calendario de la liga', () => {
  it('«+ Hora» suma los minutos de un partido', () => {
    expect(nextSlotTime('19:00', 90)).toBe('20:30');
    expect(nextSlotTime('22:45', 90)).toBe('23:15');
    expect(nextSlotTime(undefined, 60)).toBe('20:00');
  });

  it('una línea por jornada, las primeras 4', () => {
    const fixtures = [1, 1, 2, 3, 4, 5].map((round) => ({ round, home: 'x', away: 'y', date: null, time: null, court: null }));
    expect(firstJornadas({ fixtures }).map((f) => f.round)).toEqual([1, 2, 3, 4]);
  });
});

describe('torneo: grupos que faltan y siembra', () => {
  const entrants = new Map<string, ScheduleEntrant>(['T1', 'T2', 'T3'].map((id) => [id, { id, players: [`${id}a`, `${id}b`], team: true }]));
  const cat = { ...newCategory('A'), pairs: ['T1', 'T2', 'T3'], groups: 1, groupsOf: [['T1', 'T2', 'T3']] };

  it('crea solo los partidos del grupo que no están (en cualquier orden de los lados)', () => {
    const all = groupDrafts(cat, cat.groupsOf, entrants, { eventId: 'E' });
    expect(all).toHaveLength(3);
    const made = mkMatch({ teams: ['T2', 'T1'], stage: all[0].stage });
    const missing = missingGroupDrafts(cat, [made], entrants, { eventId: 'E' });
    expect(missing).toHaveLength(2);
    expect(missing.some((d) => [d.sides[0].teamId, d.sides[1].teamId].sort().join() === 'T1,T2')).toBe(false);
  });

  it('el nivel de la pareja es la suma de los suyos, y «Por nivel» pone primero al de más', () => {
    const levels = { a: 3.5, b: 4.25, c: 2 };
    expect(seedLevel(['a', 'b'], levels)).toBe(7.75);
    expect(seedLevel(['c', 'x'], levels)).toBe(2);
    expect(seedLevel(['x'], levels)).toBeNull();
    const lv: Record<string, number | null> = { T1: 5, T2: null, T3: 8 };
    expect(sortBySeedLevel(['T1', 'T2', 'T3'], (id) => lv[id])).toEqual(['T3', 'T1', 'T2']);
  });
});

describe('la noche', () => {
  it('el marcador de la ronda dice lo que suman', () => {
    const e = nightPointsEntry(pts(1, 'Cancha 1', ['a', 'b'], ['c', 'd'], null, null, { rules: { points: { mode: 'total', target: 24 } } }));
    expect(e.placeholder).toBe('14-10');
    expect(e.hint).toBe('suman 24');
    expect(e.parser('14-10').winner).toBe(1);
    expect(nightPointsEntry(mkMatch({ rules: { points: { mode: 'time', minutes: 12 } } })).hint).toBeUndefined();
  });

  it('el resumen de «Todo listo para la ronda 1»', () => {
    const cfg = newNightConfig('americano', { players: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], courts: ['Cancha 1', 'Cancha 2'], rounds: 7 });
    expect(nightFirstSummary(cfg)).toBe('8 jugadores en 2 canchas · 7 rondas · sin repetir compañero');
    expect(nightFirstSummary({ ...cfg, format: 'mexicano', firstRound: 'level', courts: ['Cancha 1'] })).toBe('8 jugadores en 1 cancha · 7 rondas · la 1 por nivel');
  });
});

describe('perfil del jugador en Pro', () => {
  it('los filtros según lo que juega', () => {
    expect(profileFilters({ split: true, nights: true, nightsWord: 'Noches' }).map((f) => f.label)).toEqual(['Todo', 'Individual', 'Dobles', 'Noches']);
    expect(profileFilters({ split: false, nights: true, nightsWord: 'Round robin' }).map((f) => f.label)).toEqual(['Todo', 'Liga y torneos', 'Round robin']);
    expect(profileFilters({ split: false, nights: false, nightsWord: 'Noches' }).map((f) => f.key)).toEqual(['todo']);
  });

  it('qué partidos cuentan con cada filtro', () => {
    const night = pts(1, 'Cancha 1', ['a', 'b'], ['c', 'd'], 14, 10);
    const single = mkMatch({ a: ['a'], b: ['c'] });
    const double = mkMatch({ a: ['a', 'b'], b: ['c', 'd'] });
    const all = [night, single, double];
    const kinds = { individual: [single], dobles: [double] };
    expect(scopeProfileMatches(all, 'todo', kinds)).toEqual(all);
    expect(scopeProfileMatches(all, 'noches', kinds)).toEqual([night]);
    expect(scopeProfileMatches(all, 'sets', kinds)).toEqual([single, double]);
    expect(scopeProfileMatches(all, 'dobles', kinds)).toEqual([double]);
  });
});
