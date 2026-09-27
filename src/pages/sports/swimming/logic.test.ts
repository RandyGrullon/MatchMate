import { describe, expect, it } from 'vitest';
import { POINTS_6_LANES, validateSwimEvent } from '../../../sports/swimming';
import type { SwimEntry, SwimEventItem, SwimMeet, SwimSeason } from '../../../lib/data/swimming';
import {
  canEnter,
  clubMeetTemplate,
  draftHeats,
  eventHasResults,
  eventResults,
  groupForMeet,
  groupLabel,
  leagueYear,
  meetScores,
  minorAgeProblem,
  minorByBirthYear,
  meetStage,
  pendingHeats,
  publishedHeats,
  raceTitle,
  seasonTable,
  sheetAssignments,
  swapLanes,
  timeTrialTemplate,
} from './logic';

let n = 0;
const entry = (over: Partial<SwimEntry>): SwimEntry => ({
  id: `e${++n}`,
  meetId: 'm1',
  swimEventId: 'ev1',
  playerId: `p${n}`,
  clubId: null,
  ageGroup: null,
  seed: null,
  heat: null,
  lane: null,
  time: null,
  status: 'ok',
  resultAt: null,
  ...over,
});

const ev = (over: Partial<SwimEventItem> = {}): SwimEventItem => ({
  id: 'ev1',
  meetId: 'm1',
  num: 1,
  distance: 50,
  stroke: 'libre',
  pool: 25,
  gender: 'X',
  ageGroups: [],
  ...over,
});

const meet = (over: Partial<SwimMeet> = {}): SwimMeet => ({
  id: 'm1',
  type: 'encuentro',
  name: '',
  date: '2026-10-10',
  startTime: null,
  announcement: '',
  pool: 25,
  lanes: 6,
  points: POINTS_6_LANES,
  ageGroups: 'cccan',
  heatsPublishedAt: null,
  finalizedAt: null,
  ...over,
});

const done = (time: number | null, over: Partial<SwimEntry> = {}) => entry({ time, resultAt: '2026-10-10T10:00:00Z', ...over });

describe('nombres', () => {
  it('prueba y categoría', () => {
    expect(raceTitle(ev({ num: 3, gender: 'F', ageGroups: ['9-10', '11-12'] }))).toBe('Prueba 3 · 50 m Libre · Femenino · 9-10, 11-12');
    expect(groupLabel('8-')).toBe('8 y menos');
    expect(groupLabel('m40-44')).toBe('40-44');
    expect(groupLabel(null)).toBe('Abierta');
  });
});

describe('plantillas', () => {
  it('encuentro de club: pruebas que existen en esa piscina, numeradas', () => {
    for (const pool of [25, 50] as const) {
      const list = clubMeetTemplate(pool, 'cccan');
      expect(list.every((e) => validateSwimEvent({ ...e, pool } as Parameters<typeof validateSwimEvent>[0]).length === 0)).toBe(true);
      expect(list.map((e) => e.num)).toEqual(list.map((_, k) => k + 1));
      expect(list.length).toBeLessThanOrEqual(18);
    }
    expect(clubMeetTemplate(25, 'cccan')).toHaveLength(14);
    expect(clubMeetTemplate(50, 'cccan')).toHaveLength(12);
    expect(clubMeetTemplate(25, 'masters').some((e) => e.distance === 25)).toBe(false);
    expect(timeTrialTemplate().every((e) => e.gender === 'X' && !e.ageGroups.length)).toBe(true);
  });
});

