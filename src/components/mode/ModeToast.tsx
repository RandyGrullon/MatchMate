import { useSyncExternalStore } from 'react';
import { Leaf, Zap } from 'lucide-react';
import { useMode } from '../../lib/useMode';
import { cx } from '../ui';
import { MODE_TOAST_COPY, hideModeToast, modeToastSnapshot, subscribeModeToast } from './toast';

export { MODE_TOAST_COPY, MODE_TOAST_MS, announceMode, hideModeToast, modeToastSnapshot, useSwitchMode } from './toast';

/**
 * El aviso de abajo al cambiar de modo: «Modo Pro activado · Ahora ves todos tus números y el detalle · Deshacer». Se
 * anuncia desde donde se cambia (Yo, la hoja del modo, «Probar Pro») y lo dibuja ModeToast (en el marco de la app), así
 * sigue a la vista aunque la pantalla cambie. «Deshacer» vuelve al modo de antes.
 */

/** El aviso (una vez, en el marco de la app): oscuro en claro y claro en oscuro, encima de la barra de abajo. */
export function ModeToast() {
  const s = useSyncExternalStore(subscribeModeToast, modeToastSnapshot, modeToastSnapshot);
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
