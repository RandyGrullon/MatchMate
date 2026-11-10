/**
 * «Resultados anteriores» de una liga de boliche (GamesFeedPage.tsx de la web, `/l/<liga>/juegos`; en la app
 * `/l/<liga>/partidos`), con su misma lógica (src/pages/gamesFeed.ts): el título y una línea; lo de hoy, una fila a la
 * práctica (ahí se ve «Cómo van todos»); debajo, cada fecha jugada con su bloque (OCT / 6), que lleva al evento, y quienes
 * jugaron de la mejor serie a la peor: sus juegos en una línea, «Mejor juego» o «Mejor serie», cuántos me gusta y
 * comentarios, y la serie grande. Tocar a alguien abre su juego (me gusta, felicitar, comentar); tocar sus iniciales, su
 * perfil. De a 4 fechas, con «Ver fechas más viejas». `?juego=` (un aviso, el «Ver» de Social) abre ese juego aunque sea
 * viejo. Va dentro de LeagueScope.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ChevronRight, Heart, MessageCircle, MessageCircleHeart } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useEntriesOfEvents } from '@mm/lib/data/entries';
import { useEvents } from '@mm/lib/data/events';
import { usePlayers } from '@mm/lib/data/players';
import { useCommentsOfEvents, useReactionsOfEvents } from '@mm/lib/data/social';
import { eventLabel, toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { liveInfo } from '@mm/lib/live';
import type { BowlingEvent, GameComment, Reaction } from '@mm/lib/types';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import {
  FEED_PAGE,
  FEED_TEXT,
  eventLine,
  feedEventIds,
  feedEventUrl,
  feedPeople,
  feedPosts,
  openEventIdOf,
  playedEvents,
  postCountsLabel,
  postLabel,
  scoresLine,
  todayLine,
  type FeedPost,
} from '@mm/pages/gamesFeed';
import { DateBlock } from '@/components/DateBlock';
import { LogoSpinner } from '@/components/Logo';
import { Avatar } from '@/components/social/Avatar';
import { Button, Card, LoadError, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { GameDetailSheet, closeThen } from './GameDetail';
import { GamePostSocial } from './GameSocial';

/** En Pro, el título de 28 (text-title-pro de la web). */
const PRO_TITLE = { fontSize: 28, lineHeight: 34, letterSpacing: -0.85 } as const;

