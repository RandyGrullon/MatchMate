import { describe, expect, it } from 'vitest';
import type { Match } from '../../../../lib/data/matches';
import type { ScheduleEntrant } from './league';
import { sets } from './testMatch';
import {
  bracketDrafts,
  bracketKeyOf,
  bracketTodo,
  categoryBracket,
  groupDrafts,
  groupsDone,
  groupStage,
  groupTables,
  makeGroups,
  newCategory,
  parseTourneyConfig,
  qualifiers,
  suggestGroups,
  type TourneyCategory,
} from './tourney';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const entrants = (list: string[]) => new Map<string, ScheduleEntrant>(list.map((id) => [id, { id, players: [`${id}a`, `${id}b`], team: true }]));
const NOW = Date.parse('2026-10-20T00:00:00Z');
const win = (a: string, b: string, extra: Partial<Match> = {}) => sets(a, b, '6-2 6-2', 1, { sets: [2, 0], games: [12, 4] }, extra);

describe('configuración del torneo', () => {
  it('categorías con id corto, sin repetir; lo demás saneado', () => {
    const c = parseTourneyConfig({ categories: [{ id: 'A', pairs: ['x', 'x', 'y'], groups: 99 }, { id: 'A' }, { id: 'no válido' }, { id: 'B', name: '  Damas  ' }] });
    expect(c.categories.map((x) => [x.id, x.name, x.pairs, x.groups])).toEqual([
      ['A', 'Categoría A', ['x', 'y'], 16],
      ['B', 'Damas', [], 0],
    ]);
    expect(suggestGroups(5)).toBe(0);
    expect(suggestGroups(11)).toBe(3);
  });
});

