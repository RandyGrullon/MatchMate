/**
 * «Desliza hacia abajo para actualizar» en cualquier pantalla (lo pidió el dueño). Aquí va lo que decide, sin React
 * ni navegador de verdad (con pruebas): cuándo puede empezar, cuánto baja el indicador, cuándo está listo para
 * soltar y el manejo de los toques. PullToRefresh.tsx lo dibuja y dice qué se actualiza.
 *
 * - Solo con un dedo, con la página arriba de todo (scrollY 0) y fuera de modales, campos de texto, el modo cancha
 *   y las listas propias que no están arriba de todo.
 * - Deslizar de lado (carruseles) no actualiza: la dirección se decide a los 10 px.
 * - El indicador baja la mitad de lo que baja el dedo; pasado el umbral (64 px) cuesta cada vez más (máx. 110 px).
 */

/** Recorrido del indicador (px) desde el que soltar actualiza. */
export const PULL_THRESHOLD = 64;
/** Recorrido máximo del indicador (px): nunca llega, se acerca cada vez más lento. */
export const PULL_MAX = 110;
/** Cuánto baja el indicador por cada px del dedo antes del umbral. */
export const PULL_RESISTANCE = 0.5;
/** A los cuántos px se decide si es hacia abajo (actualizar) o de lado / hacia arriba (no). */
export const DIRECTION_SLOP = 10;
/** El indicador gira al menos esto aunque la app responda enseguida (si no, parece que no hizo nada). */
export const MIN_SPIN_MS = 600;
/** Lo que tarda en volver a esconderse. */
export const SETTLE_MS = 240;

/** Recorrido del indicador para lo que bajó el dedo: la mitad hasta el umbral y después con freno (nunca llega al máximo). */
export function resist(raw: number): number {
  if (!(raw > 0)) return 0;
  const x = raw * PULL_RESISTANCE;
  if (x <= PULL_THRESHOLD) return x;
  const room = PULL_MAX - PULL_THRESHOLD;
  return PULL_THRESHOLD + room * (1 - Math.exp(-(x - PULL_THRESHOLD) / room));
}

/** Cuánto falta para el umbral: 0 (nada) a 1 (listo para soltar). */
export const pullProgress = (distance: number): number => Math.max(0, Math.min(1, distance / PULL_THRESHOLD));

export const isArmed = (distance: number): boolean => distance >= PULL_THRESHOLD;

// ---------- ¿Puede empezar? ----------

/**
 * Donde deslizar no actualiza: modales (y su contenido), campos de texto, el modo cancha / golf (pantallas fijas con
 * overscroll-none) y lo que se marque con `data-no-pull`.
 */
export const NO_PULL_SELECTOR = [
  'dialog',
  '.modal-scroll',
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '.overscroll-none',
  '[data-no-pull]',
].join(', ');

/** Lo que se usa del elemento tocado (Element en el navegador; objetos simples en las pruebas). */
interface NodeLike {
  closest?(selector: string): unknown;
  parentElement?: NodeLike | null;
  scrollTop?: number;
  isContentEditable?: boolean;
  ownerDocument?: {
    querySelector(selector: string): unknown;
    documentElement?: unknown;
    body?: unknown;
    defaultView?: { getComputedStyle?(el: never): { position?: string } } | null;
  } | null;
}

/**
 * ¿Este toque puede empezar a deslizar para actualizar? Un dedo, la página arriba de todo, sin modal abierto, fuera
 * de campos y pantallas fijas, y sin una lista propia (overflow) que todavía pueda subir.
 */
