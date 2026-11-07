import { EsportsIndex } from '@/components/esports/EsportsIndex';
import { Screen } from '@/components/ui';
import { SportColors } from '@/theme/theme';

/** Esports (`/esports`, EsportsHomePage de la web): mis torneos, mis equipos, los juegos y Mi ID de juego. */
export default function EsportsScreen() {
  return (
    <SportColors sport="esports">
      <Screen>
        <EsportsIndex />
      </Screen>
    </SportColors>
  );
}
