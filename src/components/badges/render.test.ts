/**
 * Las pantallas de las insignias dibujadas sin navegador (renderToString): la grilla, la pestaña del perfil (propia y
 * de otro), el detalle, el aviso al ganar, los premios de la liga, «Por confirmar» y los ajustes.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { BadgeAward, BadgeReview, LeagueBadgeAward, ProfileBadges } from '../../lib/data/badges';
import { FeedbackProvider } from '../feedback';
import { NoticeIcon } from '../notifications/NoticeIcon';
import { BadgeSheet, BadgeSheetBody } from './BadgeSheet';
import { BadgesAutoChoice, badgesAutoOf } from './BadgesSettings';
import { BadgeTile } from './BadgeTile';
import { AttendanceFold, TitleShield, WinnersList } from './LeagueBadgePanels';
import { currentTitle, playerPageId } from './LeagueBadges';
import { emptyOwnText, featurableLeagueTiles, featuredModel, groupTiles, leagueShelves, lockedModels, monthAwards, progressByBadge, reviewModel, unlockPlan, viewAward, yearRecap } from './logic';
import { BadgesTabView, FeaturedChoices, FeaturedRow, pickerSave, pickerStart, tabModel } from './ProfileBadges';
import { ReviewRow } from './ReviewsPanel';
import { UnlockContent, YearRecapCard } from './UnlockModal';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<title>[^<]*<\/title>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
const noop = () => undefined;

const LID = 'L1';
const league = { league: { id: LID, name: 'Liga Los Pinos' } };
const NOW = Date.parse('2026-10-05T15:00:00Z');

let n = 0;
function aw(p: Partial<BadgeAward> & Pick<BadgeAward, 'key'>): BadgeAward {
  n++;
  return {
    id: `a${n}`,
    sport: 'bowling',
    level: 0,
    periodKey: '-',
    scope: 'cuenta',
    status: 'firme',
    awardedAt: '2026-09-20T12:00:00Z',
    firmAt: null,
    leagueId: null,
    leagueName: null,
    playerId: null,
    context: {},
    hidden: false,
    seenAt: '2026-09-20T13:00:00Z',
    history: false,
    ...p,
  };
}

const figure = aw({
  key: 'player_of_month',
  scope: 'liga',
  leagueId: LID,
  leagueName: 'Liga Los Pinos',
  playerId: 'p1',
  periodKey: '2026-09',
  awardedAt: '2026-10-03T12:00:00Z',
  context: { ...league, window: ['2026-09-01', '2026-09-30'], values: { valor: 'promedio 187 en 12 juegos' } },
});

const leagueAward: LeagueBadgeAward = {
  id: 'LA',
  badgeId: 'B1',
  leagueId: LID,
  leagueName: 'Liga Los Pinos',
  sport: 'bowling',
  playerId: 'p1',
  teamName: null,
  period: 'OCT',
  division: '',
  awardedAt: '2026-10-04T12:00:00Z',
  hidden: false,
  note: 'Por tu garra',
  seenAt: null,
  badge: { id: 'B1', name: 'MVP de la noche', description: 'La figura del americano.', shape: 'star', palette: 'oro', color: null, icon: 'flame', topText: '', periodText: '' },
  prizeSlotId: null,
  prize: null,
  onProfile: true,
};

/** Un premio del torneo: «Campeón» del 1.er lugar individual de la Copa de Octubre. */
const prizeAward: LeagueBadgeAward = {
  ...leagueAward,
  id: 'PZ',
  badgeId: 'B9',
  period: 'OCT 2026',
  division: 'Individual',
  teamName: null,
  awardedAt: '2026-10-02T12:00:00Z',
  note: '1.er lugar · Individual (handicap) · Copa de Octubre',
  badge: { id: 'B9', name: 'Campeón', description: 'Ganó el torneo.', shape: 'shield', palette: 'oro', color: null, icon: 'trophy', topText: 'CAMPEÓN', periodText: 'OCT 2026' },
  prizeSlotId: 'S1',
  prize: { slotId: 'S1', verified: true, place: 1, placeLabel: '1.er lugar', category: 'individual', title: 'Individual (handicap)', competition: 'Copa de Octubre' },
};

