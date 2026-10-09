import type { CSSProperties, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleHelp, Lock, MessageCircle, Share2, Users } from 'lucide-react';
import { deletePost, type Post } from '../../lib/data/posts';
import { relativeTime } from '../../lib/notifications';
import { useNow } from '../../lib/useNow';
import { sportMeta } from '../../sports/registry';
import { Avatar } from '../Avatar';
import { useFeedback } from '../feedback';
import { atUsername, compactCount } from '../social/socialFormat';
import { userPath } from '../social/UserLink';
import { cx } from '../ui';
import { ContentMenu } from './PostMenu';
import { PostLikeButton } from './PostLikeButton';
import { PostPhoto } from './PostPhoto';
import { PostText } from './PostText';
import { firstLine, isLongText, postPath, postShareUrl, visibilityHint } from './postFormat';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const actionClass = cx(
  'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold tabular-nums text-muted transition select-none hover:bg-surface-2 hover:text-fg active:scale-95',
  focusRing,
);

/**
 * Una publicación (rediseño «Calma y foco»): quién la escribió (foto, nombre, @usuario y hace cuánto; tocar la hora
 * abre la publicación), la liga con el color de su deporte (salvo `hideLeague`, en el muro de la liga), a quién le sale
 * si no es para todos, el texto (con sus saltos de línea y los links) y la foto (con su hueco reservado; tocarla la
 * abre en grande). Abajo: me gusta, comentarios y compartir. «⋯»: reportar y bloquear (si no es tuya) y borrar (si
 * puedes). Tocar el texto abre la publicación con sus comentarios.
 *
 * `detail`: es la de su pantalla (el texto va entero y no se abre otra vez). `onComment`: qué hace «Comentar» (ahí, ir
 * a la caja); si no, abre la publicación. `onGone`: se borró o bloqueaste a quien la escribió.
 */
export function PostCard({
  post,
  hideLeague,
  detail,
  onComment,
  onGone,
}: {
  post: Post;
  hideLeague?: boolean;
  detail?: boolean;
  onComment?: () => void;
  onGone?: () => void;
}) {
  const navigate = useNavigate();
  const now = useNow();
  const author = post.author;
  const name = author.name.trim() || 'Alguien';
  const handle = atUsername(author.username);
  const hint = visibilityHint(post.visibility);
  const long = !detail && isLongText(post.text);
  const at = Date.parse(post.at);
  const when = Number.isFinite(at) ? relativeTime(at, now.getTime()) : '';
  const fullDate = Number.isFinite(at) ? new Date(at).toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' }) : undefined;
  const path = postPath(post.id);

  function openFromText(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('a,button')) return;
    // Seleccionando texto para copiarlo no se abre.
    if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
    navigate(path);
  }

  return (
    <article className="card-shadow flex flex-col rounded-3xl bg-surface" data-post={post.id} aria-label={`Publicación de ${name}`}>
      <header className="flex items-start gap-3 pt-3.5 pr-2 pl-4">
        <Link to={userPath(author.id)} aria-label={`Perfil de ${name}`} className={cx('-m-0.5 shrink-0 rounded-full p-0.5 active:opacity-80', focusRing)}>
          <Avatar name={name} photo={author.avatar} className="size-10 text-sm" />
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <Link to={userPath(author.id)} className={cx('truncate font-semibold hover:underline', focusRing)}>
              {name}
            </Link>
            {handle && <span className="truncate text-sm text-muted">{handle}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
            {detail ? (
              <time dateTime={post.at} title={fullDate}>
                {when}
              </time>
            ) : (
              <Link to={path} title={fullDate} className={cx('hover:underline', focusRing)}>
                <time dateTime={post.at}>{when}</time>
              </Link>
            )}
            {hint && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1" title={`Le sale a: ${hint}`}>
                  {post.visibility === 'followers' ? <Users className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
                  {hint}
                </span>
              </>
            )}
          </p>
        </div>
        <ContentMenu
          what="publicación"
          kind="post"
          targetId={post.id}
          author={{ id: author.id, name }}
          isMine={post.isMine}
          canDelete={post.canDelete}
          onDelete={() => deletePost(post)}
          onGone={onGone}
          className="-mt-1"
        />
      </header>

      {post.league && !hideLeague && <LeagueChip league={post.league} className="mx-4 mt-2" />}

      {post.text && (
        <div onClick={detail ? undefined : openFromText} className={cx('mt-2.5 px-4', !detail && 'cursor-pointer')}>
          <PostText text={post.text} className={cx(detail ? 'text-[17px] leading-relaxed' : 'text-body', long && 'line-clamp-8')} />
          {long && (
            <Link to={path} className={cx('mt-1 inline-flex min-h-8 items-center text-sm font-semibold text-accent', focusRing)}>
              Ver más
            </Link>
          )}
        </div>
      )}

      {post.photo && (
        <div className="mt-3 px-4">
          <PostPhoto photo={post.photo} alt={firstLine(post.text, 120) || `Foto de ${name}`} />
        </div>
      )}

      <footer className="mt-1 flex items-center gap-0.5 px-2 pb-1.5">
        <PostLikeButton post={post} />
        <CommentsAction post={post} onComment={onComment} />
        <ShareAction post={post} className="ml-auto" />
      </footer>
    </article>
  );
}

