import { describe, expect, it } from 'vitest';
import type { MatchRsvp } from '../../../lib/data/teamSports';
import { actaCandidates, actaCheck, newActaLine, withYellows } from './acta';
import { changedSides, lineupEntries, lineupStart, toggleKeeper, toggleStarter } from './lineup';

const rsvp = (playerId: string, side: 1 | 2, status: MatchRsvp['status'] = 'yes'): MatchRsvp => ({ matchId: 'm1', playerId, side, status, setBy: null, at: null });
const roster = [
  { playerId: 'a', jersey: 1, position: 'Portero' },
  { playerId: 'b', jersey: 9, position: null },
];

describe('alineación del acta', () => {
  it('arranca con los que dijeron «Voy» (hasta los que caben) y el portero de la plantilla', () => {
    const empty = { starters: [], goalkeeper: null };
    const { picked, extras } = lineupStart([empty, empty], [rsvp('a', 1), rsvp('b', 1), rsvp('r', 1), rsvp('z', 2, 'no')], 'm1', [roster, []], 2);
    expect(picked[0]).toEqual({ starters: ['a', 'b'], goalkeeper: 'a' });
    expect(picked[1]).toEqual({ starters: [], goalkeeper: null });
    expect(extras).toEqual([[], []]);
  });

  it('titulares, portero, lo que se guarda y qué lados cambiaron', () => {
    const one = toggleStarter({ starters: [], goalkeeper: null }, 'a', 1);
    expect(one.starters).toEqual(['a']);
    expect(toggleStarter(one, 'b', 1)).toBe(one);
    const gk = toggleKeeper(one, 'a', 1);
    expect(gk.goalkeeper).toBe('a');
    expect(toggleStarter(gk, 'a', 1)).toEqual({ starters: [], goalkeeper: null });
    expect(lineupEntries({ starters: ['a', 'x'], goalkeeper: 'a' }, roster)).toEqual([
      { playerId: 'a', jersey: 1, position: 'GK', sub: false },
      { playerId: 'x', jersey: null, position: 'titular', sub: true },
    ]);
    const same = { starters: ['a'], goalkeeper: null };
    expect(changedSides([same, { starters: ['b'], goalkeeper: null }], [same, { starters: [], goalkeeper: null }])).toEqual([2]);
  });
});

describe('corregir el acta', () => {
  it('el marcador, los penales y los goles por jugador', () => {
    expect(actaCheck(['2', '1'], ['', ''], [])).toMatchObject({ valid: true, tied: false, mismatch: false });
    expect(actaCheck(['1', '1'], ['4', '4'], [])).toMatchObject({ valid: false, pensSet: true });
    expect(actaCheck(['x', '1'], ['', ''], []).valid).toBe(false);
    const line = { ...newActaLine('a', 1), goals: 3 };
    expect(actaCheck(['2', '0'], ['', ''], [line]).mismatch).toBe(true);
    expect(actaCandidates(['a', 'b'], ['b', 'c'], [line])).toEqual(['b', 'c']);
    expect(withYellows({ red: null }, 2)).toEqual({ yellows: 2, red: 'second_yellow' });
    expect(withYellows({ red: 'second_yellow' }, 1)).toEqual({ yellows: 1, red: null });
    expect(withYellows({ red: 'direct' }, 1)).toEqual({ yellows: 1, red: 'direct' });
  });
});
