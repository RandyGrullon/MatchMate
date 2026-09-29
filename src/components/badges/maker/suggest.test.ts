import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matchCore';
import type { BowlingEvent, Entry } from '../../../lib/types';
import { mkMatch, sets } from '../../../pages/sports/racket/logic/testMatch';
import { bowlingSuggest, racketSuggest, rangeOfPeriod, suggestsFor, teamSuggest, type SuggestRange } from './suggest';

const SEASON: SuggestRange = { from: '2026-01-01', to: '2026-12-31' };
const names = new Map([
  ['ana', 'Ana'],
  ['luis', 'Luis'],
  ['rosa', 'Rosa'],
  ['pedro', 'Pedro'],
  ['juan', 'Juan'],
]);

// ---------- Boliche ----------

const ev = (id: string, date: string): Pick<BowlingEvent, 'id' | 'date'> => ({ id, date });
/** Una participación con juegos verificados (foto) y, con `draft`, sin verificar. */
const en = (eventId: string, playerId: string, scores: number[], draft = false): Pick<Entry, 'eventId' | 'playerId' | 'scores' | 'photos'> => ({
  eventId,
  playerId,
  scores,
  photos: scores.map(() => (draft ? null : 'p')),
});

const events = [ev('e0', '2025-11-04'), ev('e1', '2026-03-03'), ev('e2', '2026-03-10'), ev('e3', '2026-10-06'), ev('e4', '2026-10-13')];
const entries = [
  // Ana: 12 juegos, de 150 a 190 (mejora 40).
  en('e1', 'ana', [150, 150, 150]),
  en('e2', 'ana', [150, 150, 150]),
  en('e3', 'ana', [190, 190, 190]),
  en('e4', 'ana', [190, 190, 190]),
  // Luis: el mejor promedio, en todas las fechas, pero ya jugaba en 2025.
  en('e0', 'luis', [200, 200, 200]),
  en('e1', 'luis', [200, 200, 200]),
  en('e2', 'luis', [200, 200, 200]),
  en('e3', 'luis', [200, 200, 200]),
  en('e4', 'luis', [200, 200, 200]),
  // Rosa: 180 en 6 juegos, solo en octubre (nueva).
  en('e3', 'rosa', [180, 180, 180]),
  en('e4', 'rosa', [180, 180, 180]),
  // Pedro: 5 juegos (no llega al mínimo) y uno sin verificar.
  en('e1', 'pedro', [250, 250, 250]),
  en('e2', 'pedro', [250, 250]),
  en('e3', 'pedro', [260], true),
];
const bowling = { events, entries, names, range: SEASON };

describe('sugerencias del boliche', () => {
  it('podio: promedio con 6+ juegos verificados, desde el puesto de la plantilla', () => {
    const c = bowlingSuggest('champion', bowling);
    expect(c.list.map((s) => [s.name, s.detail])).toEqual([
      ['Luis', '1.º · Promedio 200 · 12 juegos'],
      ['Rosa', '2.º · Promedio 180 · 6 juegos'],
      ['Ana', '3.º · Promedio 170 · 12 juegos'],
    ]);
    expect(c.list[0]).toMatchObject({ playerIds: ['luis'], teamId: null, place: 1 });
    expect(bowlingSuggest('runner_up', bowling).list.map((s) => s.name)).toEqual(['Rosa', 'Ana']);
    expect(bowlingSuggest('third_place', bowling).list.map((s) => s.name)).toEqual(['Ana']);
  });

  it('mejor promedio pide la mitad de las fechas; estrella del mes, 4 juegos en el mes', () => {
    // 4 fechas jugadas en la temporada: Rosa fue a 2 (la mitad), Pedro no llega a 6 juegos.
    expect(bowlingSuggest('best_average', bowling).list.map((s) => s.name)).toEqual(['Luis', 'Rosa', 'Ana']);
    const oct = bowlingSuggest('player_of_the_month', { ...bowling, range: { from: '2026-10-01', to: '2026-10-31' } });
    expect(oct.list.map((s) => [s.name, s.detail])).toEqual([
      ['Luis', 'Promedio 200 · 6 juegos'],
      ['Ana', 'Promedio 190 · 6 juegos'],
      ['Rosa', 'Promedio 180 · 6 juegos'],
    ]);
  });

  it('gran progreso, asistencia perfecta y revelación', () => {
    expect(bowlingSuggest('most_improved', bowling).list.map((s) => [s.name, s.detail])).toEqual([['Ana', '+40 pinos (150 → 190) · 12 juegos']]);
    expect(bowlingSuggest('perfect_attendance', bowling).list.map((s) => [s.name, s.detail])).toEqual([
      ['Ana', '4 de 4 fechas'],
      ['Luis', '4 de 4 fechas'],
    ]);
    // Nuevos: su primer juego verificado es de la temporada y fueron a la mitad de las fechas. Luis ya jugaba en 2025.
    expect(bowlingSuggest('rookie_of_the_year', bowling).list.map((s) => s.name)).toEqual(['Pedro', 'Rosa', 'Ana']);
  });

  it('lo que no se guarda lo decide la liga', () => {
    expect(bowlingSuggest('mvp', bowling)).toEqual({ list: [], note: 'No hay un MVP guardado: decide la liga.' });
    expect(bowlingSuggest('fair_play', bowling).note).toMatch(/decide la liga/);
    expect(bowlingSuggest('champion', { ...bowling, range: { from: '2027-01-01', to: '2027-12-31' } }).note).toMatch(/6 juegos verificados/);
  });
});

