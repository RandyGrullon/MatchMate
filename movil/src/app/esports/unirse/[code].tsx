import { useLocalSearchParams } from 'expo-router';
import { JoinTeamScreen } from '@/components/esports/Team';
import { Screen } from '@/components/ui';

/** Entrar a un equipo con su link o su QR (`/esports/unirse/<código>`, JoinTeamPage de la web). */
export default function JoinTeamRoute() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  return (
    <Screen>
      <JoinTeamScreen code={code} />
    </Screen>
  );
}
