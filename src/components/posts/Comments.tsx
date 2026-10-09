import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, MessageCircle, SendHorizontal } from 'lucide-react';
import type { Paged } from '../../lib/data/follows';
import { COMMENT_MAX, addPostComment, deletePostComment, socialErrorText, type PostComment } from '../../lib/data/posts';
import { relativeTime } from '../../lib/notifications';
import { useNow } from '../../lib/useNow';
import { Avatar } from '../Avatar';
import { useFeedback } from '../feedback';
import { userPath } from '../social/UserLink';
import { Button, LoadError, Skeleton, cx } from '../ui';
import { ContentMenu } from './PostMenu';
import { PostText } from './PostText';
import { useAutoGrow } from './useAutoGrow';

/** El id de la caja para comentar («Comentar» de la tarjeta la enfoca). */
export const COMMENT_BOX_ID = 'comentar-publicacion';

/** Comentario a medio escribir por publicación (sobrevive a abrir otra pantalla y volver). */
const unsent = new Map<string, string>();

/** Fijo abajo, encima de la barra de secciones del teléfono (como los botones fijos de las canchas). */
const STICKY_ABOVE_NAV = 'sticky bottom-[calc(5rem+max(0px,env(safe-area-inset-bottom)-1rem))] z-20 sm:bottom-3';

function CommentsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando comentarios">
      {[70, 45].map((w) => (
        <div key={w} className="flex items-start gap-2.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-14 rounded-2xl rounded-tl-sm" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Los comentarios de una publicación, del más viejo al más nuevo, como globos (foto, nombre que lleva al perfil, hace
 * cuánto y el texto con sus links). Cada uno con «⋯»: reportarlo y bloquear a quien lo escribió (si no es tuyo) y
 * borrarlo (si puedes). Cargando, error con «Reintentar», vacío y «Ver más comentarios».
 */
export function CommentList({ list }: { list: Paged<PostComment> }) {
  const now = useNow();
  if (list.loading && !list.data.length) return <CommentsSkeleton />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={list.refresh} />;
  if (!list.data.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
        <MessageCircle className="size-4 shrink-0" aria-hidden="true" /> Todavía no hay comentarios. ¡Sé el primero!
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {list.data.map((c) => (
          <CommentItem key={c.id} comment={c} now={now.getTime()} />
        ))}
      </ol>
      {list.moreError && (
        <p className="flex items-center justify-center gap-1.5 text-sm text-danger" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" /> No se pudieron cargar más. Intenta de nuevo.
        </p>
      )}
      {list.hasMore && (
        <Button className="h-11 self-center" loading={list.loadingMore} onClick={() => void list.loadMore()}>
          Ver más comentarios
        </Button>
      )}
    </div>
  );
}

function CommentItem({ comment: c, now }: { comment: PostComment; now: number }) {
  const name = c.author.name.trim() || 'Alguien';
  const at = Date.parse(c.at);
  return (
    <li className="flex items-start gap-2.5" data-comment={c.id}>
      <Link to={userPath(c.author.id)} aria-label={`Perfil de ${name}`} className="mt-0.5 shrink-0 rounded-full active:opacity-80">
        <Avatar name={name} photo={c.author.avatar} className="size-8 text-xs" />
      </Link>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <Link to={userPath(c.author.id)} className="truncate text-sm font-semibold hover:underline">
            {c.isMine ? 'Tú' : name}
          </Link>
          <time dateTime={c.at} className="shrink-0 text-[11px] text-muted">
            {Number.isFinite(at) ? relativeTime(at, now) : ''}
          </time>
        </div>
        <PostText text={c.text} className="text-sm" />
      </div>
      <ContentMenu
        what="comentario"
        kind="post_comment"
        targetId={c.id}
        author={{ id: c.author.id, name }}
        isMine={c.isMine}
        canDelete={c.canDelete}
        onDelete={() => deletePostComment(c)}
        deleteText={`«${c.text.length > 120 ? `${c.text.slice(0, 119)}…` : c.text}»`}
        className="-mr-2"
      />
    </li>
  );
}

/**
 * La caja para comentar, fija abajo (encima de la barra del teléfono): crece con lo que escribes, el contador sale
 * cerca del tope, Enter manda en la computadora (Mayús+Enter, otra línea) y el botón gira mientras sale. Si falla, el
 * texto se queda para volver a intentar.
 */
export function CommentBox({ postId, className }: { postId: string; className?: string }) {
  const { toast } = useFeedback();
  const [text, setTextState] = useState(() => unsent.get(postId) ?? '');
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(box, text, 128);
  const near = text.length >= COMMENT_MAX - 50;

  const setText = (v: string) => {
    const next = v.slice(0, COMMENT_MAX);
    setTextState(next);
    if (next) unsent.set(postId, next);
    else unsent.delete(postId);
  };

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    // Uno a la vez: Enter dos veces no manda el mismo comentario dos veces.
    if (!body || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await addPostComment(postId, body);
      // Lo que escribió mientras salía se queda.
      setTextState((t) => {
        if (t.trim() !== body) return t;
        unsent.delete(postId);
        return '';
      });
    } catch (err) {
      console.error(err);
      toast(socialErrorText(err, 'No se pudo enviar tu comentario. Inténtalo otra vez.'), 'error');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <form onSubmit={(e) => void send(e)} className={cx(STICKY_ABOVE_NAV, '-mx-2 rounded-3xl bg-bg/90 px-2 py-2 backdrop-blur', className)}>
      <div className="card-shadow flex items-end gap-2 rounded-3xl bg-surface p-1.5 pl-3">
        <textarea
          ref={box}
          id={COMMENT_BOX_ID}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const desktop = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
            if (e.key === 'Enter' && !e.shiftKey && desktop) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Escribe un comentario…"
          aria-label="Comentario"
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-base text-fg outline-none placeholder:text-muted/70 sm:text-sm"
        />
        {near && (
          <span className={cx('self-center text-xs tabular-nums', text.length >= COMMENT_MAX ? 'text-warn' : 'text-muted')}>
            {COMMENT_MAX - text.length}
          </span>
        )}
        <Button
          type="submit"
          variant="primary"
          aria-label="Enviar comentario"
          disabled={!text.trim()}
          loading={sending}
          icon={<SendHorizontal className="size-4" />}
          className="rounded-full!"
        />
      </div>
    </form>
  );
}
