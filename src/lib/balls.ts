/**
 * Mis bolas del boliche: las cuentas, sin React ni base (se prueban solas). Qué bola se elige al anotar (la última que
 * usaste), qué juego va con qué bola en una hoja de juegos sueltos (sin los huecos) y los números de cada bola: juegos,
 * promedio, el más alto, strikes y spares (de los juegos anotados por cuadros) y cuántos juegos lleva desde que se pulió.
 *
 * Los datos: src/lib/data/balls.ts (public.bowling_balls y public.ball_games, 20260930000100_bolas.sql).
 *
 * También el modelo del catálogo (src/lib/ballCatalog.ts) y la perforación (el layout Dual Angle, «45° × 4½″ × 30°»):
 * `catalog` y `layout` de la bola (set_ball_details, docs/boliche-equipos-practicas-bolas.md §3).
 */
import type { CatalogBall } from './ballCatalog';
import { cleanColor, defaultBallDesign, type BallDesign } from './ballDesign';
import { countedFrames, frameRates } from './bowlingStats';
import { isValidScore } from './stats';
import type { GameFrames } from './types';

// ---------- Tipos ----------

export type BallCover = 'solida' | 'perlada' | 'hibrida' | 'uretano' | 'poliester';

export interface Ball {
  id: string;
  name: string;
  /** Marca ('' si no la puso). */
  brand: string;
  /** Libras (6 a 16). */
  weight: number;
  /** '#rrggbb'. */
  color: string;
  cover: BallCover | null;
  /** YYYY-MM-DD o null. */
  drilledOn: string | null;
  /** La última vez que se pulió (YYYY-MM-DD) o null. */
  resurfacedOn: string | null;
  retired: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * Cómo se ve dibujada (src/lib/ballDesign.ts; set_ball_design, 20260930000300_diseno_bolas.sql); null o sin la
   * clave: lisa con su color (ballDesignOf).
   */
  design?: BallDesign | null;
  /** La clave del modelo en el catálogo ('storm:phaze-ii'); null o sin la clave: no se eligió del catálogo. */
  catalog?: string | null;
  /** La perforación (layout); null o sin la clave: no la puso. */
  layout?: BallLayout | null;
}

/**
 * El layout de la perforación (Dual Angle): ángulo de perforación × distancia del pin al PAP × ángulo VAL, y el buffer
 * del pin. Todo opcional (sin nada es null); los mismos límites de private.ball_layout_ok.
 */
export interface BallLayout {
  /** Ángulo de perforación, en grados (0 a 90). */
  drillingAngle?: number;
  /** Del pin al PAP (el punto del eje de la mano), en pulgadas: 0 a 7, de a 1/8. */
  pinToPap?: number;
  /** Ángulo VAL, en grados (0 a 90). */
  valAngle?: number;
  /** Pin buffer, en pulgadas: 0 a 7, de a 1/8. */
  pinBuffer?: number;
  /** Hasta LAYOUT_NOTES_MAX letras («Dual Angle, mano derecha»). */
  notes?: string;
}

/** Lo que se edita en la hoja de una bola (sin `id`: una nueva). */
export interface BallDraft {
  id?: string | null;
  name: string;
  brand: string;
  weight: number;
  color: string;
  cover: BallCover | null;
  drilledOn: string | null;
  resurfacedOn: string | null;
  retired: boolean;
  /** El modelo del catálogo (sin la clave: no se toca). Va aparte de la bola: set_ball_details. */
  catalog?: string | null;
  /** La perforación (sin la clave: no se toca). Va aparte de la bola: set_ball_details. */
  layout?: BallLayout | null;
}

/** Dónde está el juego: un juego suelto, un evento de la liga o un envío («Subir mis juegos»). */
export type BallGameKind = 'solo' | 'event' | 'sub';

/**
 * Lo que se manda por juego a set_game_balls: la bola, null (sin bola) o, en un juego suelto, el número de otro juego
 * (desde 0): «la bola que tiene ahora ese juego» (sin señal no se saben las bolas, pero sí cómo se movieron los juegos).
 */
export type GameBall = string | number | null;

/** Un juego con su bola (lo que devuelve my_ball_games). */
export interface BallGame {
  ball: string;
  kind: BallGameKind;
  /** Id del juego suelto, del evento o del envío. */
  ref: string;
  /** Juego desde 0 (en un envío, el del envío). */
  game: number;
  /** YYYY-MM-DD (null si no se sabe). */
  date: string | null;
  /** Pinos (null si todavía no tiene). */
  score: number | null;
  frames: GameFrames | null;
  /** Cuenta en los promedios (verificado en la liga, envío aprobado; los sueltos siempre). */
  counted: boolean;
}

