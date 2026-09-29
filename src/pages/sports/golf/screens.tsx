import { LandPlot } from 'lucide-react';
import type { SportScreens } from '../../../sports/screens';
import GolfAdmin from './GolfAdmin';
import GolfEvent from './GolfEvent';
import GolfHome from './GolfHome';
import { GolfMyProfile, GolfPlayerPage } from './GolfProfile';
import GolfStandings from './GolfStandings';
import { useGolfSeasonTable } from './seasonTable';

/**
 * Pantallas del golf (fase 6): rondas y torneos de club con tarjeta por grupo, leaderboard en vivo (bruto,
 * neto y Stableford), orden de mérito y estadísticas. Sin foto ni lectura con IA (eso es solo del boliche).
 */
const screens: SportScreens = {
  Home: GolfHome,
  Event: () => <GolfEvent />,
  Standings: GolfStandings,
  MyProfile: GolfMyProfile,
  Player: GolfPlayerPage,
  useSeasonTable: useGolfSeasonTable,
  adminTabs: [{ key: 'campos', label: 'Campos', icon: LandPlot, Component: GolfAdmin }],
  tabs: { home: 'Rondas', feed: null, standings: 'Orden de mérito', profile: 'Mi golf' },
};

export default screens;
