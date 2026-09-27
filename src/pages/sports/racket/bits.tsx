import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, Boxes, Check, ChevronsUp, ListOrdered, Minus, Moon, Plus, Search, Shuffle, Trophy, type LucideIcon } from 'lucide-react';
import type { StandingsColumn } from '../../../components/match';
import { Card, Input, cx } from '../../../components/ui';

/** Piezas chicas de las pantallas de raqueta. */

export interface EventTypeInfo {
  label: string;
  icon: LucideIcon;
  hint: string;
}

const TYPES: Record<string, EventTypeInfo> = {
  americano: { label: 'Americano', icon: Shuffle, hint: 'Parejas que rotan cada ronda; cada quien suma sus puntos.' },
  mexicano: { label: 'Mexicano', icon: ArrowUpDown, hint: 'Cada ronda se arma con la tabla: 1+4 contra 2+3.' },
  liga: { label: 'Liga', icon: ListOrdered, hint: 'Todos contra todos por jornadas, con tabla.' },
  torneo: { label: 'Torneo', icon: Trophy, hint: 'Categorías, grupos y cuadro de eliminación.' },
  noche: { label: 'Noche', icon: Moon, hint: 'Noche de puntos.' },
  cajas: { label: 'Liga por cajas', icon: Boxes, hint: 'Cajas de 4 a 6 por nivel; cada mes suben 2 y bajan 2.' },
  escalera: { label: 'Escalera', icon: ChevronsUp, hint: 'Reta hasta 3 puestos arriba; si ganas, tomas su puesto.' },
};

export const eventTypeInfo = (type: string, doubles = true): EventTypeInfo => {
  const t = TYPES[type] ?? TYPES.noche;
  return type === 'liga' && doubles ? { ...t, label: 'Liga de parejas' } : t;
};

export function EventIcon({ type, className }: { type: string; className?: string }) {
  const Icon = eventTypeInfo(type).icon;
  return <Icon className={className} aria-hidden="true" />;
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col gap-2', className)}>
      <div className="flex min-h-8 items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex flex-col gap-0.5 px-4 py-3', className)}>
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </Card>
  );
}

/** Botones de filtro («Todos», «Míos»…). */
export function Chips<K extends string>({ items, value, onChange, className }: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div className={cx('no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4', className)} role="group">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-pressed={value === it.key}
          onClick={() => onChange(it.key)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95',
            value === it.key ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
          )}
        >
          {it.label}
          {it.count != null && it.count > 0 && <span className={cx('rounded-full px-1.5 text-[11px] leading-4', value === it.key ? 'bg-white/20' : 'bg-accent text-accent-fg')}>{it.count}</span>}
        </button>
      ))}
      <span aria-hidden="true" className="w-3 shrink-0" />
    </div>
  );
}

/** Número con − y + grandes (rondas, canchas, puntos). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  label,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Menos ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface active:scale-95 disabled:opacity-40"
        >
          <Minus className="size-5" />
        </button>
        <span className="min-w-14 text-center text-xl font-bold tabular-nums" aria-live="polite">
          {value}
          {suffix && <span className="ml-1 text-sm font-medium text-muted">{suffix}</span>}
        </span>
        <button
          type="button"
          aria-label={`Más ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface active:scale-95 disabled:opacity-40"
        >
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Lista para elegir (jugadores o parejas) con búsqueda y filas grandes. */
export function PickList({
  items,
  selected,
  onToggle,
  right,
  empty = 'No hay nadie todavía.',
  max,
}: {
  items: { id: string; name: string; sub?: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  right?: (id: string) => ReactNode;
  empty?: ReactNode;
  max?: number;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => (q.trim() ? items.filter((x) => norm(x.name).includes(norm(q.trim()))) : items), [items, q]);
  if (!items.length) return <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-9" aria-label="Buscar" />
        </div>
      )}
      <Card className="divide-y divide-line overflow-hidden">
        {shown.map((x) => {
          const on = selected.has(x.id);
          const full = !on && max != null && selected.size >= max;
          return (
            <div key={x.id} className="flex items-center gap-2 pr-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={full}
                onClick={() => onToggle(x.id)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left hover:bg-surface-2 disabled:opacity-40"
              >
                <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-accent bg-accent text-accent-fg' : 'border-line')}>
                  {on && <Check className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{x.name}</span>
                  {x.sub && <span className="block truncate text-xs text-muted">{x.sub}</span>}
                </span>
              </button>
              {right?.(x.id)}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** «1 pareja» / «3 parejas». */
export const plural = (n: number, [one, many]: readonly [string, string]) => `${n} ${n === 1 ? one : many}`;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Columnas de la tabla de raqueta: PJ, G, P, dif. de sets, juegos a favor y en contra, dif. de juegos (pickleball: juegos y puntos). */
export function racketColumns(sport: string): StandingsColumn[] {
  const pk = sport === 'pickleball';
  return [
    { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
    { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
    { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
    { key: 'sets', label: pk ? 'Jue.' : 'Sets', title: pk ? 'Diferencia de juegos' : 'Diferencia de sets', value: (r) => signed(r.extra[pk ? 'gamesDiff' : 'setsDiff'] ?? 0) },
    { key: 'for', label: pk ? 'PF' : 'JF', title: pk ? 'Puntos a favor' : 'Juegos a favor', value: (r) => r.for, wide: true },
    { key: 'against', label: pk ? 'PC' : 'JC', title: pk ? 'Puntos en contra' : 'Juegos en contra', value: (r) => r.against, wide: true },
    { key: 'diff', label: pk ? 'Dif.' : 'Dif. J', title: pk ? 'Diferencia de puntos' : 'Diferencia de juegos', value: (r) => signed(r.diff) },
  ];
}

/** Dirección de la app (vacía sin navegador: pruebas). */
export const appOrigin = () => (typeof location !== 'undefined' ? location.origin : '');
