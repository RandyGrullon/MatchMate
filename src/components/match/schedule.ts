import { compareMatches, type Match } from '../../lib/data/matches';
import { dayKey, roundLabel } from './format';

/** Calendario de partidos agrupado (ScheduleList.tsx en la web y las listas de la app del teléfono). */

export interface ScheduleGroup {
  key: string;
  title: string;
  matches: Match[];
}

const dayTitle = (key: string, tz: string) =>
  new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(`${key}T12:00:00Z`));

/** Agrupa por ronda o jornada («Jornada 3») o por día; lo que no tiene, al final («Sin jornada», «Sin fecha»). */
export function groupSchedule(matches: readonly Match[], by: 'round' | 'date', opts: { roundWord?: string; tz?: string } = {}): ScheduleGroup[] {
  const tz = opts.tz ?? 'America/Santo_Domingo';
  const groups = new Map<string, ScheduleGroup>();
  const sorted = [...matches].sort(compareMatches);
  for (const m of sorted) {
    let key: string;
    let title: string;
    if (by === 'round') {
      key = m.round == null ? '~' : String(m.round).padStart(4, '0');
      title = m.round == null ? `Sin ${(opts.roundWord ?? 'ronda').toLowerCase()}` : roundLabel(m.round, opts.roundWord);
    } else {
      const d = dayKey(m.scheduledAt, tz);
      key = d ?? '~';
      title = d ? dayTitle(d, tz) : 'Sin fecha';
    }
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, title, matches: [] }));
    g.matches.push(m);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
