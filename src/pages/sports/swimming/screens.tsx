import { Shield, Users } from 'lucide-react';
import type { SportScreens } from '../../../sports/screens';
import { ClubsAdmin } from './ClubsAdmin';
import MeetPage from './MeetPage';
import { SwimMyProfile, SwimPlayer } from './ProfilePage';
import SwimStandings from './StandingsPage';
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
  adminTabs: [
    { key: 'nadadores', label: 'Nadadores', icon: Users, Component: SwimmersAdmin },
    { key: 'clubes', label: 'Clubes', icon: Shield, Component: ClubsAdmin },
  ],
  tabs: { home: 'Encuentros', feed: null, standings: 'Puntos', profile: 'Mis marcas' },
};

export default screens;
