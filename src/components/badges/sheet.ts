/**
 * El detalle de una insignia sin pantalla (docs/insignias.md §6.3): qué se abre, qué dice y qué acciones lleva. Salió de
 * BadgeSheet.tsx para que la app del teléfono (movil/src/components/badges) haga lo mismo. Funciones puras, con
 * pruebas en sheet.test.ts.
 */
import type { BadgeAward, BadgeStat } from '../../lib/data/badges';
import { asBackendError } from '../../lib/db/errors';
import { saveErrorMessage } from '../../lib/errorText';
import {
  FEATURED_MAX,
  groupTiles,
  levelLine,
  nextLevelLine,
  rarityText,
  statFor,
  type AwardView,
  type BadgeTileModel,
  type LeagueAwardView,
  type LeagueTileModel,
  type LockedModel,
  type ProgressModel,
} from './logic';

/**
 * Qué se abre en el detalle: una insignia ganada (con todas sus filas), una bloqueada (solo el dueño) o una que dio la
 * liga (el creador).
 */
export type SheetSubject =
  | { kind: 'award'; tile: BadgeTileModel }
  | { kind: 'locked'; model: LockedModel | ProgressModel }
  | { kind: 'league'; tile: LeagueTileModel };

/** Cuántas veces se listan en una repetible (las demás: «y 3 más»). */
export const MAX_TIMES = 20;

/** Texto chico de estado debajo del nombre en la grilla. */
export function tileSub(tile: Pick<BadgeTileModel, 'bucket' | 'top'>): string {
  if (tile.bucket === 'review') return 'En revisión';
  if (tile.bucket === 'hidden') return 'Solo tú la ves';
  return levelLine(tile.top);
}

/** De 0 a 100, para la barra de progreso. */
export const progressPct = (ratio: number): number => Math.round(Math.max(0, Math.min(1, ratio)) * 100);

/** El progreso de una bloqueada (las de «Próximas» son el progreso mismo). */
export const lockedProgress = (m: LockedModel | ProgressModel): ProgressModel | null => ('progress' in m ? m.progress : m);

/** Lo que dice el detalle de una ganada: rareza, niveles (el dueño), el que sigue y las veces (repetibles). */
export interface AwardDetail {
  rarity: string | null;
  /** Los niveles que tiene, del más bajo al más alto (solo con niveles; las repetibles no). */
  levels: AwardView[];
  /** «Oro: te faltan 12» (solo el dueño). */
  next: string | null;
  /** Las veces de una repetible, más nuevas primero. */
  times: AwardView[];
}

export function awardDetail(tile: BadgeTileModel, opts: { own?: boolean; stats?: readonly BadgeStat[]; progress?: ReadonlyMap<string, ProgressModel> }): AwardDetail {
  const top = tile.top;
  const stat = statFor(opts.stats ?? [], top.award);
  const leveled = !tile.def.repeatable && tile.def.levels.length > 1;
  return {
    rarity: rarityText(stat, top.award.sport),
    levels: leveled ? [...tile.views].sort((a, b) => a.award.level - b.award.level) : [],
    next: opts.own && leveled && opts.progress ? nextLevelLine(tile.def, tile.sport, opts.progress) : null,
    times: tile.def.repeatable ? tile.views : [],
  };
}

/** Una vez de una repetible: el evento y el nivel si no es el metal («Primer lugar»), o el nombre. */
export const timeText = (v: AwardView): string => [v.event?.name, v.levelName !== v.metal ? v.levelName : null].filter(Boolean).join(' · ') || v.name;

/** Una vez de una de la liga: la competencia del premio, el periodo y la división, o el nombre. */
export const leagueTimeText = (x: LeagueAwardView): string => x.prize?.competition ?? x.detail ?? x.name;

/** «y 3 más» debajo de las veces. */
export const moreTimesText = (n: number): string | null => (n > MAX_TIMES ? `y ${n - MAX_TIMES} más` : null);

/** Lo que se puede hacer en el detalle (§6.3), según quién mira. */
export interface SheetActions {
  /** Todas las filas de la insignia (sus niveles o veces). */
  ids: string[];
  /** Se ve debajo de tu nombre (elegida o de las que salen solas). */
  isFeatured: boolean;
  /** Se ofrece destacar o quitar (si salen solas y es la única que sale, quitarla no cambia nada). */
  canToggleFeatured: boolean;
  /** Una de la liga: se destaca si los demás la ven en tu perfil (o ya está, para quitarla). */
  canFeatureLeague: boolean;
  canShare: boolean;
}

