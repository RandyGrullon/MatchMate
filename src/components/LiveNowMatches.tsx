import { Link } from 'react-router';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { startsInText, type NextMatchInfo } from '../lib/calendar';
import type { Match } from '../lib/data/matches';
import type { LiveMatchItem } from '../lib/live';
import { SportIcon } from '../pages/sports/SportBits';
import { Badge, Card, cx } from './ui';

/**
 * Lo de los partidos (raqueta y equipos) en el Home: «En juego ahora» con los partidos en vivo de tus ligas y
 * «Tu próximo partido». Los datos los arma el Home (useMyMatches y useLiveMatches) con src/lib/live.ts y
 * src/lib/calendar.ts; aquí solo se dibujan.
 */

/** Partidos en vivo que se ven de una (los demás se cuentan abajo). */
export const LIVE_MATCH_ROWS = 4;

const sideLabel = (m: Pick<Match, 'sides'>, side: 1 | 2) => m.sides.find((s) => s.side === side)?.label.trim() || 'Por definir';

/** «En juego ahora»: los partidos en vivo de tus ligas, los tuyos primero. Tocar uno lo abre. */
export function LiveMatchesCard({ items }: { items: readonly LiveMatchItem<Match>[] }) {
  if (!items.length) return null;
  const shown = items.slice(0, LIVE_MATCH_ROWS);
  const rest = items.length - shown.length;
  return (
    <Card className="animate-fade-up overflow-hidden border-ok/40">
      <div className="flex items-center gap-2 bg-ok-soft/60 px-4 py-2 text-xs font-semibold text-ok">
        <span className="live-dot" />
        En juego ahora
        <span className="ml-auto font-normal text-muted">{items.length === 1 ? '1 partido' : `${items.length} partidos`}</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((it) => (
          <li key={it.match.id}>
            <LiveMatchRow item={it} />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Y {rest} {rest === 1 ? 'partido más' : 'partidos más'} en vivo en tus ligas.
        </p>
      )}
    </Card>
  );
}

function LiveMatchRow({ item }: { item: LiveMatchItem<Match> }) {
  const { match: m, league, sport, href, mine, score, detail } = item;
  return (
    <Link
      to={href}
      aria-label={`${item.title}${score ? `, ${score}` : ''}, ${league.name}${mine ? ', tu partido' : ''}`}
      className={cx('flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2', mine && 'bg-accent-soft/40')}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
        <SportIcon sport={sport} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {sideLabel(m, 1)} <span className="font-normal text-muted">vs.</span> {sideLabel(m, 2)}
        </span>
        <span className="block truncate text-xs text-muted">{[league.name, detail].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {score && <span className="text-sm font-bold tabular-nums">{score}</span>}
        {mine && <Badge tone="accent">Tu partido</Badge>}
      </span>
    </Link>
  );
}

/** «Tienes 2 partidos más en los próximos 7 días». */
const moreText = (n: number) => `Tienes ${n} ${n === 1 ? 'partido más' : 'partidos más'} en los próximos 7 días.`;

/**
 * «Tu próximo partido» en todas tus ligas: contra quién, la liga, dónde, el día y la hora (en la zona de la liga) y,
 * si falta poco, cuánto. Toda la tarjeta abre el partido.
 */
export function NextMatchCard({ next }: { next: NextMatchInfo<Match> }) {
  const soon = startsInText(next.minutesLeft);
  const where = [next.league.name, next.detail].filter(Boolean).join(' · ');
  return (
    <Link
      to={next.href}
      aria-label={`Tu próximo partido: ${next.title}, ${next.dayLabel} a las ${next.time}, ${where}`}
      className="animate-fade-up flex flex-col gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-4 transition hover:brightness-105"
    >
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <CalendarClock className="size-4" /> Tu próximo partido
        </span>
        {soon && (
          <Badge tone={next.minutesLeft <= 60 ? 'warn' : 'accent'} className="ml-auto">
            {soon}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <SportIcon sport={next.sport} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{next.title}</p>
          <p className="truncate text-sm text-muted">{where}</p>
        </div>
        <ArrowRight className="size-5 shrink-0 text-accent" />
      </div>
      <p className="text-sm">
        <span className="font-semibold">{next.dayLabel}</span> · {next.time}
      </p>
      {next.more > 0 && <p className="-mt-2 text-xs text-muted">{moreText(next.more)}</p>}
    </Link>
  );
}
