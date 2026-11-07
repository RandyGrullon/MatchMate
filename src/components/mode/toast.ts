import { useCallback } from 'react';
import type { UiMode } from '../../lib/mode';
import { useMode } from '../../lib/useMode';

/**
 * El aviso de abajo al cambiar de modo («Modo Pro activado · Ahora ves todos tus números y el detalle · Deshacer»), sin
 * pantalla: lo anuncian el selector de Yo, la hoja del modo y «Probar Pro»/«Usar Pro», y lo dibuja ModeToast en la web
 * (src/components/mode/ModeToast.tsx) y en la app del teléfono. «Deshacer» vuelve al modo de antes.
 */

export interface ModeToastShown {
  id: number;
  from: UiMode;
  to: UiMode;
}

/** Cuánto se ve (luego se va solo). */
export const MODE_TOAST_MS = 6000;

let shown: ModeToastShown | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export const subscribeModeToast = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** Lo que dice el aviso de cada modo. */
export const MODE_TOAST_COPY: Record<UiMode, { title: string; text: string }> = {
  pro: { title: 'Modo Pro activado', text: 'Ahora ves todos tus números y el detalle' },
  lite: { title: 'Modo Lite activado', text: 'Ves lo esencial. Pro sigue en Yo' },
};

/** Lo que se ve ahora (null: nada). */
export const modeToastSnapshot = (): ModeToastShown | null => shown;

/** Muestra el aviso del cambio de `from` a `to` (nada si es el mismo modo). */
export function announceMode(from: UiMode, to: UiMode, ms = MODE_TOAST_MS): void {
  if (from === to) return;
  shown = { id: Date.now(), from, to };
  clearTimeout(timer);
  timer = setTimeout(hideModeToast, ms);
  emit();
}

/** Quita el aviso. */
export function hideModeToast(): void {
  clearTimeout(timer);
  if (!shown) return;
  shown = null;
  emit();
}

/** Cambia el modo y lo anuncia con «Deshacer» (lo usan el selector de Yo, la hoja del modo y «Probar Pro»). */
export function useSwitchMode(): (next: UiMode) => Promise<unknown> {
  const { mode, setMode } = useMode();
  return useCallback(
    async (next: UiMode) => {
      if (next === mode) return;
      announceMode(mode, next);
      return setMode(next);
    },
    [mode, setMode],
  );
}
