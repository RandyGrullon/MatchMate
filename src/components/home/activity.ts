import { useCallback, useMemo } from 'react';
import { useAuth } from '../../lib/auth';
import { isMatchSport, myMatchesSince, nextMatch, upcomingCalendar, type CalendarItem, type NextMatchInfo } from '../../lib/calendar';
import { useLeaguesByIds, useMyMemberships, type Live } from '../../lib/data';
import { useLiveMatches, useMyMatches, type Match } from '../../lib/data/matches';
import { toIsoDate } from '../../lib/format';
import { liveGames, liveMatches, type LiveGame, type LiveMatchItem } from '../../lib/live';
import { inSport } from '../../lib/sportContext';
import type { League, Member } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import { leagueSport } from '../../sports/registry';
import { useNotifications } from '../notifications/provider';
import { nextByLeague, nextEventItem, pickNextUp, type NextUp } from './logic';

/**
 * Lo de Hoy que no depende de la pantalla: mis ligas y lo que pasa en ellas (en juego ahora, lo próximo, la semana).
 * Sin react-router: lo usan la web (useHomeData.ts lo reexporta) y la app del teléfono (movil/src/app/(tabs)/index.tsx).
 */

/** Mis ligas y torneos (todas o las de un deporte) con mi papel en cada una. */
export function useMyLeagues(sport: string | null = null): {
  uid: string | undefined;
  memberships: Live<Member[]>;
  all: League[];
  leagues: League[];
  loading: boolean;
  error: Error | null;
  roleOf: (lid: string) => Member['role'] | undefined;
} {
  const auth = useAuth();
  const uid = auth.user?.uid;
  const memberships = useMyMemberships(uid);
  const byIds = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const leagues = useMemo(() => byIds.data.filter(inSport(sport)), [byIds.data, sport]);
  const roleOf = useCallback((lid: string) => memberships.data.find((m) => m.leagueId === lid)?.role, [memberships.data]);
  return {
    uid,
    memberships,
    all: byIds.data,
    leagues,
    // Sin cuenta no hay nada que esperar.
    loading: !!uid && (memberships.loading || byIds.loading),
    error: memberships.error ?? byIds.error,
    roleOf,
  };
}

/** Días hacia adelante que se miran para «lo próximo» de cada liga y para Próximos eventos. */
export const AHEAD_DAYS = 30;

export interface Activity {
  now: Date;
  today: string;
  /** Lo de cada liga (eventos desde ayer) de las ligas del deporte. */
  feeds: ReturnType<typeof useNotifications>['feeds'];
  /** Mis ligas del deporte (o todas). */
  leagues: League[];
  /** Mis partidos (desde ayer y los abiertos) de esas ligas. */
  mine: Match[];
  games: LiveGame[];
  liveItems: LiveMatchItem<Match>[];
  /** Lo que viene en los próximos 30 días (eventos, prácticas del horario y mis partidos), desde hoy. */
  upcoming: CalendarItem[];
  next: NextUp<Match>;
  nextMatch: NextMatchInfo<Match> | null;
  /** Lo próximo de cada liga. */
  nextOf: Map<string, CalendarItem>;
  /** Todavía se están leyendo los eventos o los partidos. */
  loading: boolean;
}

/**
 * Lo que pasa en esas ligas (las mías de un deporte, o todas): en juego ahora, lo próximo, la semana. Los eventos salen de
 * lo que ya lee la campana (useNotifications) y los partidos de my_matches (la precarga sin señal pide lo mismo).
 */
export function useActivity(leagues: League[], uid: string | undefined): Activity {
  const now = useNow();
  const today = toIsoDate(now);
  const { feeds: allFeeds } = useNotifications();
  const mineLive = useMyMatches(uid, myMatchesSince(now));
  const matchLeagues = uid ? leagues.filter((l) => isMatchSport(leagueSport(l))).map((l) => l.id) : [];
  const live = useLiveMatches(matchLeagues);

  return useMemo(() => {
    const ids = new Set(leagues.map((l) => l.id));
    const feeds = allFeeds.filter((f) => ids.has(f.lid));
    const mine = mineLive.data.filter((m) => ids.has(m.leagueId));
    const games = liveGames(feeds, leagues, now);
    const liveItems = liveMatches(live.data, mine, leagues, now.getTime());
    const liveIds = new Set(liveItems.map((m) => m.match.id));
    const upcoming = upcomingCalendar(feeds, leagues, today, AHEAD_DAYS, mine).filter((i) => i.date >= today);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nm = uid ? nextMatch(mine.filter((m) => !liveIds.has(m.id)), leagues, now.getTime()) : null;
    const ne = nextEventItem(upcoming, today, nowMinutes);
    return {
      now,
      today,
      feeds,
      leagues,
      mine,
      games,
      liveItems,
      upcoming,
      next: pickNextUp(nm, ne, now.getTime()),
      nextMatch: nm,
      nextOf: nextByLeague(upcoming, today, nowMinutes),
      loading: mineLive.loading,
    };
  }, [allFeeds, mineLive.data, mineLive.loading, live.data, leagues, now, today, uid]);
}
