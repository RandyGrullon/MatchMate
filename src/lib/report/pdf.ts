import type { jsPDF } from 'jspdf';
import type { CellDef, RowInput, Styles, UserOptions } from 'jspdf-autotable';
import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from '../../components/splash/brand';
import { pathPoints } from '../../components/share/paint';
import { INK, medalColor, readableOn, sportColor, tint } from '../../components/share/palette';
import { num } from '../format';
import {
  isGroupRow,
  rowCells,
  rowStrong,
  statusText,
  tablesFor,
  visibleColumns,
  type ReportCell,
  type ReportFact,
  type ReportTable,
  type TournamentReport,
} from './model';

/**
 * El reporte del torneo en PDF (A4, en blanco y negro con el color del deporte): la página «General» (el torneo con
 * todo) y después las páginas «Individual». jsPDF y jspdf-autotable se cargan solo al hacerlo (`reportPdf`): las tablas
 * largas pasan solas de página y repiten el encabezado. Al final, a cada página se le pone su encabezado (desde la 2) y
 * el pie «Generado con MatchMate · <fecha>» con «Página i de n».
 *
 * La letra es la Helvetica de jsPDF (WinAnsi: tildes, ñ, ¿, ¡, «», –, … sí; otras letras no): todo el texto pasa por
 * `pdfText` antes de escribirse.
 */

/** Una imagen ya lista para el PDF (el logo de la liga, en PNG o JPEG). */
export interface ReportImage {
  data: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
}

export interface PdfOptions {
  /** La fecha del pie: «29 sep 2026». */
  generated: string;
  /** El logo de la liga (null si no tiene o no se pudo bajar). */
  logo?: ReportImage | null;
}

/** La función de jspdf-autotable (se pasa para poder probar sin la librería). */
export type AutoTable = (doc: jsPDF, options: UserOptions) => void;

export const PDF_TYPE = 'application/pdf';

// ---------- Texto que la Helvetica sabe escribir ----------

/** Lo que WinAnsi tiene fuera de Latin-1 (jsPDF lo traduce solo). */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const REPLACE: Readonly<Record<string, string>> = {
  '−': '-',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '―': '—',
  '′': "'",
  '″': '"',
  '≤': '<=',
  '≥': '>=',
  '→': '->',
  '←': '<-',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
};

/**
 * El texto con solo lo que la Helvetica de jsPDF escribe bien (WinAnsi). Lo demás: «−» → «-», espacios raros → espacio,
 * letras con acentos de otros idiomas → sin el acento («ș» → «s»), letras de otros alfabetos → «?», y los emojis y
 * símbolos se quitan (si no, jsPDF escribe basura).
 */
export function pdfText(s: string | number | null | undefined): string {
  if (s == null) return '';
  let out = '';
  for (const ch of String(s).normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (c === 10) out += '\n';
    else if (c === 9) out += ' ';
    else if (c < 0x20 || (c >= 0x7f && c < 0xa0)) continue;
    else if (c <= 0xff || WIN_ANSI_EXTRA.has(ch)) out += c === 0xa0 ? ' ' : ch;
    else if (Object.hasOwn(REPLACE, ch)) out += REPLACE[ch];
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (base && base !== ch && [...base].every((b) => b.codePointAt(0)! <= 0xff)) out += base;
      else if (/[\p{L}\p{N}]/u.test(ch)) out += '?';
    }
  }
  return out.replace(/[ ]{2,}/g, ' ').trim();
}

/** El texto de una celda: los números con separador de miles («1,234»). */
const cellText = (v: ReportCell | undefined): string => (v == null ? '' : typeof v === 'number' ? num(v) : pdfText(v));

// ---------- Medidas (mm) ----------

const MARGIN = 14;
/** Donde empieza lo de la página 2 en adelante (arriba va el encabezado corto). */
const CONTENT_TOP = 22;
/** Lo que queda libre abajo para el pie. */
const BOTTOM = 16;
const PT = 0.3528;

const pageW = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const pageH = (doc: jsPDF) => doc.internal.pageSize.getHeight();
const lineH = (size: number) => size * PT * 1.25;

