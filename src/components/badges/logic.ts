/**
 * Lo que no es pantalla de las insignias (docs/insignias.md §6): une el catálogo (src/badges/catalog.ts), lo visual
 * (src/badges/visual) y las filas de la base (src/lib/data/badges.ts) en lo que muestran el perfil, el detalle, el
 * aviso de desbloqueo, la liga, Avisos y «Por confirmar». Funciones puras, con pruebas en logic.test.ts.
 *
 * Es pesado (trae el catálogo): las piezas que van en todas las pantallas lo cargan aparte (kit.ts).
 */
import {
  BADGES,
  LEVEL_LABEL,
  PLACEHOLDERS,
  PROFILE_SECTIONS,
  SECTION_OF,
  badgeDef,
  badgeSports,
  descriptionOf,
  fillText,
  howOf,
  levelNameOf,
  nameOf,
  rarityOf,
  thresholdOf,
  unitOf,
  type Placeholder,
  type ProfileSection,
} from '../../badges/catalog';
import { addMonths, todayIn } from '../../badges/rules/periods';
import type { BadgeDef, Level } from '../../badges/types';
import {
  badgeLabel,
  humanPeriod,
  makeLook,
  periodFromKey,
  periodRibbon,
  tierOfLevel,
  type BadgeLook,
  type BadgeState,
  type PeriodRibbon,
} from '../../badges/visual';
import type { BadgeAward, BadgeProgress, BadgeRarity, BadgeReview, BadgeStat, LeagueBadgeAward, LeagueBadgeDesign, ProfileBadges } from '../../lib/data/badges';
import type { BadgeShareInput } from '../share/badge';
import { designLook } from './maker/look';
import { joinList } from '../../lib/format';
import type { GenericNotice } from '../../lib/notifications';
import { SPORT_LIST, isSportId, sportMeta } from '../../sports/registry';
import type { SportId } from '../../sports/types';

// ---------- Fechas y periodos ----------

export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

const DAY = 86400_000;
/** Zona de las fechas que se muestran (la de la mayoría de las ligas). */
export const SHOW_TZ = 'America/Santo_Domingo';

const isMonthKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);

/** 'octubre' de '2026-10' ('' si no es un mes). */
export const monthName = (key: string): string => (isMonthKey(key) ? MONTH_NAMES[Number(key.slice(5, 7)) - 1] : '');

/** 'octubre de 2026' de '2026-10'. */
export const monthText = (key: string): string => (isMonthKey(key) ? `${monthName(key)} de ${key.slice(0, 4)}` : '');

const formats = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, tz: string): Intl.DateTimeFormat {
  const k = `${tz}|${JSON.stringify(opts)}`;
  let f = formats.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('es-DO', { ...opts, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat('es-DO', { ...opts, timeZone: SHOW_TZ });
    }
    formats.set(k, f);
  }
  return f;
}

/** «3 mar 2026» de una hora ISO ('' si no es una fecha). */
export function shortDate(iso: string | null | undefined, tz: string = SHOW_TZ): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }, tz)
    .format(new Date(t))
    .replace(/\./g, '')
    .replace(/\bde\b\s*/g, '');
}

const within = (iso: string, now: number, days: number) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t <= days * DAY && t - now <= DAY;
};

// ---------- Evidencia (context) ----------

type Ctx = Record<string, unknown>;
const isObj = (v: unknown): v is Ctx => typeof v === 'object' && v !== null && !Array.isArray(v);
const named = (ctx: Ctx, k: 'league' | 'event' | 'season' | 'team'): { id: string; name: string } | null => {
  const v = ctx[k];
  if (!isObj(v)) return null;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const id = typeof v.id === 'string' ? v.id : '';
  return name || id ? { id, name } : null;
};
const valuesOf = (ctx: Ctx): Ctx => (isObj(ctx.values) ? ctx.values : {});
const windowOf = (ctx: Ctx): [string, string] | null => {
  const w = ctx.window;
  return Array.isArray(w) && typeof w[0] === 'string' && typeof w[1] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(w[0]) ? [w[0], w[1]] : null;
};
const scalar = (v: unknown): string | number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() ? v.trim() : undefined);
const round1 = (n: number) => Math.round(n * 10) / 10;
const numText = (n: number) => round1(n).toLocaleString('es-DO');

/** Lo mínimo de una fila para armar textos y dibujo (sirve para `BadgeAward` y `BadgeReview`). */
export interface AwardLike {
  key: string;
  sport: string;
  level: number;
  periodKey: string;
  context: Ctx;
  awardedAt?: string;
  leagueName?: string | null;
}

/** Deporte de la fila como lo pide el catálogo ('all' para las de cuenta). */
const rowSport = (sport: string): SportId | 'all' => (isSportId(sport) ? sport : 'all');
const lvl = (n: number): Level => Math.max(0, Math.min(5, Math.trunc(n))) as Level;

/** Nombres de deportes de «bowling,padel» → «boliche y pádel». */
function sportsList(v: unknown): { text: string; n: number } | null {
  const list = (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : []).map((s) => String(s).trim()).filter(Boolean);
  if (!list.length) return null;
  return { text: joinList(list.map((s) => sportMeta(s)?.lower ?? s)), n: list.length };
}

/** El mes de una insignia de mes o de cajas: la clave, la ventana o (si no) el mes antes de darse. */
export function awardMonth(a: Pick<AwardLike, 'periodKey' | 'context' | 'awardedAt'>): string {
  if (isMonthKey(a.periodKey)) return a.periodKey;
  const w = windowOf(a.context);
  if (w) return w[0].slice(0, 7);
  return a.awardedAt ? addMonths(todayIn(a.awardedAt, SHOW_TZ).slice(0, 7), -1) : '';
}

