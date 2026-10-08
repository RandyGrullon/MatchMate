import type { SportScreens } from '../../../sports/screens';
import EsportsLeagueHome, { EsportsEventPage } from './LeagueHome';
import EsportsMatchesPage from './MatchesPage';
import EsportsMyPage from './MyPage';
import EsportsStandingsPage from './StandingsPage';

/**
 * Pantallas de las ligas y torneos de esports (docs/esports.md §12.8). La app las encuentra sola por la carpeta
 * (src/sports/screens.tsx): `/l/:lid` (la página del torneo en un torneo suelto, o los torneos de una liga de esports),
 * `/l/:lid/e/:eventId` (un torneo), `/l/:lid/juegos` (todas las series), `/l/:lid/ranking` (tablas de grupos, de todos
 * contra todos o de battle royale) y `/l/:lid/perfil` (mis inscripciones y mis series).
 */
const screens: SportScreens = {
  Home: EsportsLeagueHome,
  Event: EsportsEventPage,
  Feed: EsportsMatchesPage,
  Standings: EsportsStandingsPage,
  MyProfile: EsportsMyPage,
  tabs: { home: 'Torneo', feed: 'Partidos', standings: 'Tabla', profile: 'Lo mío' },
};

export default screens;