// ---------- Dibujo ----------

const M_POINTS = pathPoints(DUO_M);

/** La marca de MatchMate (la M de los dos compañeros) en un cuadro de `size` mm, sin imagen. */
export function drawMark(doc: jsPDF, x: number, y: number, size: number, tile: string, ink: string) {
  const k = size / 512;
  doc.setFillColor(tile);
  doc.roundedRect(x, y, size, size, DUO_RX * k, DUO_RX * k, 'F');
  doc.setDrawColor(ink);
  doc.setLineWidth(DUO_STROKE * k);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  const [first, ...rest] = M_POINTS;
  const deltas = rest.map(([px, py], i) => {
    const [ox, oy] = i === 0 ? first : rest[i - 1];
    return [(px - ox) * k, (py - oy) * k];
  });
  doc.lines(deltas, x + first[0] * k, y + first[1] * k, [1, 1], 'S', false);
  doc.setFillColor(ink);
  for (const [cx, cy] of DUO_HEADS) doc.circle(x + cx * k, y + cy * k, DUO_HEAD_R * k, 'F');
  doc.setLineCap('butt');
  doc.setLineJoin('miter');
}

/** Una línea recortada con «…» para que quepa en `width`. */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

interface Ctx {
  doc: jsPDF;
  autoTable: AutoTable;
  report: TournamentReport;
  /** El color del deporte, ya legible sobre blanco. */
  accent: string;
  y: number;
}

function setFont(doc: jsPDF, size: number, style: 'normal' | 'bold' = 'normal', color: string = INK.text) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(color);
}

/** Pasa de página si no caben `height` mm más (la misma orientación). */
function ensureSpace(c: Ctx, height: number) {
  if (c.y + height > pageH(c.doc) - BOTTOM) {
    c.doc.addPage();
    c.y = CONTENT_TOP;
  }
}

/** Texto de varias líneas que cabe en el ancho (sigue en la otra página si hace falta). */
function paragraph(c: Ctx, text: string, size: number, style: 'normal' | 'bold' = 'normal', color: string = INK.text, gap = 1.5) {
  const { doc } = c;
  setFont(doc, size, style, color);
  const lines: string[] = doc.splitTextToSize(pdfText(text), pageW(doc) - 2 * MARGIN);
  for (const line of lines) {
    ensureSpace(c, lineH(size));
    c.y += lineH(size);
    doc.text(line, MARGIN, c.y - lineH(size) * 0.25);
  }
  c.y += gap;
}

/** Título de una sección («Campeones», «Premios»…), en el color del deporte. Se lleva consigo espacio para lo que sigue. */
function sectionTitle(c: Ctx, text: string) {
  // Con espacio para lo que sigue (un título de tabla y sus primeras filas): el título no queda solo al pie.
  ensureSpace(c, 42);
  c.y += 3;
  setFont(c.doc, 13, 'bold', c.accent);
  c.y += lineH(13);
  c.doc.text(pdfText(text), MARGIN, c.y - lineH(13) * 0.25);
  c.doc.setDrawColor(c.accent);
  c.doc.setLineWidth(0.4);
  c.doc.line(MARGIN, c.y + 0.6, pageW(c.doc) - MARGIN, c.y + 0.6);
  c.y += 3.5;
}

/** Título de una tabla («Equipos (scratch)»). */
function tableTitle(c: Ctx, text: string, note?: string) {
  ensureSpace(c, 30);
  paragraph(c, text, 10.5, 'bold', INK.text, note ? 0.5 : 1.5);
  if (note) paragraph(c, note, 8.5, 'normal', INK.muted, 1.5);
}

const baseStyles = (fontSize: number): Partial<Styles> => ({
  font: 'helvetica',
  fontSize,
  cellPadding: 1.5,
  textColor: INK.text,
  lineColor: INK.line,
  lineWidth: 0.1,
  overflow: 'linebreak',
  valign: 'middle',
});

/** Dibuja una tabla y deja `y` debajo de ella. */
function table(c: Ctx, options: Omit<UserOptions, 'startY' | 'margin'>) {
  c.autoTable(c.doc, {
    startY: c.y,
    margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP, bottom: BOTTOM },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    ...options,
  });
  const finalY = (c.doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  c.y = (finalY ?? c.y) + 5;
}

