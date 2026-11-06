import { useMemo } from 'react';
import { handicapAverages, type RankingRow } from '../../lib/bowlingSeason';
import { useAllEntries, useEvents, usePlayers } from '../../lib/data';
import { balancedLeagueTeams, seededTeams, teamAverageSum, type BowlingTeam } from '../../lib/data/bowlingTeams';
import { useLeagueSeasons } from '../../lib/data/seasons';
import type { BowlingEvent, Player } from '../../lib/types';
import { todayIn } from '../../pages/sports/racket/logic/time';

/**
 * Lo de los equipos fijos del boliche que no dibuja nada (lo usan la web y la app del teléfono): el número o las
 * iniciales del equipo y la letra sobre su color, «4 jugadores», el promedio de cada jugador, la línea de cada equipo,
 * el aviso antes de reemplazarlos, cómo quedan al generarlos y lo del inicio de la liga y de la tarjeta del torneo.
 * Sin DOM ni pantallas: las piezas de la web (parts.tsx, BowlingTeamsAdmin, LeagueTeams, FixedTeamsCard) lo importan.
 */

/**
 * La pantalla propia del boliche en Organizar (BOWLING_TABS de src/components/organizer/Hub.tsx: su fila en «La liga» y
 * el título de `/l/:lid/admin?tab=equipos`). Solo en una liga (un torneo suelto arma los suyos en el torneo).
 * tab.test.ts revisa que sea la misma de Hub.tsx.
 */
export const BOWLING_TEAMS_TAB = { key: 'equipos', label: 'Equipos', subtitle: 'Fijos de la liga: al azar, parejos o a mano' } as const;

/** «Equipo 3» → «3»; «Los Strikers» → «LS». */
export function teamInitials(name: string): string {
  const n = /^equipo\s+(\d{1,2})$/i.exec(name.trim());
  if (n) return n[1];
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** Letra oscura en los colores claros (amarillo, verde limón) y blanca en los demás. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const v = parseInt(m[1], 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#fff';
}

/** «4 jugadores». */
export const playersWord = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;

/**
 * El promedio de cada jugador de la liga para armar equipos: el del handicap de una inscripción de hoy (la temporada,
 * la anterior, el fijo o el de entrada; handicapAverages), como la lista de jugadores del admin. 0 = sin promedio.
 * `today` ('aaaa-mm-dd' en la zona de la liga): el teléfono lo da con useNow; sin él, el de ahora.
 */
export function useLeagueAverages(lid: string | undefined, tz?: string | null, today?: string): ReadonlyMap<string, number> {
  const players = usePlayers(lid);
  const entries = useAllEntries(lid);
  const events = useEvents(lid);
  const seasons = useLeagueSeasons(lid);
  return useMemo(() => {
    const dates = new Map(events.data.map((e) => [e.id, e.date]));
    const byPlayer = handicapAverages(players.data, entries.data, dates, seasons.data, today ?? todayIn(tz));
    return new Map([...byPlayer].map(([id, a]) => [id, a.average]));
  }, [players.data, entries.data, events.data, seasons.data, tz, today]);
}

type Averages = ReadonlyMap<string, number>;

/** «3 jugadores · suma 540». */
export const teamLine = (team: Pick<BowlingTeam, 'players'>, averages: Averages) => {
  const sum = teamAverageSum(
    team.players.map((p) => p.playerId),
    averages,
  );
  return `${playersWord(team.players.length)}${sum ? ` · suma ${sum}` : ''}`;
};

// ---------- Generar ----------

export type GenerateMode = 'azar' | 'parejos';

/** El aviso antes de reemplazar los equipos de ahora. */
export function replaceMessage(current: number, next: number): string {
  const gone = Math.max(0, current - next);
  const now = current === 1 ? 'Se reemplaza el equipo de ahora' : `Se reemplazan los ${current} equipos de ahora`;
  const extra = gone ? ` y se ${gone === 1 ? 'borra 1 que sobra' : `borran ${gone} que sobran`}` : '';
  return `${now}${extra}. Los torneos que ya tienen sus equipos no cambian.`;
}

/** Quien entra al generar, con el promedio con que se reparte. */
export interface GenerateCandidate {
  id: string;
  name: string;
  average: number;
}

/** Los que entran: los jugadores menos los que se dejaron fuera, con su promedio (o el fijo; sin nada, 0). */
export function generateCandidates(players: readonly Pick<Player, 'id' | 'name' | 'averageOverride'>[], out: ReadonlySet<string>, averages: Averages): GenerateCandidate[] {
  return players.filter((p) => !out.has(p.id)).map((p) => ({ id: p.id, name: p.name, average: averages.get(p.id) || p.averageOverride || 0 }));
}

/** Cómo quedan: al azar (con la semilla) o parejos por promedio; cada equipo, del mejor promedio al menor. */
export function generateGroups(mode: GenerateMode, candidates: readonly GenerateCandidate[], size: number, seed: number): GenerateCandidate[][] {
  return (mode === 'azar' ? seededTeams(candidates, size, seed) : balancedLeagueTeams(candidates, size)).map((g) =>
    [...g].sort((a, b) => b.average - a.average || a.name.localeCompare(b.name, 'es')),
  );
}

/** La suma de promedios de cada grupo, la diferencia entre el mayor y el menor y cuántos de los de ahora sobran. */
export function generateSummary(groups: readonly (readonly GenerateCandidate[])[], current: number): { sums: number[]; spread: number; gone: number } {
  const sums = groups.map((g) => g.reduce((a, p) => a + p.average, 0));
  const spread = sums.length > 1 ? Math.max(...sums) - Math.min(...sums) : 0;
  return { sums, spread, gone: Math.max(0, current - groups.length) };
}

// ---------- El inicio de la liga ----------

/**
 * El promedio de cada jugador en el inicio de la liga: el de la tabla de la temporada (ya está leída) y, si todavía no
 * tiene juegos, el fijo del admin. Sin nada, no sale.
 */
export function homeAverages(rows: readonly Pick<RankingRow, 'playerId' | 'average'>[], players: readonly Pick<Player, 'id' | 'averageOverride'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of players) if (p.averageOverride) out.set(p.id, p.averageOverride);
  for (const r of rows) if (r.average > 0) out.set(r.playerId, r.average);
  return out;
}

/** «Ana · Luis · Pedro» (los nombres de pila). */
export const firstNames = (names: readonly string[]) => names.map((n) => n.trim().split(/\s+/)[0] || n).join(' · ');

// ---------- Torneo › Equipos: los equipos fijos de la liga ----------

/** Ya hay equipos armados en el torneo: se pregunta antes de cambiar a alguien. */
export const fixedTeamsAsk = (event: Pick<BowlingEvent, 'teams'>, entries: readonly { teamId: string | null }[]) =>
  !!Object.keys(event.teams ?? {}).length || entries.some((e) => e.teamId);

/** El aviso después de usarlos (la base dice cuántos inscritos quedaron con su equipo). */
export const fixedTeamsDone = (done: number) => (done ? `${playersWord(done)} con su equipo` : 'Ningún inscrito está en un equipo fijo');
