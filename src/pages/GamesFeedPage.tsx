import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Heart, MessageCircle, MessageCircleHeart } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCommentsOfEvents, useEntriesOfEvents, useEvents, usePlayers, useReactionsOfEvents } from '../lib/data';
import { eventLabel, toIsoDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveInfo } from '../lib/live';
import type { BowlingEvent, GameComment, Reaction } from '../lib/types';
import { useNow } from '../lib/useNow';
import { GameDetailModal } from '../components/event/GameDetailModal';
import { LiveDot } from '../components/home/TodayCard';
import { useIsPro } from '../components/mode';
import { ScreenTitle } from '../components/screens/ScreenBits';
import { PostSocial } from '../components/social/Social';
import { UserLink } from '../components/social/UserLink';
import { Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, Skeleton, cx } from '../components/ui';
import {
  FEED_PAGE as PAGE,
  FEED_TEXT,
  eventLine,
  feedEventIds,
  feedEventUrl,
  feedPeople,
  feedPosts as postsOf,
  openEventIdOf,
  playedEvents,
  postCountsLabel,
  postLabel,
  scoresLine,
  todayLine,
  type FeedPost as Post,
} from './gamesFeed';

// La lógica (qué fechas, quiénes jugaron y sus distinciones, los textos) está en gamesFeed.ts: la usa también la app.
export { eventLine, scoresLine };

/**
 * Resultados anteriores de la liga (`/l/:lid/juegos`, rediseño «Calma y foco»): «‹ Liga de los martes», el título y una
 * línea. Lo de hoy es una fila que lleva a la práctica (ahí está «Cómo van todos»: la tabla en vivo ya no se repite
 * aquí). Debajo, cada fecha jugada con su bloque (OCT / 6) y una lista de quienes jugaron, de la mejor serie a la peor:
 * sus juegos en una línea, la serie grande, «Mejor juego» o «Mejor serie», y cuántos me gusta y comentarios tiene.
 * Tocar a alguien abre su juego para dar me gusta, felicitar o comentar; tocar sus iniciales, su perfil. Quien faltó ve
 * cómo le fue a los demás. `?juego=…&evento=…` (un aviso) abre ese juego aunque sea viejo.
 */
