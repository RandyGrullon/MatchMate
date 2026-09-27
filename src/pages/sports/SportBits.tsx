import { useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { sportMeta } from '../../sports/registry';
import { Badge, cx } from '../../components/ui';

/**
 * Piezas chicas para mostrar el deporte en listas (Mis ligas, Eventos, cambiar de liga). Solo se usan cuando la
 * cuenta tiene ligas de más de un deporte: con uno solo no hace falta decirlo en cada fila.
 */

export function SportIcon({ sport, className }: { sport: string; className?: string }) {
  const Icon = sportMeta(sport)?.icon ?? CircleHelp;
  return <Icon className={className} aria-hidden="true" />;
}

/** «Pádel», «Fútbol sala»… Un deporte que esta versión no conoce: «Otro deporte». */
export function SportBadge({ sport, className }: { sport: string; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      <SportIcon sport={sport} className="size-3" />
      {sportMeta(sport)?.short ?? 'Otro deporte'}
    </Badge>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95',
        active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

/** Filtro por deporte: «Todos» y un botón por cada deporte de la lista. */
export function SportChips({ sports, value, onChange }: { sports: readonly string[]; value: string | null; onChange: (sport: string | null) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Filtrar por deporte">
      <Chip active={value === null} onClick={() => onChange(null)}>
        Todos
      </Chip>
      {sports.map((s) => (
        <Chip key={s} active={value === s} onClick={() => onChange(value === s ? null : s)}>
          <SportIcon sport={s} className="size-4" />
          {sportMeta(s)?.short ?? 'Otro deporte'}
        </Chip>
      ))}
      <span aria-hidden="true" className="w-3 shrink-0" />
    </div>
  );
}

/**
 * Deporte elegido en el filtro, guardado en el link (`?deporte=padel`) para que «atrás» lo respete.
 * Si ese deporte ya no está en la lista, es como «Todos».
 */
export function useSportFilter(available: readonly string[]): [string | null, (sport: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('deporte');
  const value = raw && available.includes(raw) ? raw : null;
  const set = useCallback(
    (sport: string | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (sport) next.set('deporte', sport);
          else next.delete('deporte');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [value, set];
}
