/**
 * La pestaña «Insignias» del perfil y las destacadas sin pantalla (docs/insignias.md §6.1): lo que salió de
 * ProfileBadges.tsx para que la app del teléfono (movil/src/components/badges) muestre lo mismo con React Native.
 * Funciones puras, con pruebas en tab.test.ts.
 */
import type { ProfileBadges } from '../../lib/data/badges';
import type { SheetSubject } from './sheet';
import {
  FEATURED_MAX,
  countSplitText,
  countText,
  emptyOwnText,
  filterChips,
  groupTiles,
  leagueCount,
  leagueShelves,
  lockedModels,
  officialCount,
  progressByBadge,
  retiredLines,
  upcoming,
  type BadgeTileModel,
  type FilterChip,
  type LeagueShelf,
  type LeagueTileModel,
  type LockedModel,
  type ProgressModel,
} from './logic';

/** El chip «Todas» de la vitrina. */
export const ALL = 'todas';

/** Lo que ve la pestaña, ya calculado (sirve para probarla sin base). */
export interface BadgesTabModel {
  own: boolean;
  /** El total: las oficiales y las de sus ligas. */
  count: number;
  /** «20 de MatchMate · 4 de sus ligas» (null sin las de sus ligas). */
  split: string | null;
  tiles: BadgeTileModel[];
  upcoming: ProgressModel[];
  locked: LockedModel[];
  retired: { id: string; text: string }[];
  progress: ReadonlyMap<string, ProgressModel>;
  /** «De mis ligas»: las que dio el creador de cada liga. */
  leagues: LeagueShelf[];
}

export function tabModel(data: ProfileBadges, progress: Parameters<typeof upcoming>[0], sports: readonly string[], now: number, opened?: ReadonlySet<string>): BadgesTabModel {
  const own = data.isMe;
  const official = officialCount(data.awards);
  const league = leagueCount(data.leagueAwards ?? []);
  return {
    own,
    count: official + league,
    split: countSplitText(official, league, own),
    tiles: groupTiles(data.awards, { own, now, opened }),
    upcoming: own ? upcoming(progress) : [],
    locked: own ? lockedModels(sports, data.awards, progress) : [],
    retired: own ? retiredLines(data.awards) : [],
    progress: own ? progressByBadge(progress) : new Map(),
    leagues: leagueShelves(data.leagueAwards ?? [], { own, now, opened }),
  };
}

/** Lo que muestra la pestaña con un filtro: los chips, el filtro que vale y lo que queda en cada sección. */
export interface TabView {
  chips: FilterChip[];
  /** El chip elegido (si el filtro ya no existe, «Todas»). */
  active: string;
  /** `null` = todas; un deporte o 'all' (las de cuenta). */
  filter: string | null;
  /** El primer nombre («Ana» de «Ana Pérez»), para los textos de otra cuenta. */
  first: string;
  /** Las oficiales que pasan el filtro. */
  shown: BadgeTileModel[];
  /** Las de sus ligas que pasan el filtro (sin las ligas que quedan vacías). */
  leagues: LeagueShelf[];
  /** Las bloqueadas que pasan el filtro. */
  locked: LockedModel[];
}

export function tabView(model: BadgesTabModel, opts: { sports: readonly string[]; name: string; filter: string; showLocked: boolean }): TabView {
  const chips = filterChips(opts.sports, [...model.tiles, ...(opts.showLocked ? model.locked : [])]);
  const active = chips.some((c) => c.key === opts.filter) ? opts.filter : ALL;
  const f = active === ALL ? null : active;
  return {
    chips,
    active,
    filter: f,
    first: opts.name.split(/\s+/)[0] || opts.name,
    shown: model.tiles.filter((t) => f === null || t.sport === f),
    leagues: model.leagues.map((l) => ({ ...l, tiles: l.tiles.filter((t) => f === null || t.top.award.sport === f) })).filter((l) => l.tiles.length > 0),
    locked: model.locked.filter((l) => f === null || l.sport === f),
  };
}

// ---------- Nombres accesibles y textos de la pestaña ----------

/** El nombre accesible de una oficial en la grilla: «Constancia, oro, 3 veces, nueva, en revisión». */
export const awardTileLabel = (t: Pick<BadgeTileModel, 'top' | 'count' | 'state' | 'bucket'>): string =>
  `${t.top.label}${t.count > 1 ? `, ${t.count} veces` : ''}${t.state === 'new' ? ', nueva' : ''}${t.bucket === 'review' ? ', en revisión' : t.bucket === 'hidden' ? ', solo tú la ves' : ''}`;

