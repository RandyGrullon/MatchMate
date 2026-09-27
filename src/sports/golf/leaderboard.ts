/**
 * Golf: leaderboard de una ronda o de un torneo de varias rondas, con desempate por countback,
 * y orden de mérito de la temporada.
 *
 * - Orden: menor neto o bruto (contra el par, así sirve a mitad de ronda y con salidas de par distinto)
 *   o mayor Stableford. Los descalificados van al final y sin puesto; los que no han empezado, antes de ellos.
 * - Countback (Procedimientos del Comité 5A(3)), solo cuando todos los empatados terminaron:
 *   con varias rondas primero la última ronda; después los últimos 9, 6, 3 y 1 hoyos de la última ronda.
 *   Siempre por NÚMERO de hoyo (10–18, 13–18, 16–18, 18) aunque hayan salido por otro hoyo (shotgun).
 *   En neto se resta la parte proporcional del handicap de juego (1/2, 1/3, 1/6, 1/18), sin redondear.
 *   En Stableford cuentan los puntos de esos hoyos. Con 9 hoyos: últimos 6, 3 y 1 (6/9, 3/9, 1/9).
 * - Si el countback no decide, comparten el puesto (el comité decide si hace falta un ganador).
 */

import { higherWins, roundValue, scoreRound, type GolfCompetition, type GolfRound, type RoundScore } from './scoring';

export interface GolfPlayerRounds {
  id: string;
  /** Una por ronda del torneo; null = esa ronda aún no la juega. */
  rounds: (GolfRound | null)[];
  /** Descalificado por el comité (tarjeta sin firmar, etc.). */
  dq?: boolean;
}

export interface GolfLeaderRow {
  id: string;
  /** Puesto; null = sin empezar o descalificado. Empates que el countback no rompe comparten puesto. */
  rank: number | null;
  rounds: (RoundScore | null)[];
  /** Lo que ordena: golpes contra el par (neto o bruto) o puntos Stableford. null = sin empezar. */
  value: number | null;
  gross: number | null;
  net: number | null;
  points: number;
  toPar: number | null;
  netToPar: number | null;
  holesPlayed: number;
  /** Hoyos jugados en la ronda en curso (la última empezada). */
  thru: number;
  roundsDone: number;
  /** Todas las rondas del torneo terminadas. */
  complete: boolean;
  dq: boolean;
  /** Qué decidió el puesto frente al de arriba cuando empataban: «última ronda», «últimos 9», «último hoyo»… */
  decidedBy?: string;
}

export interface LeaderboardOptions {
  /** Rondas del torneo (por defecto, la mayor cantidad que traiga un jugador). */
  rounds?: number;
  /** Desempatar por countback (por defecto sí). */
  countback?: boolean;
}

const EPS = 1e-9;

function sumOrNull(xs: (number | null)[]): number | null {
  return xs.some((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b as number), 0);
}

/** Tramos del countback según los hoyos de la ronda: [9, 6, 3, 1] con 18, [6, 3, 1] con 9. */
export function countbackSegments(holes: number): number[] {
  return [9, 6, 3, 1].filter((s) => s < holes);
}

/**
 * Claves del countback de un jugador que terminó, en orden, normalizadas para que MENOR sea mejor.
 */
export function countbackKeys(scores: RoundScore[], comp: GolfCompetition): { label: string; v: number }[] {
  const keys: { label: string; v: number }[] = [];
  const sign = higherWins(comp) ? -1 : 1;
  const last = scores[scores.length - 1];
  if (!last) return keys;
  if (scores.length > 1) keys.push({ label: 'última ronda', v: sign * (roundValue(last, comp) ?? 0) });
  const byNumber = [...last.holes].sort((a, b) => a.number - b.number);
  const n = byNumber.length;
  countbackSegments(n).forEach((s) => {
    const seg = byNumber.slice(n - s);
    const label = s === 1 ? 'último hoyo' : `últimos ${s}`;
    if (comp.format === 'stableford') {
      keys.push({ label, v: -seg.reduce((a, h) => a + (h.points ?? 0), 0) });
      return;
    }
    const toPar = seg.reduce((a, h) => a + (h.score ?? 0) - h.par, 0);
    keys.push({ label, v: toPar - (comp.basis === 'net' ? (last.playingHcp * s) / n : 0) });
  });
  return keys;
}

