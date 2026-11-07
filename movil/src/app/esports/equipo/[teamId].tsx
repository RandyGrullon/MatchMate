import { useLocalSearchParams } from 'expo-router';
import { TeamScreen } from '@/components/esports/Team';
import { Screen } from '@/components/ui';
import { SportColors } from '@/theme/theme';

/** Un equipo de esports (`/esports/equipo/<id>`, TeamPage de la web). `?invitar=1` abre «Invitar al equipo». */
export default function TeamRoute() {
  const { teamId = '' } = useLocalSearchParams<{ teamId: string }>();
  return (
    <SportColors sport="esports">
      <Screen>
        <TeamScreen key={teamId} teamId={teamId} />
      </Screen>
    </SportColors>
  );
}
