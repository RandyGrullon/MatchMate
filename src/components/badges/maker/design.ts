/**
 * El editor del creador de insignias sin pantalla (docs/insignias.md §5.4 a §5.7): el borrador de un diseño, los
 * periodos que ofrece, cómo se ve, qué se manda a la base (al crear, todo; al editar, solo lo que cambió), los avisos
 * de cada campo y los errores de la base en palabras. Funciones puras, con pruebas en design.test.ts.
 */
import { todayIn } from '../../../badges/rules/periods';
import { BADGE_ICONS, SHAPE_ORDER, TIERS, TIER_ORDER, isBadgeIconKey, periodRibbon, type BadgeIconKey, type BadgeLook, type BadgeShape } from '../../../badges/visual';
import { asBackendError } from '../../../lib/db/errors';
import type { LeagueBadgeDesign } from '../../../lib/data/badges';
import { LIMIT_OF, type DesignPalette, type DesignPayload, type LeagueBadge, type LimitKind, type MadeAward } from '../../../lib/data/leagueBadges';
import { saveErrorMessage } from '../../feedback';
import { BADGE_TEXT_MAX, badgeTextError, cleanBadgeText, textLength } from '../text';
import { designLook } from './look';
import { byTeamAllowed, templateByTeam, templateDescription, templateName, templateOf, type TemplateKey } from './templates';

// ---------- Periodos ----------

/** Los chips de «Periodo o texto de abajo» (un texto libre, si lo hay, manda sobre el chip). */
export type PeriodMode = 'temporada' | 'anio' | 'mes' | 'torneo' | 'none';

export interface PeriodChoice {
  mode: PeriodMode;
  label: string;
  /** Lo que va en la cinta (≤ 10): «TEMP 2026», «2026», «OCT 2026»; '' sin periodo. */
  text: string;
}

export interface PeriodLeague {
  seasonStart?: string;
  seasonEnd?: string;
  tz?: string;
  kind?: string;
}

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Los periodos de hoy en la zona de la liga: la temporada de la liga («TEMP 2026», o «TEMP 26/27» si cruza el año;
 * sin fechas, la del año), el año, el mes, el torneo (el mes, con «TORNEO» arriba) y sin periodo.
 */
export function periodChoices(league: PeriodLeague, now: number): PeriodChoice[] {
  const today = todayIn(now, league.tz || 'America/Santo_Domingo');
  const year = Number(today.slice(0, 4));
  const month = periodRibbon({ kind: 'month', year, month: Number(today.slice(5, 7)) }).long;
  const season =
    isDate(league.seasonStart) || isDate(league.seasonEnd)
      ? periodRibbon({ kind: 'season', startsOn: league.seasonStart ?? '', endsOn: league.seasonEnd ?? '' }).long
      : `TEMP ${year}`;
  return [
    { mode: 'temporada', label: 'Temporada', text: season },
    { mode: 'anio', label: 'Año', text: String(year) },
    { mode: 'mes', label: 'Mes', text: month },
    { mode: 'torneo', label: 'Torneo', text: month },
    { mode: 'none', label: 'Sin periodo', text: '' },
  ];
}

/** El chip que corresponde a un texto guardado, o el texto libre si no es ninguno. */
export function modeOfText(text: string, choices: readonly PeriodChoice[]): { mode: PeriodMode; free: string } {
  const t = cleanBadgeText(text).toUpperCase();
  if (!t) return { mode: 'none', free: '' };
  const mode = choices.find((c) => c.mode !== 'none' && c.mode !== 'torneo' && c.text === t)?.mode;
  return mode ? { mode, free: '' } : { mode: 'temporada', free: t };
}

// ---------- Borrador ----------

export interface DesignDraft {
  template: TemplateKey | null;
  name: string;
  description: string;
  shape: BadgeShape;
  palette: DesignPalette;
  /** El color de «Otro color» (se guarda aunque se elija otra paleta, para volver a él). */
  color: string;
  icon: BadgeIconKey;
  topText: string;
  periodMode: PeriodMode;
  /** El texto libre de abajo: si hay, manda sobre el chip. */
  periodFree: string;
  limitKind: LimitKind;
  byTeam: boolean;
}