/** Los valores de las llaves `{n}`, `{liga}`, `{mes}`… de los textos del catálogo para una fila. */
export function textVars(def: BadgeDef, a: AwardLike): Partial<Record<Placeholder, string | number>> {
  const sport = rowSport(a.sport);
  const level = lvl(a.level);
  const v = valuesOf(a.context);
  const meta = sportMeta(sport);
  const vars: Partial<Record<Placeholder, string | number>> = {};
  for (const k of PLACEHOLDERS) {
    const x = scalar(v[k]);
    if (x !== undefined) vars[k] = typeof x === 'number' ? numText(x) : x;
  }
  if (vars.n === undefined) {
    const t = thresholdOf(def, level, sport);
    if (t !== undefined) vars.n = numText(t);
  }
  vars.nivel = levelNameOf(def, level, { sport });
  if (meta) {
    vars.deporte = meta.lower;
    vars.unidad = meta.units.match[0];
  }
  const sports = sportsList(v.deportes);
  if (sports) {
    vars.deportes = sports.text;
    vars.deportes_n ??= sports.n;
  }
  const league = named(a.context, 'league')?.name || a.leagueName?.trim();
  if (league) vars.liga = league;
  const event = named(a.context, 'event')?.name;
  if (event) vars.evento = event;
  const season = named(a.context, 'season')?.name;
  if (season) vars.temporada = season;
  const team = named(a.context, 'team')?.name;
  if (team) vars.equipo = team;
  if (def.period === 'mes' || def.period === 'cajas') {
    const m = awardMonth(a);
    if (m && typeof v.mes !== 'string') vars.mes = monthText(m);
  } else if (typeof v.mes === 'string' && isMonthKey(v.mes)) vars.mes = monthText(v.mes);
  if (/^\d{4}$/.test(a.periodKey)) vars.anio = a.periodKey;
  else if (vars.anio === undefined) vars.anio = todayIn(a.awardedAt ?? Date.now(), SHOW_TZ).slice(0, 4);
  return vars;
}

/** Lo que se dice si la evidencia no trae el dato. */
const FALLBACK: Partial<Record<Placeholder, string>> = {
  liga: 'tu liga',
  evento: 'el evento',
  mes: 'el mes',
  anio: 'este año',
  temporada: 'la temporada',
  equipo: 'tu equipo',
  deporte: 'tu deporte',
  deportes: 'varios deportes',
  unidad: 'juego',
  categoria: 'tu categoría',
  campo: 'el campo',
  club: 'tu club',
  prueba: 'la prueba',
};

