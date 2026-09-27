import { Shirt } from 'lucide-react';
import type { SportScreens } from '../../../sports/screens';
import BasketballAdmin from './BasketballAdmin';
import BasketballEvent from './BasketballEvent';
import BasketballGames from './BasketballGames';
import BasketballHome from './BasketballHome';
import { BasketballMyProfile, BasketballPlayer } from './BasketballProfile';
import BasketballStandings from './BasketballStandings';

/**
 * Pantallas del baloncesto (fase 4): equipos de temporada con plantilla, calendario entre equipos con convocatoria,
 * mesa anotadora en el teléfono (con anotador designado), tabla FIBA, anotadores y perfil. Las piezas de equipos
 * (plantillas, calendario, convocatoria, presentes, mesa) están en ../team y las reutiliza el fútbol.
 */
const screens: SportScreens = {
  Home: BasketballHome,
  Event: BasketballEvent,
  Feed: BasketballGames,
  Standings: BasketballStandings,
  MyProfile: BasketballMyProfile,
  Player: BasketballPlayer,
  adminTabs: [{ key: 'equipos', label: 'Equipos', icon: Shirt, Component: BasketballAdmin }],
  tabs: { home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mi equipo' },
};

export default screens;
