/**
 * «Excel» de la liga de parejas y del mes de las cajas («•••» de la web: exportCompetitionExcel), con las mismas hojas
 * (competitionSheets de src/pages/sports/racket/excel.ts) y el mismo nombre del archivo. En el teléfono el archivo se
 * escribe sin Blob (xlsxBytes) y se abre la hoja de compartir (WhatsApp, Archivos, correo…); en la vista previa web se
 * descarga, como en la web.
 */
import { XLSX_TYPE } from '@mm/lib/report/sheets';
import { competitionExcelName, competitionSheets, type CompetitionExcelInput } from '@mm/pages/sports/racket/excel';
import { canShareFiles, downloadBytes, saveToCache, shareSaved, xlsxBytes } from '@/platform/reportFile';

export async function shareCompetitionExcel(o: CompetitionExcelInput): Promise<void> {
  const file = { name: competitionExcelName(o), type: XLSX_TYPE, bytes: xlsxBytes(competitionSheets(o)) };
  if (!(await canShareFiles())) {
    downloadBytes(file);
    return;
  }
  const uri = await saveToCache(file);
  await shareSaved(uri, file.type, o.title);
}
