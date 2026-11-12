/**
 * El widget de MatchMate en el iPhone (solo la app del teléfono: movil/src/widgets/hoyWidget.tsx). Es lo de Hoy hecho
 * texto, con los textos de sus tarjetas (TodayCard, LiveMatchesCard, NextMatchCard, NextUpCard, IdleCard y «Lo que
 * viene»). El widget no busca datos: la app le manda una línea de tiempo y él la muestra. La línea tiene lo de ahora y,
 * para cada medianoche de la semana, lo que toca ese día con las fechas que ya se saben; así «Hoy» y «Mañana» siguen
 * bien aunque no se abra la app. Lógica pura: la web no la usa.
 */
import type { CalendarItem, CalendarMatch, NextMatchInfo } from '../../lib/calendar';
import { monthShort, toLocalDate } from '../../lib/dateBlock';
import { toIsoDate } from '../../lib/format';
import { isPlannedEvent, type LiveGame, type LiveMatchItem } from '../../lib/live';
import { formatTime } from '../../lib/schedule';
import { todayTitle, upNextSubtitle, weekdayLabel } from './logic';

/** Una fecha de «Lo que viene». */
export interface WidgetRow {
  key: string;
  /** El bloque de fecha: «NOV» y «17». */
  month: string;
  day: string;
  title: string;
  /** «Martes · 7:30 pm» (y la liga, si juegas en más de una). */
  line: string;
  url: string;
  live: boolean;
}

export interface HomeWidgetProps {
  /** Arriba, chiquito: «En juego ahora», «Hoy juegas», «Tu próximo partido», «Hoy no te toca jugar»… */
  lead: string;
  /** En juego (el punto de color). */
  live: boolean;
  title: string;
  /** «Martes · 7:30 pm» o «Liga · bolera · 7:30 pm». */
  line: string;
  /** Debajo: la liga (vacío si no hace falta). */
  sub: string;
  /** Tocarlo: la pantalla de la app (matchmate://…). */
  url: string;
  rows: WidgetRow[];
  /** Lo que dice «Lo que viene» sin fechas (vacío: no se muestra la sección). */
  emptyRows: string;
}

export interface HomeWidgetEntry {
  /** Desde cuándo se muestra (ms). */
  at: number;
  props: HomeWidgetProps;
}

/** Lo de Hoy que ya leyó la app (useActivity de las ligas de la cuenta). */
export interface HomeWidgetInput {
  signedIn: boolean;
  today: string;
  /** Lo que se juega hoy (sin las prácticas de anoche: esas piden anotar y eso lo ve la app). */
  games: readonly LiveGame[];
  liveItems: readonly LiveMatchItem[];
  nextMatch: NextMatchInfo<CalendarMatch> | null;
  nextEvent: CalendarItem | null;
  /** Lo que viene en los próximos 30 días, desde hoy. */
  upcoming: readonly CalendarItem[];
  /** La liga en cada fecha (si juegas en más de una). */
  showLeague: boolean;
  /** De una dirección de MatchMate (`/l/…/e/…`) al link que abre esa pantalla en la app. */
  link: (href: string) => string;
}

/** Fechas de «Lo que viene» que caben (en el tamaño grande; el mediano muestra 2). */
export const WIDGET_ROWS = 4;
/** Medianoches que se dejan listas en la línea de tiempo. */
export const WIDGET_DAYS = 7;

const EMPTY_ROWS = 'Nada más en los próximos 30 días.';

type Featured = Omit<HomeWidgetProps, 'rows' | 'emptyRows'>;

