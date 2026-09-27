/**
 * Tablas de posiciones desde resultados (MatchResult) con desempates configurables.
 *
 * - `buildRows` suma jugados, ganados, puntos de tabla y cada total del partido (sets, juegos, puntos, goles…)
 *   en `extra` como `<clave>For`, `<clave>Against` y `<clave>Diff` (p. ej. setsDiff, gamesFor, pointsDiff).
 * - `resolveTies` ordena con una lista de criterios. Los de minitabla (`h2h`) se calculan solo con los partidos
 *   entre los empatados; cuando un criterio separa a una parte del grupo, los que siguen empatados vuelven a
 *   pasar por la lista desde el principio, solo entre ellos (recursivo). Así, 3 empatados que se reducen a 2 se
 *   deciden por su enfrentamiento directo.
 * - Presets de pádel/tenis y de pickleball. Los deportes de equipo arman los suyos con `tiebreak` y `resolveTies`.
 */

import type { MatchResult, Side, StandingRow } from '../types';
import { lotValue } from './random';

/** Puntos de tabla por partido. */
export interface PointsRule {
  win: number;
  draw: number;
  loss: number;
  /** Puntos del que no se presentó (W.O.). */
  walkoverLoss: number;
  /** Puntos del que ganó por W.O. Por defecto, lo mismo que ganar. */
  walkoverWin?: number;
}

/** Arma filas (sin ordenar) para unos ids con unos partidos. La usa la minitabla. */
export type RowBuilder = (ids: readonly string[], results: readonly MatchResult[]) => StandingRow[];

export interface TieCriterion {
  /** Texto para `decidedBy` ("dif. de sets"). Si es función, recibe cuántos estaban empatados. */
  label: string | ((tied: number) => string);
  /**
   * - `all`: el número de la tabla completa.
   * - `h2h`: minitabla hecha solo con los partidos entre los empatados.
   * - `above`: solo los partidos contra el que quedó justo arriba del grupo (pickleball). Si no hay nadie arriba
   *   o no jugaron contra él, se salta.
   * - `lot`: sorteo determinista por hash del id (con `seed`).
   */
  scope: 'all' | 'h2h' | 'above' | 'lot';
  /** Valor de la fila (de la tabla o de la minitabla). Mayor es mejor, salvo `asc`. */
  value?: (row: StandingRow) => number;
  asc?: boolean;
  /** Semilla del sorteo (p. ej. el id de la liga). */
  seed?: string;
}

export interface ResolveOptions {
  /** Cómo armar la minitabla. Por defecto: ganar 3, empatar 1, perder 0 y la primera clave de totals. */
  build?: RowBuilder;
  /**
   * Cuándo se vuelve a empezar la lista con los que siguen empatados:
   * - `always` (por defecto): después de cualquier criterio que separe (tenis ATP/ITF, FIBA, USA Pickleball).
   * - `h2h`: solo después de un criterio de minitabla; tras uno general se sigue con el siguiente (estilo FIFA).
   */
  restart?: 'always' | 'h2h';
}

export interface TableConfig {
  points: PointsRule;
  /** Clave de `MatchResult.totals` que va en for/against/diff de la fila. */
  primary: string;
  criteria: readonly TieCriterion[];
  restart?: 'always' | 'h2h';
}

function emptyRow(id: string): StandingRow {
  return { id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, for: 0, against: 0, diff: 0, extra: { walkovers: 0, walkoverWins: 0 }, rank: 0 };
}

function addSide(row: StandingRow, m: MatchResult, side: Side, pts: PointsRule, keys: Set<string>) {
  const other: Side = side === 1 ? 2 : 1;
  row.played++;
  if (m.walkover === side) {
    row.lost++;
    row.points += pts.walkoverLoss;
    row.extra.walkovers++;
  } else if (m.walkover === other) {
    row.won++;
    row.points += pts.walkoverWin ?? pts.win;
    row.extra.walkoverWins++;
  } else if (m.winner === side) {
    row.won++;
    row.points += pts.win;
  } else if (m.winner === null) {
    row.drawn++;
    row.points += pts.draw;
  } else {
    row.lost++;
    row.points += pts.loss;
  }
  for (const [key, pair] of Object.entries(m.totals)) {
    const mine = side === 1 ? pair[0] : pair[1];
    const theirs = side === 1 ? pair[1] : pair[0];
    keys.add(key);
    row.extra[`${key}For`] = (row.extra[`${key}For`] ?? 0) + mine;
    row.extra[`${key}Against`] = (row.extra[`${key}Against`] ?? 0) + theirs;
    row.extra[`${key}Diff`] = (row.extra[`${key}Diff`] ?? 0) + mine - theirs;
  }
}

