import { leagueSport, sportMeta } from '../sports/registry';
import type { Side } from '../sports/types';
import type { LeagueFeed } from './data';
import type { Match, MatchStatus } from './data/matches';
import { parseDate, toIsoDate, typeLabel } from './format';
import { eventStart } from './reminders';
import { WEEKDAYS, formatTime, parseSchedule } from './schedule';
import type { League } from './types';

/** Un día del calendario de "Próximos" en el Home. */
export interface CalendarItem {
  /** Para ordenar y como key. */
  key: string;
  /** 'event': evento creado o práctica del horario; 'match': un partido tuyo (raqueta o equipos). */
  kind: 'event' | 'match';
  date: string;
  lid: string;
  leagueName: string;
  /** Deporte de la liga: el «voy» y las prácticas según el horario son solo del boliche. */
  sport: string;
  /** Tipo del evento tal como está en la base: 'practica' | 'torneo' (boliche), 'americano', 'ronda', 'encuentro'… ('partido' en los partidos). */
  type: string;
  name: string;
  /** "7:00 pm" si se sabe la hora. */
  time: string | null;
  minutes: number | null;
  /** null = práctica que toca según el horario de la liga, pero el admin todavía no la creó (o un partido sin evento). */
  eventId: string | null;
  playerId: string | null;
  going: boolean;
  /** A dónde lleva tocarlo: el evento, la liga o el partido. */
  href: string;
  /** Solo partidos: su id, su estado y dónde se juega («Jornada 3 · Cancha 2»). */
  matchId: string | null;
  status?: MatchStatus;
  detail?: string;
}

/** Lo que el calendario necesita de un partido (sirve con `Match` y con lo que guarda la caché). */
export type CalendarMatch = Pick<Match, 'id' | 'leagueId' | 'eventId' | 'scheduledAt' | 'status' | 'round' | 'stage' | 'court'> & {
  sides: readonly { side: Side; label: string }[];
  mySide?: Side | null;
};

/** Zona de la liga cuando no dice otra (la de la base). */
export const DEFAULT_TZ = 'America/Santo_Domingo';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/** Día de la semana de `iso` (0 = lunes, como WEEKDAYS). */
const weekdayOf = (iso: string) => (parseDate(iso).getDay() + 6) % 7;

/** Días entre dos fechas. */
const dayGap = (a: string, b: string) => Math.round(Math.abs(parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);

/** Lunes de la semana de `iso` (las semanas del calendario van de lunes a domingo). */
export function weekStart(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

/** "7:30 pm" de una hora 'HH:MM' o 'HH:MM:SS' de la base; null si no hay o no se entiende. */
function startOf(time: string | null | undefined): { minutes: number; label: string } | null {
  const hhmm = time?.slice(0, 5) ?? '';
  const label = hhmm ? formatTime(hhmm) : '';
  if (!label) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return { minutes: h * 60 + m, label };
}

// ---------- Horas de los partidos (en la zona de la liga) ----------

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

function zoneFormat(tz: string): Intl.DateTimeFormat {
  let f = zoneFormats.get(tz);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    try {
      f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: tz });
    } catch {
      // Una zona que este teléfono no conoce: la de la base.
      f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: DEFAULT_TZ });
    }
    zoneFormats.set(tz, f);
  }
  return f;
}

