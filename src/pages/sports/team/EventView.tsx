import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { BowlingEvent } from '../../../lib/types';
import type { Match } from '../../../lib/data/matches';
import { formatDateLong } from '../../../lib/format';
import { groupSchedule } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Card, ListSkeleton, SectionHeader, cx } from '../../../components/ui';
import { HistoryBackBar } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';

/**
 * Un evento de una liga de equipos (/l/:lid/e/:eventId), rediseño «Calma y foco»: «‹ Liga» (vuelve a donde estaba), el
 * nombre de la jornada, el día y el aviso del admin, y sus partidos por jornada. Los partidos de la liga normalmente van
 * sueltos por jornada (el inicio de la liga); esto sirve para una jornada especial.
 */
export function LeagueEventView({
  tl,
  event,
  matches,
  loading,
  renderMatch,
}: {
  tl: TeamLeague;
  event: Pick<BowlingEvent, 'name' | 'date' | 'announcement'> | null;
  matches: readonly Match[];
  loading: boolean;
  renderMatch: (m: Match) => ReactNode;
}) {
  const pro = useIsPro();
  const groups = useMemo(() => groupSchedule(matches, 'round', { roundWord: 'Jornada', tz: tl.tz }), [matches, tl.tz]);
  return (
    <div className="flex flex-col px-2">
      <HistoryBackBar label={tl.league.name} fallback={tl.base} />
      <h1 className={cx('break-words', pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title')}>{event?.name || 'Jornada'}</h1>
      {event?.date && <p className={cx('text-meta text-muted first-letter:uppercase', pro ? 'mt-1' : 'mt-1.5')}>{formatDateLong(event.date)}</p>}
      {event?.announcement && <p className="mt-2 text-body whitespace-pre-line text-fg-2">{event.announcement}</p>}
      {loading && !matches.length ? (
        <div className="mt-[22px]">
          <ListSkeleton rows={3} />
        </div>
      ) : !matches.length ? (
        <Card className="mt-[22px] px-5 py-[18px]">
          <p className="font-semibold">Sin partidos en este evento</p>
          <p className="mt-0.5 text-meta text-muted">
            Los partidos de la liga están en su{' '}
            <Link to={tl.base} className="font-[550] text-accent">
              inicio
            </Link>
            .
          </p>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title} className="mt-[26px]">
            <SectionHeader title={<span className="first-letter:uppercase">{g.title}</span>} />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {g.matches.map((m) => (
                <div key={m.id} className="min-w-0">
                  {renderMatch(m)}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
