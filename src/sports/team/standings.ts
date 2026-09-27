/**
 * Tablas de posiciones de baloncesto (FIBA) y fútbol/sala, con los desempates recursivos de
 * src/sports/formats/standings.ts (`resolveTies`) y la regla que decidió cada puesto en `decidedBy`.
 *
 * Baloncesto (Reglamento FIBA 2024, Art. 20, Art. 21 y Apéndice D):
 * - Ganar 2, perder 1, perder por forfeit 0 (el forfeit se anota 20-0).
 * - Default (Art. 21.2): si el ganador iba arriba se queda el marcador, si no, 2-0; y el que se quedó sin
 *   jugadores "recibe 1 punto de clasificación" (como una derrota normal), no 0 como en el forfeit.
 *   Fuente: FIBA Official Basketball Rules 2024, Art. 21.2.1 y Apéndice D.1.1 (1 punto por partido perdido,
 *   "incluido el perdido por default", y 0 por el perdido por forfeit).
 * - Desempate (D.1): puntos de tabla entre los empatados → diferencia entre ellos → puntos a favor entre ellos
 *   → diferencia general → puntos a favor generales. Si quedan menos empatados (por el criterio que sea),
 *   se vuelve a empezar con ellos (si quedan 2, decide el partido entre ellos).
 *
 * Fútbol y sala: ganar 3, empatar 1, perder 0; W.O. 3-0. Los penales no cuentan para goles ni puntos
 * (salvo que la liga dé puntos por la tanda). Desempates configurables; por defecto:
 * diferencia de goles → goles a favor → enfrentamiento directo → juego limpio → sorteo.
 * Estilo FIFA/UEFA: solo se vuelve a empezar cuando separa un criterio entre empatados (minitabla).
 * Juego limpio FIFA, por jugador y partido: amarilla −1, doble amarilla −3, roja directa −4, amarilla + roja −5.
 */

import { resolveTies, tiebreak, type RowBuilder, type TieCriterion } from '../formats/standings';
import type { MatchResult, Side, StandingRow } from '../types';

/** Resultado de un partido de equipos (lo que devuelven basketballMatchResult y footballMatchResult). */
export interface TeamMatchResult extends MatchResult {
  /** Baloncesto (Art. 21): el equipo que se quedó con menos de 2 jugadores en cancha. */
  defaulted?: Side;
}

interface Game {
  ids: [string, string];
  score: [number, number];
  /** Puntos de tabla de cada lado. */
  pts: [number, number];
  /** 0 = empate. */
  outcome: 0 | Side;
  fair: [number, number];
  yellow: [number, number];
  red: [number, number];
  walkover?: Side;
  defaulted?: Side;
  shootoutWinner?: Side;
}

const other = (s: Side): Side => (s === 1 ? 2 : 1);
const oriented = (winner: Side, n: number): [number, number] => (winner === 1 ? [n, 0] : [0, n]);

/** Filas sin ordenar para `ids` con esos partidos. Sirve para la tabla completa y para la minitabla. */
function rowsOf(ids: readonly string[], games: readonly Game[], extraKeys: readonly string[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, for: 0, against: 0, diff: 0, extra: Object.fromEntries(extraKeys.map((k) => [k, 0])), rank: 0 };
      rows.set(id, r);
    }
    return r;
  };
  ids.forEach(row);
  for (const g of games) {
    [0, 1].forEach((i) => {
      const r = row(g.ids[i]);
      r.played++;
      if (g.outcome === 0) r.drawn++;
      else if (g.outcome === i + 1) r.won++;
      else r.lost++;
      r.points += g.pts[i];
      r.for += g.score[i];
      r.against += g.score[1 - i];
      r.diff = r.for - r.against;
      if ('yellow' in r.extra) r.extra.yellow += g.yellow[i];
      if ('red' in r.extra) r.extra.red += g.red[i];
      if ('fairPlay' in r.extra) r.extra.fairPlay += g.fair[i];
      if (g.walkover === i + 1) {
        if ('walkovers' in r.extra) r.extra.walkovers++;
        if ('forfeits' in r.extra) r.extra.forfeits++;
      }
      if (g.defaulted === i + 1 && 'defaults' in r.extra) r.extra.defaults++;
      if (g.shootoutWinner === i + 1 && 'shootoutWins' in r.extra) r.extra.shootoutWins++;
    });
  }
  return [...rows.values()];
}

