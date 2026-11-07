import { describe, expect, it } from 'vitest';
import { FIBA_TABLE } from '../../../sports/team/standings';
import { SCORER_COLUMNS, basketballRuleLine, basketballRuleText, basketballView, scorerLine } from './standingsView';

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
});
