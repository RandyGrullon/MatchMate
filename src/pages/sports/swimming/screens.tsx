import { Shield, Users } from 'lucide-react';
import { SWIM_ADMIN_TABS } from '../../../sports/adminTabs';
import type { SportScreens } from '../../../sports/screens';
import { ClubsAdmin } from './ClubsAdmin';
import MeetPage from './MeetPage';
import { SwimMyProfile, SwimPlayer } from './ProfilePage';
import SwimStandings from './StandingsPage';
import { useSwimSeasonTable } from './seasonTable';
import SwimHome from './SwimHome';
import { SwimmersAdmin } from './SwimmersAdmin';

/**
 * Natación (Fase 7): encuentros de club con finales por tiempo, cronometraje por serie en el teléfono, puntos por
 * club y marcas personales. Los nadadores menores no tienen cuenta: los registran el admin o el entrenador.
 */
const screens: SportScreens = {
  Home: SwimHome,
  Event: () => <MeetPage />,
  Standings: SwimStandings,
  MyProfile: SwimMyProfile,
  Player: SwimPlayer,
  useSeasonTable: useSwimSeasonTable,
  adminTabs: [
    { ...SWIM_ADMIN_TABS[0], icon: Users, Component: SwimmersAdmin },
    { ...SWIM_ADMIN_TABS[1], icon: Shield, Component: ClubsAdmin },
  ],
  tabs: { home: 'Encuentros', feed: null, standings: 'Puntos', profile: 'Mis marcas' },
};

export default screens;
