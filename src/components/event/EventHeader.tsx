import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Columns3, Download, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { usePlayers } from '../../lib/data';
import { useEventLanes } from '../../lib/data/lanes';
import { BusyIcon } from '../busy';
import { myLaneText } from '../lanes/MyLane';
import { Sheet, cx } from '../ui';
import { eventDay, eventTime } from './eventDay';
import { liveWhenText } from './eventPro';
import { LiveDot } from '../home/TodayCard';

// El día y la hora del evento están en eventDay.ts (sin React: los usa también la app del teléfono).
export { eventDay, eventTime };

// La línea debajo del título y el texto de «En juego» (sin React) están en eventPro.ts: los usa también la app del
// teléfono. Se siguen importando desde aquí.
export { eventMeta } from './eventPro';

/** «En juego» o «Empieza a las 7:30 pm» (Pro: delante de la fecha), con el punto del deporte. */
export function LiveWhen({ startsSoon, startLabel }: { startsSoon: boolean; startLabel: string | null }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-accent">
      <LiveDot />
      {liveWhenText(startsSoon, startLabel)}
    </span>
  );
}

/**
 * La barra de arriba: «‹ Liga de los martes» (vuelve a donde estaba o, si entró por un link, a `fallback`) y a la
 * derecha lo que lleve (`right`: «Excel» en Pro y «•••»). Un torneo sin liga no tiene a dónde volver. Deslizar desde el
 * borde (en la app instalada) va siempre a `fallback`, la pantalla de arriba (`data-back-to`, SwipeBack).
 */
export function EventTopBar({ back, right }: { back: { label: string; fallback: string } | null; right: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="-mt-3 flex h-[52px] items-center justify-between gap-2">
      {back ? (
        <button
          type="button"
          data-back-to={back.fallback}
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(back.fallback, { replace: true }))}
          className="-ml-3 inline-flex h-11 min-w-0 items-center pr-2 pl-1 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronLeft aria-hidden="true" className="size-6 shrink-0" />
          <span className="truncate">{back.label}</span>
        </button>
      ) : (
        <span />
      )}
      <div className="-mr-2 flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

/** «•••»: redondo, gris, 44 px (40 en Pro, que lleva «Excel» al lado). */
export function MoreButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Más opciones"
      aria-haspopup="dialog"
      className={cx(
        'relative grid shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        compact ? "size-10 after:absolute after:-inset-0.5 after:content-['']" : 'size-11',
      )}
    >
      <MoreHorizontal aria-hidden="true" strokeWidth={2.4} className={compact ? 'size-5' : 'size-[22px]'} />
    </button>
  );
}

/** El botón «Excel» con texto (Pro): una píldora gris de 36 px que se toca en 44. */
export function ExcelButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label="Descargar Excel"
      className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold text-fg transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
    >
      <BusyIcon busy={busy} icon={<Download aria-hidden="true" className="size-4" />} className="size-4" />
      Excel
    </button>
  );
}

/** «Tu pista: 7» a la vista (cuando el admin ya publicó las pistas), con quién la compartes. */
export function LaneChip({ lid, eventId, playerId, className }: { lid: string; eventId: string; playerId: string | null; className?: string }) {
  const lanes = useEventLanes(playerId ? lid : null, eventId);
  const players = usePlayers(lanes.data.length ? lid : undefined);
  const info = myLaneText(lanes.data, playerId, (id) => players.data.find((p) => p.id === id)?.name);
  if (!info) return null;
  return (
    <p role="status" className={cx('mm-ev-chip card-shadow inline-flex h-8 max-w-full items-center gap-[7px] self-start rounded-2xl px-[13px] text-sm font-semibold', className)}>
      <Columns3 aria-hidden="true" className="size-4 shrink-0 text-accent" />
      <span className="shrink-0">Tu pista: {info.lane}</span>
      {info.mates && <span className="min-w-0 truncate font-normal text-muted">· {info.mates}</span>}
    </p>
  );
}

/** Una opción del menú «•••». */
export interface MenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  /** La línea de abajo («Lo puedes ver en Pro»). */
  hint?: string;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}

/**
 * El menú «•••» del evento (una hoja): Compartir, Resultados, Reporte, Anotadores, Ajustes del evento y, al final y en
 * rojo, Eliminar (nunca al final de la pantalla de todos los días).
 */
export function EventMenu({ open, onClose, title, items }: { open: boolean; onClose: () => void; title: string; items: readonly MenuItem[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ul className="-mx-2 flex flex-col pb-1">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={it.onClick}
              disabled={it.busy}
              aria-busy={it.busy || undefined}
              className={cx(
                'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-70',
                it.danger && 'text-danger',
              )}
            >
              <span
                aria-hidden="true"
                className={cx('grid size-10 shrink-0 place-items-center rounded-xl', it.danger ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-2')}
              >
                <BusyIcon busy={!!it.busy} icon={<it.icon className="size-5" />} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{it.label}</span>
                {it.hint && <span className="block truncate text-[13px] text-muted">{it.hint}</span>}
              </span>
              {!it.danger && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