export function shouldStart(target: EventTarget | null, scrollY: number, touches: number): boolean {
  if (touches !== 1 || scrollY > 0) return false;
  const el = target as NodeLike | null;
  if (!el || typeof el.closest !== 'function') return false;
  const doc = el.ownerDocument;
  if (doc?.querySelector('dialog[open]')) return false;
  if (el.isContentEditable || el.closest(NO_PULL_SELECTOR)) return false;
  const style = doc?.defaultView?.getComputedStyle?.bind(doc.defaultView);
  for (let n: NodeLike | null | undefined = el; n && n !== doc?.documentElement && n !== doc?.body; n = n.parentElement) {
    // Una lista con su propio scroll que no está arriba: el dedo la sube a ella.
    if ((n.scrollTop ?? 0) > 0) return false;
    // Barra de abajo, menús flotantes y pantallas encima: no son la página.
    if (style && style(n as never).position === 'fixed') return false;
  }
  return true;
}

// ---------- Seguir el dedo ----------

export interface PullTracker {
  /** pending = todavía no se sabe la dirección; pulling = bajando; cancelled = era de lado o hacia arriba. */
  phase: 'pending' | 'pulling' | 'cancelled';
  x0: number;
  y0: number;
  /** Recorrido del indicador (ya con el freno). */
  distance: number;
  armed: boolean;
}

export interface PullStep {
  tracker: PullTracker;
  /** Hay que frenar el scroll del navegador (preventDefault) en este movimiento. */
  prevent: boolean;
  /** Cruzó el umbral en este movimiento (para vibrar al llegar). */
  crossed: 'armed' | 'disarmed' | null;
}

/** Dirección de un movimiento desde el inicio del toque. */
export function lockDirection(dx: number, dy: number, slop = DIRECTION_SLOP): 'pending' | 'pull' | 'cancel' {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < slop) return 'pending';
  return dy > Math.abs(dx) ? 'pull' : 'cancel';
}

export const beginPull = (x: number, y: number): PullTracker => ({ phase: 'pending', x0: x, y0: y, distance: 0, armed: false });

/** Un movimiento del dedo. Con la página arriba de todo, hacia abajo no hay nada que desplazar: se frena desde el primero. */
export function movePull(t: PullTracker, x: number, y: number): PullStep {
  if (t.phase === 'cancelled') return { tracker: t, prevent: false, crossed: null };
  const dx = x - t.x0;
  const dy = y - t.y0;
  if (t.phase === 'pending') {
    const lock = lockDirection(dx, dy);
    if (lock === 'cancel') return { tracker: { ...t, phase: 'cancelled' }, prevent: false, crossed: null };
    // Mientras se decide: si va más hacia abajo que de lado, el navegador no debe empezar su rebote.
    if (lock === 'pending') return { tracker: t, prevent: dy > 0 && dy >= Math.abs(dx), crossed: null };
  }
  // Ya es hacia abajo: si el dedo vuelve más arriba de donde empezó, el indicador queda escondido (no se suelta).
  const distance = resist(dy);
  const armed = isArmed(distance);
  const crossed = armed === t.armed ? null : armed ? 'armed' : 'disarmed';
  return { tracker: { ...t, phase: 'pulling', distance, armed }, prevent: true, crossed };
}

/** Al soltar: ¿se actualiza? */
export const releasePull = (t: PullTracker | null): boolean => t?.phase === 'pulling' && t.armed;

// ---------- Los toques (sin React) ----------

export type PullPhase = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'settling';

export interface PullFrame {
  /** Recorrido del indicador en px (0 = escondido). */
  distance: number;
  /** Con transición (al soltar) o pegado al dedo. */
  animate: boolean;
  /** Movimiento reducido: el indicador no se mueve con el dedo, solo aparece. */
  reduced: boolean;
}

export interface PullView {
  draw(frame: PullFrame): void;
  phase(phase: PullPhase): void;
}

type TouchType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

/** Lo que se usa de window. */
export interface PullWindow {
  readonly scrollY: number;
  addEventListener(type: TouchType, listener: (e: TouchEvent) => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: TouchType, listener: (e: TouchEvent) => void): void;
}

export interface PullControllerOptions {
  win: PullWindow;
  view: PullView;
  /** Lo que se actualiza; el indicador gira hasta que termina (y al menos MIN_SPIN_MS). */
  refresh: () => unknown;
  canStart?: (target: EventTarget | null, scrollY: number, touches: number) => boolean;
  reducedMotion?: () => boolean;
  vibrate?: (ms: number) => void;
  minSpinMs?: number;
  settleMs?: number;
}

