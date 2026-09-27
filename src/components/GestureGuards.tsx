import { useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router';
import { useFeedback } from './feedback';

/** App instalada (pantalla de inicio), no una pestaña del navegador. */
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Solo en Android el gesto de atrás del sistema cierra la app (en la computadora Esc no debe avisar nada). */
const isAndroid = () => /Android/i.test(navigator.userAgent);

const historyIdx = () => (history.state as { idx?: number } | null)?.idx ?? 0;

/**
 * En el iPhone con la app instalada, deslizar desde el borde va atrás/adelante por el historial y
 * Apple no deja apagarlo. Si la app no agrega entradas al historial, el gesto no tiene a dónde ir:
 * se navega en memoria y la dirección se mantiene al día con replaceState (sirve para compartir y recargar).
 */
export function AppRouter({ children }: { children: ReactNode }) {
  if (standalone() && isIOS()) {
    return (
      <MemoryRouter initialEntries={[location.pathname + location.search]}>
        <KeepUrlInSync />
        {children}
      </MemoryRouter>
    );
  }
  return (
    <BrowserRouter>
      <ExitGuard />
      {children}
    </BrowserRouter>
  );
}

function KeepUrlInSync() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const url = pathname + search;
    if (location.pathname + location.search !== url) history.replaceState(history.state, '', url);
  }, [pathname, search]);
  return null;
}

interface CloseWatcherLike {
  addEventListener(type: 'close', listener: () => void): void;
  destroy(): void;
}
type CloseWatcherCtor = new () => CloseWatcherLike;

/**
 * Android, app instalada, en la primera pantalla: el gesto de atrás del sistema cerraría la app.
 * No se puede apagar (es del sistema), pero se puede atajar una vez: "Desliza otra vez para salir".
 * Dentro de la app (con páginas atrás) no hace nada y atrás funciona normal.
 */
function ExitGuard() {
  const { toast } = useFeedback();
  const location = useLocation();
  const watcher = useRef<CloseWatcherLike | null>(null);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const Ctor = (window as unknown as { CloseWatcher?: CloseWatcherCtor }).CloseWatcher;
    if (!Ctor || !standalone() || !isAndroid()) return;
    // React Router guarda la posición en el historial: 0 = primera pantalla de la app.
    const atRoot = historyIdx() === 0;

    const disarm = () => {
      watcher.current?.destroy();
      watcher.current = null;
    };
    const arm = () => {
      if (watcher.current) return;
      try {
        const w = new Ctor();
        w.addEventListener('close', () => {
          watcher.current = null;
          toast('Desliza otra vez para salir');
          // Si vuelve a deslizar en estos segundos, sale; si no, se vuelve a atajar.
          // Con un modal abierto se espera a que cierre: atrás primero debe cerrar el modal.
          const rearm = () => {
            cooldown.current = null;
            if (historyIdx() !== 0) return;
            if (document.querySelector('dialog[open]')) cooldown.current = setTimeout(rearm, 1000);
            else arm();
          };
          cooldown.current = setTimeout(rearm, 2500);
        });
        watcher.current = w;
      } catch {
        // el navegador no dejó crear otro (límite contra abusos): atrás funciona normal
      }
    };

    if (atRoot && !cooldown.current) arm();
    if (!atRoot) disarm();
  }, [location, toast]);

  useEffect(
    () => () => {
      watcher.current?.destroy();
      watcher.current = null;
      if (cooldown.current) clearTimeout(cooldown.current);
      cooldown.current = null;
    },
    [],
  );
  return null;
}
