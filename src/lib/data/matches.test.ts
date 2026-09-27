import { afterEach, describe, expect, it } from 'vitest';
import type { OutboxItem } from '../db/outbox';
import { queryClient, remember } from './client';
import {
  AUTO_CONFIRM_MS,
  awaitingConfirmation,
  autoConfirmAt,
  cachedCourtState,
  canConfirm,
  canDispute,
  compareMatches,
  draftArg,
  finalMatches,
  handleMatchMessage,
  isFinal,
  leaseExpired,
  matchKeys,
  overlayMatch,
  overlayMatches,
  resetMatchesForTests,
  schedulePatchArg,
  sideArg,
  sideKey,
  sideOf,
  toClaimResult,
  toMatch,
  toPublishResult,
  type Match,
  type MatchPlayerRow,
  type MatchRow,
  type MatchSideRow,
} from './matches';
import type { Wire } from './stamp';

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
  id: 'm1',
  league_id: 'L',
  event_id: 'E',
  round: 1,
  stage: '',
  bracket_key: null,
  court: 'Cancha 1',
  scheduled_at: '2026-10-05T23:00:00.000Z',
  status: 'scheduled',
  format: 'sets',
  require_confirm: true,
  score: null,
  seq: 0,
  version: 0,
  winner_side: null,
  walkover_side: null,
  scorer_id: null,
  lease_until: null,
  proposed_by: null,
  proposed_at: null,
  proposed_side: null,
  confirmed_by: null,
  confirmed_at: null,
  disputed_by: null,
  disputed_at: null,
  dispute_note: null,
  note: null,
  created_by: 'admin',
  created_at: '2026-09-26T12:00:00.000Z',
  updated_at: '2026-09-26T12:00:00.000Z',
  ...over,
});

const sides: MatchSideRow[] = [
  { match_id: 'm1', side: 1, team_id: 'pairA', label: 'Ana / Luis', seed: 1 },
  { match_id: 'm1', side: 2, team_id: null, label: 'Otra / Nuevo', seed: null },
  { match_id: 'otro', side: 1, team_id: 'x', label: 'X', seed: null },
];
const players: MatchPlayerRow[] = [
  { match_id: 'm1', player_id: 'pAna', side: 1, position: 'reves', jersey: null, sub: false },
  { match_id: 'm1', player_id: 'pLuis', side: 1, position: null, jersey: 7, sub: true },
  { match_id: 'm1', player_id: 'pOtra', side: 2, position: null, jersey: null, sub: false },
];

const item = (fn: string, args: Record<string, unknown>, createdAt = Date.parse('2026-10-05T23:30:00Z')): OutboxItem => ({
  opId: `op-${fn}`,
  userId: 'u-ana',
  fn,
  args: { ...args, p_op_id: `op-${fn}` },
  group: 'L',
  createdAt,
  seq: createdAt,
  attempts: 0,
  status: 'pending',
});

afterEach(() => {
  resetMatchesForTests();
});

