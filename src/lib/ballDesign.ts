/**
 * El diseño de una bola del boliche («Diseñar» en Mis bolas): cómo se ve dibujada (<BallArt>,
 * src/components/balls/BallArt.tsx). Sin React ni base (se prueba solo, ballDesign.test.ts).
 *
 * Es un JSON con versión que la base guarda tal cual en public.bowling_balls.design (set_ball_design,
 * 20260930000300_diseno_bolas.sql) y revisa con private.ball_design_ok: ballDesignProblem revisa lo mismo, clave por
 * clave (las dos a la vez, o ninguna). Nada es libre: colores '#rrggbb', un dibujo y unas figuras de la lista y
 * números con su rango, así algo lo puede llenar solo más adelante (p. ej. «Crear desde una foto») sin inventar nada.
 *
 * {v: 1, base, second, third, pattern, scale, softness, angle, shine, holes, stickers: [{shape, text?, color, x, y,
 * size, rotation}]}: second y third null = los saca de `base` (ballDesignColors). Una bola sin diseño se dibuja con
 * defaultBallDesign (su color y su cubierta).
 */
import type { BallCover } from './balls';

// ---------- Tipos ----------

export const BALL_DESIGN_VERSION = 1;

/** El dibujo de la bola (encima del color base). */
export type BallPattern = 'solida' | 'perlada' | 'jaspeada' | 'veteada' | 'bicolor' | 'destellos' | 'galaxia' | 'camuflaje';

/** Las figuras que se le pegan. 'numero' e 'iniciales' llevan `text`. */
export type BallStickerShape = 'estrella' | 'llama' | 'rayo' | 'corazon' | 'calavera' | 'numero' | 'iniciales' | 'logo';

export interface BallSticker {
  shape: BallStickerShape;
  /** Solo en 'numero' (1 a 3 cifras) e 'iniciales' (1 a 3 letras en mayúscula); en las demás no va. */
  text?: string;
  /** '#rrggbb' en minúsculas. */
  color: string;
  /** Dónde va el centro, en radios de la bola desde el centro: de -1 (izquierda) a 1 (derecha). */
  x: number;
  /** De -1 (arriba) a 1 (abajo). */
  y: number;
  /** Qué tan grande: de 0.1 a 0.6 del ancho de la bola. */
  size: number;
  /** Grados, de 0 a 360. */
  rotation: number;
}

export interface BallDesign {
  v: typeof BALL_DESIGN_VERSION;
  /** El color de la bola ('#rrggbb' en minúsculas): también es el `color` de la bola (set_ball_design lo copia). */
  base: string;
  /** El segundo y el tercer color del dibujo; null = uno que sale de `base`. */
  second: string | null;
  third: string | null;
  pattern: BallPattern;
  /** Tamaño del dibujo: 0.5 (fino, más repetido) a 2 (grande). */
  scale: number;
  /** Bordes del dibujo: 0 (marcados) a 1 (difuminados). */
  softness: number;
  /** Hacia dónde va el dibujo, en grados (0 a 360). */
  angle: number;
  /** Brillo (bola pulida) o mate. */
  shine: boolean;
  /** Con los tres huecos (dos dedos y el pulgar). */
  holes: boolean;
  /** Hasta BALL_STICKERS_MAX, del fondo hacia arriba. */
  stickers: BallSticker[];
}

// ---------- Límites (los mismos de private.ball_design_ok) ----------

export const BALL_STICKERS_MAX = 5;
export const BALL_STICKER_TEXT_MAX = 3;
/** La base no guarda un diseño de 4 kB o más (su texto en jsonb). */
export const BALL_DESIGN_MAX_BYTES = 4096;

/** [mínimo, máximo] de cada número (los dos incluidos). */
export const BALL_DESIGN_RANGES = {
  scale: [0.5, 2],
  softness: [0, 1],
  angle: [0, 360],
  x: [-1, 1],
  y: [-1, 1],
  size: [0.1, 0.6],
  rotation: [0, 360],
} as const satisfies Record<string, readonly [number, number]>;

type RangeKey = keyof typeof BALL_DESIGN_RANGES;

const HEX = /^#[0-9a-f]{6}$/;
const NUMBER_TEXT = /^[0-9]{1,3}$/;
/** Las mismas letras que la base ('^[A-ZÑÁÉÍÓÚÜ]{1,3}$'). */
const INITIALS_TEXT = /^[A-ZÑÁÉÍÓÚÜ]{1,3}$/u;

