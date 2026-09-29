/**
 * El botón y la hoja «Reporte del torneo» dibujados sin navegador (renderToString): el botón chico y la tarjeta del
 * admin, y cada paso de la hoja (elegir, haciendo, listo para compartir o ya descargado, error).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportButton } from './ReportButton';
import { ReportSheetView, type ReportPhase } from './ReportSheet';

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const noop = () => undefined;
const render = (el: ReactElement) => renderToString(el);
const sheet = (phase: ReportPhase, extra: { prizesLoading?: boolean } = {}) =>
  render(h(ReportSheetView, { open: true, onClose: noop, subtitle: 'Copa Aniversario', phase, onPick: noop, onShare: noop, onDownload: noop, onBack: noop, ...extra }));

describe('botón «Reporte del torneo»', () => {
  it('chico, en la cabecera (para todos)', () => {
    const html = render(h(ReportButton, { report: () => null }));
    expect(html).toContain('aria-label="Reporte del torneo"');
    expect(html).not.toContain('disabled=""');
  });

  it('la tarjeta grande del admin cuando terminó; apagado mientras cargan los datos', () => {
    const html = render(h(ReportButton, { report: () => null, look: 'card', disabled: true }));
    expect(text(html)).toContain('Reporte del torneo PDF para WhatsApp o imprimir, o Excel. Descargar');
    expect(html).toContain('disabled=""');
  });
});

describe('hoja «Reporte del torneo»', () => {
  it('elegir: PDF o Excel', () => {
    const t = text(sheet({ kind: 'choose' }));
    expect(t).toContain('Reporte del torneo');
    expect(t).toContain('Copa Aniversario');
    expect(t).toContain('PDF Para mandar por WhatsApp o imprimir.');
    expect(t).toContain('Excel Hojas «General» e «Individual», y el detalle.');
    expect(t).not.toContain('Leyendo los premios');
  });

  it('mientras se leen los premios, las opciones esperan', () => {
    const html = sheet({ kind: 'choose' }, { prizesLoading: true });
    expect(text(html)).toContain('Leyendo los premios…');
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });

  it('haciendo el archivo', () => {
    expect(text(sheet({ kind: 'working', format: 'pdf' }))).toContain('Haciendo el PDF…');
    expect(text(sheet({ kind: 'working', format: 'excel' }))).toContain('Haciendo el Excel…');
  });

  it('listo en el teléfono: «Compartir» (WhatsApp) y «Descargar»', () => {
    const t = text(sheet({ kind: 'ready', format: 'pdf', fileName: 'reporte-copa-aniversario-2026-10-13.pdf', canShare: true }));
    expect(t).toContain('reporte-copa-aniversario-2026-10-13.pdf');
    expect(t).toContain('Toca «Compartir» y elige WhatsApp');
    expect(t).toContain('Otro formato Descargar Compartir');
  });

  it('sin menú para archivos: ya se descargó', () => {
    const t = text(sheet({ kind: 'ready', format: 'excel', fileName: 'reporte-copa-2026-10-13.xlsx', canShare: false }));
    expect(t).toContain('Se descargó: búscalo en tus descargas.');
    expect(t).toContain('Otro formato Descargar otra vez');
    expect(t).not.toContain('Compartir');
  });

  it('error', () => {
    const t = text(sheet({ kind: 'error', format: 'pdf' }));
    expect(t).toContain('No se pudo hacer el PDF. Prueba otra vez.');
    expect(t).toContain('Otro formato');
  });
});