/**
 * Filas de tabla (sin ordenar, rank 0) para `ids`. Solo cuentan los partidos con los dos lados en `ids`
 * (una tabla es una competencia cerrada: grupo, caja, liga). El W.O. cuenta como jugado para los dos.
 */
export function buildRows(ids: readonly string[], results: readonly MatchResult[], points: PointsRule, primary: string): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of ids) if (!rows.has(id)) rows.set(id, emptyRow(id));
  const keys = new Set<string>();
  for (const m of results) {
    const r1 = rows.get(m.side1);
    const r2 = rows.get(m.side2);
    if (!r1 || !r2 || m.side1 === m.side2) continue;
    addSide(r1, m, 1, points, keys);
    addSide(r2, m, 2, points, keys);
  }
  for (const row of rows.values()) {
    // Todas las filas con las mismas claves, aunque no hayan jugado.
    for (const k of keys) for (const suf of ['For', 'Against', 'Diff']) row.extra[k + suf] ??= 0;
    row.for = row.extra[`${primary}For`] ?? 0;
    row.against = row.extra[`${primary}Against`] ?? 0;
    row.diff = row.for - row.against;
  }
  return [...rows.values()];
}

const DEFAULT_POINTS: PointsRule = { win: 3, draw: 1, loss: 0, walkoverLoss: 0 };

function defaultBuild(ids: readonly string[], results: readonly MatchResult[]): StandingRow[] {
  const primary = results.length ? (Object.keys(results[0].totals)[0] ?? '') : '';
  return buildRows(ids, results, DEFAULT_POINTS, primary);
}

interface Placed {
  id: string;
  decidedBy?: string;
  tiedWithPrev: boolean;
}

/**
 * Ordena la tabla con los criterios y pone `rank` y `decidedBy`. Empates que ningún criterio rompe comparten
 * puesto (1, 2, 2, 4) y quedan en el orden de entrada. No cambia las filas recibidas: devuelve copias.
 */
export function resolveTies(
  rows: readonly StandingRow[],
  results: readonly MatchResult[],
  criteria: readonly TieCriterion[],
  opts: ResolveOptions = {},
): StandingRow[] {
  const build = opts.build ?? defaultBuild;
  const restart = opts.restart ?? 'always';
  const byId = new Map(rows.map((r) => [r.id, r]));

  const miniValues = (c: TieCriterion, group: readonly string[], ids: readonly string[], games: readonly MatchResult[]) => {
    const mini = new Map(build(ids, games).map((r) => [r.id, r]));
    return group.map((id) => c.value!(mini.get(id) ?? emptyRow(id)));
  };

  const valuesFor = (c: TieCriterion, group: readonly string[], above: string | null): number[] | null => {
    const inGroup = new Set(group);
    switch (c.scope) {
      case 'all':
        return group.map((id) => c.value!(byId.get(id)!));
      case 'h2h':
        return miniValues(c, group, group, results.filter((m) => inGroup.has(m.side1) && inGroup.has(m.side2)));
      case 'above': {
        if (above == null) return null;
        const games = results.filter((m) => (m.side1 === above && inGroup.has(m.side2)) || (m.side2 === above && inGroup.has(m.side1)));
        if (!games.length) return null;
        return miniValues(c, group, [...group, above], games);
      }
      case 'lot':
        return group.map((id) => lotValue(id, c.seed));
    }
  };

  const order = (group: readonly string[], start: number, above: string | null): Placed[] => {
    if (group.length === 1) return [{ id: group[0], tiedWithPrev: false }];
    for (let i = start; i < criteria.length; i++) {
      const c = criteria[i];
      const values = valuesFor(c, group, above);
      if (!values) continue;
      const asc = c.scope === 'lot' ? true : !!c.asc;
      const idx = group.map((_, k) => k).sort((a, b) => (asc ? values[a] - values[b] : values[b] - values[a]) || a - b);
      const parts: string[][] = [];
      idx.forEach((k, pos) => {
        if (pos > 0 && values[k] === values[idx[pos - 1]]) parts[parts.length - 1].push(group[k]);
        else parts.push([group[k]]);
      });
      if (parts.length === 1) continue;
      const label = typeof c.label === 'function' ? c.label(group.length) : c.label;
      const next = restart === 'always' || c.scope === 'h2h' ? 0 : i + 1;
      const placed: Placed[] = [];
      let prevAbove = above;
      parts.forEach((p, k) => {
        const sub = p.length === 1 ? [{ id: p[0], tiedWithPrev: false } as Placed] : order(p, next, prevAbove);
        if (k > 0) sub[0] = { ...sub[0], decidedBy: label, tiedWithPrev: false };
        placed.push(...sub);
        prevAbove = placed[placed.length - 1].id;
      });
      return placed;
    }
    // Nadie lo rompe: comparten puesto.
    return group.map((id, k) => ({ id, tiedWithPrev: k > 0 }));
  };

  const placed = order(rows.map((r) => r.id), 0, null);
  const out: StandingRow[] = [];
  placed.forEach((p, i) => {
    const row: StandingRow = { ...byId.get(p.id)!, extra: { ...byId.get(p.id)!.extra }, rank: p.tiedWithPrev ? out[i - 1].rank : i + 1 };
    delete row.decidedBy;
    if (p.decidedBy) row.decidedBy = p.decidedBy;
    out.push(row);
  });
  return out;
}

