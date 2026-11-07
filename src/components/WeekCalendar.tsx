import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Repeat, Trophy } from 'lucide-react';
import type { CalendarItem, CalendarMatch } from '../lib/calendar';
import { setRsvp } from '../lib/data';
import { parseDate, toIsoDate } from '../lib/format';
import { WEEKDAY_SHORT } from '../lib/schedule';
import { useNow } from '../lib/useNow';
import { SportIcon } from '../pages/sports/SportBits';
import { addDays, canRsvpRow, clampWeek, dayCellLabel, dayHeading, dotKind, MAX_WEEKS, shortDate as short, weekEmptyText, weekView } from './agenda/week';
import { BusyIcon, useBusy } from './busy';
import { useAction } from './feedback';
import { useNotifications } from './Notifications';
import { Badge, Card, cx } from './ui';

// La semana (días, fechas y textos) sale de agenda/week.ts: la misma de WeekAgenda y de la app del teléfono.

/** Color del puntito de cada día: torneo, partido o lo demás. */
const DOT = { match: 'bg-ok', torneo: 'bg-warn', otro: 'bg-accent' } as const;
const dotTone = (it: CalendarItem) => DOT[dotKind(it)];

/**
 * Home › Próximos: calendario semanal (lunes a domingo) de todas tus ligas, de cualquier deporte: los eventos,
 * tus partidos con fecha (`matches` = useMyMatches, a la hora de su liga) y, en el boliche, las prácticas de cada
 * semana según el horario de la liga aunque el admin todavía no las creó.
 */
export function WeekCalendar({ matches = [] }: { matches?: readonly CalendarMatch[] }) {
  const { feeds, leagues } = useNotifications();
  const now = useNow();
  const today = toIsoDate(now);
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const run = useAction();
  if (!feeds.length) return null;

  const { from, days, items, byDay } = weekView(feeds, leagues, matches, today, week, day);

  function go(delta: number) {
    setWeek((w) => clampWeek(w + delta));
    setDay(null);
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Próximos" data-tour="proximos">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-muted">Próximos</h2>
        <button type="button" onClick={() => go(-1)} disabled={week === 0} aria-label="Semana anterior" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-28 text-center text-xs font-medium tabular-nums">
          {week === 0 ? 'Esta semana' : week === 1 ? 'La semana que viene' : `${short(from)} – ${short(addDays(from, 6))}`}
        </span>
        <button type="button" onClick={() => go(1)} disabled={week === MAX_WEEKS - 1} aria-label="Semana siguiente" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
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
                  'flex flex-col items-center gap-0.5 py-2 transition',
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
              <div key={g.date} className="flex flex-col">
                <p className="px-4 pt-2.5 text-xs font-semibold text-muted first-letter:uppercase">
                  {dayHeading(g.date, today)}
                </p>
                {g.items.map((it) =>
                  it.kind === 'match' ? (
                    <MatchRow key={it.key} item={it} />
                  ) : (
                    <Row key={it.key} item={it} onGoing={(going) => run(() => setRsvp(it.lid, it.eventId!, it.playerId!, going), going ? 'Confirmado: vas' : 'Listo')} />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function Row({ item, onGoing }: { item: CalendarItem; onGoing: (going: boolean) => Promise<unknown> }) {
  // El «voy» es de las prácticas del boliche (los otros deportes confirman en sus propias pantallas).
  const canRsvp = canRsvpRow(item);
  // Cada fila espera lo suyo: las demás se pueden tocar mientras tanto.
  const { isBusy, run } = useBusy();
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <Link to={item.href} className="flex min-w-0 flex-1 items-center gap-3">
        <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl', item.type === 'torneo' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent')}>
          {item.type === 'torneo' ? <Trophy className="size-4" /> : <CalendarDays className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {item.name}
            {item.time && <span className="font-normal text-muted"> · {item.time}</span>}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-muted">
            {item.leagueName}
            {!item.eventId && (
              <>
                {' · '}
                <Repeat className="size-3 shrink-0" /> según el horario
              </>
            )}
          </span>
        </span>
      </Link>
      {canRsvp && <RsvpChip going={!!item.going} busy={isBusy()} onClick={() => void run('voy', () => onGoing(!item.going))} />}
    </div>
  );
}

/**
 * «Vas» o «Voy» (también en las filas de Esta semana y de Próximos); mientras se guarda, la ruedita en su lugar (el
 * botón no cambia de tamaño). `className`: el tamaño (px-2.5 py-1 si no).
 */
export function RsvpChip({ going, busy, onClick, className = 'px-2.5 py-1' }: { going: boolean; busy: boolean; onClick: () => void; className?: string }) {
  const chip = cx('relative inline-flex items-center justify-center gap-1 rounded-full text-xs font-semibold', className);
  return going ? (
    <button type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} className={cx(chip, 'bg-ok-soft text-ok')}>
      <BusyIcon busy={busy} icon={<Check className="size-3.5" />} className="size-3.5" /> Vas
    </button>
  ) : (
    <button type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} className={cx(chip, 'border border-line hover:bg-surface-2')}>
      {/* Transparente y no oculto: el botón sigue llamándose «Voy» para el lector de pantalla. */}
      <span className={cx(busy && 'text-transparent')}>Voy</span>
      <BusyIcon busy={busy} className="absolute inset-0 m-auto size-3.5" />
    </button>
  );
}

/** Un partido tuyo: «vs. Tigres · 8:00 pm», la liga y dónde se juega; «En vivo» o «Suspendido» si toca. */
function MatchRow({ item }: { item: CalendarItem }) {
  return (
    <Link to={item.href} className="flex items-center gap-3 px-4 py-2 transition hover:bg-surface-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
        <SportIcon sport={item.sport} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {item.name}
          {item.time && <span className="font-normal text-muted"> · {item.time}</span>}
        </span>
        <span className="block truncate text-xs text-muted">{[item.leagueName, item.detail].filter(Boolean).join(' · ')}</span>
      </span>
      {item.status === 'live' ? (
        <Badge tone="ok">
          <span className="live-dot" /> En vivo
        </Badge>
      ) : item.status === 'suspended' ? (
        <Badge tone="warn">Suspendido</Badge>
      ) : null}
    </Link>
  );
}
