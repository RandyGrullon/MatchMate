import type { Ball } from '../../lib/balls';
import {
  ballDesignColors,
  cleanStickerText,
  defaultBallDesign,
  normalizeBallDesign,
  nudgeSticker,
  sameBallDesign,
  stickerLabel,
  stickerStartText,
  type BallDesign,
  type BallSticker,
  type BallStickerShape,
} from '../../lib/ballDesign';
import { ballArtMetrics } from './BallArt';

/**
 * Las cuentas del creador de bolas («Diseñar», BallDesigner.tsx), sin React: qué se guarda, si cambió algo, dónde tocó
 * el dedo sobre la bola, qué figura hay ahí y dónde va el aro de la figura elegida. Se prueban solas (designer.test.ts).
 */

/** Las pestañas del creador. */
export type DesignTab = 'colores' | 'dibujo' | 'figuras';

/** Qué color del diseño se está cambiando. */
export type ColorSlot = 'base' | 'second' | 'third';

/** Los tres colores del diseño: el nombre corto (el botón) y el largo (la paleta). */
export const COLOR_SLOTS: readonly { key: ColorSlot; label: string; title: string }[] = [
  { key: 'base', label: 'Base', title: 'Color base' },
  { key: 'second', label: 'Segundo', title: 'Segundo color' },
  { key: 'third', label: 'Tercero', title: 'Tercer color' },
];

/** El color de ese lugar tal como se dibuja (el automático si es null). */
export function slotColor(d: Pick<BallDesign, 'base' | 'second' | 'third'>, slot: ColorSlot): string {
  return ballDesignColors(d)[slot];
}

/** Pone el color de ese lugar (null = automático; la base nunca queda sin color). */
export function withSlotColor(d: BallDesign, slot: ColorSlot, hex: string | null): BallDesign {
  if (slot === 'base') return hex ? { ...d, base: hex } : d;
  return { ...d, [slot]: hex };
}

/**
 * Lo que se guarda: null si queda igual que la bola sin diseño (su color y su cubierta; así sigue a la cubierta si se
 * cambia) y si no, el diseño arreglado (normalizeBallDesign).
 */
export function designToSave(draft: unknown, ball: Pick<Ball, 'color' | 'cover'>): BallDesign | null {
  const next = normalizeBallDesign(draft, ball.color);
  return sameBallDesign(next, defaultBallDesign(ball.color, ball.cover)) ? null : next;
}

/** ¿Guardarlo cambia algo en la base? Si no, «Guardar» solo cierra. */
export function designNeedsSave(draft: unknown, ball: Pick<Ball, 'design' | 'color' | 'cover'>): boolean {
  const next = designToSave(draft, ball);
  if (next === null) return ball.design != null;
  return ball.design == null || !sameBallDesign(next, ball.design) || ball.color !== next.base;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Dónde tocó el dedo sobre la vista previa, en radios de la bola (-1 a 1, como `x` e `y` de una figura): `px` y `py`
 * desde la esquina de arriba a la izquierda de una caja de `w` × `h` píxeles con la bola dibujada a `size` (BallArt). Lo
 * de afuera de la bola queda en su borde (una figura en la esquina no se vería).
 */
export function tapToBall(px: number, py: number, w: number, h: number, size: number): { x: number; y: number } {
  const r = ballArtMetrics(size).radius;
  let x = ((px / w) * 100 - 50) / r;
  let y = ((py / h) * 100 - 50) / r;
  const d = Math.hypot(x, y);
  if (d > 0.95) {
    x *= 0.95 / d;
    y *= 0.95 / d;
  }
  return { x: round2(x), y: round2(y) };
}

/** La figura que está en ese punto (la de más arriba), o null. Una chica se toca igual (al menos 0.15 de radio). */
export function stickerAt(stickers: readonly Pick<BallSticker, 'x' | 'y' | 'size'>[], p: { x: number; y: number }): number | null {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    if (Math.hypot(s.x - p.x, s.y - p.y) <= Math.max(s.size, 0.15)) return i;
  }
  return null;
}

