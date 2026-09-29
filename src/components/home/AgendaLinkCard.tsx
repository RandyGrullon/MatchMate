import { Link } from 'react-router';
import { CalendarSearch, ChevronRight } from 'lucide-react';
import { agendaCardNote, hasAgenda } from '../agenda/logic';

/**
 * Entrada a «¿Dónde juego esta semana?» (`/agenda`) desde el Home y el Home de un deporte (con ese deporte ya
 * filtrado). En un deporte sin nada para apuntarse (baloncesto, fútbol, natación) no sale.
 */
export function AgendaLinkCard({ sport = null }: { sport?: string | null }) {
  if (sport && !hasAgenda(sport)) return null;
  return (
    <Link
      to={sport ? `/agenda?deporte=${encodeURIComponent(sport)}` : '/agenda'}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
        <CalendarSearch className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">¿Dónde juego esta semana?</span>
        <span className="block truncate text-xs text-muted">{agendaCardNote(sport)}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-accent" aria-hidden="true" />
    </Link>
  );
}
