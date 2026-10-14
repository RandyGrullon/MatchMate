/**
 * «Desliza desde el borde para salir» sin navegador: cuándo está prendido (solo la app instalada con dedo), cuándo
 * puede empezar (el borde, modales, campos, el modo cancha, lo que se desplaza de lado, `data-no-swipe`), la dirección
 * (nunca se arma junto con «desliza para actualizar»), el umbral y el movimiento rápido, a dónde sale (el primer
 * `[data-back-to]` visible, con replace) y los toques de punta a punta con una ventana de mentira.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachPullToRefresh, lockDirection } from './pullToRefresh.logic';
import {
  attachSwipeBack,
  BACK_THRESHOLD,
  backDestination,
  beginSwipe,
  CHIP_BOTTOM_ROOM,
  CHIP_MIN_TOP,
  CHIP_SIZE,
  chipTop,
  DIRECTION_SLOP,
  EDGE_ZONE,
  findBackTarget,
  FLICK_MAX_IDLE_MS,
  isAppPath,
  isFlick,
  isStandaloneApp,
  leaveScreen,
  lockSwipe,
  moveSwipe,
  NO_SWIPE_SELECTOR,
  overlayParent,
  releaseSwipe,
  shouldStartSwipe,
  swipeBackEnabled,
  swipeProgress,
  travel,
  TRAVEL_MAX,
  TRAVEL_RATE,
  type SwipeFrame,
  type SwipeWindow,
} from './swipeBack.logic';

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- Un DOM mínimo (closest con los selectores de NO_SWIPE_SELECTOR) ----------

interface FakeEl {
  tag: string;
  cls: string[];
  attrs: Record<string, string>;
  position: string;
  overflowX: string;
  scrollWidth: number;
  clientWidth: number;
  parentElement: FakeEl | null;
  isContentEditable: boolean;
  ownerDocument: FakeDoc;
  closest(sel: string): FakeEl | null;
}
interface FakeDoc {
  open: boolean;
  documentElement: FakeEl | null;
  body: FakeEl | null;
  querySelector(sel: string): unknown;
  defaultView: { getComputedStyle(el: FakeEl): { position: string; overflowX: string } } | null;
}

function matches(el: FakeEl, part: string): boolean {
  const not = /^\[([\w-]+)\]:not\(\[\1="(.*)"\]\)$/.exec(part);
  if (not) return not[1] in el.attrs && el.attrs[not[1]] !== not[2];
  const eq = /^\[([\w-]+)="(.*)"\]$/.exec(part);
  if (eq) return el.attrs[eq[1]] === eq[2];
  const has = /^\[([\w-]+)\]$/.exec(part);
  if (has) return has[1] in el.attrs;
  if (part.startsWith('.')) return el.cls.includes(part.slice(1));
  return el.tag === part;
}

function makeDoc(): FakeDoc {
  const doc: FakeDoc = {
    open: false,
    documentElement: null,
    body: null,
    querySelector: (sel) => (sel === 'dialog[open]' && doc.open ? {} : null),
    defaultView: { getComputedStyle: (el) => ({ position: el.position, overflowX: el.overflowX }) },
  };
  doc.documentElement = el('html', { doc });
  doc.body = el('body', { parent: doc.documentElement, doc });
  return doc;
}

function el(
  tag: string,
  o: {
    parent?: FakeEl | null;
    doc?: FakeDoc;
    cls?: string[];
    attrs?: Record<string, string>;
    position?: string;
    overflowX?: string;
    scrollWidth?: number;
    clientWidth?: number;
  } = {},
): FakeEl {
  const node: FakeEl = {
    tag,
    cls: o.cls ?? [],
    attrs: o.attrs ?? {},
    position: o.position ?? 'static',
    overflowX: o.overflowX ?? 'visible',
    scrollWidth: o.scrollWidth ?? 300,
    clientWidth: o.clientWidth ?? 300,
    parentElement: o.parent ?? null,
    isContentEditable: false,
    ownerDocument: (o.doc ?? o.parent?.ownerDocument)!,
    closest(sel) {
      const parts = sel.split(',').map((s) => s.trim());
      for (let n: FakeEl | null = node; n; n = n.parentElement) if (parts.some((p) => matches(n!, p))) return n;
      return null;
    },
  };
  return node;
}

/** La página de siempre: body > main > div > (lo que se toca). */
function page() {
  const doc = makeDoc();
  const main = el('main', { parent: doc.body });
  const card = el('div', { parent: main });
  return { doc, main, card, button: el('button', { parent: card }) };
}

