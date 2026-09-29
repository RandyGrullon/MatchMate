import type { BadgeLook } from '../../badges/visual/types';
import { INK, medalColor, toneColors, type ShareTone } from './palette';
import { ellipsize, estimateWidth, wrapLines, type Align, type Measure, type Scene, type SceneNode, type TextNode, type Weight } from './scene';

/**
 * Las dos imágenes para compartir por WhatsApp, armadas como Scene (sin navegador):
 *
 * - **Tabla** (`kind: 'table'`): posiciones, ranking, orden de mérito, puntos por club, resultados de una prueba.
 *   Filas con puesto (medalla para los 3 primeros), nombre (con línea chica y punto de color opcionales) y
 *   columnas; por secciones («Grupo A», «Femenino · 11-12»).
 * - **Resultado** (`kind: 'result'`): un partido, con el estado, los dos lados y el marcador (grande o por sets).
 *
 * Arriba va el deporte, la fecha, el título y una línea; abajo el logo de MatchMate y el link. El fondo es el
 * color del deporte. Ancho fijo de 540 (sale a 1080 px) y el alto según las filas.
 */

export const CARD_WIDTH = 540;
/** Filas que caben en una imagen que WhatsApp no achique hasta no leerse. El resto: «y 7 más». */
export const DEFAULT_MAX_ROWS = 24;

/** Margen del cuadro blanco y del encabezado. */
const M = 16;
const HX = 24;
/** Espacio para los nombres antes de quitar columnas opcionales: al menos MIN_NAME y a lo más MAX_NAME. */
const MIN_NAME = 150;
const MAX_NAME = 240;
const GAP = 14;

export interface ShareColumn {
  /** Encabezado corto: «PJ», «Pts», «Tiempo». */
  label: string;
  /** La columna principal (en negrita y más grande): puntos, promedio, tiempo. */
  strong?: boolean;
  /** Se quita si no cabe (las que en el teléfono salen solo en la computadora). */
  optional?: boolean;
}

export interface ShareRow {
  /** Puesto (null = sin puesto: DQ, no salió). */
  rank?: number | null;
  name: string;
  /** Línea chica debajo del nombre: equipo, club. */
  sub?: string;
  /** Color del equipo o del club. */
  dot?: string | null;
  /** Un valor por columna, en el mismo orden. */
  values: readonly (string | number)[];
  /** Más clara (descalificado, no terminó). */
  dim?: boolean;
}

export interface ShareSection {
  heading?: string;
  rows: readonly ShareRow[];
}

interface CardBase {
  /** Nombre de la liga, del encuentro o del evento. */
  title: string;
  /** «Tabla · Temporada 2026», «Prueba 3 · 50 m libre». */
  subtitle?: string;
  /** Texto que acompaña la imagen al compartir (sin el link). Por defecto, título y línea. */
  caption?: string;
  /** Nota chica al final del cuadro. */
  note?: string;
}

export interface ShareTableSpec extends CardBase {
  kind: 'table';
  /** Encabezado de la columna de nombres: «Equipo», «Jugador», «Club». */
  nameLabel?: string;
  columns: readonly ShareColumn[];
  sections: readonly ShareSection[];
  maxRows?: number;
}

export interface ShareScoreCell {
  text: string;
  /** Ganó ese set (o el partido): en negrita. */
  strong?: boolean;
  /** Número chico arriba: los puntos del tie-break. */
  sup?: string;
}

export interface ShareResultSide {
  name: string;
  sub?: string;
  dot?: string | null;
  winner?: boolean;
  cells: readonly ShareScoreCell[];
}

export interface ShareResultSpec extends CardBase {
  kind: 'result';
  status?: { label: string; tone: ShareTone };
  sides: readonly [ShareResultSide, ShareResultSide];
  /** Un número grande por lado (baloncesto, fútbol, americano). Por defecto: si hay una sola columna. */
  big?: boolean;
}

