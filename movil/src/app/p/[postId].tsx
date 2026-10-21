import { useRef, type ComponentRef } from 'react';
import { TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircle, SearchX } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { invalidate } from '@mm/lib/data/client';
import { postTags, socialErrorText, usePost, usePostComments } from '@mm/lib/data/posts';
import { compactCount } from '@mm/components/social/socialFormat';
import { CommentBox, CommentList } from '@/components/social/Comments';
import { PostCard } from '@/components/social/PostCard';
import { BackBar, Button, Card, Empty, ErrorNote, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Una publicación con sus comentarios (/p/:id de la web). Sin cuenta: entrar. Si ya no está o no se puede ver, lo
 * dice; si se borra o se bloquea a quien la escribió, vuelve a donde estaba.
 */
export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const c = useColors();
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <BackBar label="Social" fallback="/social" />
        <Card style={{ gap: 12 }}>
          <MessageCircle size={28} color={c.accent} />
          <Txt variant="cardTitle">Entra para ver esta publicación</Txt>
          <Txt tone="fg2">Dale me gusta, comenta y sigue a quien la publicó.</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      </Screen>
    );
  }
  return <PostDetail key={postId} postId={postId} />;
}

function PostDetail({ postId }: { postId: string }) {
  const c = useColors();
  const post = usePost(postId);
  const comments = usePostComments(postId);
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  const p = post.data;
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/social'));

  if (post.loading && !p) return <Loading label="Cargando la publicación" />;
  if (post.error && !p) {
    return (
      <Screen>
        <BackBar label="Social" fallback="/social" />
        <ErrorNote>{socialErrorText(post.error, 'No se pudo cargar la publicación.')}</ErrorNote>
        <Button onPress={() => invalidate(postTags.post(postId))}>Reintentar</Button>
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen>
        <BackBar label="Social" fallback="/social" />
        <Empty
          icon={<SearchX size={28} color={c.accent} />}
          title="Esta publicación ya no está o no la puedes ver"
          text="Puede que la hayan borrado o que sea solo para sus seguidores o su liga."
          action={<Button onPress={() => router.navigate('/social')}>Ir a Social</Button>}
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <BackBar label="Social" fallback="/social" />
      <PostCard post={p} detail onComment={() => box.current?.focus()} onGone={leave} />
      <Txt variant="section" accessibilityRole="header" style={{ marginTop: 8 }}>
        Comentarios
        {p.comments > 0 && <Txt variant="section" tone="muted">{`  ${compactCount(p.comments)}`}</Txt>}
      </Txt>
      <CommentList list={comments} />
      <CommentBox postId={p.id} inputRef={box} />
    </Screen>
  );
}
