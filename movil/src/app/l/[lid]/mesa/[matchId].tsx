import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { isOpen, useMatch, type Match } from '@mm/lib/data/matches';
import { leagueSport } from '@mm/sports/registry';
import { canOpenTable } from '@mm/pages/sports/team/logic';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { disciplineFrom, variantOf } from '@mm/pages/sports/football/rules';
import { suspendedIn, useFootballSeason } from '@mm/pages/sports/football/season';
import { BasketballCourt } from '@/components/court/BasketballCourt';
import { FootballCourt } from '@/components/court/FootballCourt';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { Loading } from '@/components/ui';

/**
 * La mesa anotadora (baloncesto) o el acta del partido (fútbol y sala), a pantalla completa: el `&mesa=1` de la web.
 * Lee el partido completo (reglas y lo que ya se anotó); sin señal y sin copia, arranca con lo de la lista y las
 * reglas de la liga (lo que se anotó en otro teléfono llega al pedir el turno). Quien no puede anotar ese partido
 * vuelve al partido (como la web: el botón no sale).
 */
export default function TeamTableScreen() {
  const { lid, matchId } = useLocalSearchParams<{ lid: string; matchId: string }>();
  return (
    <LeagueScope lid={lid}>
      <TableBody matchId={matchId} />
    </LeagueScope>
  );
}

function TableBody({ matchId }: { matchId: string }) {
  const tl = useTeamLeague();
  const one = useMatch(tl.lid, matchId);
  const basketball = leagueSport(tl.league) === 'basketball';
  const label = basketball ? 'Abriendo la mesa…' : 'Abriendo el acta…';
  const back = { pathname: '/l/[lid]/partido/[matchId]' as const, params: { lid: tl.lid, matchId } };
  const exit = () => (router.canGoBack() ? router.back() : router.replace(back));
  if (sportFamily(tl.league) !== 'team') return <Redirect href={back} />;

  const listed = tl.matches.data.find((x) => x.id === matchId) ?? null;
  const m: Match | null = one.data ?? listed;
  // Sin señal y sin copia del partido completo: lo de la lista con las reglas de la liga.
  const courtMatch: Match | null = one.data ?? (one.error && listed ? { ...listed, rules: tl.rules.data } : null);
  // Mientras llegan los equipos y los anotadores no se sabe todavía si puede anotar.
  const settling = (tl.allTeams.loading && !tl.allTeams.data.length) || (tl.officials.loading && !tl.officials.data.length);
  if (!m) return one.loading || tl.matches.loading ? <Loading label={label} /> : <Redirect href={back} />;
  if (settling) return <Loading label={label} />;
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official: tl.officialOf(m.id), speaker: tl.speakerOf(m) });
  if (!canTable) return <Redirect href={back} />;
  if (!courtMatch) return <Loading label={label} />;
  return basketball ? <BasketballCourt tl={tl} match={courtMatch} onExit={exit} /> : <FootballTable tl={tl} match={courtMatch} onExit={exit} />;
}

/** El acta con los suspendidos de este partido (la app avisa, no bloquea). */
function FootballTable({ tl, match: m, onExit }: { tl: TeamLeague; match: Match; onExit: () => void }) {
  const season = useFootballSeason(tl);
  const discipline = disciplineFrom(tl.rules.data);
  const suspended = isOpen(m) || m.status === 'postponed' ? suspendedIn(season.disciplineMatches, m.id, discipline, season.adjustments) : [];
  return <FootballCourt tl={tl} match={m} variant={variantOf(tl.league.sport)} suspended={suspended} onExit={onExit} />;
}
