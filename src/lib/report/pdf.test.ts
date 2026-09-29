import { inflateSync } from 'node:zlib';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { describe, expect, it, vi } from 'vitest';
import { bowlingReport } from './bowling';
import { bowlingEvent, ENTRIES, entry, LEAGUE, PLAYERS } from './fixtures';
import type { TournamentReport } from './model';
import { drawReport, individualLandscape, pdfText, reportPdf, type AutoTable } from './pdf';

/**
 * El PDF se hace de verdad (jsPDF tiene versión para Node) y se leen los textos que quedaron escritos en cada página.
 */

const report = (over: Partial<Parameters<typeof bowlingReport>[0]> = {}): TournamentReport => ({
  ...bowlingReport({ lid: 'L1', league: LEAGUE, event: bowlingEvent(), entries: ENTRIES, players: PLAYERS, today: '2026-10-13', ...over }),
  prizes: [{ title: 'Equipos (scratch)', rows: [{ place: 1, label: '1.er lugar', badge: 'Campeón', delivered: true, winners: ['Strikers · Ana y Beto'] }] }],
});

/** Dibuja el reporte sin comprimir y devuelve el documento y los textos de cada página. */
function draw(r: TournamentReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false });
  const { individualFrom } = drawReport(doc, autoTable as AutoTable, r, { generated: '13 oct 2026' });
  const pages: string[][] = [];
  const internal = doc.internal as unknown as { pages: string[][] };
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    const stream = internal.pages[i].join('\n');
    pages.push([...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')));
  }
  const size = (i: number) => {
    doc.setPage(i);
    return [Math.round(doc.internal.pageSize.getWidth()), Math.round(doc.internal.pageSize.getHeight())];
  };
  return { doc, pages, individualFrom, size };
}

/**
 * Las páginas de un PDF ya hecho (comprimido), en orden (/Kids de /Pages): si va acostada y los textos que tiene (el
 * /Contents de cada una, descomprimido).
 */
function filePages(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString('latin1');
  const obj = (id: string) => raw.match(new RegExp(`\\n${id} 0 obj\\n([\\s\\S]*?)\\nendobj`))?.[1] ?? '';
  const kids = [...(raw.match(/\/Type \/Pages\n\/Kids \[([^\]]*)\]/)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => m[1]);
  return kids.map((id) => {
    const page = obj(id);
    const [, w, h] = page.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/) ?? [];
    const contents = obj(page.match(/\/Contents (\d+) 0 R/)?.[1] ?? '');
    const start = contents.indexOf('stream\n') + 'stream\n'.length;
    const length = Number(contents.match(/\/Length (\d+)/)?.[1] ?? 0);
    const stream = inflateSync(Buffer.from(contents.slice(start, start + length), 'latin1')).toString('latin1');
    const texts = [...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1'));
    return { landscape: Number(w) > Number(h), texts };
  });
}

