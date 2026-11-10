import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { leagueSport } from '@mm/sports/registry';
import { BowlingGamesFeed } from '@/components/bowling/GamesFeed';
import { EsportsMatches } from '@/components/esports/EsportsLeague';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketFeed } from '@/components/racket/RacketFeed';
import { TeamGames } from '@/components/team/TeamScreens';
import { BackBar, Loading, Screen } from '@/components/ui';

/**
 * Partidos de la liga (la pestaña Partidos de la web, `/l/<liga>/juegos`). `?ver=mios`: los míos. En el boliche es
 * «Resultados anteriores» (GamesFeedPage de la web): `?juego=<id del juego>` abre ese juego (un aviso, el «Ver» de Social).
 */
export default function LeagueMatchesScreen() {
  const { lid, ver } = useLocalSearchParams<{ lid: string; ver?: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  const family = league.data ? sportFamily(league.data) : null;
  // Boliche: los resultados de cada fecha jugada, con me gusta y comentarios (`?juego=` lo lee la pantalla).
  if (league.data && leagueSport(league.data) === 'bowling') {
    return (
      <Screen onRefresh={() => invalidate(tags.events(lid), tags.players(lid), tags.entries(lid), tags.social(lid))}>
        <BackBar label={league.data.name} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <BowlingGamesFeed />
        </LeagueScope>
      </Screen>
    );
  }
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
  // Lo que la app todavía no tiene de ese deporte (golf, natación): la liga.
  if (family !== 'racket' && family !== 'team') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
      <LeagueScope lid={lid}>{family === 'racket' ? <RacketFeed initial={ver === 'mios' ? 'mios' : 'todos'} /> : <TeamGames initial={ver === 'mios' || ver === 'resultados' ? ver : undefined} />}</LeagueScope>
    </Screen>
  );
}
