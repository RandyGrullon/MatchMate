import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Repeat, Trophy } from 'lucide-react';
import { upcomingCalendar, weekStart, type CalendarItem } from '../lib/calendar';
import { setRsvp } from '../lib/data';
import { parseDate, toIsoDate } from '../lib/format';
import { WEEKDAY_SHORT, WEEKDAYS } from '../lib/schedule';
import { useNow } from '../lib/useNow';
import { useAction } from './feedback';
import { useNotifications } from './Notifications';
import { Card, cx } from './ui';

/** Semanas hacia adelante que se pueden ver. */
const MAX_WEEKS = 8;

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const short = (iso: string) => {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/**
 * Home › Próximos: calendario semanal (lunes a domingo) de tus prácticas y torneos en todas tus ligas.
 * Las prácticas de cada semana salen según el horario de la liga aunque el admin todavía no las creó.
 */
export function WeekCalendar() {
  const { feeds, leagues } = useNotifications();
  const now = useNow();
  const today = toIsoDate(now);
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const run = useAction();
  if (!feeds.length) return null;

  const from = addDays(weekStart(today), 7 * week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const items = upcomingCalendar(feeds, leagues, from, 7).filter((i) => i.date >= today);
  const shown = day ? items.filter((i) => i.date === day) : items;
  const byDay = days.map((d) => ({ date: d, items: shown.filter((i) => i.date === d) })).filter((g) => g.items.length);

  function go(delta: number) {
    setWeek((w) => Math.min(MAX_WEEKS - 1, Math.max(0, w + delta)));
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
                aria-label={`${WEEKDAYS[i]} ${short(d)}${mine.length ? `: ${mine.length} ${mine.length === 1 ? 'evento' : 'eventos'}` : ''}`}
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
                    <span key={it.key} className={cx('size-1.5 rounded-full', selected ? 'bg-accent-fg' : it.type === 'torneo' ? 'bg-warn' : 'bg-accent')} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {byDay.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{week === 0 ? 'Nada más esta semana.' : 'Nada esta semana.'}</p>
        ) : (
          <div className="divide-y divide-line">
            {byDay.map((g) => (
              <div key={g.date} className="flex flex-col">
                <p className="px-4 pt-2.5 text-xs font-semibold text-muted first-letter:uppercase">
                  {g.date === today ? 'Hoy' : g.date === addDays(today, 1) ? 'Mañana' : `${WEEKDAYS[(parseDate(g.date).getDay() + 6) % 7]} ${short(g.date)}`}
                </p>
                {g.items.map((it) => (
                  <Row key={it.key} item={it} onGoing={(going) => run(() => setRsvp(it.lid, it.eventId!, it.playerId!, going), going ? 'Confirmado: vas' : 'Listo')} />
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function Row({ item, onGoing }: { item: CalendarItem; onGoing: (going: boolean) => void }) {
  const to = item.eventId ? `/l/${item.lid}/e/${item.eventId}` : `/l/${item.lid}`;
  const canRsvp = item.type === 'practica' && !!item.eventId && !!item.playerId;
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3">
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
      {canRsvp &&
        (item.going ? (
          <button type="button" onClick={() => onGoing(false)} className="flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            <Check className="size-3.5" /> Vas
          </button>
        ) : (
          <button type="button" onClick={() => onGoing(true)} className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold hover:bg-surface-2">
            Voy
          </button>
        ))}
    </div>
  );
}
