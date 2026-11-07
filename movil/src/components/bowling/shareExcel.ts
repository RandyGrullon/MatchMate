/**
 * Un Excel del boliche hecho en el teléfono (el de la liga en la Tabla de Pro y el de la práctica en el evento): las
 * mismas hojas de la web (src/lib/exportExcel.ts y src/lib/leagueExcel.ts) escritas sin Blob (xlsxBytes), guardadas en
 * la caché de la app y abiertas con la hoja de compartir del teléfono (WhatsApp, Archivos, correo…). En la vista previa
 * web de la app (o sin hoja de compartir) se descarga, como en la web. Lanza si algo falla (el que llama avisa).
 */
import { XLSX_TYPE, type ExcelSheet } from '@mm/lib/report/sheets';
import { canShareFiles, downloadBytes, saveToCache, shareSaved, xlsxBytes } from '@/platform/reportFile';

export async function shareExcel(fileName: string, sheets: readonly ExcelSheet[], dialogTitle: string): Promise<void> {
  const file = { name: fileName, type: XLSX_TYPE, bytes: xlsxBytes(sheets) };
  if (!(await canShareFiles())) {
    downloadBytes(file);
    return;
  }
  const uri = await saveToCache(file);
  await shareSaved(uri, file.type, dialogTitle);
}
