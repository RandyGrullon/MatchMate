import type { SheetData } from 'write-excel-file/browser';
import type { Match } from '../../../lib/data/matches';
import type { StandingRow } from '../../../sports/types';
import { statusInfo } from '../../../components/match';
import type { NightRound } from './logic/night';
import { fmtPoints } from './logic/night';
import { localParts, timeLabel } from './logic/time';
import { winPct } from './logic/results';

/**
 * Excel de raqueta (write-excel-file, como src/lib/exportExcel.ts; el del boliche no se toca):
 * - la noche: rondas (cancha, parejas y puntos) y la tabla individual;
 * - la liga o el torneo: partidos, tablas (una por competencia o grupo) y jugadores.
 */

type Sheet = { data: SheetData; sheet: string; columns: { width: number }[]; stickyRowsCount: number };

const head = (labels: string[]) => labels.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8E7FB' }));
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'MatchMate';
/** Nombre de hoja válido (≤ 31, sin caracteres raros, sin repetir). */
function sheetName(s: string, used: Set<string>): string {
  let base = s.replace(/[\\/?*[\]:]+/g, ' ').trim().slice(0, 31) || 'Hoja';
  let n = 2;
  while (used.has(base)) base = `${s.slice(0, 27)} (${n++})`;
  used.add(base);
  return base;
}

export async function exportNightExcel(o: { title: string; date: string; rounds: readonly NightRound[]; table: readonly StandingRow[]; nameOf: (id: string) => string }) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
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
  const sheets: Sheet[] = [
    { sheet: 'Tabla', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 28 }, ...Array.from({ length: 10 }, () => ({ width: 10 }))], data: tableRows },
    { sheet: 'Rondas', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 14 }, { width: 30 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 40 }], data: roundRows },
  ];
  await writeExcelFile(sheets).toFile(`${safeName(o.title)} - ${o.date}.xlsx`);
}

export interface CompetitionTable {
  name: string;
  rows: readonly StandingRow[];
}

export async function exportCompetitionExcel(o: {
  title: string;
  date: string;
  matches: readonly Match[];
  tables: readonly CompetitionTable[];
  players: readonly StandingRow[];
  entrantName: (id: string) => string;
  nameOf: (id: string) => string;
  tz?: string | null;
  forLabel: string;
}) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const used = new Set<string>();
  const matchRows: SheetData = [head(['Jornada o fase', 'Fecha', 'Hora', 'Cancha', 'Lado 1', 'Lado 2', 'Marcador', 'Ganador', 'Estado'])];
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
  const sheets: Sheet[] = [
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
        head(['Puesto', 'Nombre', 'PJ', 'G', 'P', 'Sets +', 'Sets −', `${o.forLabel} +`, `${o.forLabel} −`, 'Pts']),
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
      head(['Puesto', 'Jugador', 'PJ', 'G', 'P', '% G', 'Dif. sets', `Dif. ${o.forLabel.toLowerCase()}`, 'Pts']),
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
  await writeExcelFile(sheets).toFile(`${safeName(o.title)} - ${o.date}.xlsx`);
}
