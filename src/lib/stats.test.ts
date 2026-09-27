import { describe, expect, it } from 'vitest';
import { balancedTeams, bestMatch, calcHandicap, category, entryLine, firstFreeSlot, playerStats, rank, teamLines } from './stats';
import type { BowlingEvent, Entry } from './types';

const torneo: BowlingEvent = {
  id: 't',
  type: 'torneo',
  name: 'Torneo 2026',
  date: '2026-10-10',
  games: 3,
  hcpBase: 220,
  hcpPercent: 90,
  teams: { a: { name: 'Equipo A', order: 1 } },
  playerCount: 2,
};

const entry = (over: Partial<Entry>): Entry => ({
  id: 'e',
  eventId: 't',
  playerId: 'p',
  teamId: null,
  average: 160,
  handicapOverride: null,
  scores: [null, null, null],
  photos: [null, null, null],
  ...over,
});

describe('handicap', () => {
  it('es (base - promedio) * % redondeado hacia abajo', () => {
    expect(calcHandicap(160, 220, 90)).toBe(54);
    expect(calcHandicap(175, 220, 80)).toBe(36);
  });
  it('no es negativo y 0% lo apaga', () => {
    expect(calcHandicap(230, 220, 90)).toBe(0);
    expect(calcHandicap(150, 220, 0)).toBe(0);
  });
  it('el handicap fijo manda sobre el calculado', () => {
    expect(entryLine(entry({ handicapOverride: 10 }), torneo).hcp).toBe(10);
  });
});

describe('solo cuentan juegos verificados con foto', () => {
  const e = entry({ scores: [180, 200, 150], photos: ['f1', 'f1', null] });

  it('el borrador sin foto no suma', () => {
    const l = entryLine(e, torneo);
    expect(l.games).toBe(2);
    expect(l.scratch).toBe(380);
    expect(l.hcpTotal).toBe(54 * 2);
    expect(l.total).toBe(380 + 108);
    expect(l.pending).toBe(1);
    expect(l.scores).toEqual([180, 200, null]);
  });

  it('la vista previa sí incluye el borrador', () => {
    const l = entryLine(e, torneo, true);
    expect(l.games).toBe(3);
    expect(l.scratch).toBe(530);
  });

  it('las estadísticas del jugador ignoran el borrador', () => {
    const s = playerStats([e, entry({ id: 'e2', scores: [210, 190, 170, null], photos: ['f2', 'f2', 'f2', null] })]);
    expect(s.games).toBe(5);
    expect(s.pins).toBe(180 + 200 + 210 + 190 + 170);
    expect(s.autoAverage).toBe(190);
    expect(s.high).toBe(210);
    expect(s.highSeries).toBe(570);
    expect(s.pending).toBe(1);
  });
});

describe('ranking', () => {
  it('los empates comparten puesto', () => {
    const r = rank([{ v: 10 }, { v: 30 }, { v: 30 }, { v: 5 }], (x) => x.v);
    expect(r.map((x) => [x.row.v, x.pos])).toEqual([
      [30, 1],
      [30, 1],
      [10, 3],
      [5, 4],
    ]);
  });

  it('el total del equipo suma pinos + handicap de cada jugador por juego', () => {
    const lines = [
      entry({ id: 'a1', teamId: 'a', scores: [150, 160, null], photos: ['f', 'f', null] }),
      entry({ id: 'a2', teamId: 'a', average: 200, scores: [200, null, null], photos: ['f', null, null] }),
    ].map((e) => entryLine(e, torneo));
    const [team] = teamLines(torneo, lines);
    // hcp: 54 y 18
    expect(team.perGame).toEqual([150 + 54 + 200 + 18, 160 + 54, 0]);
    expect(team.total).toBe(team.perGame.reduce((a, b) => a + b, 0));
  });
});

describe('primer juego libre', () => {
  it('no pisa juegos ya verificados', () => {
    const e = entry({ scores: [180, 190, null, null, null, null], photos: ['f', 'f', null, null, null, null] });
    expect(firstFreeSlot(e, 6, 3)).toBe(2);
    expect(firstFreeSlot(null, 6, 3)).toBe(0);
  });
});

describe('nombres de la pantalla', () => {
  const players = [{ name: 'Pedro Almonte' }, { name: 'Luis Tavárez' }, { name: 'José Ángel Peña' }, { name: 'Carla Núñez' }];
  it('empareja nombre de pila, mayúsculas y tildes', () => {
    expect(bestMatch('PEDRO', players)?.name).toBe('Pedro Almonte');
    expect(bestMatch('Jose Angel', players)?.name).toBe('José Ángel Peña');
    expect(bestMatch('Carla', players)?.name).toBe('Carla Núñez');
  });
  it('no inventa coincidencias', () => {
    expect(bestMatch('MARTA', players)).toBeNull();
  });
});

describe('equipos automáticos', () => {
  it('deja las sumas de promedio parejas (12 jugadores de ejemplo)', () => {
    const avgs = [230, 190, 185, 180, 165, 165, 165, 150, 150, 150, 140, 140];
    const teams = balancedTeams(avgs, 4, (a) => a);
    expect(teams.map((t) => t.length)).toEqual([3, 3, 3, 3]);
    const sums = teams.map((t) => t.reduce((a, b) => a + b, 0));
    // El óptimo es 15: el de 230 suma al menos 510 y el resto no alcanza para tres equipos de 500 exactos.
    expect(Math.max(...sums) - Math.min(...sums)).toBe(15);
  });
  it('mejora el reparto en serpiente cuando hay un jugador muy por encima', () => {
    const avgs = [230, 190, 185, 180, 165, 165, 150, 150, 140];
    const sums = balancedTeams(avgs, 3, (a) => a).map((t) => t.reduce((a, b) => a + b, 0));
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(40);
  });
  it('si no alcanza para equipos completos, los últimos quedan con uno menos', () => {
    const teams = balancedTeams([200, 190, 180, 170, 160], 2, (a) => a);
    expect(teams.map((t) => t.length).sort()).toEqual([2, 3]);
  });
});

describe('categorías', () => {
  it('siguen los cortes del torneo 2025', () => {
    expect([230, 190, 180, 175, 165, 160, 150, 140].map((a) => category(a))).toEqual(['A', 'B', 'B', 'B', 'C', 'C', 'D', 'D']);
    expect(category(180, [210, 185, 170])).toBe('C');
  });
  it('los equipos automáticos no repiten categoría cuando se puede', () => {
    // 3 equipos de 3 con una A, B y C/D para cada uno.
    const avgs = [230, 205, 201, 190, 185, 180, 165, 150, 140];
    const teams = balancedTeams(avgs, 3, (a) => a, (a) => category(a));
    for (const t of teams) expect(new Set(t.map((a) => category(a))).size).toBe(3);
  });
});