/** Fecha ('YYYY-MM-DD') y minutos del día de una hora ISO del servidor en la zona de la liga; null si no hay. */
export function zonedParts(iso: string | null | undefined, tz?: string | null): { date: string; minutes: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p: Record<string, string> = {};
  for (const part of zoneFormat(tz || DEFAULT_TZ).formatToParts(d)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** "8:00 pm" de los minutos del día. */
export const minutesLabel = (minutes: number) =>
  formatTime(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);

/**
 * Desde cuándo se piden «mis partidos» para el Home (la RPC my_matches con `p_since`): la medianoche de ayer. Es
 * la misma todo el día (la clave de la caché no cambia a cada rato) y la precarga usa la misma (src/lib/prefetch.ts).
 */
export function myMatchesSince(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
}

/** Raqueta o equipos: los deportes con partidos. */
export function isMatchSport(sport: string): boolean {
  const family = sportMeta(sport)?.family;
  return family === 'racket' || family === 'team';
}

/**
 * Dónde se abre un partido. En raqueta, el de un evento (noche, torneo, cajas) dentro de su evento; los demás en
 * «Partidos» de la liga. Las dos pantallas abren el partido con `?partido=`.
 */
export function matchHref(lid: string, m: Pick<Match, 'id' | 'eventId'>, sport: string): string {
  if (sportMeta(sport)?.family === 'racket' && m.eventId) return `/l/${lid}/e/${m.eventId}?partido=${m.id}`;
  return `/l/${lid}/juegos?partido=${m.id}`;
}

/** «vs. Tigres» si juego en un lado; si no, «Ana / Luis vs. Pedro / Juan». */
export function matchTitle(m: { sides: readonly { side: Side; label: string }[] }, mySide?: Side | null): string {
  const name = (s: Side) => m.sides.find((x) => x.side === s)?.label.trim() || 'Por definir';
  if (mySide === 1 || mySide === 2) return `vs. ${name(mySide === 1 ? 2 : 1)}`;
  return `${name(1)} vs. ${name(2)}`;
}

/** «Jornada 3 · Cancha 2», «Grupo A · Cancha 1» (raqueta cuenta rondas; los equipos, jornadas). */
export function matchDetail(m: Pick<Match, 'round' | 'stage' | 'court'>, sport: string): string {
  const word = sportMeta(sport)?.family === 'team' ? 'Jornada' : 'Ronda';
  return [m.stage.trim() || (m.round != null ? `${word} ${m.round}` : ''), m.court.trim()].filter(Boolean).join(' · ');
}

/** Estados de un partido que salen en el calendario: lo que se va a jugar o se está jugando. */
const CALENDAR_STATUSES: readonly MatchStatus[] = ['scheduled', 'live', 'suspended'];

/** Mis partidos con fecha entre `from` y `to` (sin incluir), como días del calendario. */
function matchItems(matches: readonly CalendarMatch[], leagues: readonly League[], from: string, to: string, playerOf: (lid: string) => string | null): CalendarItem[] {
  const out: CalendarItem[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.id) || !CALENDAR_STATUSES.includes(m.status)) continue;
    const league = leagues.find((l) => l.id === m.leagueId);
    if (!league) continue;
    const at = zonedParts(m.scheduledAt, league.tz);
    if (!at || at.date < from || at.date >= to) continue;
    seen.add(m.id);
    const sport = leagueSport(league);
    out.push({
      key: `${league.id}:partido:${m.id}`,
      kind: 'match',
      date: at.date,
      lid: league.id,
      leagueName: league.name,
      sport,
      type: 'partido',
      name: matchTitle(m, m.mySide),
      time: minutesLabel(at.minutes),
      minutes: at.minutes,
      eventId: m.eventId,
      playerId: playerOf(league.id),
      going: false,
      href: matchHref(league.id, m, sport),
      matchId: m.id,
      status: m.status,
      detail: matchDetail(m, sport),
    });
  }
  return out;
}

/**
 * Lo que viene en tus ligas entre `from` y `from + days`: las prácticas y torneos creados y, en las
 * ligas con horario (p. ej. "Martes · 7:00 pm"), también las prácticas de cada semana aunque el admin
 * todavía no las haya creado. Ordenado por día y hora.
 *
 * Las prácticas (el «voy» y las que salen solas del horario) son del boliche. En los otros deportes salen
 * los eventos creados con su tipo («Americano», «Ronda», «Encuentro»…) y su hora, sin prácticas inventadas.
 * `matches` = mis partidos (useMyMatches): los que tienen fecha salen el día que se juegan, en la hora de la liga.
 */
export function upcomingCalendar(
  feeds: LeagueFeed[],
  leagues: League[],
  from: string,
  days: number,
  matches: readonly CalendarMatch[] = [],
): CalendarItem[] {
  const to = addDays(from, days);
  const out: CalendarItem[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league) continue;
    const sport = leagueSport(league);
    const base = { kind: 'event' as const, lid: feed.lid, leagueName: league.name, playerId: feed.playerId, sport, matchId: null };
    const eventHref = (id: string) => `/l/${feed.lid}/e/${id}`;
    const inRange = feed.events.filter((e) => e.date >= from && e.date < to);
    if (sport !== 'bowling') {
      for (const e of inRange) {
        const start = startOf(e.startTime) ?? eventStart(e, league);
        out.push({
          ...base,
          key: `${feed.lid}:${e.id}`,
          date: e.date,
          type: e.type,
          name: e.name?.trim() || typeLabel(e.type, sport),
          time: start?.label ?? null,
          minutes: start?.minutes ?? null,
          eventId: e.id,
          going: false,
          href: eventHref(e.id),
        });
      }
      continue;
    }
    for (const e of inRange) {
      const start = eventStart(e, league);
      out.push({
        ...base,
        key: `${feed.lid}:${e.id}`,
        date: e.date,
        type: e.type,
        name: e.type === 'torneo' ? e.name?.trim() || 'Torneo' : 'Práctica',
        time: start?.label ?? null,
        minutes: start?.minutes ?? null,
        eventId: e.id,
        going: !!(feed.playerId && e.rsvp?.[feed.playerId]),
        href: eventHref(e.id),
      });
    }
    // Prácticas de cada semana según el horario (las ligas; un torneo sin liga no se repite), solo dentro
    // de la temporada y en los días que no tienen ya algo creado (un torneo ese día la reemplaza).
    if (league.kind === 'torneo') continue;
    const { days: weekdays } = parseSchedule(league.schedule ?? '');
    if (!weekdays.length) continue;
    const busy = new Set(feed.events.map((e) => e.date));
    const planned: string[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      if (!weekdays.includes(weekdayOf(d)) || busy.has(d)) continue;
      if ((league.seasonStart && d < league.seasonStart) || (league.seasonEnd && d > league.seasonEnd)) continue;
      planned.push(d);
    }
    // Una práctica movida a otro día (p. ej. al miércoles porque el martes era feriado) reemplaza la del
    // horario más cercana de esa misma semana (si empatan, la primera).
    for (const moved of feed.events) {
      if (moved.type !== 'practica' || weekdays.includes(weekdayOf(moved.date))) continue;
      const week = weekStart(moved.date);
      let pick = -1;
      planned.forEach((d, i) => {
        if (weekStart(d) === week && (pick < 0 || dayGap(d, moved.date) < dayGap(planned[pick], moved.date))) pick = i;
      });
      if (pick >= 0) planned.splice(pick, 1);
    }
    for (const d of planned) {
      const start = eventStart({ date: d }, league);
      out.push({
        ...base,
        key: `${feed.lid}:horario:${d}`,
        date: d,
        type: 'practica',
        name: 'Práctica',
        time: start?.label ?? null,
        minutes: start?.minutes ?? null,
        eventId: null,
        going: false,
        href: `/l/${feed.lid}`,
      });
    }
  }
  out.push(...matchItems(matches, leagues, from, to, (lid) => feeds.find((f) => f.lid === lid)?.playerId ?? null));
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.minutes ?? 0) - (b.minutes ?? 0) || a.leagueName.localeCompare(b.leagueName));
}

