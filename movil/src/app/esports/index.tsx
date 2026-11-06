import { EsportsIndex } from '@/components/esports/EsportsIndex';
import { Screen } from '@/components/ui';

/** Esports (`/esports`, EsportsHomePage de la web): mis torneos, mis equipos, los juegos y Mi ID de juego. */
export default function EsportsScreen() {
  return (
    <Screen>
      <EsportsIndex />
    </Screen>
  );
}
