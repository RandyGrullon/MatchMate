import type { ComponentType } from 'react';
import { Users } from 'lucide-react';
import type { SportScreens } from '../../../sports/screens';
import { defaultRules, type RacketSport } from '../../../sports/racket';
import PairsAdmin from './admin/PairsAdmin';
import RacketEventPage from './EventPage';
import RacketFeed from './Feed';
import RacketHome from './Home';
import { RacketMyProfile, RacketPlayerPage } from './Profile';
import { useRacketSeasonTable } from './seasonTable';
import { RacketProvider, type RacketExtensions } from './sport';
import RacketStandings from './Standings';

/**
 * Pantallas compartidas de raqueta. Cada deporte las usa con el suyo desde su `screens.tsx`:
 *   export default racketScreens('padel');
 *   export default racketScreens('tennis', { templates: [...], eventPage: ... });   // lo que agrega el deporte
 * (Este archivo no se llama screens.tsx a propósito: la app busca `src/pages/sports/<deporte>/screens.tsx`.)
 */
export function racketScreens(sport: RacketSport, ext?: RacketExtensions): SportScreens {
  const wrap = (C: ComponentType) => {
    const W = () => (
      <RacketProvider sport={sport} ext={ext}>
        <C />
      </RacketProvider>
    );
    W.displayName = `${sport}:${C.displayName ?? C.name ?? 'pantalla'}`;
    return W;
  };
  // Parejas en pádel y en los deportes que juegan en dobles por defecto (pickleball); tenis y ping pong, jugadores.
  const doubles = defaultRules(sport).doubles || sport === 'padel';
  const extras = ext ?? {};
  return {
    Home: wrap(RacketHome),
    Event: wrap(() => <RacketEventPage />),
    Standings: wrap(RacketStandings),
    Feed: wrap(RacketFeed),
    MyProfile: wrap(RacketMyProfile),
    Player: wrap(RacketPlayerPage),
    // Admin › Temporada: la tabla para cerrarla (fuera de RacketProvider: recibe el deporte).
    useSeasonTable: (season) => useRacketSeasonTable(season, sport, extras),
    adminTabs: [{ key: 'parejas', label: doubles ? 'Parejas y niveles' : 'Jugadores y niveles', icon: Users, Component: wrap(PairsAdmin) }],
    tabs: { home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mis partidos' },
  };
}
