import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BellPlus, Check } from 'lucide-react';
import { getUserId } from '../../lib/data/client';
import { setLeagueFollowing } from '../../lib/data/leagueSocial';
import { BusyIcon } from '../busy';
import { saveErrorMessage, useFeedback } from '../feedback';
import { cx } from '../ui';

/**
 * Seguir / Siguiendo una liga pública: sus publicaciones salen en tu feed de Social. El cambio se ve al momento y, si
 * falla, sale el error y vuelve lo del servidor. Sin cuenta, lleva a entrar. Quien lo usa decide si se muestra (solo
 * cuando `canFollow` o ya la sigue: nunca a sus miembros).
 */
export function LeagueFollowButton({
  leagueId,
  following,
  name,
  size = 'md',
  className,
}: {
  leagueId: string;
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
      await setLeagueFollowing(leagueId, next);
      toast(next ? `Sigues ${name ?? 'la liga'}: sus publicaciones salen en Social` : `Ya no sigues ${name ?? 'la liga'}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setShown(null);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-busy={busy}
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
