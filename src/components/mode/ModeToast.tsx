import { useCallback, useSyncExternalStore } from 'react';
import { Leaf, Zap } from 'lucide-react';
import type { UiMode } from '../../lib/mode';
import { useMode } from '../../lib/useMode';
import { cx } from '../ui';

/**
 * El aviso de abajo al cambiar de modo: «Modo Pro activado · Ahora ves Organizar y todos tus números · Deshacer». Se
 * anuncia desde donde se cambia (Yo, la hoja del modo, «Probar Pro») y lo dibuja ModeToast (en el marco de la app), así
 * sigue a la vista aunque la pantalla cambie. «Deshacer» vuelve al modo de antes.
 */

interface Shown {
  id: number;
  from: UiMode;
  to: UiMode;
}

/** Cuánto se ve (luego se va solo). */
export const MODE_TOAST_MS = 6000;

let shown: Shown | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** Lo que dice el aviso de cada modo. */
export const MODE_TOAST_COPY: Record<UiMode, { title: string; text: string }> = {
  pro: { title: 'Modo Pro activado', text: 'Ahora ves Organizar y todos tus números' },
  lite: { title: 'Modo Lite activado', text: 'Ves lo esencial. Pro sigue en Yo' },
};

/** Lo que se ve ahora (null: nada). */
export const modeToastSnapshot = (): Shown | null => shown;

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

/** El aviso (una vez, en el marco de la app): oscuro en claro y claro en oscuro, encima de la barra de abajo. */
export function ModeToast() {
  const s = useSyncExternalStore(subscribe, modeToastSnapshot, modeToastSnapshot);
  const { setMode } = useMode();
  if (!s) return null;
  const copy = MODE_TOAST_COPY[s.to];
  const Icon = s.to === 'pro' ? Zap : Leaf;
  return (
    <div
      role="status"
      data-mode-toast={s.to}
      className={cx(
        'animate-fade-up fixed inset-x-3.5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-[20px] py-3 pr-2.5 pl-4',
        'bg-fg text-bg shadow-[0_12px_40px_rgb(0_0_0/0.25)] sm:bottom-6',
      )}
    >
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
        <Icon className="size-[19px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-[650]">{copy.title}</span>
        <span className="block text-[13.5px] opacity-75">{copy.text}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          hideModeToast();
          void setMode(s.from);
        }}
        className="inline-flex h-11 shrink-0 items-center rounded-xl px-3 text-[15px] font-bold text-accent-soft transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
      >
        Deshacer
      </button>
    </div>
  );
}
