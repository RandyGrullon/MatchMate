/**
 * Dibujo de una imagen para compartir como lista de figuras (rectángulos, círculos, textos y el logo) con
 * posiciones ya calculadas. Sin React ni navegador: lo arma cards.ts, lo pinta paint.ts en un canvas (PNG) y
 * svg.ts lo pasa a SVG (pruebas). Unidades: píxeles lógicos (la imagen sale al doble).
 */
import type { BadgeLook } from '../../badges/visual/types';

export type Align = 'left' | 'right' | 'center';
export type Weight = 400 | 500 | 600 | 700 | 800;

export interface RectNode {
  t: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radio de las esquinas. */
  r?: number;
  color: string;
  opacity?: number;
}

export interface CircleNode {
  t: 'circle';
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity?: number;
}

export interface TextNode {
  t: 'text';
  /** Punto de anclaje según `align`. */
  x: number;
  /** Línea base. */
  y: number;
  text: string;
  size: number;
  weight: Weight;
  color: string;
  align?: Align;
  opacity?: number;
}

/** El logo de MatchMate («Dúo») en un cuadro de `size`. */
export interface LogoNode {
  t: 'logo';
  x: number;
  y: number;
  size: number;
  tile: string;
  ink: string;
}

/**
 * Una insignia (docs/insignias.md §4.9) en el cuadro (x, y) de `size`: paint.ts la pinta con `Path2D`
 * (share/badgePaint.ts) y svg.ts la mete como `<svg>` anidado.
 */
export interface BadgeArtNode {
  t: 'badge';
  x: number;
  y: number;
  size: number;
  look: BadgeLook;
}

export type SceneNode = RectNode | CircleNode | TextNode | LogoNode | BadgeArtNode;

export interface Scene {
  width: number;
  height: number;
  background: string;
  nodes: SceneNode[];
}

/** Ancho de un texto en píxeles lógicos. En el teléfono lo mide el canvas; en las pruebas, `estimateWidth`. */
export type Measure = (text: string, size: number, weight: Weight) => number;

/** La letra de la app (Inter) y, si no cargó, la del sistema. */
export const FONT_STACK = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const fontSpec = (size: number, weight: Weight) => `${weight} ${size}px ${FONT_STACK}`;

const NARROW = new Set([...'ilj.,:;\'!|·']);
const SEMI = new Set([...'ftrI()[]{}-/ ']);
const WIDE = new Set([...'mwMW@%']);

function charWidth(c: string): number {
  if (NARROW.has(c)) return 0.27;
  if (SEMI.has(c)) return 0.36;
  if (WIDE.has(c)) return 0.86;
  if (c >= '0' && c <= '9') return 0.6;
  if (c !== c.toLowerCase()) return 0.68;
  return 0.56;
}

/** Ancho aproximado para Inter (sin navegador). Tira un poco a lo ancho para no pasarse del espacio. */
export const estimateWidth: Measure = (text, size, weight) => {
  let em = 0;
  for (const c of text) em += charWidth(c);
  return em * size * (weight >= 700 ? 1.06 : weight >= 600 ? 1.03 : 1);
};

/** Corta el texto con «…» para que quepa en `max`. */
export function ellipsize(text: string, max: number, size: number, weight: Weight, measure: Measure): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (measure(clean, size, weight) <= max) return clean;
  const chars = Array.from(clean);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join('').trimEnd()}…`, size, weight) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo ? `${chars.slice(0, lo).join('').trimEnd()}…` : '…';
}

/** Parte el texto en renglones de hasta `max` (el último con «…» si no cabe todo). */
export function wrapLines(text: string, max: number, size: number, weight: Weight, measure: Measure, maxLines = 2): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (!line || measure(next, size, weight) <= max) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      lines.push(ellipsize(`${line} ${words.slice(i).join(' ')}`, max, size, weight, measure));
      return lines;
    }
    // Una palabra sola más larga que el renglón también se corta.
    lines.push(ellipsize(line, max, size, weight, measure));
    line = words[i];
  }
  if (line) lines.push(ellipsize(line, max, size, weight, measure));
  return lines;
}
