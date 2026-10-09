import { useState } from 'react';
import { Heart } from 'lucide-react';
import { optimisticPostLikes, setPostLike, socialErrorText, type Post } from '../../lib/data/posts';
import { useFeedback } from '../feedback';
import { compactCount, likeLabel } from '../social/socialFormat';
import { cx } from '../ui';

/**
 * Corazón de me gusta de una publicación (como el de los juegos, LikeButton): se llena y salta al tocarlo y el número
 * cambia al momento en todas las listas (lo hace la capa de datos). Si falla, sale el error y vuelve lo del servidor.
 */
export function PostLikeButton({ post, className }: { post: Pick<Post, 'id' | 'likes' | 'likedByMe'>; className?: string }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  // Lo que se ve mientras llega la respuesta (por si la publicación no está en ninguna lista guardada).
  const [over, setOver] = useState<Pick<Post, 'likes' | 'likedByMe'> | null>(null);
  // Cambia con cada me gusta: vuelve a arrancar la animación del corazón.
  const [pop, setPop] = useState(0);
  const shown = over ?? post;
  const liked = shown.likedByMe;

  async function toggle() {
    if (busy) return;
    const next = !liked;
    if (next) {
      setPop((n) => n + 1);
      navigator.vibrate?.(12);
    }
    setOver(optimisticPostLikes(shown, next));
    setBusy(true);
    try {
      await setPostLike(post, next);
    } catch (e) {
      console.error(e);
      toast(socialErrorText(e, 'No se pudo guardar tu me gusta. Inténtalo otra vez.'), 'error');
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
