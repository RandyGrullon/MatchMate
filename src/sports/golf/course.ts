/**
 * Golf: campos, salidas (tees) y handicap WHS. Funciones puras, sin React ni backend.
 *
 * - El campo tiene 9 o 18 hoyos con par e índice de dificultad (SI; 1 = el hoyo más difícil).
 * - Cada salida tiene rating, slope y par. La salida va POR INSCRIPCIÓN, no por evento:
 *   cada jugador puede salir de tees distintos (caballeros, damas) con su propio rating y slope.
 * - La app NO calcula el Handicap Index oficial: usa el que el jugador escribe (FEDOGOLF/GHIN), rotulado «no oficial».
 *
 * Fórmulas (Reglas de Handicap del WHS, Regla 6.1 y Apéndice C):
 * - handicap de campo, 18 hoyos = Index × Slope/113 + (Rating − Par)
 * - handicap de campo, 9 hoyos  = (Index/2) × Slope9/113 + (Rating9 − Par9)
 * - handicap de juego = handicap de campo SIN redondear × % de la competencia; ahí se redondea (0,5 sube).
 */

export const MIN_INDEX = -10;
export const MAX_INDEX = 54;
export const MIN_SLOPE = 55;
export const MAX_SLOPE = 155;
/** % de handicap por defecto: stroke play individual y Stableford (Apéndice C). */
export const DEFAULT_ALLOWANCE = 95;

export interface GolfHole {
  par: number;
  /** Índice de dificultad (stroke index): 1 = el más difícil. */
  si: number;
}

/** Lo que hace falta para el handicap de campo: rating, slope y par de la salida (o de una vuelta de 9). */
export interface TeeRating {
  rating: number;
  slope: number;
  par: number;
}

export interface GolfTee extends TeeRating {
  id: string;
  /** «Azules», «Blancas», «Rojas»… */
  name: string;
  /** Par por hoyo si esta salida lo cambia (p. ej. un par 5 que desde las rojas es par 4). */
  pars?: number[];
  /** SI por hoyo si esta salida tiene otro (muchas tarjetas traen un SI de damas). */
  sis?: number[];
  /** Rating de cada vuelta en un campo de 18, para rondas de 9 hoyos. Sin esto se estima (ver `teeRating`). */
  front9?: TeeRating;
  back9?: TeeRating;
}

export interface GolfCourse {
  id: string;
  name: string;
  /** 9 o 18 hoyos, en orden (el índice 0 es el hoyo 1). */
  holes: GolfHole[];
  tees: GolfTee[];
}

/** Qué hoyos se juegan: todo el campo, o la ida (1–9) o la vuelta (10–18) de un campo de 18. */
export type Nine = 'all' | 'front' | 'back';

/** Hoyo tal como se juega en una ronda: número real (1–18), par y SI de la salida del jugador. */
export interface PlayedHole {
  number: number;
  par: number;
  si: number;
}

/**
 * Redondeo del WHS: al entero más cercano y 0,5 sube (16,5 → 17; −0,5 → 0; −2,5 → −2).
 * El épsilon evita que un 12,4999999 de coma flotante (que en realidad es 12,5) baje.
 */
