import type { SheetData } from 'write-excel-file/browser';
import { compareMatches, hasResult, type Match } from '../../../lib/data/matches';
import { statusInfo, whenText } from '../../../components/match/format';
import type { BasketballSeason } from './season';
import { periodsFromScore } from './adapter';

const head = (labels: string[]) => labels.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8E7FB' }));

export interface BasketballExcelInput {
  leagueName: string;
  matches: readonly Match[];
  season: BasketballSeason;
  teamName: (teamKey: string) => string;
  playerName: (playerId: string) => string;
  tz: string;
  now?: number;
}

const sideName = (m: Match, i: 0 | 1, teamName: (id: string) => string) => (m.sides[i].teamId ? teamName(m.sides[i].teamId!) : m.sides[i].label);

/** Hojas del Excel de la liga: calendario, tabla, resultados (con cuartos) y anotadores. Puro (para probar). */
export function basketballSheets(input: BasketballExcelInput): { data: SheetData; sheet: string; columns: { width: number }[]; stickyRowsCount: number }[] {
  const { matches, season, teamName, playerName, tz } = input;
  const now = input.now ?? Date.now();
  const sorted = [...matches].sort(compareMatches);
  const schedule: SheetData = [head(['Jornada', 'Fecha y hora', 'Cancha', 'Local', 'Visita', 'Estado', 'Resultado'])];
  for (const m of sorted) {
    schedule.push([
      { value: m.round ?? undefined },
      { value: whenText(m.scheduledAt, tz) ?? 'Sin fecha' },
      { value: m.court || '' },
      { value: sideName(m, 0, teamName) },
      { value: sideName(m, 1, teamName) },
      { value: statusInfo(m, now).label },
      { value: hasResult(m) ? (typeof m.score?.text === 'string' ? m.score.text : '') : '' },
    ]);
  }

  const table: SheetData = [head(['Puesto', 'Equipo', 'PJ', 'G', 'P', 'PF', 'PC', 'Dif.', 'Pts', 'Desempate'])];
  for (const r of season.standings) {
    table.push([
      { value: r.rank },
      { value: teamName(r.id) },
      { value: r.played },
      { value: r.won },
      { value: r.lost },
      { value: r.for },
      { value: r.against },
      { value: r.diff },
      { value: r.points, fontWeight: 'bold' as const },
      { value: r.decidedBy && r.decidedBy !== 'puntos' ? r.decidedBy : '' },
    ]);
  }

  const maxPeriods = Math.max(0, ...sorted.map((m) => periodsFromScore(m.score).length));
  const results: SheetData = [
    head(['Jornada', 'Fecha', 'Local', 'Puntos local', 'Puntos visita', 'Visita', ...Array.from({ length: maxPeriods }, (_, i) => `Periodo ${i + 1}`), 'Estado']),
  ];
  for (const m of sorted.filter(hasResult)) {
    const sides = Array.isArray(m.score?.sides) ? m.score!.sides! : [undefined, undefined];
    const periods = periodsFromScore(m.score);
    results.push([
      { value: m.round ?? undefined },
      { value: whenText(m.scheduledAt, tz) ?? '' },
      { value: sideName(m, 0, teamName) },
      { value: sides[0] },
      { value: sides[1] },
      { value: sideName(m, 1, teamName) },
      ...Array.from({ length: maxPeriods }, (_, i) => ({ value: periods[i] ? `${periods[i][0]}-${periods[i][1]}` : '' })),
      { value: m.status === 'walkover' ? 'W.O.' : statusInfo(m, now).label },
    ]);
  }

  const scorers: SheetData = [head(['Puesto', 'Jugador', 'Equipo', 'PJ', 'Puntos', 'Promedio', 'Máximo', 'Triples', 'Tiros libres', 'Faltas'])];
  season.leaders.forEach((l, i) => {
    scorers.push([
      { value: i + 1 },
      { value: playerName(l.player) },
      { value: teamName(l.team) },
      { value: l.games },
      { value: l.points, fontWeight: 'bold' as const },
      { value: l.avg },
      { value: l.high },
      { value: l.threes },
      { value: l.ftm },
      { value: l.fouls },
    ]);
  });

  return [
    { sheet: 'Calendario', stickyRowsCount: 1, columns: [{ width: 9 }, { width: 24 }, { width: 16 }, { width: 24 }, { width: 24 }, { width: 14 }, { width: 16 }], data: schedule },
    { sheet: 'Tabla', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 26 }, ...Array.from({ length: 7 }, () => ({ width: 7 })), { width: 26 }], data: table },
    {
      sheet: 'Resultados',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 24 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 24 }, ...Array.from({ length: maxPeriods }, () => ({ width: 10 })), { width: 14 }],
      data: results,
    },
    { sheet: 'Anotadores', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 28 }, { width: 24 }, ...Array.from({ length: 7 }, () => ({ width: 10 }))], data: scorers },
  ];
}

/** Descarga el Excel de la liga de baloncesto. */
export async function exportBasketballExcel(input: BasketballExcelInput) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const date = new Date().toISOString().slice(0, 10);
  await writeExcelFile(basketballSheets(input)).toFile(`${input.leagueName} - ${date}.xlsx`);
}
