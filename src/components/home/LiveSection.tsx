import { Link } from 'react-router';
import { ArrowRight, CalendarClock, CalendarDays, Repeat, Trophy } from 'lucide-react';
import { startsInText, type CalendarItem, type NextMatchInfo } from '../../lib/calendar';
import type { Match } from '../../lib/data/matches';
import { eventLabel } from '../../lib/format';
import type { LiveGame, LiveMatchItem } from '../../lib/live';
import { SportIcon } from '../../pages/sports/SportBits';
import { LiveActions } from '../LiveNow';
import { LiveMatchesCard, NextMatchCard } from '../LiveNowMatches';
import { Badge, Card } from '../ui';
import { itemTime, whenLabel, type NextUp } from './logic';
import { SportTint } from './SportTint';

/**
 * «En juego ahora»: los eventos del boliche de mis ligas que se están jugando (anotar y ver cómo van) y los partidos
 * en vivo de mis ligas de raqueta y equipos (los míos primero). Nada si no hay nada en juego.
 */
export function LiveSection({ games, matches }: { games: readonly LiveGame[]; matches: readonly LiveMatchItem<Match>[] }) {
  if (!games.length && !matches.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="En juego ahora" data-tour="en-juego">
      {games.map((g) => (
        <LiveGameCard key={`${g.feed.lid}:${g.event.id}`} game={g} />
      ))}
      <LiveMatchesCard items={matches} />
    </section>
  );
}

function LiveGameCard({ game }: { game: LiveGame }) {
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
          <SportTint sport="bowling" className="shrink-0">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              {event.type === 'torneo' ? <Trophy className="size-5" /> : <SportIcon sport="bowling" className="size-5" />}
            </span>
          </SportTint>
          <div className="min-w-0 flex-1">
            {/* En un torneo sin liga el nombre del evento ya es el del torneo. */}
            {league.kind !== 'torneo' && <p className="truncate text-xs font-medium text-muted">{league.name}</p>}
            <p className="truncate font-semibold">{eventLabel(event)}</p>
            <p className="text-xs text-muted">{event.games} juegos</p>
          </div>
        </div>
        <LiveActions feed={feed} event={event} />
        <Link to={`/l/${feed.lid}`} className="inline-flex min-h-11 items-center justify-center self-center text-sm font-medium text-accent">
          Ver cómo van todos
        </Link>
      </div>
    </Card>
  );
}

/** «Tu próximo partido» o «Tu próximo evento»: lo que empieza antes en mis ligas (del deporte o de todos). */
export function NextUpCard({ next, today, now }: { next: NextUp<Match>; today: string; now: number }) {
  if (!next) return null;
  if (next.kind === 'match') {
    return (
      <SportTint sport={next.match.sport}>
        <NextMatchCard next={next.match as NextMatchInfo<Match>} />
      </SportTint>
    );
  }
  return <NextEventCard item={next.event} today={today} now={now} />;
}

function NextEventCard({ item, today, now }: { item: CalendarItem; today: string; now: number }) {
  const minutesLeft = item.minutes == null ? null : Math.ceil((itemTime(item) - now) / 60_000);
  const soon = item.date === today && minutesLeft != null ? startsInText(minutesLeft) : item.date === today ? 'Hoy' : null;
  const torneo = item.type === 'torneo';
  const where = [item.leagueName, !item.eventId ? 'según el horario' : ''].filter(Boolean).join(' · ');
  return (
    <SportTint sport={item.sport}>
      <Link
        to={item.href}
        aria-label={`Tu próximo evento: ${item.name}, ${whenLabel(item, today)}, ${item.leagueName}`}
        className="animate-fade-up flex flex-col gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-4 transition hover:brightness-105"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
            <CalendarClock className="size-4" /> Tu próximo evento
          </span>
          {soon && (
            <Badge tone={minutesLeft != null && minutesLeft <= 60 ? 'warn' : 'accent'} className="ml-auto">
              {soon}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
            {torneo ? (
              <Trophy className="size-5" />
            ) : item.sport === 'bowling' ? (
              <CalendarDays className="size-5" />
            ) : (
              <SportIcon sport={item.sport} className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{item.name}</p>
            <p className="flex items-center gap-1 truncate text-sm text-muted">
              {!item.eventId && <Repeat className="size-3.5 shrink-0" />}
              <span className="truncate">{where}</span>
            </p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-accent" />
        </div>
        <p className="text-sm">
          <span className="font-semibold">{whenLabel({ date: item.date, time: null }, today)}</span>
          {item.time && ` · ${item.time}`}
          {item.going && <span className="ml-2 font-medium text-ok">· Vas</span>}
        </p>
      </Link>
    </SportTint>
  );
}