const profile = (isMe: boolean): ProfileBadges => ({
  userId: 'u1',
  isMe,
  featured: [figure.id],
  featuredLeague: [],
  hasChosen: true,
  truncated: false,
  awards: [
    figure,
    aw({ key: 'bowling_club', level: 1, awardedAt: '2026-06-01T12:00:00Z' }),
    aw({ key: 'bowling_club', level: 2, awardedAt: '2026-07-01T12:00:00Z' }),
    aw({ key: 'month_streak', sport: 'all', level: 1, context: { values: { n: 3 } } }),
    ...(isMe
      ? [
          aw({ key: 'bowling_breakthrough', level: 1, hidden: true }),
          aw({ key: 'bowling_perfect_game', status: 'en_revision', scope: 'liga', leagueId: LID }),
          aw({ key: 'bowling_series', status: 'revocada', level: 1 }),
        ]
      : []),
  ],
  leagueAwards: [leagueAward],
});

const progress = [{ key: 'bowling_games', sport: 'bowling', value: 27, target: 30, nextLevel: 1, playerId: null, leagueId: null }];

describe('grilla', () => {
  it('la insignia a 64 con su nombre, nivel y ×N; el botón dice todo', () => {
    const v = viewAward(aw({ key: 'bowling_split', scope: 'liga' }))!;
    const html = render(h(BadgeTile, { look: v.look, name: v.name, sub: 'Única', count: 3, label: `${v.label}, 3 veces`, onOpen: noop }));
    expect(html).toContain('width="64"');
    expect(html).toContain('×<!-- -->3');
    expect(text(html)).toContain('Split convertido');
    expect(html).toContain('aria-label="Split convertido, única, 3 veces"');
    expect(html).toContain('min-h-11');
  });

  it('una de la liga nueva: «Nueva» arriba y la marca LIGA abajo a la izquierda (no se tocan; ×N abajo a la derecha)', () => {
    const v = viewAward(aw({ key: 'bowling_split', scope: 'liga' }))!;
    const html = render(h(BadgeTile, { look: v.look, state: 'new', name: 'Campeón', label: 'Campeón, nueva', count: 2, league: true, onOpen: noop }));
    const tag = (word: string) => html.match(new RegExp('<span class="([^"]*)"[^>]*>' + word + '</span>'))?.[1] ?? '';
    expect(tag('Nueva')).toContain('-top-1');
    expect(tag('LIGA')).toContain('bottom-0');
    expect(tag('LIGA')).toContain('-left-1');
    expect(tag('LIGA')).not.toContain('top-');
  });

  it('una nueva dice «Nueva» en palabras (no solo el brillo); elegida en destacadas, aria-pressed', () => {
    const v = viewAward(aw({ key: 'bowling_split', scope: 'liga' }))!;
    const html = render(h(BadgeTile, { look: v.look, state: 'new', name: v.name, label: `${v.label}, nueva`, onOpen: noop }));
    expect(text(html)).toContain('Nueva');
    expect(html).toContain('aria-label="Split convertido, única, nueva"');
    expect(render(h(BadgeTile, { look: v.look, name: v.name, label: v.label, onOpen: noop }))).not.toContain('Nueva');
    expect(render(h(BadgeTile, { look: v.look, name: v.name, label: v.label, onOpen: noop, pressed: true }))).toContain('aria-pressed="true"');
  });
});

