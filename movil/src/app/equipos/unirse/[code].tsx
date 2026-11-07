import { useLocalSearchParams } from 'expo-router';
import { JoinSquadScreen } from '@/components/squads/JoinSquad';
import { Screen } from '@/components/ui';

/** Entrar a un equipo con su link o su QR (`/equipos/unirse/<código>`, JoinSquadPage de la web). */
export default function JoinSquadRoute() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  return (
    <Screen>
      <JoinSquadScreen code={code} />
    </Screen>
  );
}