describe('resultados', () => {
  it('puesto por categoría en finales por tiempo; DQ sin puesto; puntos repartidos en empates', () => {
    const list = [
      done(3000, { ageGroup: '9-10', clubId: 'A' }),
      done(3100, { ageGroup: '9-10', clubId: 'B' }),
      done(3100, { ageGroup: '9-10', clubId: 'A' }),
      done(2900, { ageGroup: '11-12', clubId: 'B' }),
      done(2800, { ageGroup: '11-12', clubId: 'A', status: 'dq' }),
      done(null, { ageGroup: '11-12', clubId: 'A', status: 'dns' }),
      entry({ ageGroup: '9-10', clubId: 'B', seed: 3500 }), // todavía no nada
      entry({ swimEventId: 'otra', time: 1000, resultAt: 'x' }),
    ];
    const groups = eventResults(ev(), list, POINTS_6_LANES);
    expect(groups.map((g) => g.ageGroup)).toEqual(['9-10', '11-12']);
    expect(groups[0].rows.map((r) => [r.place, r.points, r.tied])).toEqual([
      [1, 6, false],
      [2, 3.5, true],
      [2, 3.5, true],
    ]);
    expect(groups[1].rows.map((r) => [r.place, r.status])).toEqual([
      [1, 'ok'],
      [null, 'dq'],
      [null, 'dns'],
    ]);
    const s = meetScores([ev()], list, POINTS_6_LANES);
    expect(s.clubs.map((c) => [c.teamId, c.points])).toEqual([
      ['A', 9.5],
      ['B', 9.5],
    ]);
    expect(s.clubs.map((c) => c.rank)).toEqual([1, 1]);
    expect(s.medals.find((m) => m.id === 'B')).toMatchObject({ gold: 1, silver: 1 });
  });

  it('temporada: suma por encuentro; el control de marcas no cuenta', () => {
    const season: SwimSeason = {
      meets: [meet({ id: 'm1', date: '2026-03-01' }), meet({ id: 'm2', date: '2026-05-01' }), meet({ id: 'm3', type: 'control', date: '2026-06-01' }), meet({ id: 'm4', date: '2025-01-01' })],
      events: [ev({ id: 'a', meetId: 'm1' }), ev({ id: 'b', meetId: 'm2' }), ev({ id: 'c', meetId: 'm3' }), ev({ id: 'd', meetId: 'm4' })],
      entries: [
        done(3000, { meetId: 'm1', swimEventId: 'a', clubId: 'A' }),
        done(3100, { meetId: 'm1', swimEventId: 'a', clubId: 'B' }),
        done(3000, { meetId: 'm2', swimEventId: 'b', clubId: 'B' }),
        done(2000, { meetId: 'm3', swimEventId: 'c', clubId: 'A' }),
        done(2000, { meetId: 'm4', swimEventId: 'd', clubId: 'A' }),
      ],
    };
    const t = seasonTable(season, '2026');
    expect(t.meets.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(t.clubs.map((c) => [c.clubId, c.points, c.rank])).toEqual([
      ['B', 10, 1],
      ['A', 6, 2],
    ]);
    expect(t.clubs[0].byMeet).toEqual({ m1: 4, m2: 6 });
    expect(seasonTable(season).meets.map((m) => m.id)).toEqual(['m4', 'm1', 'm2']);
  });
});

describe('hoja de series', () => {
  it('borrador con el motor, cambiar carriles y lo que se publica', () => {
    const list = Array.from({ length: 7 }, (_, k) => entry({ seed: k === 6 ? null : 3000 + k * 10 }));
    const heats = draftHeats(ev(), list, 6);
    expect(heats.map((h) => h.lanes.filter((l) => l.entry).length)).toEqual([3, 4]);
    expect(heats[1].lanes.find((l) => l.lane === 3)?.entry?.seed).toBe(3000);
    const swapped = swapLanes(heats, { heat: 2, lane: 3 }, { heat: 1, lane: 6 });
    expect(swapped[0].lanes.find((l) => l.lane === 6)?.entry?.seed).toBe(3000);
    expect(swapped[1].lanes.find((l) => l.lane === 3)?.entry).toBeNull();
    const a = sheetAssignments(swapped);
    expect(a).toHaveLength(7);
    expect(new Set(a.map((x) => `${x.heat}:${x.lane}`)).size).toBe(7);
  });

  it('la hoja publicada, quienes quedaron sin serie y las series por cronometrar', () => {
    const list = [
      entry({ heat: 1, lane: 3 }),
      entry({ heat: 1, lane: 4, time: 3000, resultAt: 'x' }),
      entry({ heat: 2, lane: 3 }),
      entry({}),
    ];
    const { heats, unassigned } = publishedHeats(ev(), list, 6);
    expect(heats.map((h) => h.n)).toEqual([1, 2]);
    expect(heats[0].lanes).toHaveLength(6);
    expect(unassigned).toHaveLength(1);
    expect(pendingHeats(ev(), list)).toEqual([2]);
    expect(eventHasResults('ev1', list)).toBe(true);
    expect(eventHasResults('ev1', [entry({})])).toBe(false);
  });
});

describe('inscripciones y estado', () => {
  it('sexo y categoría (lo que se sabe)', () => {
    const girls = ev({ gender: 'F', ageGroups: ['9-10'] });
    expect(canEnter(girls, { sex: 'F', group: '9-10' })).toBe(true);
    expect(canEnter(girls, { sex: 'M', group: '9-10' })).toBe(false);
    expect(canEnter(girls, { sex: null, group: '11-12' })).toBe(false);
    expect(canEnter(girls, { sex: null, group: '9-10' })).toBe(true);
    expect(canEnter(ev(), { sex: null, group: null })).toBe(true);
  });

  it('categoría para el año del encuentro', () => {
    expect(groupForMeet('2026-10-10', 'cccan', { birthYear: 2016 })).toBe('9-10');
    expect(groupForMeet('2027-01-10', 'cccan', { birthYear: 2016 })).toBe('11-12');
    expect(groupForMeet('2026-10-10', 'masters', { birthYear: 1980 })).toBe('m45-49');
    expect(groupForMeet('2026-10-10', 'cccan', { category: '13-14', categoryYear: 2026 })).toBe('13-14');
    expect(groupForMeet('2027-10-10', 'cccan', { category: '13-14', categoryYear: 2026 })).toBeNull();
  });

  it('etapas del encuentro', () => {
    expect(meetStage(meet(), 0)).toBe('programa');
    expect(meetStage(meet(), 3)).toBe('inscripciones');
    expect(meetStage(meet({ heatsPublishedAt: 'x' }), 3)).toBe('series');
    expect(meetStage(meet({ heatsPublishedAt: 'x', finalizedAt: 'y' }), 3)).toBe('final');
  });
});

describe('menor por el año de nacimiento', () => {
  it('año de la liga en su zona horaria', () => {
    // 1 de enero 2027 a las 02:00 UTC: en Santo Domingo (UTC−4) todavía es 2026.
    const now = Date.UTC(2027, 0, 1, 2);
    expect(leagueYear('America/Santo_Domingo', now)).toBe(2026);
    expect(leagueYear('UTC', now)).toBe(2027);
    expect(leagueYear(undefined, now)).toBe(2026);
    expect(leagueYear('No/Existe', now)).toBe(2027);
  });

  it('menor si le faltan años para 18 este año (la misma cuenta que la base)', () => {
    expect(minorByBirthYear(2017, 2026)).toBe(true);
    expect(minorByBirthYear(2009, 2026)).toBe(true);
    expect(minorByBirthYear(2008, 2026)).toBe(false);
    expect(minorByBirthYear(null, 2026)).toBe(false);
  });

  it('con año de menor no se guarda como adulto (ni en una liga sin menores ni con cuenta)', () => {
    const base = { year: 2026, isMinor: false, editing: false, hasAccount: false, minorsOk: false };
    // Adulto o sin año: se puede.
    expect(minorAgeProblem({ ...base, birthYear: 1990 })).toBeNull();
    expect(minorAgeProblem({ ...base, birthYear: null })).toBeNull();
    expect(minorAgeProblem({ ...base, birthYear: 2008 })).toBeNull();
    // Niña en una liga pública sin menores: no se puede (antes solo salía un aviso y se guardaba como adulta).
    expect(minorAgeProblem({ ...base, birthYear: 2017 })).toMatch(/no admite menores/);
    expect(minorAgeProblem({ ...base, birthYear: 2017, minorsOk: true })).toMatch(/márcalo como menor/);
    expect(minorAgeProblem({ ...base, birthYear: 2017, minorsOk: true, isMinor: true })).toBeNull();
    // Cambiando un nadador adulto o con cuenta: tampoco.
    expect(minorAgeProblem({ ...base, birthYear: 2012, editing: true, minorsOk: true })).toMatch(/no está registrado como menor/);
    expect(minorAgeProblem({ ...base, birthYear: 2012, editing: true, hasAccount: true })).toMatch(/no tienen cuenta/);
    expect(minorAgeProblem({ ...base, birthYear: 2012, editing: true, isMinor: true, minorsOk: true })).toBeNull();
  });
});