const join = (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** Sin cuenta: lo que es MatchMate (la portada de Hoy) y entrar. */
function signedOutProps(link: HomeWidgetInput['link']): HomeWidgetProps {
  return { lead: 'MatchMate', live: false, title: 'Tu liga, en el celular', line: 'Entra para ver lo próximo de tus ligas.', sub: '', url: link('/'), rows: [], emptyRows: '' };
}

/** Hoy no hay nada (IdleCard). */
function idle(link: HomeWidgetInput['link']): Featured {
  return { lead: 'Hoy no te toca jugar', live: false, title: 'Nada programado', line: 'Cuando tu liga ponga la próxima fecha, sale aquí.', sub: '', url: link('/') };
}

/** La práctica o el torneo que se juega hoy (TodayCard): «En juego ahora» o «Empieza a las 7:30 pm». */
function gameNow(g: LiveGame, today: string, link: HomeWidgetInput['link']): Featured {
  const { feed, league, event, info } = g;
  const start = info.startLabel ?? (event.startTime ? formatTime(event.startTime.slice(0, 5)) || null : null);
  return {
    lead: info.startsSoon && info.startLabel ? `Empieza a las ${info.startLabel}` : 'En juego ahora',
    live: true,
    title: todayTitle(event, g.today ?? today),
    line: join([league.kind !== 'torneo' ? league.name : null, league.venue?.trim() || null, !info.startsSoon ? start : null]),
    sub: '',
    // La práctica del horario que todavía no se creó no tiene evento: su liga.
    url: link(isPlannedEvent(event) ? `/l/${feed.lid}` : `/l/${feed.lid}/e/${event.id}`),
  };
}

/** Un partido en vivo de tus ligas (LiveMatchesCard): el tuyo primero. */
function matchNow(it: LiveMatchItem, link: HomeWidgetInput['link']): Featured {
  return { lead: 'En vivo', live: true, title: it.title, line: join([it.score, it.detail]), sub: it.league.name, url: link(it.href) };
}

/** Tu próximo partido (NextMatchCard). */
function nextMatchOf(next: NextMatchInfo<CalendarMatch>, link: HomeWidgetInput['link']): Featured {
  return { lead: 'Tu próximo partido', live: false, title: next.title, line: join([next.dayLabel, next.time]), sub: join([next.league.name, next.detail]), url: link(next.href) };
}

/** Lo próximo de una fecha de la lista, visto desde `today` (NextUpCard; un partido, como NextMatchCard). */
function nextUp(item: CalendarItem, today: string, link: HomeWidgetInput['link']): Featured {
  const isToday = item.date === today;
  const when = join([weekdayLabel(item.date, today), item.time]);
  if (item.kind === 'match') {
    return { lead: 'Tu próximo partido', live: item.status === 'live', title: item.name, line: when, sub: join([item.leagueName, item.detail]), url: link(item.href) };
  }
  const kind = item.type === 'torneo' ? 'torneo' : item.type === 'practica' || item.sport === 'bowling' ? 'práctica' : 'evento';
  return {
    lead: isToday ? 'Hoy juegas' : 'Hoy no te toca jugar',
    live: item.status === 'live',
    title: isToday ? todayTitle({ type: item.type, name: item.type === 'torneo' ? item.name : null, date: item.date }, today) : `Tu próxim${kind === 'práctica' ? 'a' : 'o'} ${kind}`,
    line: item.type === 'torneo' && !isToday ? `${item.name} · ${when}` : when,
    sub: item.leagueName,
    url: link(item.href),
  };
}

/** Una fecha de «Lo que viene» (UpNext). */
function rowOf(it: CalendarItem, today: string, input: HomeWidgetInput): WidgetRow {
  const d = toLocalDate(it.date);
  return {
    key: it.key,
    month: d ? monthShort(d) : '',
    day: d ? String(d.getDate()) : '',
    title: it.name,
    line: upNextSubtitle(it, today, input.showLeague),
    url: input.link(it.href),
    live: it.status === 'live',
  };
}

/** Lo de ahora, como lo arma Hoy: en juego, tu próximo partido, tu próxima fecha o nada; abajo, «Lo que viene». */
export function homeWidgetNow(input: HomeWidgetInput): HomeWidgetProps {
  if (!input.signedIn) return signedOutProps(input.link);
  const { games, liveItems, nextMatch, nextEvent, today, link } = input;
  const live = games.length > 0 || liveItems.length > 0;
  let featured: Featured;
  if (games.length) featured = gameNow(games[0], today, link);
  else if (liveItems.length) featured = matchNow(liveItems[0], link);
  else if (nextMatch) featured = nextMatchOf(nextMatch, link);
  else if (nextEvent) featured = nextUp(nextEvent, today, link);
  else featured = idle(link);
  // «Lo que viene» sin lo que ya sale arriba (como Hoy).
  const shown = new Set([...games.map((g) => `${g.feed.lid}:${g.event.id}`), ...(nextEvent && !live ? [nextEvent.key] : [])]);
  const rows = input.upcoming
    .filter((it) => !shown.has(it.key) && !(nextMatch && !live && it.matchId === nextMatch.match.id))
    .slice(0, WIDGET_ROWS)
    .map((it) => rowOf(it, today, input));
  return { ...featured, rows, emptyRows: EMPTY_ROWS };
}

/** Lo de un día que todavía no llega, con las fechas que ya se saben: la primera arriba y las demás en la lista. */
export function homeWidgetOn(input: HomeWidgetInput, day: string): HomeWidgetProps {
  if (!input.signedIn) return signedOutProps(input.link);
  const left = input.upcoming.filter((it) => it.date >= day);
  const featured = left.length ? nextUp(left[0], day, input.link) : idle(input.link);
  return { ...featured, rows: left.slice(1, 1 + WIDGET_ROWS).map((it) => rowOf(it, day, input)), emptyRows: EMPTY_ROWS };
}

/** La línea de tiempo: lo de ahora y cada medianoche de la semana (en la hora del teléfono). */
export function homeWidgetTimeline(input: HomeWidgetInput, now: Date): HomeWidgetEntry[] {
  const entries: HomeWidgetEntry[] = [{ at: now.getTime(), props: homeWidgetNow(input) }];
  for (let d = 1; d <= WIDGET_DAYS; d++) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    entries.push({ at: midnight.getTime(), props: homeWidgetOn(input, toIsoDate(midnight)) });
  }
  return entries;
}

/** Para no mandarle lo mismo otra vez: lo que muestra (sin las horas de la línea de tiempo). */
export function homeWidgetKey(entries: readonly HomeWidgetEntry[]): string {
  return JSON.stringify(entries.map((e) => e.props));
}
