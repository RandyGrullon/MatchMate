/**
 * «Desliza desde el borde para salir» (lo pidió el dueño): en la app instalada, deslizar desde el borde izquierdo hacia la
 * derecha sale de la pantalla a la de ARRIBA, la de su «‹ atrás» (de un partido a la liga, de la liga a Ligas, de un
 * perfil a Social…), no a la última que se vio; y se navega con replace, así que el atrás del sistema nunca vuelve a la
 * pantalla que se acaba de dejar. Aquí va lo que decide, sin React ni navegador de verdad (con pruebas): cuándo puede
 * empezar, cuánto se mueve el indicador, cuándo está listo para soltar, a dónde va y el manejo de los toques.
 * SwipeBack.tsx lo dibuja y navega.
 *
 * - Solo en la app instalada con pantalla táctil (en el navegador, el navegador ya tiene su gesto: saldrían dos).
 * - Con un dedo, empezando a 24 px o menos del borde, fuera de modales, campos, el modo cancha / golf (pantallas fijas),
 *   las listas y carruseles que se desplazan de lado y lo marcado con `data-no-swipe`.
 * - La dirección se decide a los 10 px: de lado hacia la derecha sale; hacia arriba o abajo es scroll (o «desliza para
 *   actualizar», que decide al revés: nunca se arman los dos).
 * - Sale al soltar pasados 80 px, o antes con un movimiento rápido.
 * - A dónde: el primer `[data-back-to]` visible de la pantalla (lo llevan las barras «‹ atrás»). Sin él (Hoy, Social,
 *   Ligas, Yo) el indicador se ve apagado, vuelve a su lugar y no pasa nada.
 */

/** Ancho (px) de la franja del borde izquierdo donde puede empezar el gesto. */
export const EDGE_ZONE = 24;
/** A los cuántos px se decide si es de lado (salir) o hacia arriba / abajo (no). */
export const DIRECTION_SLOP = 10;
/** Lo que tiene que correr el dedo (px) para que soltar salga. */
export const BACK_THRESHOLD = 80;
/** Un movimiento rápido (px por ms) sale aunque no llegue al umbral… */
export const FLICK_VELOCITY = 0.5;
/** …si corrió al menos esto (px)… */
export const FLICK_MIN_DISTANCE = 32;
/** …y el dedo no se quedó quieto antes de soltar (ms). */
export const FLICK_MAX_IDLE_MS = 100;
/** Tamaño del círculo del indicador (px). */
export const CHIP_SIZE = 40;
/** Cuánto entra el indicador por cada px del dedo antes del umbral. */
export const TRAVEL_RATE = 0.6;
/** Lo más que entra el indicador (px): nunca llega, se acerca cada vez más lento. */
export const TRAVEL_MAX = 72;

/**
 * Lo que entra el indicador desde el borde para lo que corrió el dedo: 0,6 px por px hasta el umbral y después con freno.
 * Sin a dónde salir (`canGo` false) entra la mitad: se ve que no va a pasar nada.
 */
export function travel(dx: number, canGo = true): number {
  if (!(dx > 0)) return 0;
  const x = dx * TRAVEL_RATE * (canGo ? 1 : 0.5);
  const knee = BACK_THRESHOLD * TRAVEL_RATE;
  if (x <= knee) return x;
  const room = TRAVEL_MAX - knee;
  return knee + room * (1 - Math.exp(-(x - knee) / room));
}

/** Cuánto falta para el umbral: 0 (nada) a 1 (listo para soltar). */
export const swipeProgress = (dx: number): number => Math.max(0, Math.min(1, dx / BACK_THRESHOLD));

/** Lo más arriba que va el indicador (px): debajo de la hora y la isla del iPhone. */
export const CHIP_MIN_TOP = 64;
/** Lo que deja libre abajo (px): la barra de secciones. */
export const CHIP_BOTTOM_ROOM = 140;

