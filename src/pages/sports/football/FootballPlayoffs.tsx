import { PlayoffsPage } from '../team/PlayoffsPage';
import { useTeamLeague } from '../team/useTeamLeague';
import { FootballMatchCard } from './FootballGames';
import { useFootballSeason } from './season';

/** Playoffs del fútbol y la sala (/l/:lid/playoffs): la llave y sus series, sembradas con la tabla de la temporada. */
export default function FootballPlayoffs() {
  const tl = useTeamLeague();
  const season = useFootballSeason(tl);
  return <PlayoffsPage tl={tl} tableIds={season.standings.map((r) => r.id)} renderMatch={(m) => <FootballMatchCard tl={tl} match={m} />} />;
}
