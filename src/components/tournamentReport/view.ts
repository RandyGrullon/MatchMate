/**
 * Los textos y los pasos de «Reporte del torneo» (el botón, la fila del menú «•••» y la hoja), sin React: los usan la
 * hoja de la web (ReportSheet.tsx) y la de la app del teléfono.
 */
import type { ReportFormat } from '../../lib/report/model';

/** En qué va la hoja: eligiendo, haciendo el archivo, listo (compartir o ya descargado) o con error. */
export type ReportPhase =
  | { kind: 'choose' }
  | { kind: 'working'; format: ReportFormat }
  | { kind: 'ready'; format: ReportFormat; fileName: string; canShare: boolean }
  | { kind: 'error'; format: ReportFormat };

export const FORMAT_NAME: Record<ReportFormat, string> = { pdf: 'PDF', excel: 'Excel' };

/** El título de la hoja y del botón. */
export const REPORT_TITLE = 'Reporte del torneo';

/** La línea de la tarjeta del admin (y, sin el punto, la de la fila del menú «•••»). */
export const REPORT_CARD_TEXT = 'PDF para WhatsApp o imprimir, o Excel.';
export const REPORT_MENU_HINT = 'PDF para WhatsApp o imprimir, o Excel';

/** Lo de arriba de las dos opciones. */
export const REPORT_CHOOSE_TEXT = 'Campeones, premios y resultados en la primera página; el individual después.';

/** Las dos opciones: el formato y su línea. */
export const REPORT_OPTIONS: readonly { format: ReportFormat; title: string; text: string }[] = [
  { format: 'pdf', title: 'PDF', text: 'Para mandar por WhatsApp o imprimir.' },
  { format: 'excel', title: 'Excel', text: 'Hojas «General» e «Individual», y el detalle.' },
];

export const PRIZES_LOADING_TEXT = 'Leyendo los premios…';

/** «Haciendo el PDF…». */
export const workingText = (format: ReportFormat) => `Haciendo el ${FORMAT_NAME[format]}…`;

/** Debajo del nombre del archivo listo. */
export const readyText = (canShare: boolean) => (canShare ? 'Toca «Compartir» y elige WhatsApp (o donde quieras).' : 'Se descargó: búscalo en tus descargas.');

/** «No se pudo hacer el PDF. Prueba otra vez.». */
export const reportErrorText = (format: ReportFormat) => `No se pudo hacer el ${FORMAT_NAME[format]}. Prueba otra vez.`;

/** El aviso cuando se descargó de una vez (sin menú para archivos). */
export const downloadedText = (format: ReportFormat) => `${FORMAT_NAME[format]} descargado`;