/** Una tabla del reporte (con su título), como la ve el PDF. */
function reportTable(c: Ctx, t: ReportTable, fontSize: number) {
  const cols = visibleColumns(t, 'pdf');
  if (t.title) tableTitle(c, t.title, t.note);
  else if (t.note) paragraph(c, t.note, 8.5, 'normal', INK.muted);
  if (!t.rows.length) {
    if (t.empty) paragraph(c, t.empty, 9, 'normal', INK.muted, 4);
    return;
  }
  const head: CellDef[] = cols.map(({ col }) => ({ content: pdfText(col.label), styles: { halign: col.align ?? 'left' } }));
  const body: RowInput[] = t.rows.map((row) => {
    if (isGroupRow(row)) {
      return [{ content: pdfText(row.group), colSpan: cols.length, styles: { fontStyle: 'bold', fillColor: tint(c.accent, 0.9), textColor: INK.text } }];
    }
    const cells = rowCells(row);
    const strong = rowStrong(row);
    return cols.map(({ col, index }): CellDef => {
      const v = cells[index];
      const medal = col.place && typeof v === 'number' ? medalColor(v) : null;
      const styles: Partial<Styles> = {};
      if (col.strong || strong || medal) styles.fontStyle = 'bold';
      if (medal) styles.textColor = medal;
      return { content: cellText(v), styles };
    });
  });
  const columnStyles: Record<number, Partial<Styles>> = {};
  cols.forEach(({ col }, i) => {
    const numeric = col.align === 'right' || col.align === 'center';
    columnStyles[i] = { halign: col.align ?? 'left', ...(numeric ? { cellWidth: 'wrap' as const } : {}) };
  });
  table(c, {
    head: [head],
    body,
    theme: 'grid',
    styles: baseStyles(fontSize),
    headStyles: { fillColor: c.accent, textColor: INK.onColor, fontStyle: 'bold', lineColor: c.accent },
    alternateRowStyles: { fillColor: '#f7f8fa' },
    columnStyles,
  });
}

/** «Etiqueta: valor» sin rayas: los datos del torneo, arriba. */
function factsTable(c: Ctx, facts: readonly ReportFact[]) {
  if (!facts.length) return;
  table(c, {
    body: facts.map((f) => [
      { content: pdfText(f.label), styles: { fontStyle: 'bold', textColor: INK.muted } },
      { content: pdfText(f.value) },
    ]),
    theme: 'plain',
    styles: { ...baseStyles(9.5), lineWidth: 0, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 3 } },
    columnStyles: { 0: { cellWidth: 38 } },
  });
  c.y -= 2;
}

/** Lo de arriba de la primera página: la marca, el estado, el logo de la liga, el título y los datos del torneo. */
function drawCover(c: Ctx, logo: ReportImage | null | undefined) {
  const { doc, report } = c;
  const w = pageW(doc);
  drawMark(doc, MARGIN, 10, 8, c.accent, INK.onColor);
  setFont(doc, 10, 'bold');
  doc.text('MatchMate', MARGIN + 10.5, 15.6);
  setFont(doc, 9, 'bold', c.accent);
  doc.text(pdfText(statusText(report)), w - MARGIN, 15.6, { align: 'right' });
  doc.setDrawColor(c.accent);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 21, w - MARGIN, 21);

  let x = MARGIN;
  const top = 27;
  if (logo) {
    const box = 22;
    const ratio = logo.width > 0 && logo.height > 0 ? logo.width / logo.height : 1;
    const lw = ratio >= 1 ? box : box * ratio;
    const lh = ratio >= 1 ? box / ratio : box;
    try {
      doc.addImage(logo.data, logo.format, MARGIN + (box - lw) / 2, top + (box - lh) / 2, lw, lh);
      x = MARGIN + box + 5;
    } catch (e) {
      console.warn('[reporte] logo', e);
    }
  }
  const width = w - MARGIN - x;
  setFont(doc, 20, 'bold');
  const titleLines: string[] = doc.splitTextToSize(pdfText(report.title), width).slice(0, 2);
  // `base` = la línea de base de lo último escrito.
  let base = top + lineH(20) * 0.75;
  titleLines.forEach((line, i) => {
    if (i) base += lineH(20);
    doc.text(line, x, base);
  });
  if (report.subtitle) {
    setFont(doc, 11, 'normal', INK.muted);
    base += lineH(11) + 1.5;
    doc.text(fit(doc, pdfText(report.subtitle), width), x, base);
  }
  c.y = Math.max(base + 4, logo && x > MARGIN ? top + 25 : 0);
  factsTable(c, report.facts);
  for (const note of report.notes) paragraph(c, note, 9.5, 'bold', readableOn('#a15c00', '#ffffff'));
}

