import { describe, expect, it } from 'vitest';
import { unlockGateOpen } from './hold';
import type { BadgeAward, BadgeProgress, BadgeReview, BadgeStat, LeagueBadgeAward, ProfileBadges } from '../../lib/data/badges';
import {
  canReportAward,
  NOTICE_DAYS,
  UNLOCK_MAX,
  awardMonth,
  badgeNotices,
  countText,
  emptyOwnText,
  eventAwards,
  fillBadgeText,
  filterChips,
  groupTiles,
  leagueLookOf,
  leagueShareInputOf,
  leagueShelves,
  levelLine,
  lockedModels,
  monthAwards,
  monthText,
  myBadgesPath,
  officialCount,
  progressModel,
  rarityShareText,
  rarityText,
  retiredLines,
  reviewModel,
  seasonAwards,
  shareInputOf,
  shelfOf,
  shortDate,
  unlockPlan,
  upcoming,
  viewAward,
  viewLeagueAward,
  yearRecap,
} from './logic';

const LID = 'L1';
const league = { league: { id: LID, name: 'Liga Los Pinos' } };
const NOW = Date.parse('2026-10-05T15:00:00Z');

let n = 0;
function aw(p: Partial<BadgeAward> & Pick<BadgeAward, 'key'>): BadgeAward {
  n++;
  return {
    id: p.id ?? `a${n}`,
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
    context: {},
    hidden: false,
    seenAt: '2026-10-01T13:00:00Z',
    history: false,
    ...p,
  };
}

const figure = (p: Partial<BadgeAward> = {}) =>
  aw({
    key: 'player_of_month',
    scope: 'liga',
    leagueId: LID,
    leagueName: 'Liga Los Pinos',
    playerId: 'p1',
    periodKey: '2026-09',
    awardedAt: '2026-10-03T09:00:00Z',
    context: { ...league, window: ['2026-09-01', '2026-09-30'], values: { valor: 'promedio 187 en 12 juegos', avg: 187 } },
    ...p,
  });

describe('textos de una insignia', () => {
  it('rellena las llaves con la evidencia y lo que no viene se dice en general', () => {
    const v = viewAward(aw({ key: 'debut', context: league }))!;
    expect(v.name).toBe('Primera línea');
    expect(v.description).toBe('¡Arrancaste! Tu primer juego de boliche ya cuenta.');
    expect(v.metal).toBe('Única');
    expect(levelLine(v)).toBe('Única');
    expect(v.leagueName).toBe('Liga Los Pinos');
    expect(fillBadgeText('Fuiste la figura de {liga} en {mes}: {valor}.', {})).toBe('Fuiste la figura de tu liga en el mes.');
    expect(fillBadgeText('{equipo} no perdió', { equipo: 'Los Tigres' })).toBe('Los Tigres no perdió');
  });

  it('figura del mes: mes, liga, evidencia, medalla con la cinta del mes', () => {
    const v = viewAward(figure())!;
    expect(v.name).toBe('Figura del mes');
    expect(v.description).toBe('Fuiste la figura de Liga Los Pinos en septiembre de 2026: promedio 187 en 12 juegos.');
    expect(v.evidence).toBe('Promedio 187 en 12 juegos');
    expect(v.look).toMatchObject({ shape: 'medal', tier: 'unico', period: { long: 'SEP 2026', short: 'SEP 26' } });
    expect(v.label).toBe('Figura del mes, única, septiembre 2026');
    expect(v.date).toBe('3 oct 2026');
    expect(v.leagueId).toBe(LID);
  });

  it('niveles con nombre, metal, puntos y racha', () => {
    const club = viewAward(aw({ key: 'bowling_club', level: 2, context: { values: { n: 225 } } }))!;
    expect(club.levelName).toBe('Club 225');
    expect(levelLine(club)).toBe('Club 225 · Plata');
    expect(club.look).toMatchObject({ shape: 'star', tier: 'plata', pips: 2 });
    const podium = viewAward(aw({ key: 'event_podium', level: 3, scope: 'liga', periodKey: 'e:E1', context: { ...league, event: { id: 'E1', name: 'Copa' } } }))!;
    expect(levelLine(podium)).toBe('Primer lugar · Oro');
    expect(podium.look.pips).toBe(0);
    expect(podium.event).toEqual({ id: 'E1', name: 'Copa' });
    const streak = viewAward(aw({ key: 'month_streak', sport: 'all', level: 2, context: { values: { n: 6 } } }))!;
    expect(streak.description).toBe('6 meses seguidos jugando. ¡Tú no paras!');
    expect(streak.look).toMatchObject({ shape: 'circle', notches: 6, period: { long: '×6' } });
    expect(streak.evidence).toBe('6 meses');
  });

  it('una insignia que esta versión no conoce no se muestra', () => {
    expect(viewAward(aw({ key: 'algo_nuevo' }))).toBeNull();
  });

  it('mes de una insignia de cajas o sin clave de mes', () => {
    expect(awardMonth({ periodKey: 'b:E:2', context: { window: ['2026-08-01', '2026-08-31'] } })).toBe('2026-08');
    expect(awardMonth({ periodKey: 'b:E:2', context: {}, awardedAt: '2026-10-04T12:00:00Z' })).toBe('2026-09');
    expect(monthText('2026-10')).toBe('octubre de 2026');
    expect(shortDate('bad')).toBe('');
  });
});

