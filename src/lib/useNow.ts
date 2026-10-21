import { useEffect, useState } from 'react';

/** La hora actual: se refresca cada minuto y al volver a la app (para que "en juego" aparezca solo). */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, everyMs);
    // En la app del teléfono no hay `document`: volver a la app se oye por `window` ('focus', movil/src/platform/network.ts).
    if (typeof document === 'undefined') {
      const w = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
      w?.addEventListener('focus', tick);
      return () => {
        clearInterval(timer);
        w?.removeEventListener('focus', tick);
      };
    }
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [everyMs]);
  return now;
}