/** «Otro color» empieza en el turquesa de los colores de la app. */
export const DEFAULT_CUSTOM_COLOR = '#0d9488';

export function blankDraft(): DesignDraft {
  return {
    template: null,
    name: '',
    description: '',
    shape: 'hex',
    palette: 'oro',
    color: DEFAULT_CUSTOM_COLOR,
    icon: 'trophy',
    topText: '',
    periodMode: 'temporada',
    periodFree: '',
    limitKind: 'abierta',
    byTeam: false,
  };
}

/** Un borrador que arranca con una plantilla (§5.5): en un torneo suelto, con el mes y «TORNEO» arriba. */
export function templateDraft(key: TemplateKey, sport: string | null | undefined, kind?: string | null): DesignDraft {
  const t = templateOf(key)!;
  const tournament = kind === 'torneo';
  return {
    ...blankDraft(),
    template: t.key,
    name: templateName(t.key, sport, tournament),
    description: templateDescription(t.key, sport, tournament),
    shape: t.shape,
    palette: t.metal,
    icon: t.icon,
    topText: tournament ? 'TORNEO' : '',
    periodMode: tournament ? 'torneo' : t.period === 'mes' ? 'mes' : 'temporada',
    limitKind: t.limitKind,
    byTeam: templateByTeam(t, sport),
  };
}

/** El borrador de un diseño guardado (para editarlo o duplicarlo). */
export function draftFromBadge(b: LeagueBadge, choices: readonly PeriodChoice[]): DesignDraft {
  const period = modeOfText(b.periodText, choices);
  return {
    template: templateOf(b.template)?.key ?? null,
    name: b.name,
    description: b.description,
    shape: (SHAPE_ORDER as readonly string[]).includes(b.shape) ? (b.shape as BadgeShape) : 'hex',
    palette: b.palette as DesignPalette,
    color: b.color ?? DEFAULT_CUSTOM_COLOR,
    icon: isBadgeIconKey(b.icon) ? b.icon : 'trophy',
    topText: b.topText,
    periodMode: period.mode,
    periodFree: period.free,
    limitKind: b.limitKind,
    byTeam: b.byTeam,
  };
}

/** El texto de la cinta que queda con ese borrador. */
export function draftPeriodText(d: Pick<DesignDraft, 'periodMode' | 'periodFree'>, choices: readonly PeriodChoice[]): string {
  const free = cleanBadgeText(d.periodFree).toUpperCase();
  if (free) return free;
  return choices.find((c) => c.mode === d.periodMode)?.text ?? '';
}

const normColor = (s: string) => {
  const v = s.trim().toLowerCase();
  return v && !v.startsWith('#') ? `#${v}` : v;
};
export const isHexColor = (s: string) => /^#[0-9a-f]{6}$/.test(normColor(s));

/** Lo que se dibuja (el diseño como lo guardaría la base). */
export function draftDesign(d: DesignDraft, choices: readonly PeriodChoice[]): LeagueBadgeDesign {
  const color = d.palette === 'color' && isHexColor(d.color) ? normColor(d.color) : null;
  return {
    id: '',
    name: cleanBadgeText(d.name),
    description: cleanBadgeText(d.description),
    shape: d.shape,
    // Un color a medio escribir se ve con el de la liga mientras tanto.
    palette: d.palette === 'color' && !color ? 'liga' : d.palette,
    color,
    icon: d.icon,
    topText: cleanBadgeText(d.topText).toUpperCase(),
    periodText: draftPeriodText(d, choices),
  };
}

export const draftLook = (d: DesignDraft, choices: readonly PeriodChoice[], sport: string | null | undefined): BadgeLook => designLook(draftDesign(d, choices), sport);

