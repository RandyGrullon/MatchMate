import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { RSVP_LABEL, type RsvpStatus } from '../../../lib/data/teamSports';
import { BusyIcon, useBusy } from '../../../components/busy';
import { Badge, Select, cx } from '../../../components/ui';
import { teamColor, textOn } from './logic';

/** Punto con el color del equipo. */
export function TeamDot({ team, color, className }: { team?: Pick<SeasonTeam, 'color' | 'order'> | null; color?: string; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block size-3 shrink-0 rounded-full ring-1 ring-black/10', className)} style={{ background: color ?? teamColor(team) }} />;
}

/** Nombre del equipo con su color (el del partido si el equipo ya no existe). */
export function TeamName({ team, label, className }: { team?: Pick<SeasonTeam, 'color' | 'order' | 'name'> | null; label?: string; className?: string }) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <TeamDot team={team} />
      <span className="truncate">{team?.name ?? label ?? 'Por definir'}</span>
    </span>
  );
}

/** Dorsal en un cuadrito con el color del equipo. */
export function Jersey({ n, color, className }: { n: number | null | undefined; color?: string; className?: string }) {
  const bg = color ?? 'var(--surface-2)';
  return (
    <span
      className={cx('inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-1 text-xs font-bold tabular-nums', className)}
      style={color ? { background: bg, color: textOn(color) } : { background: bg }}
    >
      {n ?? '–'}
    </span>
  );
}

const RSVP_TONE: Record<RsvpStatus, 'ok' | 'warn' | 'danger'> = { yes: 'ok', maybe: 'warn', no: 'danger' };
const RSVP_ICON: Record<RsvpStatus, ReactNode> = {
  yes: <Check className="size-4" />,
  maybe: <CircleHelp className="size-4" />,
  no: <X className="size-4" />,
};

/** Insignia de la convocatoria de un jugador («Voy», «Tal vez», «No voy»). */
export function RsvpBadge({ status, pending }: { status: RsvpStatus | null | undefined; pending?: boolean }) {
  if (!status) return <Badge>Sin responder</Badge>;
  return (
    <Badge tone={RSVP_TONE[status]}>
      {RSVP_LABEL[status]}
      {pending && ' ·'}
    </Badge>
  );
}

/**
 * Voy / Tal vez / No voy: tocar el que ya está marcado lo quita. Mientras se guarda, la ruedita en el que se tocó y no
 * se puede tocar otro; cada lista espera lo suya (las de los otros jugadores se siguen usando).
 */
export function RsvpButtons({ onChange, ...rest }: Omit<RsvpButtonsViewProps, 'busy' | 'onPick'> & { onChange: (next: RsvpStatus | null) => Promise<unknown> | void }) {
  const saving = useBusy<RsvpStatus>();
  return <RsvpButtonsView {...rest} busy={saving.busy} onPick={(tapped, next) => void saving.run(tapped, async () => onChange(next))} />;
}

interface RsvpButtonsViewProps {
  value: RsvpStatus | null | undefined;
  /** `tapped`: el botón que se tocó; `next`: lo que queda marcado (null si se quitó). */
  onPick: (tapped: RsvpStatus, next: RsvpStatus | null) => void;
  disabled?: boolean;
  /** El que se está guardando (su ícono cambia por la ruedita), o null. */
  busy?: RsvpStatus | null;
  size?: 'sm' | 'md';
  /** Para lectores de pantalla: «Convocatoria de Ana». */
  label?: string;
}

/** Lo que se ve (sin estado: se prueba con renderToString). */
export function RsvpButtonsView({ value, onPick, disabled, busy, size = 'md', label }: RsvpButtonsViewProps) {
  const order: RsvpStatus[] = ['yes', 'maybe', 'no'];
  // Nunca letra blanca fija: en oscuro el verde y el ámbar se aclaran (ver ON_OK / ON_WARN en ./logic).
  const on: Record<RsvpStatus, string> = {
    yes: 'bg-ok text-[color:var(--on-ok,var(--bg))] border-ok',
    maybe: 'bg-warn text-[color:var(--on-warn,var(--bg))] border-warn',
    no: 'bg-danger text-on-danger border-danger',
  };
  return (
    <div role="group" aria-label={label ?? 'Convocatoria'} aria-busy={busy ? true : undefined} className="flex gap-1.5">
      {order.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled || !!busy}
            aria-pressed={active}
            onClick={() => onPick(s, active ? null : s)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1 rounded-xl border font-semibold transition active:scale-[0.97] disabled:opacity-50',
              size === 'sm' ? 'h-9 px-2 text-xs' : 'h-12 px-3 text-sm',
              active ? on[s] : 'border-line bg-surface text-fg hover:bg-surface-2',
            )}
          >
            <BusyIcon busy={busy === s} icon={RSVP_ICON[s]} className="size-4" />
            {RSVP_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

/** Encabezado de sección con acción a la derecha. */
export function SectionHead({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-2', className)}>
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {action}
    </div>
  );
}

/**
 * Lista que guarda al cambiar (anotador, posición, rol): mientras espera, la ruedita queda donde va la flecha y no
 * se puede tocar. `className` es del contenedor (ancho, flex); `selectClassName`, del Select (alto).
 */
export function BusySelect({
  busy,
  className,
  selectClassName,
  disabled,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { busy: boolean; className?: string; selectClassName?: string }) {
  return (
    <span className={cx('relative block', className)}>
      <Select {...rest} className={cx(busy && 'appearance-none', selectClassName)} disabled={disabled || busy} aria-busy={busy || undefined} />
      {busy && <BusyIcon busy className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />}
    </span>
  );
}
