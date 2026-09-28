import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { setActiveSport, sportHomePath } from '../../lib/sportContext';
import { SPORTS } from '../../sports/registry';
import type { SportStatus } from '../../sports/status';
import type { SportId } from '../../sports/types';
import { cx } from '../ui';
import { SportTint } from './SportTint';

/** «2 ligas», «Beta», «Explorar». */
export function sportTileNote(count: number, status: SportStatus | undefined): string {
  if (count > 0) return `${count} ${count === 1 ? 'liga' : 'ligas'}`;
  if (status === 'beta') return 'Beta';
  if (status === 'closed') return 'Cerrado';
  return 'Explorar';
}

/**
 * La fila de deportes del Home (se desliza de lado): los míos primero, con cuántas ligas tengo, y los demás que se
 * pueden ver. Tocar uno entra al Home de ese deporte (y la app queda en ese deporte).
 */
export function SportPickerRow({
  sports,
  counts,
  status,
  active,
}: {
  sports: readonly SportId[];
  counts: Readonly<Record<string, number>>;
  status: Readonly<Record<SportId, SportStatus>>;
  active?: SportId | null;
}) {
  const navigate = useNavigate();
  if (!sports.length) return null;
  function open(id: SportId) {
    setActiveSport(id);
    navigate(sportHomePath(id));
  }
  return (
    <div
      className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0"
      role="group"
      aria-label="Deportes"
    >
      {sports.map((id) => {
        const meta = SPORTS[id];
        const Icon = meta.icon;
        const count = counts[id] ?? 0;
        const on = active === id;
        return (
          <SportTint key={id} sport={id} className="contents">
            <button
              type="button"
              onClick={() => open(id)}
              aria-label={`${meta.label}: ${sportTileNote(count, status[id])}`}
              className={cx(
                'relative flex w-[5.75rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition active:scale-[0.97] sm:w-auto',
                on
                  ? 'border-accent bg-accent-soft/60'
                  : count > 0
                    ? 'border-accent/30 bg-surface hover:bg-surface-2'
                    : 'border-line bg-surface hover:bg-surface-2',
              )}
            >
              <span
                className={cx(
                  'flex size-11 items-center justify-center rounded-2xl',
                  count > 0 || on ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="w-full truncate text-xs font-semibold">{meta.short}</span>
              <span className={cx('text-[11px] leading-none', count > 0 ? 'font-medium text-accent' : 'text-muted')}>{sportTileNote(count, status[id])}</span>
              {on && (
                <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </button>
          </SportTint>
        );
      })}
      <span aria-hidden="true" className="w-2 shrink-0 sm:hidden" />
    </div>
  );
}