describe('la vitrina', () => {
  const awards = [
    aw({ key: 'bowling_club', level: 1, awardedAt: '2026-06-01T00:00:00Z' }),
    aw({ key: 'bowling_club', level: 2, awardedAt: '2026-07-01T00:00:00Z' }),
    aw({ key: 'bowling_split', scope: 'liga', leagueId: LID, periodKey: 'g:x:0', awardedAt: '2026-05-01T00:00:00Z' }),
    aw({ key: 'bowling_split', scope: 'liga', leagueId: LID, periodKey: 'g:x:1', awardedAt: '2026-05-02T00:00:00Z' }),
    aw({ key: 'bowling_split', scope: 'liga', leagueId: LID, periodKey: 'g:x:2', awardedAt: '2026-05-03T00:00:00Z' }),
    aw({ id: 'new1', key: 'debut', awardedAt: '2026-10-03T00:00:00Z' }),
    aw({ key: 'bowling_breakthrough', level: 1, hidden: true }),
    aw({ key: 'bowling_perfect_game', status: 'en_revision', scope: 'liga', leagueId: LID }),
    aw({ key: 'month_streak', sport: 'all', level: 1 }),
    aw({ key: 'bowling_series', status: 'revocada', level: 1 }),
    aw({ key: 'desconocida' }),
  ];

  it('una por insignia: el nivel más alto al frente, ×N en las repetibles, ocultas y en revisión aparte', () => {
    const tiles = groupTiles(awards, { own: true, now: NOW });
    const club = tiles.find((t) => t.def.key === 'bowling_club')!;
    expect(club.top.award.level).toBe(2);
    expect(club.count).toBe(1);
    expect(club.views).toHaveLength(2);
    expect(tiles.find((t) => t.def.key === 'bowling_split')!.count).toBe(3);
    expect(tiles.find((t) => t.def.key === 'debut')!.state).toBe('new');
    expect(tiles.find((t) => t.def.key === 'bowling_breakthrough')).toMatchObject({ bucket: 'hidden', state: 'hidden' });
    expect(tiles.find((t) => t.def.key === 'bowling_perfect_game')).toMatchObject({ bucket: 'review', state: 'review' });
    expect(tiles.some((t) => t.def.key === 'bowling_series')).toBe(false);
    // Abierta en este teléfono: ya no es «Nueva».
    expect(groupTiles(awards, { own: true, now: NOW, opened: new Set(['new1']) }).find((t) => t.def.key === 'debut')!.state).toBe('unlocked');
    // Los demás no ven ocultas ni en revisión, ni «Nueva».
    const other = groupTiles(awards, { own: false, now: NOW });
    expect(other.map((t) => t.bucket)).not.toContain('hidden');
    expect(other.map((t) => t.bucket)).not.toContain('review');
    expect(other.find((t) => t.def.key === 'debut')!.state).toBe('unlocked');
  });

  it('por deporte (las de cuenta primero) y por sección; filtros y contador', () => {
    const tiles = groupTiles(awards, { own: true, now: NOW });
    const all = shelfOf(tiles, null);
    expect(all.map((g) => g.label)).toEqual(['Cuenta', 'Boliche']);
    expect(all[1].sections.map((s) => s.section)).toEqual(['Marcas', 'Hitos']);
    expect(shelfOf(tiles, 'all').map((g) => g.sport)).toEqual(['all']);
    expect(filterChips(['bowling', 'padel'], tiles).map((c) => c.label)).toEqual(['Todas', 'Boliche', 'Pádel', 'Cuenta']);
    expect(filterChips([], [])).toEqual([{ key: 'todas', label: 'Todas' }]);
    // Oficiales, desbloqueadas y visibles (ni oculta, ni en revisión, ni retirada, ni desconocida).
    expect(officialCount(awards)).toBe(7);
    expect(countText(1)).toBe('1 insignia');
    expect(countText(24)).toBe('24 insignias');
  });

  it('las retiradas que ya vio: una línea discreta', () => {
    const lines = retiredLines([
      aw({ id: 'r1', key: 'bowling_series', status: 'revocada', level: 1 }),
      aw({ id: 'r2', key: 'bowling_perfect_game', status: 'revocada', context: { review: { ok: false } } }),
    ]);
    expect(lines).toEqual([
      { id: 'r1', text: 'Se retiró «Serie de tres».' },
      { id: 'r2', text: 'No se pudo confirmar «Juego perfecto». Si fue un error, habla con tu liga.' },
    ]);
  });

  it('vacía: el texto del dueño con la unidad de su deporte', () => {
    expect(emptyOwnText(['padel'])).toBe('Juega tu primer partido en una liga y te llega la primera.');
    expect(emptyOwnText([])).toBe('Juega tu primer juego en una liga y te llega la primera.');
  });
});

