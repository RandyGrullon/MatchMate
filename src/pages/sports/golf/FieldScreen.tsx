import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router';
import { Maximize, Minimize, Sun, X } from 'lucide-react';
import { courtVars, isIOS, useFullscreen, useSunMode, useWakeLock } from '../../../court';
import { useHoldBadgeUnlock } from '../../../components/badges/hold';
import { Button, cx } from '../../../components/ui';

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
      <div className="pt-safe flex items-center gap-1 border-b border-line px-2 py-1.5">
        <Button variant="ghost" onClick={onExit} icon={<X className="size-5" />} aria-label={exitLabel} />
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
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
      </div>

      {wake.hint && !hideHint && (
        <div role="status" className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
          <span className="flex-1">
            {isIOS()
              ? 'Para que la pantalla no se apague: Ajustes › Pantalla y brillo › Bloqueo automático › Nunca (vuélvelo a poner al terminar).'
              : 'Este navegador puede apagar la pantalla: súbele el tiempo de bloqueo mientras anotas.'}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setHideHint(true)} icon={<X className="size-4" />} aria-label="Cerrar aviso" />
        </div>
      )}

      {top && <div className="flex flex-col gap-2 px-3 pt-2">{top}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">{children}</div>

      {footer && <div className="pb-safe flex flex-col gap-2 border-t border-line bg-bg px-3 py-2">{footer}</div>}
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

/** El botón que abre la pantalla completa (con lo que hace, en chiquito). */
export function FieldModeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft/50 px-3 py-2 text-left transition active:scale-[0.98]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
        <Maximize className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">Pantalla completa, siempre encendida y con modo sol</span>
      </span>
      <Sun className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