/** Rellena un texto del catálogo y lo deja limpio (sin llaves ni signos sueltos). */
export function fillBadgeText(template: string, vars: Partial<Record<Placeholder, string | number>>): string {
  const filled = fillText(fillText(template, vars), FALLBACK);
  return filled
    .replace(/\{[a-z_]+\}/g, '')
    .replace(/\s*:\s*([.!])/g, '$1')
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const capital = (s: string) => (s ? s[0].toLocaleUpperCase('es') + s.slice(1) : s);

// ---------- Cinta y dibujo ----------

/** La cinta de periodo de una fila (§4.5): mes, año, temporada, torneo o racha; null si no lleva. */
export function ribbonOf(def: BadgeDef, a: AwardLike): (PeriodRibbon & { top?: string }) | null {
  const w = windowOf(a.context);
  const monthRibbon = (m: string) => (isMonthKey(m) ? periodFromKey(m) : null);
  switch (def.period) {
    case 'mes':
    case 'cajas':
      return monthRibbon(awardMonth(a));
    case 'anio':
      return periodFromKey(a.periodKey) ?? (a.awardedAt ? periodRibbon({ kind: 'year', year: Number(todayIn(a.awardedAt, SHOW_TZ).slice(0, 4)) - 1 }) : null);
    case 'temporada':
      if (w) return periodRibbon({ kind: 'season', startsOn: w[0], endsOn: w[1] });
      return a.awardedAt ? periodRibbon({ kind: 'year', year: Number(todayIn(a.awardedAt, SHOW_TZ).slice(0, 4)) }) : null;
    case 'evento': {
      const date = w?.[0] ?? (a.awardedAt ? todayIn(a.awardedAt, SHOW_TZ) : '');
      if (a.periodKey.startsWith('gt:') && date) return periodRibbon({ kind: 'tournament', date });
      return def.shape === 'shield' && date ? monthRibbon(date.slice(0, 7)) : null;
    }
    case 'siempre': {
      if (def.shape !== 'circle') return null;
      const t = thresholdOf(def, lvl(a.level), rowSport(a.sport));
      return t ? periodRibbon({ kind: 'streak', count: t }) : null;
    }
    default:
      return null;
  }
}

/** Cómo se ve una fila: forma de la categoría, metal del nivel, campo y emblema del deporte, cinta y puntos. */
export function lookOf(def: BadgeDef, a: AwardLike): BadgeLook {
  const sport = rowSport(a.sport);
  const level = lvl(a.level);
  const ribbon = ribbonOf(def, a);
  const threshold = thresholdOf(def, level, sport);
  return makeLook({
    shape: def.shape,
    tier: tierOfLevel(level),
    sport,
    icon: def.icon,
    period: ribbon ? { long: ribbon.long, short: ribbon.short } : null,
    top: ribbon?.top,
    // En los podios el nivel es el puesto (va en el nombre), sin puntos.
    pips: def.compare === 'place' ? 0 : undefined,
    notches: def.shape === 'circle' && def.period === 'siempre' ? threshold : undefined,
  });
}

// ---------- Una insignia lista para mostrar ----------

export interface AwardView {
  award: BadgeAward;
  def: BadgeDef;
  name: string;
  /** Nombre del nivel: «Oro», «Primer lugar», «Club 225», «Única». */
  levelName: string;
  /** El metal («Oro»); «Única» en las de un solo nivel. */
  metal: string;
  description: string;
  /** «Promedio 187 en 12 juegos · base 178» (null si la evidencia no dice nada más). */
  evidence: string | null;
  look: BadgeLook;
  /** Nombre accesible: «Constancia, oro, octubre 2026». */
  label: string;
  leagueName: string | null;
  leagueId: string | null;
  event: { id: string; name: string } | null;
  /** «3 mar 2026». */
  date: string;
}

/** Línea de evidencia de una fila (§6.3). */
export function evidenceOf(def: BadgeDef, a: AwardLike): string | null {
  const v = valuesOf(a.context);
  const parts: string[] = [];
  const valor = typeof v.valor === 'string' ? v.valor.trim() : '';
  if (valor) parts.push(capital(valor));
  else if (typeof v.n === 'number' && def.unit && def.compare !== 'place') parts.push(`${numText(v.n)} ${unitOf(def, v.n, { sport: rowSport(a.sport) })}`);
  if (typeof v.base === 'number') parts.push(`base ${numText(v.base)}`);
  const team = named(a.context, 'team')?.name;
  if (team && !parts.some((p) => p.includes(team))) parts.push(team);
  if (a.context.by_roster === true) parts.push('según plantilla');
  return parts.length ? parts.join(' · ') : null;
}

/** Una fila de la base con todo lo que muestran las pantallas; null si esta versión no conoce la insignia. */
export function viewAward(award: BadgeAward): AwardView | null {
  const def = badgeDef(award.key);
  if (!def) return null;
  const a: AwardLike = award;
  const sport = rowSport(award.sport);
  const level = lvl(award.level);
  const vars = textVars(def, a);
  const alt = typeof award.context.alt === 'string' ? award.context.alt : null;
  const name = fillBadgeText(nameOf(def, { sport, alt }), vars);
  const look = lookOf(def, a);
  const league = named(award.context, 'league');
  return {
    award,
    def,
    name,
    levelName: fillBadgeText(levelNameOf(def, level, { sport }), vars),
    metal: LEVEL_LABEL[level],
    description: fillBadgeText(descriptionOf(def, { sport, level, alt }), vars),
    evidence: evidenceOf(def, a),
    look,
    label: badgeLabel(name, look),
    leagueName: award.leagueName ?? league?.name ?? null,
    leagueId: award.leagueId ?? (league?.id || null),
    event: named(award.context, 'event'),
    date: shortDate(award.awardedAt),
  };
}

/** «Oro», «Primer lugar · Oro» (sin repetir), «Única». */
export const levelLine = (v: Pick<AwardView, 'levelName' | 'metal'>) => (v.levelName && v.levelName !== v.metal ? `${v.levelName} · ${v.metal}` : v.metal);

// ---------- La vitrina: agrupar, secciones y filtros ----------

/** Cómo sale una insignia en la grilla: `ok`, oculta por el dueño o en revisión. */
export type TileBucket = 'ok' | 'hidden' | 'review';

export interface BadgeTileModel {
  /** `key|deporte|bucket`. */
  id: string;
  def: BadgeDef;
  sport: string;
  bucket: TileBucket;
  /** La que se dibuja: el nivel más alto (y la más nueva). */
  top: AwardView;
  /** Todas las filas de la insignia, más nuevas primero (niveles o veces). */
  views: AwardView[];
  /** ×N de las repetibles (1 en las demás). */
  count: number;
  state: BadgeState;
}

/** Días que una insignia sale como «Nueva» (o hasta abrirla). */
export const NEW_DAYS = 7;

const bucketOf = (a: BadgeAward): TileBucket | null =>
  a.status === 'revocada' ? null : a.status === 'en_revision' ? 'review' : a.hidden ? 'hidden' : 'ok';

/**
 * Junta las filas en insignias de la grilla: una por key, deporte y estado (normal, oculta, en revisión), con el
 * nivel más alto al frente y ×N en las repetibles. `own`: la vitrina propia («Nueva» por 7 días o hasta abrirla:
 * `opened` son los ids ya abiertos en este teléfono).
 */
export function groupTiles(awards: readonly BadgeAward[], opts: { own: boolean; now: number; opened?: ReadonlySet<string> }): BadgeTileModel[] {
  const groups = new Map<string, { def: BadgeDef; sport: string; bucket: TileBucket; views: AwardView[] }>();
  for (const a of awards) {
    const bucket = bucketOf(a);
    if (!bucket || (!opts.own && bucket !== 'ok')) continue;
    const view = viewAward(a);
    if (!view) continue;
    const id = `${a.key}|${a.sport}|${bucket}`;
    const g = groups.get(id);
    if (g) g.views.push(view);
    else groups.set(id, { def: view.def, sport: a.sport, bucket, views: [view] });
  }
  const out: BadgeTileModel[] = [];
  for (const [id, g] of groups) {
    const views = [...g.views].sort((x, y) => Date.parse(y.award.awardedAt) - Date.parse(x.award.awardedAt));
    const top = [...views].sort((x, y) => y.award.level - x.award.level || Date.parse(y.award.awardedAt) - Date.parse(x.award.awardedAt))[0];
    const fresh = opts.own && g.bucket === 'ok' && views.some((v) => within(v.award.awardedAt, opts.now, NEW_DAYS) && !opts.opened?.has(v.award.id));
    const state: BadgeState = g.bucket === 'review' ? 'review' : g.bucket === 'hidden' ? 'hidden' : fresh ? 'new' : 'unlocked';
    out.push({ id, def: g.def, sport: g.sport, bucket: g.bucket, top, views, count: g.def.repeatable ? views.length : 1, state });
  }
  return out.sort((x, y) => Date.parse(y.top.award.awardedAt) - Date.parse(x.top.award.awardedAt) || x.id.localeCompare(y.id));
}

/** Filtro de la vitrina: `null` = todas, un deporte, o 'all' (las de cuenta, «Cuenta»). */
export type ShelfFilter = string | null;

export interface ShelfSection {
  section: ProfileSection;
  tiles: BadgeTileModel[];
}

export interface ShelfGroup {
  /** Deporte o 'all'. */
  sport: string;
  /** «Boliche», «Cuenta». */
  label: string;
  sections: ShelfSection[];
}

const sportOrder = (s: string) => (s === 'all' ? -1 : (sportMeta(s)?.order ?? 999));
export const sportName = (s: string) => (s === 'all' ? 'Cuenta' : (sportMeta(s)?.short ?? 'Otro deporte'));

/** Por deporte (las de cuenta primero) y dentro por sección del perfil (Resultados, Marcas, Hitos…). */
export function shelfOf<T extends { def: BadgeDef; sport: string }>(tiles: readonly T[], filter: ShelfFilter): { sport: string; label: string; sections: { section: ProfileSection; tiles: T[] }[] }[] {
  const bySport = new Map<string, T[]>();
  for (const t of tiles) {
    if (filter !== null && t.sport !== filter) continue;
    const list = bySport.get(t.sport) ?? [];
    list.push(t);
    bySport.set(t.sport, list);
  }
  return [...bySport.entries()]
    .sort(([a], [b]) => sportOrder(a) - sportOrder(b))
    .map(([sport, list]) => ({
      sport,
      label: sportName(sport),
      sections: PROFILE_SECTIONS.map((section) => ({ section, tiles: list.filter((t) => SECTION_OF[t.def.category] === section) })).filter((s) => s.tiles.length),
    }));
}

export interface FilterChip {
  key: string;
  label: string;
}

/** «Todas», un chip por deporte que juega (o del que tiene insignias) y «Cuenta» si tiene de cuenta. */
export function filterChips(sports: readonly string[], tiles: readonly { sport: string }[]): FilterChip[] {
  const have = new Set(tiles.map((t) => t.sport));
  const list = SPORT_LIST.map((s) => s.id as string).filter((s) => sports.includes(s) || have.has(s));
  return [{ key: 'todas', label: 'Todas' }, ...list.map((s) => ({ key: s, label: sportName(s) })), ...(have.has('all') ? [{ key: 'all', label: 'Cuenta' }] : [])];
}

/** Cuántas insignias oficiales, desbloqueadas y visibles tiene (el contador del perfil). */
export const officialCount = (awards: readonly BadgeAward[]) =>
  awards.filter((a) => (a.status === 'provisional' || a.status === 'firme') && !a.hidden && !!badgeDef(a.key)).length;

export const countText = (n: number) => (n === 1 ? '1 insignia' : `${n.toLocaleString('es-DO')} insignias`);

/** «Se retiró {nombre}» o «No se pudo confirmar {nombre}…»: las retiradas que el dueño ya había visto. */
export function retiredLines(awards: readonly BadgeAward[]): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const a of awards) {
    if (a.status !== 'revocada') continue;
    const v = viewAward(a);
    if (!v) continue;
    const review = isObj(a.context.review) ? a.context.review : null;
    out.push({
      id: a.id,
      text: review && review.ok === false ? `No se pudo confirmar «${v.name}». Si fue un error, habla con tu liga.` : `Se retiró «${v.name}».`,
    });
  }
  return out;
}

