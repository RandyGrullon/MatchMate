import { describe, expect, it } from 'vitest';
import { CCCAN_AGE_GROUPS } from '../../../sports/swimming';
import type { SwimEntry, SwimEventItem, SwimMeet } from '../../../lib/data/swimming';
import type { Player } from '../../../lib/types';
import {
  buildDraft,
  clubLine,
  clubValid,
  distanceForStroke,
  entryCounts,
  filterSwimmers,
  meetChanges,
  meetFormValid,
  moveEvent,
  parsePoints,
  pointsAfterLanes,
  rulesDirty,
  sheetEvents,
  strokeDistances,
  swimmerChanges,
  swimmerFormCheck,
  swimmerFormStart,
  swimmerLine,
  swimmerTag,
  tapLane,
  templateEvents,
  templateOptions,
  toggleAgeGroup,
  type SwimmerEditing,
} from './admin';

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

const ev = (over: Partial<SwimEventItem> = {}): SwimEventItem => ({ id: 'ev1', meetId: 'm1', num: 1, distance: 50, stroke: 'libre', pool: 25, gender: 'X', ageGroups: [], ...over });

const meet = (over: Partial<SwimMeet> = {}): SwimMeet => ({
  id: 'm1',
  type: 'encuentro',
  name: 'Copa de Ejemplo',
  date: '2026-10-10',
  startTime: null,
  announcement: '',
  pool: 25,
  lanes: 6,
  points: [6, 4, 3, 2, 1],
  ageGroups: 'cccan',
  heatsPublishedAt: null,
  finalizedAt: null,
  ...over,
});

const player = (over: Partial<Player> = {}): Player => ({ id: 'p1', name: 'Nadador Uno', averageOverride: null, ...over });

describe('el formulario del encuentro', () => {
  it('lee los puntos con guiones, comas o espacios', () => {
    expect(parsePoints('6-4-3-2-1')).toEqual([6, 4, 3, 2, 1]);
    expect(parsePoints('9 7 6, 5')).toEqual([9, 7, 6, 5]);
    expect(parsePoints('')).toBeNull();
    expect(parsePoints('6-x')).toBeNull();
    expect(parsePoints('101')).toBeNull();
  });

  it('los puntos siguen a los carriles solo si no se cambiaron a mano', () => {
    expect(pointsAfterLanes('6-4-3-2-1', 6, 8)).toBe('9-7-6-5-4-3-2-1');
    expect(pointsAfterLanes('5-3-1', 6, 8)).toBe('5-3-1');
  });

  it('las plantillas dicen cuántas pruebas traen', () => {
    expect(templateOptions(25, 'cccan').map((o) => o.label)).toEqual([
      `Pruebas de un encuentro de club (${templateEvents('club', 25, 'cccan').length})`,
      'Pruebas de control de marcas (5)',
      'Sin pruebas',
    ]);
    expect(templateEvents('none', 25, 'cccan')).toEqual([]);
  });

  it('se guarda con fecha, puntos que se entienden y un nombre que cabe', () => {
    expect(meetFormValid({ date: '2026-10-10', points: [6], name: 'Copa' })).toBe(true);
    expect(meetFormValid({ date: '', points: [6], name: '' })).toBe(false);
    expect(meetFormValid({ date: '2026-10-10', points: null, name: '' })).toBe(false);
    expect(meetFormValid({ date: '2026-10-10', points: [6], name: 'x'.repeat(81) })).toBe(false);
  });

  it('al cambiar manda solo lo que cambió (el torneo no cambia de tipo)', () => {
    const m = meet();
    const same = { type: 'encuentro' as const, name: 'Copa de Ejemplo', date: m.date, startTime: null, announcement: '', pool: 25 as const, lanes: 6, points: [6, 4, 3, 2, 1], ageGroups: 'cccan' as const };
    expect(meetChanges(m, same)).toEqual({});
    expect(meetChanges(m, { ...same, lanes: 8, startTime: '08:00', type: 'control' })).toEqual({ lanes: 8, startTime: '08:00', type: 'control' });
    expect(meetChanges(meet({ type: 'torneo' }), { ...same, type: 'control' })).toEqual({});
  });
});