describe('pestaña Insignias del perfil', () => {
  const props = { sports: ['bowling'], name: 'Ana Pérez', filter: 'todas', onFilter: noop, showLocked: false, onToggleLocked: noop, onOpen: noop };

  it('la propia: contador, Próximas, secciones, ocultas y en revisión, de mis ligas, bloqueadas y retiradas', () => {
    const model = tabModel(profile(true), progress, ['bowling'], NOW);
    const t = text(render(h(BadgesTabView, { ...props, model })));
    // El total cuenta la de su liga.
    expect(t).toContain('5 insignias');
    expect(t).toContain('4 de MatchMate · 1 de tus ligas');
    expect(t).toContain('Próximas');
    expect(t).toContain('Te faltan 3 juegos');
    expect(t).toContain('MatchMate');
    expect(t).toContain('Resultados');
    expect(t).toContain('Marcas');
    expect(t).toContain('Constancia');
    expect(t).toContain('Solo tú la ves');
    expect(t).toContain('En revisión');
    expect(t).toContain('De mis ligas');
    expect(t).toContain('MVP de la noche');
    expect(t).toContain('Ver bloqueadas');
    expect(t).toContain('Se retiró «Serie de tres».');
    expect(t).toContain('Todas');
    expect(t).toContain('Cuenta');
    // Con las bloqueadas abiertas salen las que faltan (en silueta).
    const open = render(h(BadgesTabView, { ...props, model, showLocked: true }));
    expect(text(open)).toContain('Ocultar bloqueadas');
    expect(open).toContain('aria-label="Líneas jugadas, bloqueada"');
  });

  it('la de otra cuenta: sin Próximas, bloqueadas, ocultas ni retiradas', () => {
    const model = tabModel(profile(false), [], ['bowling'], NOW);
    const t = text(render(h(BadgesTabView, { ...props, model })));
    expect(t).toContain('5 insignias');
    expect(t).toContain('4 de MatchMate · 1 de sus ligas');
    expect(t).not.toContain('Próximas');
    expect(t).not.toContain('Ver bloqueadas');
    expect(t).not.toContain('Solo tú la ves');
    expect(t).toContain('De sus ligas');
  });

  it('vacía', () => {
    const empty: ProfileBadges = { userId: 'u', isMe: false, featured: [], featuredLeague: [], hasChosen: false, truncated: false, awards: [], leagueAwards: [] };
    const none = text(render(h(BadgesTabView, { ...props, model: tabModel(empty, [], [], NOW) })));
    expect(none).toContain('Todavía no tiene insignias.');
    expect(none).toContain('0 insignias');
    expect(none).not.toContain('de sus ligas');
    const mine = text(render(h(BadgesTabView, { ...props, sports: ['golf'], model: tabModel({ ...empty, isMe: true }, [], ['golf'], NOW) })));
    expect(mine).toContain('Juega tu primera ronda en una liga y te llega la primera.');
    expect(emptyOwnText(['swimming'])).toBe('Nada tu primera prueba en una liga y te llega la primera.');
    expect(emptyOwnText(['padel'])).toBe('Juega tu primer partido en una liga y te llega la primera.');
    expect(emptyOwnText(['bowling', 'golf'])).toBe('Juega tu primer juego en una liga y te llega la primera.');
  });

  it('un premio del torneo en «De sus ligas»: con la competencia, la marca LIGA y todo en el nombre accesible', () => {
    const data = { ...profile(false), leagueAwards: [prizeAward, leagueAward] };
    const html = render(h(BadgesTabView, { ...props, model: tabModel(data, [], ['bowling'], NOW) }));
    const t = text(html);
    expect(t).toContain('6 insignias');
    expect(t).toContain('Campeón');
    expect(t).toContain('Copa de Octubre');
    expect(html).toContain('1.er lugar · Individual (handicap) · Copa de Octubre, de Liga Los Pinos');
    expect(html.match(/>LIGA</g)).toHaveLength(2);
  });

  it('la tuya que los demás todavía no ven: «Solo en tu liga»', () => {
    const data = { ...profile(true), leagueAwards: [{ ...leagueAward, onProfile: false }] };
    const html = render(h(BadgesTabView, { ...props, model: tabModel(data, [], ['bowling'], NOW) }));
    expect(text(html)).toContain('Solo en tu liga');
    expect(html).toContain(', solo en tu liga"');
  });
});

