import { describe, expect, it } from 'vitest';
import { golfNow, holeWord, meritPlace, meritSeasonText, meritShare, meritTop, scoreText, type MyRoundState } from './home';

const mine = (over: Partial<MyRoundState> = {}): MyRoundState => ({ holes: 0, complete: false, signed: false, score: '21 pts', nextHole: 1, ...over });

describe('la tarjeta «Hoy» del golf', () => {
  it('lo tuyo en una línea y UN botón que lleva a lo que toca', () => {
    expect(golfNow({ mine: mine({ holes: 7, nextHole: 8 }), hasCourse: true, staff: false, member: true })).toEqual({
      line: 'Llevas 7 hoyos · 21 pts',
      action: { label: 'Seguir en el hoyo 8', tab: 'tarjeta' },
    });
    expect(golfNow({ mine: mine({ holes: 1, nextHole: null }), hasCourse: true, staff: false, member: true }).line).toBe('Llevas 1 hoyo · 21 pts');
    expect(golfNow({ mine: mine(), hasCourse: true, staff: false, member: true }).action).toEqual({ label: 'Anotar mi tarjeta', tab: 'tarjeta' });
    expect(golfNow({ mine: mine({ holes: 18, complete: true, score: '+2' }), hasCourse: true, staff: false, member: true })).toEqual({
      line: 'Terminaste · +2',
      action: { label: 'Revisar y firmar', tab: 'tarjeta' },
    });
    // Firmada: nada más que hacer (la tarjeta lleva a la ronda).
    expect(golfNow({ mine: mine({ holes: 18, complete: true, signed: true }), hasCourse: true, staff: false, member: true }).action).toBeNull();
  });

  it('sin tarjeta: inscribirse; quien anota, los grupos; quien mira, sin botón; sin campo, nada', () => {
    expect(golfNow({ mine: null, hasCourse: true, staff: false, member: true }).action).toEqual({ label: 'Inscribirme', tab: 'jugadores' });
    expect(golfNow({ mine: null, hasCourse: true, staff: true, member: true }).action).toEqual({ label: 'Anotar los grupos', tab: 'tarjeta' });
    expect(golfNow({ mine: null, hasCourse: true, staff: false, member: false })).toEqual({ line: 'Mira cómo van', action: null });
    expect(golfNow({ mine: mine(), hasCourse: false, staff: true, member: true })).toEqual({ line: 'Falta elegir el campo', action: null });
  });

  it('lo que manda en la competencia', () => {
    const s = { points: 21, toPar: 3, netToPar: -1 };
    expect(scoreText(s, { format: 'stableford', basis: 'net' })).toBe('21 pts');
    expect(scoreText(s, { format: 'stroke', basis: 'net' })).toBe('−1');
    expect(scoreText(s, { format: 'stroke', basis: 'gross' })).toBe('+3');
  });

  it('el nombre del hoyo contra el par', () => {
    expect([holeWord(3, 4), holeWord(4, 4), holeWord(5, 4), holeWord(6, 4), holeWord(2, 4), holeWord(9, 4), holeWord(2, 5)]).toEqual([
      'birdie',
      'par',
      'bogey',
      'doble bogey',
      'eagle',
      '+5',
      'albatros',
    ]);
  });
});

describe('el orden de mérito en el inicio', () => {
  const merit = [
    { id: 'a', rank: 1, points: 45 },
    { id: 'b', rank: 1, points: 45 },
    { id: 'c', rank: 3, points: 32 },
    { id: 'd', rank: 4, points: 26 },
    { id: 'e', rank: 5, points: 0 },
  ];

  it('los 3 de arriba, con tu fila siempre a la vista', () => {
    expect(meritTop(merit, 'c').map((r) => [r.row.id, r.me])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
    expect(meritTop(merit, 'd').map((r) => r.row.id)).toEqual(['a', 'b', 'd']);
    // Sin puntos no sale.
    expect(meritTop(merit, 'e').map((r) => r.row.id)).toEqual(['a', 'b', 'c']);
    expect(meritTop([], 'a')).toEqual([]);
  });

  it('tu lugar en palabras', () => {
    const name = (id: string) => id.toUpperCase();
    expect(meritPlace(merit, 'c', name)).toEqual({ big: '3.º', title: 'Vas 3.º de 4, con 32 pts', subtitle: 'B te lleva 13 pts' });
    expect(meritPlace(merit, 'a', name)?.subtitle).toBe('Empatas en el primer lugar');
    expect(meritPlace([{ id: 'a', rank: 1, points: 10 }, { id: 'b', rank: 2, points: 9 }], 'a', name)?.subtitle).toBe('Le llevas 1 punto a B');
    expect(meritPlace(merit, 'e', name)).toBeNull();
    expect(meritPlace(merit, null, name)).toBeNull();
  });
});

describe('la imagen del orden de mérito', () => {
  it('la temporada en palabras', () => {
    expect(meritSeasonText(null, {})).toBeNull();
    expect(meritSeasonText({ name: 'Temporada de Ejemplo', startsOn: '2026-01-01', endsOn: null }, {})).toMatch(/^Temporada de Ejemplo \(/);
    expect(meritSeasonText(null, { seasonStart: null, seasonEnd: '2026-12-31' })).toMatch(/^… – /);
  });

  it('las columnas, las filas y la nota', () => {
    const card = meritShare({
      leagueName: 'Golf de Ejemplo',
      seasonText: null,
      merit: [
        { id: 'p1', points: 1200, events: 3, wins: 2, best: 1, rank: 1 },
        { id: 'p2', points: 80, events: 1, wins: 0, best: null, rank: 2 },
      ],
      nameOf: (id) => (id === 'p1' ? 'Jugador Uno' : 'Jugador Dos'),
      counted: 1,
    });
    expect(card.subtitle).toBe('Orden de mérito');
    expect(card.columns.map((c) => c.label)).toEqual(['Jugó', 'Ganó', 'Mejor', 'Puntos']);
    expect(card.sections[0].rows[0]).toEqual({ rank: 1, name: 'Jugador Uno', values: [3, 2, 1, (1200).toLocaleString('es-DO')] });
    expect(card.sections[0].rows[1].values[2]).toBe('–');
    expect(card.note).toBe('Puntos por puesto en cada ronda cerrada (1 evento).');
    expect(meritShare({ leagueName: 'Golf de Ejemplo', seasonText: 'Temporada de Ejemplo', merit: [], nameOf: () => '', counted: 2 }).subtitle).toBe('Orden de mérito · Temporada de Ejemplo');
  });
});

