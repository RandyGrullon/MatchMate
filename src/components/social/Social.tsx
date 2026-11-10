import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LogIn, MessageCircle, PartyPopper, SendHorizontal, ThumbsUp, Trash2, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../../lib/auth';
import { MAX_COMMENT, deleteComment, setReaction } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import { relativeTime } from '../../lib/notifications';
import type { Entry, GameComment, Reaction, ReactionType } from '../../lib/types';
import { Avatar } from '../Avatar';
import { useAction, useFeedback } from '../feedback';
import { ReportButton } from '../report/ReportButton';
import { Button, cx } from '../ui';
// La lógica (quiénes reaccionaron, el ritmo y el envío de un comentario, los textos) está en gameSocial.ts: la usa la app.
import {
  QUICK_REPLIES as QUICK,
  REACTION_TYPES,
  SOCIAL_TEXT,
  commentPaceText,
  commentPlaceholder,
  commentsLabel,
  deleteCommentConfirm,
  myReaction,
  noCommentsText,
  reactionCount,
  reactionLabel,
  reactionSummary,
  sendGameComment,
  socialGateText,
  sortedComments,
  unsentComments as unsent,
} from './gameSocial';

const ICONS: Record<ReactionType, typeof ThumbsUp> = { like: ThumbsUp, felicitar: PartyPopper };
const REACTIONS = REACTION_TYPES.map((r) => ({ ...r, icon: ICONS[r.type] }));

/**
 * ¿Puede reaccionar o comentar? Sin cuenta, lo manda a entrar; sin ser miembro, le dice que se una.
 * Devuelve la cuenta (uid y nombre) o null.
 */
function useSocialUser() {
  const auth = useAuth();
  const { member } = useLeagueCtx();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useFeedback();
  return () => {
    if (!auth.user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return null;
    }
    if (!member) {
      toast(SOCIAL_TEXT.joinToast);
      return null;
    }
    // Con el nombre de su membresía en la liga (las reglas no dejan poner otro).
    return { uid: auth.user.uid, name: member.name || displayName(auth) };
  };
}