/** Muchos jugadores (para que la tabla pase de página). */
function crowd(n: number, games = 3) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jugador número ${i + 1}`, averageOverride: null }));
  const entries = players.map((p, i) => entry(p.id, null, 150 + (i % 50), Array.from({ length: games }, (_, g) => 100 + ((i * 7 + g * 13) % 150))));
  return { players, entries };
}

describe('texto para la Helvetica del PDF', () => {
  it('deja las tildes, la ñ y los signos del español', () => {
    expect(pdfText('¿Añejo «Cañón» – 1.er lugar · 2.º… “sí”?')).toBe('¿Añejo «Cañón» – 1.er lugar · 2.º… “sí”?');
  });

  it('cambia lo que no sabe escribir y quita los emojis', () => {
    expect(pdfText('−5 ≥ 3')).toBe('-5 >= 3');
    expect(pdfText('Ștefan Dvořák')).toBe('Stefan Dvorák');
    expect(pdfText('Campeón 🏆🎳')).toBe('Campeón');
    expect(pdfText('张伟')).toBe('??');
    expect(pdfText('a b c')).toBe('a b c');
    expect(pdfText(null)).toBe('');
    expect(pdfText(1234)).toBe('1234');
  });
});

describe('reporte en PDF', () => {
  it('página «General» con todo y el individual en otra página; pie con la fecha y «Página i de n»', () => {
    const { pages, individualFrom } = draw(report());
    expect(pages).toHaveLength(2);
    expect(individualFrom).toBe(2);
    const [general, individual] = pages;
    expect(general).toEqual(expect.arrayContaining(['MatchMate', 'Resultados parciales', 'Copa Aniversario', 'Liga Norte · Boliche', 'Bowling Center']));
    expect(general).toEqual(expect.arrayContaining(['Hay 1 juego por verificar: puede cambiar el podio.']));
    expect(general).toEqual(expect.arrayContaining(['Campeones', 'Equipos (scratch)', 'Individual (handicap)', 'Strikers', 'Ana y Beto', '1125 pinos']));
    expect(general).toEqual(expect.arrayContaining(['Premios', 'Campeón', 'Strikers · Ana y Beto']));
    expect(general).toEqual(expect.arrayContaining(['Resumen', 'Mejor juego', '210 · Ana', 'Resultados']));
    // La tabla de equipos (en el PDF, el equipo con sus jugadores debajo) y los números con separador de miles.
    expect(general).toEqual(expect.arrayContaining(['Lugar', 'Equipo', 'J1', 'Scratch', 'Strikers', 'Ana, Beto', '1,125', '1,269']));
    expect(general).not.toContain('Integrantes');
    expect(general).toEqual(expect.arrayContaining(['Generado con MatchMate · 13 oct 2026', 'Página 1 de 2']));
    // Individual: encabezado corto, título y la tabla (sin las columnas que son solo del Excel).
    expect(individual).toEqual(expect.arrayContaining(['Copa Aniversario · Individual', 'Individual', 'Individual (handicap)', '#', 'Jugador', 'Serie', 'Total', 'Mejor', 'Página 2 de 2']));
    expect(individual).not.toContain('Categoría');
    expect(individual).toEqual(expect.arrayContaining(['Con juegos por verificar (todavía no cuentan)', 'Eva']));
  });

  it('tablas largas: pasan solas de página y repiten el encabezado', () => {
    const { players, entries } = crowd(120);
    const { pages, individualFrom } = draw(report({ event: bowlingEvent({ teams: {}, teamSize: 0 }), players, entries }));
    expect(individualFrom).toBe(2);
    const individualPages = pages.slice(1);
    expect(individualPages.length).toBeGreaterThan(2);
    for (const [i, page] of individualPages.entries()) {
      expect(page.filter((t) => t === 'Jugador')).toHaveLength(1);
      expect(page).toContain(`Página ${i + 2} de ${pages.length}`);
      expect(page).toContain('Copa Aniversario · Individual');
    }
    const names = individualPages.flat().filter((t) => t.startsWith('Jugador número'));
    expect(names).toHaveLength(120);
  });

  it('más de 6 juegos: las páginas «Individual» van acostadas; la «General», de pie', () => {
    const r = report({ event: bowlingEvent({ games: 8 }), entries: ENTRIES.map((e) => ({ ...e, scores: [...e.scores, 200, 200, 200, 200, 200], photos: [...e.photos, 'x', 'x', 'x', 'x', 'x'] })) });
    expect(individualLandscape(r)).toBe(true);
    const { size, individualFrom, doc } = draw(r);
    expect(size(1)).toEqual([210, 297]);
    for (let i = individualFrom!; i <= doc.getNumberOfPages(); i++) expect(size(i)).toEqual([297, 210]);
  });

  it('sin juegos: dice que no hay campeones y no hay páginas «Individual» vacías de más', () => {
    const r: TournamentReport = { ...report({ entries: [] }), prizes: [] };
    const { pages } = draw(r);
    expect(pages[0]).toContain('Todavía no hay campeones.');
    expect(pages[0]).toContain('Todavía no hay juegos verificados.');
  });

  it('el archivo de verdad (comprimido, como sale en la app): la página «General» y después la «Individual»', async () => {
    const blob = await reportPdf(report(), { generated: '13 oct 2026' });
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pages = filePages(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0].landscape).toBe(false);
    expect(pages[0].texts).toEqual(expect.arrayContaining(['Copa Aniversario', 'Campeones', 'Premios', 'Resumen', 'Resultados', 'Página 1 de 2']));
    expect(pages[0].texts).not.toContain('Individual');
    expect(pages[1].texts).toEqual(expect.arrayContaining(['Copa Aniversario · Individual', 'Individual', 'Individual (handicap)', 'Ana', 'Página 2 de 2']));
    // Con más de 6 juegos, la «Individual» acostada también en el archivo.
    const wide = report({ event: bowlingEvent({ games: 8 }), entries: ENTRIES.map((e) => ({ ...e, scores: [...e.scores, 200, 200, 200, 200, 200], photos: [...e.photos, 'x', 'x', 'x', 'x', 'x'] })) });
    const widePages = filePages(new Uint8Array(await (await reportPdf(wide, { generated: '13 oct 2026' })).arrayBuffer()));
    expect(widePages.map((p) => p.landscape)).toEqual([false, true]);
  });
});

describe('logo de la liga en el PDF', () => {
  // Un PNG de 1×1.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('va arriba, junto al título', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false });
    drawReport(doc, autoTable as AutoTable, report(), { generated: '13 oct 2026', logo: { data: PNG, format: 'PNG', width: 1, height: 1 } });
    expect(doc.output()).toContain('/Subtype /Image');
  });

  it('una imagen que no sirve no rompe el reporte', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => drawReport(doc, autoTable as AutoTable, report(), { generated: '13 oct 2026', logo: { data: 'data:image/png;base64,AAAA', format: 'PNG', width: 1, height: 1 } })).not.toThrow();
    expect(doc.getNumberOfPages()).toBe(2);
    warn.mockRestore();
  });
});
