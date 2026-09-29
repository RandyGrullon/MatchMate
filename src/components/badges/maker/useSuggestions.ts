import { useMemo } from 'react';
import { todayIn } from '../../../badges/rules/periods';
import { useEntriesOfEvents, useEvents, usePlayers } from '../../../lib/data';
import { useMatches } from '../../../lib/data/matches';
import { useSeasonTeams } from '../../../lib/data/seasonTeams';
import { useLeagueRules } from '../../../lib/data/teamSports';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { leagueSport } from '../../../sports/registry';
import type { RacketSport } from '../../../sports/racket';
import { bowlingSuggest, racketSuggest, rangeOfPeriod, suggestsFor, teamSuggest, DECIDE, type SuggestOutcome } from './suggest';
import { templateOf } from './templates';

/**
 * Las sugerencias de una plantilla en la liga abierta (§5.6): lee solo lo que su deporte necesita (boliche: eventos
 * y juegos; raqueta y equipos: partidos, equipos y reglas) y solo si la insignia salió de una plantilla. `null` =
 * no aplica (sin plantilla).
 */
export function useBadgeSuggestions(opts: { template: string | null; byTeam: boolean; periodText: string; enabled: boolean }): { outcome: SuggestOutcome | null; loading: boolean } {
  const { lid, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const template = opts.enabled ? templateOf(opts.template) : null;
  const kind = template ? suggestsFor(sport) : null;
  const now = useNow(5 * 60_000).getTime();

  const players = usePlayers(template ? lid : undefined);
  const events = useEvents(kind === 'bowling' ? lid : undefined);
  const eventIds = useMemo(() => events.data.map((e) => e.id), [events.data]);
  const entries = useEntriesOfEvents(kind === 'bowling' ? lid : undefined, eventIds);
  const matches = useMatches({ lid: kind === 'racket' || kind === 'team' ? lid : undefined });
  const teams = useSeasonTeams(kind === 'racket' || kind === 'team' ? lid : undefined);
  const rules = useLeagueRules(kind === 'team' ? lid : undefined);

  const outcome = useMemo((): SuggestOutcome | null => {
    if (!template) return null;
    if (!kind) return { list: [], note: DECIDE };
    const names = new Map(players.data.map((p) => [p.id, p.name] as const));
    const range = rangeOfPeriod(opts.periodText, league, todayIn(now, league.tz || 'America/Santo_Domingo'));
    if (kind === 'bowling') return bowlingSuggest(template.key, { events: events.data, entries: entries.data, names, range });
    if (kind === 'racket')
      return racketSuggest(template.key, { sport: sport as RacketSport, matches: matches.data, teams: teams.data, names, range, byTeam: opts.byTeam, tz: league.tz, now });
    return teamSuggest(template.key, {
      sport: sport as 'basketball' | 'football' | 'futsal',
      matches: matches.data,
      teams: teams.data,
      rules: rules.data,
      names,
      range,
      tz: league.tz,
      now,
    });
  }, [template, kind, players.data, events.data, entries.data, matches.data, teams.data, rules.data, opts.periodText, opts.byTeam, league, sport, now]);

  const loading =
    !!template &&
    (players.loading || (kind === 'bowling' && (events.loading || entries.loading)) || ((kind === 'racket' || kind === 'team') && (matches.loading || teams.loading)));
  return { outcome, loading };
}
