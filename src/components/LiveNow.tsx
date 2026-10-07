import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CheckCircle2, ClipboardList, Clock, PencilLine, Send, Smartphone, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import type { LeagueFeed } from '../lib/data';
import type { Match } from '../lib/data/matches';
import { eventLabel, toIsoDate } from '../lib/format';
import { liveGames, liveMatches, type LiveGame } from '../lib/live';
import type { BowlingEvent } from '../lib/types';
import { useIsPro } from '../lib/useMode';
import { nextGameLabel, sheetPath, useNextGame, type NextGame, type TodayGames } from '../lib/useNextGame';
import { useNow } from '../lib/useNow';
import { LiveMatchesCard } from './LiveNowMatches';
import { useNotifications } from './Notifications';
import { Card, cx } from './ui';

const primary =
  'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold whitespace-nowrap text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.98]';
const secondary =
  'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-fg transition hover:bg-surface-2 active:scale-[0.98]';

/**
 * "En juego ahora" en el Home: los eventos del boliche de tus ligas que se están jugando (desde 30 minutos antes
 * de la hora de la liga hasta la medianoche), con acceso directo para anotar y ver cómo van todos, y los partidos
 * en vivo de tus ligas de raqueta y equipos (`live` = useLiveMatches, `mine` = useMyMatches; los tuyos primero).
 */
export function LiveNow({ live = [], mine = [] }: { live?: readonly Match[]; mine?: readonly Match[] }) {
  const { feeds, leagues } = useNotifications();
  const now = useNow();
  const games = liveGames(feeds, leagues, now);
  const matches = liveMatches(live, mine, leagues, now.getTime());
  if (!games.length && !matches.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="En juego ahora" data-tour="en-juego">
      {games.map((g) => (
        <LiveCard key={`${g.feed.lid}:${g.event.id}`} game={g} />
      ))}
      <LiveMatchesCard items={matches} />
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

/** Ícono del botón del jugador según lo que hace (como en Hoy). */
const NEXT_ICON: Record<NextGame['kind'], LucideIcon> = {
  medias: PencilLine,
  anotar: PencilLine,
  enviar: Send,
  ver: UserRound,
  preparar: UserRound,
  planilla: ClipboardList,
};

/** La línea de cómo van sus juegos: en el teléfono sin enviar, enviados o ya en la tabla (null: nada que decir). */
export function liveStatus(mine: Pick<TodayGames, 'cells' | 'next'>, games: number): { icon: LucideIcon; text: string; tone: string } | null {
  const inPhone = mine.cells.filter((c) => c.kind === 'telefono').length;
  if (inPhone > 0) return { icon: Smartphone, text: `${inPhone} de ${games} anotados en tu teléfono · falta enviarlos`, tone: 'text-accent' };
  if (mine.cells.some((c) => c.kind === 'enviado')) return { icon: Clock, text: 'Enviado · el admin lo está revisando', tone: 'text-warn' };
  // «Ya en la tabla» solo cuando no queda ningún juego por anotar (ni uno a medias).
  if (mine.next.kind === 'ver' && mine.cells.length > 0 && mine.cells.every((c) => c.kind === 'tabla'))
    return { icon: CheckCircle2, text: 'Tus juegos ya están en la tabla', tone: 'text-ok' };
  return null;
}

/**
 * Lo que puede hacer la cuenta en el evento en juego, con los mismos textos que Hoy (useNextGame): el jugador sigue el
 * juego que dejó a medias («Seguir mi juego 3»), anota el que sigue («Anotar juego 3»), envía los del teléfono o ve los
 * suyos; quien no tiene jugador lo prepara. El admin o el anotador, además, anota los de todos (la planilla): en Pro, al
 * lado; en Lite, solo si no juega (si juega, lo suyo es su botón; la planilla sigue en la práctica y en Pro).
 */
export function LiveActions({ feed, event, today: day }: { feed: LeagueFeed; event: BowlingEvent; today?: string }) {
  const now = useNow();
  const today = day ?? toIsoDate(now);
  const game = useMemo(() => ({ feed, event }), [feed, event]);
  const mine = useNextGame(game, today);
  const pro = useIsPro();
  if (!mine) return null;
  const { next } = mine;
  const staff = feed.isAdmin || feed.isScorer;
  const status = next.kind === 'planilla' || next.kind === 'preparar' ? null : liveStatus(mine, event.games);
  const NextIcon = NEXT_ICON[next.kind];
  const sheet = staff && next.kind !== 'planilla' && pro;

  return (
    <>
      {status && (
        <p className={cx('flex items-center gap-1.5 text-sm', status.tone)}>
          <status.icon className="size-4 shrink-0" /> {status.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link to={next.to} className={next.kind === 'ver' ? secondary : primary}>
          <NextIcon className="size-4" /> {nextGameLabel(next)}
        </Link>
        {sheet && (
          <Link to={sheetPath(feed.lid, event.id)} className={secondary}>
            <ClipboardList className="size-4" /> {feed.isAdmin ? 'Anotar juegos' : 'Anotar juegos del torneo'}
          </Link>
        )}
      </div>
    </>
  );
}
