import { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloudUpload, Flag, Maximize, Minimize, MoreHorizontal, PauseCircle, Sun, Undo2, X } from 'lucide-react';
import { useFeedback, saveErrorMessage } from '../components/feedback';
import { EventMenu, type MenuItem } from '../components/event/EventHeader';
import { Button, Field, Input, Sheet, cx } from '../components/ui';
import { courtVars, isIOS, useFullscreen, useSunMode, useWakeLock } from './device';
import { useHoldBadgeUnlock } from '../components/badges/hold';
import { LeaseBanner } from './LeaseBanner';
import type { CourtController } from './useCourt';

/** Botón redondo de 44 px de la barra de arriba (salir, sol, pantalla completa, «•••»). */
function RoundButton({
  onClick,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        'grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        pressed ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Una línea de aviso arriba de la zona de toques («Saca Ana / Luis», «Cambio de lado», «¡Tiempo!»): gris para lo de
 * siempre, en el color del deporte para lo que hay que mirar y en rojo para lo urgente.
 */
export function CourtNote({ tone = 'neutral', role = 'status', className, children }: { tone?: 'neutral' | 'accent' | 'danger'; role?: 'status' | 'alert'; className?: string; children: ReactNode }) {
  return (
    <div
      role={role}
      className={cx(
        'flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-[15px]',
        tone === 'accent' ? 'bg-accent-soft font-semibold text-accent' : tone === 'danger' ? 'bg-danger-soft font-semibold text-danger' : 'bg-surface-2 text-fg',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Pantalla completa del modo cancha, igual para todos los deportes (rediseño «Calma y foco»):
 * - arriba: salir (✕), cancha y ronda, modo sol, pantalla completa y «•••» (suspender, y lo que agregue el deporte en
 *   `more`, como el retiro);
 * - avisos: pantalla siempre encendida (y cómo en iPhone viejo), sin señal, otro anotador;
 * - `header`: el marcador grande del deporte;
 * - `children`: la zona de toques (TwoHalves, dorsales…), que ocupa lo que sobra;
 * - abajo, siempre a la vista y grandes (56 px): Deshacer, los botones del deporte (`actions`) y Terminar.
 * Funciona en vertical y en horizontal; con sol, alto contraste.
 */
export function CourtLayout({
  title,
  subtitle,
  onExit,
  court,
  header,
  children,
  actions,
  more = [],
  isAdmin,
  undoLabel,
  finishSummary,
  onFinished,
  canSuspend = true,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onExit: () => void;
  /** El controlador de useCourt (de cualquier deporte). */
  court: CourtController<unknown, unknown, unknown>;
  header?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Más opciones del deporte en «•••» (el retiro), antes de «Suspender». */
  more?: readonly MenuItem[];
  isAdmin?: boolean;
  /** «Deshacer: punto de Ana / Luis». */
  undoLabel?: string;
  /** Lo que se muestra al confirmar el final (p. ej. «6-4 6-3 · Ganan Ana / Luis»). Por defecto el resumen del motor. */
  finishSummary?: ReactNode;
  /** Después de terminar ('sent' o 'queued'): volver a la jornada, compartir… */
  onFinished?: (how: 'sent' | 'queued') => void;
  canSuspend?: boolean;
  className?: string;
}) {
  const [sun, setSun] = useSunMode();
  const wake = useWakeLock(true);
  // El aviso de una insignia nueva espera a que se cierre esta pantalla.
  useHoldBadgeUnlock();
  const full = useFullscreen();
  const { toast } = useFeedback();
  const [hideHint, setHideHint] = useState(false);
  const [menu, setMenu] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const doFinish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const how = await court.finish();
      setFinishing(false);
      if (how === 'stale') {
        toast('Otro teléfono va más adelante: termina el partido desde ahí.', 'error');
        return;
      }
      toast(how === 'sent' ? 'Resultado enviado' : 'Sin señal: el resultado se envía solo al volver');
      onFinished?.(how);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doSuspend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await court.suspend(note.trim() || undefined);
      setSuspending(false);
      toast('Partido suspendido. Se retoma desde aquí.');
      onExit();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const menuItems: MenuItem[] = [
    ...more.map((it) => ({
      ...it,
      onClick: () => {
        setMenu(false);
        it.onClick();
      },
    })),
    // Suspender con el marcador de ahora (lo que se pueda anotar: con el turno y el partido empezado).
    ...(canSuspend && !court.readOnly && court.snapshot
      ? [
          {
            key: 'suspender',
            icon: PauseCircle,
            label: 'Suspender',
            hint: 'Lluvia, luz… con el marcador de ahora',
            onClick: () => {
              setMenu(false);
              setSuspending(true);
            },
          },
        ]
      : []),
  ];

  const vars = courtVars(sun) as CSSProperties;
  const screen = (
    <div
      className={cx('fixed inset-0 z-40 flex flex-col overscroll-none bg-bg text-fg select-none', sun && 'font-semibold', className)}
      style={{ ...vars, touchAction: 'manipulation' }}
    >
      <div className="pt-safe flex items-center gap-2 px-3 pt-2 pb-1">
        <RoundButton onClick={onExit} label="Salir del modo cancha">
          <X className="size-5" strokeWidth={2.4} />
        </RoundButton>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</p>
          {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
        {court.unsent > 0 && court.lease.kind !== 'offline' && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-muted" title="Publicaciones por enviar">
            <CloudUpload className="size-4" />
            {court.unsent}
          </span>
        )}
        <RoundButton onClick={() => setSun(!sun)} label={sun ? 'Quitar modo sol' : 'Modo sol (alto contraste)'} pressed={sun}>
          <Sun className="size-5" />
        </RoundButton>
        {full.supported && (
          <RoundButton onClick={full.toggle} label={full.active ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            {full.active ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </RoundButton>
        )}
        {menuItems.length > 0 && (
          <RoundButton onClick={() => setMenu(true)} label="Más opciones">
            <MoreHorizontal className="size-[22px]" strokeWidth={2.4} />
          </RoundButton>
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 pt-2 empty:hidden">
        {wake.hint && !hideHint && (
          <div role="status" className="flex items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pr-1.5 pl-4 text-[13px]">
            <span className="flex-1">
              {isIOS()
                ? 'Para que no se apague: Ajustes › Pantalla y brillo › Bloqueo automático › Nunca (vuélvelo a poner al terminar).'
                : 'Este navegador puede apagar la pantalla: súbele el tiempo de bloqueo mientras anotas.'}
            </span>
            <button
              type="button"
              onClick={() => setHideHint(true)}
              aria-label="Cerrar aviso"
              className="grid size-11 shrink-0 place-items-center rounded-full text-faint hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <LeaseBanner lease={court.lease} unsent={court.unsent} conflict={court.conflict} isAdmin={isAdmin} onClaim={court.claim} />
        {court.error && (
          <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {court.error}
          </div>
        )}
      </div>

      {header && <div className="px-3 pt-2 landscape:max-lg:pt-1">{header}</div>}

      <div className="min-h-0 flex-1 p-3 landscape:max-lg:py-2">{children}</div>

      <div className="pb-safe flex items-center gap-2.5 px-3 pt-1 pb-3">
        <Button
          variant="quiet"
          size="xl"
          className="min-w-[8.5rem] flex-1 px-4 sm:flex-none"
          disabled={!court.canUndo}
          onClick={() => court.undo()}
          icon={<Undo2 className="size-5" />}
          aria-label={undoLabel ?? 'Deshacer la última jugada'}
        >
          {undoLabel ? (
            <>
              {/* A 360 px no cabe «Deshacer punto» junto a «Terminar»: ahí basta «Deshacer» (el aria-label dice todo). */}
              <span className="max-[379px]:hidden">{undoLabel}</span>
              <span className="hidden max-[379px]:inline">Deshacer</span>
            </>
          ) : (
            'Deshacer'
          )}
        </Button>
        {actions}
        <Button
          variant={court.over ? 'primary' : 'quiet'}
          size="xl"
          className="px-5"
          disabled={court.readOnly || !court.snapshot}
          onClick={() => setFinishing(true)}
          icon={<Flag className="size-5" />}
        >
          Terminar
        </Button>
      </div>

      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title="¿Terminar el partido?"
        footer={
          <div className="flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setFinishing(false)}>
              Seguir anotando
            </Button>
            <Button variant="primary" size="lg" className="flex-1" loading={busy} onClick={() => void doFinish()}>
              Enviar resultado
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 pb-1">
          <p className="num text-[30px] leading-tight font-[650]">{finishSummary ?? (court.summary || 'Sin marcador')}</p>
          {!court.over && <p className="text-[15px] font-semibold text-danger">Según las reglas todavía no termina. ¿Seguro?</p>}
          <p className="text-[13px] text-muted">Si juegas, el rival lo confirma. Sin señal, se envía solo al volver.</p>
        </div>
      </Sheet>

      <EventMenu open={menu} onClose={() => setMenu(false)} title="Opciones del partido" items={menuItems} />

      <Sheet
        open={suspending}
        onClose={() => setSuspending(false)}
        title="Suspender el partido"
        subtitle="Otro día se retoma desde aquí"
        footer={
          <div className="flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setSuspending(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="lg" className="flex-1" loading={busy} onClick={() => void doSuspend()}>
              Suspender
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[15px]">
            Se guarda el marcador: <b className="num">{court.summary || 'sin puntos'}</b>. Se puede retomar en este u otro teléfono.
          </p>
          <Field label="Motivo (opcional)">
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Lluvia, se fue la luz…" />
          </Field>
        </div>
      </Sheet>
    </div>
  );
  // Directo en <body>: un transform o filtro de algún contenedor de la página haría que `fixed` quedara dentro de él.
  return typeof document !== 'undefined' ? createPortal(screen, document.body) : screen;
}
