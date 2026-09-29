/**
 * Geometría de las insignias (docs/insignias.md §4.2, §4.6 a §4.8): convierte una insignia en una lista de figuras
 * con todo ya calculado, sin React ni DOM (como src/components/share/scene.ts). La pintan Insignia.tsx (SVG en la
 * app), svg.ts (SVG de texto para las pruebas y PNG con resvg) y, al compartir, el canvas con `Path2D`.
 * Caja de 128 × 128. Capas de atrás hacia adelante: borde, marco con el metal, brillo, bisel, campo, emblema, cinta y
 * adornos. Cada tamaño tiene su nivel de detalle (SIZE_DETAIL): no es solo escalar.
 */
import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_STROKE } from '../../components/splash/brand';
import { estimateWidth } from '../../components/share/scene';
import { FALLBACK_ICON, isBadgeIconKey, type UiIconKey } from './icons';
import { FACET, LEAGUE_TAB, SHINE_ID, TOKENS, resolvePalette, rimToken, type ResolvedPalette, type ThemeColor } from './palette';
import type { BadgeLook, BadgeShape, BadgeSize, BadgeState } from './types';

// ---------- Figuras ----------

/** Relleno o trazo: un color fijo, uno del tema o un degradado (por id). */
export type Paint = string | ThemeColor | { grad: string };

interface NodeBase {
  opacity?: number;
  /** Recorte con la forma de la insignia (`mm-clip-<forma>` de BadgeDefs). */
  clip?: BadgeShape;
  /** Clase de la animación de desbloqueo (bd-a-all, bd-a-on…). */
  cls?: string;
}

export interface PathNode extends NodeBase {
  t: 'path';
  d: string;
  /** Sin relleno si falta. */
  fill?: Paint;
  fillOpacity?: number;
  stroke?: Paint;
  width?: number;
  cap?: 'round';
  join?: 'round';
  /** Escala alrededor de un punto: [k, cx, cy] (el campo es el marco reducido a 0.78). */
  scaleAbout?: readonly [number, number, number];
  /** Solo en un tema (bordes de los colores de liga: uno para claro y otro para oscuro). */
  theme?: 'light' | 'dark';
}

export interface CircleNode extends NodeBase {
  t: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill?: Paint;
  stroke?: Paint;
  width?: number;
  /** Hacia dónde sale una partícula de la animación (--dx, --dy). */
  drift?: readonly [number, number];
}

export interface EllipseNode extends NodeBase {
  t: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: Paint;
  /** Giro en grados alrededor de su centro. */
  rotate?: number;
}

export interface RectNode extends NodeBase {
  t: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill: Paint;
  stroke?: Paint;
  width?: number;
  /** Giro: [grados, cx, cy]. */
  rotate?: readonly [number, number, number];
}

/** Texto blanco en mayúsculas, peso 800, centrado en (x, y). */
export interface TextNode extends NodeBase {
  t: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  /** Espacio entre letras. */
  spacing: number;
  fill: string;
  /** Si no cabe, se aprieta a este ancho (textLength en SVG, escala en el canvas). */
  fit?: number;
}

/** Un ícono de la grilla de 24 en (x, y), escalado por `k`, con trazo `width` (en unidades del ícono). */
export interface IconDrawNode extends NodeBase {
  t: 'icon';
  key: string;
  x: number;
  y: number;
  k: number;
  color: Paint;
  width: number;
}

export interface GroupNode extends NodeBase {
  t: 'group';
  children: BadgeNode[];
  /** translate(x y) scale(k). */
  move?: readonly [number, number, number];
  /** Partículas de la animación: hacia dónde salen. */
  drift?: readonly [number, number];
}

export type BadgeNode = PathNode | CircleNode | EllipseNode | RectNode | TextNode | IconDrawNode | GroupNode;

/** Degradado lineal en unidades de la figura (0 a 1). */
export interface GradientDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: readonly (readonly [offset: number, color: string, opacity?: number])[];
}

export interface BadgeScene {
  /** x, y, ancho y alto del viewBox. */
  viewBox: readonly [number, number, number, number];
  nodes: BadgeNode[];
  /** Degradados propios (solo los colores de liga; los de nivel están en BadgeDefs). */
  gradients: GradientDef[];
  palette: ResolvedPalette;
}

