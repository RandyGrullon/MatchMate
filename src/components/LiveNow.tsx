import { Link } from 'react-router';
import { CalendarDays, CheckCircle2, ClipboardList, Clock, PencilLine, Smartphone, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import type { LeagueFeed } from '../lib/data';
import { draftCount, useDraft } from '../lib/draft';
import { eventLabel } from '../lib/format';
import { liveGames, type LiveGame } from '../lib/live';
import type { BowlingEvent } from '../lib/types';
import { useNow } from '../lib/useNow';
import { useNotifications } from './Notifications';
import { Card, cx } from './ui';

const primary =
  'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold whitespace-nowrap text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.98]';
const secondary =
  'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-fg transition hover:bg-surface-2 active:scale-[0.98]';

/**
 * "En juego ahora" en el Home: los eventos de tus ligas que se están jugando (desde 30 minutos antes
 * de la hora de la liga hasta la medianoche), con acceso directo para anotar y ver cómo van todos.
 */
export function LiveNow() {
  const { feeds, leagues } = useNotifications();
  const now = useNow();
  const games = liveGames(feeds, leagues, now);
  if (!games.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="En juego ahora" data-tour="en-juego">
      {games.map((g) => (
        <LiveCard key={`${g.feed.lid}:${g.event.id}`} game={g} />
      ))}
    </section>
  );
}

function LiveCard({ game }: { game: LiveGame }) {
  const { feed, league, event, info } = game;
  return (
    <Card className="animate-fade-up overflow-hidden border-ok/40">
      <div className="flex items-center gap-2 bg-ok-soft/60 px-4 py-2 text-xs font-semibold text-ok">
        <span className="live-dot" />
        {info.startsSoon ? `Empieza a las ${info.startLabel}` : 'En juego ahora'}
        {!info.startsSoon && info.startLabel && <span className="ml-auto font-normal text-muted">desde las {info.startLabel}</span>}
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            {event.type === 'torneo' ? <Trophy className="size-5" /> : <CalendarDays className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            {/* En un torneo sin liga el nombre del evento ya es el del torneo. */}
            {league.kind !== 'torneo' && <p className="truncate text-xs font-medium text-muted">{league.name}</p>}
            <p className="truncate font-semibold">{eventLabel(event)}</p>
            <p className="text-xs text-muted">{event.games} juegos</p>
          </div>
        </div>
        <LiveActions feed={feed} event={event} />
        <Link to={`/l/${feed.lid}`} className="self-center text-sm font-medium text-accent">
          Ver cómo van todos
        </Link>
      </div>
    </Card>
  );
}

/**
 * Lo que puede hacer la cuenta en el evento en juego: el jugador anota sus juegos (en su teléfono) y
 * ve si ya los envió; el admin o el anotador anota los de todos.
 */
export function LiveActions({ feed, event }: { feed: LeagueFeed; event: BowlingEvent }) {
  const draft = useDraft(feed.lid, feed.playerId, event.id);
  const typed = draftCount(draft);
  const subs = feed.mySubs.filter((s) => s.eventId === event.id);
  const pending = subs.some((s) => s.status === 'pendiente');
  const approved = subs.some((s) => s.status === 'aprobado');
  const staff = feed.isAdmin || feed.isScorer;
  // Cada cuenta anota sus juegos en su teléfono y los envía a revisión (el dueño y los admins también
  // juegan); el admin o el anotador, además, anota los de todos en la tabla. En un torneo, quien lo
  // organiza juega solo si ya empezó sus juegos (si no, lo suyo es anotar los de todos).
  const staffTorneo = staff && event.type === 'torneo';
  const player = !!feed.playerId && (!staffTorneo || typed > 0 || subs.length > 0);
  const eventUrl = `/l/${feed.lid}/e/${event.id}`;

  const status: { icon: LucideIcon; text: string; tone: string } | null = !player
    ? null
    : typed > 0
      ? { icon: Smartphone, text: `${typed} de ${event.games} anotados en tu teléfono · falta enviarlos`, tone: 'text-accent' }
      : pending
        ? { icon: Clock, text: 'Enviado · el admin lo está revisando', tone: 'text-warn' }
        : approved
          ? { icon: CheckCircle2, text: 'El admin aprobó tus juegos', tone: 'text-ok' }
          : null;

  return (
    <>
      {status && (
        <p className={cx('flex items-center gap-1.5 text-sm', status.tone)}>
          <status.icon className="size-4 shrink-0" /> {status.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {player &&
          (pending && typed === 0 ? (
            <Link to={eventUrl} className={secondary}>
              <UserRound className="size-4" /> Ver mis juegos
            </Link>
          ) : (
            <Link to={`${eventUrl}?anotar=1`} className={primary}>
              <PencilLine className="size-4" /> {typed > 0 ? 'Seguir anotando' : 'Anotar mis juegos'}
            </Link>
          ))}
        {!feed.playerId && !staff && (
          <Link to={`/l/${feed.lid}/perfil`} className={primary}>
            <UserRound className="size-4" /> Preparar mi jugador
          </Link>
        )}
        {staff && (
          <Link to={`${eventUrl}?tab=juegos`} className={player ? secondary : primary}>
            <ClipboardList className="size-4" /> {feed.isAdmin ? 'Anotar juegos' : 'Anotar juegos del torneo'}
          </Link>
        )}
      </div>
    </>
  );
}
