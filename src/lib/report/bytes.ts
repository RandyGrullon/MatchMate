import type { ReportFormat, TournamentReport } from './model';
import { reportPdfBytes, type ReportImage } from './pdf';
import { reportSheets } from './excel';
import type { ExcelSheet } from './sheets';
import { REPORT_TYPE, reportFileName } from './file';

/**
 * El reporte como bytes, para la app del teléfono (src/lib/report/file.ts es el de la web). Aquí pdf.ts y excel.ts van
 * con import directo: en el teléfono un import() de algo de ../src no carga en la vista previa web de la app. jsPDF lo
 * sigue cargando pdf.ts al hacer el PDF.
 */

/** El archivo del reporte como bytes: lo que la app del teléfono guarda y comparte (ahí no hay `File`). */
export interface ReportBytes {
  name: string;
  type: string;
  bytes: Uint8Array;
}

/**
 * El mismo archivo que `reportFile`, en bytes. El teléfono pone lo suyo: el logo (`logo`: sin canvas, lo prepara él) y
 * cómo se escriben las hojas del Excel en un .xlsx (`xlsx`: write-excel-file arma un Blob con bytes, que React Native
 * no tiene). Las hojas son las mismas (`reportSheets`).
 */
export async function reportBytes(
  format: ReportFormat,
  report: TournamentReport,
  opts: {
    generated: string;
    date?: Date;
    logo?: (path: string | null) => Promise<ReportImage | null>;
    xlsx: (sheets: ExcelSheet[]) => Uint8Array | Promise<Uint8Array>;
  },
): Promise<ReportBytes> {
  const name = reportFileName(report, format, opts.date);
  if (format === 'pdf') {
    const logo = opts.logo ? await opts.logo(report.logoPath) : null;
    return { name, type: REPORT_TYPE.pdf, bytes: await reportPdfBytes(report, { generated: opts.generated, logo }) };
  }
  return { name, type: REPORT_TYPE.excel, bytes: await opts.xlsx(reportSheets(report, opts.generated)) };
}
