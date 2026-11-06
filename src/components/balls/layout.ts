import { LAYOUT_INCHES_MAX, type BallLayout } from '../../lib/balls';

/*
 * «Perforación» en la hoja de una bola, sin la pantalla: lo usan BallLayoutFields.tsx de la web (que lo reexporta) y la
 * hoja de la app del teléfono (movil/src/components/balls/BallLayoutFields.tsx).
 */

/**
 * La perforación con ese valor cambiado: sin la clave si queda vacía; null si no queda nada (así, sin cambios, es igual
 * a la de antes). Las notas se guardan como se escriben (se recortan al guardar).
 */
export function editLayout(l: BallLayout | null | undefined, k: keyof BallLayout, v: number | string | undefined): BallLayout | null {
  const next: Record<string, unknown> = { ...(l ?? {}) };
  if (v === undefined || v === '') delete next[k];
  else next[k] = v;
  return Object.keys(next).length ? (next as BallLayout) : null;
}

/** Las pulgadas enteras para elegir (0 a 7). */
export const LAYOUT_WHOLE_INCHES: readonly number[] = Array.from({ length: LAYOUT_INCHES_MAX + 1 }, (_, i) => i);

/** Un ángulo como se escribe: solo cifras (lo demás se quita); undefined si no queda ninguna. */
export function angleFromText(text: string): number | undefined {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}
