import { GameIdsScreen } from '@/components/esports/GameIds';
import { Screen } from '@/components/ui';
import { SportColors } from '@/theme/theme';

/** Mi ID de juego (`/esports/mi-id`, GameIdsPage de la web). `?juego=`, `&plataforma=` y `&volver=` como la web. */
export default function GameIdsRoute() {
  return (
    <SportColors sport="esports">
      <Screen>
        <GameIdsScreen />
      </Screen>
    </SportColors>
  );
}