/** Criterios listos para armar listas de desempate. */
export const tiebreak = {
  points: (label = 'puntos'): TieCriterion => ({ label, scope: 'all', value: (r) => r.points }),
  wins: (label = 'partidos ganados'): TieCriterion => ({ label, scope: 'all', value: (r) => r.won }),
  diff: (label = 'diferencia'): TieCriterion => ({ label, scope: 'all', value: (r) => r.diff }),
  for: (label = 'a favor'): TieCriterion => ({ label, scope: 'all', value: (r) => r.for }),
  /** Un número de `extra` (p. ej. 'setsDiff'). */
  stat: (key: string, label: string, asc = false): TieCriterion => ({ label, scope: 'all', value: (r) => r.extra[key] ?? 0, asc }),
  /** Minitabla entre los empatados; por defecto compara sus puntos de tabla en esos partidos. */
  h2h: (value: (r: StandingRow) => number = (r) => r.points, label: TieCriterion['label'] = h2hLabel): TieCriterion => ({
    label,
    scope: 'h2h',
    value,
  }),
  /** Partidos contra el que quedó justo arriba del grupo empatado. */
  vsAbove: (value: (r: StandingRow) => number, label: string): TieCriterion => ({ label, scope: 'above', value }),
  lot: (seed = ''): TieCriterion => ({ label: 'sorteo', scope: 'lot', seed }),
};

function h2hLabel(tied: number): string {
  return tied === 2 ? 'enfrentamiento directo' : 'minitabla';
}

/** Tabla completa: filas + desempates de la configuración. */
export function standings(ids: readonly string[], results: readonly MatchResult[], config: TableConfig): StandingRow[] {
  const build: RowBuilder = (i, r) => buildRows(i, r, config.points, config.primary);
  return resolveTies(build(ids, results), results, config.criteria, { build, restart: config.restart });
}

// ---------------------------------------------------------------------------------------------------------
// Pádel y tenis

/** Ganar 3, perder 1, no presentarse 0. */
export const RACKET_POINTS: PointsRule = { win: 3, draw: 0, loss: 1, walkoverLoss: 0 };
/** Alternativa: ganar 2, perder 0. */
export const RACKET_POINTS_2_0: PointsRule = { win: 2, draw: 0, loss: 0, walkoverLoss: 0 };

/**
 * Pádel y tenis. Totales esperados en MatchResult: `sets` y `games` (ver `racketMatchResult`).
 * Orden: puntos → enfrentamiento directo (2 empatados) o minitabla (3 o más), repetida con los que sigan
 * empatados → dif. de sets → dif. de juegos → juegos a favor → sorteo.
 */
export function racketTable(points: PointsRule = RACKET_POINTS, lotSeed = ''): TableConfig {
  return {
    points,
    primary: 'games',
    criteria: [
      tiebreak.points(),
      tiebreak.h2h(),
      tiebreak.stat('setsDiff', 'dif. de sets'),
      tiebreak.stat('gamesDiff', 'dif. de juegos'),
      tiebreak.stat('gamesFor', 'juegos a favor'),
      tiebreak.lot(lotSeed),
    ],
  };
}

