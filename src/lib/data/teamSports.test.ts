import { describe, expect, it } from 'vitest';
import type { OutboxItem } from '../db/outbox';
import { idsKey, overlayRsvps, rsvpCollapseKey, rsvpShortfall, rsvpSummary, teamRules, toOfficial, toRsvp, type MatchRsvp } from './teamSports';

const op = (args: Record<string, unknown>, collapseKey: string, createdAt = 1_700_000_000_000): OutboxItem => ({
  opId: 'op',
  userId: 'u1',
  fn: 'set_match_rsvp',
  args: { p_op_id: 'op', ...args },
  collapseKey,
  group: 'L',
  createdAt,
  seq: 1,
  attempts: 0,
  status: 'pending',
});

const r = (playerId: string, status: MatchRsvp['status'], side: 1 | 2 = 1, matchId = 'm1'): MatchRsvp => ({ matchId, playerId, side, status, setBy: null, at: null });

describe('convocatoria', () => {
  it('de la base a la app', () => {
    expect(toRsvp({ match_id: 'm', player_id: 'p', side: 2, status: 'maybe', set_by: 'u', updated_at: '2026-10-01T00:00:00Z' })).toEqual({
      matchId: 'm',
      playerId: 'p',
      side: 2,
      status: 'maybe',
      setBy: 'u',
      at: '2026-10-01T00:00:00Z',
    });
    expect(toOfficial({ match_id: 'm', user_id: 'u', name: null })).toEqual({ matchId: 'm', userId: 'u', name: '' });
  });

  it('lo pendiente de la cola se ve encima: nueva, cambiada y quitada (el lado sale de la clave)', () => {
    const base = [r('a', 'no')];
    const added = overlayRsvps(base, [op({ p_match: 'm1', p_player: 'b', p_status: 'yes' }, rsvpCollapseKey('m1', 'b', 2))]);
    expect(added).toHaveLength(2);
    expect(added[1]).toMatchObject({ playerId: 'b', side: 2, status: 'yes', pending: true, setBy: 'u1' });
    const changed = overlayRsvps(base, [op({ p_match: 'm1', p_player: 'a', p_status: 'maybe' }, rsvpCollapseKey('m1', 'a', 2))]);
    // El lado que ya dijo el servidor manda.
    expect(changed).toEqual([{ ...r('a', 'maybe'), setBy: 'u1', at: new Date(1_700_000_000_000).toISOString(), pending: true }]);
    expect(overlayRsvps(base, [op({ p_match: 'm1', p_player: 'a', p_status: null }, rsvpCollapseKey('m1', 'a', 1))])).toEqual([]);
    // Quitar algo que no hay, u otro partido fuera de la lista: la misma lista.
    expect(overlayRsvps(base, [op({ p_match: 'm1', p_player: 'z', p_status: null }, rsvpCollapseKey('m1', 'z', 1))])).toBe(base);
    expect(overlayRsvps(base, [op({ p_match: 'm9', p_player: 'a', p_status: 'yes' }, rsvpCollapseKey('m9', 'a', 1))], new Set(['m1']))).toBe(base);
  });

  it('resumen por lado con la plantilla, y el aviso de mínimo', () => {
    const list = [r('a', 'yes'), r('b', 'maybe'), r('c', 'no'), r('x', 'yes'), r('z', 'yes', 2), r('a', 'yes', 1, 'm2')];
    const s = rsvpSummary(list, 'm1', 1, ['a', 'b', 'c', 'd', 'e']);
    expect(s).toEqual({ yes: ['a', 'x'], maybe: ['b'], no: ['c'], none: ['d', 'e'] });
    expect(rsvpShortfall(s, 5)).toBe(3);
    expect(rsvpShortfall(s, 2)).toBeNull();
  });
});

describe('reglas de equipos y claves', () => {
  it('valores por defecto y límites', () => {
    expect(teamRules({})).toEqual({ reinforcements: 2, minPlayers: 5, runningClock: false, template: null });
    expect(teamRules(null, { minPlayers: 3 })).toMatchObject({ minPlayers: 3 });
    expect(teamRules({ teams: { reinforcements: 99, minPlayers: 0, runningClock: true, template: 'barrio' } })).toEqual({
      reinforcements: 30,
      minPlayers: 1,
      runningClock: true,
      template: 'barrio',
    });
    expect(teamRules({ teams: { reinforcements: '3', minPlayers: 2.7 } })).toMatchObject({ reinforcements: 2, minPlayers: 2 });
  });

  it('la clave de una lista de partidos no depende del orden ni de repetidos', () => {
    expect(idsKey(['b', 'a', 'a'])).toBe(idsKey(['a', 'b']));
    expect(idsKey(['a', 'b'])).not.toBe(idsKey(['a', 'c']));
    expect(idsKey(['a', 'b']).startsWith('2-')).toBe(true);
  });
});