/** Una lista sin encabezado de tabla (campeones, premios): el título arriba y filas con rayas finas. */
function listTable(c: Ctx, title: string, body: RowInput[], columnStyles: Record<number, Partial<Styles>>) {
  ensureSpace(c, 8 + Math.min(body.length, 3) * 7);
  paragraph(c, title, 10.5, 'bold', INK.text, 1);
  table(c, {
    body,
    theme: 'grid',
    styles: baseStyles(9.5),
    columnStyles,
  });
  c.y -= 1.5;
}

const placeCell = (place: number, label: string): CellDef => ({ content: pdfText(label), styles: { fontStyle: 'bold', textColor: medalColor(place) ?? INK.text } });

function drawPodiums(c: Ctx) {
  const { report } = c;
  sectionTitle(c, 'Campeones');
  if (!report.podiums.length) {
    paragraph(c, 'Todavía no hay campeones.', 9.5, 'normal', INK.muted, 3);
    return;
  }
  for (const podium of report.podiums) {
    const members = podium.places.some((p) => p.winners.some((w) => w.members));
    // Sin resultado que mostrar (los cuadros: el campeón es quien ganó la final), sin esa columna.
    const detail = podium.places.some((p) => p.winners.some((w) => w.detail));
    const body: RowInput[] = [];
    for (const place of podium.places) {
      if (!place.winners.length) {
        body.push([placeCell(place.place, place.label), { content: pdfText(place.note ?? 'Nadie en este lugar'), colSpan: 1 + Number(members) + Number(detail), styles: { textColor: INK.muted } }]);
        continue;
      }
      place.winners.forEach((w, i) =>
        body.push([
          i === 0 ? placeCell(place.place, place.label) : { content: '' },
          { content: pdfText(w.name), styles: { fontStyle: 'bold' } },
          ...(members ? [{ content: pdfText(w.members ?? ''), styles: { textColor: INK.muted } }] : []),
          ...(detail ? [{ content: pdfText(w.detail ?? ''), styles: { halign: 'right' as const } }] : []),
        ]),
      );
    }
    listTable(c, podium.title, body, { 0: { cellWidth: 22 }, 1: { minCellWidth: 38 }, ...(detail ? { [members ? 3 : 2]: { cellWidth: 'wrap' as const } } : {}) });
  }
}

function drawPrizes(c: Ctx) {
  const { report } = c;
  if (!report.prizes.length) return;
  sectionTitle(c, 'Premios');
  for (const section of report.prizes) {
    listTable(
      c,
      section.title,
      section.rows.map((r) => [
        placeCell(r.place, r.label),
        { content: pdfText(r.badge), styles: { textColor: INK.muted } },
        r.delivered ? { content: pdfText(r.winners.join('\n') || 'Nadie en este lugar') } : { content: 'Por entregar', styles: { textColor: INK.muted } },
      ]),
      { 0: { cellWidth: 22 }, 1: { cellWidth: 48 } },
    );
  }
}

