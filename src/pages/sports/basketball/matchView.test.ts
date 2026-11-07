/** Lo puro del partido de baloncesto (matchView.ts): los encabezados de «Por cuarto», el orden de los puntos y el lector. Datos ficticios. */
import { describe, expect, it } from 'vitest';
import { tryParse } from '../../../components/match/parsers';
import { basketballParser, boxRows, periodHeader } from './matchView';

describe('periodHeader', () => {
  it('cuartos, mitades y prórrogas', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => periodHeader(i, 4))).toEqual(['1C', '2C', '3C', '4C', 'Pr.', 'Pr.2']);
    expect([0, 1, 2].map((i) => periodHeader(i, 2))).toEqual(['1T', '2T', 'Pr.']);
  });
});

describe('boxRows', () => {
  it('solo su lado, del que más anotó al que menos', () => {
    const line = (playerId: string, side: 1 | 2, points: number) => ({ playerId, side, points, ones: 0, twos: 0, threes: 0, fouls: 0 });
    const rows = boxRows([line('a', 1, 4), line('b', 2, 9), line('c', 1, 12)], 1);
    expect(rows.map((r) => r.playerId)).toEqual(['c', 'a']);
  });
});

describe('basketballParser', () => {
  it('lee 78-72 y no deja empates', () => {
    const ok = tryParse(basketballParser, '78-72');
    expect(ok.ok && ok.value.winner).toBe(1);
    expect(tryParse(basketballParser, '70-70').ok).toBe(false);
  });
});