// ---------- «Tu próximo partido» ----------

/** Un partido que ya debió empezar sigue como «próximo» hasta 2 horas después (nadie abrió la cancha todavía). */
export const NEXT_MATCH_GRACE_MS = 2 * 60 * 60 * 1000;

export interface NextMatchInfo<M extends CalendarMatch = CalendarMatch> {
  match: M;
  league: League;
  sport: string;
  href: string;
  /** «vs. Tigres». */
  title: string;
  /** «Jornada 3 · Cancha 2» (vacío si no hay). */
  detail: string;
  /** Fecha del partido en la zona de la liga. */
  date: string;
  /** «Hoy», «Mañana», «Sábado», «Sábado 11 oct». */
  dayLabel: string;
  /** «8:00 pm». */
  time: string;
  /** Minutos que faltan (negativo: ya es la hora). */
  minutesLeft: number;
  /** Otros partidos tuyos con fecha en los próximos 7 días. */
  more: number;
}

/** «Hoy», «Mañana», «Ayer», el día de la semana (esta semana) o «Sábado 11 oct». */
export function dayLabel(date: string, today: string): string {
  const gap = Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / 86_400_000);
  if (gap === 0) return 'Hoy';
  if (gap === 1) return 'Mañana';
  if (gap === -1) return 'Ayer';
  const d = parseDate(date);
  const weekday = WEEKDAYS[(d.getDay() + 6) % 7];
  return gap > 1 && gap < 7 ? weekday : `${weekday} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** «En 25 min», «En 3 h», «Ya es la hora»; null si falta más de medio día (se dice el día). */
export function startsInText(minutesLeft: number): string | null {
  if (minutesLeft <= 0) return 'Ya es la hora';
  if (minutesLeft < 60) return `En ${minutesLeft} min`;
  if (minutesLeft < 12 * 60) return `En ${Math.floor(minutesLeft / 60)} h`;
  return null;
}

/**
 * Mi próximo partido en todas mis ligas: el programado con fecha más cercano (desde 2 horas antes de ahora). Los
 * que están en vivo salen en «En juego ahora»; los aplazados, suspendidos o sin fecha, en las pantallas de la liga.
 */
export function nextMatch<M extends CalendarMatch>(matches: readonly M[], leagues: readonly League[], now: number): NextMatchInfo<M> | null {
  const list = matches
    .filter((m) => m.status === 'scheduled' && m.scheduledAt)
    .map((m) => ({ m, at: Date.parse(m.scheduledAt!), league: leagues.find((l) => l.id === m.leagueId) }))
    .filter((x): x is { m: M; at: number; league: League } => !!x.league && Number.isFinite(x.at) && x.at >= now - NEXT_MATCH_GRACE_MS)
    .sort((a, b) => a.at - b.at || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0));
  const first = list[0];
  if (!first) return null;
  const { m, league, at } = first;
  const sport = leagueSport(league);
  const when = zonedParts(m.scheduledAt, league.tz)!;
  const today = zonedParts(new Date(now).toISOString(), league.tz)!.date;
  const ids = new Set<string>([m.id]);
  let more = 0;
  for (const x of list.slice(1)) {
    if (ids.has(x.m.id)) continue;
    ids.add(x.m.id);
    if (x.at < now + 7 * 86_400_000) more++;
  }
  return {
    match: m,
    league,
    sport,
    href: matchHref(league.id, m, sport),
    title: matchTitle(m, m.mySide),
    detail: matchDetail(m, sport),
    date: when.date,
    dayLabel: dayLabel(when.date, today),
    time: minutesLabel(when.minutes),
    minutesLeft: Math.ceil((at - now) / 60_000),
    more,
  };
}
