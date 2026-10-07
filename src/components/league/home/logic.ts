/**
 * Lo que no es pantalla de la Liga sin pestañas (rediseño «Calma y foco», `2-liga.png`): la línea de la liga, lo que
 * dice la tarjeta «En juego ahora», qué fechas salen en «Próximas fechas», los 3 de la Tabla y las filas de abajo.
 * Funciones puras, con pruebas en logic.test.ts.
 */
import type { CalendarItem } from '../../../lib/calendar';
import type { RankingRow } from '../../../lib/bowlingSeason';
import { joinList } from '../../../lib/format';
import { formatTime, isCanonicalSchedule, parseSchedule, WEEKDAYS } from '../../../lib/schedule';
import { MIN_RANK_GAMES, rank } from '../../../lib/stats';
import type { GameCell, NextGame } from '../../../lib/useNextGame';
import { weekdayLabel } from '../../home/logic';

// ---------- Encabezado ----------

/** Días del horario en una línea: «Martes», «Martes y jueves», «Lunes, miércoles y viernes». */
function daysLine(days: readonly number[]): string {
  const names = [...new Set(days)]
    .filter((d) => d >= 0 && d < 7)
    .sort((a, b) => a - b)
    .map((d, i) => (i === 0 ? WEEKDAYS[d] : WEEKDAYS[d].toLowerCase()));
  return joinList(names);
}

/**
 * La línea debajo del nombre de la liga: cuándo y dónde juegan, «Martes 7:30 pm · Bolera Sambil». Si el horario no se
 * entiende (escrito a mano), va tal cual; sin horario ni lugar, null.
 */
export function leagueLine(l: { schedule?: string | null; venue?: string | null }): string | null {
  const raw = l.schedule?.trim() ?? '';
  const { days, time } = parseSchedule(raw);
  const when = raw && isCanonicalSchedule(raw) ? [daysLine(days), formatTime(time)].filter(Boolean).join(' ') : raw;
  const line = [when, l.venue?.trim()].filter(Boolean).join(' · ');
  return line || null;
}

// ---------- «En juego ahora» ----------

/** Los números que ya tiene (en la tabla, en el teléfono o enviados), en orden: lo que «lleva». */
export function scoresSoFar(cells: readonly GameCell[]): number[] {
  return cells.flatMap((c) => (c.kind === 'tabla' || c.kind === 'telefono' || c.kind === 'enviado' ? [c.score] : []));
}

const firstUpper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La línea de la tarjeta «En juego ahora», lo tuyo en pocas palabras: «Llevas 187 y 210 · el juego 3 va a medias»,
 * «Llevas 187 · te falta el juego 2», «Serie 596 · ya cuentan». Quien no juega: lo que le toca (preparar su jugador o
 * anotar a todos).
 */
export function nowLine(cells: readonly GameCell[], next: NextGame): string {
  if (next.kind === 'preparar') return 'Prepara tu jugador para anotar tus juegos';
  if (next.kind === 'planilla') return 'Anotas los juegos de todos';
  const scores = scoresSoFar(cells);
  const llevas = scores.length ? `Llevas ${joinList(scores.map(String))}` : null;
  const join = (rest: string) => (llevas ? `${llevas} · ${rest}` : firstUpper(rest));
  switch (next.kind) {
    case 'medias':
      return join(`el juego ${next.game} va a medias`);
    case 'anotar':
      return llevas ? join(`te falta el juego ${next.game}`) : 'Todavía no anotas tus juegos';
    case 'enviar':
      return join(next.count === 1 ? 'falta enviarlo' : 'falta enviarlos');
    case 'ver': {
      const series = scores.reduce((a, b) => a + b, 0);
      return `Serie ${series} · ${next.pending ? 'por aprobar' : 'ya cuentan'}`;
    }
  }
}

// ---------- Próximas fechas ----------

/** Fechas que salen en la Liga (el resto, en el Calendario). */
export const NEXT_DATES_SHOWN = 3;

