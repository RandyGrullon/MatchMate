import { useLocalSearchParams } from 'expo-router';
import { GameHub } from '@/components/esports/GameHub';
import { Screen } from '@/components/ui';
import { SportColors } from '@/theme/theme';

/** La página de un juego (`/esports/<juego>`, GameHubPage de la web): sus torneos y sus equipos. */
export default function GameHubRoute() {
  const { game = '' } = useLocalSearchParams<{ game: string }>();
  return (
    <SportColors sport="esports">
      <Screen>
        <GameHub game={game} />
      </Screen>
    </SportColors>
  );
}