/** Todo el diseño para crearlo (`save_league_badge` con un id nuevo). */
export function draftPayload(d: DesignDraft, choices: readonly PeriodChoice[], sport: string | null | undefined): DesignPayload {
  const x = draftDesign(d, choices);
  return {
    template: d.template,
    name: x.name,
    description: x.description,
    shape: x.shape,
    palette: x.palette as DesignPalette,
    color: x.color,
    icon: x.icon,
    top_text: x.topText,
    period_text: x.periodText,
    limit_kind: d.limitKind,
    by_team: byTeamAllowed(sport) && d.byTeam,
  };
}

/**
 * Lo que cambió respecto del diseño guardado (al editar solo se manda eso). Un diseño que ya se dio solo cambia la
 * descripción.
 */
export function draftPatch(orig: LeagueBadge, d: DesignDraft, choices: readonly PeriodChoice[], sport: string | null | undefined): DesignPayload {
  const full = draftPayload(d, choices, sport);
  const before: DesignPayload = {
    template: orig.template,
    name: orig.name,
    description: orig.description,
    shape: orig.shape,
    palette: orig.palette as DesignPalette,
    color: orig.palette === 'color' ? orig.color : null,
    icon: orig.icon,
    top_text: orig.topText,
    period_text: orig.periodText,
    limit_kind: orig.limitKind,
    by_team: orig.byTeam,
  };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(full) as (keyof DesignPayload)[]) {
    if (orig.locked && k !== 'description') continue;
    if (full[k] !== before[k]) out[k] = full[k];
  }
  // La plantilla es solo de dónde salió: no se borra al editar.
  if (out.template === null) delete out.template;
  return out as DesignPayload;
}

export const isEmptyPatch = (p: DesignPayload) => Object.keys(p).length === 0;

// ---------- Avisos de los campos ----------

export interface DraftErrors {
  name?: string;
  description?: string;
  topText?: string;
  period?: string;
  color?: string;
}

/** Lo que está mal en cada campo (el filtro del teléfono; las palabras bloqueadas las revisa la base al guardar). */
export function draftErrors(d: DesignDraft): DraftErrors {
  const e: DraftErrors = {};
  const name = cleanBadgeText(d.name);
  const n = textLength(name);
  if (!n) e.name = 'Ponle un nombre.';
  else if (n < BADGE_TEXT_MAX.nameMin || n > BADGE_TEXT_MAX.name) e.name = 'El nombre lleva de 3 a 28 letras.';
  else e.name = badgeTextError(name) ?? undefined;
  const desc = cleanBadgeText(d.description);
  if (textLength(desc) > BADGE_TEXT_MAX.description) e.description = 'La descripción lleva hasta 140 letras.';
  else e.description = badgeTextError(desc) ?? undefined;
  const top = cleanBadgeText(d.topText);
  if (textLength(top) > BADGE_TEXT_MAX.top) e.topText = 'El texto de arriba lleva hasta 14 letras.';
  else e.topText = badgeTextError(top) ?? undefined;
  const free = cleanBadgeText(d.periodFree);
  if (textLength(free) > BADGE_TEXT_MAX.period) e.period = 'El texto de abajo lleva hasta 10 letras.';
  else e.period = badgeTextError(free) ?? undefined;
  if (d.palette === 'color' && !isHexColor(d.color)) e.color = 'Escribe el color así: #1a2b3c.';
  for (const k of Object.keys(e) as (keyof DraftErrors)[]) if (!e[k]) delete e[k];
  return e;
}

export const hasErrors = (e: DraftErrors) => Object.keys(e).length > 0;

// ---------- Opciones del editor ----------

export const LIMIT_INFO: Readonly<Record<LimitKind, { label: string; hint: string }>> = {
  unica: { label: 'Única', hint: 'Solo 1 por periodo' },
  selecta: { label: 'Selecta', hint: 'Hasta 3' },
  abierta: { label: 'Abierta', hint: 'Hasta 20' },
};

export const PALETTE_OPTIONS: readonly { value: DesignPalette; label: string }[] = [
  ...TIER_ORDER.map((t) => ({ value: t as DesignPalette, label: TIERS[t].name })),
  { value: 'liga', label: 'Color de la liga' },
  { value: 'color', label: 'Otro color' },
];

