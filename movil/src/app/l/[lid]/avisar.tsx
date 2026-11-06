import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { AnnouncePanel } from '@/components/league/Announce';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, Loading, Screen, Txt } from '@/components/ui';

/** Organizar › «Avisar a toda la liga» (`/l/<liga>/avisar`, la pestaña `avisar` de la web): solo quien la organiza. */
export default function AnnounceScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  if (!league.data) return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <BackBar label={league.data.name} fallback={`/l/${lid}`} />
      <Txt variant="title">{adminScreenTitle('avisar', league.data.kind)}</Txt>
      <LeagueScope lid={lid}>
        <AdminAnnounce />
      </LeagueScope>
    </Screen>
  );
}

/** Quien no organiza vuelve a la liga (la RPC también lo exige). */
function AdminAnnounce() {
  const { lid, isAdmin } = useLeagueCtx();
  if (!isAdmin) return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return <AnnouncePanel />;
}
