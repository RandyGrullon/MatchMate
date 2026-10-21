/**
 * Los comentarios de una publicación y la caja para comentar (como Comments.tsx de la web): del más viejo al más nuevo,
 * cada uno con su «⋯» (reportar, bloquear, borrar); la caja guarda lo escrito si sales y vuelves.
 */
import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle, SendHorizontal } from 'lucide-react-native';
import type { Paged } from '@mm/lib/data/follows';
import { COMMENT_MAX, addPostComment, deletePostComment, socialErrorText, type PostComment } from '@mm/lib/data/posts';
import { relativeTime } from '@mm/lib/notifications';
import { useNow } from '@mm/lib/useNow';
import { Avatar } from './Avatar';
import { ContentMenu } from './ContentMenu';
import { PostText, userRoute } from './PostCard';
import { toast } from '../feedback';
import { Button, ErrorNote, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';

/** Comentario a medio escribir por publicación (sobrevive a abrir otra pantalla y volver). */
const unsent = new Map<string, string>();

export function CommentList({ list }: { list: Paged<PostComment> }) {
  const c = useColors();
  const now = useNow().getTime();
  if (list.loading && !list.data.length) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <LogoSpinner size={32} label="Cargando comentarios" />
      </View>
    );
  }
  if (list.error && !list.data.length) {
    return (
      <View style={{ gap: 10 }}>
        <ErrorNote>{socialErrorText(list.error, 'No se pudieron cargar los comentarios.')}</ErrorNote>
        <Button onPress={list.refresh}>Reintentar</Button>
      </View>
    );
  }
  if (!list.data.length) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <MessageCircle size={16} color={c.muted} />
        <Txt variant="meta" tone="muted">
          Todavía no hay comentarios. ¡Sé el primero!
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {list.data.map((cm) => {
        const name = cm.author.name.trim() || 'Alguien';
        const at = Date.parse(cm.at);
        return (
          <View key={cm.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Pressable accessibilityLabel={`Perfil de ${name}`} onPress={() => router.push(userRoute(cm.author.id))}>
              <Avatar name={name} photo={cm.author.avatar} size={34} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.surface }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }} onPress={() => router.push(userRoute(cm.author.id))}>
                  {cm.isMine ? 'Tú' : name}
                </Txt>
                <Txt variant="small" tone="muted">
                  {Number.isFinite(at) ? relativeTime(at, now) : ''}
                </Txt>
              </View>
              <PostText text={cm.text} />
            </View>
            <ContentMenu
              what="comentario"
              kind="post_comment"
              targetId={cm.id}
              author={{ id: cm.author.id, name }}
              isMine={cm.isMine}
              canDelete={cm.canDelete}
              onDelete={() => deletePostComment(cm)}
              deleteText={`«${cm.text.length > 120 ? `${cm.text.slice(0, 119)}…` : cm.text}»`}
            />
          </View>
        );
      })}
      {list.moreError && (
        <Txt variant="meta" tone="danger" style={{ textAlign: 'center' }}>
          No se pudieron cargar más. Intenta de nuevo.
        </Txt>
      )}
      {list.hasMore && (
        <Button full loading={list.loadingMore} onPress={list.loadMore}>
          Ver más comentarios
        </Button>
      )}
    </View>
  );
}

/** La caja para comentar: crece con lo que escribes, el contador sale cerca del tope y si falla el texto se queda. */
export function CommentBox({ postId, inputRef }: { postId: string; inputRef?: RefObject<ComponentRef<typeof TextInput> | null> }) {
  const c = useColors();
  const [text, setTextState] = useState(() => unsent.get(postId) ?? '');
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const near = text.length >= COMMENT_MAX - 50;

  const setText = (v: string) => {
    const next = v.slice(0, COMMENT_MAX);
    setTextState(next);
    if (next) unsent.set(postId, next);
    else unsent.delete(postId);
  };

  async function send() {
    const body = text.trim();
    if (!body || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await addPostComment(postId, body);
      setText('');
    } catch (e) {
      toast(socialErrorText(e, 'No se pudo enviar tu comentario. Inténtalo otra vez.'), 'error');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 22, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, paddingLeft: 14, paddingRight: 6, paddingVertical: 4 }}>
        <TextInput
          ref={inputRef}
          accessibilityLabel="Escribe un comentario"
          placeholder="Escribe un comentario…"
          placeholderTextColor={c.faint}
          multiline
          value={text}
          onChangeText={setText}
          style={{ flex: 1, maxHeight: 128, minHeight: 40, paddingVertical: 9, fontSize: 16, color: c.fg }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar comentario"
          disabled={!text.trim() || sending}
          onPress={send}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? c.accent : c.surface2 }}
        >
          {sending ? <ActivityIndicator color={c.accentFg} /> : <SendHorizontal size={18} color={text.trim() ? c.accentFg : c.faint} />}
        </Pressable>
      </View>
      {near && (
        <Txt variant="small" tone={text.length >= COMMENT_MAX ? 'warn' : 'muted'} style={{ alignSelf: 'flex-end' }}>
          {text.length}/{COMMENT_MAX}
        </Txt>
      )}
    </View>
  );
}