// ---------- Límites (los mismos de la base) ----------

export const BALL_NAME_MAX = 40;
export const BALL_BRAND_MAX = 40;
export const BALL_MIN_WEIGHT = 6;
export const BALL_MAX_WEIGHT = 16;
/** Bolas por cuenta (las retiradas cuentan). */
export const BALL_MAX = 30;
/** Cada cuántos juegos se recomienda pulirla (las cubiertas reactivas pierden agarre con el aceite). */
export const RESURFACE_EVERY = 60;
/** Juegos que necesita una bola para compararla con las otras. */
export const BALL_MIN_GAMES = 3;

export const BALL_COVERS: readonly { key: BallCover; label: string }[] = [
  { key: 'solida', label: 'Reactiva sólida' },
  { key: 'perlada', label: 'Reactiva perlada' },
  { key: 'hibrida', label: 'Reactiva híbrida' },
  { key: 'uretano', label: 'Uretano' },
  { key: 'poliester', label: 'Poliéster (plástico)' },
];

/** Colores para elegir (el de la bola, para reconocerla en la lista y al anotar). */
export const BALL_COLORS: readonly { hex: string; label: string }[] = [
  { hex: '#1d4ed8', label: 'Azul' },
  { hex: '#0ea5e9', label: 'Celeste' },
  { hex: '#7c3aed', label: 'Morado' },
  { hex: '#db2777', label: 'Rosado' },
  { hex: '#dc2626', label: 'Rojo' },
  { hex: '#ea580c', label: 'Anaranjado' },
  { hex: '#facc15', label: 'Amarillo' },
  { hex: '#16a34a', label: 'Verde' },
  { hex: '#0d9488', label: 'Turquesa' },
  { hex: '#78350f', label: 'Marrón' },
  { hex: '#6b7280', label: 'Gris' },
  { hex: '#111827', label: 'Negro' },
  { hex: '#f8fafc', label: 'Blanco' },
];

export const DEFAULT_BALL_COLOR = BALL_COLORS[0].hex;

export const coverLabel = (c: BallCover | null | undefined) => BALL_COVERS.find((x) => x.key === c)?.label ?? null;

export const colorLabel = (hex: string) => BALL_COLORS.find((c) => c.hex === hex.toLowerCase())?.label ?? 'Otro color';

/** «15 lb · Storm · Reactiva sólida» (lo que se conoce). */
export function ballDetail(b: Pick<Ball, 'weight' | 'brand' | 'cover'>): string {
  return [`${b.weight} lb`, b.brand.trim(), coverLabel(b.cover)].filter(Boolean).join(' · ');
}

/** «Phaze II (15 lb)»: para las listas donde se elige. */
export const ballLabel = (b: Pick<Ball, 'name' | 'weight'>) => `${b.name} (${b.weight} lb)`;

// ---------- La hoja de una bola ----------

