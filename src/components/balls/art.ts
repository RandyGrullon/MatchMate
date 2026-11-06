import {
  ballDesignColors,
  ballDesignSeed,
  cleanStickerText,
  mixColors,
  readableOn,
  type BallDesign,
  type BallDesignColors,
  type BallSticker,
} from '../../lib/ballDesign';

/**
 * El dibujo de una bola del boliche sin React (lo pintan BallArt.tsx en la web y la bola de la app del teléfono,
 * movil/src/components/balls/BallArt.tsx, con react-native-svg): las figuras del dibujo (perlada, jaspeada, galaxia…),
 * las figuras pegadas, la sombra, el brillo del borde, los huecos, el brillo y el borde, todo en el viewBox 0 0 100 100
 * y sin nada al azar (el dibujo sale de una semilla del diseño).
 *
 * Se ve a 24, 40, 64 y 160 px: el borde y el brillo se engrosan en lo chico (medidos en píxeles), lo fino del dibujo
 * se aclara (menos puntos, más grandes) y un halo tenue la separa de un fondo oscuro.
 */

/** El centro del dibujo (viewBox 0 0 100 100). */
export const C = 50;
/** Radio del campo del dibujo alrededor del centro: cubre la bola con el tamaño más chico (0.5) y cualquier ángulo. */
const FIELD = 96;

export type BallArtDetail = 'min' | 'mid' | 'full';

/** Cuánto detalle cabe: hasta 31 px lo justo, hasta 95 px casi todo, desde 96 px todo. */
export const ballArtDetail = (size: number): BallArtDetail => (size < 32 ? 'min' : size < 96 ? 'mid' : 'full');

