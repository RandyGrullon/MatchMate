import { useLocalSearchParams } from 'expo-router';
import { GameHub } from '@/components/esports/GameHub';
import { Screen } from '@/components/ui';

/** La página de un juego (`/esports/<juego>`, GameHubPage de la web): sus torneos y sus equipos. */
export default function GameHubRoute() {
  const { game = '' } = useLocalSearchParams<{ game: string }>();
  return (
    <Screen>
      <GameHub game={game} />
    </Screen>
  );
}