export type BallProblem = 'name' | 'brand' | 'weight' | 'color' | 'dates';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lo que no deja guardar (null = todo bien). La base revisa lo mismo (fechas: hasta mañana y de hace 30 años). */
export function ballDraftProblem(d: Pick<BallDraft, 'name' | 'brand' | 'weight' | 'color' | 'drilledOn' | 'resurfacedOn'>, today: string): BallProblem | null {
  const name = d.name.trim();
  if (!name || name.length > BALL_NAME_MAX) return 'name';
  if (d.brand.trim().length > BALL_BRAND_MAX) return 'brand';
  if (!Number.isInteger(d.weight) || d.weight < BALL_MIN_WEIGHT || d.weight > BALL_MAX_WEIGHT) return 'weight';
  if (!/^#[0-9a-f]{6}$/i.test(d.color.trim())) return 'color';
  const oldest = `${Number(today.slice(0, 4)) - 30}${today.slice(4)}`;
  const tomorrow = addDays(today, 1);
  for (const day of [d.drilledOn, d.resurfacedOn]) {
    if (day != null && (!ISO_DATE.test(day) || day < oldest || day > tomorrow)) return 'dates';
  }
  if (d.drilledOn && d.resurfacedOn && d.resurfacedOn < d.drilledOn) return 'dates';
  return null;
}

const PROBLEM_TEXT: Record<BallProblem, string> = {
  name: `Ponle un nombre (hasta ${BALL_NAME_MAX} letras).`,
  brand: `La marca puede tener hasta ${BALL_BRAND_MAX} letras.`,
  weight: `El peso va de ${BALL_MIN_WEIGHT} a ${BALL_MAX_WEIGHT} libras.`,
  color: 'Elige un color.',
  dates: 'Revisa las fechas: no pueden ser del futuro y la pulida va después de perforarla.',
};

export const ballProblemText = (p: BallProblem) => PROBLEM_TEXT[p];

/**
 * La bola como queda al guardar la hoja (lo mismo que manda saveBall: recortada y el color en minúsculas, con el
 * catálogo y la perforación que manda set_ball_details), para verla enseguida en la lista. Sin diseño ni fechas de la
 * base: llegan al volver a leer.
 */
export function ballFromDraft(id: string, d: BallDraft): Ball {
  return {
    id,
    name: d.name.trim(),
    brand: d.brand.trim(),
    weight: d.weight,
    color: d.color.trim().toLowerCase(),
    cover: d.cover,
    drilledOn: d.drilledOn || null,
    resurfacedOn: d.resurfacedOn || null,
    retired: d.retired,
    createdAt: null,
    updatedAt: null,
    design: null,
    catalog: cleanCatalogId(d.catalog),
    layout: cleanLayout(d.layout),
  };
}

// ---------- El modelo del catálogo (src/lib/ballCatalog.ts) ----------

/** Lo más largo que guarda la base en `catalog` (la clave del modelo). */
export const BALL_CATALOG_ID_MAX = 80;

/** La clave del modelo como la guarda la base (recortada y en minúsculas); null si no hay. */
export const cleanCatalogId = (id: string | null | undefined): string | null => (typeof id === 'string' && id.trim().toLowerCase()) || null;

/** ¿Es una clave de modelo que acepta la base? ('marca:modelo': minúsculas, cifras, punto, guion y guion bajo). */
export const isCatalogId = (id: string) => id.length <= BALL_CATALOG_ID_MAX && /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/.test(id);

const CORE_LABEL = { simetrico: 'simétrico', asimetrico: 'asimétrico' } as const;

/** «Reactiva perlada · 2023 · asimétrico»: lo que se dice de un modelo al buscarlo. */
export function catalogLine(c: Pick<CatalogBall, 'cover' | 'year' | 'core'>): string {
  return [coverLabel(c.cover), c.year, c.core && CORE_LABEL[c.core]].filter(Boolean).join(' · ');
}

/** «TX-16 Reactive · núcleo simétrico · 2014»: lo del catálogo que la bola no dice (su tarjeta y su hoja); null si nada. */
export function catalogSpecs(c: Pick<CatalogBall, 'coverstock' | 'core' | 'year'>): string | null {
  return [c.coverstock?.trim(), c.core && `núcleo ${CORE_LABEL[c.core]}`, c.year].filter(Boolean).join(' · ') || null;
}

/**
 * Cómo se propone dibujar una bola de ese modelo (con sus colores): con uno, lisa de ese color (perlada o jaspeada según
 * la cubierta, como defaultBallDesign); con dos o más, jaspeada con el segundo (y el tercero), que es como se ven casi
 * todas. null si el modelo no trae colores.
 */
export function catalogLook(c: Pick<CatalogBall, 'colors' | 'cover'>): BallDesign | null {
  const colors = (c.colors ?? []).map(cleanColor).filter((x): x is string => x != null);
  if (!colors.length) return null;
  const d = defaultBallDesign(colors[0], c.cover);
  return colors.length < 2 ? d : { ...d, pattern: 'jaspeada', second: colors[1], third: colors[2] ?? null };
}

/**
 * La hoja con un modelo del catálogo: su marca, su nombre, su cubierta y su clave (para `catalog`). En una nueva
 * (`fresh`) también su color (el primero del modelo); en una que ya existe el color se queda (es el de su diseño).
 */
export function draftFromCatalog(d: BallDraft, c: CatalogBall, fresh: boolean): BallDraft {
  const color = fresh ? cleanColor(c.colors?.[0]) : null;
  return {
    ...d,
    name: c.name.trim().slice(0, BALL_NAME_MAX),
    brand: c.brand.trim().slice(0, BALL_BRAND_MAX),
    cover: c.cover,
    catalog: c.id,
    ...(color ? { color } : {}),
  };
}

// ---------- La perforación (layout Dual Angle) ----------

export const LAYOUT_ANGLE_MAX = 90;
export const LAYOUT_INCHES_MAX = 7;
export const LAYOUT_NOTES_MAX = 60;

const LAYOUT_NUMBERS = ['drillingAngle', 'pinToPap', 'valAngle', 'pinBuffer'] as const;
const LAYOUT_KEYS: readonly string[] = [...LAYOUT_NUMBERS, 'notes'];

export type LayoutProblem = (typeof LAYOUT_NUMBERS)[number] | 'notes' | 'keys';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * La perforación como se guarda: solo lo que tiene algo, siempre en el mismo orden, y las notas recortadas; null si no
 * queda nada (también `{}`). Los números no se arreglan: los revisa layoutProblem.
 */
export function cleanLayout(x: unknown): BallLayout | null {
  if (!isPlainObject(x)) return null;
  const out: Record<string, unknown> = {};
  for (const k of LAYOUT_NUMBERS) if (x[k] != null && x[k] !== '') out[k] = x[k];
  if (typeof x.notes === 'string' && x.notes.trim()) out.notes = x.notes.trim();
  return Object.keys(out).length ? (out as BallLayout) : null;
}

const isAngle = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LAYOUT_ANGLE_MAX;
const isInches = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= LAYOUT_INCHES_MAX && Number.isInteger(v * 8);

/**
 * Lo que no deja guardar la perforación (null = todo bien; null o sin nada también): los ángulos, enteros de 0 a 90°;
 * el pin al PAP y el buffer, de 0 a 7″ de a 1/8; las notas, hasta 60 letras; ninguna otra clave.
 */
export function layoutProblem(x: unknown): LayoutProblem | null {
  if (x == null) return null;
  if (!isPlainObject(x) || Object.keys(x).some((k) => !LAYOUT_KEYS.includes(k))) return 'keys';
  if (x.drillingAngle !== undefined && !isAngle(x.drillingAngle)) return 'drillingAngle';
  if (x.pinToPap !== undefined && !isInches(x.pinToPap)) return 'pinToPap';
  if (x.valAngle !== undefined && !isAngle(x.valAngle)) return 'valAngle';
  if (x.pinBuffer !== undefined && !isInches(x.pinBuffer)) return 'pinBuffer';
  if (x.notes !== undefined && (typeof x.notes !== 'string' || [...x.notes.trim()].length > LAYOUT_NOTES_MAX)) return 'notes';
  return null;
}

const LAYOUT_PROBLEM_TEXT: Record<LayoutProblem, string> = {
  drillingAngle: `El ángulo de perforación va de 0 a ${LAYOUT_ANGLE_MAX}°.`,
  pinToPap: `Del pin al PAP va de 0 a ${LAYOUT_INCHES_MAX}″.`,
  valAngle: `El ángulo VAL va de 0 a ${LAYOUT_ANGLE_MAX}°.`,
  pinBuffer: `El buffer va de 0 a ${LAYOUT_INCHES_MAX}″.`,
  notes: `Las notas de la perforación pueden tener hasta ${LAYOUT_NOTES_MAX} letras.`,
  keys: 'Revisa la perforación.',
};

export const layoutProblemText = (p: LayoutProblem) => LAYOUT_PROBLEM_TEXT[p];

/** Los octavos de pulgada como se escriben («½»); el primero (0) va vacío. */
export const INCH_EIGHTHS: readonly string[] = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];

