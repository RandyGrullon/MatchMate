import type { ReactNode } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { RSVP_LABEL, type RsvpStatus } from '../../../lib/data/teamSports';
import { Badge, cx } from '../../../components/ui';
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

/** Voy / Tal vez / No voy: tocar el que ya está marcado lo quita. */
export function RsvpButtons({
  value,
  onChange,
  disabled,
  size = 'md',
  label,
}: {
  value: RsvpStatus | null | undefined;
  onChange: (next: RsvpStatus | null) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Para lectores de pantalla: «Convocatoria de Ana». */
  label?: string;
}) {
  const order: RsvpStatus[] = ['yes', 'maybe', 'no'];
  // Nunca letra blanca fija: en oscuro el verde y el ámbar se aclaran (ver ON_OK / ON_WARN en ./logic).
  const on: Record<RsvpStatus, string> = {
    yes: 'bg-ok text-[color:var(--on-ok,var(--bg))] border-ok',
    maybe: 'bg-warn text-[color:var(--on-warn,var(--bg))] border-warn',
    no: 'bg-danger text-on-danger border-danger',
  };
  return (
    <div role="group" aria-label={label ?? 'Convocatoria'} className="flex gap-1.5">
      {order.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : s)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1 rounded-xl border font-semibold transition active:scale-[0.97] disabled:opacity-50',
              size === 'sm' ? 'h-9 px-2 text-xs' : 'h-12 px-3 text-sm',
              active ? on[s] : 'border-line bg-surface text-fg hover:bg-surface-2',
            )}
          >
            {RSVP_ICON[s]}
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
