/**
 * Actividad, días activos, días ponderados y meses activos (docs/insignias.md §1.7.2 y §1.7.3). Todo sale de
 * `ActivityDay`: un (jugador, fecha local) con al menos una actividad válida, que arma cada deporte en su archivo de
 * reglas (bowling.ts, racket.ts, team.ts, golf.ts, swim.ts) o que SQL manda ya resuelto para las de cuenta.
 * Quien llama filtra antes las ligas que no son reales en ese mes (gates.ts).
 */
import { SPORT_FAMILY, type SportFamily, type SportId } from '../../sports/types';
import type { ActivityDay, LeagueMonthActivity } from '../snapshot';
import { addDays, addMonths, isoWeek, monthOf } from './periods';

export type { ActivityDay, LeagueMonthActivity };

/** Un día de golf (ronda) o de natación (encuentro) vale 2: son salidas de medio día y hay menos. */
export const DAY_WEIGHT: Readonly<Record<SportId, 1 | 2>> = {
  bowling: 1,
  padel: 1,
  tennis: 1,
  pickleball: 1,
  table_tennis: 1,
  basketball: 1,
  football: 1,
  futsal: 1,
  golf: 2,
  swimming: 2,
  // Sin insignias de esports todavía (docs/esports.md, D17): el peso queda listo para cuando las haya.
  esports: 1,
};

/** Tope de días ponderados por semana ISO y por cuenta. */
export const MAX_WEIGHT_PER_WEEK = 4;
/** Un mes es activo con 2+ días ponderados (una ronda de golf o un encuentro de natación bastan). */
export const ACTIVE_MONTH_MIN = 2;

/** Un día activo de un dueño (cuenta, o jugador sin cuenta). */
export interface ActiveDay {
  holder: string;
  date: string;
  sports: SportId[];
  leagues: string[];
  /** 2 si ese día hubo golf o natación. */
  weight: 1 | 2;
  /** Hubo al menos una actividad oficial ese día. */
  official: boolean;
  /** Solo hubo actividad por plantilla (sirve para días activos, debut y kilometraje; nada más). */
  rosterOnly: boolean;
}

/** `user`: agrupa por cuenta (las actividades sin cuenta quedan en su jugador); `player`: por jugador. */
export type HolderBy = 'user' | 'player';

export const holderOf = (a: Pick<ActivityDay, 'user_id' | 'player_id'>, by: HolderBy = 'user'): string =>
  by === 'user' ? (a.user_id ?? a.player_id) : a.player_id;