// ---------- Progreso, próximas y bloqueadas ----------

export interface ProgressModel {
  id: string;
  def: BadgeDef;
  sport: string;
  level: Level;
  value: number;
  target: number;
  /** 0 a 1. */
  ratio: number;
  /** «Te faltan 3 juegos» o «Vas 7 de 10». */
  text: string;
  look: BadgeLook;
  name: string;
  /** Cómo se gana, en palabras simples. */
  how: string;
}

function remainingText(def: BadgeDef, sport: string, value: number, target: number): string {
  const s = rowSport(sport);
  const left = def.compare === 'lt' ? Math.max(1, Math.floor(value - target) + 1) : Math.max(1, Math.ceil(round1(target - value)));
  const unit = unitOf(def, left, { sport: s });
  if (unit) return `Te ${left === 1 ? 'falta' : 'faltan'} ${numText(left)} ${unit}`;
  return def.compare === 'lt' ? `Tu mejor: ${numText(value)} · meta: menos de ${numText(target)}` : `Vas ${numText(value)} de ${numText(target)}`;
}

/** Progreso de una fila de `badge_progress` hacia su siguiente nivel; null si esta versión no la conoce. */
export function progressModel(p: BadgeProgress): ProgressModel | null {
  const def = badgeDef(p.key);
  if (!def || !(p.target > 0)) return null;
  const level = lvl(p.nextLevel);
  const ratio = def.compare === 'lt' ? (p.value > 0 ? Math.min(1, p.target / p.value) : 0) : Math.min(1, Math.max(0, p.value / p.target));
  const a: AwardLike = { key: p.key, sport: p.sport, level, periodKey: '-', context: {} };
  const vars = textVars(def, a);
  const look = lookOf(def, a);
  return {
    id: `${p.key}|${p.sport}`,
    def,
    sport: p.sport,
    level,
    value: p.value,
    target: p.target,
    ratio,
    text: remainingText(def, p.sport, p.value, p.target),
    look,
    name: fillBadgeText(nameOf(def, { sport: rowSport(p.sport) }), vars),
    how: fillBadgeText(howOf(def, { sport: rowSport(p.sport) }), { ...vars, n: numText(p.target) }),
  };
}

/** Lo mejor de cada insignia (un jugador en varias ligas puede tener varias filas): la más cerca. */
export function progressByBadge(progress: readonly BadgeProgress[]): Map<string, ProgressModel> {
  const out = new Map<string, ProgressModel>();
  for (const p of progress) {
    const m = progressModel(p);
    if (!m || m.ratio >= 1) continue;
    const old = out.get(m.id);
    if (!old || m.ratio > old.ratio) out.set(m.id, m);
  }
  return out;
}

/** «Próximas» (§6.1): las 3 más cerca de su siguiente nivel. */
export function upcoming(progress: readonly BadgeProgress[], limit = 3): ProgressModel[] {
  return [...progressByBadge(progress).values()].sort((a, b) => b.ratio - a.ratio || a.id.localeCompare(b.id)).slice(0, limit);
}

export interface LockedModel {
  id: string;
  def: BadgeDef;
  sport: string;
  level: Level;
  look: BadgeLook;
  name: string;
  how: string;
  progress: ProgressModel | null;
}

/**
 * «Ver bloqueadas» (solo el dueño): las del catálogo de los deportes que juega (y las de cuenta) que todavía no
 * tiene en ningún nivel, con su progreso si lo hay. Las cerradas (Raíces BowlingX) no salen.
 */
export function lockedModels(sports: readonly string[], awards: readonly BadgeAward[], progress: readonly BadgeProgress[]): LockedModel[] {
  const have = new Set(awards.filter((a) => a.status !== 'revocada').map((a) => `${a.key}|${a.sport}`));
  const prog = progressByBadge(progress);
  const out: LockedModel[] = [];
  for (const def of BADGES) {
    if (def.closed) continue;
    for (const sport of badgeSports(def)) {
      if (sport !== 'all' && !sports.includes(sport)) continue;
      const id = `${def.key}|${sport}`;
      if (have.has(id)) continue;
      const p = prog.get(id) ?? null;
      const level = p?.level ?? [...def.levels].sort((a, b) => (def.compare === 'place' ? b.level - a.level : a.level - b.level))[0].level;
      const a: AwardLike = { key: def.key, sport, level, periodKey: '-', context: {} };
      const vars = textVars(def, a);
      out.push({
        id,
        def,
        sport,
        level,
        look: lookOf(def, a),
        name: fillBadgeText(nameOf(def, { sport }), vars),
        how: fillBadgeText(howOf(def, { sport }), vars),
        progress: p,
      });
    }
  }
  return out;
}