/**
 * Una insignia (docs/insignias.md §4.9): 540 × 675 (sale a 1080 × 1350, 4:5 para WhatsApp e Instagram). `title` es
 * el nombre de la insignia. La nota del creador nunca va aquí.
 */
export interface ShareBadgeSpec extends CardBase {
  kind: 'badge';
  look: BadgeLook;
  /** «Oro · Octubre 2026». */
  levelLine: string;
  /** Color de la cinta del nivel (se lee sobre blanco). */
  levelColor: string;
  description: string;
  /** Quién la ganó y dónde. */
  player: string;
  league?: string;
  /** «Solo el 4 % de los jugadores de boliche la tiene» u «Otorgada por Liga Los Pinos · 12 oct 2026». */
  footnote?: string;
}

export type ShareCard = ShareTableSpec | ShareResultSpec | ShareBadgeSpec;

/** Alto de la tarjeta de una insignia. */
export const BADGE_CARD_HEIGHT = 675;

/** Lo que rodea la imagen: el deporte, su color, la fecha y el link. */
export interface CardFrame {
  /** «Pádel», «Fútbol sala» (sale arriba en mayúsculas). */
  sportLabel: string;
  /** Color del deporte (fondo). */
  color: string;
  /** «27 sep 2026». */
  date?: string;
  /** Link que sale abajo (se muestra corto, sin https://). */
  link?: string;
}

