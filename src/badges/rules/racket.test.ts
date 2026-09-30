import { describe, expect, it } from 'vitest';
import type { SnapMatch } from '../snapshot';
import { matchSides, snapMatch } from '../testkit';
import { appMatch, appMatches, dateOfMatch, isOfficialRacket, isR1, r2Reason, racketActivity, racketGames, readSets, sideAccounts, wonBy, type MatchContext } from './racket';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const USERS: Record<string, string | null> = { p1: 'u1', p2: 'u2', p3: 'u3', p4: null };
const ctx: MatchContext = { now: NOW, userOf: (p) => USERS[p] ?? null, staff: new Set(['uA', 'u1']) };

/** Pareja p1/p2 contra p3/p4 (p4 sin cuenta). */
function pairMatch(over: Partial<SnapMatch> = {}) {
  const { sides, players } = matchSides('m1', [null, ['p1', 'p2']], [null, ['p3', 'p4']]);
  return appMatch(snapMatch('m1', over), sides, players);
}

describe('R1 y R2 (§1.7.5)', () => {
  it('R1: final (o a las 48 h), sin W.O. ni anulado, y el jugador en un lado', () => {
    expect(isR1(pairMatch(), 'p1', ctx)).toBe(true);
    expect(isR1(pairMatch(), 'p9', ctx)).toBe(false);
    expect(isR1(pairMatch({ status: 'finished', proposed_at: '2026-10-19T12:00:00Z' }), 'p1', ctx)).toBe(false);
    expect(isR1(pairMatch({ status: 'finished', proposed_at: '2026-10-17T12:00:00Z' }), 'p1', ctx)).toBe(true);
    expect(isR1(pairMatch({ status: 'walkover', walkover_side: 2 }), 'p1', ctx)).toBe(false);
    expect(isR1(pairMatch({ status: 'disputed' }), 'p1', ctx)).toBe(false);
  });

  it('cuentas de cada lado', () => {
    const m = pairMatch();
    expect([...sideAccounts(m, 1, ctx)].sort()).toEqual(['u1', 'u2']);
    expect([...sideAccounts(m, 2, ctx)]).toEqual(['u3']);
  });

  it('(a) lo confirmó el otro lado; también vale para quien confirmó si lo propuso el rival', () => {
    const m = pairMatch({ proposed_by: 'u1', proposed_side: 1, confirmed_by: 'u3' });
    expect(r2Reason(m, 'p1', ctx)).toBe('rival');
    expect(r2Reason(m, 'p3', ctx)).toBe('rival');
    // Lo propuso y lo confirmó su propio lado: no vale.
    expect(r2Reason(pairMatch({ proposed_by: 'u1', proposed_side: 1, confirmed_by: 'u2' }), 'p1', ctx)).toBeNull();
  });

  it('(b) lo anotó un admin, anotador u oficial que no es de su lado', () => {
    expect(r2Reason(pairMatch({ proposed_by: 'uA', proposed_side: null }), 'p1', ctx)).toBe('oficial');
    // u1 es admin pero juega en el lado 1: para p1 no vale; para p3 sí (lo anotó el otro lado).
    const m = pairMatch({ proposed_by: 'u1', proposed_side: null });
    expect(r2Reason(m, 'p1', ctx)).toBeNull();
    expect(r2Reason(m, 'p3', ctx)).toBe('rival');
  });

  it('(c) a las 48 h sin reclamo, solo si el otro lado tiene cuenta', () => {
    const finished = { status: 'finished' as const, proposed_by: 'u3', proposed_side: 2 as const, proposed_at: '2026-10-10T00:00:00Z' };
    expect(r2Reason(pairMatch(finished), 'p3', ctx)).toBe('plazo');
    const noAccounts = { ...ctx, userOf: (p: string) => (p === 'p3' ? 'u3' : null) };
    expect(r2Reason(pairMatch(finished), 'p3', noAccounts)).toBeNull();
  });

  it('(d) reclamo resuelto por un admin fuera del partido, y (neutral) confirmado por él', () => {
    const disputed = { proposed_by: 'u1', proposed_side: 1 as const, disputed_at: '2026-10-08T00:00:00Z' };
    const resolved = pairMatch({ ...disputed, confirmed_by: 'uA', history: [{ at: '2026-10-09T00:00:00Z', by: 'uA', a: 'resolve' }] });
    expect(r2Reason(resolved, 'p1', ctx)).toBe('reclamo');
    expect(r2Reason(pairMatch({ ...disputed, confirmed_by: 'uA' }), 'p1', ctx)).toBe('neutral');
    // Resuelto por un admin que juega: no vale.
    const own = pairMatch({ ...disputed, proposed_by: 'u2', confirmed_by: 'u1', history: [{ at: '2026-10-09T00:00:00Z', by: 'u1', a: 'resolve' }] });
    expect(r2Reason(own, 'p1', ctx)).toBeNull();
  });

  it('formatos sin confirmación: solo lo anotado por un oficial o lo propuesto por el otro lado', () => {
    const base = { require_confirm: false, format: 'americano', status: 'finished' as const, proposed_at: '2026-10-06T00:00:00Z' };
    expect(r2Reason(pairMatch({ ...base, proposed_by: 'u1', proposed_side: 1 }), 'p1', ctx)).toBeNull();
    expect(r2Reason(pairMatch({ ...base, proposed_by: 'u1', proposed_side: 1 }), 'p3', ctx)).toBe('rival');
    expect(r2Reason(pairMatch({ ...base, proposed_by: 'uA', proposed_side: null }), 'p1', ctx)).toBe('oficial');
  });

  it('quién ganó y qué es oficial', () => {
    expect([wonBy(pairMatch(), 'p1'), wonBy(pairMatch(), 'p3')]).toEqual([true, false]);
    const m = pairMatch();
    expect(isOfficialRacket(m, null)).toBe(true);
    expect(isOfficialRacket({ ...m, eventId: 'e' }, 'torneo')).toBe(true);
    expect(isOfficialRacket({ ...m, eventId: 'e' }, 'noche')).toBe(false);
    expect(isOfficialRacket({ ...m, format: 'americano' }, null)).toBe(false);
    expect(isOfficialRacket({ ...m, requireConfirm: false }, null)).toBe(false);
  });
});