describe('destacadas debajo del nombre', () => {
  it('las elegidas, en su orden (automáticas y de la liga, con la marca LIGA); tocar una la abre', () => {
    const data = { ...profile(false), featured: [prizeAward.id, figure.id], featuredLeague: [prizeAward.id], leagueAwards: [prizeAward, leagueAward] };
    const model = featuredModel(data);
    expect(model.items.map((i) => i.view.name)).toEqual(['Campeón', 'Figura del mes']);
    const html = render(h(FeaturedRow, { model, own: false, canPick: false, onPick: noop }));
    expect(html).toContain('width="40"');
    expect(html).toContain(`href="/?tab=insignias&amp;insignia=${prizeAward.id}"`);
    expect(html).toContain('title="Campeón · Copa de Octubre · Liga Los Pinos"');
    expect(html.match(/>LIGA</g)).toHaveLength(1);
    // Los demás no ven el lápiz.
    expect(html).not.toContain('Cambiar las destacadas');
  });

  it('sin elegir salen solas (el premio primero); el dueño puede elegirlas', () => {
    const data = { ...profile(true), featured: [], hasChosen: false, leagueAwards: [leagueAward, prizeAward] };
    const model = featuredModel(data);
    expect(model.auto).toBe(true);
    expect(model.items.map((i) => i.view.name).slice(0, 2)).toEqual(['Campeón', 'MVP de la noche']);
    expect(model.items).toHaveLength(3);
    const html = render(h(FeaturedRow, { model, own: true, canPick: true, onPick: noop }));
    expect(html).toContain('aria-label="Elegir tus destacadas"');
    // El dueño sabe que salieron solas; los demás no ven la nota, ni el dueño cuando las eligió.
    expect(text(html)).toContain('Salen solas · toca el lápiz para elegirlas');
    expect(text(render(h(FeaturedRow, { model, own: false, canPick: false, onPick: noop })))).not.toContain('Salen solas');
    expect(text(render(h(FeaturedRow, { model: featuredModel(profile(true)), own: true, canPick: true, onPick: noop })))).not.toContain('Salen solas');
    // Sin ninguna que se pueda mostrar: el dueño ve la invitación; los demás, nada.
    const empty = { items: [], auto: true };
    expect(text(render(h(FeaturedRow, { model: empty, own: true, canPick: true, onPick: noop })))).toContain('Elige hasta 3 para mostrar aquí');
    expect(renderToString(h(MemoryRouter, null, h(FeaturedRow, { model: empty, own: false, canPick: false, onPick: noop })))).toBe('');
    expect(featuredModel(null)).toEqual({ items: [], auto: true });
  });

  it('el elegidor: MatchMate y De mis ligas (con la marca LIGA), las elegidas con su número', () => {
    const data = { ...profile(true), featured: [prizeAward.id], featuredLeague: [prizeAward.id], leagueAwards: [prizeAward, { ...leagueAward, id: 'SMALL', badgeId: 'B3', onProfile: false }] };
    const tiles = groupTiles(data.awards, { own: true, now: NOW }).filter((t) => t.bucket === 'ok');
    const leagueTiles = featurableLeagueTiles(data, NOW);
    const html = render(h(FeaturedChoices, { tiles, leagueTiles, picked: data.featured, onToggle: noop }));
    const t = text(html);
    expect(t).toContain('MatchMate');
    expect(t).toContain('De mis ligas');
    expect(t).toContain('Copa de Octubre · Liga Los Pinos');
    // La de una liga que los demás todavía no ven no se ofrece.
    expect(leagueTiles).toHaveLength(1);
    expect(html).toContain(', destacada 1"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/>LIGA</g)).toHaveLength(1);
  });
});

describe('elegidor de destacadas: abre con lo que se ve y no guarda si nada cambió', () => {
  it('sin elegir abre con las que salen solas marcadas; elegidas, con las elegidas', () => {
    const auto = { ...profile(true), featured: [], hasChosen: false, leagueAwards: [leagueAward, prizeAward] };
    const shown = featuredModel(auto);
    expect(pickerStart(auto, shown)).toEqual(shown.items.map((i) => i.id));
    expect(pickerStart(auto, shown)[0]).toBe(prizeAward.id);
    const chosen = profile(true);
    expect(pickerStart(chosen, featuredModel(chosen))).toEqual([figure.id]);
    // Las que salen solas se ven marcadas en el elegidor (el premio, primero).
    const leagueTiles = featurableLeagueTiles(auto, NOW);
    const tiles = groupTiles(auto.awards, { own: true, now: NOW }).filter((t) => t.bucket === 'ok');
    const html = render(h(FeaturedChoices, { tiles, leagueTiles, picked: pickerStart(auto, shown), onToggle: noop }));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
    expect(html).toContain('Copa de Octubre, de Liga Los Pinos, destacada 1"');
  });

  it('guardar: sin cambios no llama a la base; quitar todas las que salen solas tampoco; cambiar sí', () => {
    expect(pickerSave(['a', 'b'], ['a', 'b'], true)).toEqual({ save: false });
    expect(pickerSave(['a', 'b'], ['a', 'b'], false)).toEqual({ save: false });
    expect(pickerSave(['a', 'b'], [], true)).toEqual({ save: false });
    expect(pickerSave(['a', 'b'], ['b', 'a'], true)).toEqual({ save: true, done: 'Destacadas guardadas' });
    expect(pickerSave(['a'], ['a', 'c'], false)).toEqual({ save: true, done: 'Destacadas guardadas' });
    // Quitar las elegidas: vuelven a salir solas (y se dice así, no «Ya no tienes destacadas»).
    expect(pickerSave(['a'], [], false)).toEqual({ save: true, done: 'Listo: ahora salen solas' });
  });
});

describe('detalle de una de la liga: destacar desde el pie (dueño)', () => {
  type LeagueTile = ReturnType<typeof leagueShelves>[number]['tiles'][number];
  const sheet = (tile: LeagueTile, featured: string[], featuredAuto = false, own = true) =>
    text(render(h(BadgeSheet, { subject: { kind: 'league', tile }, onClose: noop, own, featured, featuredAuto })));
  const tileOf = (a: LeagueBadgeAward) => leagueShelves([a], { own: true, now: NOW })[0].tiles[0];

  it('se ve en tu perfil: «Destacar en mi perfil»; ya destacada: «Quitar de destacadas»', () => {
    const t = sheet(tileOf(prizeAward), []);
    expect(t).toContain('Destacar en mi perfil');
    expect(t).toContain('Ocultar de mi perfil');
    expect(sheet(tileOf(prizeAward), [prizeAward.id])).toContain('Quitar de destacadas');
  });

  it('solo en tu liga: no se ofrece destacar (si ya estaba, se puede quitar); oculta, tampoco', () => {
    const small = tileOf({ ...leagueAward, onProfile: false });
    const t = sheet(small, []);
    expect(t).toContain('Por ahora solo se ve en tu liga');
    expect(t).not.toContain('Destacar en mi perfil');
    expect(t).not.toContain('Quitar de destacadas');
    expect(sheet(small, [leagueAward.id])).toContain('Quitar de destacadas');
    const hidden = sheet(tileOf({ ...leagueAward, hidden: true, onProfile: false }), []);
    expect(hidden).toContain('Mostrar en mi perfil');
    expect(hidden).not.toContain('Destacar en mi perfil');
  });

  it('las que salen solas: la que ya sale dice «Quitar de destacadas» (si es la única, sin botón: volvería a salir)', () => {
    expect(sheet(tileOf(prizeAward), [prizeAward.id, figure.id], true)).toContain('Quitar de destacadas');
    const only = sheet(tileOf(prizeAward), [prizeAward.id], true);
    expect(only).not.toContain('Quitar de destacadas');
    expect(only).not.toContain('Destacar en mi perfil');
    // Otra que no sale: se puede destacar (se suma a las que ya se ven).
    expect(sheet(tileOf(leagueAward), [prizeAward.id], true)).toContain('Destacar en mi perfil');
  });

  it('de otra cuenta: sin acciones del dueño', () => {
    const t = sheet(leagueShelves([prizeAward], { own: false, now: NOW })[0].tiles[0], [], false, false);
    expect(t).not.toContain('Destacar en mi perfil');
    expect(t).not.toContain('Ocultar de mi perfil');
    expect(t).toContain('Cerrar');
  });
});

describe('detalle', () => {
  it('una ganada: nombre, nivel, descripción, dónde y cuándo, evidencia, rareza y niveles (dueño)', () => {
    const tiles = groupTiles(profile(true).awards, { own: true, now: NOW });
    const club = tiles.find((t) => t.def.key === 'bowling_club')!;
    const html = render(
      h(BadgeSheetBody, {
        subject: { kind: 'award', tile: club },
        own: true,
        stats: [{ key: 'bowling_club', sport: 'bowling', level: 2, holders: 7, base: 100, pct: 7, rarity: 'rara' }],
        progress: progressByBadge([{ key: 'bowling_club', sport: 'bowling', value: 237, target: 250, nextLevel: 3, playerId: null, leagueId: null }]),
      }),
    );
    const t = text(html);
    expect(html).toContain('width="128"');
    expect(t).toContain('Club de los 200');
    expect(t).toContain('Club 225 · Plata');
    expect(t).toContain('Entraste al club de los 225.');
    expect(t).toContain('La tiene el 7 % de los jugadores de boliche');
    expect(t).toContain('Niveles');
    expect(t).toContain('Club 200');
    expect(t).toContain('Oro: te faltan 13 pinos');

    const fig = tiles.find((t) => t.def.key === 'player_of_month')!;
    const f = text(render(h(BadgeSheetBody, { subject: { kind: 'award', tile: fig } })));
    expect(f).toContain('Liga Los Pinos');
    expect(f).toContain('Promedio 187 en 12 juegos');
    expect(f).toContain('3 oct 2026');

    const review = tiles.find((t) => t.bucket === 'review')!;
    expect(text(render(h(BadgeSheetBody, { subject: { kind: 'award', tile: review }, own: true })))).toContain('Tu liga la está confirmando');
  });

  it('una bloqueada: cómo se gana y el progreso', () => {
    const locked = lockedModels(['bowling'], [], progress).find((l) => l.def.key === 'bowling_games')!;
    const t = text(render(h(BadgeSheetBody, { subject: { kind: 'locked', model: locked }, own: true })));
    expect(t).toContain('Todavía no la tienes');
    expect(t).toContain('Cómo se gana');
    expect(t).toContain('Juega 30 juegos que cuenten');
    expect(t).toContain('Te faltan 3 juegos');
  });

  it('una de la liga: otorgada por, y la nota solo al dueño', () => {
    const tile = leagueShelves([leagueAward], { own: true, now: NOW })[0].tiles[0];
    const own = text(render(h(BadgeSheetBody, { subject: { kind: 'league', tile }, own: true })));
    expect(own).toContain('MVP de la noche');
    expect(own).toContain('Otorgada por Liga Los Pinos · 4 oct 2026');
    expect(own).toContain('Por tu garra');
    expect(own).not.toContain('Premio del torneo');
    expect(own).not.toContain('Por ahora solo se ve en tu liga');
    expect(text(render(h(BadgeSheetBody, { subject: { kind: 'league', tile } })))).not.toContain('Por tu garra');
  });

  it('un premio del torneo: el lugar, la categoría y la competencia', () => {
    const tile = leagueShelves([prizeAward], { own: false, now: NOW })[0].tiles[0];
    const t = text(render(h(BadgeSheetBody, { subject: { kind: 'league', tile } })));
    expect(t).toContain('Campeón');
    expect(t).toContain('Premio del torneo');
    expect(t).toContain('1.er lugar · Individual (handicap) · Copa de Octubre');
    expect(t).toContain('Liga Los Pinos');
    // En el propio, la nota del premio (su misma línea) no se repite; sin la competencia, la nota dice el lugar.
    const mine = text(render(h(BadgeSheetBody, { subject: { kind: 'league', tile: leagueShelves([prizeAward], { own: true, now: NOW })[0].tiles[0] }, own: true })));
    expect(mine.split('1.er lugar · Individual (handicap) · Copa de Octubre')).toHaveLength(2);
    expect(mine).not.toContain('Nota de tu liga');
    const gone = { ...prizeAward, prize: { ...prizeAward.prize!, place: null, placeLabel: null, category: null, title: null, competition: null } };
    const orphan = text(render(h(BadgeSheetBody, { subject: { kind: 'league', tile: leagueShelves([gone], { own: true, now: NOW })[0].tiles[0] }, own: true })));
    expect(orphan).toContain('Nota de tu liga');
    expect(orphan).toContain('1.er lugar · Individual (handicap) · Copa de Octubre');
    // La tuya que los demás todavía no ven en tu perfil.
    const small = leagueShelves([{ ...leagueAward, onProfile: false }], { own: true, now: NOW })[0].tiles[0];
    expect(text(render(h(BadgeSheetBody, { subject: { kind: 'league', tile: small }, own: true })))).toContain('Por ahora solo se ve en tu liga');
  });
});

describe('aviso al ganar', () => {
  it('una: animación, nombre, nivel, liga y descripción', () => {
    const plan = unlockPlan([figure]);
    const html = render(h(UnlockContent, { plan, index: 0, onIndex: noop }));
    const t = text(html);
    expect(t).toContain('¡Te ganaste una insignia!');
    expect(t).toContain('Figura del mes');
    expect(t).toContain('Liga Los Pinos');
    expect(html).toContain('bd-anim');
    expect(t).not.toContain('Anterior');
  });

  it('varias: flechas y «y N más»; las privadas preguntan', () => {
    const many = Array.from({ length: 6 }, (_, i) => aw({ key: 'debut', awardedAt: `2026-10-0${i + 1}T12:00:00Z` }));
    const plan = unlockPlan([...many, aw({ key: 'bowling_breakthrough', level: 1, hidden: true, awardedAt: '2026-10-09T12:00:00Z' })]);
    const html = render(h(UnlockContent, { plan, index: 0, onIndex: noop }));
    expect(html).toContain('aria-label="Siguiente"');
    expect(text(html)).toContain('y 2 más');
    expect(text(html)).toContain('Solo tú la ves. ¿La muestras en tu perfil?');
    expect(text(html)).toContain('Dejarla privada');
    const answered = render(h(UnlockContent, { plan, index: 0, onIndex: noop, shown: new Set([plan.items[0].id]) }));
    expect(text(answered)).not.toContain('Dejarla privada');
  });

  it('del historial: un solo aviso con la lista', () => {
    const plan = unlockPlan([aw({ key: 'bowling_games', level: 1, history: true }), aw({ key: 'debut', history: true })]);
    expect(text(render(h(UnlockContent, { plan, index: 0, onIndex: noop })))).toContain('Te dimos 2 insignias por tu historial');
  });

  it('del creador: «Liga Los Pinos te dio una insignia» con su nota', () => {
    const plan = unlockPlan([], [leagueAward]);
    const t = text(render(h(UnlockContent, { plan, index: 0, onIndex: noop })));
    expect(t).toContain('Liga Los Pinos te dio una insignia');
    expect(t).toContain('MVP de la noche');
    expect(t).toContain('«Por tu garra»');
  });
});

describe('liga, por confirmar y ajustes', () => {
  it('premios del mes: ganadores con su evidencia y la asistencia plegada', () => {
    const month = monthAwards(
      [figure, aw({ key: 'perfect_attendance_month', scope: 'liga', leagueId: LID, playerId: 'p2', periodKey: '2026-09', context: league })],
      '2026-10-05',
    )!;
    const names = new Map([
      ['p1', 'Ana P.'],
      ['p2', 'Luis G.'],
    ]);
    const html = render(h('div', null, h(WinnersList, { groups: month.groups, names, base: `/l/${LID}`, onOpen: noop }), h(AttendanceFold, { list: month.attendance, names, base: `/l/${LID}` })));
    const t = text(html);
    expect(t).toContain('Figura del mes');
    expect(t).toContain('Ana P.');
    expect(t).toContain('Promedio 187 en 12 juegos');
    expect(html).toContain(`href="/l/${LID}/j/p1"`);
    expect(t).toContain('Asistencia perfecta: 1 jugador');
    expect(t).not.toContain('Luis G.');
  });

  it('por confirmar: la hazaña, su evidencia y los dos botones', () => {
    const r: BadgeReview = {
      id: 'R',
      key: 'bowling_perfect_game',
      sport: 'bowling',
      level: 0,
      periodKey: 'g:x:0',
      leagueId: LID,
      leagueName: 'Liga Los Pinos',
      playerId: 'p1',
      playerName: 'Ana P.',
      refs: ['entry:x:0'],
      context: { ...league, event: { id: 'E1', name: 'Jornada 3' }, values: { n: 300 } },
      awardedAt: '2026-10-02T12:00:00Z',
      overdue: true,
    };
    const html = render(h(ReviewRow, { model: reviewModel(r)!, onConfirm: noop, onReject: noop }));
    const t = text(html);
    expect(t).toContain('Juego perfecto');
    expect(t).toContain('de Ana P.');
    expect(t).toContain('Ver Jornada 3');
    expect(t).toContain('Más de 14 días');
    expect(t).toContain('No se pudo confirmar');
    expect(t).toContain('Confirmar');
    expect(html).toContain(`href="/l/${LID}/e/E1"`);
  });

  it('insignias automáticas: las tres opciones; sin dueño, de solo lectura', () => {
    const owner = render(h(BadgesAutoChoice, { value: 'sin_titulos', onChange: noop }));
    expect(text(owner)).toContain('Recomendado para ligas con menores');
    expect(owner.match(/type="radio"/g)).toHaveLength(3);
    expect(owner.match(/checked=""/g)).toHaveLength(1);
    expect(owner).not.toContain('disabled=""');
    expect(render(h(BadgesAutoChoice, { value: 'todas' }))).toContain('disabled=""');
    expect(badgesAutoOf({ hasMinors: true })).toBe('sin_titulos');
    expect(badgesAutoOf({ badgesAuto: 'ninguna', hasMinors: true })).toBe('ninguna');
    expect(badgesAutoOf({})).toBe('todas');
  });

  it('en Avisos: el ícono de insignia', () => {
    expect(render(h(NoticeIcon, { kind: 'social', icon: 'badge' }))).toContain('lucide-award');
  });

  it('la página del jugador dentro de la liga', () => {
    expect(playerPageId('/l/L1/j/p1', '/l/L1')).toBe('p1');
    expect(playerPageId('/l/L1/j/p%201/x', '/l/L1')).toBe('p 1');
    expect(playerPageId('/l/L1/e/p1', '/l/L1')).toBeNull();
    expect(playerPageId('/l/L1/j/%E0%A4%A', '/l/L1')).toBeNull();
  });
});

describe('título vigente (§6.2)', () => {
  const title = (playerId: string, periodKey: string, awardedAt: string, context = {}) =>
    aw({ key: 'season_podium', level: 3, scope: 'liga', leagueId: LID, playerId, periodKey, awardedAt, context: { ...league, season: { id: periodKey.slice(2), name: 'Temporada' }, ...context } });

  it('el oro de la última temporada cerrada (compartido si hubo empate); no los torneos sueltos', () => {
    const rows = [
      title('p1', 's:S1', '2025-10-01T00:00:00Z'),
      title('p2', 's:S2', '2026-10-01T00:00:00Z'),
      title('p3', 's:S2', '2026-10-01T00:00:00Z'),
      title('p9', 's:T1', '2026-11-01T00:00:00Z', { alt: 'torneo' }),
      aw({ key: 'season_podium', level: 2, scope: 'liga', leagueId: LID, playerId: 'p4', periodKey: 's:S3', awardedAt: '2026-12-01T00:00:00Z' }),
    ];
    const t = currentTitle(rows)!;
    expect([...t.players].sort()).toEqual(['p2', 'p3']);
    expect(t.award.periodKey).toBe('s:S2');
    expect(currentTitle([])).toBeNull();
  });

  it('el escudo de 24 px con su nombre accesible', () => {
    const html = render(h(TitleShield, { award: title('p1', 's:S1', '2026-10-01T00:00:00Z') }));
    expect(html).toContain('width="24"');
    expect(html).toContain('Título vigente');
  });
});

describe('resumen del año', () => {
  it('los tres números y la más rara, dentro del aviso al ganar de year_recap', () => {
    const recapAward = aw({ key: 'year_recap', sport: 'all', level: 2, periodKey: '2026', awardedAt: '2027-01-07T05:00:00Z', context: { values: { n: 64, anio: 2026, deportes_n: 2, meses: 9 } } });
    const recap = yearRecap(recapAward, [recapAward, aw({ key: 'bowling_games', level: 1, awardedAt: '2026-05-01T12:00:00Z' })], [])!;
    const card = text(render(h(YearRecapCard, { recap })));
    for (const t of ['64', 'días jugados', '2', 'deportes', '9', 'meses activos', 'Tu insignia más rara de 2026']) expect(card, t).toContain(t);
    const plan = unlockPlan([recapAward], []);
    const out = text(render(h(UnlockContent, { plan, index: 0, onIndex: noop, recap })));
    expect(out).toContain('Tu 2026');
    expect(out).toContain('meses activos');
  });
});