// ---------- Formas ----------

type Box = readonly [cx: number, cy: number, size: number];

export interface ShapeGeom {
  /** Nombre en español. */
  name: string;
  /** Contorno del marco (y del recorte). */
  outer: string;
  /** El campo es el contorno reducido a `k` alrededor de (64, cy)… */
  k?: number;
  /** …o un camino propio (estrella y medallas, con campo redondo). */
  field?: string;
  /** Segundo bisel del platino cuando no hay `k`. */
  bevel2?: string;
  /** Centro vertical del campo. */
  cy: number;
  /** Cintas al cuello (medallas). */
  straps?: boolean;
  /** Ramas de laurel (anual). */
  laurel?: boolean;
  /** Caja del emblema: sin nada, con cinta, con puntos, con cinta y puntos. */
  emb: { plain: Box; rib: Box; pips: Box; ribPips: Box | null };
  /** Altura de los puntos de nivel sin cinta y con cinta (null: con cinta no caben). */
  pipY: number;
  pipTopY: number | null;
  /** Tachas del oro (y posición de los destellos del diamante). */
  studs: readonly (readonly [number, number])[];
  /** Centro de la marquita Dúo. */
  duo: readonly [number, number];
  /** Elipse del brillo: cx, cy, rx, ry. */
  shine: readonly [number, number, number, number];
  /** Altura de la banda de texto de arriba. */
  top: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const rad = (a: number) => (a * Math.PI) / 180;

/** Polígono con esquinas redondeadas de radio `r` (arcos tangentes a cada lado). */
export function roundedPolygon(pts: readonly (readonly [number, number])[], r: number): string {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p = pts[i];
    const p1 = pts[(i + 1) % n];
    const v0 = [p0[0] - p[0], p0[1] - p[1]];
    const v1 = [p1[0] - p[0], p1[1] - p[1]];
    const l0 = Math.hypot(v0[0], v0[1]);
    const l1 = Math.hypot(v1[0], v1[1]);
    const u0 = [v0[0] / l0, v0[1] / l0];
    const u1 = [v1[0] / l1, v1[1] / l1];
    const ang = Math.acos(Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1])));
    const t = r / Math.tan(ang / 2);
    const a = [p[0] + u0[0] * t, p[1] + u0[1] * t];
    const b = [p[0] + u1[0] * t, p[1] + u1[1] * t];
    const cross = (p[0] - p0[0]) * (p1[1] - p[1]) - (p[1] - p0[1]) * (p1[0] - p[0]);
    d += `${i ? 'L' : 'M'}${r2(a[0])} ${r2(a[1])}A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${r2(b[0])} ${r2(b[1])}`;
  }
  return `${d}Z`;
}

/** Círculo como camino (dos arcos). */
export const circlePath = (cx: number, cy: number, r: number) => `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0Z`;

const HEX = roundedPolygon(
  [-90, -30, 30, 90, 150, 210].map((a) => [64 + 60 * Math.cos(rad(a)), 64 + 60 * Math.sin(rad(a))] as const),
  6,
);
// Sol de 12 puntas: exterior 62, interior 54.
const STAR = roundedPolygon(
  Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 ? 54 : 62;
    const a = rad(-90 + i * 15);
    return [64 + r * Math.cos(a), 64 + r * Math.sin(a)] as const;
  }),
  1.2,
);
const SHIELD = 'M64 4L116 18V58C116 94 92 114 64 124C36 114 12 94 12 58V18Z';
// Rect 8,8 a 120,120 con rx 26: la proporción del ícono de la app (DUO_RX 112/512).
const SQUARE = 'M34 8H94A26 26 0 0 1 120 34V94A26 26 0 0 1 94 120H34A26 26 0 0 1 8 94V34A26 26 0 0 1 34 8Z';

