import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { displayName, useAuth } from '../../lib/auth';
import { isMatchSport, myMatchesSince, nextMatch, upcomingCalendar, type CalendarItem, type NextMatchInfo } from '../../lib/calendar';
import { joinLeague, useLeaguesByIds, useMyMemberships, type Live } from '../../lib/data';
import { useLiveMatches, useMyMatches, type Match } from '../../lib/data/matches';
import { toIsoDate } from '../../lib/format';
import { liveGames, liveMatches, type LiveGame, type LiveMatchItem } from '../../lib/live';
import { inSport } from '../../lib/sportContext';
import type { League, Member } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import { leagueSport } from '../../sports/registry';
import { useAction } from '../feedback';
import { useNotifications } from '../Notifications';
import { nextByLeague, nextEventItem, pickNextUp, type NextUp } from './logic';

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

/** «Unirme» a una liga pública: sin cuenta va a entrar; si sale bien, a la liga. */
export function useJoin(): { joining: string | null; join: (l: League) => Promise<void> } {
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const [joining, setJoining] = useState<string | null>(null);
  const join = useCallback(
    async (l: League) => {
      if (!auth.user) {
        navigate(`/login?next=${encodeURIComponent(`/l/${l.id}`)}`);
        return;
      }
      setJoining(l.id);
      const ok = await run(async () => {
        await joinLeague(l.id, { uid: auth.user!.uid, name: displayName(auth) }, null);
        return true;
      }, `Te uniste a ${l.name}`);
      setJoining(null);
      if (ok) navigate(`/l/${l.id}`);
    },
    [auth, navigate, run],
  );
  return { joining, join };
}