const DESIGN_KEYS = ['v', 'base', 'second', 'third', 'pattern', 'scale', 'softness', 'angle', 'shine', 'holes', 'stickers'] as const;
const STICKER_KEYS = ['shape', 'color', 'x', 'y', 'size', 'rotation'] as const;

export interface BallPatternInfo {
  key: BallPattern;
  label: string;
  /** Cuántos colores usa (1: solo la base; 3: base, segundo y tercero). */
  colors: 1 | 3;
  /** Si tamaño, suavidad y ángulo le cambian algo. */
  sliders: boolean;
}

export const BALL_PATTERNS: readonly BallPatternInfo[] = [
  { key: 'solida', label: 'Sólida', colors: 1, sliders: false },
  { key: 'perlada', label: 'Perlada', colors: 3, sliders: true },
  { key: 'jaspeada', label: 'Jaspeada', colors: 3, sliders: true },
  { key: 'veteada', label: 'Veteada', colors: 3, sliders: true },
  { key: 'bicolor', label: 'Dos colores', colors: 3, sliders: true },
  { key: 'destellos', label: 'Destellos', colors: 3, sliders: true },
  { key: 'galaxia', label: 'Galaxia', colors: 3, sliders: true },
  { key: 'camuflaje', label: 'Camuflaje', colors: 3, sliders: true },
];

export interface BallStickerInfo {
  key: BallStickerShape;
  label: string;
  /** Lleva texto: 'digits' (1 a 3 cifras) o 'letters' (1 a 3 letras). */
  text: 'digits' | 'letters' | null;
}

export const BALL_STICKER_SHAPES: readonly BallStickerInfo[] = [
  { key: 'estrella', label: 'Estrella', text: null },
  { key: 'llama', label: 'Llama', text: null },
  { key: 'rayo', label: 'Rayo', text: null },
  { key: 'corazon', label: 'Corazón', text: null },
  { key: 'calavera', label: 'Calavera', text: null },
  { key: 'numero', label: 'Número', text: 'digits' },
  { key: 'iniciales', label: 'Iniciales', text: 'letters' },
  { key: 'logo', label: 'Logo', text: null },
];

const PATTERN_KEYS = new Set<string>(BALL_PATTERNS.map((p) => p.key));
const SHAPE_KEYS = new Set<string>(BALL_STICKER_SHAPES.map((s) => s.key));

export const patternInfo = (p: BallPattern): BallPatternInfo => BALL_PATTERNS.find((x) => x.key === p) ?? BALL_PATTERNS[0];
export const patternLabel = (p: BallPattern) => patternInfo(p).label;
export const stickerInfo = (s: BallStickerShape): BallStickerInfo => BALL_STICKER_SHAPES.find((x) => x.key === s) ?? BALL_STICKER_SHAPES[0];
export const stickerLabel = (s: BallStickerShape) => stickerInfo(s).label;
/** ¿Esa figura lleva texto (número o iniciales)? */
export const stickerHasText = (s: BallStickerShape) => stickerInfo(s).text != null;

// ---------- Colores ----------

type Rgb = [number, number, number];

