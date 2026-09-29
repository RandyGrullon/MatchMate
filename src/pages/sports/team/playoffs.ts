/**
 * Lo que no es pantalla de los playoffs (baloncesto, fútbol y sala): cuántas rondas, al mejor de cuántos, el
 * marcador de cada serie («2–1»), la llave como el cuadro del torneo relámpago (src/sports/formats/knockout, para
 * dibujarla con BracketView), los juegos de cada serie y cuál sigue. Funciones puras, con pruebas en
 * playoffs.test.ts. Los datos: src/lib/data/playoffs.ts.
 */
import { isFinal, type Match } from '../../../lib/data/matches';
import type { Playoff, PlayoffSeries } from '../../../lib/data/playoffs';
import { nextPowerOfTwo, roundName, type Bracket, type BracketMatch } from '../../../sports/formats/knockout';

/** Al mejor de cuántos se puede jugar una serie. */
export const BEST_OF = [1, 3, 5, 7] as const;

export const MIN_PLAYOFF_TEAMS = 2;
export const MAX_PLAYOFF_TEAMS = 32;

/** Juego de una serie del playoff (por su serie o por la clave 'PO<ronda>-<lugar>'): no suma en la tabla. */
export const isPlayoffMatch = (m: Pick<Match, 'bracketKey'> & { seriesId?: string | null }) => !!m.seriesId || /^PO\d+-\d+$/.test(m.bracketKey ?? '');

/** Rondas del playoff con n equipos (los que sobran de una potencia de 2 pasan directo). */
export const playoffRounds = (n: number) => (n < 2 ? 0 : Math.log2(nextPowerOfTwo(n)));

/** Lo que se propone: al mejor de 3 y la final al mejor de 5 (con una sola ronda, al mejor de 5). */
export function defaultBestOf(n: number): number[] {
  const rounds = playoffRounds(n);
  return Array.from({ length: rounds }, (_, i) => (i === rounds - 1 ? 5 : 3));
}

/** Las victorias que hacen falta para ganar la serie. */
export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1;

/** «Al mejor de 5» / «A un juego». */
export const bestOfLabel = (bestOf: number) => (bestOf === 1 ? 'A un juego' : `Al mejor de ${bestOf}`);

/** Nombre de la ronda de una serie («Semifinal»). */
export const seriesRoundName = (s: Pick<PlayoffSeries, 'round'>, p: Pick<Playoff, 'bestOf'>) => roundName(s.round, Math.max(p.bestOf.length, s.round));

/** Marcador de la serie: «2–1». */
export const seriesScore = (s: Pick<PlayoffSeries, 'winsA' | 'winsB'>) => `${s.winsA}–${s.winsB}`;

/**
 * Cómo va la serie en palabras: «Tigres ganó 4–2», «Tigres gana 2–1», «Empatada 1–1», «Por empezar», «Pase directo»
 * o «Esperando rival».
 */
export function seriesLine(s: PlayoffSeries, nameOf: (teamId: string | null, label: string | null) => string): string {
  const a = nameOf(s.teamA, s.labelA);
  const b = nameOf(s.teamB, s.labelB);
  if (s.bye) return 'Pase directo';
  if (!s.teamA || !s.teamB) return 'Esperando rival';
  if (s.winner) {
    const aWon = s.winner === s.teamA;
    return `${aWon ? a : b} ganó ${aWon ? s.winsA : s.winsB}–${aWon ? s.winsB : s.winsA}`;
  }
  if (!s.winsA && !s.winsB) return 'Por empezar';
  if (s.winsA === s.winsB) return `Empatada ${seriesScore(s)}`;
  const aUp = s.winsA > s.winsB;
  return `${aUp ? a : b} gana ${aUp ? s.winsA : s.winsB}–${aUp ? s.winsB : s.winsA}`;
}

/** Clave de la serie en el cuadro (la misma de sus juegos: 'PO<ronda>-<lugar>'). */
export const seriesKey = (s: Pick<PlayoffSeries, 'round' | 'slot'>) => `PO${s.round}-${s.slot}`;

/**
 * La llave como un cuadro de eliminación (el tipo de src/sports/formats/knockout) para dibujarla con BracketView.
 * Cada serie es un «partido» del cuadro con su clave 'PO<ronda>-<lugar>'.
 */
