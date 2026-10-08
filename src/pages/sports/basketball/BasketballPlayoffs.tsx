import { PlayoffsPage } from '../team/PlayoffsPage';
import { useTeamLeague } from '../team/useTeamLeague';
import { useBasketballSeason } from './season';

/** Playoffs del baloncesto (/l/:lid/playoffs): la llave y sus series, sembradas con la tabla FIBA de la temporada. */
export default function BasketballPlayoffs() {
  const tl = useTeamLeague();
  const season = useBasketballSeason(tl);
  return <PlayoffsPage tl={tl} tableIds={season.standings.map((r) => r.id)} />;
}
