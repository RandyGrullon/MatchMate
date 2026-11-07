import { describe, expect, it } from 'vitest';
import { FIBA_TABLE } from '../../../sports/team/standings';
import { SCORER_COLUMNS, basketballCanShare, basketballRuleLine, basketballRuleText, basketballShareCard, basketballView, scorerLine } from './standingsView';

describe('la Tabla del baloncesto', () => {
  it('lo que se ve con ?ver=', () => {
    expect(basketballView('anotadores')).toBe('anotadores');
    expect(basketballView('otra')).toBe('tabla');
    expect(basketballView(null)).toBe('tabla');
  });

  it('la línea del anotador y la primera columna', () => {
    expect(scorerLine({ avg: 25.5 })).toBe(`${(25.5).toLocaleString('es-DO', { minimumFractionDigits: 1 })} por partido`);
    expect(SCORER_COLUMNS[0].key).toBe('points');
  });

  it('la regla en una línea y «Cómo se cuenta»', () => {
    expect(basketballRuleLine(FIBA_TABLE)).toBe('Ganar 2 · perder 1 · desempate FIBA');
    const text = basketballRuleText(FIBA_TABLE);
    expect(text[0]).toBe('Ganar da 2 puntos y perder 1. Perder por forfeit (no se presentó) da 0 y el forfeit se anota 20-0. Perder por default (se quedó sin jugadores) da 1.');
    expect(text).toHaveLength(3);
  });

  it('la imagen para compartir (Pro)', () => {
    const row = { id: 't1', played: 2, won: 2, drawn: 0, lost: 0, points: 4, for: 150, against: 130, diff: 20, extra: {}, rank: 1 };
    const leader = { player: 'p1', team: 't1', games: 2, points: 40, avg: 20, high: 24, threes: 3, ftm: 4, fouls: 2 };
    const season = { standings: [row], leaders: [leader] };
    const teamOf = (id: string) => (id === 't1' ? { name: 'Equipo Uno', color: '#123456' } : null);
    const table = basketballShareCard({ leagueName: 'Liga de Ejemplo', view: 'tabla', season, teamOf, nameOf: () => 'Jugador Uno' });
    expect(table.subtitle).toBe('Tabla de posiciones');
    expect(table.nameLabel).toBe('Equipo');
    expect(table.sections[0].rows[0]).toMatchObject({ rank: 1, name: 'Equipo Uno', dot: '#123456' });
    const scorers = basketballShareCard({ leagueName: 'Liga de Ejemplo', view: 'anotadores', season, teamOf, nameOf: () => 'Jugador Uno' });
    expect(scorers.subtitle).toBe('Anotadores');
    expect(scorers.sections[0].rows[0]).toMatchObject({ name: 'Jugador Uno', sub: 'Equipo Uno' });
    expect(basketballCanShare('anotadores', { standings: [row], leaders: [] })).toBe(false);
    expect(basketballCanShare('tabla', season)).toBe(true);
  });
});
