/**
 * El Excel de la temporada de una liga de equipos hecho en el teléfono (el «Excel» de la Tabla en Pro): las mismas hojas
 * de la web (basketballSheets y footballSheets: calendario, tabla, resultados y líderes) escritas sin Blob (xlsxBytes),
 * guardadas en la caché de la app y abiertas con la hoja de compartir del teléfono (WhatsApp, Archivos, correo…). En la
 * vista previa web de la app (o sin hoja de compartir) se descarga, como en la web. Lanza si algo falla (el que llama
 * avisa).
 */
import { XLSX_TYPE, safeFileName, type ExcelSheet } from '@mm/lib/report/sheets';
import { canShareFiles, downloadBytes, saveToCache, shareSaved, xlsxBytes } from '@/platform/reportFile';

/** «Liga de Ejemplo - Temporada 2026 - 2026-11-07.xlsx», como el archivo que baja la web. */
export const seasonExcelName = (leagueName: string, date: Date) => `${safeFileName(`${leagueName} - ${date.toISOString().slice(0, 10)}`)}.xlsx`;

export async function shareSeasonExcel(leagueName: string, sheets: readonly ExcelSheet[]): Promise<void> {
  const file = { name: seasonExcelName(leagueName, new Date()), type: XLSX_TYPE, bytes: xlsxBytes(sheets) };
  if (!(await canShareFiles())) {
    downloadBytes(file);
    return;
  }
  const uri = await saveToCache(file);
  await shareSaved(uri, file.type, leagueName);
}
