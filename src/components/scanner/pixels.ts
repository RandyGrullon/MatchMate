/**
 * Leer un QR de píxeles RGBA con jsQR (sin DOM: lo usan el worker del lector, la vuelta sin worker y las pruebas).
 */
import type { Pt } from './logic';

export interface Hit {
  text: string;
  /** Las 4 esquinas del QR (arriba-izq., arriba-der., abajo-der., abajo-izq.) en px del cuadro leído. */
  corners: Pt[];
  width: number;
  height: number;
}

export type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
) => {
  data: string;
  location: { topLeftCorner: Pt; topRightCorner: Pt; bottomRightCorner: Pt; bottomLeftCorner: Pt };
} | null;

/** jsQR viene en CommonJS: según quién lo cargue, la función está en `default` o en `default.default`. */
export function unwrapJsQr(mod: unknown): JsQrFn {
  const d = (mod as { default?: unknown }).default ?? mod;
  const fn = typeof d === 'function' ? d : (d as { default?: unknown }).default;
  if (typeof fn !== 'function') throw new Error('jsQR no cargó');
  return fn as JsQrFn;
}

/**
 * Lee los píxeles con jsQR; null si no hay QR. `invert`: también QR claros sobre fondo oscuro (el doble de trabajo:
 * solo para fotos; en vivo, los de la app y casi todos son oscuros sobre blanco).
 */
export function decodePixels(jsQR: JsQrFn, data: Uint8ClampedArray, width: number, height: number, invert: boolean): Hit | null {
  const r = jsQR(data, width, height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' });
  if (!r || !r.data) return null;
  const l = r.location;
  return { text: r.data, corners: [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner], width, height };
}

/** Lo que va y vuelve del worker. */
export interface PixelsRequest {
  id: number;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  invert: boolean;
}
export interface PixelsResponse {
  id: number;
  hit: Hit | null;
}
