import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  attachSwipeBack,
  BACK_SELECTOR,
  BACK_THRESHOLD,
  CHIP_SIZE,
  chipTop,
  backDestination,
  findBackTarget,
  leaveScreen,
  swipeBackEnabled,
  swipeProgress,
  travel,
  type SwipeFrame,
} from './swipeBack.logic';

/** Estilo inicial (escondido detrás del borde): después lo mueve `draw` directo en el DOM, sin volver a dibujar React. */
const HIDDEN: CSSProperties = { transform: `translate3d(${-CHIP_SIZE}px, 0, 0)`, opacity: 0 };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** ¿Se ve? (las barras escondidas, como la de la liga cuando la pantalla pone la suya, no cuentan). */
function isShown(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility;
  if (typeof check === 'function') return check.call(el, { visibilityProperty: true });
  return el.getClientRects().length > 0;
}

const backLinks = () => document.querySelectorAll(BACK_SELECTOR);

/**
 * Deslizar desde el borde izquierdo hacia la derecha sale a la pantalla de arriba (la del «‹ atrás» de la pantalla, no la
 * última que se vio), en la app instalada con pantalla táctil (se monta una vez en el marco de la app y en la consola).
 * Un círculo con «‹» entra desde el borde siguiendo el dedo; al llegar al umbral se pinta del color de la app (y vibra en
 * Android). Sin a dónde salir (Hoy, Social, Ligas, Yo) se ve apagado y vuelve a su lugar. Ver swipeBack.logic.ts.
 */
export function SwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const chipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const here = useRef(location.pathname + location.search);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    here.current = location.pathname + location.search;
    navigateRef.current = navigate;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !swipeBackEnabled(window)) return;
    const draw = ({ dx, y, canGo, armed, animate, reduced }: SwipeFrame) => {
      const chip = chipRef.current;
      if (!chip) return;
      const p = swipeProgress(dx);
      chip.style.transition = animate ? 'transform 220ms var(--ease-out, ease-out), opacity 180ms ease-out' : 'none';
      // Con movimiento reducido no sigue al dedo: aparece en su lugar a medida que se desliza.
      const x = (reduced ? (dx > 0 ? travel(BACK_THRESHOLD, canGo) : 0) : travel(dx, canGo)) - CHIP_SIZE;
      chip.style.transform = `translate3d(${x}px, ${chipTop(y, window.innerHeight)}px, 0)`;
      const shown = reduced ? (dx > 0 ? Math.max(0.35, p) : 0) : Math.min(1, dx / 24);
      chip.style.opacity = String(canGo ? shown : shown * 0.6);
      chip.dataset.state = !canGo ? 'dead' : armed ? 'armed' : 'drag';
      if (arrowRef.current) arrowRef.current.style.transform = reduced || !canGo ? '' : `scale(${0.8 + 0.2 * p})`;
    };
    return attachSwipeBack({
      win: window,
      view: { draw },
      hasTarget: () => !!backDestination(findBackTarget(backLinks(), isShown), here.current),
      go: () =>
        leaveScreen({
          candidates: backLinks(),
          isVisible: isShown,
          here: here.current,
          navigate: (to, options) => navigateRef.current(to, options),
        }),
      reducedMotion,
      vibrate: (ms) => navigator.vibrate?.(ms),
    });
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-50 size-0" data-swipe-back="">
      <div
        ref={chipRef}
        style={HIDDEN}
        data-state="idle"
        className={
          'absolute top-0 left-0 grid size-10 place-items-center rounded-full border border-line bg-surface text-accent shadow-lg will-change-transform ' +
          'data-[state=armed]:border-accent data-[state=armed]:bg-accent data-[state=armed]:text-accent-fg data-[state=dead]:text-muted'
        }
      >
        <span ref={arrowRef} className="grid place-items-center">
          <ChevronLeft className="size-6" strokeWidth={2.6} />
        </span>
      </div>
    </div>
  );
}