describe('el indicador', () => {
  it('entra 0,6 px por px del dedo hasta el umbral y después con freno, sin pasar del máximo', () => {
    expect(travel(0)).toBe(0);
    expect(travel(-20)).toBe(0);
    expect(travel(Number.NaN)).toBe(0);
    expect(travel(50)).toBeCloseTo(50 * TRAVEL_RATE);
    expect(travel(BACK_THRESHOLD)).toBeCloseTo(BACK_THRESHOLD * TRAVEL_RATE);
    expect(travel(BACK_THRESHOLD * 2)).toBeGreaterThan(travel(BACK_THRESHOLD));
    // Todo el ancho de un teléfono: casi el máximo, sin llegar.
    expect(travel(400)).toBeLessThan(TRAVEL_MAX);
    expect(travel(400)).toBeGreaterThan(TRAVEL_MAX - 1);
  });

  it('sin a dónde salir entra la mitad (se ve que no va a pasar nada)', () => {
    expect(travel(40, false)).toBeCloseTo(travel(40) / 2);
  });

  it('el avance va de 0 a 1 en el umbral', () => {
    expect(swipeProgress(0)).toBe(0);
    expect(swipeProgress(BACK_THRESHOLD / 2)).toBe(0.5);
    expect(swipeProgress(BACK_THRESHOLD * 3)).toBe(1);
    expect(swipeProgress(-5)).toBe(0);
  });

  it('va a la altura del dedo sin taparse con las barras de arriba y de abajo', () => {
    expect(chipTop(400, 800)).toBe(400 - CHIP_SIZE / 2);
    expect(chipTop(0, 800)).toBe(CHIP_MIN_TOP);
    expect(chipTop(790, 800)).toBe(800 - CHIP_BOTTOM_ROOM);
    expect(chipTop(100, 100)).toBe(CHIP_MIN_TOP);
  });
});

describe('¿está prendido?', () => {
  const env = (o: { standalone?: boolean; iosStandalone?: boolean; touch?: number; coarse?: boolean }) => ({
    matchMedia: (q: string) => ({
      matches: q === '(display-mode: standalone)' ? !!o.standalone : q === '(pointer: coarse)' ? !!o.coarse : false,
    }),
    navigator: { standalone: o.iosStandalone, maxTouchPoints: o.touch ?? 0 },
  });

  it('en la app instalada con pantalla táctil (Android y el iPhone, que avisa con navigator.standalone)', () => {
    expect(swipeBackEnabled(env({ standalone: true, touch: 5 }))).toBe(true);
    expect(swipeBackEnabled(env({ iosStandalone: true, touch: 5 }))).toBe(true);
    expect(swipeBackEnabled(env({ standalone: true, coarse: true }))).toBe(true);
    expect(isStandaloneApp(env({ iosStandalone: true }))).toBe(true);
  });

  it('apagado en el navegador del teléfono (ya tiene su gesto: saldría dos veces), sin dedo y sin ventana', () => {
    expect(swipeBackEnabled(env({ touch: 5, coarse: true }))).toBe(false);
    expect(swipeBackEnabled(env({ standalone: true, touch: 0 }))).toBe(false);
    expect(swipeBackEnabled(undefined)).toBe(false);
    expect(swipeBackEnabled({})).toBe(false);
    expect(isStandaloneApp(undefined)).toBe(false);
  });
});