describe('progreso, próximas y bloqueadas', () => {
  const prog = (p: Partial<BadgeProgress> & Pick<BadgeProgress, 'key'>): BadgeProgress => ({ sport: 'bowling', value: 0, target: 1, nextLevel: 1, playerId: null, leagueId: null, ...p });

  it('«Te faltan 3 juegos», en golf por debajo de la barrera', () => {
    expect(progressModel(prog({ key: 'bowling_games', value: 27, target: 30, nextLevel: 1 }))).toMatchObject({ ratio: 0.9, text: 'Te faltan 3 juegos', level: 1, name: 'Líneas jugadas' });
    expect(progressModel(prog({ key: 'bowling_games', value: 29, target: 30 }))!.text).toBe('Te falta 1 juego');
    const golf = progressModel(prog({ key: 'golf_break_barrier', sport: 'golf', value: 93, target: 90, nextLevel: 3 }))!;
    expect(golf.text).toBe('Te faltan 4 golpes');
    expect(golf.ratio).toBeCloseTo(90 / 93);
    expect(golf.how).toBe('Haz una ronda por debajo de 90 golpes, sin levantar la bola.');
    expect(progressModel(prog({ key: 'nada' }))).toBeNull();
  });

  it('las 3 más cerca, una por insignia', () => {
    const list = upcoming([
      prog({ key: 'bowling_games', value: 10, target: 30 }),
      prog({ key: 'bowling_games', value: 27, target: 30, playerId: 'p2' }),
      prog({ key: 'bowling_series', value: 500, target: 600 }),
      prog({ key: 'month_streak', sport: 'all', value: 11, target: 12, nextLevel: 3 }),
      prog({ key: 'mileage', sport: 'all', value: 5, target: 50 }),
    ]);
    expect(list.map((p) => p.def.key)).toEqual(['month_streak', 'bowling_games', 'bowling_series']);
    expect(list[1].value).toBe(27);
  });

  it('bloqueadas: las de sus deportes y de cuenta que no tiene, sin las cerradas', () => {
    const locked = lockedModels(['bowling'], [aw({ key: 'debut' })], [prog({ key: 'bowling_games', value: 20, target: 30 })]);
    const keys = new Set(locked.map((l) => l.def.key));
    expect(keys.has('debut')).toBe(false);
    expect(keys.has('bowlingx_roots')).toBe(false);
    expect(keys.has('racket_wins')).toBe(false);
    expect(keys.has('month_streak')).toBe(true);
    const games = locked.find((l) => l.id === 'bowling_games|bowling')!;
    expect(games.progress?.text).toBe('Te faltan 10 juegos');
    expect(games.how).toBe('Juega 30 juegos que cuenten (con foto o aprobados).');
    // Los podios se muestran bloqueados en el primer lugar.
    expect(locked.find((l) => l.def.key === 'event_podium')!.level).toBe(3);
  });
});

