/**
 * Solo pruebas: el reporte de un deporte dibujado de verdad (jsPDF tiene versión para Node) y pasado a las hojas del
 * Excel, para leer lo que quedó escrito.
 */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { reportSheets } from './excel';
import { rowCells, visibleColumns, type ReportFormat, type ReportRow, type ReportTable, type TournamentReport } from './model';
import { drawReport, type AutoTable } from './pdf';

/** Los textos de cada página del PDF, en qué página empieza «Individual» y si esa página va acostada. */
export function pdfPages(r: TournamentReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false });
  const { individualFrom } = drawReport(doc, autoTable as AutoTable, r, { generated: '13 oct 2026' });
  const internal = doc.internal as unknown as { pages: string[][] };
  const pages: string[][] = [];
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    const stream = internal.pages[i].join('\n');
    pages.push([...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')));
  }
  let landscape = false;
  if (individualFrom) {
    doc.setPage(individualFrom);
    landscape = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight();
  }
  return { pages, individualFrom, landscape };
}

type CellLike = { value?: unknown } | null | undefined;

/** Las hojas del Excel del reporte: su nombre y cada fila como texto («a | b | c»). */
export function excelLines(r: TournamentReport): { names: string[]; lines: (sheet: string) => string[] } {
  const sheets = reportSheets(r, '13 oct 2026');
  const line = (row: readonly CellLike[]) => row.map((c) => (c && c.value != null ? String(c.value) : '')).join(' | ').replace(/( \| )+$/, '');
  return {
    names: sheets.map((s) => s.sheet),
    lines: (sheet) => (sheets.find((s) => s.sheet === sheet)?.data ?? []).map((row) => line(row as CellLike[])),
  };
}

/** Una tabla como la ve un formato: su encabezado y sus filas (un subtítulo, como texto). */
export function view(t: ReportTable, format: ReportFormat) {
  const cols = visibleColumns(t, format);
  return {
    head: cols.map((c) => c.col.label),
    rows: t.rows.map((r: ReportRow) => ('group' in r ? r.group : cols.map((c) => rowCells(r)[c.index] ?? null))),
  };
}

/** Los campeones en corto: [título, [lugar, [nombre, integrantes, resultado]]]. */
export const podiumsBrief = (r: TournamentReport) =>
  r.podiums.map((p) => [p.title, p.places.map((x) => [x.place, x.winners.map((w) => [w.name, w.members ?? null, w.detail ?? null])])]);