export function roundWhs(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

export function isValidIndex(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_INDEX && n <= MAX_INDEX;
}

function isInt(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function ratingErrors(r: TeeRating | undefined, label: string, par: number): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (!isInt(r.slope, MIN_SLOPE, MAX_SLOPE)) out.push(`${label}: el slope va de ${MIN_SLOPE} a ${MAX_SLOPE}.`);
  if (typeof r.rating !== 'number' || !Number.isFinite(r.rating) || Math.abs(r.rating - r.par) > 20) out.push(`${label}: el rating no cuadra con el par.`);
  if (r.par !== par) out.push(`${label}: el par debe ser ${par} (la suma de sus hoyos).`);
  return out;
}

/** SI del 1 al 18 sin repetir (con 18 hoyos eso obliga a usarlos todos; con 9 vale 1–9 o 1, 3, 5…). */
function siErrors(sis: readonly number[], label: string): string[] {
  const out: string[] = [];
  sis.forEach((si, i) => {
    if (!isInt(si, 1, 18)) out.push(`${label ? `${label}hoyo` : 'Hoyo'} ${i + 1}: el SI va del 1 al 18.`);
  });
  if (new Set(sis).size !== sis.length) out.push(`${label ? `${label}hay` : 'Hay'} SI repetidos.`);
  return out;
}

/** Errores del campo en español (lista vacía = válido). Lo mismo que valida el trigger de la base. */
export function validateCourse(course: GolfCourse): string[] {
  const out: string[] = [];
  const n = course.holes.length;
  if (!course.name?.trim()) out.push('Falta el nombre del campo.');
  if (n !== 9 && n !== 18) {
    out.push('El campo debe tener 9 o 18 hoyos.');
    return out;
  }
  course.holes.forEach((h, i) => {
    if (!isInt(h.par, 3, 6)) out.push(`Hoyo ${i + 1}: el par va de 3 a 6.`);
  });
  out.push(...siErrors(course.holes.map((h) => h.si), ''));
  if (!course.tees.length) out.push('Falta al menos una salida.');
  const ids = new Set<string>();
  course.tees.forEach((t) => {
    const label = `Salida ${t.name || t.id}`;
    if (ids.has(t.id)) out.push(`${label}: id repetido.`);
    ids.add(t.id);
    if (t.pars && (t.pars.length !== n || !t.pars.every((p) => isInt(p, 3, 6)))) out.push(`${label}: los pares deben ser ${n}, de 3 a 6.`);
    if (t.sis) {
      if (t.sis.length !== n) out.push(`${label}: faltan SI (deben ser ${n}).`);
      else out.push(...siErrors(t.sis, `${label}, `));
    }
    const pars = t.pars ?? course.holes.map((h) => h.par);
    out.push(...ratingErrors(t, label, sum(pars)));
    if (n === 9 && (t.front9 || t.back9)) out.push(`${label}: un campo de 9 hoyos no lleva rating por vuelta.`);
    if (n === 18) {
      out.push(...ratingErrors(t.front9, `${label} (ida)`, sum(pars.slice(0, 9))));
      out.push(...ratingErrors(t.back9, `${label} (vuelta)`, sum(pars.slice(9))));
    }
  });
  return out;
}

export function findTee(course: GolfCourse, teeId: string): GolfTee {
  const tee = course.tees.find((t) => t.id === teeId);
  if (!tee) throw new Error('Esa salida no existe en el campo.');
  return tee;
}

/** Hoyos que se juegan desde una salida (con su par y SI), en orden de número. */
export function teeHoles(course: GolfCourse, tee: GolfTee, nine: Nine = 'all'): PlayedHole[] {
  const all = course.holes.map((h, i) => ({ number: i + 1, par: tee.pars?.[i] ?? h.par, si: tee.sis?.[i] ?? h.si }));
  if (all.length !== 18 || nine === 'all') return all;
  return nine === 'front' ? all.slice(0, 9) : all.slice(9);
}

/**
 * Rating que corresponde a la ronda. En un campo de 9 hoyos, el de la salida (ya es de 9).
 * Para 9 hoyos en un campo de 18 usa `front9`/`back9`; si no están, ESTIMA: rating/2, el mismo slope
 * y el par de esos 9 hoyos (`estimated: true`, para avisarlo en pantalla).
 */
export function teeRating(course: GolfCourse, tee: GolfTee, nine: Nine = 'all'): { rating: TeeRating; holes: 9 | 18; estimated: boolean } {
  if (course.holes.length === 9) return { rating: tee, holes: 9, estimated: false };
  if (nine === 'all') return { rating: tee, holes: 18, estimated: false };
  const given = nine === 'front' ? tee.front9 : tee.back9;
  if (given) return { rating: given, holes: 9, estimated: false };
  const par = sum(teeHoles(course, tee, nine).map((h) => h.par));
  return { rating: { rating: tee.rating / 2, slope: tee.slope, par }, holes: 9, estimated: true };
}

/**
 * Handicap de campo SIN redondear (se redondea solo para mostrarlo, con `roundWhs`).
 * `holes = 9`: `r` es el rating de 9 hoyos y se usa la mitad del Index.
 */
export function courseHandicap(index: number, r: TeeRating, holes: 9 | 18 = 18): number {
  const idx = holes === 9 ? index / 2 : index;
  return (idx * r.slope) / 113 + (r.rating - r.par);
}

/** Handicap de juego = handicap de campo (sin redondear) × % de la competencia, redondeado (0,5 sube). */
export function playingHandicap(courseHcp: number, allowance = DEFAULT_ALLOWANCE): number {
  return roundWhs((courseHcp * allowance) / 100);
}

export interface HandicapInfo {
  /** Sin redondear: es lo que entra al handicap de juego. */
  courseHcp: number;
  /** El que se muestra al jugador. */
  courseHcpRounded: number;
  playingHcp: number;
  allowance: number;
  holes: 9 | 18;
  /** El rating de 9 hoyos se estimó a partir del de 18. */
  estimated: boolean;
}

/** Todo el cálculo para un jugador: Index escrito a mano + la salida que eligió + el % de la competencia. */
export function handicapFor(index: number, course: GolfCourse, teeId: string, opts: { nine?: Nine; allowance?: number } = {}): HandicapInfo {
  if (!isValidIndex(index)) throw new Error(`El Index va de ${MIN_INDEX} a ${MAX_INDEX}.`);
  const allowance = opts.allowance ?? DEFAULT_ALLOWANCE;
  const { rating, holes, estimated } = teeRating(course, findTee(course, teeId), opts.nine ?? 'all');
  const courseHcp = courseHandicap(index, rating, holes);
  return { courseHcp, courseHcpRounded: roundWhs(courseHcp), playingHcp: playingHandicap(courseHcp, allowance), allowance, holes, estimated };
}

/**
 * Golpes de ventaja por hoyo según el SI (el de SI más bajo recibe primero).
 * - Con handicap mayor que el número de hoyos, un segundo golpe (o tercero) en los más difíciles.
 * - Con handicap «plus» (negativo) se DEVUELVEN golpes empezando por el SI más alto (el 18): valores negativos.
 * Con 9 hoyos cuenta el orden de los SI de esos hoyos (1, 3, 5… o 1–9 da igual).
 * La suma siempre da el handicap de juego.
 */
export function strokesReceived(playingHcp: number, sis: readonly number[]): number[] {
  const n = sis.length;
  if (!n) return [];
  const rank: number[] = new Array(n);
  sis
    .map((si, i) => ({ si, i }))
    .sort((a, b) => a.si - b.si || a.i - b.i)
    .forEach((o, r) => (rank[o.i] = r + 1));
  const ph = Math.trunc(playingHcp);
  if (ph >= 0) {
    const base = Math.floor(ph / n);
    const extra = ph % n;
    return rank.map((r) => base + (r <= extra ? 1 : 0));
  }
  const give = -ph;
  const base = Math.floor(give / n);
  const extra = give % n;
  return rank.map((r) => 0 - (base + (r > n - extra ? 1 : 0)));
}