describe('rareza', () => {
  const stat = (p: Partial<BadgeStat>): BadgeStat => ({ key: 'x', sport: 'bowling', level: 0, holders: 10, base: 200, pct: 7, rarity: 'rara', ...p });
  it('«La tiene el 7 % de los jugadores de boliche», «Nueva» con poca base', () => {
    expect(rarityText(stat({}), 'bowling')).toBe('La tiene el 7 % de los jugadores de boliche');
    expect(rarityText(stat({ pct: 0.4 }), 'bowling')).toBe('La tiene menos del 1 % de los jugadores de boliche');
    expect(rarityText(stat({ base: 20 }), 'bowling')).toBe('Nueva');
    expect(rarityText(stat({ rarity: 'nueva' }), 'all')).toBe('Nueva');
    expect(rarityText(undefined, 'bowling')).toBeNull();
    expect(rarityShareText(stat({ pct: 4 }), 'bowling')).toBe('Solo el 4 % de los jugadores de boliche la tiene');
    expect(rarityShareText(stat({ pct: 40, rarity: 'comun' }), 'bowling')).toBeNull();
  });
});

describe('liga: premios del mes y campeones', () => {
  const month = [
    figure({ playerId: 'p1' }),
    figure({ playerId: 'p2', context: { ...league, window: ['2026-09-01', '2026-09-30'], values: { valor: 'promedio 187 en 12 juegos' } } }),
    aw({ key: 'perfect_attendance_month', scope: 'liga', leagueId: LID, playerId: 'p3', periodKey: '2026-09', context: { ...league } }),
    aw({ key: 'perfect_attendance_month', scope: 'liga', leagueId: LID, playerId: 'p4', periodKey: '2026-09', context: { ...league } }),
    aw({ key: 'box_top_month', sport: 'padel', scope: 'liga', leagueId: LID, playerId: 'p5', periodKey: 'b:E:1', context: { ...league, window: ['2026-09-01', '2026-09-30'], values: { caja: 2 } } }),
    aw({ key: 'box_top_month', sport: 'padel', scope: 'liga', leagueId: LID, playerId: 'p6', periodKey: 'b:E:1', context: { ...league, window: ['2026-09-01', '2026-09-30'], values: { caja: 1 } } }),
    // De otro mes: no sale.
    figure({ playerId: 'p9', periodKey: '2026-08', context: { ...league, window: ['2026-08-01', '2026-08-31'] } }),
  ];

  it('del día 3 al 9 del mes siguiente, con empates juntos y la asistencia aparte', () => {
    expect(monthAwards(month, '2026-10-02')).toBeNull();
    expect(monthAwards(month, '2026-10-10')).toBeNull();
    const m = monthAwards(month, '2026-10-03')!;
    expect(m.title).toBe('Premios de septiembre');
    expect(m.month).toBe('2026-09');
    expect(m.groups.map((g) => [g.view.award.key, g.subtitle, g.winners.map((w) => w.playerId)])).toEqual([
      ['player_of_month', null, ['p1', 'p2']],
      ['box_top_month', 'Caja 1', ['p6']],
      ['box_top_month', 'Caja 2', ['p5']],
    ]);
    expect(m.groups[0].winners[0].evidence).toBe('Promedio 187 en 12 juegos');
    expect(m.attendance.map((a) => a.playerId)).toEqual(['p3', 'p4']);
    expect(monthAwards([], '2026-10-05')).toBeNull();
  });

  it('campeones de la temporada por 14 días', () => {
    const season = [
      aw({ key: 'season_podium', level: 3, scope: 'liga', leagueId: LID, playerId: 'p1', periodKey: 's:S1', awardedAt: '2026-10-01T00:00:00Z', context: { ...league, season: { id: 'S1', name: 'Temporada 2026' }, window: ['2026-01-01', '2026-09-30'] } }),
      aw({ key: 'season_podium', level: 2, scope: 'liga', leagueId: LID, playerId: 'p2', periodKey: 's:S1', awardedAt: '2026-10-01T00:00:00Z', context: { ...league, season: { id: 'S1', name: 'Temporada 2026' } } }),
      aw({ key: 'season_rookie', scope: 'liga', leagueId: LID, playerId: 'p3', periodKey: 's:S1', awardedAt: '2026-10-01T00:00:00Z', context: { ...league, season: { id: 'S1', name: 'Temporada 2026' } } }),
    ];
    const s = seasonAwards(season, NOW)!;
    expect(s.title).toBe('Campeones de Temporada 2026');
    expect(s.groups.map((g) => [g.view.award.key, g.view.award.level, g.subtitle])).toEqual([
      ['season_podium', 3, 'Título'],
      ['season_podium', 2, 'Segundo lugar'],
      ['season_rookie', 0, null],
    ]);
    expect(seasonAwards(season, Date.parse('2026-10-20T00:00:00Z'))).toBeNull();
  });

  it('la página del evento: el podio, la categoría y el equipo de ese evento (no los de otro)', () => {
    const ev = { ...league, event: { id: 'E1', name: 'Copa' } };
    const rows = [
      aw({ key: 'event_podium', level: 2, scope: 'liga', leagueId: LID, playerId: 'p2', periodKey: 'e:E1', context: ev }),
      aw({ key: 'event_podium', level: 3, scope: 'liga', leagueId: LID, playerId: 'p1', periodKey: 'e:E1', context: ev }),
      aw({ key: 'bowling_team_win', scope: 'liga', leagueId: LID, playerId: 'p3', periodKey: 'e:E1', context: { ...ev, team: { id: 'T1', name: 'Los Tigres' } } }),
      aw({ key: 'bowling_category_win', scope: 'liga', leagueId: LID, playerId: 'p4', periodKey: 'e:E1', context: { ...ev, values: { categoria: 'B' } } }),
      // De otro evento, o un juego del evento (no es de periodo evento): no salen.
      aw({ key: 'event_podium', level: 3, scope: 'liga', leagueId: LID, playerId: 'p9', periodKey: 'e:E2', context: ev }),
      aw({ key: 'bowling_clean_game', scope: 'liga', leagueId: LID, playerId: 'p1', periodKey: 'g:x:0', context: ev }),
    ];
    expect(eventAwards(rows, 'E1').map((g) => [g.view.award.key, g.view.award.level, g.subtitle, g.winners.map((w) => w.playerId)])).toEqual([
      ['event_podium', 3, 'Primer lugar', ['p1']],
      ['event_podium', 2, 'Segundo lugar', ['p2']],
      ['bowling_category_win', 0, 'Categoría B', ['p4']],
      ['bowling_team_win', 0, 'Los Tigres', ['p3']],
    ]);
    expect(eventAwards(rows, 'E3')).toEqual([]);
  });
});

