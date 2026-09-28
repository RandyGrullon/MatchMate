import type { ShareRow, ShareTableSpec } from './cards';

/**
 * Leaderboard de golf para compartir (una ronda o el torneo): puesto, hoyos jugados, bruto y lo que ordena
 * (neto o total contra el par, o puntos Stableford). La forma de BoardRow (pages/sports/golf/logic) sin atarse
 * a ella.
 */

/** Lo que hace falta de cada fila del leaderboard. */
export interface GolfBoardRowLike {
  id: string;
  /** null = sin empezar, no terminó o descalificado. */
  rank: number | null;
  dq: boolean;
  /** Ronda cerrada y la tarjeta quedó sin terminar. */
  unfinished?: boolean;
  toPar: number | null;
  netToPar: number | null;
  points: number;
  gross: number | null;
  /** Hoyos de la ronda en curso. */
  thru: number;
  /** Hoyos de todo el torneo. */
  holesPlayed: number;
}

export interface GolfBoardShareInput<R extends GolfBoardRowLike> {
  /** Liga, torneo o ronda. */
  title: string;
  /** «Ronda 2 · Stroke play neto». */
  subtitle?: string;
  rows: readonly R[];
  nameOf: (playerId: string) => string;
  /** Stableford (puntos) o golpes. */
  stableford: boolean;
  /** Neto (con handicap) o bruto. */
  net: boolean;
  /** Hoyos para decir «F» (terminó): los de la ronda, o los de todo el torneo. */
  holes: number;
  /** Todo el torneo: cuenta los hoyos de todas las rondas. */
  total?: boolean;
  /** Línea chica de la fila: «No terminó», «Recogió»… Por defecto, no terminó o descalificado. */
  statusOf?: (row: R) => string | undefined;
  note?: string;
}

/** Golpes contra el par: «E», «+3», «−2» (igual que toParText de golf). */
export function toParLabel(v: number | null | undefined): string {
  if (v == null) return '–';
  if (v === 0) return 'E';
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

/** Hoyos jugados: «F» con todo jugado, el número a mitad y «–» sin empezar. */
export function thruLabel(thru: number, holes: number): string {
  if (!thru) return '–';
  return thru >= holes ? 'F' : String(thru);
}

export function golfBoardShare<R extends GolfBoardRowLike>(o: GolfBoardShareInput<R>): ShareTableSpec {
  const statusOf = o.statusOf ?? ((r: R) => (r.unfinished ? 'No terminó' : r.dq ? 'Descalificado' : undefined));
  const rows: ShareRow[] = o.rows.map((r) => {
    const sub = statusOf(r);
    return {
      rank: r.rank,
      name: o.nameOf(r.id),
      ...(sub ? { sub } : {}),
      dim: r.rank == null && (r.dq || !!r.unfinished),
      values: [
        thruLabel(o.total ? r.holesPlayed : r.thru, o.holes),
        r.gross ?? '–',
        o.stableford ? String(r.points) : toParLabel(o.net ? r.netToPar : r.toPar),
      ],
    };
  });
  return {
    kind: 'table',
    title: o.title,
    subtitle: o.subtitle,
    nameLabel: 'Jugador',
    columns: [{ label: 'Hoyos' }, { label: 'Bruto', optional: true }, { label: o.stableford ? 'Pts' : o.net ? 'Neto' : 'Total', strong: true }],
    sections: [{ rows }],
    note: o.note ?? '«Hoyos» = hoyos jugados (F = terminó).',
  };
}
