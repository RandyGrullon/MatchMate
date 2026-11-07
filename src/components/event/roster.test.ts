/** Torneo › Inscritos sin pantalla (roster.ts): el orden, los equipos con cupo, sacar, los promedios y la casilla. */
import { describe, expect, it } from 'vitest';
import type { BowlingEvent, Entry } from '../../lib/types';
import { hcpRuleText, numberCellCommit, removeFromTourneyConfirm, rosterOrder, rosterTeamOptions } from './roster';

const entry = (id: string, playerId: string, teamId: string | null = null): Entry => ({ id, eventId: 'ev-1', playerId, teamId, average: 180, handicapOverride: null, scores: [], photos: [] });

describe('event/roster', () => {
  it('los inscritos por nombre', () => {
    const names: Record<string, string> = { a: 'Jugador Uno', b: 'Jugador Dos' };
    expect(rosterOrder([entry('1', 'a'), entry('2', 'b')], (id) => names[id]).map((e) => e.playerId)).toEqual(['b', 'a']);
  });

  it('los equipos con su cupo; el suyo nunca sale lleno', () => {
    const event = { teams: { t2: { name: 'Equipo B', order: 2 }, t1: { name: 'Equipo A', order: 1 } }, teamSize: 2 } as unknown as Pick<BowlingEvent, 'teams' | 'teamSize'>;
    const entries = [entry('1', 'a', 't1'), entry('2', 'b', 't1'), entry('3', 'c', 't2')];
    expect(rosterTeamOptions(event, entries, 't2')).toEqual([
      { key: '', label: 'Sin equipo', disabled: false },
      { key: 't1', label: 'Equipo A (2/2) · lleno', disabled: true },
      { key: 't2', label: 'Equipo B (1/2)', disabled: false },
    ]);
    expect(rosterTeamOptions(event, entries, 't1')[1]).toEqual({ key: 't1', label: 'Equipo A (2/2)', disabled: false });
  });

  it('sacar a alguien y la regla del handicap', () => {
    expect(removeFromTourneyConfirm('Jugador Uno', true).message).toBe('Tiene juegos anotados en este torneo; se borran también.');
    expect(removeFromTourneyConfirm('Jugador Uno', false)).toEqual({ title: '¿Sacar a Jugador Uno del torneo?', message: undefined, confirmText: 'Sacar', danger: true });
    expect(hcpRuleText({ hcpBase: 220, hcpPercent: 80 })).toBe('El handicap vacío se calcula solo: (220 − promedio) × 80%. Escribe un número para fijarlo a mano.');
  });

  it('lo escrito en la casilla de número', () => {
    expect(numberCellCommit('190', 180)).toEqual({ value: 190 });
    expect(numberCellCommit('180', 180)).toBeNull();
    expect(numberCellCommit('301', 180)).toBeNull();
    expect(numberCellCommit('abc', 180)).toBeNull();
    expect(numberCellCommit('', 12, { allowEmpty: true })).toEqual({ value: null });
    expect(numberCellCommit('', null, { allowEmpty: true })).toBeNull();
    expect(numberCellCommit('', 180)).toBeNull();
  });
});