/** El resumen en dos columnas de «etiqueta valor». */
function drawHighlights(c: Ctx) {
  const { report } = c;
  if (!report.highlights.length) return;
  sectionTitle(c, 'Resumen');
  const body: RowInput[] = [];
  for (let i = 0; i < report.highlights.length; i += 2) {
    const pair = report.highlights.slice(i, i + 2);
    body.push(
      pair.flatMap((f) => [
        { content: pdfText(f.label), styles: { fontStyle: 'bold', textColor: INK.muted } },
        { content: pdfText(f.value) },
      ]),
    );
  }
  table(c, {
    body,
    theme: 'plain',
    styles: { ...baseStyles(9.5), lineWidth: 0, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 3 } },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 53 }, 2: { cellWidth: 38 } },
  });
  c.y -= 1;
}

/** Encabezado corto (de la página 2 en adelante) y pie de todas las páginas. */
function drawFrames(c: Ctx, generated: string, individualFrom: number | null) {
  const { doc, report } = c;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const w = pageW(doc);
    const h = pageH(doc);
    if (i > 1) {
      drawMark(doc, MARGIN, 8, 6, c.accent, INK.onColor);
      setFont(doc, 8.5, 'bold');
      doc.text('MatchMate', MARGIN + 8, 12.2);
      const section = individualFrom != null && i >= individualFrom ? 'Individual' : 'General';
      setFont(doc, 8.5, 'normal', INK.muted);
      doc.text(fit(doc, `${pdfText(report.title)} · ${section}`, w - 2 * MARGIN - 30), w - MARGIN, 12.2, { align: 'right' });
      doc.setDrawColor(c.accent);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, 15.5, w - MARGIN, 15.5);
    }
    doc.setDrawColor(INK.line);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, h - 11.5, w - MARGIN, h - 11.5);
    setFont(doc, 7.5, 'normal', INK.muted);
    doc.text(`Generado con MatchMate · ${pdfText(generated)}`, MARGIN, h - 7.5);
    doc.text(`Página ${i} de ${total}`, w - MARGIN, h - 7.5, { align: 'right' });
  }
}

/** Las páginas «Individual» van acostadas si la tabla más ancha tiene más de 14 columnas (o si el deporte lo pide). */
export function individualLandscape(report: TournamentReport): boolean {
  if (report.individualLandscape != null) return report.individualLandscape;
  return tablesFor(report.individual, 'pdf').some((t) => visibleColumns(t, 'pdf').length > 14);
}

/** Dibuja todo el reporte en `doc` (una página A4 vertical ya abierta). Devuelve en qué página empieza «Individual». */
export function drawReport(doc: jsPDF, autoTable: AutoTable, report: TournamentReport, opts: PdfOptions): { individualFrom: number | null } {
  const accent = readableOn(sportColor(report.sport), '#ffffff');
  const c: Ctx = { doc, autoTable, report, accent, y: MARGIN };
  doc.setProperties({ title: pdfText(report.title), subject: 'Reporte del torneo', creator: 'MatchMate' });

  // Página «General»: el torneo con todo.
  drawCover(c, opts.logo);
  drawPodiums(c);
  drawPrizes(c);
  drawHighlights(c);
  const general = tablesFor(report.general, 'pdf');
  if (general.length) {
    sectionTitle(c, 'Resultados');
    for (const t of general) reportTable(c, t, 8.5);
  }

  // Páginas «Individual»: en otra página (acostada si tiene muchas columnas).
  const individual = tablesFor(report.individual, 'pdf');
  let individualFrom: number | null = null;
  if (individual.length) {
    doc.addPage('a4', individualLandscape(report) ? 'landscape' : 'portrait');
    individualFrom = doc.getNumberOfPages();
    c.y = CONTENT_TOP;
    setFont(doc, 16, 'bold', accent);
    c.y += lineH(16);
    doc.text('Individual', MARGIN, c.y - lineH(16) * 0.25);
    c.y += 3;
    for (const t of individual) reportTable(c, t, 8);
  }

  drawFrames(c, opts.generated, individualFrom);
  return { individualFrom };
}

/** El PDF del reporte (carga jsPDF y jspdf-autotable aquí, solo al hacerlo). */
export async function reportPdf(report: TournamentReport, opts: PdfOptions): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  drawReport(doc, autoTable as AutoTable, report, opts);
  const blob = doc.output('blob');
  return blob.type ? blob : new Blob([blob], { type: PDF_TYPE });
}
