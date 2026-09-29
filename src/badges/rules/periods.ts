/**
 * Relojes y claves de periodo de las insignias (docs/insignias.md §1.7.1). Las fechas son locales de la liga
 * (`leagues.tz`, hoy todas Santo Domingo, UTC−4 sin horario de verano); las de cuenta que suman ligas cortan meses y
 * años en Santo Domingo. Las cuentas de fechas usan los helpers de la app (`localParts`, `addDays`).
 */
import { addDays, DEFAULT_TZ, localParts } from '../../pages/sports/racket/logic/time';

export { addDays };

/** Zona de las insignias de cuenta. */
export const BADGE_TZ = DEFAULT_TZ;

/** Días que una insignia por resultado queda provisional (§3.4). */
export const PROVISIONAL_DAYS = 7;
/** Días que una hazaña espera aval antes de ir a la cola del superadmin (§1.7.5). */
export const AVAL_DAYS = 14;
/** La actividad de cuenta solo cuenta desde las 48 h (se puede corregir antes). */
export const SETTLE_HOURS = 48;

/** Formato del check de `badge_awards.period_key`. */
export const PERIOD_KEY_RE = /^[A-Za-z0-9:_-]{1,120}$/;

/** Claves de periodo (§1.7.1). Una fila por dueño, key, deporte, nivel y periodo. */
export const periodKey = {
  /** Siempre (carrera, aniversario): una fila por nivel. */
  always: '-',
  event: (eventId: string, catId?: string | null) => (catId ? `e:${eventId}:${catId}` : `e:${eventId}`),
  match: (matchId: string) => `m:${matchId}`,
  /** Un juego de boliche (`i` = índice del juego, desde 0). */
  game: (entryId: string, i: number) => `g:${entryId}:${i}`,
  card: (cardId: string) => `c:${cardId}`,
  /** Un resultado de natación (`swim_entries.id`). */
  race: (swimEntryId: string) => `r:${swimEntryId}`,
  golfTournament: (id: string) => `gt:${id}`,
  /** 'YYYY-MM'. */
  month: (month: string) => month,
  /** Mes `n` de una liga por cajas. */
  box: (eventId: string, n: number) => `b:${eventId}:${n}`,
  season: (seasonId: string, catId?: string | null) => (catId ? `s:${seasonId}:${catId}` : `s:${seasonId}`),
  year: (year: number | string) => String(year),
  league: (leagueId: string) => `l:${leagueId}`,
} as const;

export const isPeriodKey = (k: unknown): k is string => typeof k === 'string' && PERIOD_KEY_RE.test(k);

// ---------------------------------------------------------------------------------------------------------
// Fechas locales

/** Fecha local ('YYYY-MM-DD') de una hora ISO en la zona. */
export const localDate = (iso: string | null | undefined, tz: string | null | undefined = BADGE_TZ): string | null => localParts(iso, tz)?.date ?? null;

/** Fecha de un partido para las insignias: `coalesce(scheduled_at, proposed_at, created_at)` en la zona de la liga. */
export function matchDate(m: { scheduled_at: string | null; proposed_at: string | null; created_at: string }, tz?: string | null): string | null {
  return localDate(m.scheduled_at ?? m.proposed_at ?? m.created_at, tz);
}

/** Hoy en la zona ('YYYY-MM-DD'). */
export const todayIn = (now: number | string, tz: string | null | undefined = BADGE_TZ): string =>
  localDate(typeof now === 'string' ? now : new Date(now).toISOString(), tz) ?? new Date(now).toISOString().slice(0, 10);

/** 'YYYY-MM' de una fecha. */
export const monthOf = (date: string): string => date.slice(0, 7);
/** Año de una fecha. */
export const yearOf = (date: string): number => Number(date.slice(0, 4));

/** Mes `n` meses después (o antes, con negativos). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Meses de `a` a `b`, ambos incluidos (vacío si `b` va antes). */
export function monthsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  for (let m = a; m <= b && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Primer y último día de un mes. */
export function monthRange(month: string): [string, string] {
  return [`${month}-01`, addDays(`${addMonths(month, 1)}-01`, -1)];
}

/** Días entre dos fechas (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Semana ISO de una fecha ('2026-W40'): el tope de días ponderados es por semana (§1.7.3). */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // El jueves de esa semana decide el año (lunes = 1 … domingo = 7).
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Último día que ya cuenta para las de cuenta: la actividad de hace 48 h o más (§2.1, `mileage`). */
export function settledThrough(now: number | string, tz: string | null | undefined = BADGE_TZ): string {
  return addDays(todayIn(now, tz), -Math.ceil(SETTLE_HOURS / 24));
}

/** Cuándo queda firme una provisional (ISO). */
export function firmAt(awardedAt: string): string {
  return new Date(Date.parse(awardedAt) + PROVISIONAL_DAYS * 86_400_000).toISOString();
}

/** Día en que se evalúa un mes (el 3 del mes siguiente) y un año (el 7 de enero siguiente). */
export const monthDueOn = (month: string): string => `${addMonths(month, 1)}-03`;
export const yearDueOn = (year: number): string => `${year + 1}-01-07`;