/** El color del puntito de cada opción de «Color». */
export function paletteDot(p: DesignPalette, sportHex: string, custom: string): string {
  if (p === 'liga') return sportHex;
  if (p === 'color') return isHexColor(custom) ? normColor(custom) : sportHex;
  return TIERS[p].mid;
}

export const iconLabel = (key: string) => (isBadgeIconKey(key) ? BADGE_ICONS[key].label : key);

/** «Única · Hasta 1 por periodo» en una línea. */
export const limitLine = (kind: LimitKind, byTeam = false) =>
  `${LIMIT_INFO[kind].label} · ${kind === 'unica' ? '1' : `hasta ${LIMIT_OF[kind]}`} por periodo${byTeam ? ' (equipos)' : ''}`;

// ---------- Fechas ----------

/** «4 oct 2026» de una hora ISO en la zona de la liga ('' si no es una fecha). */
export function dayText(iso: string | null | undefined, tz = 'America/Santo_Domingo'): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
  } catch {
    f = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santo_Domingo' });
  }
  return f
    .format(new Date(t))
    .replace(/\./g, '')
    .replace(/\bde\b\s*/g, '');
}

/** ¿Quien la dio todavía la puede deshacer? (24 h desde que la dio). */
export const withinUndo = (awardedAt: string, now: number) => {
  const t = Date.parse(awardedAt);
  return Number.isFinite(t) && now - t < 24 * 3600_000;
};

// ---------- Dar ----------

/** «Campeón · TEMP 2026» (o solo el nombre sin periodo). */
export const awardTitle = (name: string, period: string) => (period.trim() ? `${name} · ${period.trim()}` : name);