/** Dónde va el indicador de arriba a abajo: a la altura del dedo, sin taparse con la barra de arriba ni la de abajo. */
export function chipTop(y: number, viewportHeight: number): number {
  const max = Math.max(CHIP_MIN_TOP, viewportHeight - CHIP_BOTTOM_ROOM);
  return Math.min(max, Math.max(CHIP_MIN_TOP, y - CHIP_SIZE / 2));
}

// ---------- ¿Está prendido? ----------

/** Lo que se usa de window para saber si es la app instalada y si hay pantalla táctil. */
export interface EnvLike {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean; maxTouchPoints?: number };
}

/** App instalada (pantalla de inicio), no una pestaña del navegador. */
export function isStandaloneApp(w: EnvLike | undefined): boolean {
  if (!w) return false;
  return !!w.matchMedia?.('(display-mode: standalone)').matches || w.navigator?.standalone === true;
}

/**
 * Prendido solo en la app instalada con pantalla táctil. En el navegador del teléfono el navegador ya tiene su gesto de
 * atrás (saldría dos veces) y en la computadora no hay dedo.
 */
export function swipeBackEnabled(w: EnvLike | undefined): boolean {
  if (!w || !isStandaloneApp(w)) return false;
  return (w.navigator?.maxTouchPoints ?? 0) > 0 || !!w.matchMedia?.('(pointer: coarse)').matches;
}

// ---------- ¿Puede empezar? ----------

/**
 * Donde deslizar no sale: modales (y su contenido), campos de texto, deslizadores, el modo cancha / golf (pantallas fijas
 * con overscroll-none) y lo que se marque con `data-no-swipe` (o `data-no-pull`).
 */
export const NO_SWIPE_SELECTOR = [
  'dialog',
  '.modal-scroll',
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '.overscroll-none',
  '[data-no-pull]',
  '[data-no-swipe]',
].join(', ');

interface StyleLike {
  position?: string;
  overflowX?: string;
}

/** Lo que se usa del elemento tocado (Element en el navegador; objetos simples en las pruebas). */
interface NodeLike {
  closest?(selector: string): unknown;
  parentElement?: NodeLike | null;
  scrollWidth?: number;
  clientWidth?: number;
  isContentEditable?: boolean;
  ownerDocument?: {
    querySelector(selector: string): unknown;
    documentElement?: unknown;
    body?: unknown;
    defaultView?: { getComputedStyle?(el: never): StyleLike } | null;
  } | null;
}

/** Una lista, tabla o carrusel con su propio scroll de lado: el dedo la mueve a ella. */
const scrollsSideways = (n: NodeLike, s: StyleLike) =>
  (s.overflowX === 'auto' || s.overflowX === 'scroll') && (n.scrollWidth ?? 0) > (n.clientWidth ?? 0) + 1;

/**
 * ¿Este toque puede empezar a deslizar para salir? Un dedo, en la franja del borde izquierdo (`x` ≤ 24 px), sin modal
 * abierto, fuera de campos y de pantallas fijas (el modo cancha, la barra de abajo) y no encima de algo que se desplaza
 * de lado.
 */
export function shouldStartSwipe(target: EventTarget | null, x: number, touches: number, edge = EDGE_ZONE): boolean {
  if (touches !== 1 || !(x >= 0) || x > edge) return false;
  const el = target as NodeLike | null;
  if (!el || typeof el.closest !== 'function') return false;
  const doc = el.ownerDocument;
  if (doc?.querySelector('dialog[open]')) return false;
  if (el.isContentEditable || el.closest(NO_SWIPE_SELECTOR)) return false;
  const style = doc?.defaultView?.getComputedStyle?.bind(doc.defaultView);
  if (!style) return true;
  for (let n: NodeLike | null | undefined = el; n && n !== doc?.documentElement && n !== doc?.body; n = n.parentElement) {
    const s = style(n as never);
    // Barra de abajo, menús flotantes y pantallas encima (modo cancha / golf): no son la pantalla.
    if (s.position === 'fixed') return false;
    if (scrollsSideways(n, s)) return false;
  }
  return true;
}

// ---------- A dónde sale ----------

