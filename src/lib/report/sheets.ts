import type { SheetData } from 'write-excel-file/browser';

/**
 * Lo común de los Excel (write-excel-file): la forma de una hoja, el encabezado de las tablas, los nombres de hoja y de
 * archivo, y escribir el archivo. Cada deporte arma sus hojas con funciones puras (…Sheets) y las escribe con
 * `writeSheets`; el reporte del torneo (report/excel.ts) pone «General» e «Individual» delante de ellas.
 */

/** Una hoja del Excel (sin imágenes). */
export interface ExcelSheet {
  sheet: string;
  data: SheetData;
  columns?: { width: number }[];
  stickyRowsCount?: number;
  showGridLines?: boolean;
  orientation?: 'landscape';
}

/** El lila del encabezado de las tablas de todos los Excel de la app. */
export const EXCEL_HEAD_BG = '#E8E7FB';

/** La fila de encabezado de una tabla: en negrita con el fondo de siempre. */
export const excelHead = (labels: readonly string[]) => labels.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: EXCEL_HEAD_BG }));

/** Nombre de archivo sin los caracteres que Windows no deja («Liga/Norte» → «Liga Norte»). */
export const safeFileName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'MatchMate';

/** Nombre de hoja válido para Excel: ≤ 31 caracteres, sin \ / ? * [ ] :, y sin repetir (lo anota en `used`). */
export function sheetName(s: string, used: Set<string>): string {
  const clean = s.replace(/[\\/?*[\]:]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Hoja';
  const taken = (n: string) => [...used].some((u) => u.toLowerCase() === n.toLowerCase());
  let name = clean.slice(0, 31).trim();
  for (let n = 2; taken(name); n++) {
    const suffix = ` (${n})`;
    name = `${clean.slice(0, 31 - suffix.length).trim()}${suffix}`;
  }
  used.add(name);
  return name;
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Escribe las hojas en un .xlsx (la librería se carga aquí, solo al bajar). */
export async function writeSheets(sheets: readonly ExcelSheet[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const blob = await writeExcelFile(sheets.map((s) => ({ ...s }))).toBlob();
  return blob.type ? blob : new Blob([blob], { type: XLSX_TYPE });
}
