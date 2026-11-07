/**
 * Piezas comunes de las pantallas del torneo de esports: los datos del torneo juntos (useTournament), mis equipos de
 * temporada (para saber mi lado en cada serie), los nombres de los inscritos, el número con − y + que se puede escribir
 * (rondas, goles, kills), «¿Quién ganó?» y la puerta del organizador (Pro + admin).
 */
import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cx } from '../../../components/ui';
import { entryInitials } from '../../esports/chips';
import { useOrganizer } from './organizer';

// Los datos del torneo, mis equipos y los nombres (hooks sin pantallas) están en tournamentData.ts, y la puerta del
// organizador (Pro + admin) en organizer.ts: los usa también la app del teléfono.
export { useEntryNames, useMyTeams, useTournament, type TournamentData } from './tournamentData';
export { useOrganizer };

export function OrganizerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useOrganizer() ? children : fallback}</>;
}

const stepBtn =
  'grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-fg transition active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent';

/**
 * Un número con − y + de 44 px y el número en medio (se puede escribir): rondas, goles, puntos, kills. Vacío = sin dato
 * (`undefined`), si `optional`.
 */
export function ScoreStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  optional,
  className,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min?: number;
  max?: number;
  /** Para el lector de pantalla: «Rondas de Tigres». */
  label: string;
  optional?: boolean;
  className?: string;
}) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className={cx('flex shrink-0 items-center gap-1.5', className)} role="group" aria-label={label}>
      <button type="button" aria-label={`Menos: ${label}`} disabled={value == null || value <= min} onClick={() => set((value ?? min) - 1)} className={stepBtn}>
        <Minus aria-hidden="true" className="size-5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={value ?? ''}
        placeholder={optional ? '–' : String(min)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '');
          if (!raw) return onChange(optional ? undefined : min);
          set(Number(raw));
        }}
        className="num h-11 w-14 rounded-xl bg-surface-2 text-center text-[22px] font-[650] text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/40"
      />
      <button type="button" aria-label={`Más: ${label}`} disabled={value != null && value >= max} onClick={() => set(value == null ? (optional ? min : min + 1) : value + 1)} className={stepBtn}>
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}

/** Una fila «Tigres ……… [−] 13 [+]»: el nombre se corta antes que los botones (cabe en 360 px). */
export function SideStepRow({ name, children, className }: { name: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-12 items-center gap-3', className)}>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
      {children}
    </div>
  );
}

/** «¿Quién ganó?»: dos botones grandes con los nombres (el elegido en acento). */
export function WinnerPick({ value, names, onChange, label = '¿Quién ganó?' }: { value: 1 | 2 | null | undefined; names: readonly [string, string]; onChange: (w: 1 | 2) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {([1, 2] as const).map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            className={cx(
              'min-h-12 min-w-0 truncate rounded-2xl px-3 text-[15px] font-semibold transition active:scale-[0.98]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg',
            )}
          >
            {names[s - 1]}
          </button>
        );
      })}
    </div>
  );
}

/** Fichas para elegir un valor corto («2-0», «2-1», «Sin detalle»). */
export function ChoiceChips<K extends string>({ items, value, onChange, label }: { items: readonly { key: K; label: string }[]; value: K | null; onChange: (k: K) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.key)}
            className={cx(
              'inline-flex h-11 min-w-14 items-center justify-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition active:scale-95',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** El círculo con las iniciales de un inscrito individual (los equipos usan TeamLogo). */
export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = entryInitials(name);
  return (
    <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-fg-2', className)}>
      {letters}
    </span>
  );
}
