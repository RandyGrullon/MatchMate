import type { SheetData } from 'write-excel-file/browser';
import type { Match } from '../../../lib/data/matches';
import { excelHead as head, safeFileName, sheetName, type ExcelSheet } from '../../../lib/report/sheets';
import type { RacketSport } from '../../../sports/racket';
import type { StandingRow } from '../../../sports/types';
import { statusInfo } from '../../../components/match/format';
import { boxName, monthMatches, type BoxMonth } from '../racket-formats/logic/box';
import type { NightRound } from './logic/night';
import { fmtPoints } from './logic/night';
import { localParts, timeLabel } from './logic/time';
import { forLabel, seasonPlayerTable, setsLabel, winPct } from './logic/results';

/**
 * Excel de raqueta (write-excel-file, como src/lib/exportExcel.ts; el del boliche no se toca):
 * - la noche: rondas (cancha, parejas y puntos) y la tabla individual;
 * - la liga o el torneo: partidos, tablas (una por competencia o grupo) y jugadores.
 * Las hojas salen de funciones puras (…Sheets): el reporte del torneo (src/lib/report/racket.ts) las pone de detalle.
 */

export interface NightExcelInput {
  rounds: readonly NightRound[];
  table: readonly StandingRow[];
  nameOf: (id: string) => string;
}

/** Hojas de la noche: la tabla individual y las rondas. Puro. */
export function nightSheets(o: NightExcelInput): ExcelSheet[] {
  const pair = (ids: readonly string[]) => ids.map(o.nameOf).join(' / ');
  const roundRows: SheetData = [head(['Ronda', 'Cancha', 'Pareja 1', 'Pareja 2', 'Puntos 1', 'Puntos 2', 'Descansan'])];
  for (const r of o.rounds) {
    r.matches.forEach((m, i) =>
      roundRows.push([
        { value: r.round },
        { value: m.court },
        { value: pair(m.side1) },
        { value: pair(m.side2) },
        { value: m.score1 ?? undefined },
        { value: m.score2 ?? undefined },
        { value: i === 0 ? r.rests.map(o.nameOf).join(', ') : '' },
      ]),
    );
  }
  const tableRows: SheetData = [head(['Puesto', 'Jugador', 'PJ', 'G', 'E', 'P', 'Puntos', 'A favor', 'En contra', 'Dif.', 'Descansos', 'Promedio'])];
  for (const r of o.table) {
    tableRows.push([
      { value: r.rank },
      { value: o.nameOf(r.id) },
      { value: r.played },
      { value: r.won },
      { value: r.drawn },
      { value: r.lost },
      { value: r.points, fontWeight: 'bold' as const },
      { value: r.for },
      { value: r.against },
      { value: r.diff },
      { value: r.extra.rests ?? 0 },
      { value: fmtPoints(r.extra.avg ?? 0) },
    ]);
  }
  return [
    { sheet: 'Tabla', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 28 }, ...Array.from({ length: 10 }, () => ({ width: 10 }))], data: tableRows },
    { sheet: 'Rondas', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 14 }, { width: 30 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 40 }], data: roundRows },
  ];
}

export interface CompetitionTable {
  name: string;
  rows: readonly StandingRow[];
}

export interface CompetitionExcelInput {
  title: string;
  date: string;
  matches: readonly Match[];
  tables: readonly CompetitionTable[];
  players: readonly StandingRow[];
  entrantName: (id: string) => string;
  nameOf: (id: string) => string;
  tz?: string | null;
  forLabel: string;
  /** «Sets» (pádel y tenis) o «Juegos» (pickleball y ping pong). */
  setsLabel?: string;
  /** Columna del lugar del partido: «Cancha» (por defecto) o «Mesa» (ping pong). */
  courtLabel?: string;
}