export function BowlingGamesFeed() {
  const c = useColors();
  const { lid, league, base, myPlayerId } = useLeagueCtx();
  const { user } = useAuth();
  const pro = useIsPro();
  const params = useLocalSearchParams<{ juego?: string; evento?: string }>();
  const now = useNow();
  const today = toIsoDate(now);
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const [shown, setShown] = useState(FEED_PAGE);

  const { played, todays, past } = playedEvents(events.data, today);
  const visiblePast = past.slice(0, shown);

  // Juego abierto desde un aviso (?juego=…&evento=…): su evento se carga aunque sea viejo.
  const open = typeof params.juego === 'string' && params.juego ? params.juego : null;
  const openEventId = openEventIdOf(open, typeof params.evento === 'string' ? params.evento : null);
  const ids = feedEventIds([...todays, ...visiblePast], openEventId);

  const entries = useEntriesOfEvents(lid, ids);
  const reactions = useReactionsOfEvents(lid, ids);
  const comments = useCommentsOfEvents(lid, ids);
  // Los menores nunca tienen cuenta ni perfil público.
  const { nameOf, uidOf } = feedPeople(players.data);

  const loadError = events.error ?? players.error ?? entries.error;
  if (loadError) return <LoadError error={loadError} />;

  const byEvent = (id: string) => entries.data.filter((e) => e.eventId === id);
  const reactionsOf = (entryId: string) => reactions.data.filter((r) => r.entryId === entryId);
  const commentsOf = (entryId: string) => comments.data.filter((cm) => cm.entryId === entryId);
  const openEntry = open ? (entries.data.find((e) => e.id === open) ?? null) : null;
  const openEvent = openEntry ? events.data.find((e) => e.id === openEntry.eventId) : undefined;
  const setOpen = (id: string | null) => router.setParams({ juego: id ?? undefined });

  const loading = events.loading || players.loading || (entries.loading && !entries.data.length);
  const goEvent = (ev: BowlingEvent) => router.push(feedEventUrl(league, base, ev) as Href);

  return (
    <View style={{ gap: pro ? 24 : 26 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header" style={pro ? PRO_TITLE : undefined}>
          {FEED_TEXT.title}
        </Txt>
        <Txt variant="meta" tone="muted">
          {FEED_TEXT.hint}
        </Txt>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <LogoSpinner size={32} />
        </View>
      ) : played.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}>
            <MessageCircleHeart size={28} color={c.accent} />
          </View>
          <Txt variant="cardTitle" style={{ marginTop: 16, textAlign: 'center' }}>
            {FEED_TEXT.emptyTitle}
          </Txt>
          <Txt tone="muted" style={{ marginTop: 8, textAlign: 'center', maxWidth: 384 }}>
            {FEED_TEXT.emptyText}
          </Txt>
        </Card>
      ) : (
        <>
          {/* Hoy: una fila a la práctica (ahí se ve en vivo cómo van todos), no otra tabla en vivo. */}
          {todays.length > 0 && (
            <Card padded={false} style={{ backgroundColor: c.accentSoft }}>
              {todays.map((ev) => {
                const line = todayLine(liveInfo(ev, league, now), byEvent(ev.id).length);
                return (
                  <Pressable
                    key={ev.id}
                    accessibilityRole="link"
                    accessibilityLabel={`${eventLabel(ev)}. ${line.text}`}
                    onPress={() => goEvent(ev)}
                    style={({ pressed }) => [styles.row, { minHeight: pro ? 48 : 56, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <DateBlock date={ev.date} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: pro ? 15 : 16 }}>
                        {eventLabel(ev)}
                      </Txt>
                      {line.live ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
                          <Txt tone="accent" style={{ fontFamily: font.semibold, fontSize: pro ? 13 : 14 }}>
                            {line.text}
                          </Txt>
                        </View>
                      ) : (
                        <Txt tone="muted" style={{ marginTop: 2, fontSize: pro ? 13 : 14 }}>
                          {line.text}
                        </Txt>
                      )}
                    </View>
                    <ChevronRight size={18} color={c.faint} />
                  </Pressable>
                );
              })}
            </Card>
          )}

          {visiblePast.map((ev) => (
            <EventGroup
              key={ev.id}
              event={ev}
              dense={pro}
              loading={entries.loading}
              posts={feedPosts(ev, byEvent(ev.id), nameOf, uidOf, false)}
              reactionsOf={reactionsOf}
              commentsOf={commentsOf}
              onEvent={() => goEvent(ev)}
              onOpen={setOpen}
            />
          ))}
          {past.length > visiblePast.length && (
            <Button size={pro ? 'lg' : 'xl'} full onPress={() => setShown((n) => n + FEED_PAGE)}>
              {FEED_TEXT.more}
            </Button>
          )}
        </>
      )}

      {openEntry && openEvent && (
        <GameDetailSheet
          lid={lid}
          event={openEvent}
          entries={byEvent(openEvent.id)}
          entry={openEntry}
          name={`${nameOf.get(openEntry.playerId) ?? 'Jugador'} · ${eventLabel(openEvent)}`}
          onClose={() => setOpen(null)}
        >
          <GamePostSocial
            entry={openEntry}
            reactions={reactionsOf(openEntry.id)}
            comments={commentsOf(openEntry.id)}
            isMine={!!user && openEntry.playerId === myPlayerId}
            leave={closeThen(() => setOpen(null))}
            next={`/l/${lid}/partidos?juego=${encodeURIComponent(openEntry.id)}`}
          />
        </GameDetailSheet>
      )}
    </View>
  );
}

