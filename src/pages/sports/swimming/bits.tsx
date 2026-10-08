import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Delete } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { usePlayers } from '../../../lib/data';
import { useSwimClubs, type SwimClub, type SwimMeet } from '../../../lib/data/swimming';
import { formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { formatSwimTime, parseSwimTime, STATUS_LABEL, timeFromDigits, type SwimStatus } from '../../../sports/swimming';
import { Badge, Button, Input, Sheet, cx } from '../../../components/ui';

/**
 * Piezas comunes de las pantallas de natación: quién es quién en la liga (admin, cronometrista, entrenador),
 * tiempos, estados, clubes y el teclado mm:ss.hh.
 */

/** La liga más lo propio de la natación: cronometrista (anotador de la liga) y los clubes que entrena la cuenta. */
export function useSwim() {
  const ctx = useLeagueCtx();
  const { user } = useAuth();
  const clubs = useSwimClubs(ctx.lid);
  const uid = user?.uid ?? null;
  const coachOf = useMemo(() => new Set(clubs.data.filter((c) => uid && c.coachId === uid).map((c) => c.id)), [clubs.data, uid]);
  return {
    ...ctx,
    uid,
    clubs,
    /** Admin o cronometrista (el anotador de la liga): toma tiempos y publica series. */
    isTimer: ctx.isAdmin || ctx.member?.scorer === true,
    /** Clubes que entrena esta cuenta. */
    coachOf,
  };
}

/** Nombre de cada jugador de la liga (los borrados salen como «(nadador borrado)»). */
export function useNames(lid: string) {
  const players = usePlayers(lid);
  return useMemo(() => {
    const m = new Map(players.data.map((p) => [p.id, p.name] as const));
    return { players, name: (id: string) => m.get(id) ?? '(nadador borrado)' };
  }, [players]);
}

/** «Copa Delfín», o sin nombre: «Encuentro 10 oct 2026» / «Control de marcas 10 oct 2026». */
export const meetTitle = (m: Pick<SwimMeet, 'type' | 'name' | 'date'>) =>
  m.name || `${m.type === 'control' ? 'Control de marcas' : m.type === 'torneo' ? 'Torneo' : 'Encuentro'} ${formatDate(m.date)}`;

export function clubMap(clubs: readonly SwimClub[]) {
  return new Map(clubs.map((c) => [c.id, c] as const));
}

/** Tiempo m:ss.hh (o «NT»), con cifras del mismo ancho (los grandes, con `num`). */
export function TimeText({ cs, className, empty = 'NT' }: { cs: number | null | undefined; className?: string; empty?: string }) {
  return <span className={cx('tabular-nums', className)}>{cs ? formatSwimTime(cs) : empty}</span>;
}

export function StatusBadge({ status }: { status: SwimStatus }) {
  if (status === 'ok') return null;
  return <Badge tone={status === 'dq' ? 'danger' : 'warn'}>{status === 'dq' ? 'DQ' : STATUS_LABEL[status]}</Badge>;
}

/** Club con su color (o nada si no tiene). `short` = la sigla si hay. */
export function ClubTag({ club, short, className }: { club: SwimClub | null | undefined; short?: boolean; className?: string }) {
  if (!club) return null;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1 text-xs text-muted', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: club.color ?? 'var(--line)' }} aria-hidden="true" />
      <span className="truncate">{short && club.short ? club.short : club.name}</span>
    </span>
  );
}

/**
 * Campo de tiempo de siembra: se escribe «28.45», «1:05.32» o se deja vacío (NT). Devuelve centésimas o null;
 * `invalid` si lo escrito no se entiende.
 */
export function SeedField({
  value,
  onChange,
  className,
  label = 'Tiempo de siembra',
}: {
  value: number | null;
  onChange: (cs: number | null, invalid: boolean) => void;
  className?: string;
  label?: string;
}) {
  const [text, setText] = useState(value ? formatSwimTime(value) : '');
  useEffect(() => {
    setText((t) => (parseSwimTime(t) === value ? t : value ? formatSwimTime(value) : ''));
  }, [value]);
  const bad = text.trim() !== '' && parseSwimTime(text) == null;
  return (
    <Input
      inputMode="decimal"
      placeholder="NT"
      aria-label={label}
      aria-invalid={bad}
      value={text}
      className={cx('h-11 w-24 text-center tabular-nums', bad && 'border-danger', className)}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        const cs = t ? parseSwimTime(t) : null;
        onChange(cs, t !== '' && cs == null);
      }}
    />
  );
}

/**
 * Teclado mm:ss.hh para los tiempos de los cronómetros físicos: las cifras se llenan desde la derecha
 * («2845» = 28.45). OK guarda; «Sin tiempo» lo borra.
 */
export function TimeKeypad({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: ReactNode;
  initial: number | null;
  onClose: () => void;
  onSave: (cs: number | null) => void;
}) {
  const [digits, setDigits] = useState('');
  useEffect(() => {
    if (open) setDigits('');
  }, [open]);
  const cs = digits ? timeFromDigits(digits) : null;
  const shown = digits ? (cs ? formatSwimTime(cs, { full: true }) : '—') : initial ? formatSwimTime(initial, { full: true }) : '00:00.00';
  const press = (d: string) => setDigits((x) => (x.length >= 6 ? x : (x + d).replace(/^0+/, '')));
  const key = (label: ReactNode, onClick: () => void, extra?: string, aria?: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className={cx('num flex h-key items-center justify-center rounded-key bg-surface-2 text-[26px] font-[650] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent', extra)}
    >
      {label}
    </button>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle="2845 = 28.45 · 10532 = 1:05.32"
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <Button variant="quiet" size="lg" onClick={() => onSave(null)}>
            Sin tiempo
          </Button>
          <Button variant="primary" size="lg" disabled={!!digits && !cs} onClick={() => (digits ? cs && onSave(cs) : onClose())}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <p className={cx('num text-center text-hero-sm', digits && !cs ? 'text-danger' : !digits && 'text-muted')} aria-live="polite">
          {shown}
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d)))}
          {key('C', () => setDigits(''), 'text-lg text-muted', 'Borrar todo')}
          {key('0', () => press('0'))}
          {key(<Delete className="size-6" />, () => setDigits((x) => x.slice(0, -1)), undefined, 'Borrar una cifra')}
        </div>
      </div>
    </Sheet>
  );
}

/** Botones de opción (segmentados), con el aspecto del segmentado del rediseño; acepta números (25 m | 50 m). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[14px] bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "relative min-h-9 rounded-[10px] px-3.5 text-meta font-semibold whitespace-nowrap transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            value === o.value ? 'bg-seg-on text-fg shadow-[0_1px_3px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