export const SHAPES: Readonly<Record<BadgeShape, ShapeGeom>> = {
  hex: {
    name: 'Hexágono',
    outer: HEX,
    k: 0.78,
    cy: 64,
    emb: { plain: [64, 64, 52], rib: [64, 58, 44], pips: [64, 55, 44], ribPips: null },
    pipY: 93,
    pipTopY: null,
    studs: [[64, 11], [18.1, 37.5], [109.9, 37.5]],
    duo: [64, 117.4],
    shine: [64, 34, 56, 34],
    top: 22,
  },
  shield: {
    name: 'Escudo',
    outer: SHIELD,
    k: 0.78,
    cy: 64,
    emb: { plain: [64, 60, 50], rib: [64, 56, 44], pips: [64, 54, 44], ribPips: [64, 60, 38] },
    pipY: 90,
    pipTopY: 30,
    studs: [[64, 11], [28, 20.3], [100, 20.3]],
    duo: [64, 116.5],
    shine: [64, 30, 58, 32],
    top: 22,
  },
  circle: {
    name: 'Círculo',
    outer: circlePath(64, 64, 60),
    k: 0.78,
    cy: 64,
    emb: { plain: [64, 64, 52], rib: [64, 58, 44], pips: [64, 57, 44], ribPips: [64, 61, 36] },
    pipY: 96,
    pipTopY: 28,
    studs: [[64, 10.6], [17.8, 37.3], [110.2, 37.3]],
    duo: [64, 117.4],
    shine: [64, 32, 56, 34],
    top: 23,
  },
  star: {
    name: 'Estrella',
    outer: STAR,
    field: circlePath(64, 64, 44),
    bevel2: circlePath(64, 64, 48.5),
    cy: 64,
    emb: { plain: [64, 64, 50], rib: [64, 57, 40], pips: [64, 57, 42], ribPips: null },
    pipY: 95,
    pipTopY: null,
    studs: [[64, 13], [20.7, 39], [107.3, 39]],
    duo: [64, 116],
    shine: [64, 32, 58, 34],
    top: 24,
  },
  medal: {
    name: 'Medalla',
    outer: circlePath(64, 74, 46),
    field: circlePath(64, 74, 35.9),
    bevel2: circlePath(64, 74, 40.5),
    cy: 74,
    straps: true,
    emb: { plain: [64, 74, 42], rib: [64, 65, 34], pips: [64, 68, 34], ribPips: null },
    pipY: 97,
    pipTopY: null,
    studs: [[64, 33], [35, 45], [93, 45]],
    duo: [64, 115],
    shine: [64, 52, 42, 26],
    top: 35,
  },
  medal_laurel: {
    name: 'Medalla con laurel',
    outer: circlePath(64, 70, 42),
    field: circlePath(64, 70, 32.8),
    bevel2: circlePath(64, 70, 37),
    cy: 70,
    straps: true,
    laurel: true,
    emb: { plain: [64, 70, 40], rib: [64, 61, 32], pips: [64, 63, 30], ribPips: null },
    pipY: 92,
    pipTopY: null,
    studs: [[37.6, 43.6], [90.4, 43.6], [64, 107.4]],
    duo: [64, 32.6],
    shine: [64, 50, 38, 24],
    top: 31,
  },
  square: {
    name: 'Cuadrado',
    outer: SQUARE,
    k: 0.78,
    cy: 64,
    emb: { plain: [64, 64, 52], rib: [64, 58, 44], pips: [64, 57, 44], ribPips: [64, 61, 36] },
    pipY: 96,
    pipTopY: 30,
    studs: [[64, 14], [21, 21], [107, 21]],
    duo: [64, 114],
    shine: [64, 32, 58, 34],
    top: 23,
  },
};

export const SHAPE_ORDER: readonly BadgeShape[] = ['hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square'];

/** Cintas al cuello de las medallas: color de cinta del nivel con una raya del color del deporte. */
export const STRAPS = { left: 'M30 2H52L72 36H50Z', right: 'M98 2H76L56 36H78Z', stripe: 'M41 2L61 36M87 2L67 36' } as const;

/** Banderín de cola de golondrina por tamaño: camino, línea del texto, letra, ancho máximo y espacio entre letras. */
export const RIBBONS = {
  long: { d: 'M4 88H124L117 98L124 108H4L11 98Z', y: 98.5, size: 12.5, max: 96, spacing: 0.7 },
  short: { d: 'M2 84H126L118 97L126 110H2L10 97Z', y: 97.8, size: 17, max: 100, spacing: 0.3 },
  strip: { d: 'M6 90H122L115 98L122 106H6L13 98Z' },
} as const;

