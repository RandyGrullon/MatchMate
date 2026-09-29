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
import { TournamentHub } from '../team/TournamentHub';
import { useKoEvent, type KoEvent } from '../team/TeamPrizes';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { FOOTBALL_POSITIONS } from './bits';
import { FootballMatchCard } from './FootballGames';
import { footballConfigFrom, knockoutRules, matchMinutes, variantOf } from './rules';
import { groupRanking, useFootballSeason } from './season';

/**
 * Un evento de la liga de fútbol o sala (/l/:lid/e/:eventId): la jornada con sus partidos, en vivo. Los partidos de
 * la liga normalmente van sueltos por jornada (Calendario); esto sirve para una jornada especial. En el «torneo sin
 * liga» (el relámpago, lo más usado en el fútbol de barrio) es la pantalla del torneo: equipos, armar grupos y
 * eliminatoria (con penales si empatan), partidos por fase y pasar a la fase final.
 */
export default function FootballEvent() {
  const { eventId } = useParams();
  const tl = useTeamLeague();
  const event = useEvent(tl.lid, eventId);
  const matches = useMatches({ lid: tl.lid, eventId });
  const now = useNow(30_000).getTime();
  const e = event.data;
  const koEvent = useKoEvent(tl);
  if (tl.league.kind === 'torneo') return <FootballTournament tl={tl} title={e?.name || tl.league.name} date={e?.date} announcement={e?.announcement} event={koEvent} />;
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
        <ScheduleList matches={matches.data} groupBy="round" roundWord="Jornada" tz={tl.tz} now={now} renderMatch={(m) => <FootballMatchCard tl={tl} match={m} now={now} />} />
      )}
    </div>
  );
}

function FootballTournament({ tl, title, date, announcement, event }: { tl: TeamLeague; title: string; date?: string; announcement?: string | null; event: KoEvent | null }) {
  const now = useNow(30_000).getTime();
  const season = useFootballSeason(tl);
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const rankGroup = useCallback((stage: string) => groupRanking(season, tl.matches.data, stage, now), [season, tl.matches.data, now]);
  return (
    <TournamentHub
      tl={tl}
      event={event}
      title={title}
      date={date}
      announcement={announcement}
      format={variant}
      slotMinutes={matchMinutes(config) - 5}
      knockoutRules={knockoutRules(tl.rules.data, variant)}
      positions={FOOTBALL_POSITIONS}
      rankGroup={rankGroup}
      renderMatch={(m) => <FootballMatchCard tl={tl} match={m} now={now} />}
    />
  );
}