/** «https://www.app.com/l/x/ranking?ver=1#a» → «app.com/l/x/ranking». */
export function linkLabel(url: string): string {
  return url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

/** Texto que acompaña la imagen: el de la tarjeta (o título y línea) y el link. */
export function shareCaption(card: ShareCard, url?: string): string {
  const head = card.caption ?? [card.title, card.subtitle].filter(Boolean).join(' · ');
  return [head, url].filter(Boolean).join('\n');
}

const text = (x: number, y: number, s: string, size: number, weight: Weight, color: string, align: Align = 'left', opacity?: number): TextNode => ({
  t: 'text',
  x,
  y,
  text: s,
  size,
  weight,
  color,
  align,
  ...(opacity != null && opacity < 1 ? { opacity } : {}),
});

const divider = (x: number, y: number, w: number): SceneNode => ({ t: 'rect', x, y, w, h: 1, color: INK.line });

/** Arma la imagen (Scene). `measure` mide los textos (en el teléfono, el canvas). */
export function buildScene(card: ShareCard, frame: CardFrame, measure: Measure = estimateWidth): Scene {
  if (card.kind === 'badge') return badgeScene(card, frame, measure);
  const W = CARD_WIDTH;
  const front: SceneNode[] = [];
  const top = header(front, card, frame, measure);
  const body: SceneNode[] = [];
  const cardW = W - 2 * M;
  const h = card.kind === 'table' ? table(body, card, M, top, cardW, measure) : result(body, card, frame.color, M, top, cardW, measure);
  front.push({ t: 'rect', x: M, y: top, w: cardW, h, r: 18, color: INK.surface }, ...body);
  const H = footer(front, frame, top + h + 18, measure);
  // Círculos claros de adorno sobre el color (el cuadro blanco los tapa donde se cruzan).
  const deco: SceneNode[] = [
    { t: 'circle', cx: W - 36, cy: 12, r: 124, color: INK.onColor, opacity: 0.08 },
    { t: 'circle', cx: W - 6, cy: 150, r: 64, color: INK.onColor, opacity: 0.06 },
    { t: 'circle', cx: 26, cy: H + 34, r: 112, color: INK.onColor, opacity: 0.07 },
  ];
  return { width: W, height: Math.ceil(H), background: frame.color, nodes: [...deco, ...front] };
}

/** Deporte y fecha, título (hasta 2 renglones) y la línea. Devuelve dónde empieza el cuadro blanco. */
function header(out: SceneNode[], card: ShareCard, frame: CardFrame, measure: Measure): number {
  const W = CARD_WIDTH;
  let y = 22;
  const sport = frame.sportLabel.toLocaleUpperCase('es');
  const dateW = frame.date ? measure(frame.date, 12, 600) + 16 : 0;
  const pill = ellipsize(sport, W - 2 * HX - dateW - 20, 11, 700, measure);
  out.push({ t: 'rect', x: HX, y, w: measure(pill, 11, 700) + 20, h: 22, r: 11, color: INK.onColor, opacity: 0.18 });
  out.push(text(HX + 10, y + 15, pill, 11, 700, INK.onColor));
  if (frame.date) out.push(text(W - HX, y + 15, frame.date, 12, 600, INK.onColor, 'right', 0.85));
  y += 22 + 12;
  const lines = wrapLines(card.title.trim() || 'MatchMate', W - 2 * HX, 26, 800, measure, 2);
  let base = y;
  lines.forEach((line, i) => {
    base = y + 26 + i * 32;
    out.push(text(HX, base, line, 26, 800, INK.onColor));
  });
  if (card.subtitle) {
    base += 24;
    out.push(text(HX, base, ellipsize(card.subtitle, W - 2 * HX, 15, 500, measure), 15, 500, INK.onColor, 'left', 0.88));
  }
  return base + 20;
}

/** Logo y nombre a la izquierda, el link a la derecha. Devuelve el alto total de la imagen. */
function footer(out: SceneNode[], frame: CardFrame, y: number, measure: Measure): number {
  const W = CARD_WIDTH;
  const size = 30;
  out.push({ t: 'logo', x: HX, y, size, tile: INK.onColor, ink: frame.color });
  const wx = HX + size + 9;
  const base = y + 21;
  const mw = measure('Match', 18, 800);
  out.push(text(wx, base, 'Match', 18, 800, INK.onColor));
  out.push(text(wx + mw, base, 'Mate', 18, 800, INK.onColor, 'left', 0.72));
  const end = wx + mw + measure('Mate', 18, 800) + 20;
  if (frame.link) {
    const link = ellipsize(linkLabel(frame.link), W - HX - end, 13, 500, measure);
    if (link !== '…') out.push(text(W - HX, base - 1, link, 13, 500, INK.onColor, 'right', 0.9));
  }
  return y + size + 22;
}

function table(out: SceneNode[], spec: ShareTableSpec, x: number, y0: number, w: number, measure: Measure): number {
  const innerL = x + 14;
  const innerR = x + w - 16;
  const rankCx = innerL + 13;
  const nameX = innerL + 36;

  // Filas que caben; las demás se cuentan en «y N más».
  let room = Math.max(1, spec.maxRows ?? DEFAULT_MAX_ROWS);
  let hidden = 0;
  const sections: ShareSection[] = [];
  for (const s of spec.sections) {
    if (!s.rows.length) continue;
    const rows = s.rows.slice(0, room);
    hidden += s.rows.length - rows.length;
    room -= rows.length;
    if (rows.length) sections.push({ heading: s.heading, rows });
  }
  const all = sections.flatMap((s) => s.rows);

  // Columnas: el ancho de lo más largo; si no queda espacio para los nombres, se quitan las opcionales
  // (de derecha a izquierda) y, si hace falta, las que no son la principal.
  const valueFont = (strong?: boolean): [number, Weight] => (strong ? [17, 800] : [15, 500]);
  let cols = spec.columns.map((c, i) => {
    const [size, weight] = valueFont(c.strong);
    const width = Math.max(18, measure(c.label, 12, 600), ...all.map((r) => measure(String(r.values[i] ?? ''), size, weight)));
    return { ...c, i, width };
  });
  const nameRoom = () => innerR - cols.reduce((a, c) => a + c.width + GAP, 0) - nameX;
  const dropLast = (pick: (c: (typeof cols)[number]) => boolean) => {
    for (let k = cols.length - 1; k >= 0; k--) {
      if (pick(cols[k])) {
        cols = cols.filter((_, j) => j !== k);
        return true;
      }
    }
    return false;
  };
  // Los nombres piden lo que miden (entre MIN_NAME y MAX_NAME): con nombres cortos caben todas las columnas.
  const wantName = Math.min(MAX_NAME, Math.max(MIN_NAME, ...all.map((r) => measure(r.name, 16, 600) + (r.dot ? 16 : 0) + 12)));
  while (nameRoom() < wantName) if (!dropLast((c) => !!c.optional)) break;
  while (nameRoom() < 90 && cols.length > 1) if (!dropLast((c) => !c.strong)) break;

  const placed: ((typeof cols)[number] & { right: number })[] = [];
  let right = innerR;
  for (let k = cols.length - 1; k >= 0; k--) {
    placed[k] = { ...cols[k], right };
    right -= cols[k].width + GAP;
  }
  const nameMax = right + GAP - 12 - nameX;

  let y = y0 + 6;
  const hb = y + 22;
  out.push(text(rankCx, hb, '#', 12, 600, INK.muted, 'center'));
  out.push(text(nameX, hb, ellipsize(spec.nameLabel ?? 'Nombre', nameMax, 12, 600, measure), 12, 600, INK.muted));
  for (const c of placed) out.push(text(c.right, hb, c.label, 12, 600, INK.muted, 'right'));
  y += 34;
  out.push(divider(x + 12, y, w - 24));

  if (!sections.length) {
    out.push(text(innerL, y + 30, 'Todavía no hay datos.', 14, 500, INK.muted));
    return y + 48 - y0;
  }

  const rowH = all.some((r) => r.sub) ? 50 : 42;
  let afterBand = true;
  for (const s of sections) {
    if (s.heading) {
      out.push({ t: 'rect', x, y: y + 1, w, h: 30, color: INK.soft });
      out.push(text(innerL, y + 21, ellipsize(s.heading.toLocaleUpperCase('es'), innerR - innerL, 11, 700, measure), 11, 700, INK.muted));
      y += 31;
      afterBand = true;
    }
    for (const r of s.rows) {
      if (!afterBand) out.push(divider(x + 12, y, w - 24));
      afterBand = false;
      const mid = y + rowH / 2;
      const op = r.dim ? 0.55 : undefined;
      const medal = medalColor(r.rank);
      if (medal) {
        out.push({ t: 'circle', cx: rankCx, cy: mid, r: 12, color: medal, ...(op ? { opacity: op } : {}) });
        out.push(text(rankCx, mid + 4.5, String(r.rank), 12, 800, INK.onColor, 'center', op));
      } else {
        out.push(text(rankCx, mid + 5, r.rank == null ? '–' : String(r.rank), 14, 600, INK.muted, 'center', op));
      }
      let nx = nameX;
      if (r.dot) {
        out.push({ t: 'circle', cx: nx + 5, cy: r.sub ? mid - 8 : mid - 0.5, r: 5, color: r.dot, ...(op ? { opacity: op } : {}) });
        nx += 16;
      }
      const max = nameMax - (nx - nameX);
      if (r.sub) {
        out.push(text(nx, mid - 3, ellipsize(r.name, max, 16, 600, measure), 16, 600, INK.text, 'left', op));
        out.push(text(nx, mid + 15, ellipsize(r.sub, max, 12, 500, measure), 12, 500, INK.muted, 'left', op));
      } else {
        out.push(text(nx, mid + 6, ellipsize(r.name, max, 16, 600, measure), 16, 600, INK.text, 'left', op));
      }
      for (const c of placed) {
        const [size, weight] = valueFont(c.strong);
        out.push(text(c.right, mid + (c.strong ? 6 : 5), String(r.values[c.i] ?? ''), size, weight, c.strong ? INK.text : INK.muted, 'right', op));
      }
      y += rowH;
    }
  }

  if (hidden > 0) {
    out.push(divider(x + 12, y, w - 24));
    out.push(text(nameX, y + 25, `y ${hidden} más en la app`, 13, 600, INK.muted));
    y += 38;
  }
  y = note(out, spec.note, x, y, w, measure);
  return y + 6 - y0;
}

function result(out: SceneNode[], spec: ShareResultSpec, accent: string, x: number, y0: number, w: number, measure: Measure): number {
  const innerL = x + 18;
  const innerR = x + w - 20;
  let y = y0 + 16;
  if (spec.status) {
    const { fg, bg } = toneColors(spec.status.tone, accent);
    const label = ellipsize(spec.status.label, innerR - innerL - 20, 12, 700, measure);
    out.push({ t: 'rect', x: innerL, y, w: measure(label, 12, 700) + 20, h: 24, r: 12, color: bg });
    out.push(text(innerL + 10, y + 16.5, label, 12, 700, fg));
    y += 24 + 6;
  }

  const big = spec.big ?? spec.sides.every((s) => s.cells.length <= 1);
  const size = big ? 40 : 24;
  const rowH = big ? 74 : 58;
  const ncol = Math.max(0, ...spec.sides.map((s) => s.cells.length));
  const cols: { right: number; supW: number }[] = [];
  let right = innerR;
  for (let j = ncol - 1; j >= 0; j--) {
    const cells = spec.sides.map((s) => s.cells[j]).filter((c): c is ShareScoreCell => !!c);
    const numW = Math.max(0, ...cells.map((c) => measure(c.text, size, 800)));
    const supW = Math.max(0, ...cells.map((c) => (c.sup ? measure(c.sup, 12, 600) + 2 : 0)));
    cols[j] = { right, supW };
    right -= numW + supW + (big ? 0 : 18);
  }
  const nameX = innerL + 14;
  const nameMax = right - 16 - nameX;
  const anyWinner = spec.sides.some((s) => s.winner);

  spec.sides.forEach((s, i) => {
    if (i > 0) out.push(divider(x + 12, y, w - 24));
    const mid = y + rowH / 2;
    if (s.winner) out.push({ t: 'rect', x: innerL, y: mid - 17, w: 4, h: 34, r: 2, color: accent });
    let nx = nameX;
    if (s.dot) {
      out.push({ t: 'circle', cx: nx + 5, cy: s.sub ? mid - 9 : mid - 1, r: 5, color: s.dot });
      nx += 16;
    }
    const max = nameMax - (nx - nameX);
    const color = !anyWinner || s.winner ? INK.text : INK.muted;
    const weight: Weight = s.winner ? 800 : 600;
    if (s.sub) {
      out.push(text(nx, mid - 2, ellipsize(s.name, max, 19, weight, measure), 19, weight, color));
      out.push(text(nx, mid + 17, ellipsize(s.sub, max, 12, 500, measure), 12, 500, INK.muted));
    } else {
      out.push(text(nx, mid + 7, ellipsize(s.name, max, 19, weight, measure), 19, weight, color));
    }
    s.cells.forEach((c, j) => {
      const col = cols[j];
      const numRight = col.right - col.supW;
      const base = mid + size * 0.36;
      out.push(text(numRight, base, c.text, size, c.strong ? 800 : 500, c.strong ? INK.text : INK.muted, 'right'));
      if (c.sup) out.push(text(numRight + 2, base - size * 0.42, c.sup, 12, 600, INK.muted));
    });
    y += rowH;
  });

  y = note(out, spec.note, x, y, w, measure);
  return y + 8 - y0;
}

/** Nota chica al final del cuadro (hasta 3 renglones), con una raya arriba. */
function note(out: SceneNode[], s: string | undefined, x: number, y: number, w: number, measure: Measure): number {
  if (!s?.trim()) return y;
  out.push(divider(x + 12, y, w - 24));
  y += 8;
  for (const line of wrapLines(s, w - 32, 12, 500, measure, 3)) {
    y += 17;
    out.push(text(x + 16, y, line, 12, 500, INK.muted));
  }
  return y + 8;
}

/**
 * La tarjeta de una insignia (§4.9): arriba, en el color del deporte, el logo y «MatchMate · Boliche» (y la fecha);
 * el cuadro blanco con la insignia a 240, el nombre, el nivel en el color de su cinta, la descripción (2 renglones),
 * quién la ganó y en qué liga, y la rareza o quién la otorgó; abajo, el link.
 */
function badgeScene(card: ShareBadgeSpec, frame: CardFrame, measure: Measure): Scene {
  const W = CARD_WIDTH;
  const H = BADGE_CARD_HEIGHT;
  const cx = W / 2;
  const inner = W - 2 * M - 48;
  const nodes: SceneNode[] = [
    { t: 'circle', cx: W - 36, cy: 12, r: 124, color: INK.onColor, opacity: 0.08 },
    { t: 'circle', cx: 26, cy: H - 10, r: 112, color: INK.onColor, opacity: 0.07 },
  ];

  // Arriba: logo, «MatchMate · Boliche» y la fecha.
  const logo = 30;
  nodes.push({ t: 'logo', x: HX, y: 20, size: logo, tile: INK.onColor, ink: frame.color });
  const wx = HX + logo + 9;
  const base = 41;
  const mw = measure('Match', 18, 800);
  nodes.push(text(wx, base, 'Match', 18, 800, INK.onColor), text(wx + mw, base, 'Mate', 18, 800, INK.onColor, 'left', 0.72));
  const brandEnd = wx + mw + measure('Mate', 18, 800);
  const dateW = frame.date ? measure(frame.date, 12, 600) + 12 : 0;
  const sport = frame.sportLabel.trim();
  if (sport) nodes.push(text(brandEnd + 6, base - 1, ellipsize(`· ${sport}`, W - HX - dateW - brandEnd - 12, 15, 600, measure), 15, 600, INK.onColor, 'left', 0.85));
  if (frame.date) nodes.push(text(W - HX, base - 1, frame.date, 12, 600, INK.onColor, 'right', 0.85));

  // El cuadro blanco.
  const top = 72;
  const bottom = 616;
  nodes.push({ t: 'rect', x: M, y: top, w: W - 2 * M, h: bottom - top, r: 24, color: INK.surface });
  nodes.push({ t: 'badge', x: cx - 120, y: 88, size: 240, look: card.look });

  // Nombre: 30/800 en un renglón (más chico si no cabe).
  const name = card.title.trim() || 'Insignia';
  const nameSize = [30, 26, 22].find((s) => measure(name, s, 800) <= inner) ?? 22;
  nodes.push(text(cx, 368, ellipsize(name, inner, nameSize, 800, measure), nameSize, 800, INK.text, 'center'));
  if (card.levelLine) nodes.push(text(cx, 398, ellipsize(card.levelLine, inner, 16, 700, measure), 16, 700, card.levelColor, 'center'));
  wrapLines(card.description, inner, 16, 500, measure, 2).forEach((line, i) => nodes.push(text(cx, 432 + i * 22, line, 16, 500, INK.muted, 'center')));
  nodes.push(divider(M + 40, 486, W - 2 * M - 80));
  nodes.push(text(cx, 518, ellipsize(card.player, inner, 20, 700, measure), 20, 700, INK.text, 'center'));
  if (card.league) nodes.push(text(cx, 542, ellipsize(card.league, inner, 14, 500, measure), 14, 500, INK.muted, 'center'));
  if (card.footnote) nodes.push(text(cx, 580, ellipsize(card.footnote, inner, 13, 600, measure), 13, 600, card.levelColor, 'center'));

  // Abajo, el link.
  if (frame.link) {
    const link = ellipsize(linkLabel(frame.link), W - 2 * HX, 13, 500, measure);
    if (link !== '…') nodes.push(text(cx, 650, link, 13, 500, INK.onColor, 'center', 0.9));
  }
  return { width: W, height: H, background: frame.color, nodes };
}
