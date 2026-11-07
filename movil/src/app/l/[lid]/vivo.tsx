import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { streamTags } from '@mm/lib/data/streams';
import { useLeagueCtx } from '@mm/lib/league';
import { LeagueScope } from '@/components/league/LeagueScope';
import { LiveScreen } from '@/components/live/LiveScreen';
import { BackBar, Screen } from '@/components/ui';

/**
 * En vivo de la liga (`/l/<liga>/vivo`, LiveStreamPage de la web; es el link que se comparte y el del aviso): `?s=`
 * elige la transmisión. Se llega desde Ajustes › «Ir a En vivo».
 */
export default function LiveRoute() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <LiveBody />
    </LeagueScope>
  );
}

function LiveBody() {
  const { lid, league } = useLeagueCtx();
  const { s } = useLocalSearchParams<{ s?: string }>();
  return (
    <Screen onRefresh={() => invalidate(streamTags.league(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      <LiveScreen wanted={s ?? null} />
    </Screen>
  );
}