describe('el programa', () => {
  it('cuenta los inscritos de cada prueba', () => {
    const counts = entryCounts([entry({ swimEventId: 'a' }), entry({ swimEventId: 'a' }), entry({ swimEventId: 'b' })]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });

  it('la distancia sigue al estilo y a la piscina', () => {
    expect(strokeDistances('combinado', 25)).not.toContain(25);
    expect(distanceForStroke('libre', 100, 25)).toBe(100);
    expect(distanceForStroke('combinado', 25, 25)).toBe(strokeDistances('combinado', 25)[0]);
  });

  it('las categorías quedan en su orden', () => {
    const all = CCCAN_AGE_GROUPS;
    const picked = toggleAgeGroup(all, [all[2].id], all[0].id);
    expect(picked).toEqual([all[0].id, all[2].id]);
    expect(toggleAgeGroup(all, picked, all[0].id)).toEqual([all[2].id]);
  });

  it('subir o bajar cambia los números con la de al lado', () => {
    const list = [ev({ id: 'a', num: 1 }), ev({ id: 'b', num: 2 })];
    expect(moveEvent(list, 'b', -1)?.map((e) => [e.id, e.num])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(moveEvent(list, 'a', -1)).toBeNull();
    expect(moveEvent(list, 'b', 1)).toBeNull();
  });
});

describe('el borrador de las series', () => {
  const entries = [
    entry({ id: 'x1', swimEventId: 'a', seed: 3000 }),
    entry({ id: 'x2', swimEventId: 'a', seed: 3100 }),
    entry({ id: 'x3', swimEventId: 'a', seed: 3200 }),
    entry({ id: 'y1', swimEventId: 'b', time: 3500, resultAt: '2026-10-10T12:00:00Z' }),
  ];
  const events = [ev({ id: 'a', num: 1 }), ev({ id: 'b', num: 2 }), ev({ id: 'c', num: 3 })];

  it('solo se arman las pruebas con inscritos y sin tiempos', () => {
    const { withEntries, seedable } = sheetEvents(events, entries);
    expect(withEntries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(seedable.map((e) => e.id)).toEqual(['a']);
  });

  it('tocar dos carriles de la misma prueba los cambia', () => {
    const draft = buildDraft([events[0]], entries, 6);
    const lanes = draft.get('a')![0].lanes;
    const filled = lanes.filter((l) => l.entry);
    const [first, second] = [filled[0], filled[1]];
    const one = tapLane(draft, null, { ev: 'a', heat: 1, lane: first.lane });
    expect(one.pick).toEqual({ ev: 'a', heat: 1, lane: first.lane });
    const two = tapLane(one.draft, one.pick, { ev: 'a', heat: 1, lane: second.lane });
    expect(two.pick).toBeNull();
    const after = two.draft.get('a')![0].lanes;
    expect(after.find((l) => l.lane === first.lane)?.entry?.id).toBe(second.entry!.id);
    expect(after.find((l) => l.lane === second.lane)?.entry?.id).toBe(first.entry!.id);
    // El mismo carril otra vez: se desmarca.
    expect(tapLane(draft, one.pick, { ev: 'a', heat: 1, lane: first.lane }).pick).toBeNull();
  });
});

describe('los nadadores', () => {
  it('busca por nombre y filtra por club (o sin club)', () => {
    const players = [player({ id: 'p1', name: 'Nadador Uno' }), player({ id: 'p2', name: 'Nadadora Dos' })];
    const info = new Map([['p1', { clubId: 'c1' }]]);
    expect(filterSwimmers(players, 'dos', '', info).map((p) => p.id)).toEqual(['p2']);
    expect(filterSwimmers(players, '', 'c1', info).map((p) => p.id)).toEqual(['p1']);
    expect(filterSwimmers(players, '', '-', info).map((p) => p.id)).toEqual(['p2']);
  });

  it('la línea y la marca de cada uno', () => {
    expect(swimmerLine('Club de Ejemplo', { birthYear: 2015, sex: 'F' })).toBe('Club de Ejemplo · 2015 · Femenino');
    expect(swimmerLine(null, undefined)).toBe('Sin club');
    expect(swimmerTag(player({ isMinor: true }), undefined)).toEqual({ label: 'Menor sin permiso', tone: 'danger' });
    expect(swimmerTag(player({ isMinor: true }), { consentAt: '2026-01-01' })).toEqual({ label: 'Menor', tone: 'accent' });
    expect(swimmerTag(player({ uid: 'u1' }), undefined)).toEqual({ label: 'Con cuenta', tone: 'ok' });
    expect(swimmerTag(player(), undefined)).toBeNull();
  });

  it('un menor necesita año, sexo y el permiso del tutor', () => {
    const f = { ...swimmerFormStart(null, { minorsOk: true }), name: 'Nadador Uno', year: '2015' };
    expect(f.isMinor).toBe(true);
    const o = { thisYear: 2026, editing: null, minorsOk: true };
    expect(swimmerFormCheck(f, o).valid).toBe(false);
    expect(swimmerFormCheck({ ...f, sex: 'M', consent: true }, o).valid).toBe(true);
    expect(swimmerFormCheck({ ...f, year: '1850' }, o).badYear).toBe(true);
  });

  it('con año de menor y sin marcarlo como menor, dice qué pasa', () => {
    const f = { ...swimmerFormStart(null, { minorsOk: false }), name: 'Nadador Uno', year: '2015' };
    const r = swimmerFormCheck(f, { thisYear: 2026, editing: null, minorsOk: false });
    expect(r.valid).toBe(false);
    expect(r.ageProblem).toMatch(/no admite menores/);
  });

  it('el entrenador solo registra en su club', () => {
    const f = { ...swimmerFormStart(null, { minorsOk: false, fixedClub: 'c1' }), name: 'Nadador Uno' };
    expect(f.club).toBe('c1');
    expect(swimmerFormCheck(f, { thisYear: 2026, editing: null, minorsOk: false, fixedClub: 'c1' }).valid).toBe(true);
    expect(swimmerFormCheck({ ...f, club: '' }, { thisYear: 2026, editing: null, minorsOk: false, fixedClub: 'c1' }).valid).toBe(false);
  });

  it('al cambiar manda solo lo que cambió', () => {
    const editing: SwimmerEditing = {
      player: player({ name: 'Nadador Uno' }),
      info: { playerId: 'p1', clubId: 'c1', category: null, categoryYear: null },
      priv: { playerId: 'p1', birthYear: 1990, sex: 'M', guardianName: null, consentAt: null },
    };
    const f = swimmerFormStart(editing, { minorsOk: false });
    expect(swimmerChanges(editing, f, 1990)).toEqual({});
    expect(swimmerChanges(editing, { ...f, club: '', sex: 'F' }, 1991)).toEqual({ clubId: null, sex: 'F', birthYear: 1991 });
  });
});

describe('los clubes', () => {
  it('nombre y sigla', () => {
    expect(clubValid('Club de Ejemplo', 'CDE')).toBe(true);
    expect(clubValid('  ', '')).toBe(false);
    expect(clubValid('Club', 'MUYLARGA9')).toBe(false);
  });

  it('la línea del club', () => {
    expect(clubLine(1, null)).toBe('1 nadador');
    expect(clubLine(3, 'Juan Pérez')).toBe('3 nadadores · Entrena: Juan Pérez');
  });

  it('las reglas cambiaron', () => {
    const r = { pool: 25 as const, lanes: 6, points: [6, 4, 3, 2, 1], ageGroups: 'cccan' as const };
    expect(rulesDirty({ pool: 25, lanes: 6, points: '6-4-3-2-1', ageGroups: 'cccan' }, r)).toBe(false);
    expect(rulesDirty({ pool: 50, lanes: 6, points: '6-4-3-2-1', ageGroups: 'cccan' }, r)).toBe(true);
  });
});
