import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { UserCheck, UserPlus } from 'lucide-react';
import { getUserId } from '../../lib/data/client';
import { setFollowing } from '../../lib/data/follows';
import { BusyIcon } from '../busy';
import { saveErrorMessage, useFeedback } from '../feedback';
import { cx } from '../ui';

/**
 * Seguir / Siguiendo. El cambio se ve al momento (la capa de datos cambia el botón, los números y las listas) y,
 * si falla, sale el error y vuelve lo del servidor. Sin cuenta, lleva a entrar. No se muestra en tu propio perfil
 * (eso lo decide quien lo usa).
 */
export function FollowButton({
  userId,
  following,
  followsYou,
  name,
  size = 'md',
  className,
}: {
  userId: string;
  following: boolean;
  /** Él te sigue: el botón dice «Seguir también». */
  followsYou?: boolean;
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  // Lo que se ve mientras llega la respuesta (por si el perfil no está en la caché).
  const [shown, setShown] = useState<boolean | null>(null);
  const on = shown ?? following;

  async function toggle() {
    if (busy) return;
    if (!getUserId()) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    const next = !on;
    setBusy(true);
    setShown(next);
    try {
      await setFollowing(userId, next);
      if (!next && name) toast(`Ya no sigues a ${name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setShown(null);
      setBusy(false);
    }
  }

  const label = on ? 'Siguiendo' : followsYou ? 'Seguir también' : 'Seguir';
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-busy={busy}
      aria-label={name ? `${on ? 'Dejar de seguir a' : 'Seguir a'} ${name}` : undefined}
      title={on ? 'Toca para dejar de seguir' : undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-11 px-3 text-sm sm:h-9' : 'h-11 px-5 text-sm',
        on ? 'border border-line bg-surface text-fg hover:bg-surface-2' : 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
        busy && 'opacity-80',
        className,
      )}
    >
      <BusyIcon busy={busy} icon={on ? <UserCheck className="size-4" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />} />
      {label}
    </button>
  );
}