// ---------- Raqueta ----------

const NOW = Date.parse('2026-10-20T00:00:00Z');
const at = (day: string): Partial<Match> => ({ scheduledAt: `${day}T23:00:00Z` });
const win = (a: string[], b: string[], day: string) => sets(a, b, '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }, at(day));

describe('sugerencias de la raqueta', () => {
  const matches = [
    win(['ana'], ['luis'], '2026-03-01'),
    win(['ana'], ['rosa'], '2026-03-02'),
    win(['luis'], ['rosa'], '2026-03-03'),
    win(['ana'], ['luis'], '2026-10-01'),
    // Fuera de la temporada: no cuenta.
    win(['rosa'], ['ana'], '2025-12-01'),
  ];
  const input = { sport: 'tennis' as const, matches, teams: [], names, range: SEASON, byTeam: false, now: NOW, tz: 'America/Santo_Domingo' };

  it('la tabla individual de la temporada', () => {
    expect(racketSuggest('champion', input).list.map((s) => [s.name, s.detail])).toEqual([
      ['Ana', '1.º · 3 de 3 ganados · 100 %'],
      ['Luis', '2.º · 1 de 3 ganados · 33 %'],
      ['Rosa', '3.º · 0 de 2 ganados · 0 %'],
    ]);
    expect(racketSuggest('runner_up', input).list[0].name).toBe('Luis');
    // Mejor récord pide 8 partidos.
    expect(racketSuggest('best_average', input).note).toMatch(/8 partidos/);
    expect(racketSuggest('mvp', input).list).toEqual([]);
  });

  it('por pareja: la tabla de las parejas de temporada, con toda la pareja', () => {
    const teams = [
      { id: 'T1', name: 'Ana / Luis', roster: [{ playerId: 'ana' }, { playerId: 'luis' }] },
      { id: 'T2', name: 'Rosa / Juan', roster: [{ playerId: 'rosa' }, { playerId: 'juan' }] },
    ];
    const list = [sets('T1', 'T2', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }, at('2026-05-01')), sets('T2', 'T1', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }, at('2026-05-02')), sets('T1', 'T2', '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }, at('2026-05-03'))];
    const out = racketSuggest('champion', { ...input, matches: list, teams, byTeam: true });
    expect(out.list.map((s) => [s.name, s.teamId, s.playerIds, s.detail])).toEqual([
      ['Ana / Luis', 'T1', ['ana', 'luis'], '1.º · 2 de 3 ganados · 67 %'],
      ['Rosa / Juan', 'T2', ['rosa', 'juan'], '2.º · 1 de 3 ganados · 33 %'],
    ]);
  });
});

// ---------- Equipos ----------

describe('sugerencias de los equipos', () => {
  const teams = [
    { id: 'T1', name: 'Tigres', roster: [{ playerId: 'ana' }, { playerId: 'luis' }] },
    { id: 'T2', name: 'Leones', roster: [{ playerId: 'rosa' }] },
    { id: 'T3', name: 'Águilas', roster: [{ playerId: 'pedro' }] },
  ];
  const game = (a: string, b: string, pa: number, pb: number, day: string) =>
    mkMatch({ teams: [a, b], status: 'confirmed', format: '', score: { text: `${pa}-${pb}`, sides: [pa, pb] }, winner: pa > pb ? 1 : 2, ...at(day) });
  const matches = [game('T1', 'T2', 80, 70, '2026-04-01'), game('T1', 'T3', 75, 60, '2026-04-08'), game('T2', 'T3', 66, 64, '2026-04-15')];

  it('el podio sale por equipo, con su plantilla', () => {
    const out = teamSuggest('champion', { sport: 'basketball', matches, teams, rules: {}, names, range: SEASON, now: NOW, tz: 'America/Santo_Domingo' });
    expect(out.list.map((s) => [s.name, s.teamId, s.playerIds, s.place])).toEqual([
      ['Tigres', 'T1', ['ana', 'luis'], 1],
      ['Leones', 'T2', ['rosa'], 2],
      ['Águilas', 'T3', ['pedro'], 3],
    ]);
    expect(teamSuggest('third_place', { sport: 'basketball', matches, teams, rules: {}, names, range: SEASON, now: NOW }).list.map((s) => s.name)).toEqual(['Águilas']);
    // Sin líneas de anotación no hay a quién sugerir como MVP.
    expect(teamSuggest('mvp', { sport: 'basketball', matches, teams, rules: {}, names, range: SEASON, now: NOW }).list).toEqual([]);
  });
});

describe('periodo de las sugerencias', () => {
  it('mes, año, temporada de la liga o el año de hoy', () => {
    expect(rangeOfPeriod('OCT 2026', {}, '2026-11-02')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeOfPeriod('FEB 2028', {}, '2026-11-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(rangeOfPeriod('2025', {}, '2026-11-02')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(rangeOfPeriod('TEMP 26/27', { seasonStart: '2026-09-01', seasonEnd: '2027-06-30' }, '2026-11-02')).toEqual({ from: '2026-09-01', to: '2027-06-30' });
    expect(rangeOfPeriod('TEMP 2025', {}, '2026-11-02')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(rangeOfPeriod('', {}, '2026-11-02')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('solo el boliche, la raqueta y los equipos sugieren', () => {
    expect(['bowling', 'padel', 'basketball', 'futsal', 'golf', 'swimming', null].map(suggestsFor)).toEqual(['bowling', 'racket', 'team', 'team', null, null, null]);
  });
});