/** Leaderboard de una ronda o de un torneo (suma de rondas). Cada jugador trae sus hoyos y su handicap de juego. */
export function golfLeaderboard(players: readonly GolfPlayerRounds[], comp: GolfCompetition, opts: LeaderboardOptions = {}): GolfLeaderRow[] {
  const nRounds = opts.rounds ?? Math.max(1, ...players.map((p) => p.rounds.length));
  const useCountback = opts.countback ?? true;
  const higher = higherWins(comp);

  const rows = players.map((p, order) => {
    const rounds = Array.from({ length: nRounds }, (_, i) => p.rounds[i] ?? null);
    const scores = rounds.map((r) => (r ? scoreRound(r, comp) : null));
    const started = scores.filter((s): s is RoundScore => !!s && s.thru > 0);
    const current = [...started].pop();
    const dq = !!p.dq || scores.some((s) => s?.dq);
    const complete = scores.every((s) => s?.complete);
    const value = started.length ? sumOrNull(started.map((s) => roundValue(s, comp))) : null;
    const row: GolfLeaderRow = {
      id: p.id,
      rank: null,
      rounds: scores,
      value: dq ? null : value,
      gross: started.length ? sumOrNull(started.map((s) => s.gross)) : null,
      net: started.length ? sumOrNull(started.map((s) => s.net)) : null,
      points: started.reduce((a, s) => a + s.points, 0),
      toPar: started.length ? sumOrNull(started.map((s) => s.toPar)) : null,
      netToPar: started.length ? sumOrNull(started.map((s) => s.netToPar)) : null,
      holesPlayed: started.reduce((a, s) => a + s.thru, 0),
      thru: current?.thru ?? 0,
      roundsDone: scores.filter((s) => s?.complete).length,
      complete,
      dq,
    };
    const keys = complete && !dq ? countbackKeys(scores as RoundScore[], comp) : null;
    return { row, keys, order };
  });

  const active = rows.filter((r) => !r.row.dq && r.row.value != null);
  const notStarted = rows.filter((r) => !r.row.dq && r.row.value == null);
  const dqs = rows.filter((r) => r.row.dq);
  const norm = (v: number) => (higher ? -v : v);

  active.sort((a, b) => norm(a.row.value!) - norm(b.row.value!) || b.row.holesPlayed - a.row.holesPlayed || a.order - b.order);

  // Grupos con el mismo total. Countback solo si todos los del grupo terminaron.
  const out: GolfLeaderRow[] = [];
  let i = 0;
  while (i < active.length) {
    let j = i + 1;
    while (j < active.length && Math.abs(active[j].row.value! - active[i].row.value!) < EPS) j++;
    const group = active.slice(i, j);
    const rankBase = i + 1;
    if (group.length > 1 && useCountback && group.every((g) => g.keys)) {
      group.sort((a, b) => {
        const ka = a.keys!;
        const kb = b.keys!;
        for (let k = 0; k < Math.min(ka.length, kb.length); k++) {
          const d = ka[k].v - kb[k].v;
          if (Math.abs(d) > EPS) return d;
        }
        return a.order - b.order;
      });
      group.forEach((g, k) => {
        if (k === 0) {
          g.row.rank = rankBase;
          return;
        }
        const prev = group[k - 1];
        const diff = g.keys!.findIndex((key, x) => x < prev.keys!.length && Math.abs(key.v - prev.keys![x].v) > EPS);
        if (diff === -1) g.row.rank = prev.row.rank;
        else {
          g.row.rank = rankBase + k;
          g.row.decidedBy = g.keys![diff].label;
        }
      });
    } else {
      group.forEach((g) => (g.row.rank = rankBase));
    }
    out.push(...group.map((g) => g.row));
    i = j;
  }
  out.push(...notStarted.map((r) => r.row), ...dqs.map((r) => r.row));
  return out;
}

/** Puntos del orden de mérito por puesto (configurable por la liga). */
export const DEFAULT_MERIT_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/**
 * Puntos de un puesto compartido: se suman los puntos de los puestos empatados y se reparten.
 * Empatados 2 en el 2.º con [25, 20, 16] → (20 + 16) / 2 = 18.
 */
export function sharedPoints(place: number, tied: number, table: readonly number[]): number {
  let total = 0;
  for (let k = 0; k < tied; k++) total += table[place - 1 + k] ?? 0;
  return total / tied;
}

export interface MeritRow {
  id: string;
  points: number;
  /** Eventos en que salió en la clasificación. */
  events: number;
  wins: number;
  /** Mejor puesto (null = nunca tuvo puesto). */
  best: number | null;
  rank: number;
}

/** Orden de mérito de la temporada: puntos por puesto en cada evento; empates en el evento reparten puntos. */
export function orderOfMerit(events: readonly { rows: readonly { id: string; rank: number | null }[] }[], table: readonly number[] = DEFAULT_MERIT_POINTS): MeritRow[] {
  const acc = new Map<string, MeritRow>();
  events.forEach((ev) => {
    const tiedAt = new Map<number, number>();
    ev.rows.forEach((r) => r.rank != null && tiedAt.set(r.rank, (tiedAt.get(r.rank) ?? 0) + 1));
    ev.rows.forEach((r) => {
      const m = acc.get(r.id) ?? { id: r.id, points: 0, events: 0, wins: 0, best: null, rank: 0 };
      m.events++;
      if (r.rank != null) {
        m.points += sharedPoints(r.rank, tiedAt.get(r.rank)!, table);
        if (r.rank === 1) m.wins++;
        m.best = m.best == null ? r.rank : Math.min(m.best, r.rank);
      }
      acc.set(r.id, m);
    });
  });
  const list = [...acc.values()].map((m) => ({ ...m, points: Math.round(m.points * 100) / 100 }));
  // Empate en puntos: más victorias primero; si también empatan, comparten puesto.
  list.sort((a, b) => b.points - a.points || b.wins - a.wins);
  list.forEach((m, k) => {
    const prev = list[k - 1];
    m.rank = prev && m.points === prev.points && m.wins === prev.wins ? prev.rank : k + 1;
  });
  return list;
}