describe('por confirmar, avisos y aviso al ganar', () => {
  const review: BadgeReview = {
    id: 'R1',
    key: 'golf_hole_in_one',
    sport: 'golf',
    level: 0,
    periodKey: 'c:C1',
    leagueId: LID,
    leagueName: 'Liga Los Pinos',
    playerId: 'p1',
    playerName: 'Ana P.',
    refs: ['card:C1'],
    context: { ...league, event: { id: 'E1', name: 'Ronda 3' }, values: { hoyo: 7, campo: 'Teeth of the Dog' }, markers: ['u2', 'u3'] },
    awardedAt: '2026-10-02T12:00:00Z',
    overdue: false,
  };

  it('la hazaña con su evidencia y el link al evento', () => {
    const m = reviewModel(review)!;
    expect(m.name).toBe('Hoyo en uno');
    expect(m.eventLink).toBe(`/l/${LID}/e/E1`);
    expect(m.eventName).toBe('Ronda 3');
    expect(m.markers).toBe(2);
    expect(m.look.shape).toBe('star');
  });

  it('avisos: las de 14 días, las del historial juntas, las del creador y las por confirmar en Admin', () => {
    const profile: ProfileBadges = {
      userId: 'u1',
      isMe: true,
      featured: [],
      truncated: false,
      awards: [
        figure({ id: 'F1' }),
        aw({ id: 'H1', key: 'bowling_games', level: 1, history: true }),
        aw({ id: 'H2', key: 'bowling_club', level: 1, history: true }),
        aw({ id: 'OLD', key: 'debut', awardedAt: '2026-08-01T00:00:00Z' }),
        aw({ id: 'REV', key: 'bowling_perfect_game', status: 'en_revision' }),
      ],
      leagueAwards: [leagueAward({ id: 'LA1' })],
    };
    const list = badgeNotices(profile, [review], NOW);
    expect(list.map((x) => x.id)).toEqual(['insignia:F1', 'insignia-liga:LA1', 'insignias-historial:2', 'insignia-aval:R1']);
    expect(list[0]).toMatchObject({ title: '¡Te ganaste «Figura del mes»!', body: 'Única', url: myBadgesPath('F1'), lid: LID, sport: 'bowling', category: 'social', icon: 'badge' });
    expect(list[1]).toMatchObject({ title: 'Liga Los Pinos te dio «MVP de la noche»', category: 'social' });
    expect(list[2]).toMatchObject({ title: 'Te dimos 2 insignias por tu historial', url: '/perfil?tab=insignias' });
    expect(list[3]).toMatchObject({ title: 'Hay una hazaña por confirmar', body: 'Hoyo en uno de Ana P.', url: `/l/${LID}/admin?tab=confirmar`, category: 'admin' });
    // De otra cuenta, nada propio.
    expect(badgeNotices({ ...profile, isMe: false }, [], NOW)).toEqual([]);
    expect(NOTICE_DAYS).toBe(14);
  });

  it('aviso al ganar: hasta 5 una por una, «y N más», el historial aparte y todo se marca', () => {
    const fresh = Array.from({ length: 7 }, (_, i) => aw({ id: `N${i}`, key: 'debut', awardedAt: `2026-10-0${i + 1}T00:00:00Z` }));
    const plan = unlockPlan([...fresh, aw({ id: 'H', key: 'bowling_games', level: 1, history: true }), aw({ id: 'X', key: 'nueva_version' })], [leagueAward({ id: 'LA', awardedAt: '2026-10-09T00:00:00Z' })]);
    expect(plan.items).toHaveLength(UNLOCK_MAX);
    expect(plan.items[0]).toMatchObject({ kind: 'liga', id: 'LA' });
    expect(plan.items[1]).toMatchObject({ kind: 'app', id: 'N6' });
    expect(plan.more).toBe(3);
    expect(plan.history.map((h) => h.award.id)).toEqual(['H']);
    expect(plan.ids).toEqual([...fresh.map((a) => a.id), 'H', 'X']);
    expect(plan.leagueIds).toEqual(['LA']);
  });

  it('compartir: el nivel y el periodo, la rareza o quién la otorgó', () => {
    const v = viewAward(figure())!;
    expect(shareInputOf(v, 'Ana', { key: 'player_of_month', sport: 'bowling', level: 0, holders: 3, base: 100, pct: 3, rarity: 'epica' })).toMatchObject({
      name: 'Figura del mes',
      levelLine: 'Septiembre 2026',
      player: 'Ana',
      league: 'Liga Los Pinos',
      footnote: 'Solo el 3 % de los jugadores de boliche la tiene',
      caption: '¡Me gané «Figura del mes» (única) en MatchMate!',
    });
    expect(shareInputOf(v, 'Ana', undefined, true)).toMatchObject({ player: 'Liga Los Pinos premió a Ana', league: null, caption: 'Liga Los Pinos premió a Ana con «Figura del mes» en MatchMate' });
    const club = viewAward(aw({ key: 'bowling_club', level: 3 }))!;
    expect(shareInputOf(club, 'Ana').levelLine).toBe('Club 250 · Oro');
  });
});

