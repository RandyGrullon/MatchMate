/**
 * Lo que no es pantalla de Eventos (se prueba sin navegador): mis ligas y mis torneos por separado (lo más pronto
 * primero), las públicas para unirme, lo que viene agrupado por día y los textos que enseñan cuando no hay nada.
 */
import { dayLabel, type CalendarItem } from '../../lib/calendar';
import { inSport } from '../../lib/sportContext';
import { sportMeta, sportsOf } from '../../sports/registry';
import { itemTime } from '../home/logic';
import { countLabel, peopleWord } from '../league/logic';

/** Cuántas cosas de Próximos se ven antes de «Ver todo». */
export const UPCOMING_PREVIEW = 6;

type LeagueLike = { id: string; name: string; kind?: string | null; sport?: string | null };
type When = Pick<CalendarItem, 'date' | 'minutes'>;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

/**
 * Mis ligas y mis torneos por separado. Primero las que tienen algo pronto (lo más cercano arriba), después las demás
 * por nombre.
 */
export function splitMine<L extends LeagueLike>(leagues: readonly L[], nextOf: ReadonlyMap<string, When>): { ligas: L[]; torneos: L[] } {
  const sorted = [...leagues].sort((a, b) => {
    const na = nextOf.get(a.id);
    const nb = nextOf.get(b.id);
    if (na && nb) return itemTime(na) - itemTime(nb) || byName(a, b);
    if (na) return -1;
    if (nb) return 1;
    return byName(a, b);
  });
  return { ligas: sorted.filter((l) => l.kind !== 'torneo'), torneos: sorted.filter((l) => l.kind === 'torneo') };
}

/** Las públicas del deporte (null = todos) en que todavía no estoy, en el orden del listado (las más activas primero). */
export function joinable<L extends LeagueLike>(pub: readonly L[], isMine: (lid: string) => boolean, sport: string | null): L[] {
  return pub.filter((l) => !isMine(l.id) && inSport(sport)(l));
}

/** Deportes para los chips de «Todos los deportes»: los de mis ligas y los de las públicas (en el orden del registro). */
export function filterSports(mine: readonly LeagueLike[], pub: readonly LeagueLike[]): string[] {
  return sportsOf([...mine, ...pub]);
}

export interface DayGroup {
  date: string;
  /** «Hoy», «Mañana», «Sábado», «Sábado 11 oct». */
  label: string;
  items: CalendarItem[];
}