/** El atributo que lleva cada «‹ atrás»: la ruta de la pantalla de arriba (no el historial). */
export const BACK_ATTR = 'data-back-to';
export const BACK_SELECTOR = `[${BACK_ATTR}]`;

/** Un «‹ atrás» de la página (Element en el navegador; objetos simples en las pruebas). */
export interface BackCandidate {
  getAttribute(name: string): string | null;
}

/** Una ruta de la app («/ligas», «/l/abc?x=1»), nunca otro sitio («//otro.com», «https://…»). */
export const isAppPath = (to: unknown): to is string => typeof to === 'string' && to.startsWith('/') && !to.startsWith('//');

/**
 * La pantalla de arriba: el `data-back-to` del primer «‹ atrás» visible, en el orden de la página (la barra de la
 * pantalla va antes que lo de adentro; las escondidas, como la de la liga cuando la pantalla pone la suya, no cuentan).
 * null si la pantalla no tiene (Hoy, Social, Ligas, Yo).
 */
export function findBackTarget<E extends BackCandidate>(candidates: Iterable<E> | ArrayLike<E>, isVisible: (el: E) => boolean): string | null {
  for (const el of Array.from(candidates)) {
    const to = el.getAttribute(BACK_ATTR);
    if (isAppPath(to) && isVisible(el)) return to;
  }
  return null;
}

/** «/ligas/», «/ligas#x» y «/ligas» son la misma pantalla. */
function normalize(path: string): string {
  const [rest] = path.split('#');
  const q = rest.indexOf('?');
  const pathname = q < 0 ? rest : rest.slice(0, q);
  const search = q < 0 ? '' : rest.slice(q + 1);
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
  return search ? `${clean}?${search}` : clean;
}

/** A dónde salir desde `here` (ruta y búsqueda de la pantalla): null si no hay a dónde o si es esta misma. */
export function backDestination(target: string | null, here: string): string | null {
  if (!isAppPath(target)) return null;
  return normalize(target) === normalize(here) ? null : target;
}

/** Lo que abre una pantalla encima de otra dentro de la misma ruta (un partido, el modo cancha, la mesa de anotar). */
export const OVERLAY_PARAMS = ['partido', 'cancha', 'mesa'] as const;

/**
 * La pantalla de debajo de un partido abierto con `?partido=` (Partidos, la noche, el torneo): la misma dirección sin lo
 * que lo abre. Es la de arriba para quien desliza desde el partido.
 */
export function overlayParent(pathname: string, search: string, keys: readonly string[] = OVERLAY_PARAMS): string {
  const p = new URLSearchParams(search);
  for (const k of keys) p.delete(k);
  const q = p.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export type NavigateLike = (to: string, options: { replace: true }) => unknown;

/**
 * Sale a la pantalla de arriba: navega con replace (el atrás del sistema no vuelve a la pantalla que se deja, y no queda
 * «adelante»). false si no hay a dónde (el indicador vuelve a su lugar).
 */
export function leaveScreen<E extends BackCandidate>(o: {
  candidates: Iterable<E> | ArrayLike<E>;
  isVisible: (el: E) => boolean;
  here: string;
  navigate: NavigateLike;
}): boolean {
  const to = backDestination(findBackTarget(o.candidates, o.isVisible), o.here);
  if (!to) return false;
  o.navigate(to, { replace: true });
  return true;
}

// ---------- Seguir el dedo ----------

export interface SwipeTracker {
  /** pending = todavía no se sabe la dirección; swiping = de lado; cancelled = era hacia arriba, abajo o a la izquierda. */
  phase: 'pending' | 'swiping' | 'cancelled';
  x0: number;
  y0: number;
  /** Lo que corrió el dedo hacia la derecha (px, nunca negativo). */
  dx: number;
  /** Dónde está el dedo de arriba a abajo (para poner el indicador a su altura). */
  y: number;
  /** Pasó el umbral (soltar sale). */
  armed: boolean;
  /** Hay a dónde salir (se mira al decidir la dirección). */
  canGo: boolean;
  lastX: number;
  lastT: number;
  /** Velocidad hacia la derecha (px por ms) en los últimos movimientos. */
  vx: number;
}

export interface SwipeStep {
  tracker: SwipeTracker;
  /** Hay que frenar el scroll del navegador (preventDefault) en este movimiento. */
  prevent: boolean;
  /** Cruzó el umbral en este movimiento (para vibrar al llegar). */
  crossed: 'armed' | 'disarmed' | null;
}

/** Dirección de un movimiento desde el inicio del toque: solo de lado hacia la derecha es salir. */
export function lockSwipe(dx: number, dy: number, slop = DIRECTION_SLOP): 'pending' | 'swipe' | 'cancel' {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < slop) return 'pending';
  return dx > Math.abs(dy) ? 'swipe' : 'cancel';
}