function leagueAward(p: Partial<LeagueBadgeAward> = {}): LeagueBadgeAward {
  return {
    id: 'LA',
    badgeId: 'B1',
    leagueId: LID,
    leagueName: 'Liga Los Pinos',
    sport: 'padel',
    playerId: 'p1',
    teamName: null,
    period: 'OCT',
    division: '',
    awardedAt: '2026-10-04T12:00:00Z',
    hidden: false,
    note: 'Por tu garra',
    seenAt: null,
    badge: { id: 'B1', name: 'MVP de la noche', description: 'La figura del americano.', shape: 'star', palette: 'color', color: '#dc2626', icon: 'flame', topText: '', periodText: 'OCT 2026' },
    ...p,
  };
}

describe('las del creador (de la liga)', () => {
  it('se dibujan con su forma, color, ícono y cinta, con la pestaña LIGA', () => {
    const look = leagueLookOf(leagueAward().badge, 'padel');
    expect(look).toMatchObject({ shape: 'star', tier: { custom: '#dc2626' }, icon: 'flame', origin: 'liga', period: { long: 'OCT 2026' }, pips: 0 });
    expect(leagueLookOf({ ...leagueAward().badge, palette: 'oro', shape: 'rara' }, null)).toMatchObject({ tier: 'oro', shape: 'hex' });
    expect(leagueLookOf({ ...leagueAward().badge, palette: 'liga' }, 'padel').tier).toEqual({ custom: '#0f766e' });
  });

  it('«Otorgada por», por liga y ×N; las ocultas solo para el dueño', () => {
    const v = viewLeagueAward(leagueAward());
    expect(v.givenBy).toBe('Otorgada por Liga Los Pinos · 4 oct 2026');
    expect(v.detail).toBe('OCT');
    const list = [leagueAward({ id: 'A' }), leagueAward({ id: 'B', awardedAt: '2026-09-01T00:00:00Z' }), leagueAward({ id: 'C', badgeId: 'B2', hidden: true })];
    const mine = leagueShelves(list, { own: true, now: NOW });
    expect(mine).toHaveLength(1);
    expect(mine[0].tiles.map((t) => [t.count, t.state])).toEqual([
      [2, 'new'],
      [1, 'hidden'],
    ]);
    expect(leagueShelves(list, { own: false, now: NOW })[0].tiles).toHaveLength(1);
    expect(leagueShareInputOf(v, 'Ana')).toMatchObject({ footnote: 'Otorgada por Liga Los Pinos · 4 oct 2026', caption: 'Liga Los Pinos me dio «MVP de la noche» en MatchMate' });
  });
});

