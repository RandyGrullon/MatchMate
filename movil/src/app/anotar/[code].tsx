import { useLocalSearchParams } from 'expo-router';
import { ScorerJoinScreen } from '@/components/scorers/ScorerJoin';
import { Screen } from '@/components/ui';

/** El link para anotar (`/anotar/<código>`, ScorerJoinPage de la web): aceptar ser anotador con el código. */
export default function ScorerJoinRoute() {
  const { code = '', entrar } = useLocalSearchParams<{ code: string; entrar?: string }>();
  return (
    <Screen>
      <ScorerJoinScreen code={code} wantsEnter={entrar === '1'} />
    </Screen>
  );
}