export function playoffBracket(p: Pick<Playoff, 'seeds' | 'bestOf' | 'series'>): Bracket {
  const byId = new Map(p.series.map((s) => [s.id, s] as const));
  const rounds = Math.max(p.bestOf.length, ...p.series.map((s) => s.round), 1);
  const matches: BracketMatch[] = p.series.map((s) => {
    const next = s.nextSeries ? byId.get(s.nextSeries) : undefined;
    return {
      key: seriesKey(s),
      round: s.round,
      index: s.slot - 1,
      side1: s.teamA,
      side2: s.teamB,
      seed1: s.seedA,
      seed2: s.seedB,
      bye: s.bye,
      winner: s.winner,
      next: next ? { key: seriesKey(next), side: s.nextSide === 'b' ? 2 : 1 } : null,
      loserNext: null,
      thirdPlace: false,
    };
  });
  const winners: Record<string, string> = {};
  for (const m of matches) if (m.winner && !m.bye) winners[m.key] = m.winner;
  return { seeds: [...p.seeds], size: 2 ** rounds, rounds, thirdPlace: false, winners, matches };
}

/** La serie de una clave del cuadro. */
export const seriesOfKey = (p: Pick<Playoff, 'series'>, key: string) => p.series.find((s) => seriesKey(s) === key) ?? null;

/** Los juegos de la serie (sin los anulados), en orden. */
export function seriesGames<M extends Pick<Match, 'status' | 'stage' | 'createdAt' | 'id'> & { seriesId?: string | null }>(seriesId: string, matches: readonly M[]): M[] {
  const ms = (m: M) => (m.createdAt && typeof m.createdAt === 'object' ? m.createdAt.toMillis() : 0);
  return matches.filter((m) => m.seriesId === seriesId && m.status !== 'void').sort((a, b) => ms(a) - ms(b) || a.id.localeCompare(b.id));
}

/**
 * El juego que sigue de la serie: el primero que todavía no cuenta (por jugar, en juego, aplazado, suspendido,
 * disputado o con el resultado por confirmar antes de las 48 h).
 */
export function nextGame<M extends Pick<Match, 'status' | 'stage' | 'createdAt' | 'id' | 'proposedAt'> & { seriesId?: string | null }>(
  seriesId: string,
  matches: readonly M[],
  now: number = Date.now(),
): M | null {
  return seriesGames(seriesId, matches).find((m) => !isFinal(m, now)) ?? null;
}

/** El campeón (o null) y el subcampeón del playoff: los dos de la final. */
export function playoffPodium(p: Pick<Playoff, 'series'>): { champion: string | null; runnerUp: string | null } {
  const final = [...p.series].filter((s) => !s.nextSeries).sort((a, b) => b.round - a.round)[0];
  if (!final?.winner) return { champion: null, runnerUp: null };
  return { champion: final.winner, runnerUp: final.winner === final.teamA ? final.teamB : final.teamA };
}

/** Los equipos que se proponen: los primeros `n` de la tabla, en su orden (sin repetir). */
export const topSeeds = (tableIds: readonly string[], n: number) => [...new Set(tableIds)].slice(0, Math.max(0, n));

/** Sube (-1) o baja (+1) un equipo en la siembra. */
export function moveSeed(seeds: readonly string[], index: number, by: -1 | 1): string[] {
  const j = index + by;
  if (index < 0 || index >= seeds.length || j < 0 || j >= seeds.length) return [...seeds];
  const out = [...seeds];
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

/** Lo que falta para armar el playoff (null = listo). */
export function playoffProblem(seeds: readonly string[], bestOf: readonly number[]): string | null {
  if (seeds.length < MIN_PLAYOFF_TEAMS) return 'Elige al menos 2 equipos.';
  if (seeds.length > MAX_PLAYOFF_TEAMS) return `Como mucho ${MAX_PLAYOFF_TEAMS} equipos.`;
  if (new Set(seeds).size !== seeds.length) return 'Hay un equipo repetido.';
  if (bestOf.length !== playoffRounds(seeds.length)) return 'Elige al mejor de cuántos se juega cada ronda.';
  if (bestOf.some((b) => !(BEST_OF as readonly number[]).includes(b))) return 'Cada ronda se juega a 1, 3, 5 o 7 juegos.';
  return null;
}

/** Cuántos pasan directo a la segunda ronda (los mejores sembrados). */
export const byesFor = (n: number) => (n < 2 ? 0 : nextPowerOfTwo(n) - n);