/** «Comentar» o cuántos comentarios tiene: abre la publicación (o, en ella, va a la caja). */
function CommentsAction({ post, onComment }: { post: Pick<Post, 'id' | 'comments'>; onComment?: () => void }) {
  const label = post.comments ? `Comentarios (${post.comments})` : 'Comentar';
  const inner = (
    <>
      <MessageCircle className="size-5" aria-hidden="true" />
      <span aria-hidden="true">{post.comments > 0 ? compactCount(post.comments) : 'Comentar'}</span>
    </>
  );
  if (onComment) {
    return (
      <button type="button" onClick={onComment} aria-label={label} title="Comentar" className={actionClass}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={postPath(post.id)} aria-label={label} title="Ver comentarios" className={actionClass}>
      {inner}
    </Link>
  );
}

/** Compartir: el menú del teléfono con el link de la publicación o, si no hay, lo copia. */
function ShareAction({ post, className }: { post: Pick<Post, 'id' | 'text' | 'author'>; className?: string }) {
  const { toast } = useFeedback();

  async function share() {
    const url = postShareUrl(post.id);
    if (typeof navigator !== 'undefined' && navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: `${post.author.name.trim() || 'Alguien'} en MatchMate`, text: firstLine(post.text) || undefined, url });
        return;
      } catch (e) {
        // Lo cerró sin compartir: nada más.
        if ((e as { name?: string } | null)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado');
    } catch {
      toast('No se pudo copiar el link.', 'error');
    }
  }

  return (
    <button type="button" onClick={() => void share()} aria-label="Compartir publicación" title="Compartir" className={cx(actionClass, className)}>
      <Share2 className="size-5" aria-hidden="true" />
    </button>
  );
}

/** La liga de la publicación con el color de su deporte (lleva a la liga). */
export function LeagueChip({ league, className }: { league: NonNullable<Post['league']>; className?: string }) {
  const meta = sportMeta(league.sport);
  const Icon = meta?.icon ?? CircleHelp;
  const color = meta?.color ?? 'var(--color-accent)';
  const style: CSSProperties = {
    color: `color-mix(in oklab, ${color} 78%, var(--color-fg))`,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
  };
  return (
    <Link
      to={`/l/${encodeURIComponent(league.id)}`}
      style={style}
      title={`Ir a ${league.name}`}
      className={cx(
        "relative inline-flex max-w-[calc(100%-2rem)] items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] active:opacity-80",
        focusRing,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{league.name}</span>
    </Link>
  );
}
