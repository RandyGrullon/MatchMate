import { Check } from 'lucide-react';
import type { GameId } from '../../../sports/esports';
import { PLATFORM_LABEL, type Platform } from '../../../sports/esports/platforms';
import { cx } from '../../../components/ui';
import { platformChips, togglePlatform } from '../logic';

/**
 * «¿Dónde juegas?» (docs/perfiles-equipos-esports.md §4): las plataformas del juego en fichas que se marcan varias
 * (PC, PlayStation, Xbox, Switch, Móvil). `wanted`: la del torneo de donde viene, que dice «(torneo)» al lado.
 */
export function PlatformChips({
  game,
  value,
  onChange,
  wanted,
  disabled,
  id,
}: {
  game: GameId;
  value: readonly string[];
  onChange: (next: Platform[]) => void;
  wanted?: Platform | null;
  disabled?: boolean;
  /** El id del título que las nombra (aria-labelledby). */
  id?: string;
}) {
  return (
    <div role="group" aria-labelledby={id} aria-label={id ? undefined : 'Dónde juegas'} className="flex flex-wrap gap-2">
      {platformChips(game).map((c) => {
        const on = value.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(togglePlatform(game, value, c.key))}
            aria-label={wanted === c.key ? `${PLATFORM_LABEL[c.key]} (la del torneo)` : undefined}
            className={cx(
              'inline-flex h-11 min-w-14 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition active:scale-95 disabled:opacity-60',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              on ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-surface-2 text-fg-2',
            )}
          >
            {on && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
            {c.label}
            {wanted === c.key && <span className="text-[12px] font-medium text-muted">torneo</span>}
          </button>
        );
      })}
    </div>
  );
}
