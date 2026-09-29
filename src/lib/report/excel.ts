import type { Cell, Row, SheetData } from 'write-excel-file/browser';
import {
  isGroupRow,
  rowCells,
  rowStrong,
  statusText,
  tablesFor,
  visibleColumns,
  type ReportFact,
  type ReportTable,
  type TournamentReport,
} from './model';
import { excelHead, sheetName, writeSheets, type ExcelSheet } from './sheets';

/**
 * El reporte del torneo en Excel: la hoja «General» (lo mismo que la primera página del PDF, para leer), la hoja
 * «Individual» y, detrás, las hojas de detalle del deporte (`report.sheets`, las del Excel de siempre).
 */

const MUTED = '#646B7A';
const WARN = '#A15C00';

const bold = (value: string, extra: Record<string, unknown> = {}): Cell => ({ value, fontWeight: 'bold' as const, ...extra });

/** Ancho de cada columna de la hoja «General»: el más ancho de lo que va en esa columna. */
function generalWidths(tables: readonly ReportTable[], count: number): { width: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const fromTables = tables.map((t) => visibleColumns(t, 'excel')[i]?.col.width ?? 0);
    const base = i === 0 ? 16 : i === 1 ? 30 : i === 2 ? 28 : 12;
    return { width: Math.max(base, ...fromTables) };
  });
}

/** Las filas de una tabla (título, nota, encabezado y datos). */
function tableRows(table: ReportTable, span: number, withTitle: boolean): Row[] {
  const cols = visibleColumns(table, 'excel');
  const rows: Row[] = [];
  if (withTitle && table.title) rows.push([bold(table.title, { fontSize: 12, columnSpan: Math.max(1, span) })]);
  if (table.note) rows.push([{ value: table.note, textColor: MUTED, columnSpan: Math.max(1, span) }]);
  if (!table.rows.length) {
    if (table.empty) rows.push([{ value: table.empty, textColor: MUTED, columnSpan: Math.max(1, span) }]);
    return rows;
  }
  rows.push(excelHead(cols.map((c) => c.col.label)));
  for (const row of table.rows) {
    if (isGroupRow(row)) {
      rows.push([bold(row.group, { columnSpan: Math.max(1, cols.length) })]);
      continue;
    }
    const cells = rowCells(row);
    const strongRow = rowStrong(row);
    rows.push(
      cols.map(({ col, index }): Cell => {
        const v = cells[index];
        if (v == null || v === '') return null;
        return {
          value: v,
          ...(col.strong || strongRow ? { fontWeight: 'bold' as const } : {}),
          ...(col.align && col.align !== 'left' ? { align: col.align } : {}),
        };
      }),
    );
  }
  return rows;
}

const factRows = (facts: readonly ReportFact[], span: number): Row[] =>
  facts.map((f) => [bold(f.label), { value: f.value, columnSpan: Math.max(1, span - 1) }]);

/** La hoja «General». */
export function generalSheet(report: TournamentReport, generated: string): ExcelSheet {
  const tables = tablesFor(report.general, 'excel');
  const count = Math.max(4, ...tables.map((t) => visibleColumns(t, 'excel').length));
  const span = count;
  const data: SheetData = [];
  const blank = () => data.push([null]);
  const heading = (text: string) => data.push([bold(text, { fontSize: 13, columnSpan: span })]);

  data.push([bold(report.title, { fontSize: 16, columnSpan: span })]);
  if (report.subtitle) data.push([{ value: report.subtitle, textColor: MUTED, columnSpan: span }]);
  data.push([bold(statusText(report), { columnSpan: span })]);
  blank();
  data.push(...factRows(report.facts, span));
  for (const note of report.notes) data.push([{ value: note, textColor: WARN, columnSpan: span }]);

  if (report.podiums.length) {
    blank();
    heading('Campeones');
    for (const podium of report.podiums) {
      const members = podium.places.some((p) => p.winners.some((w) => w.members));
      const detail = podium.places.some((p) => p.winners.some((w) => w.detail));
      data.push(excelHead([podium.title, 'Ganador', ...(members ? ['Integrantes'] : []), ...(detail ? ['Resultado'] : [])]));
      for (const place of podium.places) {
        if (!place.winners.length) {
          data.push([bold(place.label), { value: place.note ?? 'Nadie en este lugar', textColor: MUTED }]);
          continue;
        }
        place.winners.forEach((w, i) =>
          data.push([
            i === 0 ? bold(place.label) : null,
            bold(w.name),
            ...(members ? [w.members ? { value: w.members } : null] : []),
            ...(detail ? [w.detail ? { value: w.detail } : null] : []),
          ]),
        );
      }
    }
  }

  if (report.prizes.length) {
    blank();
    heading('Premios');
    for (const section of report.prizes) {
      data.push(excelHead([section.title, 'Insignia', 'Quién la recibió']));
      for (const r of section.rows) {
        data.push([bold(r.label), { value: r.badge }, r.delivered ? { value: r.winners.join(' / ') || 'Nadie en este lugar' } : { value: 'Por entregar', textColor: MUTED }]);
      }
    }
  }

  if (report.highlights.length) {
    blank();
    heading('Resumen');
    data.push(...factRows(report.highlights, span));
  }

  for (const table of tables) {
    blank();
    data.push(...tableRows(table, span, true));
  }

  blank();
  data.push([{ value: `Generado con MatchMate · ${generated}`, textColor: MUTED, columnSpan: span }]);
  return { sheet: 'General', data, columns: generalWidths(tables, count), showGridLines: false };
}

/** La hoja «Individual»: una tabla debajo de la otra (con una sola, el encabezado queda fijo arriba). */
export function individualSheet(report: TournamentReport): ExcelSheet {
  const tables = tablesFor(report.individual, 'excel');
  const count = Math.max(1, ...tables.map((t) => visibleColumns(t, 'excel').length));
  const data: SheetData = [];
  tables.forEach((t, i) => {
    if (i > 0) data.push([null]);
    data.push(...tableRows(t, count, true));
  });
  if (!data.length) data.push([{ value: 'Todavía no hay resultados.', textColor: MUTED }]);
  const single = tables.length === 1 && tables[0].rows.length > 0;
  const widths = Array.from({ length: count }, (_, i) => ({
    width: Math.max(i === 1 ? 26 : 8, ...tables.map((t) => visibleColumns(t, 'excel')[i]?.col.width ?? 0)),
  }));
  const headerRow = single ? (tables[0].title ? 1 : 0) + (tables[0].note ? 1 : 0) + 1 : 0;
  return {
    sheet: 'Individual',
    data,
    columns: widths,
    ...(single ? { stickyRowsCount: headerRow } : {}),
    ...(report.individualLandscape ? { orientation: 'landscape' as const } : {}),
  };
}

/** Todas las hojas del reporte: «General», «Individual» y las de detalle (con nombres válidos y sin repetir). */
export function reportSheets(report: TournamentReport, generated: string): ExcelSheet[] {
  const used = new Set<string>(['General', 'Individual']);
  return [
    generalSheet(report, generated),
    individualSheet(report),
    ...report.sheets.map((s) => ({ ...s, sheet: sheetName(s.sheet, used) })),
  ];
}

/** El .xlsx del reporte. */
export function reportExcel(report: TournamentReport, opts: { generated: string }): Promise<Blob> {
  return writeSheets(reportSheets(report, opts.generated));
}