describe('resumen del año (year_recap, §6.4)', () => {
  const recapAward = aw({ key: 'year_recap', sport: 'all', level: 2, periodKey: '2026', awardedAt: '2027-01-07T05:00:00Z', context: { values: { n: 64, anio: 2026, deportes_n: 2, meses: 9 } } });

  it('días, deportes, meses y la más rara del año (medida si hay base; si no, la estimada)', () => {
    const mine = [
      recapAward,
      aw({ key: 'debut', awardedAt: '2026-02-01T12:00:00Z' }),
      aw({ key: 'bowling_games', level: 1, awardedAt: '2026-05-01T12:00:00Z' }),
      aw({ key: 'player_of_month', scope: 'liga', leagueId: LID, playerId: 'p1', periodKey: '2026-12', awardedAt: '2027-01-03T12:00:00Z', context: { ...league } }),
      // De otro año, oculta o retirada: no cuentan.
      aw({ key: 'bowling_perfect_game', periodKey: 'g:x:0', awardedAt: '2025-06-01T12:00:00Z' }),
      aw({ key: 'bowling_perfect_game', periodKey: 'g:y:0', awardedAt: '2026-06-01T12:00:00Z', hidden: true }),
      aw({ key: 'bowling_perfect_game', periodKey: 'g:z:0', awardedAt: '2026-07-01T12:00:00Z', status: 'revocada' }),
    ];
    const byTarget = yearRecap(recapAward, mine, [])!;
    expect(byTarget).toMatchObject({ year: '2026', days: 64, sports: 2, months: 9, rarestText: null });
    expect(['player_of_month', 'bowling_games', 'debut']).toContain(byTarget.rarest!.award.key);
    expect(byTarget.rarest!.award.key).not.toBe('debut');
    // Con la rareza medida manda la medida.
    const stats: BadgeStat[] = [
      { key: 'debut', sport: 'bowling', level: 0, holders: 2, base: 100, pct: 2, rarity: 'epica' },
      { key: 'player_of_month', sport: 'bowling', level: 0, holders: 30, base: 100, pct: 30, rarity: 'poco_comun' },
    ];
    const measured = yearRecap(recapAward, mine, stats)!;
    expect(measured.rarest!.award.key).toBe('debut');
    expect(measured.rarestText).toBe('La tiene el 2 % de los jugadores de boliche');
    expect(yearRecap(mine[1], mine, [])).toBeNull();
    expect(yearRecap(recapAward, [recapAward], [])!.rarest).toBeNull();
  });
});

