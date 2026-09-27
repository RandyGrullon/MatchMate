import { Shirt } from 'lucide-react';
import type { SportScreens } from '../../../sports/screens';
import FootballAdmin from './FootballAdmin';
import FootballEvent from './FootballEvent';
import FootballGames from './FootballGames';
import FootballHome from './FootballHome';
import { FootballMyProfile, FootballPlayer } from './FootballProfile';
import FootballStandings from './FootballStandings';

/**
 * Pantallas del fútbol de campo (fase 5). El fútbol sala usa estas mismas (src/pages/sports/futsal/screens.tsx las
 * reexporta): cada liga es de una sola modalidad (la base no deja mezclar reglas) y cada pantalla lee la variante del
 * deporte de la liga, así las estadísticas de campo y de sala nunca se mezclan.
 *
 * Reutiliza las piezas de equipos de ../team (plantillas, calendario, convocatoria, anotador de mesa, torneo
 * relámpago) y el modo cancha (src/court) con el motor de src/sports/team/football.ts: acta digital con reloj por
 * tiempo, goles, tarjetas, cambios, portero, faltas acumuladas y penales. Tabla 3-1-0 con desempates configurables,
 * goleadores, tarjetas, vallas invictas y suspensiones automáticas.
 */
const screens: SportScreens = {
  Home: FootballHome,
  Event: FootballEvent,
  Feed: FootballGames,
  Standings: FootballStandings,
  MyProfile: FootballMyProfile,
  Player: FootballPlayer,
  adminTabs: [{ key: 'equipos', label: 'Equipos', icon: Shirt, Component: FootballAdmin }],
  tabs: { home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mi equipo' },
};

export default screens;
