/**
 * Cerrar o corregir una temporada con la tabla de su deporte, la misma que la web le pasa a CloseSeasonModal: el
 * boliche, la suya (src/components/season/bowlingTable.ts); golf, natación, baloncesto y fútbol (también sala), la de
 * su `screens.tsx` (`useSeasonTable` de src/pages/sports/<deporte>/seasonTable.ts); los demás (esports), sin tabla
 * (`noSeasonTable`). Raqueta (pádel, tenis, pickleball y ping pong), la de racketScreens (`useRacketSeasonTable` de
 * src/pages/sports/racket/seasonTable.ts) con lo puro que agrega cada deporte (las cajas, el «Round robin» del
 * pickleball: src/pages/sports/racket/extensions.ts).
 */
import type { Season } from '@mm/lib/seasons';
import type { RacketSport } from '@mm/sports/racket';
import { sportMeta } from '@mm/sports/registry';
import { useBowlingSeasonTable } from '@mm/components/season/bowlingTable';
import { noSeasonTable } from '@mm/components/season/adminLogic';
import { useBasketballSeasonTable } from '@mm/pages/sports/basketball/seasonTable';
import { useFootballSeasonTable } from '@mm/pages/sports/football/seasonTable';
import { useGolfSeasonTable } from '@mm/pages/sports/golf/seasonTable';
import { useSwimSeasonTable } from '@mm/pages/sports/swimming/seasonTable';
import { racketPureExt } from '@mm/pages/sports/racket/extensions';
import { useRacketSeasonTable } from '@mm/pages/sports/racket/seasonTable';
import { CloseSeasonSheet } from './CloseSeasonSheet';

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

function RacketClose({ season, onClose, sport }: Props & { sport: RacketSport }) {
  const table = useRacketSeasonTable(season, sport, racketPureExt(sport));
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

function NoTableClose({ season, onClose }: Props) {
  const table = noSeasonTable(season);
  return <CloseSeasonSheet season={season} table={table} onClose={onClose} />;
}

/** La hoja de cerrar (o corregir) esa temporada con la tabla del deporte. Va dentro de LeagueScope. */
export function CloseSeason({ sport, season, onClose }: Props & { sport: string }) {
  if (sportMeta(sport)?.family === 'racket') return <RacketClose season={season} onClose={onClose} sport={sport as RacketSport} />;
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