/** Pulgadas con su fracción: 4.5 → «4½″», 0.25 → «¼″», 3 → «3″» (algo que no va de a 1/8, con coma: «4,3″»). */
export function inchesText(v: number): string {
  if (!Number.isInteger(v * 8)) return `${String(Math.round(v * 100) / 100).replace('.', ',')}″`;
  const whole = Math.floor(v);
  const eighths = v * 8 - whole * 8;
  return `${whole || !eighths ? whole : ''}${INCH_EIGHTHS[eighths]}″`;
}

/** Las pulgadas en entero y octavos (para elegirlas): 4.5 → {whole: 4, eighths: 4}; null si no hay. */
export function splitInches(v: number | null | undefined): { whole: number; eighths: number } | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const whole = Math.floor(v);
  return { whole, eighths: Math.min(7, Math.max(0, Math.round((v - whole) * 8))) };
}

/**
 * Las pulgadas desde el entero y los octavos que se eligieron: sin entero ni octavos, nada (undefined); sin entero, solo
 * la fracción (½″); con 7 (el máximo), justo 7.
 */
export function joinInches(whole: number | null, eighths: number): number | undefined {
  if (whole == null && !eighths) return undefined;
  const w = whole ?? 0;
  return w >= LAYOUT_INCHES_MAX ? LAYOUT_INCHES_MAX : w + eighths / 8;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * La perforación en una línea, como la escribe el taladrador: «45° × 4½″ × 30°» (lo que falta, «—») y el buffer al
 * final («+ 2″ buffer»); solo el buffer: «Buffer 2″». null si no tiene números (las notas van aparte).
 */
export function layoutText(l: BallLayout | null | undefined): string | null {
  if (!l) return null;
  const [angle, pap, val, buffer] = [num(l.drillingAngle), num(l.pinToPap), num(l.valAngle), num(l.pinBuffer)];
  if (angle == null && pap == null && val == null) return buffer == null ? null : `Buffer ${inchesText(buffer)}`;
  const main = [angle == null ? '—' : `${angle}°`, pap == null ? '—' : inchesText(pap), val == null ? '—' : `${val}°`].join(' × ');
  return buffer == null ? main : `${main} + ${inchesText(buffer)} buffer`;
}

/** ¿Cambió el modelo del catálogo o la perforación? (solo entonces se manda set_ball_details). */
export function ballDetailsChanged(before: Pick<Ball, 'catalog' | 'layout'> | null | undefined, d: Pick<BallDraft, 'catalog' | 'layout'>): boolean {
  if (cleanCatalogId(d.catalog) !== cleanCatalogId(before?.catalog)) return true;
  return JSON.stringify(cleanLayout(d.layout)) !== JSON.stringify(cleanLayout(before?.layout));
}

/**
 * La lista con esa bola: reemplaza la del mismo id o, si es nueva, va donde la pone my_balls (la más nueva al final de
 * las que usa, antes de las retiradas; una retirada, al final).
 */
export function withBall(balls: readonly Ball[], b: Ball): Ball[] {
  if (balls.some((x) => x.id === b.id)) return balls.map((x) => (x.id === b.id ? b : x));
  const at = b.retired ? -1 : balls.findIndex((x) => x.retired);
  return at < 0 ? [...balls, b] : [...balls.slice(0, at), b, ...balls.slice(at)];
}

/** «Bola del juego 3» (`game` desde 0) o «Bola de todos los juegos». */
export const gameBallTitle = (game: number | 'all') => (game === 'all' ? 'Bola de todos los juegos' : `Bola del juego ${game + 1}`);

// ---------- Qué bola se elige al anotar ----------

/**
 * Las que salen para elegir: las que no están retiradas (y las de `keep`, aunque se hayan retirado: la que ya tenía el
 * juego y, mientras se elige, la que está elegida).
 */
export function pickableBalls(balls: readonly Ball[], ...keep: (string | null | undefined)[]): Ball[] {
  return balls.filter((b) => !b.retired || keep.includes(b.id));
}

/**
 * La bola que se pone sola en un juego nuevo: la última que eligió en este teléfono o, si no, la del último juego que
 * marcó (la del servidor). Una retirada o borrada no; sin ninguna, null (la bola es opcional).
 */
export function defaultBall(balls: readonly Ball[], stored: string | null | undefined, lastUsed: string | null | undefined): string | null {
  for (const id of [stored, lastUsed]) {
    if (id && balls.some((b) => b.id === id && !b.retired)) return id;
  }
  return null;
}

/**
 * La bola de un juego del borrador: la que ya se eligió para ese juego (null = sin bola), si no la del juego anterior
 * que tenga una (se sigue con la misma) y, si no, `auto` (la última que usó).
 */
export function ballForGame(balls: Readonly<Record<string, string | null | undefined>> | null | undefined, game: number, auto: string | null): string | null {
  const own = balls?.[String(game)];
  if (own !== undefined) return own;
  for (let j = game - 1; j >= 0; j--) {
    const before = balls?.[String(j)];
    if (before) return before;
  }
  return auto;
}

/** La bola que más se repite en esos juegos (la de la hoja completa); empate: la del primer juego. null sin ninguna. */
export function commonBall(balls: readonly (string | null | undefined)[]): string | null {
  const count = new Map<string, number>();
  for (const b of balls) if (b) count.set(b, (count.get(b) ?? 0) + 1);
  let best: string | null = null;
  for (const b of balls) if (b && (best == null || count.get(b)! > count.get(best)!)) best = b;
  return best;
}

/**
 * La bola con que se abre un juego propio en la hoja del evento (GamesTab): la que ya tenía ahí (también la de un envío
 * aprobado, que pasa a ese juego) y, en uno sin jugar, `auto` (la última que usó). Uno que ya tiene puntaje pero no
 * bola ahí (lo anotó el admin, o vino de un envío sin bola) sale sin bola: guardarlo no le pone una que no eligió.
 */
export function eventGameBall(had: Readonly<Record<number, string>>, game: number, scored: boolean, auto: string | null): string | null {
  if (game in had) return had[game];
  return scored ? null : auto;
}

/** ¿Todos los juegos tienen la misma bola? Esa (o null si ninguno tiene); `undefined` si hay varias. */
export function sameBall(balls: readonly (string | null | undefined)[]): string | null | undefined {
  const set = new Set(balls.map((b) => b ?? null));
  if (set.size > 1) return undefined;
  return set.size ? [...set][0] : null;
}

/**
 * Las bolas de una hoja de juegos sueltos como quedan al guardar: las casillas vacías (o que no valen) se saltan, igual
 * que los juegos (ver slotsToGames). Devuelve {"<juego desde 0>": bola | null} con todos los juegos.
 */
export function compactBalls(values: readonly string[], balls: Readonly<Record<number, string | null | undefined>>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let n = 0;
  values.forEach((v, i) => {
    if (!v.trim() || !isValidScore(Number(v))) return;
    out[String(n++)] = balls[i] ?? null;
  });
  return out;
}

/** Las bolas de los juegos que tienen puntaje (el envío de «Subir mis juegos»): {"<juego>": bola}; ninguno = null. */
export function ballsOfScored(scores: readonly (number | null)[], balls: Readonly<Record<string, string | null | undefined>>): Record<string, string> | null {
  const out: Record<string, string> = {};
  scores.forEach((s, i) => {
    const b = balls[String(i)];
    if (s != null && b) out[String(i)] = b;
  });
  return Object.keys(out).length ? out : null;
}

/** Las bolas de un lugar por juego (para abrir la hoja con las que tenía). */
export function ballsByGame(games: readonly Pick<BallGame, 'kind' | 'ref' | 'game' | 'ball'>[], kind: BallGameKind, ref: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const g of games) if (g.kind === kind && g.ref === ref) out[g.game] = g.ball;
  return out;
}

