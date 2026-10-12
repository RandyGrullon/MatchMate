import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BellPlus, Check } from 'lucide-react';
import { getUserId } from '../../lib/data/client';
import { setSquadFollowing, squadErrorText } from '../../lib/data/squads';
import { BusyIcon } from '../busy';
import { useFeedback } from '../feedback';
import { cx } from '../ui';

/**
 * Seguir / Siguiendo un equipo (como LeagueFollowButton): sus publicaciones salen en tu Social. El cambio se ve al
 * momento y se queda hasta que llega lo del servidor; si falla, sale el error y vuelve lo de antes. Sin cuenta, lleva a
 * entrar. Quien lo usa decide si se muestra (nunca a sus miembros: ellos ya lo ven).
 */
export function SquadFollowButton({
  squadId,
  following,
  name,
  size = 'md',
  className,
}: {
  squadId: string;
  following: boolean;
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<boolean | null>(null);
  const on = shown ?? following;

  // Lo que se tocó se ve hasta que la lista nueva (o la página del equipo) dice lo mismo.
  useEffect(() => {
    if (!busy && shown !== null && following === shown) setShown(null);
  }, [busy, following, shown]);

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
      const res = await setSquadFollowing(squadId, next);
      setShown(res.following);
      toast(res.following ? `Sigues a ${name ?? 'este equipo'}: sus publicaciones salen en Social` : `Ya no sigues a ${name ?? 'este equipo'}`);
    } catch (e) {
      setShown(null);
      toast(squadErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={on}
      aria-busy={busy || undefined}
      aria-label={name ? `${on ? 'Dejar de seguir' : 'Seguir'} ${name}` : undefined}
      title={on ? 'Toca para dejar de seguir' : 'Sus publicaciones salen en tu Social'}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-11 px-3 text-sm sm:h-9' : 'h-11 px-5 text-sm',
        on ? 'border border-line bg-surface text-fg hover:bg-surface-2' : 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
        busy && 'opacity-80',
        className,
      )}
    >
      <BusyIcon busy={busy} icon={on ? <Check className="size-4" aria-hidden="true" /> : <BellPlus className="size-4" aria-hidden="true" />} />
      {on ? 'Siguiendo' : 'Seguir'}
    </button>
  );
}