/** Medidas que dependen de los píxeles: el borde y el halo no se pierden en lo chico ni pesan en lo grande. */
export function ballArtMetrics(size: number) {
  const px = 100 / Math.max(8, size);
  const outline = clamp(1.35 * px, 2.2, 7);
  const halo = clamp(0.9 * px, 0.8, 3);
  return { outline, halo, radius: C - outline / 2 - halo };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Números cortos en el SVG. */
export const artNum = (v: number) => Math.round(v * 100) / 100;
const f = artNum;

// ---------- Números al azar (con semilla) ----------

/** mulberry32: los mismos números para la misma semilla. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Trazos ----------

type Pt = readonly [number, number];

/** Una curva suave que pasa por los puntos (Catmull-Rom como Bézier). */
export function smoothPath(pts: readonly Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}Z`;

/** Destello de cuatro puntas centrado en (x, y). */
function glintPath(x: number, y: number, r: number): string {
  const k = r * 0.24;
  return `M${f(x)} ${f(y - r)}L${f(x + k)} ${f(y - k)}L${f(x + r)} ${f(y)}L${f(x + k)} ${f(y + k)}L${f(x)} ${f(y + r)}L${f(x - k)} ${f(y + k)}L${f(x - r)} ${f(y)}L${f(x - k)} ${f(y - k)}Z`;
}

// ---------- El dibujo ----------

/** Un color '#rrggbb' o el degradado suave del segundo ('@soft2') o del tercer color ('@soft3'). */
export type ArtPaint = string;

export type ArtShape =
  | { t: 'circle'; cx: number; cy: number; r: number; fill: ArtPaint; opacity?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number; fill: ArtPaint; opacity?: number }
  | { t: 'path'; d: string; fill?: ArtPaint; stroke?: ArtPaint; width?: number; opacity?: number };

/** Una figura del dibujo, en coordenadas desde el centro de la bola con tamaño 1 y ángulo 0, y el círculo que la tapa. */
export interface PatternFeature {
  shape: ArtShape;
  bx: number;
  by: number;
  br: number;
}

interface Knobs {
  /** Cuánto de lo que se repite se dibuja (lo chico no aguanta cientos de puntos). */
  keep: number;
  /** Cuánto se engruesa lo fino. */
  thin: number;
}

const KNOBS: Record<BallArtDetail, Knobs> = {
  min: { keep: 0.35, thin: 2 },
  mid: { keep: 0.6, thin: 1.35 },
  full: { keep: 1, thin: 1 },
};

const TAU = Math.PI * 2;
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Un punto repartido parejo en un disco de radio r. */
function inDisc(rnd: () => number, r: number): Pt {
  const d = r * Math.sqrt(rnd());
  const a = rnd() * TAU;
  return [Math.cos(a) * d, Math.sin(a) * d];
}

/** Lo que tapa una lista de puntos (centro y radio). */
function cover(pts: readonly Pt[], pad: number): { bx: number; by: number; br: number } {
  const bx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const by = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return { bx, by, br: Math.max(...pts.map((p) => Math.hypot(p[0] - bx, p[1] - by))) + pad };
}

/** Una banda con borde suave: una más ancha y tenue debajo (según la suavidad) y la del centro. */
function softStroke(out: PatternFeature[], d: string, color: string, width: number, softness: number, box: { bx: number; by: number; br: number }) {
  if (softness > 0.02) out.push({ shape: { t: 'path', d, stroke: color, width: width * (1 + 1.8 * softness), opacity: 0.12 + 0.28 * softness }, ...box });
  out.push({ shape: { t: 'path', d, stroke: color, width: width * (1 - 0.3 * softness), opacity: 0.95 }, ...box });
}

function perlada(rnd: () => number): PatternFeature[] {
  const out: PatternFeature[] = [{ shape: { t: 'ellipse', cx: 0, cy: 0, rx: 34, ry: 16, rot: 20, fill: '@soft3', opacity: 0.5 }, bx: 0, by: 0, br: 34 }];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + rnd() * 0.6;
    const dist = 12 + Math.sqrt(i / n) * 80 + rnd() * 6;
    const cx = Math.cos(a) * dist;
    const cy = Math.sin(a) * dist;
    const rx = 20 + rnd() * 18;
    out.push({
      shape: { t: 'ellipse', cx, cy, rx, ry: 8 + rnd() * 8, rot: deg(a) + 90 + (rnd() - 0.5) * 40, fill: i % 3 === 2 ? '@soft3' : '@soft2', opacity: 0.55 + rnd() * 0.35 },
      bx: cx,
      by: cy,
      br: rx,
    });
  }
  return out;
}

/** Remolino: cada punto gira más cerca del centro (el jaspeado de las bolas de verdad). */
const swirl = ([x, y]: Pt, k: number): Pt => {
  const a = k * Math.exp(-Math.hypot(x, y) / 55);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

function jaspeada(rnd: () => number, c: BallDesignColors, softness: number, k: Knobs): PatternFeature[] {
  const out: PatternFeature[] = [];
  const bands = 9;
  for (let i = 0; i < bands; i++) {
    const y0 = -100 + i * 25 + (rnd() - 0.5) * 8;
    const amp = 6 + rnd() * 9;
    const freq = TAU / (70 + rnd() * 50);
    const ph = rnd() * TAU;
    const pts: Pt[] = [];
    for (let x = -108; x <= 108; x += 18) pts.push(swirl([x, y0 + amp * Math.sin(x * freq + ph) + (rnd() - 0.5) * 5], 1.1));
    const main = i % 2 === 0;
    softStroke(out, smoothPath(pts, false), main ? c.second : c.third, main ? 8 + rnd() * 8 : (2.5 + rnd() * 2.5) * k.thin, softness, cover(pts, 8));
  }
  return out;
}

function veteada(rnd: () => number, c: BallDesignColors, softness: number, k: Knobs): PatternFeature[] {
  const out: PatternFeature[] = [];
  const veins = 11;
  for (let v = 0; v < veins; v++) {
    let [x, y] = inDisc(rnd, 88);
    let dir = rnd() * TAU;
    const len = 9 + rnd() * 7;
    const pts: Pt[] = [[x, y]];
    const dirs: number[] = [dir];
    const segs = 7 + Math.floor(rnd() * 5);
    for (let s = 0; s < segs; s++) {
      dir += (rnd() - 0.5) * 0.9;
      x += Math.cos(dir) * len;
      y += Math.sin(dir) * len;
      pts.push([x, y]);
      dirs.push(dir);
    }
    const width = (1.1 + rnd() * 1.6) * k.thin;
    const color = v % 3 === 2 ? c.third : c.second;
    const d = smoothPath(pts, false);
    const box = cover(pts, 4);
    if (softness > 0.02) out.push({ shape: { t: 'path', d, stroke: color, width: width * (2.5 + 3 * softness), opacity: 0.22 * softness }, ...box });
    out.push({ shape: { t: 'path', d, stroke: color, width }, ...box });
    if (rnd() < 0.7) {
      const from = 2 + Math.floor(rnd() * (segs - 3));
      let [bx, by] = pts[from];
      let bdir = dirs[from] + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5);
      const branch: Pt[] = [[bx, by]];
      for (let s = 0, n = 3 + Math.floor(rnd() * 3); s < n; s++) {
        bdir += (rnd() - 0.5) * 0.8;
        bx += Math.cos(bdir) * len * 0.7;
        by += Math.sin(bdir) * len * 0.7;
        branch.push([bx, by]);
      }
      out.push({ shape: { t: 'path', d: smoothPath(branch, false), stroke: c.third, width: width * 0.6 }, ...cover(branch, 3) });
    }
  }
  return out;
}

function bicolor(c: BallDesignColors, softness: number, k: Knobs): PatternFeature[] {
  const pts: Pt[] = [];
  for (let x = -112; x <= 112; x += 8) pts.push([x, 9 * Math.sin((x * TAU) / 120)]);
  const wave = smoothPath(pts, false);
  const all = { bx: 0, by: 0, br: 160 };
  const out: PatternFeature[] = [{ shape: { t: 'path', d: `${wave}L112 112L-112 112Z`, fill: c.second }, ...all }];
  if (softness > 0.02) {
    const mid = mixColors(c.base, c.second, 0.5);
    out.push({ shape: { t: 'path', d: wave, stroke: mid, width: 3 + 22 * softness, opacity: 0.45 }, ...all });
    out.push({ shape: { t: 'path', d: wave, stroke: mid, width: 2 + 11 * softness, opacity: 0.55 }, ...all });
  }
  out.push({ shape: { t: 'path', d: wave, stroke: c.third, width: 3 * k.thin }, ...all });
  return out;
}

function destellos(rnd: () => number, c: BallDesignColors, softness: number, k: Knobs): PatternFeature[] {
  const out: PatternFeature[] = [];
  if (softness > 0.02) out.push({ shape: { t: 'ellipse', cx: -14, cy: -10, rx: 62, ry: 46, rot: -20, fill: '@soft2', opacity: 0.3 * softness }, bx: -14, by: -10, br: 62 });
  const glint = mixColors(c.third, '#ffffff', 0.6);
  const n = 260;
  for (let i = 0; i < n; i++) {
    const [x, y] = inDisc(rnd, FIELD);
    const size = 0.6 + rnd() ** 2 * 1.5;
    const second = rnd() < 0.68;
    const alpha = 1 - softness * 0.65 * rnd();
    const spark = 2.2 + rnd() * 1.8;
    // Lo chico: solo una parte (siempre la misma), más grande.
    if (rnd() > k.keep) continue;
    const boost = k.thin * (k.keep < 1 ? 1.15 : 1);
    if (i % 11 === 0) {
      const r = spark * boost;
      out.push({ shape: { t: 'path', d: glintPath(x, y, r), fill: glint, opacity: alpha }, bx: x, by: y, br: r });
    } else {
      out.push({ shape: { t: 'circle', cx: x, cy: y, r: size * boost, fill: second ? c.second : c.third, opacity: alpha }, bx: x, by: y, br: size * boost });
    }
  }
  return out;
}

function galaxia(rnd: () => number, c: BallDesignColors, k: Knobs): PatternFeature[] {
  const out: PatternFeature[] = [];
  const band = rnd() * 180;
  out.push({ shape: { t: 'ellipse', cx: 0, cy: 0, rx: 78, ry: 17, rot: band, fill: '@soft3', opacity: 0.45 }, bx: 0, by: 0, br: 78 });
  for (let i = 0; i < 8; i++) {
    const [cx, cy] = inDisc(rnd, 78);
    const rx = 22 + rnd() * 22;
    out.push({ shape: { t: 'ellipse', cx, cy, rx, ry: 12 + rnd() * 13, rot: rnd() * 180, fill: i % 2 ? '@soft3' : '@soft2', opacity: 0.6 + rnd() * 0.3 }, bx: cx, by: cy, br: rx });
  }
  const star = mixColors(c.third, '#ffffff', 0.7);
  for (let i = 0; i < 170; i++) {
    const [x, y] = inDisc(rnd, FIELD);
    const r = (0.35 + rnd() ** 3 * 1.1) * k.thin;
    const alpha = 0.6 + rnd() * 0.4;
    if (rnd() > k.keep) continue;
    out.push({ shape: { t: 'circle', cx: x, cy: y, r, fill: star, opacity: alpha }, bx: x, by: y, br: r });
  }
  for (let i = 0; i < 10; i++) {
    const [x, y] = inDisc(rnd, FIELD);
    const r = (2 + rnd() * 1.8) * Math.min(1.6, k.thin);
    out.push({ shape: { t: 'path', d: glintPath(x, y, r), fill: '#ffffff', opacity: 0.95 }, bx: x, by: y, br: r });
  }
  return out;
}

function camuflaje(rnd: () => number, c: BallDesignColors, softness: number): PatternFeature[] {
  const out: PatternFeature[] = [];
  const dark = mixColors(c.base, '#000000', 0.45);
  const jag = 0.12 + 0.38 * (1 - softness);
  const cell = 24;
  for (let gy = -4; gy <= 4; gy++) {
    for (let gx = -4; gx <= 4; gx++) {
      const cx = gx * cell + (gy % 2 ? cell / 2 : 0) + (rnd() - 0.5) * 12;
      const cy = gy * cell * 0.9 + (rnd() - 0.5) * 10;
      const r0 = 9 + rnd() * 6;
      const sides = 7 + Math.floor(rnd() * 3);
      const pts: Pt[] = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * TAU + (rnd() - 0.5) * 0.4;
        const rr = r0 * (1 + (rnd() - 0.5) * 2 * jag);
        pts.push([cx + Math.cos(a) * rr * 1.3, cy + Math.sin(a) * rr * 0.85]);
      }
      const u = rnd();
      if (Math.hypot(cx, cy) > FIELD + 16) continue;
      out.push({ shape: { t: 'path', d: smoothPath(pts, true), fill: u < 0.4 ? c.second : u < 0.8 ? c.third : dark }, ...cover(pts, 0) });
    }
  }
  return out;
}

/**
 * Las figuras del dibujo de un diseño (sin el tamaño ni el ángulo: esos los pone el <g> que las envuelve), las
 * mismas siempre para el mismo dibujo y color base (ballDesignSeed), sin las que quedan fuera de la bola.
 */
export function patternFeatures(d: BallDesign, detail: BallArtDetail = 'full', radius = 46): PatternFeature[] {
  const rnd = random(ballDesignSeed(d));
  const c = ballDesignColors(d);
  const k = KNOBS[detail];
  const all = (() => {
    switch (d.pattern) {
      case 'perlada':
        return perlada(rnd);
      case 'jaspeada':
        return jaspeada(rnd, c, d.softness, k);
      case 'veteada':
        return veteada(rnd, c, d.softness, k);
      case 'bicolor':
        return bicolor(c, d.softness, k);
      case 'destellos':
        return destellos(rnd, c, d.softness, k);
      case 'galaxia':
        return galaxia(rnd, c, k);
      case 'camuflaje':
        return camuflaje(rnd, c, d.softness);
      default:
        return [];
    }
  })();
  // El dibujo se agranda `scale` veces desde el centro (y girar no cambia distancias): lo que queda a más de
  // radius / scale del centro no se ve.
  const reach = radius / d.scale + 1;
  return all.filter((x) => Math.hypot(x.bx, x.by) - x.br < reach);
}

// ---------- Figuras pegadas ----------

const STAR = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.47 : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${f(Math.cos(a) * r)} ${f(Math.sin(a) * r + 0.08)}`);
  }
  return `M${pts.join('L')}Z`;
})();