describe('¿puede empezar?', () => {
  it('solo en la franja del borde izquierdo (24 px) y con un dedo', () => {
    const { button } = page();
    expect(shouldStartSwipe(button as never, 0, 1)).toBe(true);
    expect(shouldStartSwipe(button as never, EDGE_ZONE, 1)).toBe(true);
    expect(shouldStartSwipe(button as never, EDGE_ZONE + 1, 1)).toBe(false);
    expect(shouldStartSwipe(button as never, 200, 1)).toBe(false);
    expect(shouldStartSwipe(button as never, -1, 1)).toBe(false);
    expect(shouldStartSwipe(button as never, Number.NaN, 1)).toBe(false);
    expect(shouldStartSwipe(button as never, 5, 2)).toBe(false);
    expect(shouldStartSwipe(button as never, 5, 0)).toBe(false);
    expect(shouldStartSwipe(null, 5, 1)).toBe(false);
    expect(shouldStartSwipe({} as never, 5, 1)).toBe(false);
  });

  it('no con un modal abierto (aunque se toque fuera de él)', () => {
    const { doc, button } = page();
    doc.open = true;
    expect(shouldStartSwipe(button as never, 5, 1)).toBe(false);
  });

  it('no dentro de modales, campos, deslizadores, el modo cancha ni lo marcado con data-no-swipe / data-no-pull', () => {
    const { card } = page();
    const inside = (o: Parameters<typeof el>[1]) => el('span', { parent: el('div', { ...o, parent: card }) });
    expect(shouldStartSwipe(inside({ attrs: { 'data-no-swipe': '' } }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(inside({ attrs: { 'data-no-pull': '' } }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(inside({ cls: ['modal-scroll'] }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(inside({ cls: ['overscroll-none'] }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(inside({ attrs: { role: 'slider' } }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(el('input', { parent: card }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(el('textarea', { parent: card }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(el('span', { parent: el('dialog', { parent: card }) }) as never, 5, 1)).toBe(false);
    expect(shouldStartSwipe(inside({ attrs: { contenteditable: 'false' } }) as never, 5, 1)).toBe(true);
    expect(NO_SWIPE_SELECTOR).toContain('[data-no-swipe]');
  });

  it('no en pantallas fijas: el modo cancha / golf (fixed inset-0) y la barra de abajo', () => {
    const { card } = page();
    const court = el('div', { parent: card, position: 'fixed' });
    expect(shouldStartSwipe(el('button', { parent: court }) as never, 5, 1)).toBe(false);
  });

  it('no encima de algo que se desplaza de lado (carrusel, tabla ancha); sí si su contenido cabe', () => {
    const { card } = page();
    const carousel = el('div', { parent: card, overflowX: 'auto', scrollWidth: 900, clientWidth: 360 });
    expect(shouldStartSwipe(el('img', { parent: el('div', { parent: carousel }) }) as never, 5, 1)).toBe(false);
    const scrolling = el('div', { parent: card, overflowX: 'scroll', scrollWidth: 500, clientWidth: 360 });
    expect(shouldStartSwipe(el('span', { parent: scrolling }) as never, 5, 1)).toBe(false);
    const fits = el('div', { parent: card, overflowX: 'auto', scrollWidth: 360, clientWidth: 360 });
    expect(shouldStartSwipe(el('span', { parent: fits }) as never, 5, 1)).toBe(true);
    const clipped = el('div', { parent: card, overflowX: 'hidden', scrollWidth: 900, clientWidth: 360 });
    expect(shouldStartSwipe(el('span', { parent: clipped }) as never, 5, 1)).toBe(true);
  });

  it('sin getComputedStyle (pruebas) se fía de los selectores', () => {
    const { doc, button } = page();
    doc.defaultView = null;
    expect(shouldStartSwipe(button as never, 5, 1)).toBe(true);
  });
});

describe('la dirección', () => {
  it('se decide a los 10 px: solo de lado hacia la derecha sale', () => {
    expect(lockSwipe(5, 3)).toBe('pending');
    expect(lockSwipe(DIRECTION_SLOP - 1, 0)).toBe('pending');
    expect(lockSwipe(DIRECTION_SLOP, 2)).toBe('swipe');
    expect(lockSwipe(20, -12)).toBe('swipe');
    expect(lockSwipe(-20, 0)).toBe('cancel');
    expect(lockSwipe(3, 20)).toBe('cancel');
    expect(lockSwipe(3, -20)).toBe('cancel');
    expect(lockSwipe(15, 15)).toBe('cancel');
  });

  it('nunca se arma junto con «desliza para actualizar»: deciden al revés', () => {
    for (let dx = -40; dx <= 40; dx += 4) {
      for (let dy = -40; dy <= 40; dy += 4) {
        expect(lockSwipe(dx, dy) === 'swipe' && lockDirection(dx, dy) === 'pull').toBe(false);
      }
    }
  });

  it('mientras decide frena el scroll solo si va más de lado que hacia arriba o abajo', () => {
    const t = beginSwipe(5, 300, 0);
    expect(moveSwipe(t, 9, 301, 16).prevent).toBe(true);
    expect(moveSwipe(t, 6, 306, 16).prevent).toBe(false);
    expect(moveSwipe(t, 5, 300, 16).prevent).toBe(false);
  });

  it('de lado: pregunta una vez si hay a dónde salir, sigue al dedo y se arma en el umbral', () => {
    const canGo = vi.fn(() => true);
    let s = moveSwipe(beginSwipe(5, 300, 0), 20, 302, 16, canGo);
    expect(s.tracker.phase).toBe('swiping');
    expect(s.prevent).toBe(true);
    expect(s.tracker.dx).toBe(15);
    expect(canGo).toHaveBeenCalledTimes(1);
    s = moveSwipe(s.tracker, 5 + BACK_THRESHOLD, 310, 100, canGo);
    expect(s.tracker.armed).toBe(true);
    expect(s.crossed).toBe('armed');
    expect(s.tracker.y).toBe(310);
    s = moveSwipe(s.tracker, 5 + BACK_THRESHOLD + 30, 310, 120, canGo);
    expect(s.crossed).toBeNull();
    // Vuelve antes del umbral: se desarma; más a la izquierda de donde empezó: el indicador se esconde.
    s = moveSwipe(s.tracker, 30, 310, 200, canGo);
    expect(s.crossed).toBe('disarmed');
    s = moveSwipe(s.tracker, 0, 310, 220, canGo);
    expect(s.tracker.dx).toBe(0);
    expect(canGo).toHaveBeenCalledTimes(1);
  });

  it('sin a dónde salir no se arma nunca', () => {
    const s0 = moveSwipe(beginSwipe(5, 300, 0), 20, 300, 16, () => false);
    const s1 = moveSwipe(s0.tracker, 300, 300, 100, () => false);
    expect(s1.tracker.canGo).toBe(false);
    expect(s1.tracker.armed).toBe(false);
    expect(s1.crossed).toBeNull();
  });

  it('hacia arriba o abajo se cancela y ya no frena nada', () => {
    const s = moveSwipe(beginSwipe(5, 300, 0), 6, 340, 16);
    expect(s.tracker.phase).toBe('cancelled');
    expect(s.prevent).toBe(false);
    expect(moveSwipe(s.tracker, 200, 340, 32)).toEqual({ tracker: s.tracker, prevent: false, crossed: null });
  });
});

describe('al soltar', () => {
  /** Un gesto de lado de `dist` px en `ms` ms, en pasos de 16 ms. */
  const swipe = (dist: number, ms: number, canGo = true) => {
    let t = beginSwipe(5, 300, 0);
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) t = moveSwipe(t, 5 + (dist * i) / steps, 300, (ms * i) / steps, () => canGo).tracker;
    return t;
  };

  it('sale pasado el umbral, aunque sea despacio', () => {
    const t = swipe(BACK_THRESHOLD + 5, 1500);
    expect(releaseSwipe(t, 1510)).toBe(true);
    expect(releaseSwipe(swipe(BACK_THRESHOLD - 5, 1500), 1510)).toBe(false);
  });

  it('un movimiento rápido sale antes del umbral; uno lento o muy corto, no', () => {
    const flick = swipe(50, 60);
    expect(isFlick(flick, 70)).toBe(true);
    expect(releaseSwipe(flick, 70)).toBe(true);
    expect(releaseSwipe(swipe(50, 600), 610)).toBe(false);
    expect(releaseSwipe(swipe(20, 20), 25)).toBe(false);
  });

  it('si el dedo se quedó quieto antes de soltar ya no es un movimiento rápido', () => {
    const flick = swipe(50, 60);
    expect(releaseSwipe(flick, 60 + FLICK_MAX_IDLE_MS + 1)).toBe(false);
  });

  it('sin a dónde salir, sin decidir o cancelado no sale', () => {
    expect(releaseSwipe(swipe(200, 200, false), 210)).toBe(false);
    expect(releaseSwipe(beginSwipe(5, 300, 0), 10)).toBe(false);
    expect(releaseSwipe(moveSwipe(beginSwipe(5, 300, 0), 6, 360, 16).tracker, 20)).toBe(false);
    expect(releaseSwipe(null, 0)).toBe(false);
  });
});

// ---------- A dónde sale ----------

const link = (to: string | null, visible = true) => ({ to, visible, getAttribute: (n: string) => (n === 'data-back-to' ? to : null) });
const shown = (e: { visible?: boolean }) => e.visible !== false;

describe('a dónde sale', () => {
  it('el primer «‹ atrás» visible, en el orden de la página', () => {
    expect(findBackTarget([link('/l/abc'), link('/ligas')], shown)).toBe('/l/abc');
    // La barra de la liga escondida (la pantalla puso la suya) no cuenta.
    expect(findBackTarget([link('/l/abc', false), link('/l/abc/juegos')], shown)).toBe('/l/abc/juegos');
    expect(findBackTarget([link('/l/abc', false)], shown)).toBeNull();
    expect(findBackTarget([], shown)).toBeNull();
  });

  it('solo rutas de la app (nunca otro sitio)', () => {
    expect(findBackTarget([link('//otro.com/x'), link('https://otro.com'), link(''), link(null), link('/social')], shown)).toBe('/social');
    expect(isAppPath('/')).toBe(true);
    expect(isAppPath('ligas')).toBe(false);
    expect(isAppPath(undefined)).toBe(false);
  });

  it('a la misma pantalla no sale (barra que apunta a sí misma, «/ligas/» o con #)', () => {
    expect(backDestination('/ligas', '/l/abc')).toBe('/ligas');
    expect(backDestination('/ligas', '/ligas')).toBeNull();
    expect(backDestination('/ligas/', '/ligas')).toBeNull();
    expect(backDestination('/ligas#x', '/ligas')).toBeNull();
    expect(backDestination('/perfil', '/perfil?parte=insignias')).toBe('/perfil');
    expect(backDestination('/l/abc/juegos', '/l/abc/juegos?partido=m1')).toBe('/l/abc/juegos');
    expect(backDestination(null, '/')).toBeNull();
  });

  it('navega con replace: el atrás del sistema no vuelve a la pantalla que se deja', () => {
    const navigate = vi.fn();
    expect(leaveScreen({ candidates: [link('/l/abc', false), link('/l/abc')], isVisible: shown, here: '/l/abc/e/ev1', navigate })).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/l/abc', { replace: true });
  });

  it('en Hoy, Social, Ligas y Yo (sin «‹ atrás») no hace nada', () => {
    const navigate = vi.fn();
    for (const here of ['/', '/social', '/ligas', '/perfil']) {
      expect(leaveScreen({ candidates: [], isVisible: shown, here, navigate })).toBe(false);
    }
    expect(leaveScreen({ candidates: [link('/ligas', false)], isVisible: shown, here: '/ligas', navigate })).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('un partido abierto encima (?partido=, ?cancha=, ?mesa=) sale a la lista de debajo', () => {
    expect(overlayParent('/l/abc/juegos', '?partido=m1&mesa=1')).toBe('/l/abc/juegos');
    expect(overlayParent('/l/abc/e/ev1', '?ver=cuadro&partido=m1&cancha=1')).toBe('/l/abc/e/ev1?ver=cuadro');
    expect(overlayParent('/l/abc', '')).toBe('/l/abc');
  });
});

// ---------- Los toques de punta a punta ----------

type Listener = (e: TouchEvent) => void;

function fakeWindow() {
  const listeners = new Map<string, Map<Listener, AddEventListenerOptions | undefined>>();
  const win: SwipeWindow & { scrollY: number } = {
    scrollY: 0,
    addEventListener(type, fn, opts) {
      if (!listeners.has(type)) listeners.set(type, new Map());
      listeners.get(type)!.set(fn, opts);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };
  const count = (type: string) => listeners.get(type)?.size ?? 0;
  const optsOf = (type: string) => [...(listeners.get(type)?.values() ?? [])];
  const fire = (type: string, points: [number, number][], target: unknown = {}) => {
    const e = {
      type,
      target,
      touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      cancelable: true,
      preventDefault: vi.fn(),
    } as unknown as TouchEvent & { preventDefault: ReturnType<typeof vi.fn> };
    for (const fn of [...(listeners.get(type)?.keys() ?? [])]) fn(e);
    return e;
  };
  return { win, count, optsOf, fire };
}

function setup(opts: { hasTarget?: boolean; go?: boolean; canStart?: () => boolean; reduced?: boolean } = {}) {
  const w = fakeWindow();
  let clock = 0;
  const frames: SwipeFrame[] = [];
  const hasTarget = vi.fn(() => opts.hasTarget ?? true);
  const go = vi.fn(() => opts.go ?? true);
  const vibrate = vi.fn();
  const detach = attachSwipeBack({
    win: w.win,
    view: { draw: (f) => frames.push(f) },
    hasTarget,
    go,
    canStart: opts.canStart ?? ((_t, x) => x <= EDGE_ZONE),
    reducedMotion: () => opts.reduced ?? false,
    vibrate,
    now: () => clock,
  });
  const at = (ms: number) => {
    clock = ms;
  };
  const start = (x = 4, y = 300) => w.fire('touchstart', [[x, y]]);
  const move = (x: number, y = 300, ms = clock + 16) => {
    at(ms);
    return w.fire('touchmove', [[x, y]]);
  };
  const end = (ms = clock + 16) => {
    at(ms);
    return w.fire('touchend', []);
  };
  return { ...w, frames, hasTarget, go, vibrate, detach, start, move, end, at };
}

describe('los toques', () => {
  it('sin tocar solo escucha touchstart (pasivo); el touchmove que frena se pone solo durante el gesto', () => {
    const s = setup();
    expect(s.count('touchstart')).toBe(1);
    expect(s.optsOf('touchstart')).toEqual([{ passive: true }]);
    expect(s.count('touchmove')).toBe(0);
    s.start();
    expect(s.optsOf('touchmove')).toEqual([{ passive: false }]);
    expect(s.optsOf('touchend')).toEqual([{ passive: true }]);
    s.end();
    expect(s.count('touchmove')).toBe(0);
    expect(s.count('touchend')).toBe(0);
    expect(s.count('touchcancel')).toBe(0);
  });

  it('fuera del borde no hace nada', () => {
    const s = setup();
    s.start(200, 300);
    expect(s.count('touchmove')).toBe(0);
  });

  it('deslizar pasado el umbral y soltar: el indicador sigue al dedo, vibra una vez y sale', () => {
    const s = setup();
    s.start();
    expect(s.move(9, 301).preventDefault).toHaveBeenCalled(); // antes de decidir, ya frena el scroll
    s.move(30, 302);
    expect(s.hasTarget).toHaveBeenCalledTimes(1);
    expect(s.frames.at(-1)).toEqual({ dx: 26, y: 302, canGo: true, armed: false, animate: false, reduced: false });
    s.move(4 + BACK_THRESHOLD + 10, 305);
    s.move(200, 305);
    expect(s.vibrate).toHaveBeenCalledTimes(1);
    expect(s.vibrate).toHaveBeenCalledWith(8);
    expect(s.frames.at(-1)!.armed).toBe(true);
    s.end(s.frames.length * 16 + 400); // despacio: sale por el umbral
    expect(s.go).toHaveBeenCalledTimes(1);
    expect(s.frames.at(-1)).toEqual({ dx: 0, y: 305, canGo: true, armed: true, animate: true, reduced: false });
    expect(s.count('touchmove')).toBe(0);
  });

  it('un movimiento rápido y corto también sale', () => {
    const s = setup();
    s.start();
    s.move(20, 300, 10);
    s.move(40, 300, 25);
    s.move(56, 300, 40);
    s.end(45);
    expect(s.go).toHaveBeenCalledTimes(1);
  });

  it('soltar antes del umbral (despacio): no sale y el indicador vuelve a su lugar', () => {
    const s = setup();
    s.start();
    s.move(20, 300, 100);
    s.move(50, 300, 600);
    s.end(1200);
    expect(s.go).not.toHaveBeenCalled();
    expect(s.vibrate).not.toHaveBeenCalled();
    expect(s.frames.at(-1)).toEqual({ dx: 0, y: 300, canGo: true, armed: false, animate: true, reduced: false });
  });

  it('sin «‹ atrás» (Hoy, Social, Ligas, Yo): se ve apagado, no vibra, no sale y vuelve a su lugar', () => {
    const s = setup({ hasTarget: false });
    s.start();
    s.move(20);
    s.move(200);
    expect(s.frames.every((f) => !f.canGo && !f.armed)).toBe(true);
    s.end();
    expect(s.vibrate).not.toHaveBeenCalled();
    expect(s.go).not.toHaveBeenCalled();
    expect(s.frames.at(-1)!.dx).toBe(0);
  });

  it('si al soltar ya no hay a dónde ir (go da false) el indicador vuelve', () => {
    const s = setup({ go: false });
    s.start();
    s.move(20);
    s.move(200);
    s.end();
    expect(s.go).toHaveBeenCalledTimes(1);
    expect(s.frames.at(-1)).toMatchObject({ dx: 0, armed: false, animate: true });
  });

  it('hacia abajo es scroll: se suelta sin dibujar ni frenar nada', () => {
    const s = setup();
    s.start();
    const e = s.move(6, 340);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(s.count('touchmove')).toBe(0);
    expect(s.frames).toEqual([]);
    expect(s.hasTarget).not.toHaveBeenCalled();
  });

  it('un segundo dedo o un touchcancel lo sueltan', () => {
    const s = setup();
    s.start();
    s.move(40);
    s.fire('touchstart', [
      [40, 300],
      [200, 300],
    ]);
    expect(s.count('touchmove')).toBe(0);
    expect(s.frames.at(-1)!.dx).toBe(0);
    s.start();
    s.move(40);
    s.fire('touchcancel', []);
    expect(s.count('touchmove')).toBe(0);
    expect(s.go).not.toHaveBeenCalled();
  });

  it('con movimiento reducido avisa al dibujo y al soltar no anima', () => {
    const s = setup({ reduced: true });
    s.start();
    s.move(30);
    expect(s.frames.at(-1)!.reduced).toBe(true);
    s.move(200);
    s.end();
    expect(s.frames.at(-1)).toMatchObject({ dx: 0, animate: false, reduced: true });
  });

  it('si no puede empezar (modal, campo, carrusel) no escucha nada más', () => {
    const s = setup({ canStart: () => false });
    s.start();
    expect(s.count('touchmove')).toBe(0);
  });

  it('al desmontar quita todo y ya no sale', () => {
    const s = setup();
    s.start();
    s.move(40);
    s.detach();
    expect(s.count('touchstart')).toBe(0);
    expect(s.count('touchmove')).toBe(0);
    expect(s.count('touchend')).toBe(0);
  });

  it('con «desliza para actualizar» en la misma ventana: de lado solo sale, hacia abajo solo actualiza', () => {
    const w = fakeWindow();
    const swipeFrames: SwipeFrame[] = [];
    const pullFrames: unknown[] = [];
    const go = vi.fn(() => true);
    const refresh = vi.fn();
    const stopSwipe = attachSwipeBack({
      win: w.win,
      view: { draw: (f) => swipeFrames.push(f) },
      hasTarget: () => true,
      go,
      canStart: (_t, x) => x <= EDGE_ZONE,
      now: () => 0,
    });
    const stopPull = attachPullToRefresh({
      win: w.win,
      view: { draw: (f) => pullFrames.push(f), phase: () => undefined },
      refresh,
      canStart: () => true,
    });
    // De lado desde el borde.
    w.fire('touchstart', [[4, 300]]);
    for (const x of [20, 60, 120]) w.fire('touchmove', [[x, 302]]);
    w.fire('touchend', []);
    expect(go).toHaveBeenCalledTimes(1);
    expect(pullFrames).toEqual([]);
    // Hacia abajo desde el borde.
    swipeFrames.length = 0;
    w.fire('touchstart', [[4, 100]]);
    for (const y of [120, 200, 300]) w.fire('touchmove', [[5, y]]);
    expect(swipeFrames).toEqual([]);
    expect(pullFrames.length).toBeGreaterThan(0);
    stopSwipe();
    stopPull();
  });
});
