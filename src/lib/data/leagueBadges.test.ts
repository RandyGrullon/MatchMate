import { describe, expect, it } from 'vitest';
import { toLeague, toMember, type LeagueRow } from './rows';
import { badgeMakersOf, canMakeBadges, madeAwardFromRow, toBadgeHolders, toGiveResult, toLeagueBadge, withCounts } from './leagueBadges';

describe('creador de insignias: de la base a la pantalla', () => {
  it('un diseño de la RPC (camelCase) y de la tabla (snake_case)', () => {
    const rpc = toLeagueBadge({
      id: 'B1',
      leagueId: 'L1',
      name: 'Campeón',
      description: 'El título.',
      shape: 'shield',
      palette: 'color',
      color: '#dc2626',
      icon: 'trophy',
      topText: 'LOS PINOS',
      periodText: 'TEMP 2026',
      template: 'champion',
      limitKind: 'unica',
      byTeam: true,
      status: 'activa',
      createdBy: 'u1',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
      given: 2,
      active: 1,
      locked: true,
      openReports: 1,
    });
    expect(rpc).toMatchObject({ id: 'B1', leagueId: 'L1', palette: 'color', color: '#dc2626', topText: 'LOS PINOS', limitKind: 'unica', byTeam: true, given: 2, active: 1, locked: true, openReports: 1 });
    const row = toLeagueBadge({ id: 'B2', league_id: 'L1', name: 'Mano amiga', shape: 'square', palette: 'rara', icon: 'hand-heart', top_text: '', period_text: '', limit_kind: 'x', by_team: false, status: 'oculta', created_at: 'a', updated_at: 'b' });
    expect(row).toMatchObject({ leagueId: 'L1', palette: 'oro', limitKind: 'abierta', status: 'oculta', given: 0, locked: false, openReports: null, template: null });
    expect(toLeagueBadge({ id: 'B3', league_id: 'L1', name: '  ' })).toBeNull();
    expect(toLeagueBadge(null)).toBeNull();
  });

  it('cuántas veces se dio sale de los otorgamientos que se ven; ya dado queda bloqueado', () => {
    const d = toLeagueBadge({ id: 'B1', league_id: 'L1', name: 'Campeón', shape: 'shield', palette: 'oro', icon: 'trophy' })!;
    const awards = [
      madeAwardFromRow({ id: 'a1', badge_id: 'B1', league_id: 'L1', player_id: 'p1', period: 'TEMP 2026', division: '', awarded_at: 'x', revoked_at: null, hidden: false })!,
      madeAwardFromRow({ id: 'a2', badge_id: 'B1', league_id: 'L1', player_id: 'p2', team_id: 'T1', period: '', division: 'Cat. A', awarded_at: 'x', revoked_at: 'y', hidden: true })!,
    ];
    expect(awards[1]).toMatchObject({ teamId: 'T1', revokedAt: 'y', hidden: true, division: 'Cat. A', prizeSlotId: null });
    // Un premio del torneo (docs/premios-torneo.md) dice de qué lugar salió.
    expect(madeAwardFromRow({ id: 'a4', badge_id: 'B1', player_id: 'p3', awarded_at: 'x', prize_slot_id: 'S1' })).toMatchObject({ prizeSlotId: 'S1' });
    expect(madeAwardFromRow({ id: 'a3' })).toBeNull();
    expect(withCounts([d], awards)[0]).toMatchObject({ given: 2, active: 1, locked: true });
    expect(withCounts([d], [])[0]).toMatchObject({ given: 0, active: 0, locked: false });
  });

  it('quién la tiene y lo que devuelve dar', () => {
    const h = toBadgeHolders({
      badge: { id: 'B1', leagueId: 'L1', name: 'MVP', shape: 'star', palette: 'oro', icon: 'crown', given: 1, locked: true },
      canGive: true,
      awards: [{ id: 'a1', playerId: 'p1', playerName: ' Ana ', userId: null, period: 'TEMP 2026', awardedAt: 'x', canUndo: true, note: 'Por tu 279' }, { id: '' }],
    });
    expect(h).toMatchObject({ canGive: true, badge: { name: 'MVP', locked: true } });
    expect(h!.awards).toEqual([
      expect.objectContaining({ id: 'a1', playerName: 'Ana', userId: null, canUndo: true, note: 'Por tu 279', awardedBy: null, revokedAt: null }),
    ]);
    expect(toBadgeHolders({ awards: [] })).toBeNull();
    expect(toGiveResult({ awards: [{ id: 'a1', badgeId: 'B1', playerId: 'p1', period: '', note: '' }], notified: 1 })).toMatchObject({ awards: [{ id: 'a1', teamId: null }], notified: 1 });
    expect(toGiveResult(null)).toEqual({ awards: [], notified: 0 });
  });
});

describe('quién diseña y da insignias (§5.1)', () => {
  const league = (badgeMakers?: 'owner' | 'admins' | 'chosen') => ({ badgeMakers });
  const m = (role: 'owner' | 'admin' | 'member', badgeMaker?: boolean) => ({ role, badgeMaker });

  it('el dueño (o el superadmin) siempre; los admins con «Yo y los admins»; los marcados con «Yo y los que yo elija»', () => {
    expect(badgeMakersOf({})).toBe('admins');
    expect(canMakeBadges({ isOwner: true, member: null, league: league('owner') })).toBe(true);
    expect(canMakeBadges({ isOwner: false, member: m('admin'), league: league() })).toBe(true);
    expect(canMakeBadges({ isOwner: false, member: m('admin'), league: league('owner') })).toBe(false);
    expect(canMakeBadges({ isOwner: false, member: m('admin'), league: league('chosen') })).toBe(false);
    expect(canMakeBadges({ isOwner: false, member: m('admin', true), league: league('chosen') })).toBe(true);
    expect(canMakeBadges({ isOwner: false, member: m('member', true), league: league('chosen') })).toBe(true);
    expect(canMakeBadges({ isOwner: false, member: m('member', true), league: league('admins') })).toBe(false);
    expect(canMakeBadges({ isOwner: false, member: m('member'), league: league('chosen') })).toBe(false);
    expect(canMakeBadges({ isOwner: false, member: null, league: league('admins') })).toBe(false);
  });

  it('la regla de la liga y el permiso del miembro llegan de la base', () => {
    const row = { id: 'L1', sport: 'bowling', kind: 'liga', visibility: 'public', name: 'Liga', owner_id: 'u1', badge_makers: 'chosen', created_at: 'x' } as unknown as LeagueRow;
    expect(toLeague(row).badgeMakers).toBe('chosen');
    expect('badgeMakers' in toLeague({ ...row, badge_makers: 'otra' })).toBe(false);
    const member = { league_id: 'L1', user_id: 'u2', role: 'member' as const, is_scorer: false, display_name: 'Ana', player_id: null };
    expect(toMember({ ...member, badge_maker: true }).badgeMaker).toBe(true);
    // Sin el permiso, la forma de siempre (no se añade la clave).
    expect(toMember({ ...member, badge_maker: false })).toEqual({ id: 'L1_u2', leagueId: 'L1', uid: 'u2', name: 'Ana', role: 'member', playerId: null, scorer: false });
  });
});