export function racketStandings(ids: readonly string[], results: readonly MatchResult[], opts: { points?: PointsRule; lotSeed?: string } = {}): StandingRow[] {
  return standings(ids, results, racketTable(opts.points, opts.lotSeed));
}

export interface RacketResultInput {
  id: string;
  side1: string;
  side2: string;
  /** Juegos de cada set en el orden jugado. Un súper tie-break va con sus puntos, p. ej. [10, 7]. */
  sets: readonly (readonly [number, number])[];
  winner: Side;
  /** normal, retiro (el perdedor no terminó) o W.O. (el perdedor no se presentó). */
  status?: 'normal' | 'retired' | 'walkover';
  /** Juegos para ganar un set (6; 4 en sets cortos). */
  gamesPerSet?: number;
  /** Sets para ganar el partido (2 = al mejor de 3). */
  setsToWin?: number;
  /** El set decisivo es un súper tie-break a 10 (pádel amateur). */
  superTiebreak?: boolean;
  /** Marcador que se anota en un W.O., a favor del que se presentó. Por defecto 6-0 6-0. [] = sin sets ni juegos. */
  walkoverSets?: readonly (readonly [number, number])[];
}

/**
 * MatchResult de raqueta con totales `sets` y `games`.
 *
 * Reglas para la tabla:
 * - El súper tie-break cuenta como un set y como un juego (1-0), no por sus puntos.
 * - W.O.: el presente gana `walkoverSets` (6-0 6-0) y el ausente queda con `walkover` (0 puntos de tabla).
 * - Retiro: gana el rival y, para la tabla, se completa el set en juego a favor del ganador (6-x si el perdedor
 *   tenía 4 o menos, 7-5 si tenía 5, 7-6 si tenía 6; en un súper tie-break, 10-x o por 2) y cada set que le
 *   falte para ganar el partido se le da 6-0 (o súper tie-break 1-0 en juegos si el decisivo lo es).
 */
export function racketMatchResult(input: RacketResultInput): MatchResult {
  const gps = input.gamesPerSet ?? 6;
  const toWin = input.setsToWin ?? 2;
  const w = input.winner;
  const wi = w === 1 ? 0 : 1;
  const li = 1 - wi;
  const decider = toWin * 2 - 1;

  const status = input.status ?? 'normal';
  if (status === 'walkover') {
    const sets = (input.walkoverSets ?? [
      [6, 0],
      [6, 0],
    ]).map((s) => (w === 1 ? [s[0], s[1]] : [s[1], s[0]]) as [number, number]);
    return withTotals(input, sets, false, w);
  }

  const sets = input.sets.map((s) => [s[0], s[1]] as [number, number]);
  const isTb = (i: number) => !!input.superTiebreak && i === decider - 1;
  const setDone = (s: [number, number], i: number) => {
    const hi = Math.max(s[0], s[1]);
    const diff = Math.abs(s[0] - s[1]);
    if (isTb(i)) return hi >= 10 && diff >= 2;
    return (hi >= gps && diff >= 2) || hi === gps + 1;
  };

  if (status === 'retired') {
    const last = sets.length - 1;
    if (last >= 0 && !setDone(sets[last], last)) {
      const s = sets[last];
      if (isTb(last)) s[wi] = Math.max(10, s[li] + 2);
      else if (s[li] >= gps) {
        s[wi] = gps + 1;
        s[li] = gps;
      } else s[wi] = Math.max(s[wi], s[li] === gps - 1 ? gps + 1 : gps);
    }
    const won = () => sets.filter((s, i) => setDone(s, i) && s[wi] > s[li]).length;
    while (won() < toWin && sets.length < decider) {
      const i = sets.length;
      const s: [number, number] = [0, 0];
      s[wi] = isTb(i) ? 10 : gps;
      sets.push(s);
    }
  }
  return withTotals(input, sets, !!input.superTiebreak, undefined);
}