/** Ancho del texto de la cinta (Inter 800, con el espacio entre letras). En el teléfono lo mide el canvas. */
export const ribbonTextWidth = (text: string, size: number, spacing: number) => estimateWidth(text, size, 800) + spacing * [...text].length;

// ---------- Tamaños ----------

export interface SizeDetail {
  /** Bisel entre metal y campo (y el doble del platino). */
  bevel: boolean;
  /** Brillo blanco sobre la mitad de arriba. */
  shine: boolean;
  /** Cinta: nada, franja sin texto, forma corta o forma larga. */
  ribbon: 'none' | 'strip' | 'short' | 'long';
  /** Puntos de nivel. */
  pips: boolean;
  /** Tachas del oro y facetas del diamante. */
  metalMarks: boolean;
  /** Laurel de la anual y muescas de las rachas. */
  frameMarks: boolean;
  /** Candadito, reloj u ojo tachado de los estados. */
  statusIcon: boolean;
  /** Banda de arriba, marquita Dúo o pestaña «LIGA», destellos del diamante. */
  ornaments: boolean;
}

/** Qué se pinta en cada tamaño (§4.6). */
export const SIZE_DETAIL: Readonly<Record<BadgeSize, SizeDetail>> = {
  24: { bevel: false, shine: false, ribbon: 'none', pips: false, metalMarks: false, frameMarks: false, statusIcon: false, ornaments: false },
  40: { bevel: true, shine: true, ribbon: 'strip', pips: false, metalMarks: false, frameMarks: true, statusIcon: true, ornaments: false },
  64: { bevel: true, shine: true, ribbon: 'short', pips: true, metalMarks: true, frameMarks: true, statusIcon: true, ornaments: false },
  128: { bevel: true, shine: true, ribbon: 'long', pips: true, metalMarks: true, frameMarks: true, statusIcon: true, ornaments: true },
};

export const BADGE_SIZES: readonly BadgeSize[] = [24, 40, 64, 128];

/** viewBox normal, con aire para los anillos de progreso y «Nueva», y el de la animación (partículas). */
export const VIEWBOX = {
  plain: [0, 0, 128, 128],
  pad: [-10, -10, 148, 148],
  anim: [-36, -36, 200, 200],
} as const satisfies Record<string, readonly [number, number, number, number]>;

// ---------- Piezas ----------

/** Estrellita de cuatro puntas (destellos del diamante). */
export function sparklePath(x: number, y: number, r: number): string {
  const q = r * 0.18;
  return (
    `M${x} ${y - r}C${x + q} ${y - q} ${x + q} ${y - q} ${x + r} ${y}C${x + q} ${y + q} ${x + q} ${y + q} ${x} ${y + r}` +
    `C${x - q} ${y + q} ${x - q} ${y + q} ${x - r} ${y}C${x - q} ${y - q} ${x - q} ${y - q} ${x} ${y - r}Z`
  );
}

/** Tres facetas del diamante (triángulos desde el centro, recortados con la forma). */
export function facetsPath(cy: number): string {
  const f = (a0: number, a1: number) =>
    `M64 ${cy}L${r2(64 + 95 * Math.cos(rad(a0)))} ${r2(cy + 95 * Math.sin(rad(a0)))}L${r2(64 + 95 * Math.cos(rad(a1)))} ${r2(cy + 95 * Math.sin(rad(a1)))}Z`;
  return f(-165, -128) + f(-78, -56) + f(-20, 8);
}

/** Muescas del círculo: una por mes o partido de la racha (hasta 12), desde arriba a la derecha. */
export function notchesPath(count: number): string {
  let d = '';
  for (let i = 0; i < Math.min(12, count); i++) {
    const a = rad(-75 + 30 * i);
    d += `M${r2(64 + 51.5 * Math.cos(a))} ${r2(64 + 51.5 * Math.sin(a))}L${r2(64 + 57 * Math.cos(a))} ${r2(64 + 57 * Math.sin(a))}`;
  }
  return d;
}