/**
 * Arma la tabla y la ordena con `resolveTies` de src/sports/formats (minitabla recursiva entre empatados).
 * La minitabla usa las mismas reglas de puntos (forfeit, default, W.O., penales) que la tabla completa.
 */
function buildTable(
  teams: readonly string[],
  results: readonly MatchResult[],
  gameOf: (r: MatchResult) => Game | null,
  criteria: readonly TieCriterion[],
  restart: 'always' | 'h2h',
  extraKeys: readonly string[],
): StandingRow[] {
  const games = (rs: readonly MatchResult[]) => rs.map(gameOf).filter((g): g is Game => g !== null);
  const valid = results.filter((r) => gameOf(r) !== null);
  const build: RowBuilder = (ids, rs) => rowsOf(ids, games(rs), extraKeys);
  return resolveTies(build(teams, valid), valid, criteria, { build, restart });
}

/** Sorteo: el orden que ya salió (`lot`) y, si se pide, uno automático con semilla (`lotSeed`, p. ej. el id de la liga). */
function lotCriteria(lot: readonly string[], lotSeed: string | null): TieCriterion[] {
  const out: TieCriterion[] = [];
  // Los que no están en la lista quedan empatados entre ellos (valor muy bajo, no -Infinity, para que la resta dé bien).
  if (lot.length) out.push({ label: 'sorteo', scope: 'all', value: (r) => (lot.includes(r.id) ? -lot.indexOf(r.id) : -1e9) });
  if (lotSeed !== null) out.push(tiebreak.lot(lotSeed));
  return out;
}

// ── Baloncesto ─────────────────────────────────────────────────────────────

export interface BasketballTableConfig {
  win: number;
  loss: number;
  /** Puntos del que pierde por forfeit (no se presentó): 0. */
  forfeitLoss: number;
  /** Puntos del que pierde por default (se quedó sin jugadores): 1. */
  defaultLoss: number;
  /** Marcador del forfeit: 20-0. */
  forfeitScore: number;
  /** Orden del sorteo si ya se hizo (último recurso). */
  lot: string[];
  /** Sorteo automático con semilla después de `lot`; null = los empatados comparten puesto. */
  lotSeed: string | null;
}

export const FIBA_TABLE: BasketballTableConfig = { win: 2, loss: 1, forfeitLoss: 0, defaultLoss: 1, forfeitScore: 20, lot: [], lotSeed: null };

function basketballGame(r: TeamMatchResult, cfg: BasketballTableConfig): Game | null {
  if (r.side1 === r.side2) return null;
  const ids: [string, string] = [r.side1, r.side2];
  const base = { ids, fair: [0, 0] as [number, number], yellow: [0, 0] as [number, number], red: [0, 0] as [number, number] };
  if (r.walkover) {
    const w = other(r.walkover);
    return { ...base, score: oriented(w, cfg.forfeitScore), pts: w === 1 ? [cfg.win, cfg.forfeitLoss] : [cfg.forfeitLoss, cfg.win], outcome: w, walkover: r.walkover };
  }
  let score: [number, number] = [...(r.totals.points ?? [0, 0])] as [number, number];
  if (r.defaulted) {
    const w = other(r.defaulted);
    if (score[w - 1] <= score[r.defaulted - 1]) score = oriented(w, 2);
    return { ...base, score, pts: w === 1 ? [cfg.win, cfg.defaultLoss] : [cfg.defaultLoss, cfg.win], outcome: w, defaulted: r.defaulted };
  }
  const w: Side | null = score[0] > score[1] ? 1 : score[1] > score[0] ? 2 : r.winner;
  if (w === null) return null; // en baloncesto no hay empates: un partido sin ganador no cuenta
  return { ...base, score, pts: w === 1 ? [cfg.win, cfg.loss] : [cfg.loss, cfg.win], outcome: w };
}

