import { useLocalSearchParams } from 'expo-router';
import { CreateTournament } from '@/components/esports/CreateTournament';
import { SportColors } from '@/theme/theme';

/**
 * Crear un torneo de esports (`/esports/<juego>/nuevo-torneo`, CreateTournamentPage de la web), a pantalla completa.
 * `?liga=<liga>` lo crea dentro de esa liga de esports.
 */
export default function CreateTournamentRoute() {
  const { game = '' } = useLocalSearchParams<{ game: string }>();
  return (
    <SportColors sport="esports">
      <CreateTournament game={game} />
    </SportColors>
  );
}
