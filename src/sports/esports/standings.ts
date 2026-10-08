/**
 * Tablas de esports (docs/esports.md §3.3, D9).
 *
 * - Series por equipos y 1 contra 1 (menos FC): ganar la serie 3, perder 0 → dif. de mapas/juegos → dif. de
 *   rondas/goles/puntos/kills (según el juego) → enfrentamiento directo → sorteo.
 * - EA SPORTS FC (como el fútbol): ganar 3, empatar 1, perder 0 → dif. de goles → goles a favor → enfrentamiento
 *   directo → sorteo.
 * - Battle royale: puntos acumulados (puesto + kills) → victorias → kills → mejor puesto en la última partida → sorteo.
 *
 * Usa `standings`/`tiebreak` de `formats/standings.ts`.
 */
import { lotValue } from '../formats/random';
import { standings, tiebreak, type PointsRule, type TableConfig } from '../formats/standings';
import type { MatchResult, Side, StandingRow } from '../types';
import { GAMES, type GameId } from './catalog';
import { needed, type SeriesScore } from './series';

/** Una serie terminada, con los lados ya como ids de inscritos (esports_entries.id). */
export interface SeriesResultInput {
  id: string;
  side1: string;
  side2: string;
  /** null = empate (FC). */
  winner: Side | null;
  /** Lado que no vino (0 = ninguno de los dos). */
  walkover?: 0 | 1 | 2 | null;
  score: SeriesScore | null;
}

/** Un W.O. doble: los dos pierden con 0 puntos (no cuenta como empate). */
interface NoContest extends MatchResult {
  noContest: true;
}
const isNoContest = (m: MatchResult): m is NoContest => (m as Partial<NoContest>).noContest === true;

/**
 * El resultado para la tabla, con totales `maps` (mapas o juegos ganados) y `points` (rondas, goles, puntos, kills…).
 * W.O.: el que vino gana `need` a 0 en mapas y 0-0 en puntos; el que no vino queda con `walkover`. W.O. doble: los
 * dos pierden (ver `esportsStandings`).
 */
export function seriesMatchResult(m: SeriesResultInput): MatchResult {
  const base = { id: m.id, side1: m.side1, side2: m.side2 };
  const need = needed(m.score?.bestOf ?? 1);
  if (m.walkover === 1 || m.walkover === 2) {
    const present: Side = m.walkover === 1 ? 2 : 1;
    return {
      ...base,
      winner: present,
      walkover: m.walkover,
      totals: { maps: present === 1 ? [need, 0] : [0, need], points: [0, 0] },
    };
  }
  if (m.walkover === 0) {
    const nc: NoContest = { ...base, winner: null, totals: { maps: [0, 0], points: [0, 0] }, noContest: true };
    return nc;
  }
  const maps = m.score?.totals?.maps ?? m.score?.sides ?? [0, 0];
  const points = m.score?.totals?.points ?? [0, 0];
  return { ...base, winner: m.winner, totals: { maps: [maps[0], maps[1]], points: [points[0], points[1]] } };
}

/** Ganar la serie 3, perder 0. */
export const ESPORTS_POINTS: PointsRule = { win: 3, draw: 0, loss: 0, walkoverLoss: 0 };
/** EA SPORTS FC: ganar 3, empatar 1, perder 0. */
export const FC_POINTS: PointsRule = { win: 3, draw: 1, loss: 0, walkoverLoss: 0 };

/** Configuración de la tabla del juego (primario: mapas; FC: goles). */
export function esportsTable(game: GameId, lotSeed = ''): TableConfig {
  if (game === 'ea_fc') {
    return {
      points: FC_POINTS,
      primary: 'points',
      criteria: [tiebreak.points(), tiebreak.stat('pointsDiff', 'dif. de goles'), tiebreak.stat('pointsFor', 'goles a favor'), tiebreak.h2h(), tiebreak.lot(lotSeed)],
      restart: 'h2h',
    };
  }
  const meta = GAMES[game];
  return {
    points: ESPORTS_POINTS,
    primary: 'maps',
    criteria: [
      tiebreak.points(),
      tiebreak.stat('mapsDiff', `dif. de ${meta.mapsWord}`),
      tiebreak.stat('pointsDiff', `dif. de ${meta.pointsWord}`),
      tiebreak.h2h(),
      tiebreak.lot(lotSeed),
    ],
    restart: 'h2h',
  };
}

/**
 * Tabla de un grupo o liga. `results` sale de `seriesMatchResult`. Un W.O. doble cuenta como jugado y perdido
 * para los dos (0 puntos), sin tocar el orden.
 */
export function esportsStandings(game: GameId, ids: readonly string[], results: readonly MatchResult[], lotSeed?: string): StandingRow[] {
  const played = results.filter((r) => !isNoContest(r));
  const rows = standings(ids, played, esportsTable(game, lotSeed ?? ''));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of results) {
    if (!isNoContest(r) || r.side1 === r.side2) continue;
    const a = byId.get(r.side1);
    const b = byId.get(r.side2);
    if (!a || !b) continue;
    for (const row of [a, b]) {
      row.played++;
      row.lost++;
      row.extra.walkovers = (row.extra.walkovers ?? 0) + 1;
    }
  }
  return rows;
}