const ACTIVE: AddEventListenerOptions = { passive: false };
const PASSIVE: AddEventListenerOptions = { passive: true };

/**
 * Escucha los toques en `win`. El touchstart es pasivo (no frena nada); el touchmove que puede frenar el scroll
 * (passive: false) se pone solo mientras dura un toque que puede actualizar, y se quita al soltar. Devuelve cómo parar.
 */
export function attachPullToRefresh(o: PullControllerOptions): () => void {
  const { win, view } = o;
  const canStart = o.canStart ?? shouldStart;
  const minSpinMs = o.minSpinMs ?? MIN_SPIN_MS;
  const settleMs = o.settleMs ?? SETTLE_MS;
  let t: PullTracker | null = null;
  let busy = false;
  let reduced = false;
  let detached = false;
  let shown: PullPhase = 'idle';
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const wait = (ms: number) => new Promise<void>((resolve) => later(resolve, ms));
  const setPhase = (p: PullPhase) => {
    if (p === shown) return;
    shown = p;
    view.phase(p);
  };

  const stopTracking = () => {
    t = null;
    win.removeEventListener('touchmove', onMove);
    win.removeEventListener('touchend', onEnd);
    win.removeEventListener('touchcancel', onCancel);
  };

  const cancelPull = () => {
    const showing = t?.phase === 'pulling';
    stopTracking();
    if (!showing) return;
    view.draw({ distance: 0, animate: !reduced, reduced });
    setPhase('idle');
  };

  async function run() {
    busy = true;
    setPhase('refreshing');
    view.draw({ distance: PULL_THRESHOLD, animate: !reduced, reduced });
    const refreshed = Promise.resolve()
      .then(o.refresh)
      .catch((e: unknown) => console.warn('No se pudo actualizar', e));
    await Promise.all([refreshed, wait(minSpinMs)]);
    if (detached) return;
    view.draw({ distance: 0, animate: !reduced, reduced });
    const done = () => {
      busy = false;
      setPhase('idle');
    };
    // Con movimiento reducido desaparece de una vez; si no, espera a que termine de subir.
    if (reduced) return done();
    setPhase('settling');
    later(done, settleMs);
  }

  function onStart(e: TouchEvent) {
    if (t) {
      if (e.touches.length > 1) cancelPull(); // segundo dedo: era otra cosa
      return;
    }
    if (busy || detached || !canStart(e.target, win.scrollY, e.touches.length)) return;
    const touch = e.touches[0];
    if (!touch) return;
    t = beginPull(touch.clientX, touch.clientY);
    reduced = o.reducedMotion?.() ?? false;
    win.addEventListener('touchmove', onMove, ACTIVE);
    win.addEventListener('touchend', onEnd, PASSIVE);
    win.addEventListener('touchcancel', onCancel, PASSIVE);
  }

  function onMove(e: TouchEvent) {
    if (!t) return;
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return cancelPull();
    const step = movePull(t, touch.clientX, touch.clientY);
    t = step.tracker;
    if (step.prevent && e.cancelable) e.preventDefault();
    if (t.phase === 'cancelled') return cancelPull();
    if (t.phase !== 'pulling') return;
    if (step.crossed === 'armed') {
      try {
        o.vibrate?.(8);
      } catch {
        // sin vibración (iPhone, o el navegador no la deja todavía)
      }
    }
    setPhase(t.armed ? 'armed' : 'pulling');
    view.draw({ distance: t.distance, animate: false, reduced });
  }

  function onEnd(e: TouchEvent) {
    if (!t || e.touches.length > 0) return;
    if (!releasePull(t)) return cancelPull();
    stopTracking();
    void run();
  }

  function onCancel() {
    cancelPull();
  }

  win.addEventListener('touchstart', onStart, PASSIVE);
  return () => {
    detached = true;
    win.removeEventListener('touchstart', onStart);
    stopTracking();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
