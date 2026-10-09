import { useEffect, useMemo, useState } from 'react';
import { BackendError } from '../backend/types';
import { getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live } from './client';
import { postTags } from './posts';

/**
 * Ligas en la red social (docs/red-social.md): seguir una liga pública (sus publicaciones salen en tu feed), las que
 * sigues y buscar ligas (las tuyas, de cualquier tipo, y las públicas sin menores) para la lupa.
 *
 * RPC: league_social, follow_league, unfollow_league, followed_leagues, search_leagues.
 */

export interface LeagueHit {
  id: string;
  name: string;
  sport: string;
  kind: 'liga' | 'torneo';
  visibility: 'public' | 'private';
  venue: string | null;
  /** Ruta del logo en el bucket `logos` (useLogo). */
  logo: string | null;
  members: number;
  followers: number;
  isMember: boolean;
  isFollowing: boolean;
}

export interface LeagueSocial {
  following: boolean;
  followers: number;
  isMember: boolean;
  /** Puede publicar en el muro (miembro de una liga sin menores). */
  canPost: boolean;
  /** Puede seguirla (pública, sin menores y no es miembro). */
  canFollow: boolean;
}

export interface LeagueFollowResult {
  following: boolean;
  followers: number;
}

export const leagueSocialTags = {
  all: 'leagueSocial',
  league: (lid: string) => `leagueSocial:${lid}`,
  followed: 'leagueSocial:followed',
  search: 'leagueSocial:search',
};

const keys = {
  social: (lid: string) => `leagueSocial:${lid}`,
  followed: 'leagueSocial:followed',
  search: (q: string) => `leagueSocial:search:${q}`,
};

// ---------- Una liga ----------

/** Lo social de una liga para la cuenta que mira (null sin sesión o mientras carga). */
export function useLeagueSocial(lid: string | null | undefined): Live<LeagueSocial | null> {
  const key = lid && getUserId() ? keys.social(lid) : null;
  if (key) remember(key, { kind: 'leagueSocial', lid: lid! });
  const st = queryClient.useQuery<LeagueSocial | null>(key, () => rpc<LeagueSocial>('league_social', { p_league: lid }), {
    initial: null,
    tags: lid ? [leagueSocialTags.all, leagueSocialTags.league(lid)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

function patchFollowing(lid: string, following: boolean, followers?: number) {
  updateCached<LeagueSocial | null>('leagueSocial', (s, d) =>
    s && d.lid === lid
      ? { ...s, following, followers: followers ?? Math.max(0, s.followers + (s.following === following ? 0 : following ? 1 : -1)) }
      : s,
  );
  updateCached<LeagueHit[]>('leagueSearch', (list) =>
    list.some((l) => l.id === lid)
      ? list.map((l) =>
          l.id === lid ? { ...l, isFollowing: following, followers: followers ?? Math.max(0, l.followers + (l.isFollowing === following ? 0 : following ? 1 : -1)) } : l,
        )
      : list,
  );
}

/** Seguir (true) o dejar de seguir (false) una liga. Se ve al momento; después queda lo del servidor. */
export async function setLeagueFollowing(lid: string, follow: boolean): Promise<LeagueFollowResult> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para seguir una liga.', 'auth', 'session_not_found');
  patchFollowing(lid, follow);
  try {
    const res = await rpc<LeagueFollowResult>(follow ? 'follow_league' : 'unfollow_league', { p_league: lid });
    patchFollowing(lid, res.following, res.followers);
    return res;
  } finally {
    invalidate(leagueSocialTags.league(lid), leagueSocialTags.followed, postTags.feed);
  }
}

// ---------- Las que sigo ----------

export function useFollowedLeagues(): Live<LeagueHit[]> {
  const key = getUserId() ? keys.followed : null;
  if (key) remember(key, { kind: 'leagueSearch', status: 'followed' });
  const st = queryClient.useQuery<LeagueHit[]>(key, () => rpc<LeagueHit[]>('followed_leagues', { p_limit: 50 }), {
    initial: [],
    tags: [leagueSocialTags.all, leagueSocialTags.followed],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

// ---------- Buscar ligas ----------

export const LEAGUE_QUERY_MIN = 2;
export const LEAGUE_QUERY_MAX = 60;
const SEARCH_DEBOUNCE_MS = 250;

/** Lo que se busca: sin espacios de más, en minúsculas, hasta 60 letras. */
export function leagueQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, LEAGUE_QUERY_MAX);
}

export interface LeagueSearch extends Live<LeagueHit[]> {
  /** Ya se buscó lo último que se escribió (dejó de escribir y llegó la respuesta). */
  settled: boolean;
}

/** Buscar ligas por nombre o lugar (espera a que deje de escribir; menos de 2 letras no busca). */
export function useLeagueSearch(query: string, enabled = true): LeagueSearch {
  const q = leagueQuery(query);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);
  const active = enabled && !!getUserId() && debounced.length >= LEAGUE_QUERY_MIN;
  const key = active ? keys.search(debounced) : null;
  if (key) remember(key, { kind: 'leagueSearch', status: 'search' });
  const st = queryClient.useQuery<LeagueHit[]>(key, () => rpc<LeagueHit[]>('search_leagues', { p_query: debounced, p_limit: 20 }), {
    initial: [],
    tags: [leagueSocialTags.all, leagueSocialTags.search],
    staleMs: 30_000,
    persist: false,
  });
  const settled = debounced === q && (!active || !st.loading);
  return useMemo(() => ({ data: active ? st.data : [], loading: active && st.loading, error: active ? st.error : null, settled }), [active, st, settled]);
}