const HEART =
  'M0 0.9C-0.25 0.7 -1 0.25 -1 -0.3C-1 -0.75 -0.6 -0.95 -0.3 -0.92C-0.12 -0.9 0 -0.75 0 -0.55C0 -0.75 0.12 -0.9 0.3 -0.92C0.6 -0.95 1 -0.75 1 -0.3C1 0.25 0.25 0.7 0 0.9Z';
const BOLT = 'M0.18 -1L-0.62 0.14L-0.06 0.14L-0.3 1L0.62 -0.2L0.06 -0.2L0.42 -1Z';
const FLAME =
  'M0.02 -1C0.3 -0.62 0.82 -0.4 0.8 0.22C0.78 0.7 0.42 1 0 1C-0.42 1 -0.8 0.7 -0.8 0.26C-0.8 -0.1 -0.55 -0.28 -0.42 -0.6C-0.28 -0.3 -0.16 -0.18 0 -0.12C0.12 -0.42 0.1 -0.72 0.02 -1Z';
const FLAME_CORE = 'M0 0.9C-0.28 0.9 -0.46 0.7 -0.44 0.46C-0.42 0.2 -0.2 0.08 -0.12 -0.14C0.06 0.08 0.44 0.22 0.44 0.52C0.44 0.76 0.24 0.9 0 0.9Z';
const SKULL =
  'M0 -0.95C0.6 -0.95 0.92 -0.55 0.92 -0.1C0.92 0.25 0.72 0.42 0.56 0.5L0.56 0.78C0.56 0.9 0.46 0.96 0.36 0.96L-0.36 0.96C-0.46 0.96 -0.56 0.9 -0.56 0.78L-0.56 0.5C-0.72 0.42 -0.92 0.25 -0.92 -0.1C-0.92 -0.55 -0.6 -0.95 0 -0.95Z';
