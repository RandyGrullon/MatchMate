/**
 * Una publicación (como PostCard de la web, src/components/posts/PostCard.tsx): quién la escribió (foto, nombre,
 * @usuario y hace cuánto), la liga con el color de su deporte, a quién le sale si no es para todos, el texto con sus
 * links, el juego compartido (resumido) y la foto con su hueco reservado. Abajo: me gusta, comentarios y compartir;
 * «⋯»: reportar, bloquear y borrar. Tocar el texto abre la publicación con sus comentarios.
 */
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { CircleHelp, Heart, Lock, MessageCircle, Share2, Trophy, Users } from 'lucide-react-native';
import { deletePost, optimisticPostLikes, setPostLike, socialErrorText, type Post } from '@mm/lib/data/posts';
import { gameSummary } from '@mm/lib/data/profileGames';
import { relativeTime } from '@mm/lib/notifications';
import { POST_BUCKET, usePublicImage } from '@mm/lib/publicImages';
import { useNow } from '@mm/lib/useNow';
import { sportMeta } from '@mm/sports/registry';
import { firstLine, isLongText, linkify, photoRatio, postShareUrl, visibilityHint } from '@mm/components/posts/postFormat';
import { atUsername, compactCount, likeLabel } from '@mm/components/social/socialFormat';
import { Avatar } from './Avatar';
import { ContentMenu } from './ContentMenu';
import { toast } from '../feedback';
import { Txt } from '../ui';
import { openLink, ownPath } from '@/lib/links';
import { useColors } from '@/theme/theme';

export const userRoute = (id: string) => ({ pathname: '/u/[userId]' as const, params: { userId: id } });
export const postRoute = (id: string) => ({ pathname: '/p/[postId]' as const, params: { postId: id } });

/** El texto con sus links (los de MatchMate abren en la app; los demás, en el navegador de la app). */
export function PostText({ text, numberOfLines, big }: { text: string; numberOfLines?: number; big?: boolean }) {
  return (
    <Txt variant={big ? 'bodyLarge' : 'body'} numberOfLines={numberOfLines}>
      {linkify(text).map((p, i) =>
        p.kind === 'text' ? (
          p.text
        ) : (
          <Txt
            key={i}
            variant={big ? 'bodyLarge' : 'body'}
            tone="accent"
            style={{ textDecorationLine: 'underline' }}
            onPress={() => (ownPath(p.href) ? openLink(p.href) : void WebBrowser.openBrowserAsync(p.href).catch(() => undefined))}
          >
            {p.text}
          </Txt>
        ),
      )}
    </Txt>
  );
}

function PostPhoto({ photo }: { photo: NonNullable<Post['photo']> }) {
  const c = useColors();
  const { url } = usePublicImage(POST_BUCKET, photo.path);
  return (
    <View style={{ aspectRatio: photoRatio(photo.w, photo.h), borderRadius: 18, overflow: 'hidden', backgroundColor: c.surface2 }}>
      {url && <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />}
    </View>
  );
}

/** La liga de la publicación con el color de su deporte (lleva a la liga). */
export function LeagueChip({ league }: { league: NonNullable<Post['league']> }) {
  const c = useColors();
  const meta = sportMeta(league.sport);
  const Icon = meta?.icon ?? CircleHelp;
  const color = meta?.color ?? c.accent;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Ir a ${league.name}`}
      onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: league.id } })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '90%', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${color}22` }}
    >
      <Icon size={14} color={color} />
      <Txt variant="small" numberOfLines={1} style={{ color, fontWeight: '600' }}>
        {league.name}
      </Txt>
    </Pressable>
  );
}

function LikeAction({ post }: { post: Pick<Post, 'id' | 'likes' | 'likedByMe'> }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<Pick<Post, 'likes' | 'likedByMe'> | null>(null);
  const shown = over ?? post;
  const liked = shown.likedByMe;
  async function toggle() {
    if (busy) return;
    const next = !liked;
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOver(optimisticPostLikes(shown, next));
    setBusy(true);
    try {
      await setPostLike(post, next);
    } catch (e) {
      toast(socialErrorText(e, 'No se pudo guardar tu me gusta. Inténtalo otra vez.'), 'error');
    } finally {
      setOver(null);
      setBusy(false);
    }
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={likeLabel(liked, shown.likes)} accessibilityState={{ selected: liked }} onPress={toggle} style={actionStyle}>
      <Heart size={20} color={liked ? c.danger : c.muted} fill={liked ? c.danger : 'transparent'} />
      {shown.likes > 0 && (
        <Txt variant="meta" tone={liked ? 'danger' : 'muted'} style={{ fontWeight: '600' }}>
          {compactCount(shown.likes)}
        </Txt>
      )}
    </Pressable>
  );
}

const actionStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center' as const };

export function PostCard({ post, hideLeague, detail, onComment, onGone }: { post: Post; hideLeague?: boolean; detail?: boolean; onComment?: () => void; onGone?: () => void }) {
  const c = useColors();
  const now = useNow();
  const author = post.author;
  const name = author.name.trim() || 'Alguien';
  const handle = atUsername(author.username);
  const hint = visibilityHint(post.visibility);
  const long = !detail && isLongText(post.text);
  const at = Date.parse(post.at);
  const when = Number.isFinite(at) ? relativeTime(at, now.getTime()) : '';
  const open = () => router.push(postRoute(post.id));
  const meta = post.game ? sportMeta(post.game.sport) : null;
  const GameIcon = meta?.icon ?? Trophy;

  async function share() {
    try {
      await Share.share({ message: [firstLine(post.text), postShareUrl(post.id)].filter(Boolean).join('\n'), url: postShareUrl(post.id) });
    } catch {
      toast('No se pudo compartir.', 'error');
    }
  }

  return (
    <View accessibilityLabel={`Publicación de ${name}`} style={{ backgroundColor: c.surface, borderRadius: 24, paddingTop: 14, paddingBottom: 4, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingLeft: 16, paddingRight: 6 }}>
        <Pressable accessibilityLabel={`Perfil de ${name}`} onPress={() => router.push(userRoute(author.id))}>
          <Avatar name={name} photo={author.avatar} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }} onPress={() => router.push(userRoute(author.id))}>
              {name}
            </Txt>
            {!!handle && (
              <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 2 }}>
                {handle}
              </Txt>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt variant="small" tone="muted" onPress={detail ? undefined : open}>
              {when}
            </Txt>
            {!!hint && (
              <>
                <Txt variant="small" tone="muted">
                  ·
                </Txt>
                {post.visibility === 'followers' ? <Users size={13} color={c.muted} /> : <Lock size={13} color={c.muted} />}
                <Txt variant="small" tone="muted">
                  {hint}
                </Txt>
              </>
            )}
          </View>
        </View>
        <ContentMenu
          what="publicación"
          kind="post"
          targetId={post.id}
          author={{ id: author.id, name }}
          isMine={post.isMine}
          canDelete={post.canDelete}
          onDelete={() => deletePost(post)}
          onGone={onGone}
        />
      </View>

      {post.league && !hideLeague && (
        <View style={{ paddingHorizontal: 16 }}>
          <LeagueChip league={post.league} />
        </View>
      )}

      {!!post.text && (
        <Pressable disabled={detail} onPress={open} style={{ paddingHorizontal: 16 }}>
          <PostText text={post.text} numberOfLines={long ? 8 : undefined} big={detail} />
          {long && (
            <Txt variant="meta" tone="accent" style={{ fontWeight: '600', marginTop: 4 }}>
              Ver más
            </Txt>
          )}
        </Pressable>
      )}

      {post.game ? (
        <View style={{ marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, backgroundColor: c.surface2 }}>
          <GameIcon size={20} color={meta?.color ?? c.accent} />
          <Txt variant="meta" style={{ flex: 1 }} numberOfLines={2}>
            {gameSummary(post.game)}
          </Txt>
        </View>
      ) : (
        !!post.hasGame && (
          <View style={{ marginHorizontal: 16, borderRadius: 16, padding: 12, backgroundColor: c.surface2 }}>
            <Txt variant="meta" tone="muted">
              Juego no disponible
            </Txt>
          </View>
        )
      )}

      {post.photo && (
        <View style={{ paddingHorizontal: 16 }}>
          <PostPhoto photo={post.photo} />
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
        <LikeAction post={post} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.comments ? `Comentarios (${post.comments})` : 'Comentar'}
          onPress={onComment ?? open}
          style={actionStyle}
        >
          <MessageCircle size={20} color={c.muted} />
          <Txt variant="meta" tone="muted" style={{ fontWeight: '600' }}>
            {post.comments > 0 ? compactCount(post.comments) : 'Comentar'}
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Compartir publicación" onPress={share} style={[actionStyle, { marginLeft: 'auto' }]}>
          <Share2 size={20} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}
