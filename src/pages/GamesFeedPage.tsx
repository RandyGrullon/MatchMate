import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Heart, MessageCircle, MessageCircleHeart } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCommentsOfEvents, useEntriesOfEvents, useEvents, usePlayers, useReactionsOfEvents } from '../lib/data';
import { eventLabel, parseDate, toIsoDate, typeLabel } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveInfo } from '../lib/live';
import { entryLine, type Line } from '../lib/stats';
import type { BowlingEvent, Entry, GameComment, Player, Reaction } from '../lib/types';
import { useNow } from '../lib/useNow';
import { GameDetailModal } from '../components/event/GameDetailModal';
import { LiveDot } from '../components/home/TodayCard';
import { useIsPro } from '../components/mode';
import { ScreenTitle } from '../components/screens/ScreenBits';
import { PostSocial } from '../components/social/Social';
import { UserLink } from '../components/social/UserLink';
import { Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, Skeleton, cx } from '../components/ui';

/** Eventos pasados que se muestran de a poco. */
const PAGE = 4;

/** Un juego del evento para el muro: la línea del jugador y sus distinciones. */
interface Post {
  entry: Entry;
  line: Line;
  name: string;
  /** Cuenta del jugador (su perfil `/u/:id`); null si no tiene cuenta. */
  uid: string | null;
  badges: string[];
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Debajo del nombre del evento: «Martes · práctica · 6 jugaron». */
export function eventLine(event: Pick<BowlingEvent, 'date' | 'type'>, players: number): string {
  const day = WEEKDAYS[parseDate(event.date).getDay()];
  return [day, typeLabel(event.type).toLowerCase(), players > 0 && `${players} ${players === 1 ? 'jugó' : 'jugaron'}`].filter(Boolean).join(' · ');
}

/**
 * Resultados anteriores de la liga (`/l/:lid/juegos`, rediseño «Calma y foco»): «‹ Liga de los martes», el título y una
 * línea. Lo de hoy es una fila que lleva a la práctica (ahí está «Cómo van todos»: la tabla en vivo ya no se repite
 * aquí). Debajo, cada fecha jugada con su bloque (OCT / 6) y una lista de quienes jugaron, de la mejor serie a la peor:
 * sus juegos en una línea, la serie grande, «Mejor juego» o «Mejor serie», y cuántos me gusta y comentarios tiene.
 * Tocar a alguien abre su juego para dar me gusta, felicitar o comentar; tocar sus iniciales, su perfil. Quien faltó ve
 * cómo le fue a los demás. `?juego=evento_jugador` (un aviso) abre ese juego aunque sea viejo.
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

  const played = useMemo(() => [...events.data].filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date)), [events.data, today]);
  const todays = played.filter((e) => e.date === today);
  const past = played.filter((e) => e.date < today);
  const visiblePast = past.slice(0, shown);

  // Juego abierto desde un aviso (?juego=evento_jugador): su evento se carga aunque sea viejo.
  const open = params.get('juego');
  const openEventId = open ? open.slice(0, open.indexOf('_')) : null;
  const ids = useMemo(() => {
    const list = [...todays, ...visiblePast].map((e) => e.id);
    if (openEventId && !list.includes(openEventId)) list.push(openEventId);
    return list;
  }, [todays, visiblePast, openEventId]);

  const entries = useEntriesOfEvents(lid, ids);
  const reactions = useReactionsOfEvents(lid, ids);
  const comments = useCommentsOfEvents(lid, ids);
  const nameOf = useMemo(() => new Map(players.data.map((p: Player) => [p.id, p.name])), [players.data]);
  // Los menores nunca tienen cuenta ni perfil público.
  const uidOf = useMemo(() => new Map(players.data.flatMap((p: Player) => (p.uid && !p.isMinor ? [[p.id, p.uid] as const] : []))), [players.data]);

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
  const urlOf = (ev: BowlingEvent) => (league.kind === 'torneo' ? base : `${base}/e/${ev.id}`);

  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title="Resultados anteriores" hint="Toca a alguien para felicitarlo o comentar" pro={pro} />

      <div className={cx('mt-5 flex flex-col', pro ? 'gap-6' : 'gap-[26px]')}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : played.length === 0 ? (
          <Card className="flex flex-col items-center px-5 py-8 text-center">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <MessageCircleHeart className="size-7" />
            </span>
            <h2 className="mt-4 text-card-title">Todavía no hay juegos</h2>
            <p className="mt-2 max-w-sm text-body text-muted">Cuando se juegue una práctica o un torneo, sale aquí.</p>
          </Card>
        ) : (
          <>
            {/* Hoy: una fila a la práctica (ahí se ve en vivo cómo van todos), no otra tabla en vivo. */}
            {todays.length > 0 && (
              <Card soft className="overflow-hidden">
                {todays.map((ev) => {
                  const info = liveInfo(ev, league, now);
                  const playing = byEvent(ev.id).length;
                  return (
                    <ListRow
                      key={ev.id}
                      dense={pro}
                      to={urlOf(ev)}
                      leading={<DateBlock date={ev.date} raised />}
                      title={eventLabel(ev)}
                      subtitle={
                        info.live ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                            <LiveDot /> En juego{playing > 0 ? ` · ${playing} jugando` : ''}
                          </span>
                        ) : info.startLabel ? (
                          `Hoy a las ${info.startLabel}`
                        ) : (
                          'Hoy'
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
                Ver fechas más viejas
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

/** Juegos de cada jugador del evento, de la mejor serie a la peor, con sus distinciones. */
function postsOf(event: BowlingEvent, entries: Entry[], nameOf: Map<string, string>, uidOf: Map<string, string>, live: boolean): Post[] {
  // En juego se ven también los juegos sin verificar (en vivo); en los pasados, solo los que cuentan.
  const lines = entries.map((entry) => ({ entry, line: entryLine(entry, event, live) })).filter((p) => p.line.games > 0);
  const many = lines.length > 1;
  const best = Math.max(0, ...lines.map((p) => p.line.high));
  const bestSeries = Math.max(0, ...lines.map((p) => p.line.scratch));
  return lines
    .map(({ entry, line }) => {
      const badges: string[] = [];
      if (line.high === 300) badges.push('¡Juego perfecto!');
      else if (many && line.high === best) badges.push('Mejor juego');
      if (many && line.games > 1 && line.scratch === bestSeries) badges.push('Mejor serie');
      return { entry, line, name: nameOf.get(entry.playerId) ?? '(jugador borrado)', uid: uidOf.get(entry.playerId) ?? null, badges };
    })
    .sort((a, b) => b.line.scratch - a.line.scratch || b.line.high - a.line.high);
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
        <p className="mx-1 text-meta text-muted">Nadie anotó juegos en esta fecha.</p>
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

/** «176 · 195 · 203 · 192»: los juegos que cuentan, en una línea. */
export const scoresLine = (scores: readonly (number | null)[]): string => scores.filter((s): s is number => s != null).join(' · ');

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
      ariaLabel={`Ver el juego de ${name}: ${line.games > 1 ? `serie ${line.scratch}` : `${line.scratch} pinos`}`}
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
            <span aria-label={[likes > 0 && `${likes} reacciones`, said > 0 && `${said} comentarios`].filter(Boolean).join(', ')} className="inline-flex items-center gap-2 text-faint">
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
