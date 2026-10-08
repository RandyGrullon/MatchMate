import { useCallback } from 'react';
import { useParams } from 'react-router';
import { useEvent } from '../../../lib/data';
import { useMatches } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { finishedGroupRanking } from '../team/tournament';
import { LeagueEventView } from '../team/EventView';
import { TournamentHub } from '../team/TournamentHub';
import { useKoEvent, type KoEvent } from '../team/TeamPrizes';
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
  const koEvent = useKoEvent(tl);
  if (tl.league.kind === 'torneo') return <BasketballTournament tl={tl} title={e?.name || tl.league.name} date={e?.date} announcement={e?.announcement} event={koEvent} />;
  return <LeagueEventView tl={tl} event={e ?? null} matches={matches.data} loading={matches.loading} renderMatch={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />} />;
}

function BasketballTournament({ tl, title, date, announcement, event }: { tl: TeamLeague; title: string; date?: string; announcement?: string | null; event: KoEvent | null }) {
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
      event={event}
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
