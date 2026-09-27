import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarDays, ChevronRight, Flame, History, MessageCircleHeart, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCommentsOfEvents, useEntriesOfEvents, useEvents, usePlayers, useReactionsOfEvents } from '../lib/data';
import { eventLabel, formatDateLong, toIsoDate, typeLabel } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveInfo } from '../lib/live';
import { entryLine, type Line } from '../lib/stats';
import type { BowlingEvent, Entry, GameComment, Player, Reaction } from '../lib/types';
import { useNow } from '../lib/useNow';
import { Avatar } from '../components/Avatar';
import { GameDetailModal } from '../components/event/GameDetailModal';
import { LiveBoard } from '../components/LiveBoard';
import { PostSocial, ReactionBar } from '../components/social/Social';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Skeleton, cx } from '../components/ui';

/** Eventos pasados que se muestran de a poco. */
const PAGE = 4;

/** Un juego del evento para el muro: la línea del jugador y sus distinciones. */
interface Post {
  entry: Entry;
  line: Line;
  name: string;
  badges: string[];
}

/**
 * Juegos de la liga, como un muro: lo que se está jugando hoy y los juegos pasados de todos.
 * Quien faltó ve cómo le fue a los demás; cualquiera de la liga felicita, da me gusta y comenta.
 */
export default function GamesFeedPage() {
  const { lid, league, base, myPlayerId } = useLeagueCtx();
  const { user } = useAuth();
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
  const group = (ev: BowlingEvent, live: boolean, startsAt?: string | null) => (
    <EventGroup
      key={ev.id}
      event={ev}
      live={live}
      loading={entries.loading}
      startsAt={startsAt}
      posts={postsOf(ev, byEvent(ev.id), nameOf, live)}
      reactionsOf={reactionsOf}
      commentsOf={commentsOf}
      eventUrl={league.kind === 'torneo' ? base : `${base}/e/${ev.id}`}
      onOpen={setOpen}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <MessageCircleHeart className="size-6 text-accent" /> Juegos de la liga
        </h1>
        <p className="text-sm text-muted">Mira cómo le fue a cada uno, felicita y comenta.</p>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : played.length === 0 ? (
        <Empty icon={<MessageCircleHeart className="size-8" />} title="Todavía no hay juegos">
          Cuando se jueguen los torneos y prácticas, aquí salen los juegos de todos para felicitar y comentar.
        </Empty>
      ) : (
        <>
          {todays.length > 0 && (
            <section className="flex flex-col gap-3" aria-label="En juego ahora">
              {/* En juego: el tablero en vivo de todos (tocar un juego que ya está en la tabla para felicitar). */}
              {todays.map((ev) => {
                const info = liveInfo(ev, league, now);
                return info.live ? <LiveBoard key={ev.id} event={ev} info={info} onOpen={setOpen} /> : group(ev, false, info.startLabel ?? '');
              })}
            </section>
          )}

          {past.length > 0 && (
            <section className="flex flex-col gap-3" aria-label="Juegos pasados">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
                <History className="size-4" /> Juegos pasados
              </h2>
              {visiblePast.map((ev) => group(ev, false))}
              {past.length > visiblePast.length && (
                <Button className="self-center" onClick={() => setShown((n) => n + PAGE)}>
                  Ver juegos más viejos
                </Button>
              )}
            </section>
          )}
        </>
      )}

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
function postsOf(event: BowlingEvent, entries: Entry[], nameOf: Map<string, string>, live: boolean): Post[] {
  // En juego se ven también los juegos sin verificar (en vivo); en los pasados, solo los que cuentan.
  const lines = entries.map((entry) => ({ entry, line: entryLine(entry, event, live) })).filter((p) => p.line.games > 0);
  const many = lines.length > 1;
  const best = Math.max(0, ...lines.map((p) => p.line.high));
  const bestSeries = Math.max(0, ...lines.map((p) => p.line.scratch));
  return lines
    .map(({ entry, line }) => {
      const badges: string[] = [];
      if (line.high === 300) badges.push('🎳 ¡Juego perfecto!');
      else if (many && line.high === best) badges.push('🏆 Mejor juego');
      if (many && line.games > 1 && line.scratch === bestSeries) badges.push('🥇 Mejor serie');
      return { entry, line, name: nameOf.get(entry.playerId) ?? '(jugador borrado)', badges };
    })
    .sort((a, b) => b.line.scratch - a.line.scratch || b.line.high - a.line.high);
}

function EventGroup({
  event,
  live,
  loading,
  startsAt,
  posts,
  reactionsOf,
  commentsOf,
  eventUrl,
  onOpen,
}: {
  event: BowlingEvent;
  live: boolean;
  /** Todavía llegan los juegos (no decir "nadie anotó"). */
  loading: boolean;
  /** Evento de hoy que aún no empieza: su hora ('' si la liga no tiene hora). */
  startsAt?: string | null;
  posts: Post[];
  reactionsOf: (entryId: string) => Reaction[];
  commentsOf: (entryId: string) => GameComment[];
  eventUrl: string;
  onOpen: (entryId: string) => void;
}) {
  const isTorneo = event.type === 'torneo';
  return (
    <div className="flex flex-col gap-2">
      <Link to={eventUrl} className="group flex items-center gap-2 rounded-xl px-1 py-1">
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', live ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-accent')}>
          {isTorneo ? <Trophy className="size-4" /> : <CalendarDays className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{eventLabel(event)}</span>
          <span className="block text-xs text-muted first-letter:uppercase">
            {formatDateLong(event.date)} · {typeLabel(event.type)}
          </span>
        </span>
        {live && (
          <Badge tone="ok">
            <span className="live-dot" /> En juego
          </Badge>
        )}
        <ChevronRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
      </Link>
      {posts.length === 0 && loading ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : posts.length === 0 ? (
        <Card className="px-4 py-3 text-sm text-muted">
          {startsAt != null
            ? `Hoy se juega${startsAt ? ` a las ${startsAt}` : ''}. Cuando empiece, aquí ves en vivo cómo va cada uno.`
            : live
              ? 'Todavía no hay juegos anotados. Aparecen aquí en vivo.'
              : 'Nadie anotó juegos en este evento.'}
        </Card>
      ) : (
        <div className="stagger flex flex-col gap-2">
          {posts.map((p, i) => (
            <PostCard key={p.entry.id} post={p} i={i} live={live} reactions={reactionsOf(p.entry.id)} comments={commentsOf(p.entry.id)} onOpen={() => onOpen(p.entry.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  i,
  live,
  reactions,
  comments,
  onOpen,
}: {
  post: Post;
  i: number;
  live: boolean;
  reactions: Reaction[];
  comments: GameComment[];
  onOpen: () => void;
}) {
  const { entry, line, name, badges } = post;
  return (
    <Card className="flex flex-col gap-2 px-3 pt-3 pb-1.5" style={{ '--i': i } as CSSProperties}>
      <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{name}</span>
            {badges.map((b) => (
              <span key={b} className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
                {b}
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {line.scores.map((s, k) =>
              s == null ? null : (
                <span
                  key={k}
                  className={cx(
                    'inline-flex min-w-11 items-center justify-center rounded-lg px-2 py-1 text-sm font-bold tabular-nums',
                    s >= 200 ? 'bg-accent text-accent-fg' : 'bg-surface-2',
                    live && !line.verified[k] && 'opacity-70',
                  )}
                  title={`Juego ${k + 1}${live && !line.verified[k] ? ' (sin verificar)' : ''}`}
                >
                  {s >= 200 && <Flame className="mr-0.5 size-3" />}
                  {s}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg leading-tight font-bold tabular-nums">{line.scratch}</div>
          <div className="text-[11px] text-muted">
            {line.games > 1 ? 'Serie' : 'Pinos'} · prom {line.avg}
          </div>
        </div>
      </button>
      <div className="border-t border-line pt-1">
        <ReactionBar entry={entry} reactions={reactions} comments={comments} onComments={onOpen} />
      </div>
    </Card>
  );
}
