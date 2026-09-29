import { useEffect, useSyncExternalStore } from 'react';

/**
 * El aviso al ganar una insignia se aguanta mientras hay una pantalla que no se debe tapar (§6.4): el modo cancha,
 * la tarjeta de golf en el campo o un marcador en vivo. Esas pantallas llaman `useHoldBadgeUnlock()`; el aviso sale
 * cuando se cierran. También se aguanta con otro modal abierto o en pantalla completa (lo revisa `blockedNow`).
 */

let holds = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of [...listeners]) l();
};

/** Aguanta el aviso mientras la pantalla esté abierta. */
export function useHoldBadgeUnlock(active = true) {
  useEffect(() => {
    if (!active) return;
    holds++;
    emit();
    return () => {
      holds--;
      emit();
    };
  }, [active]);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const held = () => holds > 0;

/** Alguna pantalla pide aguantar el aviso. */
export const useBadgeUnlockHeld = (): boolean => useSyncExternalStore(subscribe, held, () => false);

/** Hay otro modal abierto (un `<dialog>` o un tour) o la app está en pantalla completa. */
export function blockedNow(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!doc) return true;
  if (doc.fullscreenElement) return true;
  return !!doc.querySelector('dialog[open]:not([data-badge-unlock]), [role="dialog"][aria-modal="true"]:not([data-badge-unlock])');
}

/**
 * ¿Puede salir el aviso al ganar? No mientras la cuenta tiene pendiente «¿Tienes 18 años?» (AdultGate): esa pregunta
 * no se tapa con una celebración.
 */
export const unlockGateOpen = (auth: { user: unknown; needsAdult?: boolean }): boolean => !(auth.user && auth.needsAdult);