/** El de una de sus ligas: con el premio y la liga, y «solo tú la ves» o «solo en tu liga» (la propia). */
export const leagueTileLabel = (t: Pick<LeagueTileModel, 'top' | 'count' | 'state' | 'hidden' | 'onProfile'>, own: boolean): string =>
  `${t.top.fullLabel}${t.count > 1 ? `, ${t.count} veces` : ''}${t.state === 'new' ? ', nueva' : ''}${t.hidden ? ', solo tú la ves' : own && !t.onProfile ? ', solo en tu liga' : ''}`;

/** El de una en «Próximas»: «Líneas jugadas, bloqueada. Te faltan 3 juegos». */
export const upcomingLabel = (p: Pick<ProgressModel, 'name' | 'text'>): string => `${p.name}, bloqueada. ${p.text}`;

/** El de una bloqueada. */
export const lockedLabel = (name: string): string => `${name}, bloqueada`;

/** «De mis ligas» (la propia) o «De sus ligas». */
export const leaguesTitle = (own: boolean): string => (own ? 'De mis ligas' : 'De sus ligas');

/** Sin insignias de MatchMate pero con las de sus ligas. */
export const noOfficialText = (own: boolean): string => (own ? 'Todavía no tienes insignias de MatchMate.' : 'Todavía no tiene insignias de MatchMate.');

/** Sin ninguna: el título y el texto (la propia dice cómo se empieza). */
export function emptyTab(own: boolean, first: string, sports: readonly string[]): { title: string; text: string } {
  return own
    ? { title: 'Todavía no tienes insignias', text: emptyOwnText(sports) }
    : { title: 'Todavía no tiene insignias.', text: `Cuando ${first} gane una en sus ligas, sale aquí.` };
}

// ---------- El detalle abierto ----------

/** La insignia de la pestaña que tiene la fila `awardId` (oficial o de sus ligas), para abrirla desde un link. */
export function linkedSubject(model: BadgesTabModel, awardId: string): SheetSubject | null {
  const tile = model.tiles.find((t) => t.views.some((v) => v.award.id === awardId));
  if (tile) return { kind: 'award', tile };
  const league = model.leagues.flatMap((l) => l.tiles).find((t) => t.views.some((v) => v.award.id === awardId));
  return league ? { kind: 'league', tile: league } : null;
}

/** Si el detalle abierto cambió (se ocultó, se destacó), lo de ahora; si ya no está, el de antes. */
export function currentSubject(model: BadgesTabModel, subject: SheetSubject | null): SheetSubject | null {
  if (subject?.kind === 'award') {
    const t = model.tiles.find((x) => x.views.some((v) => subject.tile.views.some((w) => w.award.id === v.award.id)));
    return t ? { kind: 'award', tile: t } : subject;
  }
  if (subject?.kind === 'league') {
    const t = model.leagues.flatMap((l) => l.tiles).find((x) => x.views.some((v) => subject.tile.views.some((w) => w.award.id === v.award.id)));
    return t ? { kind: 'league', tile: t } : subject;
  }
  return subject;
}

// ---------- Yo: las 3 de la tarjeta «Insignias» y la línea de Pro ----------

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «6 oct»: cuándo la ganó (debajo del nombre en la tarjeta de Yo). */
export function wonOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** «Te faltan 6 pinos» → «te faltan 6 pinos» (en la mitad de una frase). */
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Una de las 3 insignias de la tarjeta de Yo: ganada (con su fecha), en camino (con su barrita) o por ganar. */
export interface PreviewBadge {
  id: string;
  look: BadgeTileModel['top']['look'];
  state: 'unlocked' | 'new' | 'progress' | 'locked';
  /** 0 a 1 (solo las que van en camino). */
  progress: number | null;
  name: string;
  sub: string;
  /** A dónde lleva: la vitrina con esa insignia abierta (`?tab=insignias&insignia=…`) o la vitrina. */
  to: string;
  label: string;
}

/**
 * Las 3 de la tarjeta «Insignias» de Yo: las ganadas más nuevas (dejando lugar a la que está más cerca de ganarse, «te
 * faltan 6») y, si no alcanza, las que van en camino y las que faltan por ganar.
 */
