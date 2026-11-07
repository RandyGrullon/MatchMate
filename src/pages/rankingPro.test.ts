/**
 * Lo de la Tabla que no es pantalla: los números de la temporada con el más mejorado, «Temporada ▾», el vacío y la
 * imagen para compartir (con datos ficticios).
 */
import { describe, expect, it } from 'vitest';
import type { Entry } from '../lib/types';
import { DEFAULT_HCP, standingsTable } from '../components/ranking/logic';
import { ALL_SEASONS, byMinimumOf, emptyRankingText, rankingShareCard, seasonPillOptions, seasonTables } from './rankingPro';

const entry = (id: string, eventId: string, playerId: string, scores: number[]): Entry => ({
  id,
  eventId,
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores,
  photos: scores.map(() => 'foto'),
});

const players = [
  { id: 'p1', name: 'Jugador Uno' },
  { id: 'p2', name: 'Jugadora Dos' },
];

// Seis juegos en cada temporada: Jugador Uno sube de 180 a 200; Jugadora Dos baja.
const entries: Entry[] = [
  entry('a1', 'prev1', 'p1', [180, 180, 180]),
  entry('a2', 'prev2', 'p1', [180, 180, 180]),
  entry('a3', 'now1', 'p1', [200, 200, 200]),
  entry('a4', 'now2', 'p1', [200, 200, 200]),
  entry('b1', 'prev1', 'p2', [190, 190, 190]),
  entry('b2', 'prev2', 'p2', [190, 190, 190]),
  entry('b3', 'now1', 'p2', [170, 170, 170]),
  entry('b4', 'now2', 'p2', [170, 170, 170]),
];

describe('los números de la temporada', () => {
  it('solo los juegos de la temporada, el más mejorado con su nombre y las fechas jugadas', () => {
    const t = seasonTables({ entries, players, seasonIds: ['now1', 'now2'], prevIds: ['prev1', 'prev2'], hasPrev: true });
    expect(t.rows.map((r) => [r.name, r.average, r.games])).toEqual(
      expect.arrayContaining([
        ['Jugador Uno', 200, 6],
        ['Jugadora Dos', 170, 6],
      ]),
    );
    expect(t.improved).toEqual([expect.objectContaining({ playerId: 'p1', name: 'Jugador Uno', previous: 180, current: 200, delta: 20 })]);
    expect(t.played).toBe(2);
  });

  it('sin temporada anterior no hay más mejorado', () => {
    expect(seasonTables({ entries, players, seasonIds: ['now1', 'now2'], prevIds: [], hasPrev: false }).improved).toEqual([]);
  });
});

describe('«Temporada ▾» y el vacío', () => {
  it('cada temporada (la en curso, marcada) y al final ver todas', () => {
    const options = seasonPillOptions([
      { id: 's2', name: 'Temporada de Ejemplo 2', status: 'active' },
      { id: 's1', name: 'Temporada de Ejemplo 1', status: 'closed' },
    ]);
    expect(options.map((o) => o.option)).toEqual(['Temporada de Ejemplo 2 (en curso)', 'Temporada de Ejemplo 1', 'Ver todas las temporadas…']);
    expect(options[2].key).toBe(ALL_SEASONS);
  });

  it('el mínimo de juegos solo si la lista va por promedio (en Pro, también hcp y nombre)', () => {
    expect(byMinimumOf(true, 'hcp', 'juego')).toBe(true);
    expect(byMinimumOf(true, 'juego', 'promedio')).toBe(false);
    expect(byMinimumOf(false, 'hcp', 'promedio')).toBe(true);
    expect(emptyRankingText(true, 'Temporada de Ejemplo 2')).toBe('Hace falta tener al menos 6 juegos aprobados en Temporada de Ejemplo 2.');
    expect(emptyRankingText(false, 'x')).toBe('Aún no hay juegos aprobados.');
  });
});

describe('la imagen de la tabla', () => {
  it('la temporada, «Con hcp», la columna ordenada en negrita y la nota', () => {
    const { rows, played } = seasonTables({ entries, players, seasonIds: ['now1', 'now2'], prevIds: [], hasPrev: false });
    const table = standingsTable(rows, { sort: 'promedio', withHcp: true, hcp: DEFAULT_HCP });
    const card = rankingShareCard({ leagueName: 'Liga de Ejemplo', season: { name: 'Temporada de Ejemplo 2' }, sort: 'promedio', withHcp: true, hcp: DEFAULT_HCP, table, played });
    expect(card.subtitle).toBe('Tabla · Temporada de Ejemplo 2 · Con hcp');
    expect(card.columns.filter((c) => c.strong).map((c) => c.label)).toEqual(['Prom.']);
    expect(card.sections[0].rows[0]).toMatchObject({ rank: 1, name: 'Jugador Uno' });
    expect(card.note).toBe('Solo juegos aprobados. Mínimo 6 juegos en la temporada. Hcp = 80% de (230 − prom.) · mín. 6 juegos.');
  });
});