export const beginSwipe = (x: number, y: number, time: number): SwipeTracker => ({
  phase: 'pending',
  x0: x,
  y0: y,
  dx: 0,
  y,
  armed: false,
  canGo: true,
  lastX: x,
  lastT: time,
  vx: 0,
});

/**
 * Un movimiento del dedo. `canGo` se pregunta una vez, al decidir que es de lado: sin a dónde salir el indicador no se
 * arma (ni vibra).
 */
export function moveSwipe(t: SwipeTracker, x: number, y: number, time: number, canGo: () => boolean = () => true): SwipeStep {
  if (t.phase === 'cancelled') return { tracker: t, prevent: false, crossed: null };
  const dx = x - t.x0;
  const dy = y - t.y0;
  let next = t;
  if (t.phase === 'pending') {
    const lock = lockSwipe(dx, dy);
    if (lock === 'cancel') return { tracker: { ...t, phase: 'cancelled' }, prevent: false, crossed: null };
    // Mientras se decide: si va más de lado que hacia arriba, la página no debe empezar a desplazarse.
    if (lock === 'pending') return { tracker: t, prevent: dx > 0 && dx >= Math.abs(dy), crossed: null };
    next = { ...t, phase: 'swiping', canGo: canGo() };
  }
  const dt = time - next.lastT;
  const inst = dt > 0 ? (x - next.lastX) / dt : next.vx;
  const vx = dt > 0 ? inst * 0.7 + next.vx * 0.3 : next.vx;
  const distance = Math.max(0, dx);
  const armed = next.canGo && distance >= BACK_THRESHOLD;
  const crossed = armed === t.armed ? null : armed ? 'armed' : 'disarmed';
  return { tracker: { ...next, dx: distance, y, armed, lastX: x, lastT: time, vx }, prevent: true, crossed };
}

/** Un movimiento rápido hacia la derecha justo antes de soltar (sin quedarse quieto) sale aunque no llegue al umbral. */
export const isFlick = (t: SwipeTracker, time: number): boolean =>
  t.dx >= FLICK_MIN_DISTANCE && t.vx >= FLICK_VELOCITY && time - t.lastT <= FLICK_MAX_IDLE_MS;

/** Al soltar: ¿sale? De lado, con a dónde ir, y pasado el umbral o rápido. */
export const releaseSwipe = (t: SwipeTracker | null, time: number): boolean =>
  !!t && t.phase === 'swiping' && t.canGo && (t.dx >= BACK_THRESHOLD || isFlick(t, time));

// ---------- Los toques (sin React) ----------

export interface SwipeFrame {
  /** Lo que corrió el dedo (0 = escondido). */
  dx: number;
  /** A qué altura va el dedo. */
  y: number;
  /** Hay a dónde salir (si no, el indicador se ve apagado). */
  canGo: boolean;
  armed: boolean;
  /** Con transición (al soltar) o pegado al dedo. */
  animate: boolean;
  /** Movimiento reducido: el indicador no se mueve con el dedo, solo aparece. */
  reduced: boolean;
}

export interface SwipeView {
  draw(frame: SwipeFrame): void;
}

type TouchType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

