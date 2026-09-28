import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { CalendarDays } from 'lucide-react';
import { useEvent } from '../../../lib/data';
import { useMatches } from '../../../lib/data/matches';
import { formatDateLong } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import { ScheduleList } from '../../../components/match';
import { BackLink } from '../../../components/BackLink';
import { Empty, ListSkeleton } from '../../../components/ui';
import { finishedGroupRanking } from '../team/tournament';
import { TournamentHub } from '../team/TournamentHub';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { BasketballMatchCard } from './BasketballGames';
import { BASKETBALL_POSITIONS } from './bits';
import { basketballConfigFrom } from './rules';
import { basketballSeason } from './season';

/**
 * Un evento de la liga de baloncesto (/l/:lid/e/:eventId): la jornada con sus partidos, en vivo. Los partidos de
 * la liga normalmente van sueltos por jornada (Calendario); esto sirve para una jornada especial. En el «torneo sin
 * liga» es la pantalla del torneo relámpago: equipos, armar grupos y eliminatoria, partidos por fase y pasar a la
 * fase final.
 */
export default function BasketballEvent() {
  const { eventId } = useParams();
  const tl = useTeamLeague();
  const event = useEvent(tl.lid, eventId);
  const matches = useMatches({ lid: tl.lid, eventId });
  const now = useNow(30_000).getTime();
  const e = event.data;
  if (tl.league.kind === 'torneo') return <BasketballTournament tl={tl} title={e?.name || tl.league.name} date={e?.date} announcement={e?.announcement} />;
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
          Los partidos de la liga están en el{' '}
          <Link to={tl.base} className="font-medium text-accent">
            Calendario
          </Link>
          .
        </Empty>
      ) : (
        <ScheduleList matches={matches.data} groupBy="round" roundWord="Jornada" tz={tl.tz} now={now} renderMatch={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />} />
      )}
    </div>
  );
}

function BasketballTournament({ tl, title, date, announcement }: { tl: TeamLeague; title: string; date?: string; announcement?: string | null }) {
  const now = useNow(30_000).getTime();
  const config = basketballConfigFrom(tl.rules.data);
  // Tabla FIBA de cada grupo (solo con sus partidos) cuando el grupo terminó.
  const rankGroup = useCallback(
    (stage: string) => finishedGroupRanking(tl.matches.data, stage, now, (ms, ids) => basketballSeason(ms, ids, tl.rules.data, now).standings.map((r) => r.id)),
    [tl.matches.data, tl.rules.data, now],
  );
  return (
    <TournamentHub
      tl={tl}
      title={title}
      date={date}
      announcement={announcement}
      format={config.variant === '3x3' ? '3x3' : 'fiba'}
      slotMinutes={config.variant === '3x3' ? 20 : 50}
      positions={BASKETBALL_POSITIONS}
      rankGroup={rankGroup}
      renderMatch={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />}
    />
  );
}