export default function GamesFeedPage() {
  const { lid, league, base, myPlayerId } = useLeagueCtx();
  const { user } = useAuth();
  const pro = useIsPro();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const today = toIsoDate(now);
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const [shown, setShown] = useState(PAGE);

  const { played, todays, past } = useMemo(() => playedEvents(events.data, today), [events.data, today]);
  const visiblePast = past.slice(0, shown);

  // Juego abierto desde un aviso (?juego=…&evento=…): su evento se carga aunque sea viejo.
  const open = params.get('juego');
  const openEventId = openEventIdOf(open, params.get('evento'));
  const ids = useMemo(() => feedEventIds([...todays, ...visiblePast], openEventId), [todays, visiblePast, openEventId]);

  const entries = useEntriesOfEvents(lid, ids);
  const reactions = useReactionsOfEvents(lid, ids);
  const comments = useCommentsOfEvents(lid, ids);
  // Los menores nunca tienen cuenta ni perfil público.
  const { nameOf, uidOf } = useMemo(() => feedPeople(players.data), [players.data]);

  const loadError = events.error ?? players.error ?? entries.error;
  if (loadError) return <LoadError error={loadError} />;

  const byEvent = (id: string) => entries.data.filter((e) => e.eventId === id);
  const reactionsOf = (entryId: string) => reactions.data.filter((r) => r.entryId === entryId);
  const commentsOf = (entryId: string) => comments.data.filter((c) => c.entryId === entryId);
  const openEntry = open ? entries.data.find((e) => e.id === open) ?? null : null;
  const openEvent = openEntry ? events.data.find((e) => e.id === openEntry.eventId) : undefined;
  const setOpen = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set('juego', id);
        else p.delete('juego');
        return p;
      },
      { replace: true },
    );

  const loading = events.loading || players.loading || (entries.loading && !entries.data.length);
  const urlOf = (ev: BowlingEvent) => feedEventUrl(league, base, ev);

  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title={FEED_TEXT.title} hint={FEED_TEXT.hint} pro={pro} />

      <div className={cx('mt-5 flex flex-col', pro ? 'gap-6' : 'gap-[26px]')}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : played.length === 0 ? (
          <Card className="flex flex-col items-center px-5 py-8 text-center">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <MessageCircleHeart className="size-7" />
            </span>
            <h2 className="mt-4 text-card-title">{FEED_TEXT.emptyTitle}</h2>
            <p className="mt-2 max-w-sm text-body text-muted">{FEED_TEXT.emptyText}</p>
          </Card>
        ) : (
          <>
            {/* Hoy: una fila a la práctica (ahí se ve en vivo cómo van todos), no otra tabla en vivo. */}
            {todays.length > 0 && (
              <Card soft className="overflow-hidden">
                {todays.map((ev) => {
                  const line = todayLine(liveInfo(ev, league, now), byEvent(ev.id).length);
                  return (
                    <ListRow
                      key={ev.id}
                      dense={pro}
                      to={urlOf(ev)}
                      leading={<DateBlock date={ev.date} raised />}
                      title={eventLabel(ev)}
                      subtitle={
                        line.live ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                            <LiveDot /> {line.text}
                          </span>
                        ) : (
                          line.text
                        )
                      }
                    />
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
                posts={postsOf(ev, byEvent(ev.id), nameOf, uidOf, false)}
                reactionsOf={reactionsOf}
                commentsOf={commentsOf}
                eventUrl={urlOf(ev)}
                onOpen={setOpen}
              />
            ))}
            {past.length > visiblePast.length && (
              <Button variant="quiet" size={pro ? 'lg' : 'xl'} className="w-full" onClick={() => setShown((n) => n + PAGE)}>
                {FEED_TEXT.more}
              </Button>
            )}
          </>
        )}
      </div>

      {openEntry && openEvent && (
        <GameDetailModal
          event={openEvent}
          entries={byEvent(openEvent.id)}
          entry={openEntry}
          name={`${nameOf.get(openEntry.playerId) ?? 'Jugador'} · ${eventLabel(openEvent)}`}
          onClose={() => setOpen(null)}
        >
          <PostSocial
            entry={openEntry}
            reactions={reactionsOf(openEntry.id)}
            comments={commentsOf(openEntry.id)}
            isMine={!!user && openEntry.playerId === myPlayerId}
          />
        </GameDetailModal>
      )}
    </div>
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
  eventUrl,
  onOpen,
}: {
  event: BowlingEvent;
  dense: boolean;
  /** Todavía llegan los juegos (no decir "nadie anotó"). */
  loading: boolean;
  posts: Post[];
  reactionsOf: (entryId: string) => Reaction[];
  commentsOf: (entryId: string) => GameComment[];
  eventUrl: string;
  onOpen: (entryId: string) => void;
}) {
  const titleId = `fecha-${event.id}`;
  return (
    <section aria-labelledby={titleId}>
      <Link
        to={eventUrl}
        className="mx-1 mb-3 flex min-h-11 items-center gap-3.5 rounded-2xl transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <DateBlock date={event.date} raised />
        <span className="min-w-0 flex-1">
          <span id={titleId} className="block truncate text-section">
            {eventLabel(event)}
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted">{eventLine(event, posts.length)}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
      </Link>
      {posts.length === 0 && loading ? (
        <Skeleton className="h-24 w-full rounded-3xl" />
      ) : posts.length === 0 ? (
        <p className="mx-1 text-meta text-muted">{FEED_TEXT.noGames}</p>
      ) : (
        <Card className="overflow-hidden">
          {posts.map((p) => (
            <PostRow key={p.entry.id} post={p} dense={dense} reactions={reactionsOf(p.entry.id)} comments={commentsOf(p.entry.id)} onOpen={() => onOpen(p.entry.id)} />
          ))}
        </Card>
      )}
    </section>
  );
}

/**
 * Quien jugó: sus iniciales (llevan a su perfil si tiene cuenta), su nombre, sus juegos en una línea con «Mejor juego» o
 * «Mejor serie» y cuántos me gusta y comentarios lleva, y la serie grande (o los pinos de un juego). Toda la fila abre su
 * juego (me gusta, felicitar y comentarios).
 */
function PostRow({
  post,
  dense,
  reactions,
  comments,
  onOpen,
}: {
  post: Post;
  dense: boolean;
  reactions: Reaction[];
  comments: GameComment[];
  onOpen: () => void;
}) {
  const { line, name, uid, badges } = post;
  const likes = reactions.length;
  const said = comments.length;
  return (
    <ListRow
      dense={dense}
      onClick={onOpen}
      ariaLabel={postLabel(post)}
      // Las iniciales van encima de la fila (z-[1]): llevan a su perfil, no abren el juego.
      leading={
        <span className="relative z-[1] shrink-0">
          <UserLink userId={uid} name={name} hideName avatarClassName={dense ? 'size-9 text-sm' : 'size-10 text-sm'} />
        </span>
      }
      title={name}
      subtitle={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="num">{scoresLine(line.scores)}</span>
          {badges.map((b) => (
            <span key={b} className="font-semibold text-accent">
              {b}
            </span>
          ))}
          {(likes > 0 || said > 0) && (
            <span aria-label={postCountsLabel(likes, said)} className="inline-flex items-center gap-2 text-faint">
              {likes > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Heart aria-hidden="true" className="size-3.5" />
                  {likes}
                </span>
              )}
              {said > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <MessageCircle aria-hidden="true" className="size-3.5" />
                  {said}
                </span>
              )}
            </span>
          )}
        </span>
      }
      value={line.scratch}
      chevron={false}
    />
  );
}