describe('de la base a la app', () => {
  it('fila, lados y jugadores', () => {
    const m = toMatch(row({ score: { text: '6-4', sides: [1, 0] }, winner_side: 1, proposed_side: 2, walkover_side: 0 }), sides, players);
    expect(m).toMatchObject({
      id: 'm1',
      leagueId: 'L',
      eventId: 'E',
      round: 1,
      court: 'Cancha 1',
      scheduledAt: '2026-10-05T23:00:00.000Z',
      status: 'scheduled',
      requireConfirm: true,
      score: { text: '6-4', sides: [1, 0] },
      winner: 1,
      proposedSide: 2,
      walkoverSide: 0,
      createdAt: '2026-09-26T12:00:00.000Z',
    });
    expect(m.sides).toEqual([
      {
        side: 1,
        teamId: 'pairA',
        label: 'Ana / Luis',
        seed: 1,
        players: [
          { playerId: 'pAna', side: 1, position: 'reves', jersey: null, sub: false },
          { playerId: 'pLuis', side: 1, position: null, jersey: 7, sub: true },
        ],
      },
      { side: 2, teamId: null, label: 'Otra / Nuevo', seed: null, players: [{ playerId: 'pOtra', side: 2, position: null, jersey: null, sub: false }] },
    ]);
    // Sin state/rules/history en las listas; con ellos en el detalle.
    expect(m).not.toHaveProperty('state');
    const full = toMatch(row({ state: { v: 1 }, rules: { a: 1 }, history: [{ at: 'x', by: null, a: 'finish' }] }), sides, players);
    expect(full).toMatchObject({ state: { v: 1 }, rules: { a: 1 }, history: [{ a: 'finish' }] });
  });

  it('un lado que todavía no llegó sale «Por definir»', () => {
    expect(toMatch(row(), [], []).sides.map((s) => s.label)).toEqual(['Por definir', 'Por definir']);
  });

  it('resultados de las RPC', () => {
    expect(toClaimResult({ ok: true, scorer_id: 'u', scorer_name: 'Ana', lease_until: '2026-10-05T23:05:00Z', expired: false, status: 'live', seq: 4, version: 9, state: { v: 1 } })).toEqual({
      ok: true,
      scorerId: 'u',
      scorerName: 'Ana',
      leaseUntil: '2026-10-05T23:05:00Z',
      expired: false,
      status: 'live',
      seq: 4,
      version: 9,
      state: { v: 1 },
    });
    expect(toPublishResult({ ok: false, reason: 'lease', scorer_id: 'u2', scorer_name: 'Luis', status: 'live', seq: 3 })).toEqual({
      ok: false,
      reason: 'lease',
      scorerId: 'u2',
      scorerName: 'Luis',
      status: 'live',
      seq: 3,
    });
    expect(toPublishResult(null)).toEqual({ ok: false });
  });

  it('argumentos para las RPC', () => {
    expect(
      draftArg({
        id: 'n1',
        eventId: 'E',
        round: 2,
        court: 'Cancha 3',
        requireConfirm: false,
        sides: [
          { side: 1, teamId: 'pairA' },
          { side: 2, label: '  Los de siempre ', players: [{ playerId: 'p1', sub: true }] },
        ],
      }),
    ).toEqual({
      id: 'n1',
      event_id: 'E',
      round: 2,
      court: 'Cancha 3',
      require_confirm: false,
      sides: [
        { side: 1, team_id: 'pairA' },
        { side: 2, team_id: null, label: 'Los de siempre', players: [{ player_id: 'p1', position: null, jersey: null, sub: true }] },
      ],
    });
    expect(sideArg({ side: 1 })).toEqual({ side: 1, team_id: null });
    expect(schedulePatchArg({ scheduledAt: null, court: 'C2', round: 3, requireConfirm: true })).toEqual({ scheduled_at: null, court: 'C2', round: 3, require_confirm: true });
  });

  it('orden: ronda, hora, cancha (2 antes que 10)', () => {
    const list = [
      toMatch(row({ id: 'c', round: 2, court: 'Cancha 1' })),
      toMatch(row({ id: 'b', round: 1, court: 'Cancha 10' })),
      toMatch(row({ id: 'a', round: 1, court: 'Cancha 2' })),
      toMatch(row({ id: 'd', round: null, court: 'Cancha 1' })),
    ].sort(compareMatches);
    expect(list.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('la regla de las 48 h (al leer)', () => {
  const proposed = '2026-10-01T20:00:00.000Z';
  const t0 = Date.parse(proposed);
  const m = { status: 'finished' as const, proposedAt: proposed, proposedSide: 1 as const };

  it('propuesto: por confirmar hasta las 48 h; después cuenta solo', () => {
    expect(autoConfirmAt(m)).toBe(t0 + AUTO_CONFIRM_MS);
    expect(isFinal(m, t0 + AUTO_CONFIRM_MS - 1)).toBe(false);
    expect(awaitingConfirmation(m, t0 + AUTO_CONFIRM_MS - 1)).toBe(true);
    expect(isFinal(m, t0 + AUTO_CONFIRM_MS)).toBe(true);
    expect(awaitingConfirmation(m, t0 + AUTO_CONFIRM_MS)).toBe(false);
  });

  it('confirmado y W.O. cuentan; disputado, en vivo, aplazado y anulado no', () => {
    expect(isFinal({ status: 'confirmed', proposedAt: null })).toBe(true);
    expect(isFinal({ status: 'walkover', proposedAt: null })).toBe(true);
    for (const status of ['disputed', 'live', 'postponed', 'void', 'scheduled', 'suspended'] as const) {
      expect(isFinal({ status, proposedAt: proposed }, t0 + 10 * AUTO_CONFIRM_MS)).toBe(false);
    }
    expect(autoConfirmAt({ status: 'confirmed', proposedAt: proposed })).toBeNull();
    const list = [m, { status: 'confirmed' as const, proposedAt: null }, { status: 'disputed' as const, proposedAt: proposed }];
    expect(finalMatches(list, t0 + 1)).toHaveLength(1);
    expect(finalMatches(list, t0 + AUTO_CONFIRM_MS)).toHaveLength(2);
  });

  it('confirma el rival o el admin; disputa solo el rival y dentro de las 48 h', () => {
    expect(canConfirm(m, 2, false)).toBe(true);
    expect(canConfirm(m, 1, false)).toBe(false);
    expect(canConfirm(m, null, false)).toBe(false);
    expect(canConfirm(m, null, true)).toBe(true);
    expect(canConfirm({ ...m, status: 'confirmed' }, 2, true)).toBe(false);
    expect(canDispute(m, 2, t0 + 1000)).toBe(true);
    expect(canDispute(m, 2, t0 + AUTO_CONFIRM_MS)).toBe(false);
    expect(canDispute(m, 1, t0 + 1000)).toBe(false);
  });

  it('turno vencido', () => {
    expect(leaseExpired({ leaseUntil: null })).toBe(true);
    expect(leaseExpired({ leaseUntil: '2026-10-05T23:05:00Z' }, Date.parse('2026-10-05T23:04:59Z'))).toBe(false);
    expect(leaseExpired({ leaseUntil: '2026-10-05T23:05:00Z' }, Date.parse('2026-10-05T23:05:00Z'))).toBe(true);
  });
});

describe('lados', () => {
  const m = toMatch(row(), sides, players);

  it('mi lado por mis jugadores o mis equipos; en los dos lados = ninguno', () => {
    expect(sideOf(m, { playerIds: ['pOtra'] })).toBe(2);
    expect(sideOf(m, { teamIds: ['pairA'] })).toBe(1);
    expect(sideOf(m, { playerIds: ['pOtra'], teamIds: ['pairA'] })).toBeNull();
    expect(sideOf(m, { playerIds: ['nadie'] })).toBeNull();
  });

  it('id del lado para las tablas: la pareja, o sus jugadores ordenados', () => {
    expect(sideKey(m.sides[0])).toBe('pairA');
    expect(sideKey({ teamId: null, players: [{ playerId: 'b' }, { playerId: 'a' }] as never })).toBe('p:a+b');
  });
});

describe('lo pendiente en la cola se ve de una', () => {
  const base = toMatch(row({ status: 'live', seq: 3, scorer_id: 'u-ana', lease_until: '2026-10-05T23:40:00Z' }), sides, players);

  it('publicar, terminar, confirmar y disputar', () => {
    const pub = overlayMatch(base, [item('publish_match', { p_match: 'm1', p_seq: 5, p_state: { v: 1 }, p_score: { text: '3-2' } })]);
    expect(pub).toMatchObject({ seq: 5, score: { text: '3-2' }, status: 'live', pending: true });
    // Una publicación vieja no pisa.
    expect(overlayMatch(base, [item('publish_match', { p_match: 'm1', p_seq: 2, p_state: {}, p_score: null })])).toBe(base);
    const fin = overlayMatch(base, [item('finish_match', { p_match: 'm1', p_score: { text: '6-4 6-3' }, p_winner: 1 })]);
    expect(fin).toMatchObject({ status: 'finished', winner: 1, proposedBy: 'u-ana', proposedAt: '2026-10-05T23:30:00.000Z', scorerId: null });
    const conf = overlayMatch(fin, [item('confirm_result', { p_match: 'm1' })]);
    expect(conf).toMatchObject({ status: 'confirmed', confirmedBy: 'u-ana' });
    const disp = overlayMatch(fin, [item('dispute_result', { p_match: 'm1', p_note: 'fue 7-5' })]);
    expect(disp).toMatchObject({ status: 'disputed', disputeNote: 'fue 7-5' });
    // Confirmar algo que no está por confirmar: nada.
    expect(overlayMatch(base, [item('confirm_result', { p_match: 'm1' })])).toBe(base);
  });

  it('suspender y cambiar la alineación', () => {
    const sus = overlayMatch(base, [item('suspend_match', { p_match: 'm1', p_score: { text: '6-4 2-1' } })]);
    expect(sus).toMatchObject({ status: 'suspended', score: { text: '6-4 2-1' }, scorerId: null });
    const lineup = overlayMatch(base, [item('set_match_players', { p_match: 'm1', p_side: 1, p_players: [{ player_id: 'pPedro', sub: true }] })]);
    expect(lineup.sides[0].players).toEqual([{ playerId: 'pPedro', side: 1, position: null, jersey: null, sub: true }]);
    expect(lineup.sides[1]).toBe(base.sides[1]);
  });

  it('publicar pone en vivo como el servidor: solo con algo nuevo, y un suspendido solo si quien publica lo retomó', () => {
    const sus = toMatch(row({ status: 'suspended', seq: 4, scorer_id: null }), sides, players);
    // Lo mismo que ya estaba (abrir la cancha para mirar): no.
    const same = overlayMatch(sus, [item('publish_match', { p_match: 'm1', p_seq: 4, p_state: { v: 1, seq: 4 }, p_score: null })]);
    expect(same.status).toBe('suspended');
    // Algo nuevo de un teléfono que no pidió el turno (el servidor dice 'lease'): sigue suspendido.
    expect(overlayMatch(sus, [item('publish_match', { p_match: 'm1', p_seq: 5, p_state: { v: 1, seq: 5 }, p_score: null })]).status).toBe('suspended');
    // Lo retomó (tiene el turno) y anota algo nuevo: en vivo.
    const mine = { ...sus, scorerId: 'u-ana' };
    expect(overlayMatch(mine, [item('publish_match', { p_match: 'm1', p_seq: 5, p_state: { v: 1, seq: 5 }, p_score: null })]).status).toBe('live');
    const sched = toMatch(row({ status: 'scheduled', seq: 0 }), sides, players);
    expect(overlayMatch(sched, [item('publish_match', { p_match: 'm1', p_seq: 1, p_state: { v: 1, seq: 1 }, p_score: null })]).status).toBe('live');
  });

  it('lo último que el teléfono vio del partido completo (la cancha sin señal sigue desde ahí)', () => {
    expect(cachedCourtState('nadie')).toBeNull();
    const state = { v: 1, seq: 7, config: {}, base: null, log: [], at: 0, origin: 'tel-A' };
    const full = toMatch(row({ id: 'm-cache', seq: 7, state }), sides, players);
    queryClient.setQueryData<Wire<Match> | null>(matchKeys.one('m-cache'), full);
    expect(cachedCourtState('m-cache')).toEqual({ state, seq: 7 });
    // De una lista (sin el estado del anotador) no sirve.
    const listed = toMatch(row({ id: 'm-lista', seq: 2 }), sides, players);
    queryClient.setQueryData<Wire<Match> | null>(matchKeys.one('m-lista'), listed);
    expect(cachedCourtState('m-lista')).toBeNull();
  });

  it('lo de otro partido o de otra RPC no toca la lista', () => {
    const list = [base];
    expect(overlayMatches(list, [item('publish_match', { p_match: 'otro', p_seq: 9, p_state: {}, p_score: null })])).toBe(list);
    expect(overlayMatches(list, [item('save_game', { p_entry: 'x' })])).toBe(list);
  });
});

describe('tiempo real', () => {
  it("el aviso 'match' pone la fila en la caché sin volver a leer (y respeta la lista de otro evento)", () => {
    const m = toMatch(row(), sides, players);
    const keyL = matchKeys.league('L');
    const keyE = matchKeys.event('E');
    const keyOther = matchKeys.event('E2');
    remember(keyL, { kind: 'matches', lid: 'L' });
    remember(keyE, { kind: 'matches', lid: 'L', eventId: 'E' });
    remember(keyOther, { kind: 'matches', lid: 'L', eventId: 'E2' });
    queryClient.setQueryData<Wire<Match>[]>(keyL, [m]);
    queryClient.setQueryData<Wire<Match>[]>(keyE, [m]);
    queryClient.setQueryData<Wire<Match>[]>(keyOther, []);
    const live = row({ status: 'live', score: { text: '15-0', sides: [0, 0] }, seq: 2, version: 3, scorer_id: 'u-ana' });
    handleMatchMessage('league:L', { event: 'match', payload: live });
    for (const key of [keyL, keyE]) {
      const [got] = queryClient.getQueryData<Wire<Match>[]>(key)!;
      expect(got).toMatchObject({ status: 'live', score: { text: '15-0' }, seq: 2, version: 3, scorerId: 'u-ana' });
      // Los lados siguen (el aviso no los trae).
      expect(got.sides[0].label).toBe('Ana / Luis');
    }
    expect(queryClient.getQueryData<Wire<Match>[]>(keyOther)).toEqual([]);
    // Se cambia de evento: sale de la lista del evento viejo.
    handleMatchMessage('league:L', { event: 'match', payload: row({ event_id: 'E2', version: 4 }) });
    expect(queryClient.getQueryData<Wire<Match>[]>(keyE)).toEqual([]);
  });
});
