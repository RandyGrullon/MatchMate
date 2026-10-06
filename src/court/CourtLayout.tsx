import { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloudUpload, Flag, Maximize, Minimize, MoreVertical, PauseCircle, Sun, Undo2, X } from 'lucide-react';
import { useFeedback, saveErrorMessage } from '../components/feedback';
import { Button, Field, Input, Modal, cx } from '../components/ui';
import { courtVars, isIOS, useFullscreen, useSunMode, useWakeLock } from './device';
import { useHoldBadgeUnlock } from '../components/badges/hold';
import { LeaseBanner } from './LeaseBanner';
import type { CourtController } from './useCourt';

/**
 * Pantalla completa del modo cancha, igual para todos los deportes:
 * - arriba: salir, cancha y ronda, modo sol, pantalla completa y el menú (suspender);
 * - avisos: pantalla siempre encendida (y cómo en iPhone viejo), sin señal, otro anotador;
 * - `header`: el marcador grande del deporte;
 * - `children`: la zona de toques (TwoHalves, dorsales…), que ocupa lo que sobra;
 * - abajo, siempre a la vista: Deshacer, los botones del deporte (`actions`) y Terminar.
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

  const vars = courtVars(sun) as CSSProperties;
  const screen = (
    <div
      className={cx('fixed inset-0 z-40 flex flex-col overscroll-none bg-bg text-fg select-none', sun && 'font-semibold', className)}
      style={{ ...vars, touchAction: 'manipulation' }}
    >
      <div className="pt-safe flex items-center gap-1 border-b border-line px-2 py-1.5">
        <Button variant="ghost" onClick={onExit} icon={<X className="size-5" />} aria-label="Salir del modo cancha" />
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {court.unsent > 0 && court.lease.kind !== 'offline' && (
          <span className="flex items-center gap-1 text-xs text-muted" title="Publicaciones por enviar">
            <CloudUpload className="size-4" />
            {court.unsent}
          </span>
        )}
        <Button
          variant={sun ? 'primary' : 'ghost'}
          onClick={() => setSun(!sun)}
          icon={<Sun className="size-5" />}
          aria-label={sun ? 'Quitar modo sol' : 'Modo sol (alto contraste)'}
          aria-pressed={sun}
        />
        {full.supported && (
          <Button
            variant="ghost"
            onClick={full.toggle}
            icon={full.active ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            aria-label={full.active ? 'Salir de pantalla completa' : 'Pantalla completa'}
          />
        )}
        {canSuspend && (
          <Button variant="ghost" onClick={() => setMenu(true)} icon={<MoreVertical className="size-5" />} aria-label="Más opciones" />
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 pt-2 empty:hidden">
        {wake.hint && !hideHint && (
          <div role="status" className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
            <span className="flex-1">
              {isIOS()
                ? 'Para que la pantalla no se apague: Ajustes › Pantalla y brillo › Bloqueo automático › Nunca (vuélvelo a poner al terminar).'
                : 'Este navegador puede apagar la pantalla: súbele el tiempo de bloqueo mientras anotas.'}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setHideHint(true)} icon={<X className="size-4" />} aria-label="Cerrar aviso" />
          </div>
        )}
        <LeaseBanner lease={court.lease} unsent={court.unsent} conflict={court.conflict} isAdmin={isAdmin} onClaim={court.claim} />
        {court.error && (
          <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {court.error}
          </div>
        )}
      </div>

      {header && <div className="px-3 pt-2 landscape:max-lg:pt-1">{header}</div>}

      <div className="min-h-0 flex-1 p-3 landscape:max-lg:py-2">{children}</div>

      <div className="pb-safe flex items-center gap-2 border-t border-line px-3 py-2">
        <Button
          className="h-14 min-w-[8.5rem] flex-1 text-base sm:flex-none"
          disabled={!court.canUndo}
          onClick={() => court.undo()}
          icon={<Undo2 className="size-5" />}
          aria-label={undoLabel ?? 'Deshacer la última jugada'}
        >
          <span className="truncate">{undoLabel ?? 'Deshacer'}</span>
        </Button>
        {actions}
        <Button
          variant={court.over ? 'primary' : 'secondary'}
          className="h-14 text-base"
          disabled={court.readOnly || !court.snapshot}
          onClick={() => setFinishing(true)}
          icon={<Flag className="size-5" />}
        >
          Terminar
        </Button>
      </div>

      <Modal
        open={finishing}
        onClose={() => setFinishing(false)}
        title="¿Terminar el partido?"
        footer={
          <>
            <Button onClick={() => setFinishing(false)}>Seguir anotando</Button>
            <Button variant="primary" loading={busy} onClick={() => void doFinish()}>
              Enviar resultado
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-bold tabular-nums">{finishSummary ?? (court.summary || 'Sin marcador')}</p>
          {!court.over && <p className="text-sm text-warn">El partido todavía no llega al final según las reglas. ¿Seguro que terminó?</p>}
          <p className="text-sm text-muted">Si lo anotaste tú y juegas, el rival lo confirma. Si no hay señal, se envía solo al volver.</p>
        </div>
      </Modal>

      <Modal open={menu} onClose={() => setMenu(false)} title="Opciones del partido">
        <div className="flex flex-col gap-2">
          <Button
            className="h-12 justify-start"
            icon={<PauseCircle className="size-5" />}
            disabled={court.readOnly || !court.snapshot}
            onClick={() => {
              setMenu(false);
              setSuspending(true);
            }}
          >
            Suspender (lluvia, luz…) con el marcador de ahora
          </Button>
        </div>
      </Modal>

      <Modal
        open={suspending}
        onClose={() => setSuspending(false)}
        title="Suspender el partido"
        footer={
          <>
            <Button onClick={() => setSuspending(false)}>Cancelar</Button>
            <Button variant="danger" loading={busy} onClick={() => void doSuspend()}>
              Suspender
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Se guarda el marcador: <b className="tabular-nums">{court.summary || 'sin puntos'}</b>. Otro día se retoma desde aquí (en este u otro teléfono).
          </p>
          <Field label="Motivo (opcional)">
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Lluvia, se fue la luz…" />
          </Field>
        </div>
      </Modal>
    </div>
  );
  // Directo en <body>: un transform o filtro de algún contenedor de la página haría que `fixed` quedara dentro de él.
  return typeof document !== 'undefined' ? createPortal(screen, document.body) : screen;
}
