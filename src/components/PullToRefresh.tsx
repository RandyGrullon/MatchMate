import { ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { currentOutbox, queryClient } from '../lib/data/client';
import { refreshNotices } from '../lib/notices';
import { refreshSportStatus } from '../sports/status';
import { LogoSpinner } from './Logo';
import { attachPullToRefresh, PULL_THRESHOLD, pullProgress, type PullFrame, type PullPhase } from './pullToRefresh.logic';

/**
 * Lo que hace «desliza para actualizar»: vuelve a pedir lo que está en pantalla (sin vaciarla) y espera eso; además,
 * sin esperar: el estado de los deportes, los avisos, la cola sin conexión y si hay una versión nueva de la app.
 */
export async function refreshApp(): Promise<void> {
  const quietly = (fn: () => unknown) => {
    try {
      void Promise.resolve(fn()).catch(() => undefined);
    } catch {
      // lo de al lado no frena lo demás
    }
  };
  quietly(() => currentOutbox()?.flush());
  quietly(refreshSportStatus);
  quietly(refreshNotices);
  // La versión nueva la avisa PwaPrompts (escucha updatefound); aquí solo se pregunta.
  quietly(() => (typeof navigator === 'undefined' ? undefined : navigator.serviceWorker?.getRegistration().then((r) => r?.update())));
  await queryClient.refreshActive();
}

/** Tamaño del círculo (px). */
const CHIP = 40;
const RING_R = 17;
const RING = 2 * Math.PI * RING_R;
/** Estilo inicial (escondido): después lo mueve `draw` directo en el DOM, sin volver a dibujar React en cada toque. */
const HIDDEN: CSSProperties = { transform: `translate3d(-50%, ${-CHIP}px, 0)`, opacity: 0 };
const RING_HIDDEN: CSSProperties = { strokeDasharray: RING, strokeDashoffset: RING };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SAY: Partial<Record<PullPhase, string>> = { armed: 'Suelta para actualizar', refreshing: 'Actualizando…' };

/**
 * Deslizar hacia abajo arriba de todo actualiza la pantalla (cualquier pantalla: se monta una vez en el marco de la
 * app). Un círculo baja desde arriba con una flecha que gira con el dedo y un anillo que se llena; al llegar al umbral
 * se pinta del color de la app (y vibra en Android). Al soltar gira el logo hasta que llega lo nuevo.
 * `onRefresh` reemplaza lo que se actualiza (pruebas).
 */
export function PullToRefresh({ onRefresh }: { onRefresh?: () => unknown }) {
  const [phase, setPhase] = useState<PullPhase>('idle');
  const chipRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const draw = ({ distance, animate, reduced }: PullFrame) => {
      const chip = chipRef.current;
      if (!chip) return;
      const p = pullProgress(distance);
      chip.style.transition = animate ? 'transform 240ms var(--ease-out, ease-out), opacity 200ms ease-out' : 'none';
      // Con movimiento reducido no sigue al dedo: aparece en su lugar a medida que se desliza.
      const y = (reduced ? (distance > 0 ? PULL_THRESHOLD : 0) : distance) - CHIP;
      chip.style.transform = `translate3d(-50%, ${y}px, 0)`;
      chip.style.opacity = String(reduced ? p : Math.min(1, distance / 24));
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING * (1 - p));
      if (arrowRef.current) arrowRef.current.style.transform = reduced ? '' : `rotate(${p * 180}deg)`;
    };
    return attachPullToRefresh({
      win: window,
      view: { draw, phase: setPhase },
      refresh: () => (refreshRef.current ?? refreshApp)(),
      reducedMotion,
      vibrate: (ms) => navigator.vibrate?.(ms),
    });
  }, []);

  const spinning = phase === 'refreshing' || phase === 'settling';
  const armed = phase === 'armed';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0" data-pull={phase}>
      <div
        ref={chipRef}
        aria-hidden="true"
        style={HIDDEN}
        className={
          'absolute top-[env(safe-area-inset-top)] left-1/2 grid size-10 place-items-center rounded-full border shadow-lg will-change-transform ' +
          (armed ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-accent')
        }
      >
        {spinning ? (
          <LogoSpinner className="size-6" />
        ) : (
          <>
            <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" fill="none">
              <circle ref={ringRef} cx="20" cy="20" r={RING_R} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={RING_HIDDEN} />
            </svg>
            <span ref={arrowRef} className="grid place-items-center">
              <ArrowDown className="size-5" strokeWidth={2.6} />
            </span>
          </>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {SAY[phase] ?? ''}
      </p>
    </div>
  );
}
