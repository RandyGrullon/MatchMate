/**
 * El contexto de la liga para las pantallas de los deportes (como LeagueShell de la web): la liga, la membresía de la
 * cuenta y si es admin o anota (leagueCtxOf, compartido). Las pantallas de raqueta y equipos de la web lo leen con
 * useLeagueCtx; en raqueta además va el deporte (RacketProvider, compartido).
 */
import { useMemo, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@mm/lib/auth';
import { useLeague, useMembership } from '@mm/lib/data';
import { LeagueContext, leagueCtxOf } from '@mm/lib/league';
import { RacketProvider } from '@mm/pages/sports/racket/sport';
import { racketPureExt } from '@mm/pages/sports/racket/extensions';
import { isSportId, leagueSport } from '@mm/sports/registry';
import type { RacketSport } from '@mm/sports/racket';
import { SPORT_FAMILY, type SportFamily } from '@mm/sports/types';
import type { League } from '@mm/lib/types';
import { Button, Empty, Loading, Screen } from '../ui';

/** La familia del deporte de la liga (serie: boliche, golf, natación; raqueta; equipos; esports). */
export function sportFamily(league: Pick<League, 'sport'> & Partial<League>): SportFamily | null {
  const sport = leagueSport(league as League);
  return isSportId(sport) ? SPORT_FAMILY[sport] : null;
}

export function LeagueScope({ lid, children }: { lid: string; children: ReactNode }) {
  const auth = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, auth.user?.uid);
  const ctx = useMemo(() => (league.data ? leagueCtxOf(lid, league.data, membership.data ?? null, auth.isSuper) : null), [lid, league.data, membership.data, auth.isSuper]);
  if ((league.loading && !league.data) || auth.loading) return <Loading label="Cargando la liga" />;
  if (!ctx) {
    return (
      <Screen>
        <Empty
          title="No puedes ver esta liga"
          text="Es privada o ya no existe. Para entrar necesitas el link o el código de invitación que te comparta un admin."
          action={<Button onPress={() => router.navigate('/ligas')}>Ver ligas</Button>}
        />
      </Screen>
    );
  }
  const sport = leagueSport(ctx.league);
  const inner = sportFamily(ctx.league) === 'racket' ? <RacketProvider sport={sport as RacketSport} ext={racketPureExt(sport as RacketSport)}>{children}</RacketProvider> : children;
  return <LeagueContext.Provider value={ctx}>{inner}</LeagueContext.Provider>;
}