function withTotals(input: RacketResultInput, sets: [number, number][], superTb: boolean, walkoverWinner: Side | undefined): MatchResult {
  const decider = (input.setsToWin ?? 2) * 2 - 1;
  const setsWon: [number, number] = [0, 0];
  const games: [number, number] = [0, 0];
  sets.forEach((s, i) => {
    if (s[0] === s[1]) return;
    const winnerIdx = s[0] > s[1] ? 0 : 1;
    setsWon[winnerIdx]++;
    if (superTb && i === decider - 1) games[winnerIdx]++;
    else {
      games[0] += s[0];
      games[1] += s[1];
    }
  });
  const result: MatchResult = { id: input.id, side1: input.side1, side2: input.side2, winner: input.winner, totals: { sets: setsWon, games } };
  if (walkoverWinner) result.walkover = walkoverWinner === 1 ? 2 : 1;
  return result;
}

// ---------------------------------------------------------------------------------------------------------
// Pickleball

/** Pickleball: la tabla cuenta partidos ganados (1 por victoria). */
export const PICKLEBALL_POINTS: PointsRule = { win: 1, draw: 0, loss: 0, walkoverLoss: 0 };

/**
 * Round robin de USA Pickleball. Fuente: 2026 USA Pickleball Rulebook, regla 15.B.4 (antes 12.C.4 en 2025),
 * según el «2026 Rulebook Change Document»: gana quien más partidos gana; los empates se rompen en este orden
 * y «el método que rompe el empate ordena a todos los empatados» (los que sigan empatados vuelven a empezar):
 * 1. partidos ganados entre los empatados;
 * 2. diferencia de puntos de todos los juegos;
 * 3. diferencia de puntos entre los empatados;
 * 4. diferencia de puntos contra el equipo que quedó justo arriba;
 * 5. puntos a favor de todo el round robin (nuevo en 2026).
 * Al final, sorteo. Totales esperados en MatchResult: `points` (y opcional `games`).
 */
export function pickleballTable(points: PointsRule = PICKLEBALL_POINTS, lotSeed = ''): TableConfig {
  const pd = (r: StandingRow) => r.extra.pointsDiff ?? 0;
  return {
    points,
    primary: 'points',
    criteria: [
      tiebreak.points('partidos ganados'),
      tiebreak.h2h(
        (r) => r.won,
        (n) => (n === 2 ? 'enfrentamiento directo' : 'ganados entre empatados'),
      ),
      tiebreak.stat('pointsDiff', 'dif. de puntos'),
      tiebreak.h2h(pd, 'dif. de puntos entre empatados'),
      tiebreak.vsAbove(pd, 'dif. de puntos contra el de arriba'),
      tiebreak.stat('pointsFor', 'puntos a favor'),
      tiebreak.lot(lotSeed),
    ],
  };
}

export function pickleballStandings(ids: readonly string[], results: readonly MatchResult[], opts: { points?: PointsRule; lotSeed?: string } = {}): StandingRow[] {
  return standings(ids, results, pickleballTable(opts.points, opts.lotSeed));
}

/**
 * MatchResult de pickleball con totales `games` y `points` desde los juegos ([11, 7], [9, 11], …).
 * W.O.: `walkover` = el lado que no se presentó; se anotan `walkoverGames` (por defecto un 11-0) a favor del otro.
 */
export function pickleballMatchResult(input: {
  id: string;
  side1: string;
  side2: string;
  games: readonly (readonly [number, number])[];
  walkover?: Side;
  walkoverGames?: readonly (readonly [number, number])[];
}): MatchResult {
  let games = input.games.map((g) => [g[0], g[1]] as [number, number]);
  if (input.walkover) {
    const present = input.walkover === 1 ? 2 : 1;
    games = (input.walkoverGames ?? [[11, 0]]).map((g) => (present === 1 ? [g[0], g[1]] : [g[1], g[0]]) as [number, number]);
  }
  const won: [number, number] = [0, 0];
  const pts: [number, number] = [0, 0];
  for (const g of games) {
    if (g[0] !== g[1]) won[g[0] > g[1] ? 0 : 1]++;
    pts[0] += g[0];
    pts[1] += g[1];
  }
  const winner: Side | null = input.walkover ? (input.walkover === 1 ? 2 : 1) : won[0] === won[1] ? null : won[0] > won[1] ? 1 : 2;
  const result: MatchResult = { id: input.id, side1: input.side1, side2: input.side2, winner, totals: { games: won, points: pts } };
  if (input.walkover) result.walkover = input.walkover;
  return result;
}