/** Días activos: uno por (dueño, fecha), sin importar cuántas ligas o actividades hubo ese día. En orden. */
export function activeDays(acts: readonly ActivityDay[], by: HolderBy = 'user'): ActiveDay[] {
  const map = new Map<string, ActiveDay>();
  for (const a of acts) {
    const holder = holderOf(a, by);
    const k = `${holder}|${a.date}`;
    let d = map.get(k);
    if (!d) {
      d = { holder, date: a.date, sports: [], leagues: [], weight: 1, official: false, rosterOnly: true };
      map.set(k, d);
    }
    if (!d.sports.includes(a.sport)) d.sports.push(a.sport);
    if (!d.leagues.includes(a.league_id)) d.leagues.push(a.league_id);
    if (DAY_WEIGHT[a.sport] === 2) d.weight = 2;
    if (a.official && !a.roster) d.official = true;
    if (!a.roster) d.rosterOnly = false;
  }
  return [...map.values()].sort((x, y) => (x.holder < y.holder ? -1 : x.holder > y.holder ? 1 : x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** Un día con su peso ya topado. */
export interface WeightedDay {
  holder: string;
  date: string;
  weight: number;
}

/**
 * Días ponderados con el tope de 4 por semana ISO y por dueño: en orden de fecha, los primeros llenan la semana
 * (un día de golf que ya no cabe entero suma lo que falta).
 */
export function weighDays(days: readonly ActiveDay[]): WeightedDay[] {
  const used = new Map<string, number>();
  return [...days]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => {
      const k = `${d.holder}|${isoWeek(d.date)}`;
      const before = used.get(k) ?? 0;
      const weight = Math.max(0, Math.min(d.weight, MAX_WEIGHT_PER_WEEK - before));
      used.set(k, before + weight);
      return { holder: d.holder, date: d.date, weight };
    });
}

export const weightedTotal = (days: readonly WeightedDay[]): number => days.reduce((n, d) => n + d.weight, 0);

/** Días ponderados por mes ('YYYY-MM' → días), de un solo dueño. */
export function weightByMonth(days: readonly WeightedDay[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of days) out.set(monthOf(d.date), (out.get(monthOf(d.date)) ?? 0) + d.weight);
  return out;
}

/** Meses activos (2+ días ponderados), en orden, de un solo dueño. */
export function activeMonths(days: readonly WeightedDay[], min = ACTIVE_MONTH_MIN): string[] {
  return [...weightByMonth(days)]
    .filter(([, w]) => w >= min)
    .map(([m]) => m)
    .sort();
}

/**
 * Meses seguidos de la racha que llega a `end` (`month_streak`). **Comodín:** un mes inactivo en cualquier ventana
 * de `window` meses no rompe la racha, pero tampoco suma. Dos huecos a menos de `window` meses la rompen, igual que
 * dos meses inactivos seguidos.
 */
export function monthStreak(months: Iterable<string>, end: string, window = 12): number {
  const active = new Set(months);
  if (!active.size) return 0;
  const first = [...active].sort()[0];
  let count = 0;
  let lastGap: string | null = null;
  for (let m = end; m >= first; m = addMonths(m, -1)) {
    if (active.has(m)) {
      count++;
      continue;
    }
    const prev = addMonths(m, -1);
    const farFromGap = lastGap === null || addMonths(m, window) <= lastGap;
    if (!active.has(prev) || !farFromGap) break;
    lastGap = m;
  }
  return count;
}

/** Días activos distintos dentro de los `windowDays` días desde el primero (`strong_start`), de un solo dueño. */
export function firstWindowDays(days: readonly ActiveDay[], windowDays = 30): { first: string; last: string; days: number } | null {
  if (!days.length) return null;
  const sorted = [...new Set(days.map((d) => d.date))].sort();
  const first = sorted[0];
  const last = addDays(first, windowDays - 1);
  return { first, last, days: sorted.filter((d) => d <= last).length };
}

/** Días activos distintos por deporte (para `multisport`, `three_worlds`, `debut`). Una sola cuenta o jugador. */
export function daysBySport(acts: readonly ActivityDay[]): Map<SportId, number> {
  const seen = new Map<SportId, Set<string>>();
  for (const a of acts) {
    const s = seen.get(a.sport) ?? new Set<string>();
    s.add(a.date);
    seen.set(a.sport, s);
  }
  return new Map([...seen].map(([sport, dates]) => [sport, dates.size]));
}

/** Deportes con al menos `minDays` días activos (un día suelto no cuenta). Fútbol y sala van aparte. */
export function sportsWithDays(acts: readonly ActivityDay[], minDays = 3): SportId[] {
  return [...daysBySport(acts)].filter(([, n]) => n >= minDays).map(([s]) => s);
}

/** Familias (series, raqueta, equipo) de unos deportes. */
export function familiesOf(sports: readonly SportId[]): Set<SportFamily> {
  return new Set(sports.map((s) => SPORT_FAMILY[s]));
}

/** Primera fecha con actividad (de un deporte, si se pide): el debut y quién es nuevo en una temporada. */
export function firstActivity(acts: readonly ActivityDay[], sport?: SportId): string | null {
  let first: string | null = null;
  for (const a of acts) if ((!sport || a.sport === sport) && (first === null || a.date < first)) first = a.date;
  return first;
}

/**
 * Quién tuvo actividad válida en cada (liga, mes): la base de «liga real». Lo que viene solo por plantilla no
 * cuenta (la plantilla vale para días activos, debut y kilometraje, nada más).
 */
export function leagueMonths(acts: readonly ActivityDay[]): LeagueMonthActivity[] {
  const map = new Map<string, { league_id: string; month: string; users: Set<string>; players: Set<string> }>();
  for (const a of acts) {
    if (a.roster) continue;
    const month = monthOf(a.date);
    const k = `${a.league_id}|${month}`;
    const row = map.get(k) ?? { league_id: a.league_id, month, users: new Set<string>(), players: new Set<string>() };
    if (a.user_id) row.users.add(a.user_id);
    row.players.add(a.player_id);
    map.set(k, row);
  }
  return [...map.values()]
    .map((r) => ({ league_id: r.league_id, month: r.month, users: [...r.users].sort(), players: [...r.players].sort() }))
    .sort((a, b) => (a.league_id < b.league_id ? -1 : a.league_id > b.league_id ? 1 : a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** Solo la actividad de ligas reales en su mes (`isReal` sale de gates.ts). */
export function inRealLeagues(acts: readonly ActivityDay[], isReal: (leagueId: string, month: string) => boolean): ActivityDay[] {
  return acts.filter((a) => isReal(a.league_id, monthOf(a.date)));
}

/** Para asistencia, rachas y títulos: sin la actividad que vino solo por plantilla. */
export const withoutRoster = (acts: readonly ActivityDay[]): ActivityDay[] => acts.filter((a) => !a.roster);

/** Solo lo oficial (títulos, asistencia, rachas). */
export const officialOnly = (acts: readonly ActivityDay[]): ActivityDay[] => acts.filter((a) => a.official && !a.roster);

/** Une actividades repetidas (mismo jugador, liga, deporte y fecha): una sola por día, oficial si alguna lo fue. */
export function dedupeActivity(acts: readonly ActivityDay[]): ActivityDay[] {
  const map = new Map<string, ActivityDay>();
  for (const a of acts) {
    const k = `${a.player_id}|${a.league_id}|${a.sport}|${a.date}`;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...a });
    else {
      prev.official = prev.official || a.official;
      // Basta una actividad de verdad para que el día no sea «solo por plantilla».
      if (!a.roster) prev.roster = false;
      prev.user_id = prev.user_id ?? a.user_id;
    }
  }
  return [...map.values()];
}
