import { shareFileName } from '../../components/share/actions';
import type { ReportFormat, TournamentReport } from './model';
import { XLSX_TYPE } from './sheets';

/**
 * El archivo del reporte, listo para compartir o descargar. Las librerías (jsPDF, write-excel-file) y el logo de la
 * liga se cargan aquí, solo al hacerlo.
 */

/** «reporte-copa-aniversario-2026-10-12.pdf» (la fecha es la del día en que se hace). */
export const reportFileName = (report: Pick<TournamentReport, 'fileName'>, format: ReportFormat, date: Date = new Date()): string =>
  shareFileName(['reporte', report.fileName], date, format === 'pdf' ? 'pdf' : 'xlsx');

export async function reportFile(format: ReportFormat, report: TournamentReport, opts: { generated: string; date?: Date }): Promise<File> {
  const name = reportFileName(report, format, opts.date);
  if (format === 'pdf') {
    const [{ reportPdf, PDF_TYPE }, logo] = await Promise.all([import('./pdf'), import('./logo').then((m) => m.reportLogo(report.logoPath))]);
    return new File([await reportPdf(report, { generated: opts.generated, logo })], name, { type: PDF_TYPE });
  }
  const { reportExcel } = await import('./excel');
  return new File([await reportExcel(report, { generated: opts.generated })], name, { type: XLSX_TYPE });
}
