import { Check } from 'lucide-react';
import { setRsvp } from '../../lib/data';
import { BusyIcon, useBusy } from '../busy';
import { useAction } from '../feedback';
import { cx } from '../ui';

/** Guarda «Voy» (o lo quita) en una práctica, con su aviso. Va por la cola sin señal (setRsvp). */
export function useRsvp(): (lid: string, eventId: string, playerId: string, going: boolean) => Promise<unknown> {
  const run = useAction();
  return (lid, eventId, playerId, going) => run(() => setRsvp(lid, eventId, playerId, going), going ? 'Confirmado: vas' : 'Listo, ya no vas');
}

/**
 * «Voy» en línea, en cada fecha de «Lo que viene» (y del calendario): en el acento suave del deporte; ya confirmado,
 * «Vas ✓» en gris (tocarlo lo quita). Mientras se guarda, la ruedita en su lugar (no cambia de tamaño). Se ve de 36 px
 * y se toca en 44.
 */
export function RsvpButton({ going, onToggle, className }: { going: boolean; onToggle: (going: boolean) => Promise<unknown>; className?: string }) {
  const { isBusy, run } = useBusy();
  const busy = isBusy();
  return (
    <button
      type="button"
      onClick={() => void run('voy', () => onToggle(!going))}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-pressed={going}
      aria-label={going ? 'Vas (toca si ya no vas)' : 'Voy'}
      className={cx(
        "relative inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3.5 text-sm font-[650] transition active:scale-[0.97] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-80',
        going ? 'bg-surface-2 text-fg-2' : 'bg-accent-soft text-accent',
        className,
      )}
    >
      {/* Transparente y no oculto: el botón no cambia de ancho mientras gira la ruedita. */}
      <span aria-hidden="true" className={cx('inline-flex items-center gap-1', busy && 'text-transparent')}>
        {going ? (
          <>
            Vas <Check className="size-3.5" strokeWidth={2.6} />
          </>
        ) : (
          'Voy'
        )}
      </span>
      <BusyIcon busy={busy} className="absolute inset-0 m-auto size-4" />
    </button>
  );
}
