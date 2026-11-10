/**
 * Me gusta, felicitar y los comentarios de un juego de boliche (ReactionBar y PostSocial de src/components/social/
 * Social.tsx), con la misma lógica (src/components/social/gameSocial.ts): «Me gusta» y «Felicitar» (una reacción por
 * persona; tocar la misma la quita), quiénes reaccionaron, los comentarios (borrar los tuyos o, si eres admin, los de
 * todos; reportar los de otros), las respuestas rápidas y la caja para comentar (sin señal queda en cola). Sin cuenta o
 * sin ser de la liga, dice qué falta. Va dentro del detalle del juego (GameDetail.tsx), que es una hoja: lo que lleva a
 * otra pantalla la cierra primero (`leave`).
 */
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Flag, LogIn, MessageCircle, PartyPopper, SendHorizontal, ThumbsUp, Trash2, UserPlus } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { REPORT_KIND_THIS } from '@mm/lib/data/reports';
import { MAX_COMMENT, deleteComment, setReaction } from '@mm/lib/data/social';
import { useLeagueCtx } from '@mm/lib/league';
import { relativeTime } from '@mm/lib/notifications';
import type { Entry, GameComment, Reaction, ReactionType } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import {
  QUICK_REPLIES,
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
  unsentComments,
} from '@mm/components/social/gameSocial';
import { act } from '@/components/approvals/parts';
import { confirmAsync, toast } from '@/components/feedback';
import { Avatar } from '@/components/social/Avatar';
import { ReportSheet } from '@/components/social/ContentMenu';
import { Button, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type Target = Pick<Entry, 'id' | 'eventId' | 'playerId'>;
/** Cierra la hoja del juego y, cuando ya se fue, hace lo pedido (ir a otra pantalla). */
type Leave = (go: () => void) => void;

const ICONS: Record<ReactionType, typeof ThumbsUp> = { like: ThumbsUp, felicitar: PartyPopper };

/**
 * ¿Puede reaccionar o comentar? Sin cuenta, lo manda a entrar (y vuelve a `next`); sin ser miembro, le dice que se una.
 * Devuelve la cuenta (uid y nombre) o null.
 */
function useSocialUser(leave: Leave, next: string) {
  const auth = useAuth();
  const { member } = useLeagueCtx();
  return () => {
    if (!auth.user) {
      leave(() => router.push({ pathname: '/login', params: { next } }));
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

/** Botones «Me gusta» y «Felicitar» (con cuántos hay) y el de los comentarios. */
function ReactionBar({
  entry,
  reactions,
  comments,
  onComments,
  who,
}: {
  entry: Target;
  reactions: Reaction[];
  comments: GameComment[];
  onComments: () => void;
  who: () => { uid: string; name: string } | null;
}) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const { user } = useAuth();
  // Los nombres de los botones caben desde 360 de ancho; «Comentar», desde 420 (como la web).
  const { width } = useWindowDimensions();
  const mine = myReaction(reactions, user?.uid);

  function react(type: ReactionType) {
    const me = who();
    if (!me) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    void act(() => setReaction(lid, entry, me, mine === type ? null : type));
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {REACTION_TYPES.map(({ type, label }) => {
        const Icon = ICONS[type];
        const n = reactionCount(reactions, type);
        const on = mine === type;
        const color = on ? c.accent : c.muted;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={reactionLabel(label, n)}
            onPress={() => react(type)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 36,
              borderRadius: 18,
              paddingHorizontal: 10,
              backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Icon size={16} color={color} />
            {width >= 360 && <Txt style={{ fontFamily: font.medium, fontSize: 14, color }}>{label}</Txt>}
            {n > 0 && <Txt style={{ fontFamily: font.medium, fontSize: 14, color, fontVariant: ['tabular-nums'] }}>{String(n)}</Txt>}
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={commentsLabel(comments.length)}
        onPress={onComments}
        style={({ pressed }) => ({
          marginLeft: 'auto',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 36,
          borderRadius: 18,
          paddingHorizontal: 12,
          backgroundColor: pressed ? c.surface2 : 'transparent',
        })}
      >
        <MessageCircle size={16} color={c.muted} />
        {comments.length > 0 ? (
          <Txt tone="muted" style={{ fontFamily: font.medium, fontSize: 14, fontVariant: ['tabular-nums'] }}>
            {String(comments.length)}
          </Txt>
        ) : (
          width >= 420 && (
            <Txt tone="muted" style={{ fontFamily: font.medium, fontSize: 14 }}>
              {SOCIAL_TEXT.comment}
            </Txt>
          )
        )}
      </Pressable>
    </View>
  );
}

/** «Reportar comentario» (la bandera): lo revisan el equipo de MatchMate y los admins de la liga. */
function ReportCommentButton({ id }: { id: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reportar ${REPORT_KIND_THIS.comment}`}
        hitSlop={4}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surface2 : 'transparent' })}
      >
        <Flag size={16} color={c.muted} />
      </Pressable>
      {open && <ReportSheet kind="comment" targetId={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Quiénes reaccionaron y los comentarios del juego, con la caja para comentar (PostSocial de la web). Hace falta estar
 * dentro de la liga (LeagueScope). `leave`: cierra la hoja antes de ir a otra pantalla; `next`: a dónde volver al entrar.
 */
export function GamePostSocial({
  entry,
  reactions,
  comments,
  isMine,
  leave,
  next,
}: {
  entry: Target;
  reactions: Reaction[];
  comments: GameComment[];
  /** El juego es del jugador de la cuenta (cambia el texto de la caja). */
  isMine: boolean;
  leave: Leave;
  next?: string;
}) {
  const c = useColors();
  const { lid, isAdmin, member } = useLeagueCtx();
  const { user } = useAuth();
  const path = usePathname();
  const back = next ?? path;
  const who = useSocialUser(leave, back);
  const now = useNow().getTime();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setTextState] = useState(() => unsentComments.get(entry.id) ?? '');
  const setText = (v: string) => {
    setTextState(v);
    if (v) unsentComments.set(entry.id, v);
    else unsentComments.delete(entry.id);
  };
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const sorted = sortedComments(comments);
  // Quiénes reaccionaron: «Felicitaste», «Tú y Ana felicitaron», «A Pedro le gustó», «Te gustó»…
  const cheered = reactionSummary(reactions, 'felicitar', user?.uid);
  const liked = reactionSummary(reactions, 'like', user?.uid);

  /** Si lo que hay en la caja es lo que se mandó, se vacía (lo que escribió después se queda). */
  function clearIfSent(body: string) {
    setTextState((t) => {
      if (t.trim() !== body) return t;
      unsentComments.delete(entry.id);
      return '';
    });
  }
  /** Si no se pudo mandar y la caja está vacía, vuelve el texto para reintentar. */
  function restore(body: string) {
    setTextState((t) => {
      if (t.trim()) return t;
      unsentComments.set(entry.id, body);
      return body;
    });
  }

  /** `fromBox`: lo escrito en la caja (una respuesta rápida no toca la caja). */
  async function send(value: string, fromBox: boolean) {
    const body = value.trim();
    // Uno a la vez: dos toques no mandan el mismo comentario dos veces.
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

  async function remove(cm: GameComment) {
    const ok = await confirmAsync(deleteCommentConfirm(cm.text));
    if (ok) await act(() => deleteComment(lid, cm.id));
  }

  const reactionLine = (Icon: typeof ThumbsUp, said: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <Icon size={16} color={c.accent} style={{ marginTop: 2 }} />
      <Txt variant="meta" tone="muted" style={{ flex: 1 }}>
        {said}
      </Txt>
    </View>
  );

  return (
    <View accessibilityLabel={SOCIAL_TEXT.section} style={{ gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 }}>
      <ReactionBar entry={entry} reactions={reactions} comments={comments} onComments={() => inputRef.current?.focus()} who={who} />
      {(cheered || liked) && (
        <View style={{ gap: 4 }}>
          {cheered && reactionLine(PartyPopper, cheered)}
          {liked && reactionLine(ThumbsUp, liked)}
        </View>
      )}

      <View style={{ gap: 12 }}>
        {sorted.map((cm) => (
          <View key={cm.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Avatar name={cm.name} size={32} />
            <View style={{ flex: 1, minWidth: 0, borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontFamily: font.semibold }}>
                  {cm.uid === user?.uid ? SOCIAL_TEXT.you : cm.name}
                </Txt>
                <Txt tone="muted" style={{ fontSize: 11 }}>
                  {cm.createdAt ? relativeTime(cm.createdAt.toMillis(), now) : SOCIAL_TEXT.now}
                </Txt>
              </View>
              <Txt style={{ fontSize: 14, lineHeight: 20 }}>{cm.text}</Txt>
            </View>
            {(cm.uid === user?.uid || isAdmin) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={SOCIAL_TEXT.deleteLabel}
                hitSlop={4}
                onPress={() => void remove(cm)}
                style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surface2 : 'transparent' })}
              >
                <Trash2 size={16} color={c.muted} />
              </Pressable>
            )}
            {/* Reportar el comentario de otro (lo revisan el equipo de MatchMate y los admins de la liga). */}
            {!!user && cm.uid !== user.uid && <ReportCommentButton id={cm.id} />}
          </View>
        ))}
        {sorted.length === 0 && (
          <Txt variant="meta" tone="muted">
            {noCommentsText(isMine)}
          </Txt>
        )}
      </View>

      {!user || !member ? (
        <View style={{ alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
            {socialGateText(!!user)}
          </Txt>
          <Button
            variant="primary"
            icon={user ? <UserPlus size={16} color={c.accentFg} /> : <LogIn size={16} color={c.accentFg} />}
            onPress={() =>
              leave(() => (user ? router.push({ pathname: '/l/[lid]/perfil', params: { lid } }) : router.push({ pathname: '/login', params: { next: back } })))
            }
          >
            {user ? SOCIAL_TEXT.join : SOCIAL_TEXT.signIn}
          </Button>
        </View>
      ) : (
        <>
          {!isMine && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
              {QUICK_REPLIES.map((q) => (
                <Pressable
                  key={q}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: sending }}
                  disabled={sending}
                  onPress={() => void send(q, false)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: c.line,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    opacity: sending ? 0.5 : 1,
                    backgroundColor: pressed ? c.surface2 : 'transparent',
                  })}
                >
                  <Txt style={{ fontSize: 14 }}>{q}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              ref={inputRef}
              accessibilityLabel={SOCIAL_TEXT.commentLabel}
              placeholder={commentPlaceholder(isMine)}
              placeholderTextColor={c.faint}
              multiline
              // Enter manda el comentario (como la web).
              submitBehavior="submit"
              returnKeyType="send"
              onSubmitEditing={() => void send(text, true)}
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX_COMMENT))}
              style={{
                flex: 1,
                minHeight: 40,
                maxHeight: 128,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.surface,
                paddingHorizontal: 12,
                paddingVertical: 9,
                fontSize: 16,
                color: c.fg,
              }}
            />
            <Button
              variant="primary"
              accessibilityLabel={SOCIAL_TEXT.send}
              disabled={!text.trim()}
              loading={sending}
              icon={<SendHorizontal size={16} color={c.accentFg} />}
              onPress={() => void send(text, true)}
            />
          </View>
        </>
      )}
    </View>
  );
}