/**
 * Las bolas que tiene cada uno de los `games` juegos de un juego suelto: las del servidor (`server`; null = no se
 * pudieron leer) con lo que está en la cola encima (`queued`, el último set_game_balls que no ha llegado: trae todos los
 * juegos). null si no se sabe (sin señal y lo de la cola apunta a bolas que solo tiene el servidor).
 */
export function knownBalls(
  games: number,
  server: Readonly<Record<number, string>> | null,
  queued: Readonly<Record<string, GameBall>> | null,
): Record<number, string> | null {
  const out: Record<number, string> = {};
  for (let i = 0; i < games; i++) {
    const q = queued && String(i) in queued ? queued[String(i)] : undefined;
    if (q === null) continue;
    if (typeof q === 'string') {
      out[i] = q;
      continue;
    }
    // Lo que tiene el servidor en ese juego (o en el otro juego al que apunta el número).
    if (!server) return null;
    const b = server[q ?? i];
    if (b) out[i] = b;
  }
  return out;
}

/**
 * Juntar lo nuevo con lo que reemplaza en la cola (que no salió): un número de lo nuevo apunta a un juego de cómo
 * quedaba con lo de la cola, así que pasa a ser lo que la cola le ponía a ese juego (si no le ponía nada, el número
 * sigue apuntando al servidor).
 */