/**
 * «Próximas fechas»: la próxima práctica (una sola: las demás son iguales y están en el Calendario) y los torneos que
 * vienen, por fecha, hasta `max`. Sin lo que ya sale arriba en «En juego ahora» (`skip`, por clave del calendario).
 */
export function nextDates<T extends Pick<CalendarItem, 'key' | 'date' | 'type'>>(items: readonly T[], skip: ReadonlySet<string> = new Set(), max = NEXT_DATES_SHOWN): T[] {
  const left = items.filter((it) => !skip.has(it.key));
  const practice = left.find((it) => it.type !== 'torneo');
  return left.filter((it) => it === practice || it.type === 'torneo').slice(0, max);
}

/** La línea de una fecha: «Martes · 7:30 pm» o, un torneo, «Sábado · torneo · 6 inscritos». */
export function dateLine(it: Pick<CalendarItem, 'date' | 'time' | 'type'>, today: string, signedUp?: number | null): string {
  const day = weekdayLabel(it.date, today);
  if (it.type === 'torneo') return [day, 'torneo', signedUp ? `${signedUp} ${signedUp === 1 ? 'inscrito' : 'inscritos'}` : null].filter(Boolean).join(' · ');
  return [day, it.time].filter(Boolean).join(' · ');
}

// ---------- Tabla ----------

/** Una fila de la Tabla en la Liga: su lugar, el jugador y si es la cuenta. */
export interface TopRow {
  pos: number;
  row: RankingRow;
  me: boolean;
}

/**
 * Los 3 de arriba de la Tabla (por promedio, entre los que tienen el mínimo de juegos, como la Tabla). Si la cuenta
 * está más abajo, su fila toma el último lugar («1, 2 y tú, 5.º»): su lugar siempre a la vista.
 */
export function tableTop(rows: readonly RankingRow[], me: string | null | undefined, max = 3, minGames = MIN_RANK_GAMES): TopRow[] {
  const ranked = rank(
    rows.filter((r) => r.games >= minGames),
    (r) => r.average,
  );
  const top = ranked.slice(0, max);
  const mine = me ? ranked.find((x) => x.row.playerId === me) : undefined;
  const shown = mine && !top.includes(mine) ? [...ranked.slice(0, max - 1), mine] : top;
  return shown.map(({ row, pos }) => ({ pos, row, me: !!me && row.playerId === me }));
}

// ---------- Filas ----------

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «29 sep» (el día y el mes corto, sin año). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

/** «Resultados anteriores · 29 sep · 6 oct»: las dos últimas fechas jugadas (antes de hoy), de la más vieja a la más nueva. */
export function pastLine(events: readonly { date: string }[], today: string, max = 2): string | null {
  const past = [...new Set(events.map((e) => e.date).filter((d) => d < today))].sort().slice(-max);
  return past.length ? past.map(shortDate).join(' · ') : null;
}

/** «6 en la liga» (o «en el torneo»). */
export function peopleLine(n: number, torneo = false): string {
  return `${n} en ${torneo ? 'el torneo' : 'la liga'}`;
}

// ---------- La barra de arriba ----------

/** Pantallas de la liga que traen su propia barra de arriba (la práctica, Organizar y la página de un jugador). */
export const OWN_BAR = ['e', 'admin', 'j'] as const;
/** En el boliche, también la Tabla (con «Excel» y compartir a la derecha). */
export const OWN_BAR_BOWLING = [...OWN_BAR, 'ranking'] as const;

/**
 * Qué barra va arriba en cada pantalla de la liga: `home` («‹ Ligas» e «Invitar») en su inicio; `back` («‹ Liga de los
 * martes») en las de adentro; null en las que traen la suya (`own`: la práctica o el torneo `/e/…` con su «•••»,
 * Organizar `/admin` con su selector de liga, la página de un jugador `/j/…` que vuelve a donde estabas y, en el
 * boliche, la Tabla) o fuera de la liga.
 */
export function leagueBar(pathname: string, base: string, own: readonly string[] = OWN_BAR): 'home' | 'back' | null {
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length).replace(/^\/+|\/+$/g, '');
  if (!rest) return 'home';
  return own.includes(rest.split('/')[0]) ? null : 'back';
}
