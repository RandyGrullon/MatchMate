/** Los textos de «Reporte del torneo» (los mismos en la web y en la app) y el reporte con los premios para el teléfono. */
import { describe, expect, it } from 'vitest';
import type { TournamentReport } from '../../lib/report/model';
import { fullReport } from './flow';
import { FORMAT_NAME, REPORT_OPTIONS, downloadedText, readyText, reportErrorText, workingText } from './view';

const BASE = { title: 'Copa de Ejemplo', prizes: [] } as unknown as TournamentReport;
const NO_PRIZES = { comp: null, prize: null, designs: [], players: [], hidden: false };

describe('textos de la hoja', () => {
  it('las opciones y cada paso', () => {
    expect(REPORT_OPTIONS.map((o) => `${o.title}: ${o.text}`)).toEqual(['PDF: Para mandar por WhatsApp o imprimir.', 'Excel: Hojas «General» e «Individual», y el detalle.']);
    expect(workingText('pdf')).toBe('Haciendo el PDF…');
    expect(readyText(true)).toBe('Toca «Compartir» y elige WhatsApp (o donde quieras).');
    expect(readyText(false)).toBe('Se descargó: búscalo en tus descargas.');
    expect(reportErrorText('excel')).toBe('No se pudo hacer el Excel. Prueba otra vez.');
    expect(downloadedText('excel')).toBe(`${FORMAT_NAME.excel} descargado`);
  });
});

describe('fullReport', () => {
  it('el del deporte (sin premios, tal cual); sin reporte, error', async () => {
    await expect(fullReport(() => BASE, NO_PRIZES)).resolves.toBe(BASE);
    await expect(fullReport(async () => null, NO_PRIZES)).rejects.toThrow('Sin reporte');
  });
});