/** Dos ramas de laurel (5 hojas cada una) en la mitad de abajo, del `lo` del nivel. */
export function laurelNodes(color: string, cy: number): BadgeNode[] {
  const R = 51;
  const leaves: BadgeNode[] = [];
  for (const side of [-1, 1]) {
    for (const aL of [214, 191, 168, 128, 106]) {
      const a = side < 0 ? aL : 180 - aL;
      const x = r2(64 + R * Math.cos(rad(a)));
      const y = r2(cy + R * Math.sin(rad(a)));
      leaves.push({ t: 'ellipse', cx: x, cy: y, rx: 8, ry: 3.6, fill: color, rotate: r2(side < 0 ? a + 60 : a - 60) });
    }
  }
  const p = (a: number) => `${r2(64 + (R - 1) * Math.cos(rad(a)))} ${r2(cy + (R - 1) * Math.sin(rad(a)))}`;
  const stems = `M${p(218)}A${R - 1} ${R - 1} 0 0 0 ${p(100)}M${p(-38)}A${R - 1} ${R - 1} 0 0 1 ${p(80)}`;
  return [...leaves, { t: 'path', d: stems, stroke: color, width: 2, cap: 'round' }];
}

/** Arco de progreso desde las 12 en el sentido del reloj, de radio `r` alrededor de (64, 64). */
export function progressArc(p: number, r = 68): string {
  const f = Math.min(1, Math.max(0, p));
  if (f >= 0.9999) return `M64 ${64 - r}A${r} ${r} 0 1 1 64 ${64 + r}A${r} ${r} 0 1 1 64 ${64 - r}`;
  const a = f * 2 * Math.PI;
  return `M64 ${64 - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${r2(64 + r * Math.sin(a))} ${r2(64 - r * Math.cos(a))}`;
}

// ---------- El modelo ----------

export interface BadgeModelOptions {
  size: BadgeSize;
  /** Por defecto `unlocked`. */
  state?: BadgeState;
  /** 0 a 1, para `progress`. */
  progress?: number;
  /** Píxeles reales en que se pinta (por defecto `size`): los trazos mínimos (1.5 px) se calculan con esto. */
  px?: number;
  /** Aire alrededor (viewBox de 148) para que los anillos de `progress` y `new` quepan dentro. */
  pad?: boolean;
  /** Escena de la animación de desbloqueo (§4.8): capas bloqueada y desbloqueada, brillo y partículas. */
  animate?: boolean;
  /** Id del degradado propio de un color de liga. */
  gradientId?: string;
}

/**
 * 10 partículas en los colores del nivel (diamante: 14 y 2 destellos) que salen del borde. Semilla fija: la
 * animación se ve igual cada vez.
 */
function particles(P: ResolvedPalette, cy: number): BadgeNode[] {
  const diamond = P.tier === 'diamante';
  const n = diamond ? 14 : 10;
  const cols = [P.hi, P.mid, P.lo, P.field, '#ffffff'];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const out: BadgeNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const dist = 30 + rnd() * 22;
    const x = 64 + Math.cos(a) * 40;
    const y = cy + Math.sin(a) * 40;
    out.push({
      t: 'circle',
      cx: r2(x),
      cy: r2(y),
      r: r2(2.4 + rnd() * 1.8),
      fill: cols[i % cols.length],
      stroke: P.lo,
      width: 0.6,
      cls: 'bd-a-part',
      drift: [r2(Math.cos(a) * dist), r2(Math.sin(a) * dist)],
    });
  }
  if (diamond) {
    out.push(
      { t: 'group', cls: 'bd-a-part', drift: [-18, -26], children: [{ t: 'path', d: sparklePath(40, 30, 8), fill: P.mid }] },
      { t: 'group', cls: 'bd-a-part', drift: [22, -20], children: [{ t: 'path', d: sparklePath(92, 36, 6.5), fill: P.lo }] },
    );
  }
  return out;
}

