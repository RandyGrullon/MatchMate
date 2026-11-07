import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import type { CalendarItem, CalendarMatch } from '../../lib/calendar';
import { setRsvp, type LeagueFeed } from '../../lib/data';
import { parseDate } from '../../lib/format';
import { WEEKDAY_SHORT } from '../../lib/schedule';
import type { League } from '../../lib/types';
import { SportBadge } from '../../pages/sports/SportBits';
import { canRsvpRow, clampWeek, dayCellLabel, dayHeading, dotKind, MAX_WEEKS, rowSubtitle, weekEmptyText, weekRange, weekTitle, weekView } from '../agenda/week';
import { useAction } from '../feedback';
import { SportMark } from '../SportMark';
import { Badge, Card, cx } from '../ui';
import { RsvpButton } from './RsvpButton';

// La semana (días, fechas y textos) sale de agenda/week.ts: la misma de la app del teléfono.

/** Color del puntito de cada día: torneo, partido o lo demás. */
const DOT = { match: 'bg-ok', torneo: 'bg-warn', otro: 'bg-accent' } as const;
const dotTone = (it: CalendarItem) => DOT[dotKind(it)];

/**
 * La semana (lunes a domingo) de mis ligas: las de un deporte en su Home o las de todos en el Home general. Los
 * eventos, mis partidos con fecha (a la hora de su liga) y, en el boliche, las prácticas del horario aunque el admin
 * todavía no las creó (con «Voy»). `showSport`: cada fila dice de qué deporte es.
 */
export function WeekAgenda({
  feeds,
  leagues,
  matches,
  today,
  showSport,
}: {
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  matches: readonly CalendarMatch[];
  today: string;
  showSport?: boolean;
}) {
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const run = useAction();
  if (!feeds.length && !matches.length) return null;

  const { from, days, items, byDay } = weekView(feeds, leagues, matches, today, week, day);

  function go(delta: number) {
    setWeek((w) => clampWeek(w + delta));
    setDay(null);
  }

  const nav = 'inline-flex size-11 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 disabled:opacity-30';
  return (
    <section className="flex flex-col gap-2" aria-label="Esta semana" data-tour="proximos">
      <div className="-my-1.5 flex items-center gap-1">
        <h2 className="flex-1 text-sm font-semibold text-muted">{weekTitle(week)}</h2>
        <button type="button" onClick={() => go(-1)} disabled={week === 0} aria-label="Semana anterior" className={nav}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-28 text-center text-xs font-medium tabular-nums">
          {weekRange(from, week)}
        </span>
        <button type="button" onClick={() => go(1)} disabled={week === MAX_WEEKS - 1} aria-label="Semana siguiente" className={nav}>
          <ChevronRight className="size-4" />
        </button>
      </div>

      <Card className="flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line">
          {days.map((d, i) => {
            const mine = items.filter((it) => it.date === d);
            const past = d < today;
            const selected = day === d;
            return (
              <button
                key={d}
                type="button"
                disabled={past || !mine.length}
                onClick={() => setDay(selected ? null : d)}
                aria-pressed={selected}
                aria-label={dayCellLabel(d, i, mine)}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 transition',
                  selected ? 'bg-accent text-accent-fg' : d === today ? 'bg-accent-soft' : '',
                  past && 'opacity-40',
                  !past && mine.length > 0 && !selected && 'hover:bg-surface-2',
                )}
              >
                <span className={cx('text-[10px] font-medium', selected ? '' : 'text-muted')}>{WEEKDAY_SHORT[i]}</span>
                <span className={cx('text-sm font-bold tabular-nums', d === today && !selected && 'text-accent')}>{parseDate(d).getDate()}</span>
                <span className="flex h-1.5 gap-0.5">
                  {mine.slice(0, 3).map((it) => (
                    <span key={it.key} className={cx('size-1.5 rounded-full', selected ? 'bg-accent-fg' : dotTone(it))} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {byDay.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{weekEmptyText(week)}</p>
        ) : (
          <div className="divide-y divide-line">
            {byDay.map((g) => (
              <div key={g.date} className="flex flex-col pb-1">
                <p className="px-4 pt-2.5 text-xs font-semibold text-muted first-letter:uppercase">
                  {dayHeading(g.date, today)}
                </p>
                {g.items.map((it) => (
                  <AgendaRow
                    key={it.key}
                    item={it}
                    showSport={showSport}
                    onGoing={(going) => run(() => setRsvp(it.lid, it.eventId!, it.playerId!, going), going ? 'Confirmado: vas' : 'Listo')}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

/**
 * Un evento o un partido de la semana (también en Próximos eventos de Eventos), con su deporte (o su juego) y, si es
 * torneo, el trofeo chico en la esquina.
 */
export function AgendaRow({ item, showSport, onGoing }: { item: CalendarItem; showSport?: boolean; onGoing?: (going: boolean) => Promise<unknown> }) {
  const match = item.kind === 'match';
  // El «voy» es de las prácticas del boliche (los otros deportes confirman en sus propias pantallas).
  const canRsvp = !!onGoing && canRsvpRow(item);
  const sub = rowSubtitle(item);
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <Link to={item.href} className="flex min-w-0 flex-1 items-center gap-3">
        {/* Siempre el deporte (o el juego) en su color; el torneo, con el trofeo chico en la esquina. */}
        <SportMark sport={item.sport} game={item.game} size="sm" torneo={item.type === 'torneo'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {item.name}
            {item.time && <span className="font-normal text-muted"> · {item.time}</span>}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <span className="truncate">{sub}</span>
            {!item.eventId && !match && (
              <>
                <span aria-hidden="true">·</span>
                <Repeat className="size-3 shrink-0" />
                <span className="shrink-0">según el horario</span>
              </>
            )}
          </span>
        </span>
      </Link>
      {showSport && !canRsvp && item.status !== 'live' && <SportBadge sport={item.sport} className="hidden sm:inline-flex" />}
      {item.status === 'live' ? (
        <Badge tone="ok">
          <span className="live-dot" /> En vivo
        </Badge>
      ) : item.status === 'suspended' ? (
        <Badge tone="warn">Suspendido</Badge>
      ) : null}
      {/* «Voy» en el acento suave del deporte y «Vas ✓» en gris, como en «Lo que viene» (cada fila espera lo suyo). */}
      {canRsvp && <RsvpButton going={!!item.going} onToggle={onGoing!} />}
    </div>
  );
}
