/**
 * El archivo del reporte en bytes (lo que hace la app del teléfono): el nombre, el tipo, el PDF de verdad (jsPDF tiene
 * versión para Node) con el logo que da el teléfono, y el Excel con las mismas hojas escritas por quien lo pide.
 */
import { describe, expect, it, vi } from 'vitest';
import { bowlingReport } from './bowling';
import { reportBytes } from './bytes';
import { REPORT_TYPE, reportFileName } from './file';
import { bowlingEvent, ENTRIES, LEAGUE, PLAYERS } from './fixtures';
import type { ExcelSheet } from './sheets';

const report = () =>
  bowlingReport({ lid: 'L1', league: { ...LEAGUE, logoPath: 'L1/logo.jpg' }, event: bowlingEvent(), entries: ENTRIES, players: PLAYERS, today: '2026-10-13' });
const DATE = new Date(2026, 9, 13, 12);

describe('reportBytes (el reporte en el teléfono)', () => {
  it('el PDF: el mismo nombre de siempre, su tipo y un PDF de verdad, con el logo que da el teléfono', async () => {
    const logo = vi.fn(async () => null);
    const out = await reportBytes('pdf', report(), { generated: '13 oct 2026', date: DATE, logo, xlsx: () => new Uint8Array() });
    expect(out.name).toBe(reportFileName(report(), 'pdf', DATE));
    expect(out.name.endsWith('.pdf')).toBe(true);
    expect(out.type).toBe(REPORT_TYPE.pdf);
    expect(new TextDecoder().decode(out.bytes.slice(0, 5))).toBe('%PDF-');
    expect(logo).toHaveBeenCalledWith('L1/logo.jpg');
  });

  it('el Excel: «General», «Individual» y las de detalle, escritas por quien lo pide', async () => {
    let got: ExcelSheet[] = [];
    const out = await reportBytes('excel', report(), {
      generated: '13 oct 2026',
      date: DATE,
      xlsx: (sheets) => {
        got = sheets;
        return new Uint8Array([1, 2, 3]);
      },
    });
    expect(out.name.endsWith('.xlsx')).toBe(true);
    expect(out.type).toBe(REPORT_TYPE.excel);
    expect([...out.bytes]).toEqual([1, 2, 3]);
    expect(got.slice(0, 2).map((s) => s.sheet)).toEqual(['General', 'Individual']);
    expect(got.length).toBeGreaterThan(2);
  });
});
