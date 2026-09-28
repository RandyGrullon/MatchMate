import { useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendar';
import { setRsvp } from '../../lib/data';
import { useAction } from '../feedback';
import { AgendaRow } from '../home/WeekAgenda';
import { Card, ListSkeleton } from '../ui';
import { UPCOMING_PREVIEW, groupByDay } from './logic';

/**
 * «Próximos» de Eventos: los eventos, las prácticas del horario y mis partidos de los próximos 30 días, por día, con
 * la hora, la liga y el deporte (las mismas filas del Home). Se ven los primeros y «Ver todo» abre el resto.
 */
export function UpcomingList({
  items,
  today,
  showSport,
  loading,
}: {
  items: readonly CalendarItem[];
  today: string;
  showSport?: boolean;
  loading?: boolean;
}) {
  const [all, setAll] = useState(false);
  const run = useAction();

  if (!items.length) {
    if (loading) return <ListSkeleton rows={2} />;
    return (
      <Card className="flex items-start gap-3 px-4 py-4">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-sm text-muted">
          Nada en los próximos 30 días. Cuando el organizador cree un evento o te toque un partido, sale aquí con su día y su hora.
        </p>
      </Card>
    );
  }

  const extra = items.length - UPCOMING_PREVIEW;
  const groups = groupByDay(items, today, all ? undefined : UPCOMING_PREVIEW);
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="divide-y divide-line">
        {groups.map((g) => (
          <div key={g.date} className="flex flex-col pb-1">
            <p className="px-4 pt-2.5 text-xs font-semibold text-muted first-letter:uppercase">{g.label}</p>
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
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="flex min-h-11 items-center justify-center gap-1 border-t border-line text-sm font-medium text-accent transition hover:bg-surface-2"
        >
          {all ? (
            <>
              Ver menos <ChevronUp className="size-4" aria-hidden="true" />
            </>
          ) : (
            <>
              Ver todo ({extra} más) <ChevronDown className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
      )}
    </Card>
  );
}
