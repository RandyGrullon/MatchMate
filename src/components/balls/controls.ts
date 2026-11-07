import { cleanColor, mixColors } from '../../lib/ballDesign';

/*
 * Las cuentas de los controles del creador de bolas en el teléfono (movil/src/components/balls/DesignControls.tsx), sin
 * React: el control deslizable (el <input type="range"> de la web) y «Otro color» (el <input type="color"> de la web,
 * que en el teléfono no tiene un selector del sistema): un tablero de tono y brillo y una tira de grises, para tocar o
 * arrastrar. Se prueban solas (controls.test.ts).
 */

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Cuántos decimales tiene el paso (0.05 → 2), para que el valor no quede como 0.30000000000000004. */
function decimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** Un valor dentro del rango y en su paso (como el de un <input type="range">). */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  const n = Math.round((Math.min(max, Math.max(min, v)) - min) / step);
  const out = Number((min + n * step).toFixed(decimals(step)));
  return Math.min(max, out);
}

/** El valor del control donde está el dedo: `x` desde la izquierda de un riel de `width` puntos. */
export function sliderValue(x: number, width: number, min: number, max: number, step: number): number {
  if (!(width > 0)) return min;
  return snapToStep(min + clamp01(x / width) * (max - min), min, max, step);
}

/** Dónde va la bolita del control (0 a 1 del riel). */
export function sliderFraction(v: number, min: number, max: number): number {
  return max > min ? clamp01((v - min) / (max - min)) : 0;
}

/**
 * Cuánto sube o baja con el lector de pantalla (deslizar arriba o abajo): un veinteavo del rango, en su paso (de a uno
 * sería muy lento en el ángulo).
 */
export function sliderNudge(min: number, max: number, step: number): number {
  return Math.max(step, snapToStep(min + (max - min) / 20, min, max, step) - min);
}

// ---------- «Otro color» ----------

/** El tono de cada borde del tablero, de izquierda a derecha (rojo, amarillo, verde, celeste, azul, morado, rojo). */
export const BOARD_HUES: readonly string[] = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];

/**
 * Arriba y abajo del tablero, cuánto blanco y cuánto negro lleva el color: arriba casi blanco, en el medio el color
 * puro y abajo casi negro (con un poco de color en las dos puntas, así no se repiten los de la tira de grises).
 */
export const BOARD_EDGE = 0.84;

/** El color puro de ese tono (0 a 1 del ancho), como lo pinta el degradado de BOARD_HUES. */
export function boardHue(x: number): string {
  const t = clamp01(x) * (BOARD_HUES.length - 1);
  const i = Math.min(BOARD_HUES.length - 2, Math.floor(t));
  return mixColors(BOARD_HUES[i], BOARD_HUES[i + 1], t - i);
}

/**
 * El color del tablero en ese punto (0 a 1 desde arriba a la izquierda): el tono de izquierda a derecha y el brillo de
 * arriba (claro) hacia abajo (oscuro). Es lo mismo que pinta el teléfono (el degradado de los tonos y encima el de
 * blanco a negro), así lo que se toca es lo que se ve.
 */
export function boardColor(x: number, y: number): string {
  const pure = boardHue(x);
  const t = clamp01(y);
  return t <= 0.5 ? mixColors(pure, '#ffffff', BOARD_EDGE * (1 - t * 2)) : mixColors(pure, '#000000', BOARD_EDGE * (t * 2 - 1));
}

/** El gris de la tira (0 a 1 del ancho): de blanco a negro. */
export function grayColor(x: number): string {
  return mixColors('#ffffff', '#000000', clamp01(x));
}

/** Tono, cuánto color tiene (de 0, un gris, a 1) y luz, de 0 a 1. */
function hcl(hex: string): { h: number; c: number; l: number } {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, c: 0, l };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, c: d, l };
}

/** Con menos color que esto (casi gris, como el negro de las bolas) va en la tira de grises. */
const GRAY_UNDER = 0.1;

/**
 * Dónde se marca un color (el que tiene ahora): en el tablero (x, y de 0 a 1) o en la tira de grises (solo x). Un color
 * que no está tal cual (uno escrito con el código) se marca en el punto que más se le parece. null si no es un color.
 */
export function colorSpot(value: string | null | undefined): { on: 'board'; x: number; y: number } | { on: 'gray'; x: number } | null {
  const hex = cleanColor(value);
  if (!hex) return null;
  const { h, c, l } = hcl(hex);
  if (c < GRAY_UNDER) return { on: 'gray', x: clamp01(1 - l) };
  // La luz del tablero va de 0.5 + BOARD_EDGE / 2 (arriba) a 0.5 - BOARD_EDGE / 2 (abajo).
  const y = clamp01(0.5 - (l - 0.5) / BOARD_EDGE);
  return { on: 'board', x: clamp01(h), y };
}