describe('grupos y cuadro', () => {
  it('11 parejas en 3 grupos en zigzag, cruces 1A–2B y el cuadro de 8 con pases directos', () => {
    const cat: TourneyCategory = { ...newCategory('A'), pairs: ids(11), groups: 3, perGroup: 2, thirdPlace: true };
    const groups = makeGroups(cat);
    expect(groups).toEqual([
      ['T1', 'T6', 'T7'],
      ['T2', 'T5', 'T8', 'T11'],
      ['T3', 'T4', 'T9', 'T10'],
    ]);
    cat.groupsOf = groups;
    const drafts = groupDrafts(cat, groups, entrants(ids(11)), { eventId: 'E' });
    expect(drafts).toHaveLength(3 + 6 + 6);
    expect(drafts[0]).toMatchObject({ eventId: 'E', stage: 'Categoría A · Grupo A', format: 'sets', sides: [{ teamId: expect.any(String), players: [{}, {}] }, {}] });

    // Resultados: gana siempre el mejor sembrado (el de número más bajo).
    const n = (id: string) => Number(id.slice(1));
    const matches: Match[] = drafts.map((d, i) => {
      const [a, b] = [d.sides[0].teamId!, d.sides[1].teamId!];
      const [w, l] = n(a) < n(b) ? [a, b] : [b, a];
      return win(w, l, { id: `g${i}`, stage: d.stage!, eventId: 'E' });
    });
    expect(groupsDone(cat, matches.slice(1), NOW)).toMatchObject({ done: false, pending: 0, missing: 1 });
    expect(groupsDone(cat, matches, NOW)).toEqual({ done: true, pending: 0, total: 15, missing: 0 });
    const tables = groupTables('padel', cat, matches, { now: NOW });
    expect(tables.map((t) => t.slice(0, 2).map((r) => r.id))).toEqual([
      ['T1', 'T6'],
      ['T2', 'T5'],
      ['T3', 'T4'],
    ]);
    const q = qualifiers('padel', cat, matches, { now: NOW });
    expect(q.map((x) => x.label)).toEqual(['1A', '1B', '1C', expect.any(String), expect.any(String), expect.any(String)]);
    cat.seeds = q.map((x) => x.id);

    // 6 clasificados → cuadro de 8: los dos primeros pasan directo a semifinales.
    const b = categoryBracket(cat, matches, NOW)!;
    expect(b.size).toBe(8);
    expect(b.matches.filter((m) => m.bye)).toHaveLength(2);
    const todo = bracketTodo(cat, b, matches);
    // Siembra de 8: 1-8 (pase), 4-5, 2-7 (pase), 3-6.
    expect(todo.create.map((m) => m.key)).toEqual(['R1-2', 'R1-4']);
    const bd = bracketDrafts(cat, b, todo.create, entrants(ids(11)), { eventId: 'E' });
    expect(bd[0]).toMatchObject({ bracketKey: 'A-R1-2', round: 101, stage: 'Categoría A · Cuartos de final', sides: [{ seed: 4 }, { seed: 5 }] });
  });

  it('el cuadro avanza con los ganadores que cuentan; si corrigen un resultado, el partido que sigue se actualiza', () => {
    const cat: TourneyCategory = { ...newCategory('B'), pairs: ids(4), seeds: ids(4), thirdPlace: true };
    const semi1 = win('T1', 'T4', { bracketKey: bracketKeyOf(cat, 'R1-1') });
    const semi2 = win('T3', 'T2', { bracketKey: bracketKeyOf(cat, 'R1-2') });
    let b = categoryBracket(cat, [semi1, semi2], NOW)!;
    const todo = bracketTodo(cat, b, [semi1, semi2]);
    expect(todo.create.map((m) => [m.key, m.side1, m.side2])).toEqual([
      ['R2-1', 'T1', 'T3'],
      ['P3', 'T4', 'T2'],
    ]);
    // La final ya creada con T1 y T3; corrigen la semi 2: ganó T2.
    const final = sets('T1', 'T3', '', 1, { sets: [0, 0], games: [0, 0] }, { status: 'scheduled', winner: null, score: null, bracketKey: bracketKeyOf(cat, 'R2-1') });
    const fixed = win('T2', 'T3', { id: semi2.id, bracketKey: bracketKeyOf(cat, 'R1-2') });
    // Los lados del partido corregido van T3 (1) y T2 (2): el ganador es T2 = lado 1 aquí.
    b = categoryBracket(cat, [semi1, fixed, final], NOW)!;
    expect(bracketTodo(cat, b, [semi1, fixed, final]).update.map((u) => [u.match.id, u.bm.side2])).toEqual([[final.id, 'T2']]);
  });

  it('un partido de grupo anulado no traba el cuadro: está (no falta) y no queda pendiente', () => {
    const cat: TourneyCategory = { ...newCategory('A'), pairs: ids(3), groups: 1, perGroup: 2, thirdPlace: false, groupsOf: [ids(3)] };
    const stage = groupStage(cat, 0);
    const m12 = win('T1', 'T2', { stage });
    const m13 = win('T1', 'T3', { stage });
    const m23 = win('T2', 'T3', { stage, status: 'void' });
    // Antes: {done: false, missing: 1} y «Crear los 1 partidos que faltan» no creaba nada.
    expect(groupsDone(cat, [m12, m13, m23], NOW)).toEqual({ done: true, pending: 0, total: 2, missing: 0 });
    expect(qualifiers('padel', cat, [m12, m13, m23], { now: NOW }).map((x) => x.id)).toEqual(['T1', expect.any(String)]);
    // El cruce anulado y rehecho cuenta una vez: si además borran otro, falta ese.
    const again = win('T3', 'T2', { stage, status: 'scheduled', winner: null, score: null });
    expect(groupsDone(cat, [m12, m23, again], NOW)).toEqual({ done: false, pending: 1, total: 2, missing: 1 });
  });

  it('las fases de cada grupo: «Categoría A · Grupo B»', () => {
    expect(groupStage({ name: 'Categoría A' }, 1)).toBe('Categoría A · Grupo B');
  });
});
