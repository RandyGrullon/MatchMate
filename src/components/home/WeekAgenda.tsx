import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Repeat, Trophy } from 'lucide-react';
import { upcomingCalendar, weekStart, type CalendarItem, type CalendarMatch } from '../../lib/calendar';
import { setRsvp, type LeagueFeed } from '../../lib/data';
import { parseDate, toIsoDate } from '../../lib/format';
import { WEEKDAY_SHORT, WEEKDAYS } from '../../lib/schedule';
import type { League } from '../../lib/types';
import { SportBadge, SportIcon } from '../../pages/sports/SportBits';
import { useAction } from '../feedback';
import { Badge, Card, cx } from '../ui';
import { SportTint } from './SportTint';

/** Semanas hacia adelante que se pueden ver. */
const MAX_WEEKS = 8;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};
const short = (iso: string) => {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** «1 partido», «2 eventos» (si hay de los dos, «3 cosas»). */
function countLabel(items: readonly CalendarItem[]): string {
  const n = items.length;
  const matches = items.filter((i) => i.kind === 'match').length;
  if (matches === n) return `${n} ${n === 1 ? 'partido' : 'partidos'}`;
  if (matches === 0) return `${n} ${n === 1 ? 'evento' : 'eventos'}`;
  return `${n} cosas`;
}

/** Color del puntito de cada día: torneo, partido o lo demás. */
const dotTone = (it: CalendarItem) => (it.kind === 'match' ? 'bg-ok' : it.type === 'torneo' ? 'bg-warn' : 'bg-accent');

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

  const from = addDays(weekStart(today), 7 * week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const items = upcomingCalendar([...feeds], [...leagues], from, 7, matches).filter((i) => i.date >= today);
  const shown = day ? items.filter((i) => i.date === day) : items;
  const byDay = days.map((d) => ({ date: d, items: shown.filter((i) => i.date === d) })).filter((g) => g.items.length);

  function go(delta: number) {
    setWeek((w) => Math.min(MAX_WEEKS - 1, Math.max(0, w + delta)));
    setDay(null);
  }

  const nav = 'inline-flex size-11 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 disabled:opacity-30';
  return (
    <section className="flex flex-col gap-2" aria-label="Esta semana" data-tour="proximos">
      <div className="-my-1.5 flex items-center gap-1">
        <h2 className="flex-1 text-sm font-semibold text-muted">{week === 0 ? 'Esta semana' : 'Próximas semanas'}</h2>
        <button type="button" onClick={() => go(-1)} disabled={week === 0} aria-label="Semana anterior" className={nav}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-28 text-center text-xs font-medium tabular-nums">
          {week === 0 ? `${short(from)} – ${short(addDays(from, 6))}` : week === 1 ? 'La semana que viene' : `${short(from)} – ${short(addDays(from, 6))}`}
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
                aria-label={`${WEEKDAYS[i]} ${short(d)}${mine.length ? `: ${countLabel(mine)}` : ''}`}
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
          <p className="px-4 py-4 text-sm text-muted">{week === 0 ? 'Nada más esta semana.' : 'Nada esta semana.'}</p>
        ) : (
          <div className="divide-y divide-line">
            {byDay.map((g) => (
              <div key={g.date} className="flex flex-col pb-1">
                <p className="px-4 pt-2.5 text-xs font-semibold text-muted first-letter:uppercase">
                  {g.date === today ? 'Hoy' : g.date === addDays(today, 1) ? 'Mañana' : `${WEEKDAYS[(parseDate(g.date).getDay() + 6) % 7]} ${short(g.date)}`}
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

/** Un evento o un partido de la semana (también en Próximos eventos de Eventos). */
export function AgendaRow({ item, showSport, onGoing }: { item: CalendarItem; showSport?: boolean; onGoing?: (going: boolean) => void }) {
  const match = item.kind === 'match';
  // El «voy» es de las prácticas del boliche (los otros deportes confirman en sus propias pantallas).
  const canRsvp = !!onGoing && item.sport === 'bowling' && item.type === 'practica' && !!item.eventId && !!item.playerId;
  const sub = match ? [item.leagueName, item.detail].filter(Boolean).join(' · ') : item.leagueName;
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <Link to={item.href} className="flex min-w-0 flex-1 items-center gap-3">
        <SportTint sport={item.sport} className="shrink-0">
          <span
            className={cx(
              'flex size-9 items-center justify-center rounded-xl',
              match ? 'bg-ok-soft text-ok' : item.type === 'torneo' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent',
            )}
          >
            {item.type === 'torneo' ? (
              <Trophy className="size-4" />
            ) : match || item.sport !== 'bowling' ? (
              <SportIcon sport={item.sport} className="size-4" />
            ) : (
              <CalendarDays className="size-4" />
            )}
          </span>
        </SportTint>
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
      {canRsvp &&
        (item.going ? (
          <button
            type="button"
            onClick={() => onGoing!(false)}
            className="inline-flex min-h-9 items-center gap-1 rounded-full bg-ok-soft px-3 text-xs font-semibold text-ok"
          >
            <Check className="size-3.5" /> Vas
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onGoing!(true)}
            className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-semibold hover:bg-surface-2"
          >
            Voy
          </button>
        ))}
    </div>
  );
}
