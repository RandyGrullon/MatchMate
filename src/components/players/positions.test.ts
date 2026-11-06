/**
 * Las posiciones de «Agregar jugador» (positions.ts, sin pantallas, para la app del teléfono) son las mismas de las
 * plantillas de la web (bits.tsx de baloncesto y fútbol).
 */
import { describe, expect, it } from 'vitest';
import { BASKETBALL_POSITIONS as BASKETBALL_ROSTER } from '../../pages/sports/basketball/bits';
import { FOOTBALL_POSITIONS as FOOTBALL_ROSTER } from '../../pages/sports/football/bits';
import { BASKETBALL_POSITIONS, FOOTBALL_POSITIONS } from './positions';

describe('posiciones', () => {
  it('las mismas de las plantillas', () => {
    expect(BASKETBALL_POSITIONS).toEqual(BASKETBALL_ROSTER);
    expect(FOOTBALL_POSITIONS).toEqual(FOOTBALL_ROSTER);
  });
});