export function composeBalls(next: Readonly<Record<string, GameBall>>, prev: Readonly<Record<string, GameBall>> | null | undefined): Record<string, GameBall> {
  const out: Record<string, GameBall> = {};
  for (const [k, v] of Object.entries(next)) out[k] = typeof v === 'number' && prev && String(v) in prev ? prev[String(v)] : v;
  return out;
}

/**
 * Sin saber las bolas (sin señal): cómo se movieron los juegos de una hoja de juegos sueltos que ya tenía `before`
 * juegos. Cada juego que queda apunta al que era (un número) y uno nuevo va sin bola; null si no se movió ninguno
 * (mismos juegos en el mismo lugar: no hay nada que mandar).
 */
export function keepBalls(values: readonly string[], before: number): Record<string, number | null> | null {
  const out: Record<string, number | null> = {};
  let n = 0;
  let moved = false;
  values.forEach((v, i) => {
    if (!v.trim() || !isValidScore(Number(v))) return;
    const was = i < before ? i : null;
    if (was !== n) moved = true;
    out[String(n++)] = was;
  });
  return moved || n !== before ? out : null;
}

/** ¿Cambió alguna bola (o sobra alguna de un juego que ya no está)? `next` trae todos los juegos. */
export function ballsChanged(next: Readonly<Record<string, string | null>>, had: Readonly<Record<number, string>>): boolean {
  if (Object.entries(next).some(([k, b]) => (had[Number(k)] ?? null) !== (b ?? null))) return true;
  return Object.keys(had).some((k) => !(k in next));
}