const SKULL_NOSE = 'M0 0.22L0.1 0.4L-0.1 0.4Z';
const SKULL_TEETH = 'M-0.2 0.66V0.94M0 0.66V0.94M0.2 0.66V0.94';
/** Un pino del boliche dentro de un círculo: el logo de la bola (ninguna marca de verdad). */
const PIN =
  'M0 -0.62C0.11 -0.62 0.17 -0.54 0.17 -0.43C0.17 -0.33 0.1 -0.27 0.08 -0.19C0.08 -0.09 0.27 0.08 0.27 0.3C0.27 0.47 0.19 0.57 0.16 0.63L-0.16 0.63C-0.19 0.57 -0.27 0.47 -0.27 0.3C-0.27 0.08 -0.08 -0.09 -0.08 -0.19C-0.1 -0.27 -0.17 -0.33 -0.17 -0.43C-0.17 -0.54 -0.11 -0.62 0 -0.62Z';
const PIN_BANDS = 'M-0.085 -0.21H0.085M-0.1 -0.12H0.1';

/** El borde oscuro de una figura (del mismo color). */
export const stickerOutline = (color: string) => mixColors(color, '#0b0b12', 0.74);

/**
 * Un trozo de una figura pegada, en coordenadas de -1 a 1. `round`: las puntas y las uniones del borde redondeadas
 * ('cap': solo las puntas). `fill` sin decir: el de siempre del SVG (en las rayas del pino no se ve: no tienen área).
 */
