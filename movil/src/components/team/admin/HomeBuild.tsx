/**
 * Lo de organizar que va en el inicio de una liga de equipos (BasketballHome.tsx y FootballHome.tsx de la web), listo
 * para conectar: el botón «Armar calendario» / «Armar el torneo» cuando no hay partidos (con su hoja) y, en fútbol y
 * sala, «Pasar a la fase final» para quien organiza.
 */
import { useNow } from '@mm/lib/useNow';
import { basketballConfigFrom } from '@mm/pages/sports/basketball/rules';
import { footballConfigFrom, formatOf, knockoutRules, matchMinutes, templateOf, variantOf } from '@mm/pages/sports/football/rules';
import { groupRanking, useFootballSeason } from '@mm/pages/sports/football/season';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { leagueSport } from '@mm/sports/registry';
import { ScheduleBuilderSheet } from './ScheduleBuilder';
import { TournamentAdvance, TournamentBuilderSheet } from './TournamentBuilder';

/** Lo que dice el botón de armar del inicio: «Armar el torneo» en una liga de formato relámpago, si no «Armar calendario». */
export function homeBuild(tl: Pick<TeamLeague, 'league' | 'rules'>): { label: string; relampago: boolean } {
  const relampago = leagueSport(tl.league) !== 'basketball' && formatOf(tl.rules.data) === 'relampago';
  return { label: relampago ? 'Armar el torneo' : 'Armar calendario', relampago };
}

/** La hoja que abre el botón de armar del inicio (la del calendario o la del torneo relámpago), con lo del deporte. */
export function HomeBuildSheet({ tl, open, onClose }: { tl: TeamLeague; open: boolean; onClose: () => void }) {
  if (!tl.isAdmin) return null;
  if (leagueSport(tl.league) === 'basketball') {
    const config = basketballConfigFrom(tl.rules.data);
    return <ScheduleBuilderSheet tl={tl} open={open} onClose={onClose} format={config.variant === '3x3' ? '3x3' : 'fiba'} />;
  }
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const template = templateOf(tl.rules.data, variant);
  if (homeBuild(tl).relampago) {
    return <TournamentBuilderSheet tl={tl} open={open} onClose={onClose} format={variant} slotMinutes={matchMinutes(config) - 5} knockoutRules={knockoutRules(tl.rules.data, variant)} />;
  }
  return <ScheduleBuilderSheet tl={tl} open={open} onClose={onClose} format={variant} minutes={matchMinutes(config)} defaultDouble={template?.double ?? variant === 'football'} />;
}

/** Fútbol y sala: «Pasar a la fase final» en el inicio (solo quien organiza, y solo si hay algo que poner). */
export function FootballHomeAdvance({ tl }: { tl: TeamLeague }) {
  const now = useNow(30_000).getTime();
  const season = useFootballSeason(tl);
  if (!tl.isAdmin) return null;
  return <TournamentAdvance tl={tl} rankGroup={(stage) => groupRanking(season, tl.matches.data, stage, now)} />;
}