/** Lo que hace un toque sobre la bola: elegir la figura `pick`, poner la figura `move` en (x, y) o nada. */
export type BallTap = { pick: number } | { move: number; x: number; y: number } | null;

/**
 * Qué hace tocar la bola en `p` (tapToBall). `placing` = en «Figuras» con la figura `picked` elegida: tocar otra figura
 * la elige (no le pone la elegida encima); tocar la elegida o la bola donde no hay otra pone la elegida ahí. Si no, se
 * elige la figura que se tocó (o nada, si no hay).
 */
export function ballTap(
  stickers: readonly Pick<BallSticker, 'x' | 'y' | 'size'>[],
  picked: number | null,
  p: { x: number; y: number },
  placing: boolean,
): BallTap {
  const hit = stickerAt(stickers, p);
  if (placing && picked != null && picked >= 0 && picked < stickers.length && (hit === null || hit === picked)) return { move: picked, x: p.x, y: p.y };
  return hit === null ? null : { pick: hit };
}

/**
 * Lo que se le dice antes de «Restablecer» (se pierde lo que tiene el borrador), o null si ya está como sin diseño y no
 * hay nada que perder (el botón no se puede tocar).
 */
export function resetWarning(draft: BallDesign, plain: BallDesign): string | null {
  if (sameBallDesign(draft, plain)) return null;
  const n = draft.stickers.length;
  const stickers = n === 0 ? '' : n === 1 ? ' y se le quita la figura' : ` y se le quitan las ${n} figuras`;
  return `Vuelve a como se ve sin diseño (de su color)${stickers}. Lo que cambiaste aquí se pierde; no se guarda hasta que toques «Guardar».`;
}

/**
 * Mueve una figura (flechas) sin sacarla de la bola: si el centro quedaría afuera del círculo, queda en su borde.
 */
export function moveSticker(s: BallSticker, dx: number, dy: number): BallSticker {
  const moved = nudgeSticker(s, dx, dy);
  const d = Math.hypot(moved.x, moved.y);
  // Hacia el centro (trunc), así redondear no la vuelve a sacar.
  const toward = (v: number) => Math.trunc((v / d) * 1000) / 1000;
  return d > 1 ? { ...moved, x: toward(moved.x), y: toward(moved.y) } : moved;
}

/** Cuánto se mueve con cada flecha (en radios de la bola). */
export const STICKER_STEP = 0.1;

/**
 * El aro que marca la figura elegida sobre la vista previa, en % de la caja: el centro (left, top) y el diámetro (un
 * poco más grande que la figura; nunca menos de 12 %, para verlo).
 */
export function stickerRing(s: Pick<BallSticker, 'x' | 'y' | 'size'>, size: number): { left: number; top: number; diameter: number } {
  const r = ballArtMetrics(size).radius;
  return { left: round2(50 + s.x * r), top: round2(50 + s.y * r), diameter: round2(Math.max(12, 2 * s.size * r * 1.15)) };
}

/** «Estrella», «Número 7», «Iniciales AMP» (el texto limpio, como en la bola). */
export function stickerName(s: Pick<BallSticker, 'shape' | 'text'>): string {
  const text = cleanStickerText(s.shape, s.text);
  return text ? `${stickerLabel(s.shape)} ${text}` : stickerLabel(s.shape);
}

/**
 * El texto de la figura nueva de esa forma: el número 7 y las iniciales de la cuenta, o «AB» (stickerStartText). El
 * botón para agregarla lo muestra y «agregar» lo usa, así sale en la bola lo mismo que se veía en el botón.
 */
export function sampleText(shape: BallStickerShape, initials: string): string | undefined {
  return stickerStartText(shape, shape === 'iniciales' ? initials : null);
}

/** «100 %», para los controles de tamaño y suavidad. */
export const percent = (v: number) => `${Math.round(v * 100)} %`;
