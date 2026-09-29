/**
 * Lo que no es pantalla de Eventos (se prueba sin navegador): mis ligas y mis torneos por separado (lo más pronto
 * primero), las públicas para unirme, lo que viene agrupado por día y los textos que enseñan cuando no hay nada.
 */
import { dayLabel, type CalendarItem } from '../../lib/calendar';
import { inSport } from '../../lib/sportContext';
import { sportMeta, sportsOf } from '../../sports/registry';
import { itemTime } from '../home/logic';

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
  return `Todavía no hay ligas ni torneos públicos${ofSport(opts.sport)}. Crea el primero con el botón «Crear».`;
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
