import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Heart } from 'lucide-react';
import { getUserId } from '../../lib/data/client';
import { optimisticLikes, setGameLike, type ProfileGame } from '../../lib/data/profileGames';
import { saveErrorMessage, useFeedback } from '../feedback';
import { cx } from '../ui';
import { compactCount, likeLabel } from './socialFormat';

/**
 * Corazón de me gusta de un juego: se llena y salta al tocarlo, y el número cambia al momento (en todas las listas:
 * lo hace la capa de datos). Si falla (sin señal, muy seguido) sale el error y vuelve lo del servidor. Sin cuenta,
 * lleva a entrar.
 */
export function LikeButton({ game, className }: { game: ProfileGame; className?: string }) {
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  // Lo que se ve mientras llega la respuesta (por si el juego no está en ninguna lista guardada).
  const [over, setOver] = useState<Pick<ProfileGame, 'likes' | 'likedByMe'> | null>(null);
  // Cambia con cada me gusta: vuelve a arrancar la animación del corazón.
  const [pop, setPop] = useState(0);
  const shown = over ?? game;
  const liked = shown.likedByMe;

  async function toggle() {
    if (busy) return;
    if (!getUserId()) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    const next = !liked;
    if (next) setPop((n) => n + 1);
    setOver(optimisticLikes(shown, next));
    setBusy(true);
    try {
      await setGameLike(game, next);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setOver(null);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggle();
      }}
      aria-pressed={liked}
      aria-busy={busy || undefined}
      aria-label={likeLabel(liked, shown.likes)}
      title={liked ? 'Quitar me gusta' : 'Me gusta'}
      className={cx(
        'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold tabular-nums transition select-none active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        liked ? 'text-danger hover:bg-danger-soft' : 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <Heart key={pop} className={cx('size-5 transition-colors', liked && 'fill-current', pop > 0 && liked && 'animate-pop')} aria-hidden="true" />
      <span aria-hidden="true">{shown.likes > 0 ? compactCount(shown.likes) : 'Me gusta'}</span>
    </button>
  );
}