/**
 * La bola de un juego propio guardado en la hoja del evento (GamesTab): {"<juego>": bola | null} para la cola, o null
 * si no hay nada que cambiar. Con puntaje: la elegida (`picked`; undefined = no se pudo elegir, la cuenta no tiene bolas),
 * si no es la que ya tenía y hay alguna (sin bola antes y ahora no se manda nada). Sin puntaje (se borró el juego): se
 * le quita la que tenía.
 */
export function eventBallUpdate(
  had: Readonly<Record<number, string>>,
  game: number,
  score: number | null,
  picked: string | null | undefined,
): Record<string, string | null> | null {
  const before = had[game] ?? null;
  if (score == null) return before ? { [String(game)]: null } : null;
  if (picked === undefined || picked === before) return null;
  return { [String(game)]: picked };
}

/** La que eligió en un juego propio de la hoja del evento (GamesTab) y la que tenía el juego en ese momento. */
export interface OwnPick {
  ball: string | null;
  was: string | null;
}

/**
 * La que eligió en un juego propio, si se sigue viendo (undefined si no): mientras el juego siga con la que tenía
 * (`was`: todavía no llega a la cola, o el juego no tiene puntaje) o ya tenga la elegida (`now`: la del servidor con
 * la cola encima). Si después otra pantalla le pone otra (la foto, otro teléfono), manda esa.
 */
export function ownPickShown(pick: OwnPick | undefined, now: string | null): string | null | undefined {
  return pick && (now === pick.was || now === pick.ball) ? pick.ball : undefined;
}

/**
 * La elegida en ese juego ya va en la cola (o ya era la que tenía): desde ahora solo se ve mientras el juego siga con
 * ella. Si otra pantalla le pone otra, manda esa aunque sea la de antes (si no, la elegida volvería y se mandaría otra
 * vez al guardar el juego). Sin cambios si ahí ya se eligió otra.
 */
export function seenPick(picks: Readonly<Record<number, OwnPick>>, game: number, ball: string | null): Record<number, OwnPick> {
  const p = picks[game];
  return p && p.ball === ball && p.was !== ball ? { ...picks, [game]: { ball, was: ball } } : (picks as Record<number, OwnPick>);
}

/**
 * Las bolas del borrador de «Mis juegos» después de guardar (`value`) o borrar (null) el juego `game`: con puntaje, la
 * elegida (`picked`; undefined = no se pudo elegir y se deja como estaba); sin juego, se quita la suya.
 */
export function draftBallsAfter(
  prev: Readonly<Record<string, string | null>> | null | undefined,
  game: number,
  value: { score: number | null } | null,
  picked: string | null | undefined,
): Record<string, string | null> {
  const out = { ...(prev ?? {}) };
  if (!value) delete out[String(game)];
  else if (value.score != null && picked !== undefined) out[String(game)] = picked;
  return out;
}

/**
 * Las bolas de un envío («Subir mis juegos»): la de cada juego con puntaje (la del borrador, la del juego anterior o
 * `auto`, como se ven: ballForGame). null si la cuenta no tiene bolas para elegir (`canPick`) o ningún juego lleva bola.
 */
export function submissionBalls(
  scores: readonly (number | null)[],
  draft: Readonly<Record<string, string | null | undefined>> | null | undefined,
  auto: string | null,
  canPick: boolean,
): Record<string, string> | null {
  if (!canPick) return null;
  return ballsOfScored(scores, Object.fromEntries(scores.map((_, i) => [String(i), ballForGame(draft, i, auto)])));
}

/** La última bola (no vacía) de una lista: la que se recuerda para el próximo juego. */
export const lastBall = (balls: readonly (GameBall | undefined)[]): string | null =>
  balls.filter((b): b is string => typeof b === 'string' && !!b).at(-1) ?? null;

// ---------- Los números de cada bola ----------

export interface BallStats {
  ball: Ball;
  /** Juegos que cuentan (con puntaje). */
  games: number;
  pins: number;
  /** Promedio (hacia abajo, como en las ligas); null sin juegos. */
  average: number | null;
  high: number;
  /** Juegos con esta bola que todavía no cuentan (por verificar o por aprobar). */
  pending: number;
  /** Juegos anotados por cuadros que cuentan (y cuadran con el puntaje). */
  framed: number;
  strikePct: number | null;
  sparePct: number | null;
  /**
   * Juegos desde la última pulida, contando los de ese mismo día (o todos, si nunca se pulió); los por aprobar también
   * gastan la bola.
   */
  sinceResurface: number;
  /** Ya lleva RESURFACE_EVERY juegos o más sin pulir. */
  needsResurface: boolean;
  /** El último día que se usó (YYYY-MM-DD) o null. */
  lastUsedOn: string | null;
}