/** «Ana», «Ana y Luis», «Ana, Luis y Pedro», «Ana, Luis y 3 más». */
export function namesText(names: readonly string[], max = 2): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length <= max + 1) return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(', ')} y ${list.length - max} más`;
}

/** «Listo: Ana tiene “Campeón · TEMP 2026”». */
export function givenText(names: readonly string[], name: string, period: string): string {
  return `Listo: ${namesText(names)} ${names.length > 1 ? 'tienen' : 'tiene'} “${awardTitle(name, period)}”`;
}

/**
 * Periodo o división para comparar, como la base (private.badge_slot_key): minúsculas, sin tildes y solo letras y
 * números. «Temp 2026.» es el mismo periodo que «TEMP 2026»; «a» la misma división que «A.».
 */
export const slotKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '');

/**
 * Cuántos (jugadores, o equipos con `byTeam`) la tienen vigente en ese periodo y división. Los premios del torneo no
 * cuentan (no usan el cupo del diseño: docs/premios-torneo.md §1 D4), como en la base.
 */
export function unitsTaken(badge: Pick<LeagueBadge, 'id' | 'byTeam'>, awards: readonly MadeAward[], period: string, division: string): number {
  const units = new Set<string>();
  const p = slotKey(period);
  const d = slotKey(division);
  for (const a of awards) {
    if (a.badgeId !== badge.id || a.revokedAt || a.prizeSlotId || slotKey(a.period) !== p || slotKey(a.division) !== d) continue;
    units.add(badge.byTeam ? (a.teamId ?? a.playerId) : a.playerId);
  }
  return units.size;
}

/** Cuántos más caben (jugadores, o equipos con `byTeam`). */
export const quotaLeft = (badge: Pick<LeagueBadge, 'id' | 'byTeam' | 'limitKind'>, awards: readonly MadeAward[], period: string, division: string) =>
  Math.max(0, LIMIT_OF[badge.limitKind] - unitsTaken(badge, awards, period, division));

// ---------- Errores de la base en palabras ----------

export interface ErrorContext {
  /** Nombre del diseño («Campeón»). */
  name?: string;
  limitKind?: LimitKind;
  period?: string;
  /** Quiénes la tienen ya en ese periodo (para la Única). */
  holders?: readonly string[];
  /** Qué se estaba haciendo: cambia el texto de 'rate_limited' y de 'ya_dada'. */
  action?: 'guardar' | 'dar' | 'borrar' | 'reportar' | 'quitar';
}

/** Código corto de una RPC ('limite: activas', 'cupo_lleno'…) o null. */
export function makerCode(e: unknown): string | null {
  const be = asBackendError(e);
  if (!be) return null;
  const msg = be.message.trim();
  // `private.deny()` lanza 'no_permitido' con 42501.
  if (be.code === '42501') return msg === 'no_permitido' ? msg : null;
  // Los demás que lanzan las RPC (`private.fail`) van con P0001; lo otro (red, sesión) lo dice saveErrorMessage.
  if (be.code !== 'P0001') return null;
  const m = /^(limite: [a-z]+|[a-z_]+)/.exec(msg);
  return m ? m[1] : null;
}

/** «“Campeón” es Única: ya se la diste a Ana en TEMP 2026.» (o el cupo de Selecta y Abierta). */
export function quotaFullText(ctx: ErrorContext): string {
  const name = ctx.name ? `“${ctx.name}”` : 'Esa insignia';
  const period = ctx.period?.trim() ? ` en ${ctx.period.trim()}` : '';
  if (ctx.limitKind === 'unica') return ctx.holders?.length ? `${name} es Única: ya se la diste a ${namesText(ctx.holders)}${period}.` : `${name} es Única: ya se dio${period}.`;
  const n = ctx.limitKind ? LIMIT_OF[ctx.limitKind] : null;
  return `${name} ya llegó a su cupo${n ? ` (${n})` : ''}${period}. Quítasela a alguien o usa otro periodo.`;
}

/** El error de la base en palabras (§5.6), sin repetir nunca el texto bloqueado. */
export function makerErrorText(e: unknown, ctx: ErrorContext = {}): string {
  const code = makerCode(e);
  const period = ctx.period?.trim() ? ` en ${ctx.period.trim()}` : '';
  switch (code) {
    case 'texto_bloqueado':
      return 'Ese texto no se puede usar.';
    case 'a_si_mismo':
      return 'No puedes darte insignias a ti mismo. Pídele a otro admin o al dueño.';
    case 'cupo_lleno':
      return quotaFullText(ctx);
    case 'duplicado':
      return `Ya la tiene${period}. Cambia el periodo o la división para darla otra vez.`;
    case 'ya_dada':
      return ctx.action === 'borrar'
        ? 'Esta insignia ya se dio: no se puede borrar. Archívala.'
        : 'Esta insignia ya se dio: solo puedes cambiar la descripción. Duplícala para hacer otra versión.';
    case 'no_activa':
      return 'Esta insignia está archivada. Actívala para darla.';
    case 'limite: activas':
      return 'Llegaste a 30 insignias activas. Archiva una para crear otra.';
    case 'limite: total':
      return 'La liga llegó a 100 diseños. Borra uno que nunca se dio.';
    case 'limite: jugador':
      return 'Alguno ya tiene 15 insignias de la liga este año: es el máximo.';
    case 'limite: liga':
      return 'La liga ya dio 60 insignias en los últimos 30 días. Espera unos días.';
    case 'rate_limited':
      return ctx.action === 'guardar'
        ? 'Guardaste muchos diseños en la última hora. Espera un rato.'
        : ctx.action === 'reportar'
          ? 'Ya mandaste 5 reportes hoy. Mañana puedes mandar más.'
          : 'Diste muchas insignias en la última hora. Espera un rato.';
    case 'no_permitido':
      return ctx.action === 'quitar' ? 'Ya no puedes deshacerla: pasaron 24 horas. Solo el dueño la puede quitar.' : 'No tienes permiso para esto en la liga.';
    case 'cerrado':
      // Un premio del torneo con los premios cerrados (o entregado hace más de 14 días).
      return 'Los premios de este torneo ya se cerraron. Solo el dueño puede quitarla.';
    case 'invalido':
      return 'Revisa los datos: algo no está bien.';
    default:
      return saveErrorMessage(e);
  }
}
