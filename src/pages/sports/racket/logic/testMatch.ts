/** Solo pruebas: partidos de mentira con la forma de la capa de datos. */
import type { Match, MatchSide, MatchStatus } from '../../../../lib/data/matches';
import type { Side } from '../../../../sports/types';

let n = 0;

export function side(s: Side, players: string[], teamId: string | null = null, label?: string): MatchSide {
  return { side: s, teamId, label: label ?? players.join(' / '), seed: null, players: players.map((playerId) => ({ playerId, side: s, position: null, jersey: null, sub: false })) };
}

export function mkMatch(o: Partial<Match> & { a?: string[]; b?: string[]; teams?: [string | null, string | null] }): Match {
  const { a = [], b = [], teams = [null, null], ...rest } = o;
  const status: MatchStatus = rest.status ?? 'scheduled';
  return {
    id: rest.id ?? `m${++n}`,
    leagueId: 'L',
    eventId: null,
    round: null,
    stage: '',
    bracketKey: null,
    court: '',
    scheduledAt: null,
    status,
    format: 'sets',
    requireConfirm: true,
    score: null,
    winner: null,
    walkoverSide: null,
    scorerId: null,
    leaseUntil: null,
    seq: 0,
    version: 0,
    proposedBy: null,
    proposedAt: null,
    proposedSide: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputedAt: null,
    disputeNote: null,
    note: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    sides: [side(1, a, teams[0]), side(2, b, teams[1])],
    ...rest,
  };
}

/** Partido a puntos terminado (americano). */
export const pts = (round: number, court: string, a: string[], b: string[], s1: number | null, s2: number | null, extra: Partial<Match> = {}) =>
  mkMatch({
    round,
    court,
    a,
    b,
    format: 'americano',
    requireConfirm: false,
    status: s1 == null ? 'scheduled' : 'confirmed',
    score: s1 == null ? null : { text: `${s1}-${s2}`, sides: [s1, s2!] },
    winner: s1 == null || s1 === s2 ? null : s1 > s2! ? 1 : 2,
    ...extra,
  });

/** Partido a sets confirmado con totales. */
export function sets(a: string[] | string, b: string[] | string, text: string, winner: Side, totals: { sets: [number, number]; games: [number, number] }, extra: Partial<Match> = {}) {
  const pa = Array.isArray(a) ? a : [];
  const pb = Array.isArray(b) ? b : [];
  const teams: [string | null, string | null] = [Array.isArray(a) ? null : a, Array.isArray(b) ? null : b];
  return mkMatch({ a: pa, b: pb, teams, status: 'confirmed', score: { text, sides: totals.sets, totals }, winner, ...extra });
}