/** Siguiente nivel de una insignia que ya tiene (para el detalle: «Oro: te faltan 12»). */
export function nextLevelLine(def: BadgeDef, sport: string, progress: ReadonlyMap<string, ProgressModel>): string | null {
  const p = progress.get(`${def.key}|${sport}`);
  if (!p) return null;
  return `${LEVEL_LABEL[p.level]}: ${p.text.replace(/^Te /, 'te ')}`;
}

// ---------- Rareza ----------

export const RARITY_LABEL: Readonly<Record<BadgeRarity, string>> = {
  nueva: 'Nueva',
  comun: 'Común',
  poco_comun: 'Poco común',
  rara: 'Rara',
  epica: 'Épica',
  legendaria: 'Legendaria',
};

/** Menos de estas cuentas activas en la base: «Nueva» en vez de un porcentaje (§3.8). */
export const RARITY_MIN_BASE = 50;

export const statFor = (stats: readonly BadgeStat[], a: Pick<BadgeAward, 'key' | 'sport' | 'level'>) =>
  stats.find((s) => s.key === a.key && s.sport === a.sport && s.level === a.level);

const pctText = (pct: number) => (pct < 1 ? 'menos del 1 %' : `el ${Math.round(pct)} %`);
const playersOf = (sport: string) => (isSportId(sport) ? `los jugadores de ${sportMeta(sport)?.lower ?? sport}` : 'los jugadores de MatchMate');

/** «La tiene el 7 % de los jugadores de boliche», o «Nueva». null sin datos. */
export function rarityText(stat: BadgeStat | undefined, sport: string): string | null {
  if (!stat) return null;
  if (stat.rarity === 'nueva' || stat.base < RARITY_MIN_BASE) return 'Nueva';
  return `La tiene ${pctText(stat.pct)} de ${playersOf(sport)}`;
}

/** Para la tarjeta de compartir: «Solo el 4 % de los jugadores de boliche la tiene» (solo si es rara o más). */
export function rarityShareText(stat: BadgeStat | undefined, sport: string): string | null {
  if (!stat || stat.rarity === 'nueva' || stat.base < RARITY_MIN_BASE || stat.pct > 15) return null;
  return `Solo ${pctText(stat.pct)} de ${playersOf(sport)} la tiene`;
}

// ---------- Resumen del año (year_recap, §6.4) ----------

export interface YearRecapModel {
  year: string;
  days: number | null;
  sports: number | null;
  months: number | null;
  /** La insignia más rara que ganó ese año (por la rareza medida; sin datos, por la estimada del catálogo). */
  rarest: AwardView | null;
  /** «La tiene el 3 % de los jugadores de boliche» (null sin rareza medida). */
  rarestText: string | null;
}

/** Porcentaje aproximado de cada rareza estimada (para ordenar cuando todavía no hay rareza medida). */
const TARGET_PCT: Readonly<Record<string, number>> = { C: 60, PC: 25, R: 10, E: 3, L: 0.5 };

/**
 * El resumen del año que abre `year_recap` el 7 de enero: días jugados, deportes y meses activos (lo que guardó el
 * motor en `context.values`) y la insignia más rara de ese año entre las propias. null si no es un `year_recap`.
 */
export function yearRecap(award: BadgeAward, all: readonly BadgeAward[], stats: readonly BadgeStat[]): YearRecapModel | null {
  if (award.key !== 'year_recap') return null;
  const v = valuesOf(award.context);
  const year = String(scalar(v.anio) ?? award.periodKey).slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  let best: { view: AwardView; score: number; stat: BadgeStat | undefined } | null = null;
  for (const a of all) {
    if (a.id === award.id || a.key === 'year_recap' || a.hidden || (a.status !== 'provisional' && a.status !== 'firme')) continue;
    const inYear = a.periodKey.startsWith(year) || todayIn(a.awardedAt, SHOW_TZ).startsWith(year);
    if (!inYear) continue;
    const view = viewAward(a);
    if (!view) continue;
    const stat = statFor(stats, a);
    const measured = stat && stat.rarity !== 'nueva' && stat.base >= RARITY_MIN_BASE ? stat.pct : null;
    const target = rarityOf(view.def, lvl(a.level), isSportId(a.sport) ? a.sport : undefined);
    const score = measured ?? (target ? (TARGET_PCT[target] ?? 100) : 100);
    if (!best || score < best.score || (score === best.score && a.level > best.view.award.level)) best = { view, score, stat: measured !== null ? stat : undefined };
  }
  return {
    year,
    days: num(v.n),
    sports: num(v.deportes_n),
    months: num(v.meses),
    rarest: best?.view ?? null,
    rarestText: best?.stat ? rarityText(best.stat, best.view.award.sport) : null,
  };
}

// ---------- Liga: premios del mes y campeones ----------

/** Insignias de «Premios de {mes}», en su orden (§6.2). */
export const MONTH_AWARD_KEYS = ['player_of_month', 'most_improved_month', 'streak_month', 'team_of_month', 'top_scorer_month', 'clean_sheet_month', 'box_top_month', 'ladder_top'] as const;
/** Insignias de «Campeones» al cerrar la temporada. */
export const SEASON_AWARD_KEYS = ['season_podium', 'category_title', 'season_most_improved', 'season_rookie', 'season_top_scorer', 'season_best_keeper', 'fair_play', 'fair_play_team'] as const;

export interface WinnerGroup {
  id: string;
  view: AwardView;
  /** «Caja 2», «Los Tigres», «Primer lugar». */
  subtitle: string | null;
  winners: { playerId: string | null; awardId: string; evidence: string | null }[];
}