/** Lo que se usa de window. */
export interface SwipeWindow {
  addEventListener(type: TouchType, listener: (e: TouchEvent) => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: TouchType, listener: (e: TouchEvent) => void): void;
}

export interface SwipeControllerOptions {
  win: SwipeWindow;
  view: SwipeView;
  /** ¿Hay a dónde salir? Se pregunta al decidir la dirección. */
  hasTarget: () => boolean;
  /** Sale (navega a la pantalla de arriba). false = no había a dónde: el indicador vuelve. */
  go: () => boolean;
  canStart?: (target: EventTarget | null, x: number, touches: number) => boolean;
  reducedMotion?: () => boolean;
  vibrate?: (ms: number) => void;
  now?: () => number;
}

const ACTIVE: AddEventListenerOptions = { passive: false };
const PASSIVE: AddEventListenerOptions = { passive: true };

/**
 * Escucha los toques en `win`. El touchstart es pasivo (no frena nada); el touchmove que puede frenar el scroll
 * (passive: false) se pone solo mientras dura un toque que empezó en el borde, y se quita al soltar. Devuelve cómo parar.
 */
export function attachSwipeBack(o: SwipeControllerOptions): () => void {
  const { win, view } = o;
  const canStart = o.canStart ?? shouldStartSwipe;
  const now = o.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  let t: SwipeTracker | null = null;
  let reduced = false;
  let detached = false;

  const stopTracking = () => {
    t = null;
    win.removeEventListener('touchmove', onMove);
    win.removeEventListener('touchend', onEnd);
    win.removeEventListener('touchcancel', onCancel);
  };

  /** Suelta sin salir: si el indicador se veía, vuelve a su lugar. */
  const cancelSwipe = () => {
    const shown = t?.phase === 'swiping' ? t : null;
    stopTracking();
    if (shown) view.draw({ dx: 0, y: shown.y, canGo: shown.canGo, armed: false, animate: !reduced, reduced });
  };

  function onStart(e: TouchEvent) {
    if (t) {
      if (e.touches.length > 1) cancelSwipe(); // segundo dedo: era otra cosa (zoom)
      return;
    }
    const touch = e.touches[0];
    if (detached || !touch || !canStart(e.target, touch.clientX, e.touches.length)) return;
    t = beginSwipe(touch.clientX, touch.clientY, now());
    reduced = o.reducedMotion?.() ?? false;
    win.addEventListener('touchmove', onMove, ACTIVE);
    win.addEventListener('touchend', onEnd, PASSIVE);
    win.addEventListener('touchcancel', onCancel, PASSIVE);
  }

  function onMove(e: TouchEvent) {
    if (!t) return;
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return cancelSwipe();
    const step = moveSwipe(t, touch.clientX, touch.clientY, now(), o.hasTarget);
    t = step.tracker;
    if (step.prevent && e.cancelable) e.preventDefault();
    if (t.phase === 'cancelled') return cancelSwipe();
    if (t.phase !== 'swiping') return;
    if (step.crossed === 'armed') {
      try {
        o.vibrate?.(8);
      } catch {
        // sin vibración (iPhone, o el navegador no la deja todavía)
      }
    }
    view.draw({ dx: t.dx, y: t.y, canGo: t.canGo, armed: t.armed, animate: false, reduced });
  }

  function onEnd(e: TouchEvent) {
    if (!t || e.touches.length > 0) return;
    const done = t;
    if (!releaseSwipe(done, now())) return cancelSwipe();
    stopTracking();
    // A dónde se mira otra vez al soltar (la pantalla pudo cambiar mientras tanto); sin a dónde, vuelve a su lugar.
    const went = !detached && o.go();
    view.draw({ dx: 0, y: done.y, canGo: done.canGo, armed: went, animate: !reduced, reduced });
  }

  function onCancel() {
    cancelSwipe();
  }

  win.addEventListener('touchstart', onStart, PASSIVE);
  return () => {
    detached = true;
    win.removeEventListener('touchstart', onStart);
    stopTracking();
  };
}
