import { useMemo } from 'react';
import { gameMeta } from '../../sports/esports/catalog';
import { sportMeta } from '../../sports/registry';
import { queryClient, remember, rpc, type Live } from './client';
import { peopleTags } from './follows';
import type { SquadLite } from './squads';

/**
 * Dónde juega cada persona (docs/perfiles-equipos-esports.md §1): sus ligas y torneos (solo los que puede ver quien
 * mira, nunca los de ligas con menores), sus equipos y sus equipos de esports. Cada uno lleva a su perfil en ese lugar.
 *
 * RPC: player_places (también sin sesión).
 */

export type PlaceSummary =
  | { kind: 'bowling'; games: number; average: number | null; high: number | null }
  | { kind: 'matches'; played: number; won: number; drawn: number; lost: number }
  | { kind: 'golf'; rounds: number; best: number | null }
  | { kind: 'swim'; results: number }
  | { kind: 'none' };

export interface LeaguePlace {
  leagueId: string;
  name: string;
  kind: 'liga' | 'torneo';
  sport: string;
  game: string | null;
  logo: string | null;
  visibility: 'public' | 'private';
  playerId: string;
  summary: PlaceSummary;
}

export type SquadPlace = SquadLite & { role: 'captain' | 'member' };

export interface EsportsTeamPlace {
  id: string;
  game: string;
  name: string;
  tag: string;
  logo: string | null;
  role: 'captain' | 'member' | 'sub';
}

export interface PlayerPlaces {
  leagues: LeaguePlace[];
  squads: SquadPlace[];
  esportsTeams: EsportsTeamPlace[];
}

export const EMPTY_PLACES: PlayerPlaces = { leagues: [], squads: [], esportsTeams: [] };

export const placesKey = (uid: string) => `people:places:${uid}`;

/** Dónde juega una cuenta (null mientras carga, si no existe o si esa persona te bloqueó: mirar `loading`). */
export function usePlayerPlaces(uid: string | null | undefined): Live<PlayerPlaces | null> {
  const key = uid ? placesKey(uid) : null;
  if (key) remember(key, { kind: 'playerPlaces', id: uid! });
  const st = queryClient.useQuery<PlayerPlaces | null>(key, () => rpc<PlayerPlaces | null>('player_places', { p_user: uid }), {
    initial: null,
    tags: uid ? [peopleTags.all, peopleTags.user(uid), 'squads', 'leagues'] : [],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** La línea de cada liga: «Promedio 182 · 24 juegos», «12 G · 3 P», «Mejor ronda 78», «5 pruebas». */
export function placeSummaryText(s: PlaceSummary | null | undefined): string {
  if (!s) return '';
  switch (s.kind) {
    case 'bowling':
      if (!s.games) return 'Sin juegos todavía';
      return [s.average != null ? `Promedio ${Math.round(s.average)}` : null, plural(s.games, 'juego', 'juegos')].filter(Boolean).join(' · ');
    case 'matches':
      if (!s.played) return 'Sin partidos todavía';
      return s.drawn ? `${s.won} G · ${s.drawn} E · ${s.lost} P` : `${s.won} G · ${s.lost} P`;
    case 'golf':
      if (!s.rounds) return 'Sin rondas todavía';
      return [s.best != null ? `Mejor ronda ${s.best}` : null, plural(s.rounds, 'ronda', 'rondas')].filter(Boolean).join(' · ');
    case 'swim':
      return s.results ? plural(s.results, 'prueba', 'pruebas') : 'Sin pruebas todavía';
    default:
      return '';
  }
}

/** El nombre del deporte o del juego («Pádel», «VALORANT»). */
export function placeSportName(p: Pick<LeaguePlace, 'sport' | 'game'>): string {
  if (p.sport === 'esports') return (p.game && gameMeta(p.game)?.name) || 'Esports';
  return sportMeta(p.sport)?.label ?? p.sport;
}

/** Las ligas agrupadas por deporte (el orden de llegada: las más activas primero). */
export function placesBySport(leagues: readonly LeaguePlace[]): { sport: string; game: string | null; label: string; leagues: LeaguePlace[] }[] {
  const groups = new Map<string, { sport: string; game: string | null; label: string; leagues: LeaguePlace[] }>();
  for (const l of leagues) {
    const k = l.sport === 'esports' ? `esports:${l.game ?? ''}` : l.sport;
    let g = groups.get(k);
    if (!g) {
      g = { sport: l.sport, game: l.sport === 'esports' ? l.game : null, label: placeSportName(l), leagues: [] };
      groups.set(k, g);
    }
    g.leagues.push(l);
  }
  return [...groups.values()];
}

/** A dónde lleva cada lugar: su perfil en esa liga, en el equipo o en el equipo de esports. */
export const leaguePlacePath = (l: Pick<LeaguePlace, 'leagueId' | 'playerId'>) => `/l/${l.leagueId}/j/${l.playerId}`;
export const squadPlacePath = (squadId: string, uid: string) => `/equipos/${squadId}?jugador=${encodeURIComponent(uid)}`;
export const esportsTeamPath = (id: string) => `/esports/equipo/${id}`;
