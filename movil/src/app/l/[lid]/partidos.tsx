import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { leagueSport } from '@mm/sports/registry';
import { EsportsMatches } from '@/components/esports/EsportsLeague';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketFeed } from '@/components/racket/RacketFeed';
import { TeamGames } from '@/components/team/TeamScreens';
import { BackBar, Loading, Screen } from '@/components/ui';

/** Partidos de la liga (la pestaña Partidos de la web). `?ver=mios`: los míos. */
export default function LeagueMatchesScreen() {
  const { lid, ver } = useLocalSearchParams<{ lid: string; ver?: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  const family = league.data ? sportFamily(league.data) : null;
  // Esports: las series de todos los torneos (Todos · Míos).
  if (league.data && leagueSport(league.data) === 'esports') {
    return (
      <Screen>
        <BackBar label={league.data.name} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <EsportsMatches initial={ver === 'mios' ? 'mios' : 'todos'} />
        </LeagueScope>
      </Screen>
    );
  }
  // Lo que la app todavía no tiene de ese deporte: la liga.
  if (family !== 'racket' && family !== 'team') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
      <LeagueScope lid={lid}>{family === 'racket' ? <RacketFeed initial={ver === 'mios' ? 'mios' : 'todos'} /> : <TeamGames initial={ver === 'mios' || ver === 'resultados' ? ver : undefined} />}</LeagueScope>
    </Screen>
  );
}