describe('sets leídos del marcador (§2.3)', () => {
  const read = (text: string, sport: 'padel' | 'tennis' | 'pickleball' | 'table_tennis' = 'padel', over: Partial<SnapMatch> = {}) =>
    readSets(pairMatch({ score: { text }, ...over }), sport);

  it('sets normales, tie-break y súper tie-break', () => {
    const r = read('6-7(5) 6-0 10-8')!;
    expect(r.sets.map((s) => [s.games, s.winner, s.tiebreak, s.matchTiebreak])).toEqual([
      [[6, 7], 2, true, false],
      [[6, 0], 1, false, false],
      [[10, 8], 1, false, true],
    ]);
    expect(r.retired).toBe(false);
  });

  it('con retiro se ignora el set cortado', () => {
    const r = read('6-4 3-2 ret.', 'tennis')!;
    expect(r.retired).toBe(true);
    expect(r.sets.map((s) => s.games)).toEqual([[6, 4]]);
  });

  it('pickleball: juegos a 11 (mejor de 3)', () => {
    const r = read('11-0 9-11 13-11', 'pickleball', { rules: { match: { bestOf: 3 } } })!;
    expect(r.sets.map((s) => [s.games, s.winner])).toEqual([
      [[11, 0], 1],
      [[9, 11], 2],
      [[13, 11], 1],
    ]);
  });

  it('ping pong: juegos a 11 (mejor de 5); con retiro, solo los juegos terminados', () => {
    const r = read('11-0 9-11 12-10 11-8', 'table_tennis')!;
    expect(r.rules.sport).toBe('table_tennis');
    expect(r.sets.map((s) => [s.games, s.winner, s.tiebreak])).toEqual([
      [[11, 0], 1, false],
      [[9, 11], 2, false],
      [[12, 10], 1, false],
      [[11, 8], 1, false],
    ]);
    const ret = read('11-7 3-5 ret.', 'table_tennis')!;
    expect(ret.retired).toBe(true);
    expect(ret.sets.map((s) => s.games)).toEqual([[11, 7]]);
    // Un 11-10 no termina un juego de ping pong.
    expect(read('11-10 11-5 11-3', 'table_tennis')).toBeNull();
  });

  it('W.O., partidos de puntos y marcadores que no se entienden no dan sets', () => {
    expect(readSets(pairMatch({ status: 'walkover', walkover_side: 2 }), 'padel')).toBeNull();
    expect(read('24-8', 'padel', { format: 'americano' })).toBeNull();
    expect(read('seis a cuatro')).toBeNull();
  });

  it('juegos para el % de juegos ganados', () => {
    expect(racketGames(pairMatch({ score: { text: '6-4 6-3', totals: { games: [12, 7] } } }), 'padel')).toEqual([12, 7]);
    expect(racketGames(pairMatch({ score: { text: '6-4 3-6 10-7' } }), 'padel')).toEqual([10, 10]);
    expect(racketGames(pairMatch({ score: { text: '6-4 3-2 ret.' } }), 'tennis')).toEqual([6, 4]);
    expect(racketGames(pairMatch({ score: { text: '11-7 11-9' }, rules: { match: { bestOf: 3 } } }), 'pickleball')).toEqual([2, 0]);
    // Ping pong: juegos, no puntos (también con retiro).
    expect(racketGames(pairMatch({ score: { text: '11-7 9-11 11-5 11-8' } }), 'table_tennis')).toEqual([3, 1]);
    expect(racketGames(pairMatch({ score: { text: '11-7 9-11 3-5 ret.' } }), 'table_tennis')).toEqual([1, 1]);
    expect(racketGames(pairMatch({ score: { text: '24-8' }, format: 'mexicano' }), 'padel')).toBeNull();
  });
});

describe('actividad de raqueta', () => {
  it('un día por partido final; en un W.O. solo el lado que vino', () => {
    const rows = [snapMatch('m1'), snapMatch('m2', { status: 'walkover', walkover_side: 2, score: null, scheduled_at: '2026-10-08T23:00:00Z' })];
    const s1 = matchSides('m1', [null, ['p1', 'p2']], [null, ['p3', 'p4']]);
    const s2 = matchSides('m2', [null, ['p1', 'p2']], [null, ['p3', 'p4']]);
    const matches = appMatches(rows, [...s1.sides, ...s2.sides], [...s1.players, ...s2.players]);
    const acts = racketActivity(matches, { ...ctx, sport: 'padel' });
    expect(acts.filter((a) => a.date === '2026-10-06').map((a) => a.player_id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(acts.filter((a) => a.date === '2026-10-08').map((a) => a.player_id)).toEqual(['p1', 'p2']);
    expect(acts[0]).toMatchObject({ sport: 'padel', user_id: 'u1', official: true });
    // Sin hora programada ni propuesta, la fecha sale de cuando se creó (en la zona de la liga).
    expect(dateOfMatch({ ...matches[0], scheduledAt: null, proposedAt: null })).toBe('2026-10-01');
  });
});