/**
 * Tabla FIBA. `teams` pone a todos (también los que no han jugado) y el orden de salida de los empatados.
 * `results`: partidos terminados, con `totals.points`. extra: forfeits (perdidos por forfeit), defaults.
 */
export function basketballStandings(teams: readonly string[], results: readonly TeamMatchResult[], config: Partial<BasketballTableConfig> = {}): StandingRow[] {
  const cfg = { ...FIBA_TABLE, ...config };
  return buildTable(
    teams,
    results,
    (r) => basketballGame(r, cfg),
    [
      tiebreak.points('puntos'),
      tiebreak.h2h((r) => r.points, 'resultado entre ellos'),
      tiebreak.h2h((r) => r.diff, 'dif. entre ellos'),
      tiebreak.h2h((r) => r.for, 'puntos a favor entre ellos'),
      tiebreak.diff('dif. de puntos'),
      tiebreak.for('puntos a favor'),
      ...lotCriteria(cfg.lot, cfg.lotSeed),
    ],
    'always',
    ['forfeits', 'defaults'],
  );
}

// ── Fútbol y sala ──────────────────────────────────────────────────────────

export type FootballTieBreak = 'diff' | 'for' | 'wins' | 'h2h' | 'h2h_points' | 'h2h_diff' | 'h2h_for' | 'fair_play' | 'lot';

/** Puntos de juego limpio por jugador y partido (negativos: más cerca de 0 es mejor). */
export interface FairPlayWeights {
  yellow: number;
  secondYellow: number;
  red: number;
  yellowRed: number;
}

export interface FootballTableConfig {
  win: number;
  draw: number;
  loss: number;
  /** Puntos del que no se presentó (0; hay ligas que restan). */
  walkoverLoss: number;
  /** Marcador del W.O. (3-0). */
  walkoverScore: number;
  /** Ligas que desempatan con penales: puntos para el ganador y el perdedor de la tanda (en vez del empate). */
  shootout: { win: number; loss: number } | null;
  /** Orden de desempate después de los puntos. 'h2h' = puntos, dif. y goles a favor entre ellos. */
  tiebreak: FootballTieBreak[];
  fairPlay: FairPlayWeights;
  /** Orden del sorteo si ya se hizo (se usa donde esté 'lot' en `tiebreak`). */
  lot: string[];
  /** Sorteo automático con semilla después de `lot`; null = los empatados comparten puesto. */
  lotSeed: string | null;
}

export const FAIR_PLAY_FIFA: FairPlayWeights = { yellow: -1, secondYellow: -3, red: -4, yellowRed: -5 };

export const FOOTBALL_TABLE: FootballTableConfig = {
  win: 3,
  draw: 1,
  loss: 0,
  walkoverLoss: 0,
  walkoverScore: 3,
  shootout: null,
  tiebreak: ['diff', 'for', 'h2h', 'fair_play', 'lot'],
  fairPlay: FAIR_PLAY_FIFA,
  lot: [],
  lotSeed: null,
};

/** Juego limpio de un lado a partir de los totales del partido (ver footballMatchResult). */
function fairPlayOf(t: Record<string, [number, number]>, i: 0 | 1, w: FairPlayWeights): number {
  if (t.cardsYellow || t.cardsSecondYellow || t.cardsRed || t.cardsYellowRed) {
    const n = (k: string) => t[k]?.[i] ?? 0;
    return n('cardsYellow') * w.yellow + n('cardsSecondYellow') * w.secondYellow + n('cardsRed') * w.red + n('cardsYellowRed') * w.yellowRed;
  }
  // Sin detalle por jugador: amarillas y rojas sueltas.
  return (t.yellow?.[i] ?? 0) * w.yellow + (t.red?.[i] ?? 0) * w.red;
}