/** Lo que viene agrupado por día (la lista ya viene ordenada por día y hora). `limit`: cuántas cosas en total. */
export function groupByDay(items: readonly CalendarItem[], today: string, limit?: number): DayGroup[] {
  const out: DayGroup[] = [];
  for (const it of limit == null ? items : items.slice(0, limit)) {
    const last = out[out.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else out.push({ date: it.date, label: dayLabel(it.date, today), items: [it] });
  }
  return out;
}

/** «de pádel» (o nada si son todos los deportes). */
const ofSport = (sport: string | null) => (sport ? ` de ${sportMeta(sport)?.lower ?? 'este deporte'}` : '');

/** Qué decir en «Públicas para unirte» si no queda ninguna. */
export function publicEmptyText(opts: { sport: string | null; inSportTotal: number }): string {
  if (opts.inSportTotal > 0) return `Ya estás en todas las públicas${ofSport(opts.sport)}.`;
  return `Todavía no hay ligas ni torneos públicos${ofSport(opts.sport)}. Crea el primero con «Crear o unirme».`;
}

/** Título del vacío de «Mis ligas» (sin ninguna liga ni torneo en el deporte). */
export function noLeaguesTitle(sport: string | null): string {
  return `Todavía no estás en ninguna liga${ofSport(sport)}`;
}

/** «Tienes 3 en otros deportes»: para ofrecer ver todos cuando en este deporte no hay nada. */
export function otherSportsText(n: number): string | null {
  if (n <= 0) return null;
  return `Tienes ${n} ${n === 1 ? 'liga o torneo' : 'ligas y torneos'} en otros deportes.`;
}

/** Subtítulo de la página. */
export function eventosSubtitle(sport: string | null): string {
  return sport
    ? `Solo lo${ofSport(sport)}: tus ligas, tus torneos y lo que viene.`
    : 'Tus ligas, tus torneos y lo que viene, de todos los deportes.';
}

// ---------- Ligas (rediseño «Calma y foco») ----------

/**
 * La línea de una fila de Ligas: `lead` es lo de hoy, en el color del deporte («En juego hoy», «Hoy, 7:30 pm»); `rest`,
 * lo demás en gris («Martes, 7:30 pm · 6 jugadores»).
 */
export interface RowLine {
  lead: string | null;
  rest: string;
}

/** Junta la línea: «En juego hoy · 6 jugadores». */
export const rowLineText = (l: RowLine) => [l.lead, l.rest].filter(Boolean).join(' · ');

/** «Hoy, 7:30 pm», «Mañana, 7:30 pm», «Martes 13 oct» (lo de dayLabel, con la hora si se sabe). */
function whenText(date: string, time: string | null | undefined, today: string): string {
  return [dayLabel(date, today), time].filter(Boolean).join(', ');
}

/**
 * La fila de una liga en Ligas: si se está jugando ahora, «En juego hoy»; si juega hoy más tarde, «Hoy, 7:30 pm»; si
 * no, cuándo es lo próximo (o su horario si no hay nada en el calendario), y cuántos jugadores tiene. `extra` va al
 * final (Pro: «Pública»).
 */
export function leagueLine(opts: {
  live: boolean;
  next?: Pick<CalendarItem, 'date' | 'time'> | null;
  today: string;
  schedule?: string | null;
  people?: number | null;
  sport?: string | null;
  extra?: readonly (string | null | false | undefined)[];
}): RowLine {
  const { live, next, today } = opts;
  const lead = live ? 'En juego hoy' : next && next.date === today ? whenText(next.date, next.time, today) : null;
  const when = lead ? null : next ? whenText(next.date, next.time, today) : opts.schedule?.trim() || null;
  const who = opts.people && opts.people > 0 ? countLabel(opts.people, peopleWord(opts.sport)) : null;
  return { lead, rest: [when, who, ...(opts.extra ?? [])].filter(Boolean).join(' · ') };
}

/** Un torneo en «Tus torneos»: un torneo sin liga (su propia «liga») o un torneo dentro de una de mis ligas. */
export interface TourneyItem {
  key: string;
  name: string;
  href: string;
  lid: string;
  leagueName: string;
  sport: string;
  /** Torneo sin liga (la fila es la «liga» del torneo). */
  standalone: boolean;
  /** Su día (YYYY-MM-DD) y hora, si se saben. */
  date: string | null;
  time: string | null;
  eventId: string | null;
  /** Ya me inscribí. */
  going: boolean;
}

type TourneyLeague = { id: string; name: string; kind?: string | null; sport?: string | null };

/**
 * «Tus torneos»: los torneos sin liga en que estoy y los torneos que vienen en mis ligas (antes la Copa de la liga
 * salía en Próximos y «Mis torneos» decía que no había ninguno). Primero lo más pronto; los que no tienen fecha, al
 * final por nombre.
 */
export function tourneysOf(leagues: readonly TourneyLeague[], upcoming: readonly CalendarItem[], today: string): TourneyItem[] {
  const standalone = new Set(leagues.filter((l) => l.kind === 'torneo').map((l) => l.id));
  const out: TourneyItem[] = [];
  for (const l of leagues) {
    if (!standalone.has(l.id)) continue;
    const it = upcoming.find((u) => u.lid === l.id && u.date >= today);
    out.push({
      key: `t:${l.id}`,
      name: l.name,
      href: it?.eventId ? it.href : `/l/${l.id}`,
      lid: l.id,
      leagueName: l.name,
      sport: l.sport || 'bowling',
      standalone: true,
      date: it?.date ?? null,
      time: it?.time ?? null,
      eventId: it?.eventId ?? null,
      going: !!it?.going,
    });
  }
  for (const it of upcoming) {
    if (it.kind !== 'event' || it.type !== 'torneo' || !it.eventId || it.date < today || standalone.has(it.lid)) continue;
    if (!leagues.some((l) => l.id === it.lid)) continue;
    out.push({
      key: it.key,
      name: it.name,
      href: it.href,
      lid: it.lid,
      leagueName: it.leagueName,
      sport: it.sport,
      standalone: false,
      date: it.date,
      time: it.time,
      eventId: it.eventId,
      going: it.going,
    });
  }
  return out.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es');
    if (a.date) return -1;
    if (b.date) return 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

/**
 * La fila de un torneo: «En juego hoy» o «Hoy»; si no, su día («Sábado 24 oct») y cuántos inscritos tiene. `league`:
 * de qué liga es (si la cuenta tiene más de una); Pro agrega «ya te inscribiste».
 */
export function tourneyLine(
  t: Pick<TourneyItem, 'date' | 'time' | 'going' | 'leagueName' | 'standalone'>,
  opts: { today: string; live: boolean; entrants?: number | null; showLeague?: boolean; pro?: boolean },
): RowLine {
  const { today } = opts;
  const lead = opts.live ? 'En juego hoy' : t.date === today ? whenText(t.date, t.time, today) : null;
  const when = lead || !t.date ? null : t.date < today ? 'Ya se jugó' : dayLabel(t.date, today);
  const n = opts.entrants ?? 0;
  const who = n > 0 ? `${n} ${n === 1 ? 'inscrito' : 'inscritos'}` : null;
  const league = opts.showLeague && !t.standalone ? t.leagueName : null;
  const mine = opts.pro && t.going ? 'ya te inscribiste' : null;
  return { lead, rest: [when, who, league, mine].filter(Boolean).join(' · ') };
}

/** Valor del filtro de deporte de Ligas en el link: un deporte o «todos» (así se puede elegir Todos aunque la app esté en uno). */
export const ALL_SPORTS = 'todos';

/**
 * El deporte que filtra Ligas: solo si la cuenta juega más de uno, y solo el elegido en los chips (`?deporte=`). Sin
 * elegir, «Todos»: el deporte en que quedó la app (la última liga que se vio) no esconde ligas ni torneos.
 */
export function ligasSport(mySports: readonly string[], param: string | null): string | null {
  if (mySports.length < 2) return null;
  if (param === ALL_SPORTS) return null;
  return param && mySports.includes(param) ? param : null;
}

/** «Boliche y otros deportes» (la fila «Buscar ligas abiertas»): el deporte que juegas primero. */
export function openLeaguesSubtitle(mySports: readonly string[]): string {
  if (mySports.length !== 1) return 'De todos los deportes';
  return `${sportMeta(mySports[0])?.label ?? 'Tu deporte'} y otros deportes`;
}