function winnerGroups(awards: readonly BadgeAward[], keys: readonly string[]): WinnerGroup[] {
  const groups = new Map<string, WinnerGroup>();
  for (const a of awards) {
    if (!keys.includes(a.key)) continue;
    const view = viewAward(a);
    if (!view) continue;
    const v = valuesOf(a.context);
    const team = named(a.context, 'team');
    const caja = scalar(v.caja);
    const cat = scalar(v.categoria);
    const sub = team?.name || (caja !== undefined ? `Caja ${caja}` : cat !== undefined ? `Categoría ${cat}` : view.levelName !== view.metal ? view.levelName : null);
    const id = `${a.key}|${a.sport}|${a.level}|${team?.id ?? ''}|${caja ?? ''}|${cat ?? ''}`;
    const g = groups.get(id) ?? { id, view, subtitle: sub, winners: [] };
    if (!g.winners.some((w) => w.playerId === a.playerId)) g.winners.push({ playerId: a.playerId, awardId: a.id, evidence: team ? null : view.evidence });
    groups.set(id, g);
  }
  const rank = (g: WinnerGroup) => keys.indexOf(g.view.award.key) * 10 - g.view.award.level;
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || String(a.subtitle ?? '').localeCompare(String(b.subtitle ?? ''), 'es', { numeric: true }));
}

export interface MonthAwardsModel {
  /** 'YYYY-MM'. */
  month: string;
  /** «Premios de octubre». */
  title: string;
  groups: WinnerGroup[];
  /** Asistencia perfecta del mes (sale plegada). */
  attendance: { playerId: string | null; awardId: string }[];
}

/**
 * «Premios de {mes}» en la portada de la liga: del día 3 al 9 del mes siguiente (`today` en la zona de la liga),
 * los ganadores de las insignias del mes. null fuera de esos días o si no hubo premios.
 */
export function monthAwards(awards: readonly BadgeAward[], today: string): MonthAwardsModel | null {
  const day = Number(today.slice(8, 10));
  if (!(day >= 3 && day <= 9)) return null;
  const month = addMonths(today.slice(0, 7), -1);
  const rows = awards.filter((a) => {
    const def = badgeDef(a.key);
    return !!def && (def.period === 'mes' || def.period === 'cajas') && def.scope === 'liga' && awardMonth(a) === month;
  });
  const groups = winnerGroups(rows, MONTH_AWARD_KEYS);
  const attendance = [...new Map(rows.filter((a) => a.key === 'perfect_attendance_month').map((a) => [a.playerId ?? a.id, { playerId: a.playerId, awardId: a.id }])).values()];
  if (!groups.length && !attendance.length) return null;
  return { month, title: `Premios de ${monthName(month)}`, groups, attendance };
}

/** Días que se ven los campeones de la temporada. */
export const CHAMPIONS_DAYS = 14;

export interface SeasonAwardsModel {
  periodKey: string;
  title: string;
  groups: WinnerGroup[];
}

/** «Campeones» de la última temporada cerrada, por 14 días desde que se dieron. */
export function seasonAwards(awards: readonly BadgeAward[], now: number): SeasonAwardsModel | null {
  const rows = awards.filter((a) => a.periodKey.startsWith('s:') && badgeDef(a.key)?.period === 'temporada' && within(a.awardedAt, now, CHAMPIONS_DAYS));
  if (!rows.length) return null;
  const latest = [...rows].sort((a, b) => Date.parse(b.awardedAt) - Date.parse(a.awardedAt))[0];
  const season = latest.periodKey.split(':').slice(0, 2).join(':');
  const mine = rows.filter((a) => a.periodKey === season || a.periodKey.startsWith(`${season}:`));
  const groups = winnerGroups(mine, SEASON_AWARD_KEYS);
  if (!groups.length) return null;
  const name = named(latest.context, 'season')?.name;
  const w = windowOf(latest.context);
  const ribbon = w ? periodRibbon({ kind: 'season', startsOn: w[0], endsOn: w[1] }).long : '';
  return { periodKey: season, title: `Campeones de ${name || ribbon || 'la temporada'}`, groups };
}

// ---------- La página de un evento ----------

/** Lo que se da al cerrar un evento, en este orden (podio, categoría, equipo; lo demás después). */
export const EVENT_AWARD_KEYS = ['event_podium', 'bowling_category_win', 'bowling_team_win'] as const;

/**
 * Las insignias de un evento para su página (§6.2, «el podio con sus insignias cuando ya se dieron»): las de periodo
 * 'evento' con clave `e:<evento>` (o `e:<evento>:<categoría>`), agrupadas como en la portada. Vacío si todavía no se
 * dieron.
 */
export function eventAwards(awards: readonly BadgeAward[], eventId: string): WinnerGroup[] {
  const rows = awards.filter((a) => (a.periodKey === `e:${eventId}` || a.periodKey.startsWith(`e:${eventId}:`)) && badgeDef(a.key)?.period === 'evento');
  const keys = [...EVENT_AWARD_KEYS, ...[...new Set(rows.map((a) => a.key))].filter((k) => !(EVENT_AWARD_KEYS as readonly string[]).includes(k)).sort()];
  return winnerGroups(rows, keys);
}

// ---------- Por confirmar (aval) ----------

export interface ReviewModel {
  review: BadgeReview;
  def: BadgeDef;
  name: string;
  levelName: string;
  look: BadgeLook;
  evidence: string | null;
  /** Link al evento donde pasó (el juego, la ronda). */
  eventLink: string | null;
  eventName: string | null;
  markers: number;
  date: string;
}

export function reviewModel(r: BadgeReview): ReviewModel | null {
  const def = badgeDef(r.key);
  if (!def) return null;
  const a: AwardLike = { ...r, leagueName: r.leagueName };
  const vars = textVars(def, a);
  const alt = typeof r.context.alt === 'string' ? r.context.alt : null;
  const event = named(r.context, 'event');
  return {
    review: r,
    def,
    name: fillBadgeText(nameOf(def, { sport: rowSport(r.sport), alt }), vars),
    levelName: LEVEL_LABEL[lvl(r.level)],
    look: lookOf(def, a),
    evidence: evidenceOf(def, a),
    eventLink: event?.id ? `/l/${r.leagueId}/e/${event.id}` : null,
    eventName: event?.name || null,
    markers: Array.isArray(r.context.markers) ? r.context.markers.length : 0,
    date: shortDate(r.awardedAt),
  };
}

// ---------- Avisos ----------

/** Días que una insignia nueva sale en Avisos. */
export const NOTICE_DAYS = 14;

