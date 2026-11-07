/**
 * Lo que no es pantalla de las secciones de Pro de Hoy («Por hacer», «En vivo» y «Esta semana», ProSections.tsx): qué
 * espera al organizador en cada liga, las líneas de cada tarea, qué filas de la tabla en vivo se ven y los días de la
 * semana con algo. Sin React ni react-router: lo usan la web (ProSections.tsx) y la app del teléfono
 * (movil/src/components/home/ProSections.tsx).
 */
import { upcomingCalendar, weekStart, type CalendarMatch } from '../../lib/calendar';
import type { LeagueFeed } from '../../lib/data';
import { parseDate, toIsoDate } from '../../lib/format';
import type { League, Submission } from '../../lib/types';
import type { BoardRow } from '../event/board';
import { namesLine } from './logic';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Las letras de la tira de la semana (de lunes a domingo). */
export const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

/** «sáb 24 oct». */
export const shortDay = (iso: string): string => {
  const d = parseDate(iso);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

/** Días hacia adelante en que un torneo sin equipos sale en «Por hacer». */
export const TEAMS_AHEAD_DAYS = 30;

/** Lo que el organizador tiene pendiente en una liga (lo que sale en «Por hacer»). */
export interface ToDo {
  lid: string;
  /** Envíos de otros jugadores por aprobar (los propios los ve igual en Aprobar). */
  pending: Submission[];
  approvals: number;
  suggestions: number;
  /** Torneos que vienen con equipos por armar. */
  teams: { id: string; name: string; date: string }[];
}

/** Lo pendiente de cada liga que organizas (envíos por aprobar de otros, buzón y torneos sin equipos). */
export function toDoOf(feeds: readonly LeagueFeed[], today: string): ToDo[] {
  const until = parseDate(today);
  until.setDate(until.getDate() + TEAMS_AHEAD_DAYS);
  const last = toIsoDate(until);
  return feeds
    .filter((f) => f.isAdmin)
    .map((f) => {
      const pending = f.pending.filter((s) => s.playerId !== f.playerId);
      return {
        lid: f.lid,
        pending,
        approvals: pending.length,
        suggestions: f.suggestions.length,
        teams: f.events
          .filter((e) => e.type === 'torneo' && e.date >= today && e.date <= last && (e.teamSize ?? 0) > 0 && !Object.keys(e.teams ?? {}).length)
          .map((e) => ({ id: e.id, name: e.name?.trim() || 'Torneo', date: e.date })),
      };
    })
    .filter((t) => t.approvals || t.suggestions || t.teams.length);
}

/** «Sofía y Carmen · con foto · Liga de los martes»: quiénes enviaron, si traen foto y (con varias ligas) cuál. */
export function approveLine(pending: readonly Pick<Submission, 'photoId'>[], names: readonly string[], league: string | null): string {
  const count = pending.length;
  const photos = pending.filter((s) => s.photoId).length;
  return [namesLine(names), photos === count ? 'con foto' : photos ? `${photos} con foto` : 'sin foto', league].filter(Boolean).join(' · ');
}

/** «1 sugerencia nueva» / «3 sugerencias nuevas». */
export const suggestionsText = (n: number): string => (n === 1 ? '1 sugerencia nueva' : `${n} sugerencias nuevas`);

/** La línea de un torneo sin equipos: «Faltan los equipos · sáb 24 oct · Liga de los martes». */
export const teamsLine = (date: string, league: string | null): string => ['Faltan los equipos', shortDay(date), league].filter(Boolean).join(' · ');

/** Las filas de «En vivo»: los 3 primeros y, si vas más abajo, tú. */
export function liveShownRows(rows: readonly BoardRow[], me: string | null): BoardRow[] {
  const top = rows.slice(0, 3);
  const myAt = me ? rows.findIndex((r) => r.playerId === me) : -1;
  return myAt >= 3 ? [...top, rows[myAt]] : top;
}

/**
 * Los juegos de una fila de «En vivo»: «187 · 210 · 74…» (lo que espera aprobación va marcado `pend`, en ámbar). A ti
 * se te suma el que llevas a medias (`partial`).
 */
export function liveGames(row: BoardRow, me: string | null, partial: number | null | undefined): { text: string; pend: boolean }[] {
  const known = row.cells.filter((c) => c.score != null && !c.partial).map((c) => ({ text: String(c.score), pend: c.kind === 'pend' }));
  if (row.playerId === me && partial != null) known.push({ text: `${partial}…`, pend: false });
  return known;
}

/** Los 7 días (lunes a domingo) de la semana de `today`. */
export function weekDays(today: string): string[] {
  const from = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = parseDate(from);
    d.setDate(d.getDate() + i);
    return toIsoDate(d);
  });
}

/** Los días de la semana de `today` que tienen algo (eventos o partidos). */
export function weekBusy(feeds: readonly LeagueFeed[], leagues: readonly League[], matches: readonly CalendarMatch[], today: string): Set<string> {
  return new Set(upcomingCalendar([...feeds], [...leagues], weekStart(today), 7, matches).map((i) => i.date));
}

/** «Esta semana · octubre». */
export const weekTitle = (today: string): string => `Esta semana · ${MONTHS_LONG[parseDate(today).getMonth()]}`;
