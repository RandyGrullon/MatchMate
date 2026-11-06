import { useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { LeagueScope } from '@/components/league/LeagueScope';
import { SeasonsList } from '@/components/season/Seasons';
import { BackBar, Empty, Loading, Screen } from '@/components/ui';

/** Las temporadas de la liga (`/l/<liga>/temporadas`, como la web): sus campeones y sus tablas. */
export default function SeasonsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  if (!league.data) {
    return (
      <Screen>
        <BackBar label="Ligas" fallback="/ligas" />
        <Empty title="No puedes ver esta liga" text="Es privada o ya no existe. Para entrar necesitas el link o el código de invitación que te comparta un admin." />
      </Screen>
    );
  }
  return (
    <Screen>
      <BackBar label={league.data.name} fallback={`/l/${lid}`} />
      <LeagueScope lid={lid}>
        <SeasonsList />
      </LeagueScope>
    </Screen>
  );
}
