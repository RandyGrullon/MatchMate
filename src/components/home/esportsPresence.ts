import { useMyEsportsEntries, useMyEsportsTeams } from '../../lib/data/esports';
import { isGameId, type GameId } from '../../sports/esports';
import type { SportId } from '../../sports/types';

/**
 * ¿Juega esports esta cuenta? La lógica de la fila «Esports» de Hoy y «Torneos de esports» de Ligas (sin DOM: la usan
 * la web, EsportsHomeRow.tsx, y la app del teléfono).
 */

/** ¿Sale la fila de esports? Con el deporte activo en esports, o si la cuenta tiene equipos o inscripciones de esports. */
export function showsEsportsRow(o: { active: SportId | null; teams: number; entries: number }): boolean {
  return o.active === 'esports' || o.teams > 0 || o.entries > 0;
}

/** El juego de todo lo de esports de la cuenta si es uno solo (sus equipos e inscripciones); null si son varios o ninguno. */
export function onlyGame(games: readonly (string | null | undefined)[]): GameId | null {
  const set = new Set(games.filter(isGameId));
  return set.size === 1 ? [...set][0] : null;
}

/**
 * ¿Juega esports esta cuenta? (sus equipos o inscripciones; las mismas lecturas que la pantalla de esports). `game`: si
 * todo es de un solo juego, ese (la fila lleva su monograma).
 */
export function useEsportsPresence(uid: string | null | undefined, active: SportId | null): { show: boolean; loading: boolean; game: GameId | null } {
  const teams = useMyEsportsTeams(uid);
  const entries = useMyEsportsEntries(uid);
  return {
    show: !!uid && showsEsportsRow({ active, teams: teams.data.length, entries: entries.data.length }),
    loading: teams.loading || entries.loading,
    game: onlyGame([...teams.data.map((t) => t.game), ...entries.data.map((e) => e.game)]),
  };
}