export function sheetActions(
  subject: SheetSubject | null,
  opts: { own?: boolean; featured?: readonly string[]; featuredAuto?: boolean; mayShare?: boolean; announce?: boolean },
): SheetActions {
  const featured = opts.featured ?? [];
  const tile = subject?.kind === 'award' ? subject.tile : null;
  const leagueTile = subject?.kind === 'league' ? subject.tile : null;
  const ids = (tile?.views ?? leagueTile?.views ?? []).map((v) => v.award.id);
  const isFeatured = ids.some((id) => featured.includes(id));
  const canToggleFeatured = !(isFeatured && opts.featuredAuto && featured.length <= 1);
  const canFeatureLeague = !!leagueTile && !leagueTile.hidden && (leagueTile.onProfile || isFeatured) && canToggleFeatured;
  const canShare =
    (!!tile && tile.bucket === 'ok' && !!(opts.own || opts.mayShare || opts.announce)) || (!!leagueTile && !leagueTile.hidden && !!(opts.own || opts.mayShare));
  return { ids, isFeatured, canToggleFeatured, canFeatureLeague, canShare };
}

/**
 * Destacar o quitar desde el detalle: la lista nueva de destacadas, o `full` si ya hay 3 (se avisa con FEATURED_FULL).
 * `top`: la fila que se destaca (el nivel más alto).
 */
export function toggleFeatured(featured: readonly string[], a: Pick<SheetActions, 'ids' | 'isFeatured'>, top: string): { full: true } | { full: false; next: string[] } {
  if (a.isFeatured) return { full: false, next: featured.filter((id) => !a.ids.includes(id)) };
  if (featured.length >= FEATURED_MAX) return { full: true };
  return { full: false, next: [...featured, top] };
}

/** El detalle de una sola fila de la liga (en los premios del mes y en el evento: tocar a un ganador). */
export function awardSubject(awards: readonly BadgeAward[], awardId: string | null, now: number): SheetSubject | null {
  const a = awardId ? awards.find((x) => x.id === awardId) : undefined;
  const tile = a ? groupTiles([a], { own: false, now })[0] : undefined;
  return tile ? { kind: 'award', tile } : null;
}

/** El aviso al destacar o quitar. */
export const featuredDone = (wasFeatured: boolean): string => (wasFeatured ? 'Quitada de destacadas' : 'Destacada en tu perfil');

/** El aviso al ocultar o mostrar. */
export const hiddenDone = (hidden: boolean): string => (hidden ? 'Oculta: solo tú la ves' : 'Ya se ve en tu perfil');

/** La pregunta antes de reportar una insignia de otra cuenta. */
export const reportQuestion = (name: string) => ({
  title: `¿Reportar «${name}»?`,
  message: 'Le llega al equipo de MatchMate para que la revise. Úsalo si crees que se dio por un resultado que no fue.',
  confirmText: 'Reportar',
});

/**
 * El error al reportar en palabras: lo mismo que dice `makerErrorText(e, { action: 'reportar' })` (maker/design.ts) con
 * lo que lanza `report_badge` («Ya mandaste 5 reportes hoy…», el permiso de la liga, datos malos); lo demás, el de
 * siempre. Está aquí porque maker/design.ts trae la pantalla de la web (feedback.tsx) y la app no la puede importar.
 */
export function reportErrorText(e: unknown): string {
  const be = asBackendError(e);
  const msg = be?.message.trim() ?? '';
  const code = !be ? null : be.code === '42501' ? (msg === 'no_permitido' ? msg : null) : be.code === 'P0001' ? (/^[a-z_]+/.exec(msg)?.[0] ?? null) : null;
  switch (code) {
    case 'rate_limited':
      return 'Ya mandaste 5 reportes hoy. Mañana puedes mandar más.';
    case 'no_permitido':
      return 'No tienes permiso para esto en la liga.';
    case 'invalido':
      return 'Revisa los datos: algo no está bien.';
    default:
      return saveErrorMessage(e);
  }
}
