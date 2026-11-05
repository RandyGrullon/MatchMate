import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Match } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { Empty } from '../ui';
import { MatchCard } from './MatchCard';
import { groupSchedule, type ScheduleGroup } from './schedule';

// La agrupación está en schedule.ts (sin React: la usa también la app del teléfono).
export { groupSchedule, type ScheduleGroup };

/**
 * Calendario de partidos por ronda o jornada (o por día): el título de cada una («Jornada 3») y una tarjeta por partido. `renderMatch` cambia la
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
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2.5">
          <h3 className="mx-1 text-[17px] font-[650] tracking-[-0.01em] first-letter:uppercase">{g.title}</h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {g.matches.map((m) =>
              renderMatch ? (
                <div key={m.id} className="min-w-0">
                  {renderMatch(m)}
                </div>
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
