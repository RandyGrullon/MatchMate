import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { squadTags } from '@mm/lib/data/squads';
import { SquadScreen } from '@/components/squads/SquadScreen';
import { Screen } from '@/components/ui';

/** Un equipo (`/equipos/<id>`, SquadPage de la web). `?tab=`, `?jugador=` y `?invitar=1` como en la web. */
export default function SquadRoute() {
  const { squadId = '' } = useLocalSearchParams<{ squadId: string }>();
  return (
    <Screen onRefresh={() => invalidate(squadTags.squad(squadId))}>
      <SquadScreen key={squadId} squadId={squadId} />
    </Screen>
  );
}