export type StickerPart =
  | { t: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; round?: 'all' | 'cap' }
  | { t: 'circle'; r: number; fill: string; stroke?: string; strokeWidth?: number; round?: 'all' }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string }
  | { t: 'text'; text: string; fontSize: number; weight: 800 | 900; fill: string; stroke?: string; strokeWidth?: number };

/** Los trozos de una figura (`sw`: el grueso del borde en sus unidades); nada si no tiene qué dibujar. */
export function stickerParts(s: BallSticker, outline: string, sw: number, detail: BallArtDetail): StickerPart[] {
  const line = { stroke: outline, strokeWidth: sw, round: 'all' as const };
  switch (s.shape) {
    case 'estrella':
      return [{ t: 'path', d: STAR, fill: s.color, ...line }];
    case 'corazon':
      return [{ t: 'path', d: HEART, fill: s.color, ...line }];
    case 'rayo':
      return [{ t: 'path', d: BOLT, fill: s.color, ...line }];
    case 'llama':
      return [{ t: 'path', d: FLAME, fill: s.color, ...line }, ...(detail !== 'min' ? [{ t: 'path' as const, d: FLAME_CORE, fill: mixColors(s.color, '#fff3b0', 0.6) }] : [])];
    case 'calavera':
      return [
        { t: 'path', d: SKULL, fill: s.color, ...line },
        { t: 'ellipse', cx: -0.34, cy: -0.02, rx: 0.23, ry: 0.26, fill: outline },
        { t: 'ellipse', cx: 0.34, cy: -0.02, rx: 0.23, ry: 0.26, fill: outline },
        ...(detail !== 'min'
          ? [
              { t: 'path' as const, d: SKULL_NOSE, fill: outline },
              { t: 'path' as const, d: SKULL_TEETH, fill: 'none', stroke: outline, strokeWidth: sw * 0.8, round: 'cap' as const },
            ]
          : []),
      ];
    case 'logo': {
      const ink = readableOn(s.color);
      return [
        { t: 'circle', r: 0.95, fill: s.color, ...line },
        ...(detail !== 'min' ? [{ t: 'circle' as const, r: 0.76, fill: 'none', stroke: ink, strokeWidth: 0.07 }] : []),
        { t: 'path', d: PIN, fill: ink },
        { t: 'path', d: PIN_BANDS, stroke: s.color, strokeWidth: 0.05 },
      ];
    }
    case 'numero': {
      const text = cleanStickerText('numero', s.text);
      return [
        { t: 'circle', r: 0.95, fill: s.color, ...line },
        ...(text ? [{ t: 'text' as const, text, fontSize: [1.25, 1, 0.74][text.length - 1], weight: 800 as const, fill: readableOn(s.color) }] : []),
      ];
    }
    case 'iniciales': {
      const text = cleanStickerText('iniciales', s.text);
      if (!text) return [];
      return [{ t: 'text', text, fontSize: [1.6, 1.12, 0.8][text.length - 1], weight: 900, fill: s.color, stroke: outline, strokeWidth: sw * 2 }];
    }
    default:
      return [];
  }
}

