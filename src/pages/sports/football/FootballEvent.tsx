import { useParams } from 'react-router';
import { CalendarDays } from 'lucide-react';
import { useEvent } from '../../../lib/data';
import { useMatches } from '../../../lib/data/matches';
import { formatDateLong } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import { ScheduleList } from '../../../components/match';
import { BackLink } from '../../../components/BackLink';
import { Empty, ListSkeleton } from '../../../components/ui';
import { useTeamLeague } from '../team/useTeamLeague';
import { FootballMatchCard } from './FootballGames';

/**
 * Un evento de la liga de fútbol o sala (/l/:lid/e/:eventId): la jornada o el torneo con sus partidos, en vivo. Los
 * partidos de la liga normalmente van sueltos por jornada (Calendario); esto sirve para una jornada especial.
 */
export default function FootballEvent() {
  const { eventId } = useParams();
  const tl = useTeamLeague();
  const event = useEvent(tl.lid, eventId);
  const matches = useMatches({ lid: tl.lid, eventId });
  const now = useNow(30_000).getTime();
  const e = event.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <BackLink fallback={tl.base} label="Calendario" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{e?.name || 'Jornada'}</h1>
          {e?.date && <p className="text-sm capitalize text-muted">{formatDateLong(e.date)}</p>}
          {e?.announcement && <p className="mt-2 text-sm">{e.announcement}</p>}
        </div>
      </div>
      {matches.loading && !matches.data.length ? (
        <ListSkeleton rows={3} />
      ) : !matches.data.length ? (
        <Empty icon={<CalendarDays className="size-8" />} title="Sin partidos en este evento">
          Los partidos de la liga están en el Calendario.
        </Empty>
      ) : (
        <ScheduleList matches={matches.data} groupBy="round" roundWord="Jornada" tz={tl.tz} now={now} renderMatch={(m) => <FootballMatchCard tl={tl} match={m} now={now} />} />
      )}
    </div>
  );
}
