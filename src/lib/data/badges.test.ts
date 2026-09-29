import { describe, expect, it } from 'vitest';
import { awardFromRow, daysAgo, isBadgesAutoMode, progressFromRow, statFromRow, toBadgeAward, toBadgeNotices, toLeagueBadgeAward, toProfileBadges } from './badges';
import { handleMessage } from './topics';

/** Lo que llega de la base (RPC y `select`) a lo que ven las pantallas: lo dañado se salta, lo raro se acomoda. */

const raw = {
  id: 'a1',
  key: 'debut',
  sport: 'bowling',
  level: 0,
  periodKey: '-',
  scope: 'cuenta',
  status: 'firme',
  awardedAt: '2026-10-01T12:00:00Z',
  firmAt: null,
  leagueId: null,
  leagueName: null,
  playerId: null,
  context: { v: 1, league: { id: 'L', name: 'Liga' } },
  hidden: false,
  seenAt: null,
};

describe('insignias: de la base a la pantalla', () => {
  it('una insignia de profile_badges / badge_notices', () => {
    expect(toBadgeAward(raw)).toEqual({ ...raw, history: false });
    expect(toBadgeAward({ ...raw, level: 9, status: 'rara', scope: 'liga', context: { historial: true } })).toMatchObject({ level: 5, status: 'provisional', scope: 'liga', history: true });
    expect(toBadgeAward({ ...raw, history: true })!.history).toBe(true);
    expect(toBadgeAward({ ...raw, id: '' })).toBeNull();
    expect(toBadgeAward({ ...raw, awardedAt: null })).toBeNull();
    expect(toBadgeAward('x')).toBeNull();
  });

  it('la vitrina: destacadas solo de las que vienen, sin repetir y hasta 3', () => {
    const p = toProfileBadges({
      userId: 'u1',
      isMe: true,
      featured: ['a1', 'zz', 'a1'],
      awards: [raw, { nada: 1 }],
      truncated: false,
      leagueAwards: [{ id: 'la', leagueId: 'L', awardedAt: '2026-10-01T00:00:00Z', badge: { name: 'MVP', shape: 'star', palette: 'oro', icon: 'star' } }, { id: 'sin-diseno' }],
    })!;
    expect(p.featured).toEqual(['a1']);
    expect(p.featuredLeague).toEqual([]);
    expect(p.awards).toHaveLength(1);
    expect(p.leagueAwards).toHaveLength(1);
    expect(p.leagueAwards[0]).toMatchObject({ id: 'la', badge: { name: 'MVP', topText: '', periodText: '', color: null }, prizeSlotId: null, prize: null, onProfile: true });
    expect(toProfileBadges(null)).toBeNull();
    // Sin las del creador (antes de su migración): lista vacía.
    expect(toProfileBadges({ userId: 'u', isMe: false, featured: [], awards: [] })!.leagueAwards).toEqual([]);
  });

  it('la vitrina: destacadas de las dos listas (automáticas y de la liga), en su orden', () => {
    const league = (id: string, extra: Record<string, unknown> = {}) => ({ id, leagueId: 'L', awardedAt: '2026-10-01T00:00:00Z', badge: { name: 'Campeón' }, ...extra });
    const p = toProfileBadges({
      userId: 'u1',
      isMe: false,
      featured: ['la', 'a1', 'fuera', 'lb', 'la'],
      featuredLeague: ['la', 'lb'],
      awards: [raw],
      leagueAwards: [league('la'), league('lb')],
    })!;
    expect(p.featured).toEqual(['la', 'a1', 'lb']);
    expect(p.featuredLeague).toEqual(['la', 'lb']);
    // Sin `featuredLeague` (base de antes) igual se sabe cuáles son de la liga.
    expect(toProfileBadges({ userId: 'u1', featured: ['lb'], awards: [], leagueAwards: [league('lb')] })!.featuredLeague).toEqual(['lb']);
  });

  it('la vitrina: hasChosen (eligió aunque quien mira no vea ninguna); sin el campo, si se ve alguna', () => {
    expect(toProfileBadges({ userId: 'u1', featured: [], hasChosen: true, awards: [] })!).toMatchObject({ featured: [], hasChosen: true });
    expect(toProfileBadges({ userId: 'u1', featured: [], hasChosen: false, awards: [] })!.hasChosen).toBe(false);
    // Base de antes (sin hasChosen): eligió si se ve alguna.
    expect(toProfileBadges({ userId: 'u1', featured: ['a1'], awards: [raw] })!.hasChosen).toBe(true);
    expect(toProfileBadges({ userId: 'u1', featured: [], awards: [raw] })!.hasChosen).toBe(false);
  });

  it('badge_notices: sin ver, cuántas y lo por confirmar', () => {
    const n = toBadgeNotices({
      awards: [raw],
      unseen: 60,
      reviews: [{ id: 'r', key: 'bowling_perfect_game', leagueId: 'L', playerName: '  ', refs: ['entry:x:0', 3], context: null, overdue: true }, { id: 'sin-liga', key: 'x' }],
    });
    expect(n.awards).toHaveLength(1);
    expect(n.unseen).toBe(60);
    expect(n.reviews).toEqual([
      { id: 'r', key: 'bowling_perfect_game', sport: 'all', level: 0, periodKey: '-', leagueId: 'L', leagueName: '', playerId: '', playerName: 'Un jugador', refs: ['entry:x:0', '3'], context: {}, awardedAt: '', overdue: true },
    ]);
    expect(n.leagueAwards).toEqual([]);
    expect(toBadgeNotices(undefined)).toEqual({ awards: [], unseen: 0, reviews: [], leagueAwards: [] });
  });

  it('filas de select: badge_awards, badge_progress, badge_stats', () => {
    expect(
      awardFromRow({
        id: 'x',
        badge_key: 'player_of_month',
        sport: 'padel',
        level: 0,
        period_key: '2026-09',
        player_id: 'p',
        user_id: null,
        league_id: 'L',
        status: 'firme',
        awarded_at: '2026-10-03T00:00:00Z',
        firm_at: null,
        context: { league: { id: 'L', name: 'Liga del Club' } },
        hidden: false,
      }),
    ).toMatchObject({ id: 'x', key: 'player_of_month', scope: 'liga', leagueName: 'Liga del Club', playerId: 'p', seenAt: null });
    expect(progressFromRow({ badge_key: 'bowling_games', sport: 'bowling', value: '27', target: 30, next_level: 1 })).toEqual({
      key: 'bowling_games',
      sport: 'bowling',
      value: 27,
      target: 30,
      nextLevel: 1,
      playerId: null,
      leagueId: null,
    });
    expect(progressFromRow({ badge_key: 'x', target: 'nada' })).toBeNull();
    expect(statFromRow({ badge_key: 'debut', sport: 'bowling', level: 0, holders: 5, base: 80, pct: 6.25, rarity: 'rara' })).toMatchObject({ pct: 6.25, rarity: 'rara' });
    expect(statFromRow({ badge_key: 'debut', rarity: 'otra' })!.rarity).toBe('nueva');
  });

  it('las del creador: lo que falta se rellena', () => {
    expect(toLeagueBadgeAward({ id: 'a', leagueId: 'L', awardedAt: 't', badge: { name: '  ' } })).toBeNull();
    expect(toLeagueBadgeAward({ id: 'a', leagueId: 'L', awardedAt: 't', badge: { id: 'b', name: 'MVP' } })).toMatchObject({ badgeId: 'b', badge: { shape: 'hex', palette: 'oro' } });
  });

  it('un premio del torneo: el lugar, su título y la competencia; onProfile en el perfil', () => {
    const base = { id: 'a', leagueId: 'L', awardedAt: '2026-10-12T00:00:00Z', badge: { id: 'b', name: 'Campeón' } };
    const prize = { slotId: 's1', verified: true, place: 1, placeLabel: '1.er lugar', category: 'individual', title: 'Individual (handicap)', competition: 'Copa de Octubre' };
    expect(toLeagueBadgeAward({ ...base, prizeSlotId: 's1', prize, onProfile: false })).toMatchObject({ prizeSlotId: 's1', prize, onProfile: false });
    // La competencia se borró: solo el lugar premiado y si se verificó.
    expect(toLeagueBadgeAward({ ...base, prizeSlotId: 's1', prize: { slotId: 's1', verified: false, place: null, placeLabel: null, category: null, title: null, competition: null } })!.prize).toEqual({
      slotId: 's1',
      verified: false,
      place: null,
      placeLabel: null,
      category: null,
      title: null,
      competition: null,
    });
    // Datos raros: sin lugar premiado no es premio; lo demás se limpia.
    expect(toLeagueBadgeAward({ ...base, prize: { verified: true } })!.prize).toBeNull();
    expect(toLeagueBadgeAward({ ...base, prizeSlotId: 's2', prize: null })!.prize).toMatchObject({ slotId: 's2', verified: false, place: null });
    expect(toLeagueBadgeAward({ ...base, prizeSlotId: 's1', prize: { ...prize, place: 7, category: 'otra', title: '  ' } })!.prize).toMatchObject({ place: null, category: null, title: null });
    // Sin onProfile (los avisos): lo dice `hidden`.
    expect(toLeagueBadgeAward({ ...base, hidden: true })!.onProfile).toBe(false);
    expect(toLeagueBadgeAward(base)!.onProfile).toBe(true);
  });

  it('otros', () => {
    expect(isBadgesAutoMode('sin_titulos')).toBe(true);
    expect(isBadgesAutoMode('otra')).toBe(false);
    expect(daysAgo(16, Date.parse('2026-10-20T10:00:00Z'))).toBe('2026-10-04');
  });

  it('tiempo real: «badges» por la cuenta y por la liga invalida lo suyo', () => {
    // Sin consultas no pasa nada (solo que no truene).
    expect(() => handleMessage('user:u1', null, { event: 'badges', payload: { ids: ['a'] } })).not.toThrow();
    expect(() => handleMessage('league:L', 'L', { event: 'badges', payload: {} })).not.toThrow();
  });
});
