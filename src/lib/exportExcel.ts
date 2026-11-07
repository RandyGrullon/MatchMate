import { eventLabel } from './format';
import { leagueExcelFileName, leagueExcelSheets, type LeagueScope } from './leagueExcel';
import { excelHead as head, type ExcelSheet } from './report/sheets';
import { category, entryLine, individualRule, individualValue, rank, teamLines, teamRule, teamValue } from './stats';
import type { BowlingEvent, Entry, Player } from './types';

/**
 * Las hojas del Excel del torneo (o de la práctica), como el del torneo 2025: hoja individual y hoja de equipos (la
 * práctica: resultados). Solo cuentan los juegos verificados, igual que la clasificación. Puro: el reporte del torneo
 * (report/bowling.ts) usa la hoja «Equipos» como detalle.
 */
export function bowlingEventSheets(event: BowlingEvent, entries: readonly Entry[], players: readonly Player[]): ExcelSheet[] {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const isTorneo = event.type === 'torneo';
  const lines = entries.map((e) => entryLine(e, event)).filter((l) => l.games > 0);
  const games = Array.from({ length: event.games }, (_, i) => `Juego ${i + 1}`);
  const sheets: ExcelSheet[] = [];

  if (isTorneo) {
    // Cada tabla con su regla (la del dueño: individual con handicap, equipos por scratch); en negrita, lo que ordena.
    const useHcp = individualRule(event) === 'hcp';
    const teamName = (id: string | null) => (id && event.teams?.[id]?.name) || '';
    const ranked = rank(lines, individualValue(event));
    sheets.push({
      sheet: 'Individual',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, { width: 22 }, { width: 10 }, { width: 10 }, { width: 8 }, ...games.map(() => ({ width: 9 })), { width: 14 }, { width: 14 }],
      data: [
        head(['Posición', 'Jugador', 'Equipo', 'Categoría', 'Promedio', 'HCP', ...games, 'Total scratch', 'Total con HCP']),
        ...ranked.map(({ row: l, pos }) => [
          { value: pos },
          { value: nameOf(l.entry.playerId) },
          { value: teamName(l.entry.teamId) },
          { value: category(l.entry.average, event.categoryCuts) },
          { value: l.entry.average },
          { value: l.hcp },
          ...l.scores.map((s) => ({ value: s ?? undefined })),
          { value: l.scratch, fontWeight: useHcp ? undefined : ('bold' as const) },
          { value: l.total, fontWeight: useHcp ? ('bold' as const) : undefined },
        ]),
      ],
    });

    const teamHcp = teamRule(event) === 'hcp';
    const teams = rank(
      teamLines(event, lines).filter((t) => t.members.length),
      teamValue(event),
    );
    if (teams.length) {
      sheets.push({
        sheet: 'Equipos',
        stickyRowsCount: 1,
        columns: [{ width: 9 }, { width: 24 }, { width: 60 }, ...games.map(() => ({ width: 9 })), { width: 14 }, { width: 8 }, { width: 14 }],
        data: [
          head(['Lugar', 'Equipo', 'Integrantes', ...games, 'Total scratch', 'HCP', 'Total con HCP']),
          ...teams.map(({ row: t, pos }) => [
            { value: pos },
            { value: t.name, fontWeight: 'bold' as const },
            { value: t.members.map((m) => nameOf(m.entry.playerId)).join(', ') },
            ...t.perGame.map((_, g) => ({ value: t.members.reduce((s, m) => s + (m.scores[g] ?? 0), 0) })),
            { value: t.scratch, fontWeight: teamHcp ? undefined : ('bold' as const) },
            { value: t.hcpTotal },
            { value: t.total, fontWeight: teamHcp ? ('bold' as const) : undefined },
          ]),
        ],
      });
    }
  } else {
    const ranked = rank(lines, (l) => l.avg);
    sheets.push({
      sheet: 'Resultados',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, ...games.map(() => ({ width: 9 })), { width: 10 }, { width: 10 }, { width: 10 }],
      data: [
        head(['Posición', 'Jugador', ...games, 'Total', 'Promedio', 'Mejor']),
        ...ranked.map(({ row: l, pos }) => [
          { value: pos },
          { value: nameOf(l.entry.playerId) },
          ...l.scores.map((s) => ({ value: s ?? undefined })),
          { value: l.scratch },
          { value: l.avg, fontWeight: 'bold' as const },
          { value: l.high },
        ]),
      ],
    });
  }

  return sheets;
}

/** Descarga el torneo (o la práctica) en Excel. */
export async function exportEventToExcel(event: BowlingEvent, entries: Entry[], players: Player[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(bowlingEventSheets(event, entries, players)).toFile(`${eventLabel(event)} - ${event.date}.xlsx`);
}

// Qué parte de la liga se descarga y sus hojas (sin escribir el archivo): en leagueExcel.ts, que comparte la app del
// teléfono. Se siguen importando desde aquí.
export type { LeagueScope } from './leagueExcel';

/**
 * Descarga la liga (o una temporada) en Excel: ranking de jugadores, todos los juegos y el resumen de
 * cada práctica y torneo. Solo cuentan los juegos verificados, igual que el ranking: con posición los que
 * tienen el mínimo de juegos; debajo, sin posición, los que todavía no. Los jugadores borrados no salen.
 */
export async function exportLeagueToExcel(
  leagueName: string,
  scope: LeagueScope,
  allEvents: BowlingEvent[],
  allEntries: Entry[],
  players: Player[],
) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(leagueExcelSheets(scope, allEvents, allEntries, players).map((s) => ({ ...s }))).toFile(leagueExcelFileName(leagueName, scope));
}
