import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryClient } from './client';
import {
  badgeKeys,
  badgeTags,
  fetchBadgeNotices,
  fetchLeagueAwards,
  fetchPlayerAwards,
  fetchProfileBadges,
  markBadgesSeen,
  reviewBadge,
  setBadgeHidden,
  setBadgesAuto,
  setFeaturedBadges,
  type BadgeNotices,
} from './badges';
import { fetchLeague } from './leagues';
import { watchTopicFor } from './topics';
import { openWorld, type TestWorld } from './testkit';

/**
 * La capa de datos de las insignias contra la base de verdad (PGlite con las migraciones): liga pública de boliche
 * de rosa; ana y luis juegan. Las insignias se insertan directo (como lo haría el motor con badge_apply).
 */

let w: TestWorld;
let rosa: string;
let ana: string;
let luis: string;
let lid: string;
let anaPlayer: string;
let luisPlayer: string;
const ids: Record<string, string> = {};

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

async function until(ok: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('no llegó a tiempo');
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function award(name: string, cols: Record<string, unknown>) {
  const keys = Object.keys(cols);
  const [{ id }] = await q<{ id: string }>(
    `insert into public.badge_awards (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(cols),
  );
  ids[name] = id;
  return id;
}

beforeAll(async () => {
  w = await openWorld();
  rosa = await w.signUp('rosa@x.com', 'Rosa');
  ana = await w.signUp('ana@x.com', 'Ana');
  luis = await w.signUp('luis@x.com', 'Luis');
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('bowling', 'liga', 'public', 'Liga Los Pinos', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Rosa', '18095550000', false) returning id`,
    [rosa],
  );
  await q(
    `insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'Rosa'), ($1, $3, 'member', 'Ana'), ($1, $4, 'member', 'Luis')`,
    [lid, rosa, ana, luis],
  );
  [{ id: anaPlayer }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, 'Ana P.', $2) returning id`, [lid, ana]);
  [{ id: luisPlayer }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, 'Luis G.', $2) returning id`, [lid, luis]);
  const league = { league: { id: lid, name: 'Liga Los Pinos' } };
  await award('debut', { badge_key: 'debut', sport: 'bowling', level: 0, period_key: '-', user_id: ana, status: 'firme', context: { v: 1, ...league } });
  await award('month', {
    badge_key: 'player_of_month',
    sport: 'bowling',
    level: 0,
    period_key: '2026-09',
    player_id: anaPlayer,
    league_id: lid,
    status: 'firme',
    context: { v: 1, ...league, window: ['2026-09-01', '2026-09-30'], values: { valor: 'promedio 187 en 12 juegos' } },
  });
  await award('private', {
    badge_key: 'bowling_breakthrough',
    sport: 'bowling',
    level: 1,
    period_key: '-',
    user_id: ana,
    status: 'firme',
    hidden: true,
    context: { v: 1, values: { n: 10 } },
  });
  await award('perfect', {
    badge_key: 'bowling_perfect_game',
    sport: 'bowling',
    level: 0,
    period_key: 'g:x:0',
    player_id: luisPlayer,
    league_id: lid,
    status: 'en_revision',
    context: { v: 1, ...league, values: { n: 300 } },
  });
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('insignias (capa de datos)', () => {
  it('la vitrina propia trae todo; la de otra cuenta, solo lo público', async () => {
    await w.as('ana@x.com');
    const mine = await fetchProfileBadges(ana);
    expect(mine).toMatchObject({ userId: ana, isMe: true, featured: [], truncated: false });
    expect(mine!.awards.map((a) => a.key).sort()).toEqual(['bowling_breakthrough', 'debut', 'player_of_month']);
    const month = mine!.awards.find((a) => a.key === 'player_of_month')!;
    expect(month).toMatchObject({ scope: 'liga', leagueId: lid, leagueName: 'Liga Los Pinos', playerId: anaPlayer, periodKey: '2026-09', status: 'firme', seenAt: null });
    expect(mine!.awards.find((a) => a.key === 'debut')).toMatchObject({ scope: 'cuenta', leagueId: null, sport: 'bowling', level: 0 });
    expect(mine!.awards.find((a) => a.key === 'bowling_breakthrough')!.hidden).toBe(true);

    await w.as('luis@x.com');
    const other = await fetchProfileBadges(ana);
    expect(other!.isMe).toBe(false);
    expect(other!.awards.map((a) => a.key).sort()).toEqual(['debut', 'player_of_month']);
  });

  it('destacadas: hasta 3 suyas; ocultar una la quita', async () => {
    await w.as('ana@x.com');
    expect(await setFeaturedBadges([ids.debut, ids.month])).toEqual([ids.debut, ids.month]);
    expect((await fetchProfileBadges(ana))!.featured).toEqual([ids.debut, ids.month]);
    // Una oculta no se puede destacar.
    await expect(setFeaturedBadges([ids.private])).rejects.toThrow();
    await w.as('luis@x.com');
    expect((await fetchProfileBadges(ana))!.featured).toEqual([ids.debut, ids.month]);

    await w.as('ana@x.com');
    expect(await setBadgeHidden({ id: ids.debut, leagueId: null }, true)).toBe(true);
    expect((await fetchProfileBadges(ana))!.featured).toEqual([ids.month]);
    await w.as('luis@x.com');
    expect((await fetchProfileBadges(ana))!.awards.map((a) => a.key)).toEqual(['player_of_month']);
    // No es suya.
    await expect(setBadgeHidden({ id: ids.month, leagueId: lid }, true)).rejects.toThrow();
    await w.as('ana@x.com');
    await setBadgeHidden({ id: ids.debut, leagueId: null }, false);
  });

  it('avisos: las sin ver, y al marcarlas vistas ya no salen', async () => {
    await w.as('ana@x.com');
    const before = await fetchBadgeNotices();
    expect(before.awards.map((a) => a.id).sort()).toEqual([ids.debut, ids.month, ids.private].sort());
    expect(before.unseen).toBe(3);
    expect(before.reviews).toEqual([]);
    expect(before.leagueAwards).toEqual([]);
    expect(await markBadgesSeen(before.awards.map((a) => a.id))).toBe(3);
    expect((await fetchBadgeNotices()).awards).toEqual([]);
    expect((await fetchProfileBadges(ana))!.awards.every((a) => a.seenAt !== null)).toBe(true);
  });

  it('aval: la dueña la ve «Por confirmar», la confirma y queda firme en la liga', async () => {
    await w.as('rosa@x.com');
    const { reviews } = await fetchBadgeNotices();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ id: ids.perfect, key: 'bowling_perfect_game', leagueId: lid, playerName: 'Luis G.', overdue: false });
    // En la liga todavía no se ve.
    expect((await fetchLeagueAwards(lid, '2020-01-01')).map((a) => a.key)).toEqual(['player_of_month']);
    expect(await reviewBadge(reviews[0], true, 'Lo vi')).toBe('firme');
    expect((await fetchBadgeNotices()).reviews).toEqual([]);
    const league = await fetchLeagueAwards(lid, '2020-01-01');
    expect(league.map((a) => a.key).sort()).toEqual(['bowling_perfect_game', 'player_of_month']);
    // Firme y pública: queda quién la confirmó, la nota no (solo se guarda al rechazar).
    const review = league.find((a) => a.key === 'bowling_perfect_game')!.context.review;
    expect(review).toMatchObject({ ok: true });
    expect(review).not.toHaveProperty('note');
    // El jugador no puede confirmarse a sí mismo.
    await w.as('luis@x.com');
    expect((await fetchBadgeNotices()).reviews).toEqual([]);
  });

  it('la página del jugador: las suyas de esa liga', async () => {
    await w.as('luis@x.com');
    const list = await fetchPlayerAwards(lid, anaPlayer);
    expect(list.map((a) => a.key)).toEqual(['player_of_month']);
    expect(list[0]).toMatchObject({ scope: 'liga', leagueName: 'Liga Los Pinos', seenAt: null });
    expect(await fetchPlayerAwards(lid, luisPlayer)).toHaveLength(1);
  });

  it('insignias automáticas de la liga: solo la dueña', async () => {
    await w.as('rosa@x.com');
    expect((await fetchLeague(lid))!.badgesAuto).toBe('todas');
    expect(await setBadgesAuto(lid, 'sin_titulos')).toBe('sin_titulos');
    expect((await fetchLeague(lid))!.badgesAuto).toBe('sin_titulos');
    await w.as('ana@x.com');
    await expect(setBadgesAuto(lid, 'todas')).rejects.toThrow();
  });

  it('tiempo real: una insignia nueva llega sola a los avisos (user:<cuenta>)', async () => {
    await w.as('ana@x.com');
    const key = badgeKeys.notices;
    const stop = queryClient.observe<BadgeNotices>(key, () => fetchBadgeNotices(), { tags: [badgeTags.all, badgeTags.mine], initial: { awards: [], unseen: 0, reviews: [], leagueAwards: [] } }, () => undefined);
    const release = watchTopicFor(`user:${ana}`);
    try {
      await until(() => queryClient.getQueryData<BadgeNotices>(key) !== undefined);
      expect(queryClient.getQueryData<BadgeNotices>(key)!.awards).toEqual([]);
      await award('mileage', { badge_key: 'mileage', sport: 'all', level: 1, period_key: '-', user_id: ana, status: 'firme', context: { v: 1, values: { n: 50 } } });
      await until(() => (queryClient.getQueryData<BadgeNotices>(key)?.awards.length ?? 0) === 1);
      expect(queryClient.getQueryData<BadgeNotices>(key)!.awards[0]).toMatchObject({ id: ids.mileage, key: 'mileage', sport: 'all' });
    } finally {
      release();
      stop();
    }
  });
});
