import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useBadgeNotices, type BadgeAward, type LeagueBadgeAward } from '../../lib/data/badges';
import { MODAL_OPENED } from '../ui';
import { blockedNow, useBadgeUnlockHeld } from './hold';

const UnlockModal = lazy(() => import('./UnlockModal'));

/** Espera después de abrir la app (o de cerrar lo que tapaba) antes de mostrar el aviso. */
const SETTLE_MS = 1200;
/** Cada cuánto se revisa si ya no hay otro modal abierto. */
const CHECK_MS = 2000;

interface Showing {
  awards: readonly BadgeAward[];
  leagueAwards: readonly LeagueBadgeAward[];
}

/**
 * Monta el aviso al ganar una insignia (§6.4) cuando `badge_notices` trae insignias sin ver (automáticas o del
 * creador). Se aguanta mientras la pantalla lo pide (modo cancha, tarjeta de golf: `useHoldBadgeUnlock`) u otro modal
 * está abierto. Cada insignia sale una sola vez por sesión aunque el servidor todavía no se entere de que se vio (sin
 * señal). Liviano: el aviso (y el catálogo) se cargan solo cuando hay algo que mostrar. Va una vez en App.
 */
export function BadgeUnlockHost() {
  const { user } = useAuth();
  const notices = useBadgeNotices();
  const held = useBadgeUnlockHeld();
  const seen = useRef(new Set<string>());
  const [open, setOpen] = useState<Showing | null>(null);
  const [free, setFree] = useState(false);

  const awards = user ? notices.data.awards.filter((a) => !seen.current.has(a.id)) : [];
  const leagueAwards = user ? (notices.data.leagueAwards ?? []).filter((a) => !seen.current.has(a.id)) : [];
  const waiting = awards.length + leagueAwards.length > 0 && !open && !held;

  // Revisa cada tanto si hay otro modal o pantalla completa (y al abrirse uno).
  useEffect(() => {
    if (!waiting) {
      setFree(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      if (blockedNow()) {
        setFree(false);
        timer = setTimeout(check, CHECK_MS);
      } else timer = setTimeout(() => setFree(!blockedNow()), SETTLE_MS);
    };
    check();
    window.addEventListener(MODAL_OPENED, check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(MODAL_OPENED, check);
    };
  }, [waiting]);

  useEffect(() => {
    if (!waiting || !free) return;
    for (const a of [...awards, ...leagueAwards]) seen.current.add(a.id);
    setOpen({ awards, leagueAwards });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las listas salen de `waiting`
  }, [waiting, free]);

  if (!open || !user) return null;
  return (
    <Suspense fallback={null}>
      <UnlockModal awards={open.awards} leagueAwards={open.leagueAwards} onDone={() => setOpen(null)} />
    </Suspense>
  );
}
