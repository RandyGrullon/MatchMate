import { describe, expect, it } from 'vitest';
import type { SnapMatch, SnapTeamPlayer } from '../snapshot';
import { matchSides, snapMatch, snapTeamPlayer } from '../testkit';
import { appMatch } from './racket';
import {
  appearances,
  basketballStatLine,
  footballStatLine,
  isT1,
  rosterAccounts,
  rosterFallback,
  t2Reason,
  teamActivity,
  teamOutcome,
  wonShootout,
  type TeamContext,
} from './team';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const USERS: Record<string, string | null> = { a1: 'u-a1', a2: 'u-a2', b1: 'u-b1', b2: null };
const ROSTER: SnapTeamPlayer[] = [
  snapTeamPlayer('tA', 'a1', 'captain'),
  snapTeamPlayer('tA', 'a2'),
  snapTeamPlayer('tB', 'b1', 'delegate'),
  snapTeamPlayer('tB', 'b2'),
  snapTeamPlayer('tB', 'b3', 'player', '2026-10-15T12:00:00Z'),
];
const ctx: TeamContext = { now: NOW, userOf: (p) => USERS[p] ?? null, teamPlayers: ROSTER, staff: new Set(['uA', 'u-a2']) };

/** Fútbol: tA (lado 1) contra tB (lado 2). a1 metió 2, b2 jugó, a2 vio amarilla desde el banco. */
const LINES = 'a1:1:1:2;b2:2:1;a2:1:0:0:0:0:1';

function teamMatch(over: Partial<SnapMatch> = {}, lineup: string[][] = [[], []]) {
  const { sides, players } = matchSides('m1', ['tA', lineup[0]], ['tB', lineup[1]]);
  return appMatch(snapMatch('m1', { format: 'football', score: { text: '2-1', sides: [2, 1], lines: LINES }, ...over }), sides, players);
}

describe('T1, apariciones y plantilla', () => {
  it('T1: final, sin anular, sin W.O. y sin forfait', () => {
    expect(isT1(teamMatch(), NOW)).toBe(true);
    expect(isT1(teamMatch({ score: { text: '20-0 (forfeit)', sides: [20, 0], ending: { kind: 'forfeit', side: 2 } } }), NOW)).toBe(false);
    expect(isT1(teamMatch({ status: 'walkover', walkover_side: 2 }), NOW)).toBe(false);
    expect(isT1(teamMatch({ status: 'void' }), NOW)).toBe(false);
  });

  it('aparece quien está en la alineación o jugó según el acta; una tarjeta desde el banco no es jugar', () => {
    const seen = appearances(teamMatch({}, [['a3'], []]), 'football');
    expect([...seen].sort()).toEqual([
      ['a1', 1],
      ['a3', 1],
      ['b2', 2],
    ]);
  });

  it('respaldo por plantilla: solo los que ya estaban en la plantilla ese día', () => {
    const m = teamMatch({ score: { text: '1-0', sides: [1, 0] } });
    expect(appearances(m, 'football').size).toBe(0);
    expect([...rosterFallback(m, ROSTER, '2026-10-06')].sort()).toEqual([
      ['a1', 1],
      ['a2', 1],
      ['b1', 2],
      ['b2', 2],
    ]);
  });

  it('actividad: apariciones, o la plantilla marcada como tal', () => {
    const acts = teamActivity([teamMatch(), teamMatch({ score: { text: '1-0', sides: [1, 0] } })], { ...ctx, sport: 'football' });
    expect(acts.filter((a) => !a.roster).map((a) => a.player_id)).toEqual(['a1', 'b2']);
    expect(acts.filter((a) => a.roster).map((a) => a.player_id).sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
  });
});

describe('T2', () => {
  it('lo anotó alguien de fuera de la plantilla', () => {
    expect(t2Reason(teamMatch({ proposed_by: 'u-ref', proposed_side: null }), 1, ctx)).toBe('oficial');
    // Un admin que juega en tA no valida a tA.
    expect(t2Reason(teamMatch({ proposed_by: 'u-a2', proposed_side: null }), 1, ctx)).toBeNull();
  });

  it('confirmó (o propuso) el capitán o delegado del otro equipo', () => {
    const m = teamMatch({ proposed_by: 'u-a1', proposed_side: 1, confirmed_by: 'u-b1' });
    expect([t2Reason(m, 1, ctx), t2Reason(m, 2, ctx)]).toEqual(['rival', 'rival']);
  });

  it('a las 48 h sin reclamo, si el otro equipo tiene capitán o delegado con cuenta', () => {
    const m = teamMatch({ status: 'finished', proposed_by: 'u-a1', proposed_side: 1, proposed_at: '2026-10-10T00:00:00Z' });
    expect(t2Reason(m, 1, ctx)).toBe('plazo');
    const noLeads = { ...ctx, teamPlayers: ROSTER.map((tp) => (tp.team_id === 'tB' ? { ...tp, role: 'player' as const } : tp)) };
    expect(t2Reason(m, 1, noLeads)).toBeNull();
    expect([...rosterAccounts('tB', ctx, ['captain', 'delegate'])]).toEqual(['u-b1']);
  });

  it('confirmado por un owner o admin que no está en ninguna plantilla', () => {
    expect(t2Reason(teamMatch({ proposed_by: 'u-a1', proposed_side: 1, confirmed_by: 'uA' }), 1, ctx)).toBe('neutral');
    expect(t2Reason(teamMatch({ proposed_by: 'u-a1', proposed_side: 1, confirmed_by: 'u-a2' }), 1, ctx)).toBeNull();
  });
});

describe('líneas con estadísticas (TS) y resultado', () => {
  it('fútbol: la línea del jugador que jugó', () => {
    const m = teamMatch();
    expect(footballStatLine(m, 'a1')).toMatchObject({ goals: 2, played: true });
    expect(footballStatLine(m, 'a2')).toBeNull();
    expect(footballStatLine(teamMatch({ score: { text: '2-1', sides: [2, 1] } }), 'a1')).toBeNull();
  });

  it('baloncesto: una línea incoherente se descarta', () => {
    const m = teamMatch({ format: 'fiba', score: { text: '10-9', sides: [10, 9], lines: 'a1:1:10:2:1:2:1;b1:2:9:1:1:1:0' } });
    expect(basketballStatLine(m, 'a1')).toMatchObject({ points: 10, threes: 2 });
    expect(basketballStatLine(m, 'b1')).toBeNull();
    // La línea incoherente igual cuenta como aparición.
    expect(appearances(m, 'basketball').get('b1')).toBe(2);
  });

  it('un empate que se decide en penales es empate; quién ganó la tanda', () => {
    const m = teamMatch({ winner_side: 1, score: { text: '1-1 (pen. 4-3)', sides: [1, 1], pens: [4, 3] } });
    expect([teamOutcome(m, 1), teamOutcome(m, 2)]).toEqual(['E', 'E']);
    expect([wonShootout(m, 1), wonShootout(m, 2)]).toEqual([true, false]);
    expect([teamOutcome(teamMatch(), 1), teamOutcome(teamMatch(), 2)]).toEqual(['G', 'P']);
  });
});
