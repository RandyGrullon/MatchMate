import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { compareMatches, type Match } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { Empty } from '../ui';
import { MatchCard } from './MatchCard';
import { dayKey, roundLabel } from './format';

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

/**
 * Calendario de partidos por ronda o jornada (o por día), con una tarjeta por partido. `renderMatch` cambia la
 * tarjeta; `linkOf` le da link a cada una.
 */
export function ScheduleList({
  matches,
  groupBy = 'round',
  roundWord = 'Ronda',
  tz,
  mySide,
  linkOf,
  renderMatch,
  empty = 'Todavía no hay partidos.',
  now,
}: {
  matches: readonly Match[];
  groupBy?: 'round' | 'date';
  roundWord?: string;
  tz?: string;
  /** Mi lado en cada partido (para resaltarlo). */
  mySide?: (m: Match) => Side | null;
  linkOf?: (m: Match) => string;
  renderMatch?: (m: Match) => ReactNode;
  empty?: ReactNode;
  now?: number;
}) {
  if (!matches.length) return <Empty icon={<CalendarDays className="size-8" />} title="Sin partidos">{empty}</Empty>;
  const groups = groupSchedule(matches, groupBy, { roundWord, tz });
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <h3 className="px-1 text-sm font-semibold capitalize text-muted">{g.title}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.matches.map((m) =>
              renderMatch ? (
                <div key={m.id}>{renderMatch(m)}</div>
              ) : (
                <MatchCard key={m.id} match={m} to={linkOf?.(m)} mySide={mySide?.(m) ?? null} roundWord={roundWord} tz={tz} now={now} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