export function previewBadges(model: BadgesTabModel, max = 3): PreviewBadge[] {
  const won: PreviewBadge[] = model.tiles
    .filter((t) => t.bucket === 'ok')
    .map((t) => ({
      id: t.id,
      look: t.top.look,
      state: t.state === 'new' ? 'new' : 'unlocked',
      progress: null,
      name: t.top.name,
      sub: wonOn(t.top.award.awardedAt),
      to: `?tab=insignias&insignia=${encodeURIComponent(t.top.award.id)}`,
      label: `${t.top.label}${t.state === 'new' ? ', nueva' : ''}`,
    }));
  const going: PreviewBadge[] = model.upcoming.map((p) => ({
    id: p.id,
    look: p.look,
    state: 'progress',
    progress: p.ratio,
    name: p.name,
    sub: lowerFirst(p.text),
    to: '?tab=insignias',
    label: upcomingLabel(p),
  }));
  const locked: PreviewBadge[] = model.locked
    .filter((l) => !l.progress)
    .map((l) => ({ id: l.id, look: l.look, state: 'locked', progress: null, name: l.name, sub: 'Por ganar', to: '?tab=insignias', label: lockedLabel(l.name) }));
  const room = max - Math.min(going.length, 1);
  return [...won.slice(0, room), ...going, ...won.slice(room), ...locked].slice(0, max);
}

/** La línea de «Insignias» en Pro: «2 de 18 · Serie de 600: te faltan 6». */
export function badgesLine(model: BadgesTabModel): string {
  const total = model.count + model.locked.length;
  const next = model.upcoming[0];
  return [model.own && total > model.count ? `${model.count} de ${total}` : countText(model.count), next && `${next.name}: ${lowerFirst(next.text)}`]
    .filter(Boolean)
    .join(' · ');
}

// ---------- Destacadas ----------

/** El aviso al tocar una cuarta. */
export const FEATURED_FULL = 'Ya tienes 3 destacadas. Quita una para poner esta.';

/** ¿El dueño tiene alguna que se pueda destacar? (automática que se ve, o de la liga que los demás ven). */
export const canFeature = (data: ProfileBadges): boolean =>
  data.awards.some((a) => (a.status === 'provisional' || a.status === 'firme') && !a.hidden) || (data.leagueAwards ?? []).some((a) => !a.hidden && a.onProfile);

/** El lápiz: «Elegir tus destacadas» mientras salen solas, «Cambiar las destacadas» si ya las elegiste. */
export const featuredEditLabel = (auto: boolean): string => (auto ? 'Elegir tus destacadas' : 'Cambiar las destacadas');

/** Las que el elegidor abre marcadas: las que se ven debajo del nombre (también las que salen solas). */
export const pickerStart = (data: ProfileBadges, shown: { auto: boolean; items: readonly { id: string }[] }): string[] =>
  shown.auto ? shown.items.map((i) => i.id) : [...data.featured];

/**
 * Qué hace «Guardar» en el elegidor: nada si no cambió lo que se ve (así abrir y guardar no deja fijas las que salen
 * solas, ni borra las elegidas); si no, guardar `picked` con su aviso ([] = vuelven a salir solas).
 */
export function pickerSave(start: readonly string[], picked: readonly string[], auto: boolean): { save: false } | { save: true; done: string } {
  const same = start.length === picked.length && start.every((id, i) => id === picked[i]);
  if (same || (auto && picked.length === 0)) return { save: false };
  return { save: true, done: picked.length ? 'Destacadas guardadas' : 'Listo: ahora salen solas' };
}

/** En qué lugar está elegida (0 a 2), o -1. */
export const pickerSlot = (picked: readonly string[], t: Pick<BadgeTileModel | LeagueTileModel, 'views'>): number =>
  picked.findIndex((id) => t.views.some((v) => v.award.id === id));

/**
 * Tocar una en el elegidor: la quita si estaba (todas sus filas) o la pone al final; `full` si ya hay 3 (se avisa y no
 * cambia nada).
 */
export function pickerToggle(picked: readonly string[], t: Pick<BadgeTileModel | LeagueTileModel, 'views' | 'top'>): { full: true } | { full: false; next: string[] } {
  const ids = t.views.map((v) => v.award.id);
  const has = picked.some((id) => ids.includes(id));
  if (!has && picked.length >= FEATURED_MAX) return { full: true };
  return { full: false, next: has ? picked.filter((id) => !ids.includes(id)) : [...picked, t.top.award.id] };
}

/** «Elige hasta 3 para mostrar debajo de tu nombre (1 de 3).» */
export const pickerIntro = (n: number): string => `Elige hasta 3 para mostrar debajo de tu nombre (${n} de 3).`;
