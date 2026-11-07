/**
 * La animación de desbloqueo (docs/insignias.md §4.8) cuadro por cuadro, para donde no hay CSS (la app del teléfono:
 * movil/src/components/badges/Insignia.tsx). Son los mismos @keyframes de index.css (bd-all, bd-out, bd-in, bd-band,
 * bd-ribbon, bd-part y bd-fade), con sus tiempos y sus curvas, sobre las capas que marca paint.ts. Sin React, con
 * pruebas en motion.test.ts.
 */
import { CALM_MS, UNLOCK_MS } from '../../badges/visual/UnlockInsignia';

export { CALM_MS, UNLOCK_MS, UNLOCK_VIBRATION, VIBRATE_AT_MS } from '../../badges/visual/UnlockInsignia';

type Ease = (x: number) => number;

/** cubic-bezier(x1, y1, x2, y2) de CSS. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < x) lo = mid;
      else hi = mid;
    }
    return by((lo + hi) / 2);
  };
}

/** `ease`, la curva de CSS cuando el @keyframes no dice otra. */
const EASE = cubicBezier(0.25, 0.1, 0.25, 1);
const EASE_IN = cubicBezier(0.42, 0, 1, 1);
const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
/** El brinco de bd-all (crece de 0.92 a 1.10). */
const BOUNCE = cubicBezier(0.34, 1.56, 0.64, 1);

/** Un paso de un @keyframes: en qué parte (0 a 1), el valor y la curva hasta el paso que sigue. */
type Step = readonly [at: number, value: number, ease?: Ease];

/** El valor de una propiedad en `p` (0 a 1), como la interpola el navegador entre sus pasos. */
export function track(steps: readonly Step[], p: number): number {
  if (p <= steps[0][0]) return steps[0][1];
  for (let i = 0; i < steps.length - 1; i++) {
    const [a, va, ease = EASE] = steps[i];
    const [b, vb] = steps[i + 1];
    if (p <= b) return b === a ? vb : va + (vb - va) * ease((p - a) / (b - a));
  }
  return steps[steps.length - 1][1];
}

// Los @keyframes de index.css (en partes de 1300 ms).
const ALL_SCALE: readonly Step[] = [
  [0, 1, EASE_IN],
  [0.192, 0.92, BOUNCE],
  [0.38, 1.1, EASE_IN_OUT],
  [0.5, 1],
  [1, 1],
];
const OUT: readonly Step[] = [
  [0, 1],
  [0.192, 1],
  [0.5, 0],
  [1, 0],
];
const IN: readonly Step[] = [
  [0, 0],
  [0.192, 0],
  [0.5, 1],
  [1, 1],
];
const BAND_X: readonly Step[] = [
  [0, -120],
  [0.346, -120],
  [0.808, 130],
  [1, 130],
];
const BAND_OPACITY: readonly Step[] = [
  [0, 0],
  [0.346, 0],
  [0.37, 0.55],
  [0.78, 0.55],
  [0.808, 0],
  [1, 0],
];
const RIBBON_X: readonly Step[] = [
  [0, 0],
  [0.5, 0],
  [0.73, 1],
  [1, 1],
];
const PART_OPACITY: readonly Step[] = [
  [0, 0],
  [0.46, 0],
  [0.54, 1],
  [1, 0],
];
/** Cuánto salió una partícula (de su lugar y a 0.3, hasta --dx, --dy y a 1). */
const PART_MOVE: readonly Step[] = [
  [0, 0],
  [0.46, 0],
  [1, 1],
];

/** Lo que cambia en una capa en un cuadro: su opacidad y su transformación (en las unidades del viewBox). */
export interface Frame {
  opacity?: number;
  transform?: string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Escalar alrededor del centro de la capa (sx 0 no se dibuja bien en todos los teléfonos: un poquito más). */
const scaleAbout = ([cx, cy]: readonly [number, number], sx: number, sy = sx, dx = 0, dy = 0) =>
  `translate(${r3(cx + dx)} ${r3(cy + dy)}) scale(${r3(Math.max(sx, 0.001))} ${r3(Math.max(sy, 0.001))}) translate(${-cx} ${-cy})`;

/**
 * Cómo va una capa a los `ms` de empezar. `calm` (movimiento reducido o la app en segundo plano): solo el fundido de
 * 200 ms de la insignia, sin brillo, cinta, partículas ni brinco. null si la capa no se mueve.
 */
export function unlockFrame(layer: { cls?: string; center?: readonly [number, number]; drift?: readonly [number, number] }, ms: number, calm: boolean): Frame | null {
  const center = layer.center ?? [64, 64];
  if (calm) {
    switch (layer.cls) {
      case 'bd-a-on':
        return { opacity: r3(track([[0, 0], [1, 1]], ms / CALM_MS)) };
      case 'bd-a-lock':
      case 'bd-a-band':
      case 'bd-a-part':
        return { opacity: 0 };
      default:
        return null;
    }
  }
  const p = Math.max(0, Math.min(1, ms / UNLOCK_MS));
  switch (layer.cls) {
    case 'bd-a-all':
      return { transform: scaleAbout(center, track(ALL_SCALE, p)) };
    case 'bd-a-lock':
      return { opacity: r3(track(OUT, p)) };
    case 'bd-a-on':
      return { opacity: r3(track(IN, p)) };
    case 'bd-a-band':
      return { opacity: r3(track(BAND_OPACITY, p)), transform: `translate(${r3(track(BAND_X, p))} 0)` };
    case 'bd-a-ribbon':
      return { transform: scaleAbout(center, track(RIBBON_X, p), 1) };
    case 'bd-a-part': {
      const k = track(PART_MOVE, p);
      const [dx, dy] = layer.drift ?? [0, 0];
      return { opacity: r3(track(PART_OPACITY, p)), transform: scaleAbout(center, 0.3 + 0.7 * k, 0.3 + 0.7 * k, dx * k, dy * k) };
    }
    default:
      return null;
  }
}

/** Cuánto dura: 1.3 s, o 200 ms la calmada. */
export const unlockDuration = (calm: boolean): number => (calm ? CALM_MS : UNLOCK_MS);
