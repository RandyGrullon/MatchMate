import { useSyncExternalStore } from 'react';
import type { UiMode } from '../../lib/mode';

/**
 * La hoja «Elige cómo ver la app» (`8-modo.png`) abierta desde cualquier pantalla: el primer toque en «Pro» (el selector
 * de Yo o «Probar Pro» de un aviso) la abre con Pro marcado, para comparar antes de cambiar; desde ahí se cambia (con
 * «Modo Pro activado · Deshacer») o se sigue en Lite. Ya vista, el selector cambia al momento. Se recuerda por cuenta en
 * el teléfono (`mm:modo-hoja:<cuenta>`). La dibuja ModeSheetHost, en el marco de la app.
 */

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export const modeSheetKey = (uid: string) => `mm:modo-hoja:${uid}`;

function storage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Vistas en esta sesión (si el teléfono no guarda nada, vale mientras la app esté abierta). */
const seenNow = new Set<string>();

/** ¿Ya vio la hoja del modo esta cuenta (en este teléfono)? */
export function modeSheetSeen(uid: string | null | undefined, store: KV | null = storage()): boolean {
  if (!uid) return true;
  if (seenNow.has(uid)) return true;
  try {
    return store?.getItem(modeSheetKey(uid)) === '1';
  } catch {
    return false;
  }
}

/** La vio: los próximos toques en «Pro» cambian al momento. */
export function markModeSheetSeen(uid: string | null | undefined, store: KV | null = storage()): void {
  if (!uid) return;
  seenNow.add(uid);
  try {
    store?.setItem(modeSheetKey(uid), '1');
  } catch {
    // privado o lleno: vale mientras la app esté abierta
  }
}

// ---------- Abierta o no (la comparten todas las pantallas) ----------

let opened: { initial: UiMode } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Abre la hoja con `initial` marcado (y queda vista para esa cuenta). */
export function openModeSheet(initial: UiMode, uid?: string | null): void {
  markModeSheetSeen(uid);
  opened = { initial };
  emit();
}

export function closeModeSheet(): void {
  if (!opened) return;
  opened = null;
  emit();
}

/** Lo que se ve ahora (null: cerrada). */
export const modeSheetSnapshot = () => opened;

export function useModeSheetState(): { initial: UiMode } | null {
  return useSyncExternalStore(subscribe, modeSheetSnapshot, modeSheetSnapshot);
}

/**
 * Qué pasa al elegir un modo desde el selector de Yo o «Probar Pro»: la primera vez que se elige Pro, abrir la hoja
 * (`'sheet'`); si no, cambiar al momento (`'switch'`). Lite siempre cambia al momento.
 */
export function pickAction(next: UiMode, seen: boolean): 'sheet' | 'switch' {
  return next === 'pro' && !seen ? 'sheet' : 'switch';
}

/** Solo pruebas. */
export function resetModeSheetForTests(): void {
  seenNow.clear();
  opened = null;
  listeners.clear();
}