/** Una fecha jugada: su bloque (OCT / 6), el nombre (lleva al evento) y la lista de quienes jugaron. */
function EventGroup({
  event,
  dense,
  loading,
  posts,
  reactionsOf,
  commentsOf,
  onEvent,
  onOpen,
}: {
  event: BowlingEvent;
  dense: boolean;
  /** Todavía llegan los juegos (no decir «nadie anotó»). */
  loading: boolean;
  posts: FeedPost[];
  reactionsOf: (entryId: string) => Reaction[];
  commentsOf: (entryId: string) => GameComment[];
  onEvent: () => void;
  onOpen: (entryId: string) => void;
}) {
  const c = useColors();
  const label = eventLabel(event);
  const sub = eventLine(event, posts.length);
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${label}. ${sub}`}
        onPress={onEvent}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, marginHorizontal: 4, opacity: pressed ? 0.7 : 1 })}
      >
        <DateBlock date={event.date} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="section" numberOfLines={1} accessibilityRole="header">
            {label}
          </Txt>
          <Txt variant="meta" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {sub}
          </Txt>
        </View>
        <ChevronRight size={20} color={c.faint} />
      </Pressable>
      {posts.length === 0 && loading ? (
        <View style={{ height: 96, borderRadius: 24, backgroundColor: c.surface2 }} />
      ) : posts.length === 0 ? (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          {FEED_TEXT.noGames}
        </Txt>
      ) : (
        <Card padded={false}>
          {posts.map((p, i) => (
            <PostRow key={p.entry.id} post={p} dense={dense} first={i === 0} reactions={reactionsOf(p.entry.id)} comments={commentsOf(p.entry.id)} onOpen={() => onOpen(p.entry.id)} />
          ))}
        </Card>
      )}
    </View>
  );
}

/**
 * Quien jugó: sus iniciales (llevan a su perfil si tiene cuenta), su nombre, sus juegos en una línea con «Mejor juego» o
 * «Mejor serie» y cuántos me gusta y comentarios lleva, y la serie grande. Toda la fila abre su juego.
 */
function PostRow({
  post,
  dense,
  first,
  reactions,
  comments,
  onOpen,
}: {
  post: FeedPost;
  dense: boolean;
  first: boolean;
  reactions: Reaction[];
  comments: GameComment[];
  onOpen: () => void;
}) {
  const c = useColors();
  const { line, name, uid, badges } = post;
  const likes = reactions.length;
  const said = comments.length;
  const size = dense ? 36 : 40;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={postLabel(post)}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        { minHeight: dense ? 48 : 56, backgroundColor: pressed ? c.surface2 : 'transparent' },
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
      ]}
    >
      {/* Las iniciales llevan a su perfil (si tiene cuenta), no abren el juego. */}
      {uid ? (
        <Pressable accessibilityRole="link" accessibilityLabel={name} hitSlop={4} onPress={() => router.push({ pathname: '/u/[userId]', params: { userId: uid } })}>
          <Avatar name={name} size={size} />
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={name}>
          <Avatar name={name} size={size} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: dense ? 15 : 16 }}>
          {name}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2, marginTop: 2 }}>
          <Txt tone="muted" style={{ fontSize: dense ? 13 : 14, fontVariant: ['tabular-nums'] }}>
            {scoresLine(line.scores)}
          </Txt>
          {badges.map((b) => (
            <Txt key={b} tone="accent" style={{ fontSize: dense ? 13 : 14, fontFamily: font.semibold }}>
              {b}
            </Txt>
          ))}
          {(likes > 0 || said > 0) && (
            <View accessible accessibilityLabel={postCountsLabel(likes, said)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {likes > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Heart size={14} color={c.faint} />
                  <Txt tone="faint" style={{ fontSize: dense ? 13 : 14 }}>
                    {String(likes)}
                  </Txt>
                </View>
              )}
              {said > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <MessageCircle size={14} color={c.faint} />
                  <Txt tone="faint" style={{ fontSize: dense ? 13 : 14 }}>
                    {String(said)}
                  </Txt>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
      <Txt style={{ fontFamily: font.bold, fontSize: dense ? 19 : 22, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>{String(line.scratch)}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