/** '#rrggbb' en minúsculas (lo único que guarda la base). */
export const isBallColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla dos colores: t = 0 es `a`, t = 1 es `b`. */
export function mixColors(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Luminancia relativa (WCAG), de 0 (negro) a 1 (blanco). */
export function colorLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** ¿Es un color oscuro? (sobre él va texto claro). */
export const isDarkColor = (hex: string) => colorLuminance(hex) < 0.18;

/** Texto que se lee encima de ese color: blanco o casi negro. */
export const readableOn = (hex: string) => (isDarkColor(hex) ? '#ffffff' : '#111827');

/** Un color de la paleta de las bolas, o el azul de siempre (src/lib/balls.ts DEFAULT_BALL_COLOR). */
const FALLBACK_COLOR = '#1d4ed8';

/** '#RRGGBB', ' #abcdef ' o '#abc' → '#rrggbb'; null si no es un color. */
export function cleanColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (HEX.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

export interface BallDesignColors {
  base: string;
  second: string;
  third: string;
  /** El borde de la bola (dibujo animado): la base muy oscura. */
  outline: string;
  /** El fondo de los huecos. */
  hole: string;
}

/**
 * Los colores con que se dibuja: los que eligió o, si second o third son null, dos que salen de la base (más claros si
 * la base es oscura, más oscuros si es clara), así cualquier dibujo se ve sin elegir nada más.
 */
export function ballDesignColors(d: Pick<BallDesign, 'base' | 'second' | 'third'>): BallDesignColors {
  const base = isBallColor(d.base) ? d.base : FALLBACK_COLOR;
  const dark = colorLuminance(base) < 0.3;
  const toward = dark ? '#ffffff' : '#000000';
  return {
    base,
    second: isBallColor(d.second) ? d.second : mixColors(base, toward, dark ? 0.42 : 0.3),
    third: isBallColor(d.third) ? d.third : mixColors(base, toward, dark ? 0.78 : 0.6),
    outline: mixColors(base, '#0b0b12', 0.74),
    hole: mixColors(base, '#050507', 0.86),
  };
}

// ---------- Revisar (lo mismo que la base) ----------

/** Lo que no deja guardar: la clave que falla ('base', 'stickers.2.text'…). */
export type BallDesignProblem = string;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const sameKeys = (o: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
};

const inRange = (v: unknown, key: RangeKey) => {
  const [lo, hi] = BALL_DESIGN_RANGES[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
};

/** Cuánto pesa el JSON (UTF-8). La base mide su texto de jsonb (con espacios): un diseño válido queda muy por debajo. */
export function ballDesignBytes(d: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(d) ?? '').length;
  } catch {
    // Algo que no es JSON (un ciclo, un BigInt): no se guarda.
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Lo que no vale de un diseño (null = se puede guardar), igual que private.ball_design_ok: justo esas claves (ni una
 * más), v = 1, colores '#rrggbb' en minúsculas (second y third también null), un dibujo de la lista, los números en su
 * rango, shine y holes sí/no, hasta 5 figuras de la lista con justo sus claves: `text` solo en 'numero' (1 a 3 cifras)
 * e 'iniciales' (1 a 3 letras en mayúscula) y en esas es obligatorio. Menos de 4 kB.
 */
export function ballDesignProblem(x: unknown): BallDesignProblem | null {
  if (!isPlainObject(x)) return 'object';
  if (ballDesignBytes(x) >= BALL_DESIGN_MAX_BYTES) return 'size';
  if (!sameKeys(x, DESIGN_KEYS)) return 'keys';
  if (x.v !== BALL_DESIGN_VERSION) return 'v';
  if (!isBallColor(x.base)) return 'base';
  if (x.second !== null && !isBallColor(x.second)) return 'second';
  if (x.third !== null && !isBallColor(x.third)) return 'third';
  if (typeof x.pattern !== 'string' || !PATTERN_KEYS.has(x.pattern)) return 'pattern';
  for (const k of ['scale', 'softness', 'angle'] as const) if (!inRange(x[k], k)) return k;
  if (typeof x.shine !== 'boolean') return 'shine';
  if (typeof x.holes !== 'boolean') return 'holes';
  if (!Array.isArray(x.stickers) || x.stickers.length > BALL_STICKERS_MAX) return 'stickers';
  for (let i = 0; i < x.stickers.length; i++) {
    const s: unknown = x.stickers[i];
    const at = `stickers.${i}`;
    if (!isPlainObject(s)) return at;
    if (typeof s.shape !== 'string' || !SHAPE_KEYS.has(s.shape)) return `${at}.shape`;
    const info = stickerInfo(s.shape as BallStickerShape);
    if (!sameKeys(s, info.text ? [...STICKER_KEYS, 'text'] : STICKER_KEYS)) return `${at}.keys`;
    if (info.text && (typeof s.text !== 'string' || !(info.text === 'digits' ? NUMBER_TEXT : INITIALS_TEXT).test(s.text))) return `${at}.text`;
    if (!isBallColor(s.color)) return `${at}.color`;
    for (const k of ['x', 'y', 'size', 'rotation'] as const) if (!inRange(s[k], k)) return `${at}.${k}`;
  }
  return null;
}

export const isBallDesign = (x: unknown): x is BallDesign => ballDesignProblem(x) === null;

// ---------- Arreglar (lo que llega de afuera o se está editando) ----------

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

function num(v: unknown, key: RangeKey, fallback: number, digits: number): number {
  const [lo, hi] = BALL_DESIGN_RANGES[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return round(Math.min(hi, Math.max(lo, n)), digits);
}

/** Grados en [0, 360): -30 → 330, 725 → 5. */
function degrees(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(((n % 360) + 360) % 360) % 360;
}

/**
 * El texto de una figura como lo guarda la base: en 'numero', las cifras (hasta 3); en 'iniciales', las letras en
 * mayúscula (con Ñ y tildes; hasta 3). Lo demás se quita: nunca llega a la bola nada que no sea eso. '' si no queda nada.
 */
export function cleanStickerText(shape: BallStickerShape, raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const kind = stickerInfo(shape).text;
  if (kind === 'digits') return raw.replace(/[^0-9]/g, '').slice(0, BALL_STICKER_TEXT_MAX);
  if (kind === 'letters') {
    return [...raw.normalize('NFC').toLocaleUpperCase('es')]
      .filter((c) => /^[A-ZÑÁÉÍÓÚÜ]$/u.test(c))
      .slice(0, BALL_STICKER_TEXT_MAX)
      .join('');
  }
  return '';
}

/** El texto de ejemplo de las figuras con texto: el número 7 y las iniciales «AB» (si la cuenta no tiene las suyas). */
export const BALL_STICKER_SAMPLE_TEXT = { digits: '7', letters: 'AB' } as const;

/**
 * El texto con que sale una figura nueva: `text` limpio o, si no queda nada, el de ejemplo; undefined si no lleva
 * texto. Lo usan la figura nueva (newSticker) y su botón para agregarla: los dos muestran lo mismo.
 */
export function stickerStartText(shape: BallStickerShape, text?: string | null): string | undefined {
  const kind = stickerInfo(shape).text;
  if (!kind) return undefined;
  return cleanStickerText(shape, text ?? '') || BALL_STICKER_SAMPLE_TEXT[kind];
}

/** Las iniciales de un nombre («Ana María Pérez» → «AMP»), para la figura de iniciales. '' si no hay letras. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return cleanStickerText('iniciales', words.map((w) => cleanStickerText('iniciales', w).slice(0, 1)).join(''));
}

/** Una figura que vale, o null si no se puede arreglar (figura que no existe, o número/iniciales sin texto). */
export function normalizeSticker(x: unknown): BallSticker | null {
  if (!isPlainObject(x) || typeof x.shape !== 'string' || !SHAPE_KEYS.has(x.shape)) return null;
  const shape = x.shape as BallStickerShape;
  const text = cleanStickerText(shape, x.text);
  if (stickerHasText(shape) && !text) return null;
  return {
    shape,
    ...(stickerHasText(shape) ? { text } : {}),
    color: cleanColor(x.color) ?? '#ffffff',
    x: num(x.x, 'x', 0, 3),
    y: num(x.y, 'y', 0, 3),
    size: num(x.size, 'size', 0.3, 3),
    rotation: degrees(x.rotation, 0),
  };
}

/**
 * El diseño que se puede guardar y dibujar a partir de cualquier cosa (lo que viene de la base, del borrador o, más
 * adelante, de una foto): lo que falta o no vale toma lo de defaultBallDesign(`fallbackColor`), los números se llevan a
 * su rango (y se redondean), los ángulos a 0–359 y las figuras que no valen se quitan (hasta 5). Siempre cumple
 * ballDesignProblem.
 */
export function normalizeBallDesign(x: unknown, fallbackColor?: string | null): BallDesign {
  const def = defaultBallDesign(fallbackColor);
  if (!isPlainObject(x)) return def;
  const pattern = typeof x.pattern === 'string' && PATTERN_KEYS.has(x.pattern) ? (x.pattern as BallPattern) : def.pattern;
  const stickers = Array.isArray(x.stickers)
    ? x.stickers.map(normalizeSticker).filter((s): s is BallSticker => s !== null).slice(0, BALL_STICKERS_MAX)
    : [];
  return {
    v: BALL_DESIGN_VERSION,
    base: cleanColor(x.base) ?? def.base,
    second: cleanColor(x.second),
    third: cleanColor(x.third),
    pattern,
    scale: num(x.scale, 'scale', def.scale, 2),
    softness: num(x.softness, 'softness', def.softness, 2),
    angle: degrees(x.angle, def.angle),
    shine: typeof x.shine === 'boolean' ? x.shine : def.shine,
    holes: typeof x.holes === 'boolean' ? x.holes : def.holes,
    stickers,
  };
}

/**
 * El diseño de una bola que todavía no tiene uno: su color, lisa (perlada si la cubierta es perlada, jaspeada si es
 * híbrida), con brillo y los tres huecos. Así se ve igual que antes de que existiera el creador.
 */
export function defaultBallDesign(color?: string | null, cover?: BallCover | null): BallDesign {
  return {
    v: BALL_DESIGN_VERSION,
    base: cleanColor(color) ?? FALLBACK_COLOR,
    second: null,
    third: null,
    pattern: cover === 'perlada' ? 'perlada' : cover === 'hibrida' ? 'jaspeada' : 'solida',
    scale: 1,
    softness: 0.5,
    angle: 30,
    shine: true,
    holes: true,
    stickers: [],
  };
}

/** Lo que se dibuja de una bola: su diseño (arreglado) o el de su color y su cubierta si no tiene. */
export function ballDesignOf(ball: { design?: unknown; color?: string | null; cover?: BallCover | null }): BallDesign {
  return ball.design != null ? normalizeBallDesign(ball.design, ball.color) : defaultBallDesign(ball.color, ball.cover);
}

/** ¿Los dos se ven igual? (el mismo diseño después de arreglarlos). */
export function sameBallDesign(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeBallDesign(a)) === JSON.stringify(normalizeBallDesign(b));
}

// ---------- Figuras nuevas y moverlas ----------

/**
 * Donde van cayendo las figuras nuevas (en radios de la bola) y de qué tamaño: las 5 caben juntas sin taparse entre
 * ellas (la distancia entre dos centros es al menos la suma de sus tamaños), sin tapar los huecos ni el brillo (BallArt)
 * y sin salirse de la bola. Las dos últimas, más chicas: es lo que cabe.
 */
export const BALL_STICKER_SPOTS: readonly { x: number; y: number; size: number }[] = [
  { x: 0, y: 0.5, size: 0.3 },
  { x: -0.33, y: -0.03, size: 0.3 },
  { x: 0.58, y: 0.29, size: 0.3 },
  { x: 0.64, y: -0.28, size: 0.25 },
  { x: -0.55, y: 0.46, size: 0.22 },
];

/** Lo más chica que sale una figura nueva cuando ya no cabe (las que tiene se movieron o se agrandaron). */
const NEW_STICKER_MIN_SIZE = 0.15;

/**
 * Una figura nueva para ese diseño: en el primer lugar donde cabe entera sin tapar las que ya tiene (del tamaño de ese
 * lugar) o, si las movió o agrandó y no cabe en ninguno, en el que tiene más espacio y más chica (hasta 0.15). De un
 * color que se ve sobre la base (amarillo en una bola oscura, rojo en una clara) y, si lleva texto, `text` limpio o el
 * de ejemplo (stickerStartText).
 */
export function newSticker(shape: BallStickerShape, design: Pick<BallDesign, 'base' | 'stickers'>, text?: string | null): BallSticker {
  // Cuánto le cabe en ese lugar sin tapar ninguna (hasta el tamaño del lugar).
  const room = (p: (typeof BALL_STICKER_SPOTS)[number]) =>
    design.stickers.reduce((m, s) => Math.min(m, Math.hypot(s.x - p.x, s.y - p.y) - s.size), p.size);
  const spot = BALL_STICKER_SPOTS.find((p) => room(p) >= p.size - 1e-9) ?? BALL_STICKER_SPOTS.reduce((a, b) => (room(b) > room(a) ? b : a));
  const start = stickerStartText(shape, text);
  // Redondeada hacia abajo (centésimas), así no queda encima de la de al lado por redondear.
  const size = Math.floor(Math.min(spot.size, Math.max(NEW_STICKER_MIN_SIZE, room(spot))) * 100 + 1e-9) / 100;
  return {
    shape,
    ...(start != null ? { text: start } : {}),
    color: colorLuminance(isBallColor(design.base) ? design.base : FALLBACK_COLOR) < 0.3 ? '#facc15' : '#dc2626',
    x: spot.x,
    y: spot.y,
    size,
    rotation: 0,
  };
}

/** Mueve una figura (en radios de la bola) sin salirse de -1…1. */
export function nudgeSticker(s: BallSticker, dx: number, dy: number): BallSticker {
  return { ...s, x: num(s.x + dx, 'x', s.x, 3), y: num(s.y + dy, 'y', s.y, 3) };
}

/**
 * La semilla del dibujo: sale del dibujo y del color base, no de lo demás. Así mover los controles (tamaño, ángulo,
 * suavidad, los otros colores o las figuras) no cambia las manchas de lugar, y dos bolas de distinto color no quedan
 * iguales.
 */
export function ballDesignSeed(d: Pick<BallDesign, 'pattern' | 'base'>): number {
  let h = 0x811c9dc5;
  for (const c of `${d.pattern}|${d.base}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