/** Convierte una insignia en figuras para un tamaño y un estado. */
export function badgeModel(look: BadgeLook, opts: BadgeModelOptions): BadgeScene {
  const size = opts.size;
  const detail = SIZE_DETAIL[size] ?? SIZE_DETAIL[64];
  const viewBox = opts.animate ? VIEWBOX.anim : opts.pad ? VIEWBOX.pad : VIEWBOX.plain;
  const px = opts.px && opts.px > 0 ? opts.px : size;
  // Unidades del viewBox por píxel real: con ellas los trazos nunca bajan de 1.5 px.
  const u = viewBox[2] / px;
  const shape: BadgeShape = Object.hasOwn(SHAPES, look.shape) ? look.shape : 'hex';
  const S = SHAPES[shape];
  const P = resolvePalette(look, opts.gradientId);
  const state = opts.state ?? 'unlocked';
  const rimW = r2(Math.max(2, 1.5 * u));
  const lockW = r2(Math.max(1.5 * u, 1.2));

  const per = look.period && (look.period.long || look.period.short) ? look.period : null;
  const hasRib = detail.ribbon !== 'none' && !!per;
  let ribText = '';
  if (per && detail.ribbon === 'long') ribText = per.long;
  // A 64 px la corta; si no hay corta (texto libre de más de 7), la larga si cabe; si no, cinta sin texto.
  else if (per && detail.ribbon === 'short') ribText = per.short && per.short.length <= 7 ? per.short : per.long.length <= 7 ? per.long : '';
  ribText = ribText.toUpperCase();
  const pipsN = detail.pips && !P.unico ? Math.min(5, Math.max(0, look.pips ?? 0)) : 0;
  const pipsOn = pipsN > 0 && (!hasRib || S.pipTopY != null);
  let box: Box = hasRib ? (pipsOn ? (S.emb.ribPips ?? S.emb.rib) : S.emb.rib) : pipsOn ? S.emb.pips : S.emb.plain;
  // A 24 px el emblema crece (sin cinta ni puntos hay lugar) para que se lea.
  if (size === 24) box = [S.emb.plain[0], S.emb.plain[1], Math.min(S.emb.plain[2] * 1.22, shape === 'medal_laurel' ? 50 : 62)];
  const sw = Math.max(2, 36 / (box[2] / u));
  const emblem = isBadgeIconKey(look.icon) ? look.icon : FALLBACK_ICON;

  const icon = (key: string, b: Box, color: Paint, width: number): IconDrawNode => ({
    t: 'icon',
    key,
    x: r2(b[0] - b[2] / 2),
    y: r2(b[1] - b[2] / 2),
    k: Math.round((b[2] / 24) * 10000) / 10000,
    color,
    width: r2(width),
  });

  // Borde: la variable del nivel; en un color de liga, uno para claro y otro para oscuro (--bd-l y --bd-d).
  const rim = (d: string, w: number): PathNode[] =>
    P.tier
      ? [{ t: 'path', d, stroke: rimToken(P.tier), width: w, join: 'round' }]
      : [
          { t: 'path', d, stroke: P.rimL, width: w, join: 'round', theme: 'light' },
          { t: 'path', d, stroke: P.rimD, width: w, join: 'round', theme: 'dark' },
        ];

  const mini = (key: UiIconKey): BadgeNode[] => {
    if (!detail.statusIcon) return [];
    const r = size >= 128 ? 13 : 17;
    const s = r * 1.15;
    return [
      { t: 'circle', cx: 104, cy: 104, r, fill: TOKENS.surface, stroke: TOKENS.lockLine, width: lockW },
      icon(key, [104, 104, s], TOKENS.muted, Math.max(2.2, 36 / (s / u))),
    ];
  };

  const locked = (): BadgeNode[] => {
    const out: BadgeNode[] = [];
    if (S.straps) {
      for (const d of [STRAPS.left, STRAPS.right]) out.push({ t: 'path', d, fill: TOKENS.lockFill, stroke: TOKENS.lockLine, width: lockW, join: 'round' });
    }
    out.push({ t: 'path', d: S.outer, fill: TOKENS.lockFill, stroke: TOKENS.lockLine, width: lockW, join: 'round' });
    out.push(icon(emblem, box, TOKENS.muted, sw));
    out.push(...mini('lock'));
    return out;
  };

  const unlocked = (): BadgeNode[] => {
    const out: BadgeNode[] = [];
    const cy = S.cy;
    if (S.straps) {
      out.push({ t: 'path', d: STRAPS.left, fill: P.ribbon }, { t: 'path', d: STRAPS.right, fill: P.ribbon });
      out.push({ t: 'path', d: STRAPS.stripe, stroke: P.field, width: 5.5 });
      out.push(...rim(STRAPS.left, rimW), ...rim(STRAPS.right, rimW));
    }
    if (S.laurel && detail.frameMarks) out.push(...laurelNodes(P.lo, cy));
    out.push({ t: 'path', d: S.outer, fill: { grad: P.gradient } });
    if (detail.shine) {
      const [ex, ey, rx, ry] = S.shine;
      out.push({ t: 'ellipse', cx: ex, cy: ey, rx, ry, fill: { grad: SHINE_ID }, clip: shape });
    }
    if (detail.metalMarks && P.tier === 'diamante') out.push({ t: 'path', d: facetsPath(cy), fill: FACET, fillOpacity: 0.35, clip: shape });
    if (shape === 'circle' && look.notches && detail.frameMarks) {
      out.push({ t: 'path', d: notchesPath(look.notches), stroke: P.lo, width: r2(Math.max(3, 1.5 * u)), cap: 'round' });
    }
    if (detail.metalMarks && P.tier === 'oro' && !P.unico) {
      for (const [x, y] of S.studs) {
        out.push({ t: 'circle', cx: x, cy: y, r: size >= 128 ? 2.7 : 3.4, fill: P.hi, stroke: P.lo, width: size >= 128 ? 1 : 1.4 });
      }
    }
    out.push(...rim(S.outer, rimW));
    const fk = S.k;
    // Platino: bisel doble.
    if (detail.bevel && P.tier === 'platino') {
      if (fk) out.push({ t: 'path', d: S.outer, scaleAbout: [fk + 0.08, 64, cy], stroke: P.hi, width: r2(Math.max(1.4, 1.2 * u) / (fk + 0.08)) });
      else if (S.bevel2) out.push({ t: 'path', d: S.bevel2, stroke: P.hi, width: r2(Math.max(1.4, 1.2 * u)) });
    }
    const bevel = detail.bevel ? P.hi : undefined;
    if (fk) out.push({ t: 'path', d: S.outer, scaleAbout: [fk, 64, cy], fill: P.field, stroke: bevel, width: r2(Math.max(2, 1.5 * u) / fk) });
    else out.push({ t: 'path', d: S.field ?? S.outer, fill: P.field, stroke: bevel, width: r2(Math.max(2, 1.5 * u)) });
    out.push(icon(emblem, box, '#ffffff', sw));
    if (pipsOn) {
      const r = size >= 128 ? 3.4 : 4.5;
      const sp = size >= 128 ? 10 : 11.5;
      const y = hasRib ? (S.pipTopY ?? S.pipY) : S.pipY;
      const x0 = 64 - ((pipsN - 1) * sp) / 2;
      for (let i = 0; i < pipsN; i++) out.push({ t: 'circle', cx: r2(x0 + i * sp), cy: y, r, fill: '#ffffff' });
    }
    if (hasRib && detail.ribbon !== 'none') {
      const R = RIBBONS[detail.ribbon];
      const kids: BadgeNode[] = [{ t: 'path', d: R.d, fill: P.ribbon }, ...rim(R.d, r2(rimW * 0.75))];
      if (ribText && 'size' in R) {
        const w = ribbonTextWidth(ribText, R.size, R.spacing);
        kids.push({ t: 'text', x: 64, y: R.y, text: ribText, size: R.size, spacing: R.spacing, fill: '#ffffff', fit: w > R.max ? R.max : undefined });
      }
      out.push({ t: 'group', cls: 'bd-a-ribbon', children: kids });
    }
    if (detail.ornaments) {
      const top = (look.top ?? '').trim().toUpperCase();
      if (top) {
        const tw = ribbonTextWidth(top, 8.4, 0.4);
        const w = Math.min(70, tw + 12);
        out.push(
          { t: 'rect', x: r2(64 - w / 2), y: S.top, w: r2(w), h: 13, rx: 3, fill: P.ribbon },
          { t: 'text', x: 64, y: S.top + 6.8, text: top, size: 8.4, spacing: 0.4, fill: '#ffffff', fit: tw > 58 ? 58 : undefined },
        );
      }
      if (look.origin === 'liga') {
        out.push(
          { t: 'rect', x: 45, y: 0.5, w: 38, h: 14, rx: 4, fill: LEAGUE_TAB, stroke: '#ffffff', width: 1.2 },
          { t: 'text', x: 64, y: 7.9, text: 'LIGA', size: 8.4, spacing: 0.8, fill: '#ffffff' },
        );
      } else {
        // La marquita Dúo de MatchMate (el logo sin su cuadro), del color de la cinta.
        const sc = 0.0294;
        const [dx, dy] = S.duo;
        out.push({
          t: 'group',
          move: [r2(dx - 256 * sc), r2(dy - 255 * sc), sc],
          children: [
            { t: 'path', d: DUO_M, stroke: P.ribbon, width: DUO_STROKE, cap: 'round', join: 'round' },
            ...DUO_HEADS.map(([cx, cy]): BadgeNode => ({ t: 'circle', cx, cy, r: DUO_HEAD_R, fill: P.ribbon })),
          ],
        });
      }
      if (P.tier === 'diamante') {
        out.push(
          { t: 'path', d: sparklePath(S.studs[1][0], S.studs[1][1], 6.5), fill: '#ffffff' },
          { t: 'path', d: sparklePath(S.studs[2][0], S.studs[2][1], 5), fill: '#ffffff' },
        );
      }
    }
    return out;
  };

  const gradients: GradientDef[] = P.custom
    ? [{ id: P.gradient, x1: 0, y1: 0, x2: 1, y2: 1, stops: [[0, P.hi], [0.45, P.mid], [1, P.lo]] }]
    : [];

  if (opts.animate) {
    // Capa bloqueada y desbloqueada una encima de otra (fundido cruzado), la banda de brillo recortada con la forma
    // y las partículas. El último fotograma es la insignia en reposo.
    const nodes: BadgeNode[] = [
      {
        t: 'group',
        cls: 'bd-a-all',
        children: [
          { t: 'group', cls: 'bd-a-lock', children: locked() },
          { t: 'group', cls: 'bd-a-on', children: unlocked() },
        ],
      },
      { t: 'group', clip: shape, children: [{ t: 'group', cls: 'bd-a-band', children: [{ t: 'rect', x: 44, y: -40, w: 22, h: 210, fill: '#ffffff', rotate: [30, 55, 64] }] }] },
      { t: 'group', children: particles(P, S.cy) },
    ];
    return { viewBox, nodes, gradients, palette: P };
  }

  let body: BadgeNode[] = state === 'locked' || state === 'progress' ? locked() : unlocked();
  if (state === 'review') body = [{ t: 'group', opacity: 0.6, children: body }, ...mini('hourglass')];
  if (state === 'hidden') body = [{ t: 'group', opacity: 0.45, children: body }, ...mini('eye-off')];
  const ring: BadgeNode[] = [];
  // Los anillos van en r 68; hasta 12 de grueso caben en el aire de `pad` (148).
  if (state === 'progress') {
    const w = r2(Math.min(12, 3 * u));
    ring.push({ t: 'circle', cx: 64, cy: 64, r: 68, stroke: TOKENS.line, width: w });
    if ((opts.progress ?? 0) > 0) ring.push({ t: 'path', d: progressArc(opts.progress ?? 0), stroke: TOKENS.accent, width: w, cap: 'round' });
  }
  if (state === 'new') {
    ring.push({ t: 'circle', cx: 64, cy: 64, r: 68, stroke: TOKENS.glow, width: r2(Math.min(12, 4 * u)) });
    body.push({ t: 'circle', cx: 118, cy: 12, r: r2(Math.min(12, 5 * u)), fill: TOKENS.accent, stroke: TOKENS.surface, width: r2(Math.min(4, 1.5 * u)) });
  }
  return { viewBox, nodes: [...ring, ...body], gradients, palette: P };
}
