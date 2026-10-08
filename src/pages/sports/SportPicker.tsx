import { Check } from 'lucide-react';
import { SPORTS, type SportGroup } from '../../sports/registry';
import type { SportStatus } from '../../sports/status';
import type { SportId } from '../../sports/types';
import { Badge, cx } from '../../components/ui';

/**
 * Primer paso de «Crear»: de qué deporte es la liga o el torneo. Solo salen los que la cuenta puede crear
 * (`useSportStatus().choices`: los abiertos, y los de beta si es superadmin). El fútbol sale una sola vez y
 * pide la modalidad (campo o sala). El deporte no se cambia después. Rediseño «Calma y foco»: fichas sin borde (un
 * contorno fino), la elegida en el color del deporte con su contorno, y 56 px para el dedo.
 */
export function SportPicker({
  groups,
  status,
  value,
  onChange,
}: {
  groups: readonly SportGroup[];
  status: Readonly<Record<SportId, SportStatus>>;
  value: SportId;
  onChange: (sport: SportId) => void;
}) {
  const current = groups.find((g) => g.sports.includes(value));
  const beta = (ids: readonly SportId[]) => ids.every((id) => status[id] === 'beta');

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1.5 text-xs font-medium text-muted">¿De qué deporte?</legend>
        {groups.map((g) => {
          const active = g === current;
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={active}
              onClick={() => !active && onChange(g.sports[0])}
              className={cx(
                'relative flex min-h-14 items-center gap-2.5 rounded-2xl p-2.5 text-left text-sm transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                active ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2',
              )}
            >
              <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2')}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate font-semibold', active && 'text-accent')}>{g.name}</span>
                {g.alias && <span className="block truncate text-xs text-muted">{g.alias}</span>}
                {beta(g.sports) && <span className="text-xs text-muted">Beta</span>}
              </span>
              {active && <Check className="size-4 shrink-0 text-accent" />}
            </button>
          );
        })}
      </fieldset>

      {current && current.sports.length > 1 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted">Modalidad</legend>
          <div className="grid grid-cols-2 gap-2">
            {current.sports.map((id) => {
              const active = id === value;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(id)}
                  className={cx(
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    active ? 'bg-accent text-accent-fg' : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2',
                  )}
                >
                  {SPORTS[id].modality ?? SPORTS[id].label}
                  {status[id] === 'beta' && (
                    <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
                      Beta
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-[1.4] text-muted">
        El deporte no se cambia después de crear.
        {groups.some((g) => g.sports.some((id) => status[id] === 'beta')) && ' Los que dicen «Beta» solo los puede crear el superadmin mientras se prueban.'}
      </p>
    </div>
  );
}
