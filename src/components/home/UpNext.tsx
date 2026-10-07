import type { CalendarItem } from '../../lib/calendar';
import { Badge, Card, DateBlock, ListRow, SectionHeader, sectionLinkClass } from '../ui';
import { LiveDot } from './TodayCard';
import { upNextSubtitle } from './logic';
import { RsvpButton, useRsvp } from './RsvpButton';

/** Fechas que se ven en «Lo que viene» (el resto, en el Calendario). */
export const UP_NEXT_SHOWN = 3;

/** ¿Se puede confirmar «Voy» desde la fila? (prácticas del boliche ya creadas, con jugador). */
export const canRsvp = (it: CalendarItem) => it.kind === 'event' && it.sport === 'bowling' && it.type === 'practica' && !!it.eventId && !!it.playerId;

/**
 * «Lo que viene»: las próximas fechas (sin la que ya sale arriba en la tarjeta de hoy), con el mes y el día (OCT / 13),
 * el día de la semana y la hora, y «Voy» en línea en las prácticas. «Calendario» abre la semana completa.
 */
export function UpNext({
  items,
  today,
  showLeague,
  onCalendar,
  className,
}: {
  items: readonly CalendarItem[];
  today: string;
  showLeague?: boolean;
  onCalendar: () => void;
  className?: string;
}) {
  const rsvp = useRsvp();
  const shown = items.slice(0, UP_NEXT_SHOWN);
  return (
    <section aria-labelledby="lo-que-viene" className={className}>
      <SectionHeader
        id="lo-que-viene"
        title="Lo que viene"
        action={
          <button type="button" onClick={onCalendar} className={sectionLinkClass}>
            Calendario
          </button>
        }
      />
      {shown.length === 0 ? (
        <p className="mx-1 text-meta text-muted">Nada más en los próximos 30 días.</p>
      ) : (
        <Card className="overflow-hidden">
          {shown.map((it) => (
            <ListRow
              key={it.key}
              leading={<DateBlock date={it.date} />}
              title={it.name}
              subtitle={upNextSubtitle(it, today, showLeague)}
              to={it.href}
              ariaLabel={`${it.name}, ${upNextSubtitle(it, today, true)}`}
              trailing={
                canRsvp(it) ? (
                  <RsvpButton going={it.going} onToggle={(going) => rsvp(it.lid, it.eventId!, it.playerId!, going)} />
                ) : it.status === 'live' ? (
                  <Badge tone="accent" className="gap-1.5">
                    <LiveDot /> En vivo
                  </Badge>
                ) : it.status === 'suspended' ? (
                  <Badge tone="warn">Suspendido</Badge>
                ) : undefined
              }
            />
          ))}
        </Card>
      )}
    </section>
  );
}
