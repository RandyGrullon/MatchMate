import { GameIdsScreen } from '@/components/esports/GameIds';
import { Screen } from '@/components/ui';

/** Mi ID de juego (`/esports/mi-id`, GameIdsPage de la web). `?juego=`, `&plataforma=` y `&volver=` como la web. */
export default function GameIdsRoute() {
  return (
    <Screen>
      <GameIdsScreen />
    </Screen>
  );
}
