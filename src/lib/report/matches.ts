import { statusInfo, whenText } from '../../components/match/format';
import { hasResult, isFinal, type Match } from '../data/matchCore';
import type { ReportCell, ReportColumn, ReportRow, ReportTable } from './model';

/**
 * Lo común del reporte de los deportes de partido (raqueta y equipos): el marcador, quién ganó y la tabla de
 * resultados por fase. Las tablas de posiciones las calcula cada deporte con sus funciones de siempre; aquí solo se
 * pasan a filas.
 */

/** El marcador para el reporte: el texto del partido («6-4 6-3», «2-1 (W.O.)») o los números de cada lado; «W.O.» si no hay más. */
export function scoreText(m: Pick<Match, 'status' | 'score'>): string {
  if (!hasResult(m)) return '';
  const text = typeof m.score?.text === 'string' ? m.score.text.trim() : '';
  if (text) return text;
  const s = m.score?.sides;
  if (Array.isArray(s) && s.length === 2) return `${s[0]}-${s[1]}`;
  return m.status === 'walkover' ? 'W.O.' : '';
}

/** El lado que ganó (en un W.O., el que vino); null si no hay ganador. */
export const winnerSide = (m: Pick<Match, 'winner' | 'walkoverSide'>): 1 | 2 | null =>
  m.winner ?? (m.walkoverSide === 1 ? 2 : m.walkoverSide === 2 ? 1 : null);

/** «Por confirmar», «Programado», «En vivo»…; vacío si el resultado ya cuenta. */
export const pendingText = (m: Pick<Match, 'status' | 'proposedAt'>, now: number): string => (isFinal(m, now) ? '' : statusInfo(m, now).label);

/** Partidos que todavía no cuentan (sin los anulados ni los aplazados). */
export const pendingCount = (matches: readonly Pick<Match, 'status' | 'proposedAt'>[], now: number): number =>
  matches.filter((m) => m.status !== 'void' && m.status !== 'postponed' && !isFinal(m, now)).length;

/** Partidos que ya cuentan. */
export const playedCount = (matches: readonly Pick<Match, 'status' | 'proposedAt'>[], now: number): number => matches.filter((m) => isFinal(m, now)).length;

/** «Faltan 3 partidos por jugar o confirmar: el podio puede cambiar.» (null si no falta ninguno). */
export function pendingNote(n: number, what = 'el podio puede cambiar'): string | null {
  if (!n) return null;
  return `${n === 1 ? 'Falta 1 partido' : `Faltan ${n} partidos`} por jugar o confirmar: ${what}.`;
}

export interface MatchGroup {
  /** «Grupo A», «Semifinal»… (null: sin subtítulo). */
  title: string | null;
  matches: readonly Match[];
}

export interface MatchesTableOptions {
  title?: string;
  note?: string;
  /** Cómo se llaman los lados: «Lado 1» y «Lado 2», o «Local» y «Visita». */
  sides: readonly [string, string];
  groups: readonly MatchGroup[];
  now: number;
  tz?: string | null;
  /** Nombre de cada lado (por defecto el copiado en el partido). */
  sideName?: (m: Match, side: 1 | 2) => string;
  /** Con la columna «Ganador» (la raqueta: el marcador de sets no dice quién ganó a primera vista). */
  winner?: boolean;
  /** Cómo se llama el lugar del partido en el Excel: «Cancha» (por defecto) o «Mesa» (ping pong). */
  courtLabel?: string;
  empty?: string;
}

/**
 * Los resultados por fase: un subtítulo por fase y cada partido con sus lados y el marcador (y, en el Excel, la
 * fecha y la cancha). La columna «Estado» solo sale si hay partidos que todavía no cuentan.
 */
export function matchesTable(o: MatchesTableOptions): ReportTable {
  const name = o.sideName ?? ((m: Match, side: 1 | 2) => m.sides[side - 1].label || 'Por definir');
  const all = o.groups.flatMap((g) => g.matches);
  const status = all.some((m) => !!pendingText(m, o.now));
  const columns: ReportColumn[] = [
    { label: 'Fecha y hora', width: 22, only: 'excel' },
    { label: o.courtLabel ?? 'Cancha', width: 14, only: 'excel' },
    { label: o.sides[0], width: 28 },
    { label: 'Marcador', align: 'center', width: 18 },
    { label: o.sides[1], width: 28 },
    ...(o.winner ? [{ label: 'Ganador', width: 28 }] : []),
    ...(status ? [{ label: 'Estado', width: 14 }] : []),
  ];
  const rows: ReportRow[] = [];
  for (const g of o.groups) {
    if (!g.matches.length) continue;
    if (g.title) rows.push({ group: g.title });
    for (const m of g.matches) {
      const w = hasResult(m) ? winnerSide(m) : null;
      const cells: ReportCell[] = [
        whenText(m.scheduledAt, o.tz ?? undefined) ?? null,
        m.court || null,
        name(m, 1),
        scoreText(m) || null,
        name(m, 2),
        ...(o.winner ? [w ? name(m, w) : null] : []),
        ...(status ? [pendingText(m, o.now) || null] : []),
      ];
      rows.push(cells);
    }
  }
  return { title: o.title, note: o.note, columns, rows, empty: o.empty };
}

/** Columnas de una tabla de posiciones (lugar y nombre; las demás las pone el deporte). */
export const standingHead = (who: string): ReportColumn[] => [
  { label: 'Lugar', align: 'center', place: true, width: 7 },
  { label: who, width: 30 },
];

/** Una columna de números a la derecha. */
export const numCol = (label: string, extra: Partial<ReportColumn> = {}): ReportColumn => ({ label, align: 'right', width: 8, ...extra });