describe('reportar y el aviso al ganar', () => {
  it('reporta una de liga solo quien es miembro de esa liga; una de cuenta, quien ve el perfil; la propia, nadie', () => {
    const mine = new Set(['L1']);
    expect(canReportAward({ leagueId: 'L1' }, false, mine)).toBe(true);
    expect(canReportAward({ leagueId: 'L2' }, false, mine)).toBe(false);
    expect(canReportAward({ leagueId: null }, false, mine)).toBe(true);
    expect(canReportAward({ leagueId: 'L1' }, true, mine)).toBe(false);
  });

  it('el aviso al ganar espera a que la cuenta conteste «¿Tienes 18 años?»', () => {
    expect(unlockGateOpen({ user: { uid: 'u' }, needsAdult: true })).toBe(false);
    expect(unlockGateOpen({ user: { uid: 'u' }, needsAdult: false })).toBe(true);
    expect(unlockGateOpen({ user: null, needsAdult: true })).toBe(true);
  });
});

describe('ver mis insignias desde el aviso', () => {
  it('abre la insignia quieta (la animación ya se vio en el aviso); desde un push, con animación', () => {
    expect(myBadgesPath('a b', { still: true })).toBe('/perfil?tab=insignias&insignia=a%20b&quieta=1');
    expect(myBadgesPath('a')).toBe('/perfil?tab=insignias&insignia=a');
    expect(myBadgesPath()).toBe('/perfil?tab=insignias');
  });
});