function footballGame(r: TeamMatchResult, cfg: FootballTableConfig): Game | null {
  if (r.side1 === r.side2) return null;
  const ids: [string, string] = [r.side1, r.side2];
  const t = r.totals;
  const yellow: [number, number] = [t.yellow?.[0] ?? 0, t.yellow?.[1] ?? 0];
  const red: [number, number] = [t.red?.[0] ?? 0, t.red?.[1] ?? 0];
  const fair: [number, number] = [fairPlayOf(t, 0, cfg.fairPlay), fairPlayOf(t, 1, cfg.fairPlay)];
  if (r.walkover) {
    const w = other(r.walkover);
    return { ids, score: oriented(w, cfg.walkoverScore), pts: w === 1 ? [cfg.win, cfg.walkoverLoss] : [cfg.walkoverLoss, cfg.win], outcome: w, fair: [0, 0], yellow, red, walkover: r.walkover };
  }
  const score: [number, number] = [t.goals?.[0] ?? 0, t.goals?.[1] ?? 0];
  if (score[0] !== score[1]) {
    const w: Side = score[0] > score[1] ? 1 : 2;
    return { ids, score, pts: w === 1 ? [cfg.win, cfg.loss] : [cfg.loss, cfg.win], outcome: w, fair, yellow, red };
  }
  const pens = t.shootout;
  if (cfg.shootout && pens && pens[0] !== pens[1]) {
    const w: Side = pens[0] > pens[1] ? 1 : 2;
    return { ids, score, pts: w === 1 ? [cfg.shootout.win, cfg.shootout.loss] : [cfg.shootout.loss, cfg.shootout.win], outcome: 0, fair, yellow, red, shootoutWinner: w };
  }
  return { ids, score, pts: [cfg.draw, cfg.draw], outcome: 0, fair, yellow, red };
}

const FOOTBALL_LABELS: Record<Exclude<FootballTieBreak, 'h2h'>, string> = {
  diff: 'dif. de goles',
  for: 'goles a favor',
  wins: 'partidos ganados',
  h2h_points: 'enfrentamiento directo',
  h2h_diff: 'dif. de goles entre ellos',
  h2h_for: 'goles a favor entre ellos',
  fair_play: 'juego limpio',
  lot: 'sorteo',
};

/**
 * Tabla de fútbol o sala. `results`: partidos terminados con `totals.goals` (y tarjetas para el juego limpio).
 * extra: yellow, red, fairPlay, walkovers (W.O. en contra), shootoutWins.
 */
export function footballStandings(teams: readonly string[], results: readonly TeamMatchResult[], config: Partial<FootballTableConfig> = {}): StandingRow[] {
  const cfg = { ...FOOTBALL_TABLE, ...config };
  const keys = cfg.tiebreak.flatMap((k): Exclude<FootballTieBreak, 'h2h'>[] => (k === 'h2h' ? ['h2h_points', 'h2h_diff', 'h2h_for'] : [k]));
  const criteria = keys.flatMap((k): TieCriterion[] => {
    const label = FOOTBALL_LABELS[k];
    switch (k) {
      case 'diff':
        return [tiebreak.diff(label)];
      case 'for':
        return [tiebreak.for(label)];
      case 'wins':
        return [tiebreak.wins(label)];
      case 'h2h_points':
        return [tiebreak.h2h((r) => r.points, label)];
      case 'h2h_diff':
        return [tiebreak.h2h((r) => r.diff, label)];
      case 'h2h_for':
        return [tiebreak.h2h((r) => r.for, label)];
      case 'fair_play':
        return [tiebreak.stat('fairPlay', label)];
      case 'lot':
        return lotCriteria(cfg.lot, cfg.lotSeed);
    }
  });
  return buildTable(teams, results, (r) => footballGame(r, cfg), [tiebreak.points('puntos'), ...criteria], 'h2h', ['yellow', 'red', 'fairPlay', 'walkovers', 'shootoutWins']);
}