/** El orden de desempate en una línea, con las palabras del juego. */
export function tiebreakText(game: GameId): string {
  if (game === 'ea_fc') return 'Orden (como el fútbol): ganar 3, empatar 1, perder 0 → dif. de goles → goles a favor → enfrentamiento directo → sorteo.';
  const meta = GAMES[game];
  return `Orden: ganar la serie 3, perder 0 → dif. de ${meta.mapsWord} → dif. de ${meta.pointsWord} → enfrentamiento directo → sorteo.`;
}

// ---------------------------------------------------------------------------------------------------------
// Battle royale

export interface BrResultInput {
  entryId: string;
  /** null = no jugó. */
  placement: number | null;
  kills: number;
}
export interface BrGameInput {
  id: string;
  round: number;
  gameNo: number;
  status: 'scheduled' | 'finished' | 'void';
  results: readonly BrResultInput[];
}
export interface BrPoints {
  placementPoints: readonly number[];
  killPoints: number;
}
export interface BrRow {
  entryId: string;
  rank: number;
  points: number;
  placementPoints: number;
  killPoints: number;
  kills: number;
  /** Partidas ganadas (1.er puesto). */
  wins: number;
  played: number;
  /** Puesto en la última partida terminada (null si no la jugó). */
  lastPlacement: number | null;
  /** Qué separó al de arriba con los mismos puntos: «victorias», «kills», «última partida», «sorteo». */
  decidedBy?: string;
}

/** Puntos de una partida: los del puesto (0 si no jugó o si el puesto no está en la lista) + kills × puntos por kill. */
export const brPointsOf = (p: BrPoints, placement: number | null, kills: number): number =>
  (placement != null && placement >= 1 ? (p.placementPoints[placement - 1] ?? 0) : 0) + (kills || 0) * p.killPoints;

/**
 * Tabla acumulada de battle royale: solo partidas `finished` (las anuladas y las por jugar no cuentan). Orden: puntos
 * → victorias → kills → mejor puesto en la última partida terminada (menor es mejor; sin jugarla, al final) → sorteo
 * (`lotValue(entryId, lotSeed)`). El sorteo siempre decide: nadie comparte puesto.
 */
export function brStandings(entryIds: readonly string[], games: readonly BrGameInput[], points: BrPoints, lotSeed = ''): BrRow[] {
  const rows = new Map<string, BrRow>();
  for (const id of entryIds) {
    if (!rows.has(id)) rows.set(id, { entryId: id, rank: 0, points: 0, placementPoints: 0, killPoints: 0, kills: 0, wins: 0, played: 0, lastPlacement: null });
  }
  const finished = games.filter((g) => g.status === 'finished').slice().sort((a, b) => a.round - b.round || a.gameNo - b.gameNo);
  const last = finished[finished.length - 1];
  for (const g of finished) {
    for (const r of g.results) {
      const row = rows.get(r.entryId);
      if (!row) continue;
      const kills = Number.isFinite(r.kills) ? r.kills : 0;
      const pp = brPointsOf({ placementPoints: points.placementPoints, killPoints: 0 }, r.placement, 0);
      const kp = kills * points.killPoints;
      row.placementPoints += pp;
      row.killPoints += kp;
      row.points += pp + kp;
      row.kills += kills;
      if (r.placement != null) {
        row.played++;
        if (r.placement === 1) row.wins++;
      }
      if (g === last) row.lastPlacement = r.placement ?? null;
    }
  }

  type Crit = { label: string; cmp: (a: BrRow, b: BrRow) => number };
  const lastKey = (r: BrRow) => (r.lastPlacement == null ? Infinity : r.lastPlacement);
  const criteria: Crit[] = [
    { label: 'victorias', cmp: (a, b) => b.wins - a.wins },
    { label: 'kills', cmp: (a, b) => b.kills - a.kills },
    { label: 'última partida', cmp: (a, b) => (lastKey(a) === lastKey(b) ? 0 : lastKey(a) < lastKey(b) ? -1 : 1) },
    { label: 'sorteo', cmp: (a, b) => lotValue(a.entryId, lotSeed) - lotValue(b.entryId, lotSeed) || (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0) },
  ];
  const sorted = [...rows.values()].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (const c of criteria) {
      const d = c.cmp(a, b);
      if (d) return d;
    }
    return 0;
  });
  return sorted.map((row, i) => {
    const out: BrRow = { ...row, rank: i + 1 };
    const prev = sorted[i - 1];
    if (prev && prev.points === row.points) {
      const c = criteria.find((k) => k.cmp(prev, row) !== 0);
      if (c) out.decidedBy = c.label;
    }
    return out;
  });
}

/** Texto del orden de la tabla BR, para la «i». */
export const BR_TIEBREAK_TEXT = 'Orden: puntos (puesto + kills) → victorias → kills → mejor puesto en la última partida → sorteo.';