/** Ruta de la vitrina propia (con `id`, abre esa insignia). */
/** Tu pestaña de insignias; con `id`, abre esa. `still`: sin la animación de desbloqueo (ya se vio en el aviso). */
export const myBadgesPath = (id?: string, opts: { still?: boolean } = {}) =>
  `/perfil?tab=insignias${id ? `&insignia=${encodeURIComponent(id)}${opts.still ? '&quieta=1' : ''}` : ''}`;

/**
 * Avisos de insignias para la página de Avisos (como avisos genéricos, filtro Social): una por insignia ganada en
 * los últimos 14 días («¡Te ganaste una insignia!»), las del historial juntas («Te dimos 12 insignias por tu
 * historial») y, en Admin, las hazañas por confirmar.
 */
export function badgeNotices(profile: ProfileBadges | null, reviews: readonly BadgeReview[], now: number): GenericNotice[] {
  const out: GenericNotice[] = [];
  const history: BadgeAward[] = [];
  for (const a of profile?.isMe ? profile.awards : []) {
    if ((a.status !== 'provisional' && a.status !== 'firme') || !within(a.awardedAt, now, NOTICE_DAYS)) continue;
    if (a.history) {
      history.push(a);
      continue;
    }
    const v = viewAward(a);
    if (!v) continue;
    out.push({
      id: `insignia:${a.id}`,
      kind: 'social',
      icon: 'badge',
      title: `¡Te ganaste «${v.name}»!`,
      body: [levelLine(v), a.hidden ? 'Solo tú la ves' : null].filter(Boolean).join(' · '),
      url: myBadgesPath(a.id),
      at: a.awardedAt,
      lid: v.leagueId,
      sport: isSportId(a.sport) ? a.sport : null,
      category: 'social',
    });
  }
  for (const a of profile?.isMe ? (profile.leagueAwards ?? []) : []) {
    if (!within(a.awardedAt, now, NOTICE_DAYS)) continue;
    const v = viewLeagueAward(a);
    out.push({
      id: `insignia-liga:${a.id}`,
      kind: 'social',
      icon: 'badge',
      title: `${v.leagueName} te dio «${v.name}»`,
      body: [v.detail, a.hidden ? 'Solo tú la ves' : null].filter(Boolean).join(' · ') || 'Tócala para verla.',
      url: myBadgesPath(),
      at: a.awardedAt,
      lid: a.leagueId,
      sport: a.sport && isSportId(a.sport) ? a.sport : null,
      category: 'social',
    });
  }
  if (history.length) {
    const at = Math.max(...history.map((a) => Date.parse(a.awardedAt)));
    out.push({
      id: `insignias-historial:${history.length}`,
      kind: 'social',
      icon: 'badge',
      title: `Te dimos ${history.length} ${history.length === 1 ? 'insignia' : 'insignias'} por tu historial`,
      body: '¡Míralas en tu perfil!',
      url: myBadgesPath(),
      at,
      category: 'social',
    });
  }
  for (const r of reviews) {
    const m = reviewModel(r);
    if (!m) continue;
    out.push({
      id: `insignia-aval:${r.id}`,
      kind: 'social',
      icon: 'badge',
      title: 'Hay una hazaña por confirmar',
      body: `${m.name} de ${r.playerName}`,
      url: `/l/${r.leagueId}/admin?tab=confirmar`,
      at: r.awardedAt,
      lid: r.leagueId,
      sport: isSportId(r.sport) ? r.sport : null,
      category: 'admin',
    });
  }
  return out;
}

// ---------- Del creador: las que da la liga ----------

/**
 * Cómo se ve un diseño del creador: su forma, su metal o color («Color de la liga» = el del deporte), su ícono y sus
 * textos (maker/look.ts). `period`: el periodo con que se dio (la cinta dice ese); sin él, el texto del diseño.
 */
export function leagueLookOf(d: LeagueBadgeDesign, sport: string | null, period?: string | null): BadgeLook {
  return designLook(d, sport, period);
}

export interface LeagueAwardView {
  award: LeagueBadgeAward;
  name: string;
  description: string;
  look: BadgeLook;
  label: string;
  leagueName: string;
  /** «Otorgada por Liga Los Pinos · 12 oct 2026». */
  givenBy: string;
  /** «Octubre · División A · Los Tigres». */
  detail: string | null;
  date: string;
}

export function viewLeagueAward(a: LeagueBadgeAward): LeagueAwardView {
  const look = leagueLookOf(a.badge, a.sport, a.period);
  const date = shortDate(a.awardedAt);
  const league = a.leagueName || 'tu liga';
  const detail = [a.period, a.division, a.teamName].map((x) => x?.trim()).filter(Boolean).join(' · ');
  return {
    award: a,
    name: a.badge.name,
    description: a.badge.description,
    look,
    label: badgeLabel(a.badge.name, look),
    leagueName: league,
    givenBy: `Otorgada por ${league}${date ? ` · ${date}` : ''}`,
    detail: detail || null,
    date,
  };
}

export interface LeagueTileModel {
  /** `diseño|oculta`. */
  id: string;
  top: LeagueAwardView;
  views: LeagueAwardView[];
  count: number;
  state: BadgeState;
  hidden: boolean;
}

export interface LeagueShelf {
  leagueId: string;
  leagueName: string;
  tiles: LeagueTileModel[];
}

/** «De mis ligas» (§6.1): por liga, una insignia por diseño (×N si se la dieron varias veces). */
export function leagueShelves(awards: readonly LeagueBadgeAward[], opts: { own: boolean; now: number; opened?: ReadonlySet<string> }): LeagueShelf[] {
  const byLeague = new Map<string, { name: string; tiles: Map<string, LeagueAwardView[]> }>();
  for (const a of awards) {
    if (a.hidden && !opts.own) continue;
    const l = byLeague.get(a.leagueId) ?? { name: a.leagueName, tiles: new Map<string, LeagueAwardView[]>() };
    const id = `${a.badgeId}|${a.hidden ? 'oculta' : ''}`;
    l.tiles.set(id, [...(l.tiles.get(id) ?? []), viewLeagueAward(a)]);
    byLeague.set(a.leagueId, l);
  }
  return [...byLeague.entries()]
    .map(([leagueId, l]) => ({
      leagueId,
      leagueName: l.name || 'Liga',
      tiles: [...l.tiles.entries()]
        .map(([id, views]): LeagueTileModel => {
          const sorted = [...views].sort((x, y) => Date.parse(y.award.awardedAt) - Date.parse(x.award.awardedAt));
          const hidden = sorted[0].award.hidden;
          const fresh = opts.own && !hidden && sorted.some((v) => within(v.award.awardedAt, opts.now, NEW_DAYS) && !opts.opened?.has(v.award.id));
          return { id, top: sorted[0], views: sorted, count: sorted.length, hidden, state: hidden ? 'hidden' : fresh ? 'new' : 'unlocked' };
        })
        .sort((x, y) => Date.parse(y.top.award.awardedAt) - Date.parse(x.top.award.awardedAt)),
    }))
    .sort((a, b) => a.leagueName.localeCompare(b.leagueName, 'es'));
}

