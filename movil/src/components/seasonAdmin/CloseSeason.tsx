/**
 * Cerrar o corregir una temporada con la tabla de su deporte, la misma que la web le pasa a CloseSeasonModal: el
 * boliche, la suya (src/components/season/bowlingTable.ts); golf, natación, baloncesto y fútbol (también sala), la de
 * su `screens.tsx` (`useSeasonTable` de src/pages/sports/<deporte>/seasonTable.ts); los demás (esports), sin tabla
 * (`noSeasonTable`). Raqueta arma su tabla con lo que cada deporte agrega en su `screens.tsx` (las noches del
 * pickleball, los formatos del pádel), que la app no tiene: se cierra en la web (`closesOnPhone`).
 */
import type { Season } from '@mm/lib/seasons';
import { sportMeta } from '@mm/sports/registry';
import { useBowlingSeasonTable } from '@mm/components/season/bowlingTable';
import { noSeasonTable } from '@mm/components/season/adminLogic';
import { useBasketballSeasonTable } from '@mm/pages/sports/basketball/seasonTable';
import { useFootballSeasonTable } from '@mm/pages/sports/football/seasonTable';
import { useGolfSeasonTable } from '@mm/pages/sports/golf/seasonTable';
import { useSwimSeasonTable } from '@mm/pages/sports/swimming/seasonTable';
import { CloseSeasonSheet } from './CloseSeasonSheet';

/** El deporte cierra sus temporadas en el teléfono (raqueta, en la web). */
export const closesOnPhone = (sport: string): boolean => sportMeta(sport)?.family !== 'racket';

interface Props {
  season: Season;
  onClose: () => void;
}

function BowlingClose({ season, onClose }: Props) {
  const table = useBowlingSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

function GolfClose({ season, onClose }: Props) {
  const table = useGolfSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

function SwimClose({ season, onClose }: Props) {
  const table = useSwimSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

function BasketballClose({ season, onClose }: Props) {
  const table = useBasketballSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

function FootballClose({ season, onClose }: Props) {
  const table = useFootballSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

function NoTableClose({ season, onClose }: Props) {
  const table = noSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

/** La hoja de cerrar (o corregir) esa temporada con la tabla del deporte. Va dentro de LeagueScope. */
export function CloseSeason({ sport, season, onClose }: Props & { sport: string }) {
  switch (sport) {
    case 'bowling':
      return <BowlingClose season={season} onClose={onClose} />;
    case 'golf':
      return <GolfClose season={season} onClose={onClose} />;
    case 'swimming':
      return <SwimClose season={season} onClose={onClose} />;
    case 'basketball':
      return <BasketballClose season={season} onClose={onClose} />;
    case 'football':
    case 'futsal':
      return <FootballClose season={season} onClose={onClose} />;
    default:
      return <NoTableClose season={season} onClose={onClose} />;
  }
}
