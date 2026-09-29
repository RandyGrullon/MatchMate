import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackendError } from '../backend/types';
import {
  asGenericNotice,
  cancelClaim,
  claimConflictList,
  claimErrorText,
  claimNotices,
  decideClaim,
  fetchClaimConflicts,
  fetchLeagueClaims,
  fetchMyClaims,
  pickClaim,
  requestClaim,
  sortClaims,
  toClaim,
  type ClaimRow,
  type PlayerClaim,
} from './claims';
import { openWorld, type TestWorld } from './testkit';

const row = (over: Partial<ClaimRow> = {}): ClaimRow => ({
  id: 'c1',
  league_id: 'L1',
  player_id: 'p1',
  user_id: 'u-ana',
  status: 'pending',
  note: null,
  claimant_name: 'ana',
  player_name: 'Pedro',
  created_at: '2026-09-28T10:00:00.000Z',
  updated_at: '2026-09-28T10:00:00.000Z',
  decided_by: null,
  decided_at: null,
  decision_note: null,
  ...over,
});
const claim = (over: Partial<ClaimRow> = {}): PlayerClaim => toClaim(row(over));

describe('pedidos (sin base)', () => {
  it('toClaim pasa a camelCase y rellena nombres vacíos', () => {
    expect(toClaim(row({ claimant_name: ' ', player_name: '' }))).toEqual({
      id: 'c1',
      leagueId: 'L1',
      playerId: 'p1',
      userId: 'u-ana',
      status: 'pending',
      note: null,
      claimantName: 'Alguien',
      playerName: 'un jugador',
      requestedAt: '2026-09-28T10:00:00.000Z',
      changedAt: '2026-09-28T10:00:00.000Z',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
  });

  it('orden: pendientes primero (el más viejo arriba), luego decididos (el más nuevo arriba)', () => {
    const list = [
      claim({ id: 'd-old', status: 'rejected', decided_at: '2026-09-20T00:00:00.000Z' }),
      claim({ id: 'p-new', created_at: '2026-09-28T12:00:00.000Z' }),
      claim({ id: 'd-new', status: 'approved', decided_at: '2026-09-27T00:00:00.000Z' }),
      claim({ id: 'p-old', created_at: '2026-09-27T12:00:00.000Z' }),
    ];
    expect(sortClaims(list).map((c) => c.id)).toEqual(['p-old', 'p-new', 'd-new', 'd-old']);
  });

  it('pickClaim: el pendiente de esa liga; si no, el último decidido (nunca un cancelado)', () => {
    const list = [
      claim({ id: 'x', league_id: 'L2' }),
      claim({ id: 'a', status: 'rejected', decided_at: '2026-09-20T00:00:00.000Z' }),
      claim({ id: 'b', status: 'cancelled', decided_at: '2026-09-27T00:00:00.000Z' }),
    ];
    expect(pickClaim(list, 'L1')?.id).toBe('a');
    expect(pickClaim([...list, claim({ id: 'p' })], 'L1')?.id).toBe('p');
    expect(pickClaim(list, 'L9')).toBeNull();
  });

  it('errores: conflicto con la lista, y los demás en palabras simples', () => {
    const conflict = new BackendError('conflicto: Juegos en el mismo evento (2), Partidos donde juegan los dos (1)', 'validation', 'P0001');
    expect(claimConflictList(conflict)).toEqual(['Juegos en el mismo evento (2)', 'Partidos donde juegan los dos (1)']);
    expect(claimErrorText(conflict)).toBe(
      'No se pueden juntar los dos jugadores: Juegos en el mismo evento (2), Partidos donde juegan los dos (1). Quita lo repetido y aprueba otra vez.',
    );
    expect(claimConflictList(new Error('duplicado'))).toBeNull();
    expect(claimErrorText(new BackendError('duplicado', 'conflict', 'P0001'))).toBe('Ese jugador ya tiene cuenta o alguien más lo pidió.');
    expect(claimErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Hiciste muchos pedidos hoy. Prueba mañana.');
    expect(claimErrorText(new BackendError('no_permitido', 'permission', '42501'))).toBe('Solo el dueño o un admin de la liga puede hacer eso.');
    expect(claimErrorText(new BackendError('Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.', 'permission', 'bloqueada'))).toBe(
      'Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.',
    );
    expect(claimErrorText(null)).toBe('No se pudo. Prueba otra vez.');
  });
});

describe('avisos de la campana', () => {
  const now = Date.parse('2026-09-28T12:00:00.000Z');
  const leagues = [{ id: 'L1', name: 'Liga del Banco', sport: 'bowling' }];

  it('al admin: los pendientes de otros (no los suyos) llevan a Admin › Reclamos', () => {
    const notices = claimNotices({
      uid: 'u-org',
      leagueClaims: [claim(), claim({ id: 'c2', user_id: 'u-org' }), claim({ id: 'c3', status: 'approved', decided_at: '2026-09-28T11:00:00.000Z' })],
      leagues,
      now,
    });
    expect(notices).toEqual([
      {
        id: 'reclamo:c1',
        kind: 'claim-request',
        title: 'ana dice que es Pedro',
        body: 'En Liga del Banco. Toca para aprobar o rechazar.',
        url: '/l/L1/admin?tab=reclamos',
        at: '2026-09-28T10:00:00.000Z',
        lid: 'L1',
        sport: 'bowling',
      },
    ]);
    expect(asGenericNotice(notices[0])).toEqual({
      id: 'reclamo:c1',
      kind: 'social',
      title: 'ana dice que es Pedro',
      body: 'En Liga del Banco. Toca para aprobar o rechazar.',
      url: '/l/L1/admin?tab=reclamos',
      at: '2026-09-28T10:00:00.000Z',
      lid: 'L1',
      sport: 'bowling',
    });
  });

  it('a quien pidió: aprobado o rechazado (con la nota), 14 días, el más nuevo primero', () => {
    const notices = claimNotices({
      uid: 'u-ana',
      myClaims: [
        claim({ id: 'ok', status: 'approved', decided_at: '2026-09-27T00:00:00.000Z' }),
        claim({ id: 'no', status: 'rejected', decided_at: '2026-09-28T00:00:00.000Z', decision_note: 'Pedro es otro' }),
        claim({ id: 'viejo', status: 'approved', decided_at: '2026-09-01T00:00:00.000Z' }),
        claim({ id: 'pend' }),
        claim({ id: 'cancel', status: 'cancelled', decided_at: '2026-09-28T00:00:00.000Z' }),
      ],
      leagues,
      now,
    });
    expect(notices.map((n) => [n.id, n.kind, n.title, n.body, n.url])).toEqual([
      ['reclamo-no:no', 'claim-rejected', 'No se aprobó: no quedaste como Pedro', 'Pedro es otro', '/l/L1'],
      ['reclamo-ok:ok', 'claim-approved', 'Te aprobaron: ahora eres Pedro', 'En Liga del Banco. Tus juegos quedaron juntos.', '/l/L1'],
    ]);
  });
});

describe('pedidos contra la base (PGlite con las migraciones)', () => {
  let w: TestWorld;
  let org: string;
  let ana: string;
  let lid: string;
  let pedro: string;
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

  beforeAll(async () => {
    w = await openWorld();
    org = await w.signUp('org@x.com', 'org');
    ana = await w.signUp('ana@x.com', 'ana');
    [{ id: lid }] = await q<{ id: string }>(
      `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
       values ('bowling', 'liga', 'public', 'Liga Abierta', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Org', '18095550000', false) returning id`,
      [org],
    );
    await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'org')`, [lid, org]);
    [{ id: pedro }] = await q<{ id: string }>(`insert into public.players (league_id, name) values ($1, 'Pedro') returning id`, [lid]);
  }, 120_000);

  afterAll(async () => {
    await w?.close();
  });

  it('pedir, ver, cancelar, pedir otra vez y aprobar', async () => {
    await w.as('ana@x.com');
    const joined = await w.b.rpc<{ player_id: string; claim_id: string | null }>('join_league', { p_league: lid, p_prefer: pedro });
    expect(joined.claim_id).toBeTruthy();
    expect(joined.player_id).not.toBe(pedro);
    const mine = await fetchMyClaims(ana);
    expect(mine.map((c) => [c.id, c.status, c.playerName, c.claimantName])).toEqual([[joined.claim_id, 'pending', 'Pedro', 'ana']]);
    // Pedir el mismo otra vez: el mismo pedido.
    expect(await requestClaim(lid, pedro, '  Soy yo  ')).toBe(joined.claim_id);
    await cancelClaim(lid, joined.claim_id!);
    expect((await fetchMyClaims(ana))[0].status).toBe('cancelled');
    const again = await requestClaim(lid, pedro, 'Soy yo');
    // Ana no es admin: de la liga solo ve lo suyo (el pendiente primero).
    expect((await fetchLeagueClaims(lid)).map((c) => c.id)).toEqual([again, joined.claim_id]);
    await expect(decideClaim(lid, again!, true)).rejects.toMatchObject({ kind: 'permission' });

    await w.as('org@x.com');
    const list = await fetchLeagueClaims(lid);
    expect(list.map((c) => [c.status, c.note])).toEqual([
      ['pending', 'Soy yo'],
      ['cancelled', null],
    ]);
    expect(await fetchClaimConflicts(again!)).toEqual([]);
    expect(claimNotices({ uid: org, leagueClaims: list, leagues: [{ id: lid, name: 'Liga Abierta' }] }).map((n) => n.title)).toEqual(['ana dice que es Pedro']);
    expect(await decideClaim(lid, again!, true)).toBe('approved');
    expect(await q('select user_id from public.players where id = $1', [pedro])).toEqual([{ user_id: ana }]);
    expect(await q('select count(*)::int as n from public.players where league_id = $1 and user_id = $2', [lid, ana])).toEqual([{ n: 1 }]);

    await w.as('ana@x.com');
    const decided = await fetchMyClaims(ana);
    expect(claimNotices({ uid: ana, myClaims: decided }).map((n) => n.title)).toEqual(['Te aprobaron: ahora eres Pedro']);
  });
});
