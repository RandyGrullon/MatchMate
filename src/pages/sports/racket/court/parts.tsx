import { useState, type ReactNode } from 'react';
import { Check, Settings2, UserRoundX } from 'lucide-react';
import type { MenuItem } from '../../../../components/event/EventHeader';
import { useBusy } from '../../../../components/busy';
import { useAction } from '../../../../components/feedback';
import { Button, Sheet, cx } from '../../../../components/ui';
import { updateMatchSchedule, type Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import type { Side } from '../../../../sports/types';
import { PresetButtons } from '../bits';

/**
 * Piezas comunes de las canchas de raqueta (sets, pickleball y ping pong) en el rediseño «Calma y foco»: el sorteo antes
 * de empezar (opciones grandes, la elegida en el color del deporte), las reglas del partido con «Cambiar», el retiro
 * (en «•••», ya no un segundo botón con bandera junto a «Terminar») y las fichas del marcador de arriba.
 */

/** Una ficha del marcador de arriba: «6-4» (gris), «Juego 2 de 3» o «Punto de partido» (en el color del deporte). */
export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap',
        tone === 'accent' ? 'bg-accent-soft text-accent' : 'num bg-surface-2 text-fg-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Lo de antes de empezar, con su scroll (el sorteo es largo en dobles). */
export function SetupScreen({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex h-full max-w-xl flex-col gap-6 overflow-y-auto px-1 pb-4">{children}</div>;
}

/** Una pregunta del sorteo con sus dos opciones grandes: «¿Quién saca primero?». */
export function SetupChoice<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; text: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={label}>
      <p className="text-[17px] font-[650] tracking-[-0.01em]">{label}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cx(
                'flex min-h-16 items-center gap-2 rounded-[18px] px-4 py-2.5 text-left text-base font-semibold transition active:scale-[0.98]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                on ? 'bg-accent-soft text-accent' : 'card-shadow bg-surface',
              )}
            >
              <span className="line-clamp-2 min-w-0 flex-1">{o.text}</span>
              {on && <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Una nota corta del sorteo (cómo va el saque): gris, sin borde. */
export function SetupNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">{children}</p>;
}

/** El botón del final del sorteo. */
export function StartButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="primary" size="xl" className="w-full shrink-0" onClick={onClick}>
      Empezar el partido
    </Button>
  );
}

/**
 * Las reglas de este partido («A 3 sets · punto de oro») y, para el admin antes del primer punto, «Cambiar» con las
 * plantillas probadas del deporte (una hoja).
 */
export function RulesBox<P extends { id: string; label: string; rules: unknown }>({
  line,
  match,
  canChange,
  presets,
  current,
}: {
  line: string;
  match: Match;
  canChange: boolean;
  presets: readonly P[];
  current: string | null | undefined;
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const saving = useBusy();
  const [changing, setChanging] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-2 py-2 pr-1.5 pl-4">
      <div className="min-w-0 flex-1 py-1">
        <p className="text-[13px] text-muted">Reglas de este partido</p>
        <p className="text-[15px] font-semibold">{line}</p>
      </div>
      {canChange && (
        <Button variant="ghost" className="h-11 shrink-0 rounded-xl text-accent" icon={<Settings2 className="size-4" />} onClick={() => setChanging(true)}>
          Cambiar
        </Button>
      )}
      <Sheet open={changing} onClose={() => setChanging(false)} title="Reglas de este partido" subtitle="Valen desde el primer punto">
        <PresetButtons
          presets={presets}
          current={current}
          pending={saving.busy}
          onPick={(p) =>
            void saving.run(p.id, async () => {
              await run(() => updateMatchSchedule(lid, match.id, { rules: { ...(match.rules ?? {}), match: p.rules } }), 'Reglas cambiadas');
              setChanging(false);
            })
          }
        />
      </Sheet>
    </div>
  );
}

/** «Retiro» en «•••» de la cancha (abre la hoja «¿Quién se retira?»). */
export function retireItem(onClick: () => void): MenuItem {
  return { key: 'retiro', icon: UserRoundX, label: 'Retiro', hint: 'Alguien no puede seguir: gana el otro lado', onClick };
}

/** ¿Quién se retira? Gana el otro lado (`note`: qué pasa con el marcador en este deporte). */
export function RetireSheet({ open, onClose, labels, note, onRetire }: { open: boolean; onClose: () => void; labels: readonly [string, string]; note: string; onRetire: (side: Side) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="¿Quién se retira?" subtitle={note}>
      <div className="flex flex-col gap-2 pb-1">
        {([1, 2] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => onRetire(side)}
            className="flex min-h-14 w-full items-center rounded-2xl bg-surface-2 px-4 text-left text-[15px] font-semibold transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-accent"
          >
            Se retira {labels[side - 1]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Elegir quién de la pareja (saca, recibe) en las hojas de orden de saque: dos opciones grandes, la puesta marcada. */
export function PlayerPick({ label, names, current, onPick }: { label: string; names: readonly [string, string]; current?: 0 | 1 | null; onPick: (p: 0 | 1) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[15px] font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {([0, 1] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={current === p}
            onClick={() => onPick(p)}
            className={cx(
              'min-h-14 rounded-2xl px-4 text-left text-[15px] font-semibold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent',
              current === p ? 'bg-accent-soft text-accent' : 'bg-surface-2',
            )}
          >
            <span className="line-clamp-2">{names[p]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