/** La tarjeta para compartir una del creador: siempre dice quién la otorgó (la nota nunca). */
export function leagueShareInputOf(v: LeagueAwardView, player: string): BadgeShareInput {
  return {
    name: v.name,
    look: v.look,
    levelLine: v.detail ?? '',
    description: v.description,
    player: player.trim() || 'Un jugador',
    league: v.leagueName,
    footnote: v.givenBy,
    caption: `${v.leagueName} me dio «${v.name}» en MatchMate`,
  };
}

// ---------- Aviso al ganar ----------

/** Cuántas salen una por una en el aviso (las demás: «y 3 más»). */
export const UNLOCK_MAX = 5;

/** Una insignia del aviso: automática (`app`) o de la liga (`liga`, «Liga Los Pinos te dio una insignia»). */
export type UnlockItem = { kind: 'app'; id: string; view: AwardView } | { kind: 'liga'; id: string; view: LeagueAwardView };

export interface UnlockPlan {
  /** Una por una (hasta 5), más nuevas primero. */
  items: UnlockItem[];
  /** Las que no caben («y 3 más»). */
  more: number;
  /** Del historial: un solo aviso con la lista. */
  history: AwardView[];
  /** Automáticas que se marcan como vistas al cerrar (`mark_badges_seen`). */
  ids: string[];
  /** Del creador que se marcan como vistas (`mark_league_badges_seen`). */
  leagueIds: string[];
}

/**
 * Qué muestra el aviso al ganar con las insignias sin ver (automáticas y del creador, más nuevas primero). Las que
 * esta versión no conoce no salen, pero igual se marcan como vistas.
 */
export function unlockPlan(awards: readonly BadgeAward[], leagueAwards: readonly LeagueBadgeAward[] = []): UnlockPlan {
  const views = awards.filter((a) => a.status === 'provisional' || a.status === 'firme').map((a) => ({ a, v: viewAward(a) }));
  const known = views.filter((x): x is { a: BadgeAward; v: AwardView } => x.v !== null);
  const history = known.filter((x) => x.a.history).map((x) => x.v);
  const fresh: { at: number; item: UnlockItem }[] = [
    ...known.filter((x) => !x.a.history).map((x) => ({ at: Date.parse(x.a.awardedAt), item: { kind: 'app' as const, id: x.a.id, view: x.v } })),
    ...leagueAwards.map((a) => ({ at: Date.parse(a.awardedAt), item: { kind: 'liga' as const, id: a.id, view: viewLeagueAward(a) } })),
  ].sort((a, b) => b.at - a.at);
  return {
    items: fresh.slice(0, UNLOCK_MAX).map((x) => x.item),
    more: Math.max(0, fresh.length - UNLOCK_MAX),
    history,
    ids: awards.map((a) => a.id),
    leagueIds: leagueAwards.map((a) => a.id),
  };
}

/** Texto para compartir: «¡Me gané «Constancia» (oro) en MatchMate!». */
export const shareText = (v: Pick<AwardView, 'name' | 'metal'>) => `¡Me gané «${v.name}» (${v.metal.toLowerCase()}) en MatchMate!`;

/**
 * Lo que lleva la tarjeta para compartir (§4.9). `player`: quién la ganó. `announce`: la comparte un admin de la liga
 * para anunciarla («Liga Los Pinos premió a Ana»).
 */
export function shareInputOf(v: AwardView, player: string, stat?: BadgeStat, announce = false): BadgeShareInput {
  const period = humanPeriod(v.look.period);
  const level = v.metal === LEVEL_LABEL[0] ? (v.levelName !== v.metal ? v.levelName : '') : v.levelName !== v.metal ? `${v.levelName} · ${v.metal}` : v.metal;
  const league = v.leagueName?.trim() || null;
  const who = player.trim() || 'Un jugador';
  return {
    name: v.name,
    look: v.look,
    levelLine: [level, period].filter(Boolean).join(' · '),
    description: v.description,
    player: announce && league ? `${league} premió a ${who}` : who,
    league: announce ? null : league,
    footnote: rarityShareText(stat, v.award.sport),
    caption: announce && league ? `${league} premió a ${who} con «${v.name}» en MatchMate` : shareText(v),
  };
}

/**
 * ¿Quien mira puede reportar esta insignia de otra cuenta (§6.3, report_badge)? Una de liga, solo si es miembro de esa
 * liga; una de cuenta, cualquiera que ve el perfil. La propia, nunca.
 */
export function canReportAward(award: { leagueId: string | null }, own: boolean, memberLeagues: ReadonlySet<string>): boolean {
  return !own && (!award.leagueId || memberLeagues.has(award.leagueId));
}

/** Cómo se empieza en cada deporte (con el género de su unidad: «tu primera ronda», y en natación se nada). */
const FIRST_STEP: Partial<Record<string, string>> = {
  golf: 'Juega tu primera ronda',
  swimming: 'Nada tu primera prueba',
};

/** «Juega tu primer juego en una liga y te llega la primera.» con la unidad del deporte. */
export function emptyOwnText(sports: readonly string[]): string {
  const only = sports.length === 1 ? sports[0] : null;
  const first = (only && FIRST_STEP[only]) ?? `Juega tu primer ${only ? (sportMeta(only)?.units.match[0] ?? 'juego') : 'juego'}`;
  return `${first} en una liga y te llega la primera.`;
}

export { PROFILE_SECTIONS, type ProfileSection };
