/**
 * La cinta de periodo (docs/insignias.md §4.5): el texto de abajo de la insignia en su forma larga (128 px, ≤ 10
 * letras) y corta (64 px, ≤ 7), y cómo se dice en palabras para el nombre accesible y las pantallas.
 * Las temporadas salen de `public.seasons` (starts_on, ends_on): una de un solo año es «TEMP 2026», una entre dos
 * años «TEMP 26/27».
 */
import { TIER_LABEL } from './palette';
import type { BadgeLook, BadgeState, PeriodRibbon } from './types';

/** Meses en tres letras, en la `tz` de la liga (el mes ya viene local en la clave `2026-10`). */
export const MONTH_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'] as const;
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/** Largo máximo de cada forma de la cinta. */
export const RIBBON_MAX = { long: 10, short: 7 } as const;

export type PeriodSpec =
  /** Mes (1 a 12). */
  | { kind: 'month'; year: number; month: number }
  | { kind: 'year'; year: number }
  /** Temporada: fechas `YYYY-MM-DD` de `public.seasons`. */
  | { kind: 'season'; startsOn: string; endsOn: string }
  /** Torneo suelto (`kind='torneo'`): el mes de su fecha, y arriba «TORNEO». */
  | { kind: 'tournament'; date: string }
  /** Racha: `×10`. */
  | { kind: 'streak'; count: number }
  /** Texto libre del creador (≤ 10, en mayúsculas). */
  | { kind: 'custom'; text: string };

export interface PeriodBadgeText extends PeriodRibbon {
  /** Banda de arriba que pide el periodo (solo el torneo: «TORNEO»). */
  top?: string;
}

const yy = (year: number) => String(year % 100).padStart(2, '0');
/** Año de una fecha `YYYY-MM-DD` (NaN si no es una fecha). */
const yearOf = (date: string | null | undefined) => (/^\d{4}/.test(date ?? '') ? Number(date!.slice(0, 4)) : NaN);

/** Texto de la cinta de un periodo. */
export function periodRibbon(p: PeriodSpec): PeriodBadgeText {
  switch (p.kind) {
    case 'month': {
      const m = MONTH_ABBR[Math.min(12, Math.max(1, Math.trunc(p.month))) - 1];
      return { long: `${m} ${p.year}`, short: `${m} ${yy(p.year)}` };
    }
    case 'year':
      return { long: String(p.year), short: String(p.year) };
    case 'season': {
      const a = yearOf(p.startsOn);
      const b = yearOf(p.endsOn);
      if (!Number.isFinite(b) || !Number.isFinite(a) || a === b) {
        const y = Number.isFinite(a) ? a : b;
        return { long: `TEMP ${y}`, short: `T ${y}` };
      }
      return { long: `TEMP ${yy(a)}/${yy(b)}`, short: `T ${yy(a)}/${yy(b)}` };
    }
    case 'tournament': {
      const r = periodRibbon({ kind: 'month', year: yearOf(p.date), month: Number(p.date.slice(5, 7)) });
      return { ...r, top: 'TORNEO' };
    }
    case 'streak':
      return { long: `×${p.count}`, short: `×${p.count}` };
    case 'custom': {
      const t = p.text.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, RIBBON_MAX.long);
      // La corta es la larga si cabe en 7; si no, la cinta va sin texto a 64 px.
      return { long: t, short: t.length <= RIBBON_MAX.short ? t : '' };
    }
  }
}

/** La forma larga o corta de la cinta. */
export const periodLabel = (p: PeriodRibbon, form: 'short' | 'long') => (form === 'long' ? p.long : p.short);

/**
 * Cinta de una clave de periodo simple (§1.7.1): `2026-10` (mes) y `2026` (año). Las temporadas (`s:<id>`) necesitan
 * sus fechas: usa `periodRibbon({ kind: 'season', … })`. null si la clave no es de esas dos.
 */
export function periodFromKey(key: string): PeriodBadgeText | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return periodRibbon({ kind: 'month', year: Number(m[1]), month: Number(m[2]) });
  if (/^\d{4}$/.test(key)) return periodRibbon({ kind: 'year', year: Number(key) });
  return null;
}

/**
 * El periodo en palabras: «Octubre 2026» (con `capital` en false, «octubre 2026»), «Temporada 2026», «Temporada
 * 26/27», «2026». Las rachas no se dicen (el largo va en el nombre). Un texto libre se dice como está.
 */
export function humanPeriod(p: PeriodRibbon | null | undefined, capital = true): string {
  if (!p || !p.long) return '';
  const l = p.long;
  if (l.startsWith('×')) return '';
  const month = /^([A-Z]{3}) (\d{4})$/.exec(l);
  const idx = month ? MONTH_ABBR.indexOf(month[1] as (typeof MONTH_ABBR)[number]) : -1;
  if (month && idx >= 0) {
    const name = MONTH_NAMES[idx];
    return `${capital ? name[0].toUpperCase() + name.slice(1) : name} ${month[2]}`;
  }
  if (l.startsWith('TEMP ')) return `Temporada ${l.slice(5)}`;
  return l;
}

const STATE_WORDS: Partial<Record<BadgeState, string>> = {
  locked: 'bloqueada',
  progress: 'bloqueada',
  new: 'nueva',
  review: 'en revisión',
  hidden: 'oculta',
};

/**
 * Nombre accesible de una insignia que va sola (§4.6): «Constancia, oro, octubre 2026». Con estado: «…, bloqueada».
 * Las de color de liga no dicen metal.
 */
export function badgeLabel(name: string, look: Pick<BadgeLook, 'tier' | 'period'>, state?: BadgeState): string {
  const parts = [name.trim()];
  if (typeof look.tier === 'string') parts.push(TIER_LABEL[look.tier].toLowerCase());
  const per = humanPeriod(look.period, false);
  if (per) parts.push(per);
  const st = state ? STATE_WORDS[state] : undefined;
  if (st) parts.push(st);
  return parts.filter(Boolean).join(', ');
}
