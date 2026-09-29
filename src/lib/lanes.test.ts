import { describe, expect, it } from 'vitest';
import {
  formatLanes,
  groupLanes,
  hasTeams,
  laneCandidates,
  laneChoices,
  laneOf,
  lanesNeeded,
  lanesPublished,
  lanesText,
  orderByAverage,
  parseLanes,
  unpublishedCount,
  type LaneRow,
} from './lanes';

const row = (playerId: string, lane: number, position: number, publishedAt: string | null = null): LaneRow => ({
  eventId: 'e1',
  playerId,
  lane,
  position,
  publishedAt,
});

const names: Record<string, string> = { a: 'Ana', b: 'Beto', c: 'Carla', d: 'Dani', e: 'Eva' };
const nameOf = (id: string) => names[id] ?? '?';

describe('pistas: lo que escribe el admin', () => {
  it('rangos, listas y mezcla, sin repetir y en el orden escrito', () => {
    expect(parseLanes('5-9')).toEqual([5, 6, 7, 8, 9]);
    expect(parseLanes('3, 5, 7-8')).toEqual([3, 5, 7, 8]);
    expect(parseLanes(' 5 - 7 ; 6 12 ')).toEqual([5, 6, 7, 12]);
    expect(parseLanes('9-7')).toEqual([9, 8, 7]);
    expect(parseLanes('5–7')).toEqual([5, 6, 7]);
    expect(parseLanes('4')).toEqual([4]);
    // Como se dice (con el teclado de texto del teléfono).
    expect(parseLanes('5 a 9')).toEqual([5, 6, 7, 8, 9]);
    expect(parseLanes('5 al 7, 12')).toEqual([5, 6, 7, 12]);
    expect(parseLanes('3, 5 y 7')).toEqual([3, 5, 7]);
  });

  it('lo que no es una pista: null', () => {
    expect(parseLanes('')).toBeNull();
    expect(parseLanes('   ')).toBeNull();
    expect(parseLanes('0')).toBeNull();
    expect(parseLanes('1000')).toBeNull();
    expect(parseLanes('a-b')).toBeNull();
    expect(parseLanes('5-')).toBeNull();
    expect(parseLanes('1-200')).toBeNull();
    expect(parseLanes('1-100')).toHaveLength(100);
    expect(parseLanes('1-100, 101')).toBeNull();
  });

  it('se vuelve a escribir corto (para recordarlo)', () => {
    expect(formatLanes([5, 6, 7, 8, 9, 12])).toBe('5-9, 12');
    expect(formatLanes([3, 5, 7, 8])).toBe('3, 5, 7-8');
    expect(formatLanes([])).toBe('');
    expect(parseLanes(formatLanes([1, 2, 3, 10, 11]))).toEqual([1, 2, 3, 10, 11]);
  });

  it('pistas que hacen falta', () => {
    expect(lanesNeeded(10, 4)).toBe(3);
    expect(lanesNeeded(8, 4)).toBe(2);
    expect(lanesNeeded(0, 4)).toBe(0);
  });
});

describe('pistas: agrupar, WhatsApp y la pista de cada uno', () => {
  const rows = [row('c', 7, 2), row('a', 5, 1), row('b', 7, 1), row('d', 7, 3), row('e', 5, 2)];

  it('por pista y en su orden', () => {
    expect(groupLanes(rows, nameOf)).toEqual([
      {
        lane: 5,
        players: [
          { playerId: 'a', name: 'Ana', position: 1 },
          { playerId: 'e', name: 'Eva', position: 2 },
        ],
      },
      {
        lane: 7,
        players: [
          { playerId: 'b', name: 'Beto', position: 1 },
          { playerId: 'c', name: 'Carla', position: 2 },
          { playerId: 'd', name: 'Dani', position: 3 },
        ],
      },
    ]);
  });

  it('el texto para WhatsApp: una línea por pista (con el nombre del evento arriba si viene)', () => {
    const groups = groupLanes(rows, nameOf);
    expect(lanesText(groups)).toBe('Pista 5: Ana, Eva\nPista 7: Beto, Carla, Dani');
    expect(lanesText(groups, 'Pistas · Práctica')).toBe('Pistas · Práctica\n\nPista 5: Ana, Eva\nPista 7: Beto, Carla, Dani');
    expect(lanesText([])).toBe('');
  });

  it('la pista de uno, si se publicaron y cuántas cambiaron sin avisar', () => {
    expect(laneOf(rows, 'c')?.lane).toBe(7);
    expect(laneOf(rows, 'x')).toBeNull();
    expect(laneOf(rows, null)).toBeNull();
    expect(lanesPublished(rows)).toBe(false);
    const published = [row('a', 5, 1, '2026-09-28T20:00:00Z'), row('b', 5, 2)];
    expect(lanesPublished(published)).toBe(true);
    expect(unpublishedCount(published)).toBe(1);
  });

  it('para mover: las pistas escritas y las que ya tienen gente, en orden', () => {
    expect(laneChoices([9, 8], rows)).toEqual([5, 7, 8, 9]);
    expect(laneChoices(null, rows)).toEqual([5, 7]);
  });
});

describe('pistas: quiénes entran y en qué orden', () => {
  it('los inscritos y los que dijeron «voy», sin repetir', () => {
    const event = { rsvp: { b: true, c: false, d: true } };
    expect(laneCandidates(event, [{ playerId: 'a' }, { playerId: 'b' }]).sort()).toEqual(['a', 'b', 'd']);
    expect(laneCandidates({}, [])).toEqual([]);
  });

  it('por promedio, de mayor a menor; sin promedio al final; empates por nombre', () => {
    const players = Object.entries(names).map(([id, name]) => ({ id, name }));
    const avgs = new Map([
      ['a', 180],
      ['b', 200],
      ['c', 180],
      ['d', 150],
    ]);
    expect(orderByAverage(['a', 'b', 'c', 'd', 'e'], avgs, players)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('equipos armados', () => {
    expect(hasTeams([{ teamId: null }, { teamId: 't1' }])).toBe(true);
    expect(hasTeams([{ teamId: null }])).toBe(false);
  });
});
