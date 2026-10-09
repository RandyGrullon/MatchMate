import { useLayoutEffect, type RefObject } from 'react';

/** El cuadro de texto crece con lo que se escribe (hasta `maxPx`; de ahí se desliza por dentro). */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxPx = 320) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, maxPx)}px`;
    el.style.overflowY = full > maxPx ? 'auto' : 'hidden';
  }, [ref, value, maxPx]);
}

/** Lo que se escribía y no se mandó (en el teléfono; si el almacenamiento no está, no pasa nada). */
export function readDraft(key: string | null): string {
  if (!key) return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(key: string | null, text: string) {
  if (!key) return;
  try {
    if (text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    // almacenamiento no disponible (privado, lleno): el borrador solo vive mientras la hoja está abierta
  }
}
