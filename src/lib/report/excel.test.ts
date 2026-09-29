import { describe, expect, it, vi } from 'vitest';
import type { ExcelSheet } from './sheets';
import type { TournamentReport } from './model';

// Se captura lo que se escribiría en el Excel (sin la librería).
const written: ExcelSheet[][] = [];
vi.mock('write-excel-file/browser', () => ({
  default: (sheets: ExcelSheet[]) => ({
    toBlob: async () => {
      written.push(sheets);
      return new Blob(['xlsx']);
    },
  }),
}));

const { reportExcel, reportSheets } = await import('./excel');
const { sheetName, safeFileName, XLSX_TYPE } = await import('./sheets');
const { bowlingReport } = await import('./bowling');
const { bowlingEvent, ENTRIES, LEAGUE, PLAYERS } = await import('./fixtures');

type CellLike = { value?: unknown; fontWeight?: string; columnSpan?: number } | null | undefined;
/** Una fila como texto: los valores de sus celdas (las vacías, ''). */
const line = (row: readonly CellLike[]) => row.map((c) => (c && c.value != null ? String(c.value) : '')).join(' | ').replace(/( \| )+$/, '');
const lines = (s: ExcelSheet) => s.data.map((r) => line(r as CellLike[]));

const report = (): TournamentReport => ({
  ...bowlingReport({ lid: 'L1', league: LEAGUE, event: bowlingEvent(), entries: ENTRIES, players: PLAYERS, today: '2026-10-13' }),
  prizes: [{ title: 'Equipos (scratch)', rows: [{ place: 1, label: '1.er lugar', badge: 'Campeón', delivered: true, winners: ['Strikers · Ana y Beto'] }] }],
});

describe('reporte en Excel', () => {
  it('hojas: «General», «Individual» y el detalle del deporte', () => {
    const sheets = reportSheets(report(), '13 oct 2026');
    expect(sheets.map((s) => s.sheet)).toEqual(['General', 'Individual', 'Equipos']);
  });

  it('«General»: el torneo con todo, para leer', () => {
    const [general] = reportSheets(report(), '13 oct 2026');
    const text = lines(general);
    expect(text.slice(0, 3)).toEqual(['Copa Aniversario', 'Liga Norte · Boliche', 'Resultados parciales']);
    expect(text).toContain('Bolera | Bowling Center');
    expect(text).toContain('Hay 1 juego por verificar: puede cambiar el podio.');
    expect(text).toContain('Campeones');
    expect(text).toContain('Equipos (scratch) | Ganador | Integrantes | Resultado');
    expect(text).toContain('1.er lugar | Strikers | Ana y Beto | 1125 pinos');
    expect(text).toContain('Individual (handicap) | Ganador | Resultado');
    expect(text).toContain('3.er lugar | Beto | 621 pinos');
    expect(text).toContain('Premios');
    expect(text).toContain('1.er lugar | Campeón | Strikers · Ana y Beto');
    expect(text).toContain('Mejor juego | 210 · Ana');
    // La tabla de equipos, con el encabezado del Excel (equipo e integrantes por separado).
    expect(text).toContain('Lugar | Equipo | Integrantes | J1 | J2 | J3 | Scratch | Hcp | Total');
    expect(text).toContain('1 | Strikers | Ana, Beto | 390 | 360 | 375 | 1125 | 144 | 1269');
    expect(text[text.length - 1]).toBe('Generado con MatchMate · 13 oct 2026');
    expect(general.showGridLines).toBe(false);
    // Los números quedan como números (se pueden sumar en el Excel).
    const row = general.data.find((r) => line(r as CellLike[]).startsWith('1 | Strikers | Ana, Beto'))!;
    expect((row[0] as { value: unknown }).value).toBe(1);
    expect((row[6] as { value: unknown; fontWeight?: string }).fontWeight).toBe('bold');
  });

  it('«Individual»: la tabla con el encabezado fijo y las columnas de más', () => {
    const [, individual] = reportSheets(report(), '13 oct 2026');
    const text = lines(individual);
    expect(text[0]).toBe('Individual (handicap)');
    expect(text[2]).toBe('# | Jugador | Equipo | Categoría | Promedio de entrada | Hcp por juego | J1 | J2 | J3 | Juegos | Serie | Hcp | Total | Prom. | Mejor');
    expect(text[3]).toBe('1 | Ana | Strikers | A | 200 | 16 | 210 | 190 | 200 | 3 | 600 | 48 | 648 | 200 | 210');
    expect(text).toContain('Con juegos por verificar (todavía no cuentan)');
    // Título, nota y encabezado quedan fijos arriba.
    expect(individual.stickyRowsCount).toBe(3);
  });

  it('las hojas de detalle con nombres válidos y sin repetir', () => {
    const r = { ...report(), sheets: [{ sheet: 'General', data: [] }, { sheet: 'Grupo A: finales / [cuartos]', data: [] }] };
    expect(reportSheets(r, '').map((s) => s.sheet)).toEqual(['General', 'Individual', 'General (2)', 'Grupo A finales cuartos']);
  });

  it('el archivo', async () => {
    written.length = 0;
    const blob = await reportExcel(report(), { generated: '13 oct 2026' });
    expect(blob.type).toBe(XLSX_TYPE);
    expect(written[0].map((s) => s.sheet)).toEqual(['General', 'Individual', 'Equipos']);
  });
});

describe('ayudas del Excel', () => {
  it('nombres de hoja: ≤ 31, sin caracteres raros, sin repetir (sin importar mayúsculas)', () => {
    const used = new Set<string>();
    expect(sheetName('Tabla', used)).toBe('Tabla');
    expect(sheetName('tabla', used)).toBe('tabla (2)');
    expect(sheetName('x'.repeat(40), used)).toHaveLength(31);
    expect(sheetName('x'.repeat(40), used)).toBe(`${'x'.repeat(27)} (2)`);
    expect(sheetName('???', used)).toBe('Hoja');
  });

  it('nombres de archivo', () => {
    expect(safeFileName('Liga/Norte: 2026?')).toBe('Liga Norte 2026');
    expect(safeFileName('  ')).toBe('MatchMate');
  });
});

describe('el archivo del reporte', () => {
  it('Excel y PDF con su nombre y su tipo', async () => {
    const { reportFile } = await import('./file');
    const date = new Date(2026, 9, 13);
    const xlsx = await reportFile('excel', report(), { generated: '13 oct 2026', date });
    expect([xlsx.name, xlsx.type]).toEqual(['reporte-copa-aniversario-2026-10-13.xlsx', XLSX_TYPE]);
    const pdf = await reportFile('pdf', report(), { generated: '13 oct 2026', date });
    expect([pdf.name, pdf.type]).toEqual(['reporte-copa-aniversario-2026-10-13.pdf', 'application/pdf']);
    expect(pdf.size).toBeGreaterThan(1000);
  });
});