// ---------- La bola ----------

/** Huella corta del diseño y el tamaño (para los id del SVG). */
export function designHash(d: BallDesign, size: number): string {
  let h = 0x811c9dc5;
  for (const ch of `${JSON.stringify(d)}|${size}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Dónde van los huecos (en radios desde el centro): dos dedos arriba y el pulgar abajo, lejos del brillo. */
export const BALL_HOLES: readonly { x: number; y: number; r: number }[] = [
  { x: -0.06, y: -0.44, r: 0.118 },
  { x: 0.27, y: -0.4, r: 0.118 },
  { x: 0.13, y: -0.02, r: 0.135 },
];

/** Una figura pegada en su lugar: cómo se mueve, gira y agranda, y sus trozos. */
export interface ArtStickerSpot {
  transform: string;
  parts: StickerPart[];
}

/** Un hueco: el aro (con el borde) y, desde 32 px, el fondo. */
export interface ArtHole {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  inner: { cx: number; cy: number; r: number; fill: string } | null;
}

/** Todo lo que se dibuja de una bola, en el viewBox 0 0 100 100 (los números ya cortos, como van en el SVG). */
export interface BallArtScene {
  detail: BallArtDetail;
  colors: BallDesignColors;
  /** El radio de la bola (el recorte y el borde). */
  radius: number;
  /** El grueso del borde. */
  outline: number;
  /** El halo tenue de afuera (separa la bola de un fondo oscuro). */
  halo: { r: number; width: number };
  /** Las figuras del dibujo y cómo se giran y agrandan desde el centro. */
  features: PatternFeature[];
  patternTransform: string;
  /** ¿Algo del dibujo usa los degradados suaves ('@soft2', '@soft3')? */
  usesSoft: boolean;
  /** Hasta dónde va lleno el degradado suave (después se desvanece). */
  solidTo: number;
  stickers: ArtStickerSpot[];
  /** La sombra de dibujo animado (abajo a la derecha) y la luz que rebota en el borde. */
  shadow: { d: string; opacity: number };
  rim: { d: string; opacity: number };
  holes: ArtHole[];
  shine: { cx: number; cy: number; rx: number; ry: number; transform: string; dot: { cx: number; cy: number; r: number } | null } | null;
}

/** La bola de ese diseño a ese tamaño (BallArt la pinta). */
export function ballArtScene(d: BallDesign, size: number): BallArtScene {
  const detail = ballArtDetail(size);
  const { outline: ow, halo, radius: R } = ballArtMetrics(size);
  const features = patternFeatures(d, detail, R);
  const c = ballDesignColors(d);
  const at = (x: number, y: number) => [C + x * R, C + y * R] as const;
  const shineX = f(C - R * 0.4);
  const shineY = f(C - R * 0.53);
  return {
    detail,
    colors: c,
    radius: f(R),
    outline: f(ow),
    halo: { r: f(R + ow / 2 + halo / 2), width: f(halo) },
    features,
    patternTransform: `translate(${C} ${C}) rotate(${f(d.angle)}) scale(${f(d.scale)})`,
    usesSoft: features.some((x) => x.shape.t !== 'path' && (x.shape.fill === '@soft2' || x.shape.fill === '@soft3')),
    // Degradado suave: lleno en el centro y se desvanece hacia el borde (más temprano cuanto más suave).
    solidTo: f(Math.max(0.05, 0.97 - 0.9 * d.softness)),
    stickers: d.stickers.map((s) => {
      const k = s.size * R;
      const [x, y] = at(s.x, s.y);
      return { transform: `translate(${f(x)} ${f(y)}) rotate(${f(s.rotation)}) scale(${f(k)})`, parts: stickerParts(s, stickerOutline(s.color), (ow * 0.55) / k, detail) };
    }),
    shadow: { d: `${circlePath(C, C, R)}${circlePath(C - R * 0.17, C - R * 0.21, R * 1.06)}`, opacity: 0.2 },
    rim: { d: `${circlePath(C, C, R)}${circlePath(C - R * 0.05, C - R * 0.05, R)}`, opacity: detail === 'min' ? 0.3 : 0.22 },
    holes: d.holes
      ? BALL_HOLES.map((h) => {
          const [x, y] = at(h.x, h.y);
          const r = h.r * R * (detail === 'min' ? 1.2 : 1);
          return {
            cx: f(x),
            cy: f(y),
            r: f(r),
            fill: mixColors(c.hole, c.base, 0.3),
            stroke: c.outline,
            strokeWidth: f(ow * 0.4),
            inner: detail !== 'min' ? { cx: f(x - r * 0.15), cy: f(y - r * 0.15), r: f(r * 0.78), fill: c.hole } : null,
          };
        })
      : [],
    shine: d.shine
      ? {
          cx: shineX,
          cy: shineY,
          rx: f(R * (detail === 'min' ? 0.3 : 0.27)),
          ry: f(R * (detail === 'min' ? 0.17 : 0.14)),
          transform: `rotate(-38 ${shineX} ${shineY})`,
          dot: detail !== 'min' ? { cx: f(C - R * 0.62), cy: f(C - R * 0.27), r: f(R * 0.055) } : null,
        }
      : null,
  };
}