/** Los números de cada bola (en el orden en que vienen las bolas). */
export function ballStats(balls: readonly Ball[], games: readonly BallGame[]): BallStats[] {
  return balls.map((ball) => {
    const mine = games.filter((g) => g.ball === ball.id && g.score != null);
    const counted = mine.filter((g) => g.counted);
    const scores = counted.map((g) => g.score!);
    const pins = scores.reduce((a, b) => a + b, 0);
    const frames = countedFrames(counted.map((g) => ({ score: g.score!, frames: g.frames })));
    const rates = frameRates(frames);
    // Desde el día de la pulida (incluido): «La pulí hoy» cuenta los juegos que tire hoy.
    const sinceResurface = mine.filter((g) => !ball.resurfacedOn || (g.date != null && g.date >= ball.resurfacedOn)).length;
    const lastUsedOn = mine.reduce<string | null>((a, g) => (g.date && (!a || g.date > a) ? g.date : a), null);
    return {
      ball,
      games: scores.length,
      pins,
      average: scores.length ? Math.floor(pins / scores.length) : null,
      high: scores.length ? Math.max(...scores) : 0,
      pending: mine.length - counted.length,
      framed: frames.length,
      strikePct: rates.strikePct,
      sparePct: rates.sparePct,
      sinceResurface,
      needsResurface: sinceResurface >= RESURFACE_EVERY,
      lastUsedOn,
    };
  });
}

/** Con cuál tiras mejor: el mejor promedio entre las que tienen al menos BALL_MIN_GAMES juegos (si hay dos o más así). */
export function bestBall(stats: readonly BallStats[]): BallStats | null {
  const enough = stats.filter((s) => s.games >= BALL_MIN_GAMES && s.average != null);
  if (enough.length < 2) return null;
  return enough.reduce((a, b) => (b.average! > a.average! || (b.average === a.average && b.games > a.games) ? b : a));
}

/** «Tiras mejor con la Phaze II: 198 de promedio en 14 juegos (12 más que con la Hammer).» */
export function bestBallText(stats: readonly BallStats[]): string | null {
  const best = bestBall(stats);
  if (!best) return null;
  const next = stats
    .filter((s) => s !== best && s.games >= BALL_MIN_GAMES && s.average != null)
    .sort((a, b) => b.average! - a.average!)[0];
  const diff = next ? best.average! - next.average! : 0;
  const tail = next && diff > 0 ? ` (${diff} ${diff === 1 ? 'pino' : 'pinos'} más que con la ${next.ball.name})` : '';
  return `Tiras mejor con la ${best.ball.name}: ${best.average} de promedio en ${best.games} juegos${tail}.`;
}

/** Cuántos juegos lleva desde que se pulió (y si ya le toca), en palabras. */
export function resurfaceText(s: Pick<BallStats, 'sinceResurface' | 'needsResurface'> & { ball: Pick<Ball, 'resurfacedOn'> }): string {
  const n = s.sinceResurface;
  const games = `${n} ${n === 1 ? 'juego' : 'juegos'}`;
  if (s.needsResurface) {
    return s.ball.resurfacedOn
      ? `Lleva ${games} desde la última pulida: ya le toca pulirla (cada ${RESURFACE_EVERY} juegos, más o menos).`
      : `Lleva ${games} sin pulir: ya le toca (cada ${RESURFACE_EVERY} juegos, más o menos).`;
  }
  if (!s.ball.resurfacedOn) return n ? `${games} sin pulir.` : 'Todavía sin juegos.';
  return `${games} desde la última pulida.`;
}

/**
 * Lo que pregunta «La pulí hoy» antes de cambiar la fecha (la de antes se pierde y los juegos se vuelven a contar); null
 * si ya dice hoy (no hay nada que cambiar).
 */
export function resurfaceQuestion(b: Pick<Ball, 'name' | 'resurfacedOn'>, today: string, formatDay: (day: string) => string): { title: string; message: string } | null {
  if (b.resurfacedOn === today) return null;
  const before = b.resurfacedOn ? ` La última pulida (${formatDay(b.resurfacedOn)}) se reemplaza.` : '';
  return {
    title: `¿Puliste la ${b.name} hoy?`,
    message: `Sus juegos se vuelven a contar desde hoy (los de hoy también).${before}`,
  };
}

/** Porcentaje para mostrar ('—' sin datos). */
export const pctText = (p: number | null) => (p == null ? '—' : `${p}%`);