/** Hojas de la liga o el torneo: partidos, una tabla por competencia o grupo, y jugadores. Puro. */
export function competitionSheets(o: CompetitionExcelInput): ExcelSheet[] {
  const used = new Set<string>();
  const matchRows: SheetData = [head(['Jornada o fase', 'Fecha', 'Hora', o.courtLabel ?? 'Cancha', 'Lado 1', 'Lado 2', 'Marcador', 'Ganador', 'Estado'])];
  for (const m of o.matches) {
    const p = localParts(m.scheduledAt, o.tz);
    const winner = m.winner ? m.sides[m.winner - 1].label : '';
    matchRows.push([
      { value: m.stage || (m.round != null ? `Jornada ${m.round}` : '') },
      { value: p?.date ?? '' },
      { value: p ? timeLabel(p.time) : '' },
      { value: m.court },
      { value: m.sides[0].label },
      { value: m.sides[1].label },
      { value: typeof m.score?.text === 'string' ? m.score.text : '' },
      { value: winner },
      { value: statusInfo(m).label },
    ]);
  }
  const sheets: ExcelSheet[] = [
    {
      sheet: sheetName('Partidos', used),
      stickyRowsCount: 1,
      columns: [{ width: 22 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 28 }, { width: 28 }, { width: 18 }, { width: 28 }, { width: 14 }],
      data: matchRows,
    },
  ];
  for (const t of o.tables) {
    sheets.push({
      sheet: sheetName(t.name, used),
      stickyRowsCount: 1,
      columns: [{ width: 8 }, { width: 30 }, ...Array.from({ length: 8 }, () => ({ width: 10 }))],
      data: [
        head(['Puesto', 'Nombre', 'PJ', 'G', 'P', `${o.setsLabel ?? 'Sets'} +`, `${o.setsLabel ?? 'Sets'} −`, `${o.forLabel} +`, `${o.forLabel} −`, 'Pts']),
        ...t.rows.map((r) => [
          { value: r.rank },
          { value: o.entrantName(r.id) },
          { value: r.played },
          { value: r.won },
          { value: r.lost },
          { value: r.extra.setsFor ?? r.extra.gamesFor ?? 0 },
          { value: r.extra.setsAgainst ?? r.extra.gamesAgainst ?? 0 },
          { value: r.for },
          { value: r.against },
          { value: r.points, fontWeight: 'bold' as const },
        ]),
      ],
    });
  }
  sheets.push({
    sheet: sheetName('Jugadores', used),
    stickyRowsCount: 1,
    columns: [{ width: 8 }, { width: 28 }, ...Array.from({ length: 7 }, () => ({ width: 10 }))],
    data: [
      head(['Puesto', 'Jugador', 'PJ', 'G', 'P', '% G', `Dif. ${(o.setsLabel ?? 'Sets').toLowerCase()}`, `Dif. ${o.forLabel.toLowerCase()}`, 'Pts']),
      ...o.players.map((r) => [
        { value: r.rank },
        { value: o.nameOf(r.id) },
        { value: r.played },
        { value: r.won },
        { value: r.lost },
        { value: winPct(r.won, r.played) ?? undefined },
        { value: r.extra.setsDiff ?? 0 },
        { value: r.diff },
        { value: r.points, fontWeight: 'bold' as const },
      ]),
    ],
  });
  return sheets;
}

/** Los nombres que necesita el Excel (los de useNames). */
type ExcelNames = { entrantName: (id: string) => string; nameOf: (id: string) => string; rosterOf: (teamId: string) => readonly string[] };

/** Lo de cada deporte para el Excel: los nombres de las columnas y del lugar del partido («Cancha» o «Mesa»). */
interface ExcelSport {
  sport: RacketSport;
  names: ExcelNames;
  tz?: string | null;
  courtLabel: string;
  now: number;
}

/** El Excel de la liga de parejas: sus partidos, la tabla y los jugadores (lo de «•••» › Excel). Puro. */
export function leagueExcelInput(o: ExcelSport & { title: string; date: string; matches: readonly Match[]; table: readonly StandingRow[] }): CompetitionExcelInput {
  return {
    title: o.title,
    date: o.date,
    matches: o.matches,
    tables: [{ name: 'Tabla', rows: o.table }],
    players: seasonPlayerTable(o.matches, { sport: o.sport, rosterOf: o.names.rosterOf, now: o.now }),
    entrantName: o.names.entrantName,
    nameOf: o.names.nameOf,
    tz: o.tz,
    forLabel: forLabel(o.sport),
    setsLabel: setsLabel(o.sport),
    courtLabel: o.courtLabel,
  };
}

/** El Excel del mes de la liga por cajas: los partidos del mes, una tabla por caja y los jugadores. Puro. */
export function boxMonthExcelInput(
  o: ExcelSport & { title: string; eventDate: string; month: BoxMonth; matches: readonly Match[]; tables: readonly (readonly StandingRow[])[] },
): CompetitionExcelInput {
  const list = monthMatches(o.matches, o.month.n);
  return {
    title: `${o.title} · ${o.month.label || `Mes ${o.month.n}`}`,
    date: o.month.start ?? o.eventDate,
    matches: list,
    tables: o.month.boxes.map((_, b) => ({ name: boxName(b), rows: o.tables[b] ?? [] })),
    players: seasonPlayerTable(list, { sport: o.sport, rosterOf: o.names.rosterOf, now: o.now }),
    entrantName: o.names.entrantName,
    nameOf: o.names.nameOf,
    tz: o.tz,
    forLabel: forLabel(o.sport),
    setsLabel: setsLabel(o.sport),
    courtLabel: o.courtLabel,
  };
}

/** «Liga de los jueves - 2026-10-07.xlsx». */
export const competitionExcelName = (o: Pick<CompetitionExcelInput, 'title' | 'date'>) => `${safeFileName(o.title)} - ${o.date}.xlsx`;

/** Descarga la liga o las cajas en Excel (el torneo por categorías lo trae su reporte). */
export async function exportCompetitionExcel(o: CompetitionExcelInput) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(competitionSheets(o)).toFile(competitionExcelName(o));
}