/** Botones "Me gusta" y "Felicitar" (una reacción por persona; tocar la misma la quita) y los comentarios. */
export function ReactionBar({
  entry,
  reactions,
  comments,
  onComments,
}: {
  entry: Pick<Entry, 'id' | 'eventId' | 'playerId'>;
  /** Reacciones de este juego. */
  reactions: Reaction[];
  comments: GameComment[];
  onComments: () => void;
}) {
  const { lid } = useLeagueCtx();
  const { user } = useAuth();
  const run = useAction();
  const who = useSocialUser();
  const mine = myReaction(reactions, user?.uid);

  function react(type: ReactionType) {
    const me = who();
    if (!me) return;
    navigator.vibrate?.(15);
    run(() => setReaction(lid, entry, me, mine === type ? null : type));
  }

  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map(({ type, label, icon: Icon }) => {
        const n = reactionCount(reactions, type);
        const on = mine === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => react(type)}
            aria-pressed={on}
            aria-label={reactionLabel(label, n)}
            className={cx(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap transition active:scale-95',
              on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <Icon className={cx('size-4', on && type === 'felicitar' && 'animate-pop')} />
            <span className="hidden min-[360px]:inline">{label}</span>
            {n > 0 && <span className="tabular-nums">{n}</span>}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onComments}
        aria-label={commentsLabel(comments.length)}
        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
      >
        <MessageCircle className="size-4" />
        {comments.length > 0 ? <span className="tabular-nums">{comments.length}</span> : <span className="hidden min-[420px]:inline">{SOCIAL_TEXT.comment}</span>}
      </button>
    </div>
  );
}

/** Quiénes reaccionaron y los comentarios del juego, con la caja para comentar. */
export function PostSocial({
  entry,
  reactions,
  comments,
  isMine,
}: {
  entry: Pick<Entry, 'id' | 'eventId' | 'playerId'>;
  reactions: Reaction[];
  comments: GameComment[];
  /** El juego es del jugador de la cuenta (cambia el texto de la caja). */
  isMine: boolean;
}) {
  const { lid, isAdmin, member, base } = useLeagueCtx();
  const { user } = useAuth();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const location = useLocation();
  const who = useSocialUser();
  const [text, setTextState] = useState(() => unsent.get(entry.id) ?? '');
  const setText = (v: string) => {
    setTextState(v);
    if (v) unsent.set(entry.id, v);
    else unsent.delete(entry.id);
  };
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const sorted = sortedComments(comments);
  // Quiénes reaccionaron: "Felicitaste", "Tú y Ana felicitaron", "A Pedro le gustó", "Te gustó"…
  const cheered = reactionSummary(reactions, 'felicitar', user?.uid);
  const liked = reactionSummary(reactions, 'like', user?.uid);

  /** Si lo que hay en la caja es lo que se mandó, se vacía (lo que escribió después se queda). */
  function clearIfSent(body: string) {
    setTextState((t) => {
      if (t.trim() !== body) return t;
      unsent.delete(entry.id);
      return '';
    });
  }
  /** Si no se pudo mandar y la caja está vacía, vuelve el texto para reintentar. */
  function restore(body: string) {
    setTextState((t) => {
      if (t.trim()) return t;
      unsent.set(entry.id, body);
      return body;
    });
  }

  /** `fromBox`: lo escrito en la caja (una respuesta rápida no toca la caja). */
  async function send(value: string, fromBox: boolean, e?: FormEvent) {
    e?.preventDefault();
    const body = value.trim();
    // Uno a la vez: Enter dos veces no manda el mismo comentario dos veces.
    if (!body || inFlight.current) return;
    const me = who();
    if (!me) return;
    const wait = commentPaceText(lid);
    if (wait) {
      toast(wait, 'error');
      return;
    }
    inFlight.current = true;
    setSending(true);
    const result = await sendGameComment(lid, entry, me, body);
    inFlight.current = false;
    setSending(false);
    if (result.kind !== 'error') {
      if (fromBox) clearIfSent(body);
      if (result.kind === 'queued') {
        toast(SOCIAL_TEXT.queued);
        // Si al final no se pudo, se devuelve el texto.
        result.later.catch((err) => {
          console.error(err);
          if (fromBox) restore(body);
          toast(SOCIAL_TEXT.failed, 'error');
        });
      }
    } else {
      console.error(result.error);
      toast(result.text, 'error');
    }
  }

  async function remove(c: GameComment) {
    const ok = await confirm(deleteCommentConfirm(c.text));
    if (ok) await run(() => deleteComment(lid, c.id));
  }

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4" aria-label={SOCIAL_TEXT.section}>
      <ReactionBar entry={entry} reactions={reactions} comments={comments} onComments={() => document.getElementById('comentar')?.focus()} />
      {(cheered || liked) && (
        <div className="flex flex-col gap-1 text-sm text-muted">
          {cheered && (
            <p className="flex items-start gap-1.5">
              <PartyPopper className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>{cheered}</span>
            </p>
          )}
          {liked && (
            <p className="flex items-start gap-1.5">
              <ThumbsUp className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>{liked}</span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((c) => (
          <div key={c.id} className="flex items-start gap-2.5">
            <Avatar name={c.name} className="size-8 text-xs" />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-semibold">{c.uid === user?.uid ? SOCIAL_TEXT.you : c.name}</span>
                <span className="shrink-0 text-[11px] text-muted">{c.createdAt ? relativeTime(c.createdAt.toMillis(), Date.now()) : SOCIAL_TEXT.now}</span>
              </div>
              <p className="text-sm break-words whitespace-pre-line">{c.text}</p>
            </div>
            {(c.uid === user?.uid || isAdmin) && (
              <Button variant="ghost" size="sm" aria-label={SOCIAL_TEXT.deleteLabel} title={SOCIAL_TEXT.deleteTitle} icon={<Trash2 className="size-4 text-muted" />} onClick={() => remove(c)} />
            )}
            {/* Reportar el comentario de otro (lo revisan el equipo de MatchMate y los admins de la liga). */}
            {user && c.uid !== user.uid && <ReportButton kind="comment" targetId={c.id} ownerId={c.uid} className="-my-1.5 -mr-2" />}
          </div>
        ))}
        {sorted.length === 0 && <p className="text-sm text-muted">{noCommentsText(isMine)}</p>}
      </div>

      {!user || !member ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-center text-sm">
          <p className="text-muted">{socialGateText(!!user)}</p>
          <Link
            to={user ? `${base}/perfil` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 font-medium text-accent-fg"
          >
            {user ? <UserPlus className="size-4" /> : <LogIn className="size-4" />} {user ? SOCIAL_TEXT.join : SOCIAL_TEXT.signIn}
          </Link>
        </div>
      ) : (
        <>
      {!isMine && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              disabled={sending}
              onClick={() => send(q, false)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm transition hover:bg-surface-2 active:scale-95 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => send(text, true, e)} className="flex items-end gap-2">
        <textarea
          id="comentar"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_COMMENT))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text, true);
            }
          }}
          rows={1}
          placeholder={commentPlaceholder(isMine)}
          aria-label={SOCIAL_TEXT.commentLabel}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
        />
        <Button type="submit" variant="primary" aria-label={SOCIAL_TEXT.send} disabled={!text.trim()} loading={sending} icon={<SendHorizontal className="size-4" />} />
      </form>
        </>
      )}
    </section>
  );
}
