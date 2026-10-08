import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, Boxes, Check, ChevronDown, ChevronsUp, ListOrdered, Loader2, Minus, Moon, Plus, Search, Shuffle, Trophy, type LucideIcon } from 'lucide-react';
import type { StandingsColumn } from '../../../components/match';
import { PosNum, TuTag } from '../../../components/ranking/parts';
import { Card, ListRow, SectionHeader, cx } from '../../../components/ui';
import { isGameSport } from '../../../sports/racket/rules';

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

/**
 * Una sección de la pantalla: su título de 19 px (con algo a la derecha, como «Nuevo» o «Ver toda») y lo de adentro.
 */
export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <SectionHeader title={title} action={action} />
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Un número grande en su tarjeta: «12 · Jugados · 8 G · 4 P». */
export function StatTile({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex min-w-0 flex-col px-4 py-3.5', className)}>
      <b className="num text-[28px] leading-none font-[650]">{value}</b>
      <span className="mt-2 truncate text-sm text-muted">{label}</span>
      {sub && <span className="mt-1 text-[13px] text-muted">{sub}</span>}
    </Card>
  );
}

/**
 * Fichas para filtrar o elegir entre muchas opciones («Todos», «Míos», las categorías del torneo): como las de los
 * deportes en Ligas. Con 2 o 3 opciones va un Segmented.
 */
export function Chips<K extends string>({ items, value, onChange, className }: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div className={cx('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5', className)} role="group">
      {items.map((it) => {
        const on = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.key)}
            className={cx(
              "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-meta font-semibold whitespace-nowrap transition after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] active:scale-[0.97]",
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
            )}
          >
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className={cx('rounded-full px-1.5 text-[11px] leading-4 font-bold', on ? 'bg-white/25' : 'bg-accent text-accent-fg')}>{it.count}</span>
            )}
          </button>
        );
      })}
      <span aria-hidden="true" className="w-2 shrink-0" />
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
          className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg transition active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Minus className="size-5" />
        </button>
        <span className="num min-w-14 text-center text-[22px] font-[650]" aria-live="polite">
          {value}
          {suffix && <span className="ml-1 text-sm font-medium text-muted">{suffix}</span>}
        </span>
        <button
          type="button"
          aria-label={`Más ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg transition active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
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
  if (!items.length) return <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar"
            className="h-11 w-full rounded-full bg-surface-2 pr-4 pl-10 text-base text-fg placeholder:text-muted focus:ring-2 focus:ring-accent/40 focus:outline-none"
          />
        </div>
      )}
      <Card className="overflow-hidden">
        {shown.map((x) => {
          const on = selected.has(x.id);
          const full = !on && max != null && selected.size >= max;
          return (
            <div key={x.id} className="mm-row relative flex items-center gap-2 pr-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={full}
                onClick={() => onToggle(x.id)}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3.5 py-2 pl-5 text-left transition active:bg-surface-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden="true"
                  className={cx('grid size-6 shrink-0 place-items-center rounded-full transition', on ? 'bg-accent text-accent-fg' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]')}
                >
                  {on && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{x.name}</span>
                  {x.sub && <span className="block truncate text-[13px] text-muted">{x.sub}</span>}
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

/**
 * Las plantillas de reglas para elegir (la puesta, resaltada). `pending`: la que se está guardando (con la ruedita;
 * las demás esperan).
 */
export function PresetButtons<P extends { id: string; label: string }>({
  presets,
  current,
  pending,
  onPick,
  className,
}: {
  presets: readonly P[];
  current?: string | null;
  pending: string | null;
  onPick: (p: P) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {presets.map((p) => {
        const on = current === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-busy={pending === p.id || undefined}
            disabled={pending !== null}
            onClick={() => onPick(p)}
            className={cx(
              'flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-60',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg',
              className,
            )}
          >
            <span className="min-w-0 flex-1">{p.label}</span>
            {pending === p.id ? <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin" /> : on && <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />}
          </button>
        );
      })}
    </div>
  );
}

/** Una opción para elegir entre varias en una fila de fichas («A 16», «A 24», «Por tiempo»): la elegida en acento suave. */
export const choiceClass = (on: boolean) =>
  cx(
    'inline-flex h-11 min-w-16 items-center justify-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition active:scale-95',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2',
  );

/** Un sí o no en una fila grande («Ida y vuelta», «Partido por el 3.er lugar»): sin bordes, con su círculo. */
export function ToggleRow({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-4 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        checked ? 'bg-accent-soft' : 'bg-surface-2',
      )}
    >
      <span aria-hidden="true" className={cx('grid size-6 shrink-0 place-items-center rounded-md', checked ? 'bg-accent text-accent-fg' : 'bg-surface shadow-[inset_0_0_0_1.5px_var(--faint)]')}>
        {checked && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[15px] font-semibold', checked && 'text-accent')}>{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * La tabla corta de Lite («Cómo van todos»), como la lista de la Tabla del boliche: puesto, nombre (con «Tú» en la fila
 * propia, en acento suave), una línea chica opcional y el número grande (los puntos). Cada fila abre algo si hay `onRow`.
 */
export function RankRows({
  rows,
  nameOf,
  value,
  sub,
  highlight = [],
  onRow,
  className,
}: {
  rows: readonly { id: string; rank: number }[];
  nameOf: (id: string) => ReactNode;
  value: (id: string) => ReactNode;
  sub?: (id: string) => ReactNode;
  highlight?: readonly string[];
  onRow?: (id: string) => void;
  className?: string;
}) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      {rows.map((r) => {
        const me = highlight.includes(r.id);
        return (
          <ListRow
            key={r.id}
            me={me}
            chevron={false}
            onClick={onRow ? () => onRow(r.id) : undefined}
            className="min-h-[60px]!"
            leading={<PosNum pos={r.rank} />}
            title={
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{nameOf(r.id)}</span>
                {me && <TuTag />}
              </span>
            }
            subtitle={sub?.(r.id)}
            value={value(r.id)}
          />
        );
      })}
    </Card>
  );
}

/**
 * Lo largo que pocos leen (cómo se desempata, cómo se ordena) cerrado en una línea discreta debajo de la tabla: se abre
 * al tocar «Cómo se desempata».
 */
export function FinePrint({ summary = 'Cómo se desempata', children, className }: { summary?: string; children: ReactNode; className?: string }) {
  return (
    <details className={cx('group mx-1 text-[12.5px] leading-[1.45] text-muted', className)}>
      <summary className="-my-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-fg-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden="true" className="size-3.5 transition group-open:rotate-180" />
        {summary}
      </summary>
      <p className="pt-1 pb-1">{children}</p>
    </details>
  );
}

/** «1 pareja» / «3 parejas». */
export const plural = (n: number, [one, many]: readonly [string, string]) => `${n} ${n === 1 ? one : many}`;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Columnas de la tabla de raqueta: PJ, G, P, dif. de sets, juegos a favor y en contra, dif. de juegos (pickleball y
 * ping pong: juegos y puntos).
 */
export function racketColumns(sport: string): StandingsColumn[] {
  const pk = isGameSport(sport);
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
