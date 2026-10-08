import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router';
import { Maximize, Minimize, Sun, X } from 'lucide-react';
import { courtVars, isIOS, useFullscreen, useSunMode, useWakeLock } from '../../../court';
import { useHoldBadgeUnlock } from '../../../components/badges/hold';
import { Button, Card, ListRow, RowIcon, cx } from '../../../components/ui';

/**
 * Pantalla completa «de campo» para lo que se anota fuera de un partido (la tarjeta de golf, el cronometraje de
 * natación), con las mismas piezas del modo cancha (src/court): pantalla siempre encendida (Wake Lock; en iPhone
 * viejo avisa cómo quitar el bloqueo), modo sol (alto contraste, se recuerda en el teléfono), pantalla completa
 * donde se puede, y directo en <body> (como CourtLayout) para que nada de la página la tape.
 * - `top`: fijo arriba (el hoyo, la serie);
 * - `children`: lo que se desplaza (los jugadores, los carriles);
 * - `footer`: siempre a la vista abajo (Hoyo listo, Publicar serie), lejos de la barra de la app.
 */
export function FieldScreen({
  title,
  subtitle,
  onExit,
  exitLabel = 'Salir de la pantalla completa',
  top,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onExit: () => void;
  exitLabel?: string;
  top?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [sun, setSun] = useSunMode();
  const wake = useWakeLock(true);
  // El aviso de una insignia nueva espera a que se cierre esta pantalla.
  useHoldBadgeUnlock();
  const full = useFullscreen();
  const [hideHint, setHideHint] = useState(false);

  // La página de atrás no se mueve mientras esta pantalla está encima.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const vars = courtVars(sun) as CSSProperties;
  const screen = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className={cx('fixed inset-0 z-40 flex flex-col overscroll-none bg-bg text-fg', sun && 'font-semibold', className)}
      style={{ ...vars, touchAction: 'manipulation' }}
    >
      <div className="pt-safe flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" onClick={onExit} aria-label={exitLabel} className={roundButton(false)}>
          <X aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-body font-semibold">{title}</p>
          {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => setSun(!sun)} aria-label={sun ? 'Quitar modo sol' : 'Modo sol (alto contraste)'} aria-pressed={sun} className={roundButton(sun)}>
          <Sun aria-hidden="true" className="size-5" />
        </button>
        {full.supported && (
          <button type="button" onClick={full.toggle} aria-label={full.active ? 'Salir de pantalla completa' : 'Pantalla completa'} className={roundButton(false)}>
            {full.active ? <Minimize aria-hidden="true" className="size-5" /> : <Maximize aria-hidden="true" className="size-5" />}
          </button>
        )}
      </div>

      {wake.hint && !hideHint && (
        <div role="status" className="mx-3 mt-2 flex items-center gap-2 rounded-2xl bg-surface-2 py-1 pr-1 pl-4 text-[13px] leading-snug">
          <span className="flex-1">
            {isIOS()
              ? 'Para que no se apague: Ajustes › Pantalla y brillo › Bloqueo automático › Nunca (vuélvelo a poner al terminar).'
              : 'Este navegador puede apagar la pantalla: súbele el tiempo de bloqueo mientras anotas.'}
          </span>
          <Button variant="ghost" onClick={() => setHideHint(true)} icon={<X className="size-4" />} aria-label="Cerrar aviso" className="h-11 w-11" />
        </div>
      )}

      {top && <div className="flex flex-col gap-2.5 px-3 pt-3">{top}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">{children}</div>

      {footer && <div className="pb-safe flex flex-col gap-2 border-t border-line bg-bg px-3 pt-3 pb-2">{footer}</div>}
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(screen, document.body) : screen;
}

/**
 * La pantalla completa guardada en la dirección (`?<param>=1`, así sobrevive a recargar). Entrar agrega una entrada
 * al historial: el «atrás» del teléfono sale de la pantalla completa y no de la página. `extra` = otros parámetros
 * que hacen falta para verla (p. ej. la pestaña).
 */
export function useFieldMode(param: string, extra: Record<string, string> = {}): { on: boolean; enter: () => void; exit: () => void } {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const pushed = useRef(false);
  const extraKey = JSON.stringify(extra);
  const enter = useCallback(() => {
    pushed.current = true;
    setSearch((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(JSON.parse(extraKey) as Record<string, string>)) n.set(k, v);
      n.set(param, '1');
      return n;
    });
  }, [param, extraKey, setSearch]);
  const exit = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      navigate(-1);
      return;
    }
    setSearch(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete(param);
        return n;
      },
      { replace: true },
    );
  }, [navigate, param, setSearch]);
  return { on: search.get(param) === '1', enter, exit };
}

/** Los botones redondos de la barra de la pantalla completa (44 px); el modo sol encendido, en el color del deporte. */
function roundButton(on: boolean) {
  return cx(
    'grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
  );
}

/** El botón que abre la pantalla completa: una fila tranquila con lo que hace, en chiquito. */
export function FieldModeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Card className="overflow-hidden">
      <ListRow
        leading={
          <RowIcon tone="accent">
            <Maximize className="size-5" />
          </RowIcon>
        }
        title={label}
        subtitle="Pantalla completa, siempre encendida y con modo sol"
        onClick={onClick}
      />
    </Card>
  );
}
