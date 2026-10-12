/**
 * «Desliza para actualizar» sin navegador: cuándo puede empezar, el freno del indicador, el umbral, la dirección
 * (de lado no actualiza) y los toques de punta a punta con una ventana de mentira.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachPullToRefresh,
  beginPull,
  DIRECTION_SLOP,
  isArmed,
  lockDirection,
  MIN_SPIN_MS,
  movePull,
  NO_PULL_SELECTOR,
  PULL_MAX,
  PULL_THRESHOLD,
  pullProgress,
  releasePull,
  resist,
  SETTLE_MS,
  shouldStart,
  type PullFrame,
  type PullPhase,
  type PullWindow,
} from './pullToRefresh.logic';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------- Un DOM mínimo (closest con los selectores de NO_PULL_SELECTOR) ----------

interface FakeEl {
  tag: string;
  cls: string[];
  attrs: Record<string, string>;
  scrollTop: number;
  position: string;
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
  defaultView: { getComputedStyle(el: FakeEl): { position: string } };
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
    defaultView: { getComputedStyle: (el) => ({ position: el.position }) },
  };
  doc.documentElement = el('html', { doc });
  doc.body = el('body', { parent: doc.documentElement, doc });
  return doc;
}

function el(tag: string, o: { parent?: FakeEl | null; doc?: FakeDoc; cls?: string[]; attrs?: Record<string, string>; scrollTop?: number; position?: string } = {}): FakeEl {
  const node: FakeEl = {
    tag,
    cls: o.cls ?? [],
    attrs: o.attrs ?? {},
    scrollTop: o.scrollTop ?? 0,
    position: o.position ?? 'static',
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

describe('el freno del indicador', () => {
  it('baja la mitad del dedo hasta el umbral', () => {
    expect(resist(0)).toBe(0);
    expect(resist(-30)).toBe(0);
    expect(resist(Number.NaN)).toBe(0);
    expect(resist(40)).toBe(20);
    expect(resist(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
  });

  it('pasado el umbral cuesta cada vez más y nunca llega al máximo', () => {
    let prev = resist(PULL_THRESHOLD * 2);
    let prevStep = Infinity;
    for (let raw = PULL_THRESHOLD * 2 + 20; raw <= 1200; raw += 20) {
      const d = resist(raw);
      expect(d).toBeGreaterThan(prev);
      expect(d - prev).toBeLessThan(prevStep); // cada vez menos
      prevStep = d - prev;
      prev = d;
    }
    expect(resist(10_000)).toBeLessThanOrEqual(PULL_MAX);
    expect(resist(10_000)).toBeGreaterThan(PULL_MAX - 1);
    // Sin salto en el umbral.
    expect(resist(PULL_THRESHOLD * 2 + 1) - resist(PULL_THRESHOLD * 2)).toBeCloseTo(0.5, 1);
  });

  it('progreso y umbral', () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_THRESHOLD / 2)).toBe(0.5);
    expect(pullProgress(PULL_MAX)).toBe(1);
    expect(isArmed(PULL_THRESHOLD - 0.1)).toBe(false);
    expect(isArmed(PULL_THRESHOLD)).toBe(true);
  });
});

describe('¿puede empezar?', () => {
  it('un dedo, arriba de todo y en la página: sí (también en el rebote del iPhone, scrollY negativo)', () => {
    const { button, card } = page();
    expect(shouldStart(button as never, 0, 1)).toBe(true);
    expect(shouldStart(card as never, -12, 1)).toBe(true);
    // Un dibujo (svg/path) dentro de la página también.
    expect(shouldStart(el('path', { parent: el('svg', { parent: card }) }) as never, 0, 1)).toBe(true);
  });

  it('con la página bajada o con dos dedos: no', () => {
    const { button } = page();
    expect(shouldStart(button as never, 1, 1)).toBe(false);
    expect(shouldStart(button as never, 0.5, 1)).toBe(false);
    expect(shouldStart(button as never, 0, 2)).toBe(false);
    expect(shouldStart(button as never, 0, 0)).toBe(false);
  });

  it('con un modal abierto: no (aunque se toque fuera de él)', () => {
    const { doc, button } = page();
    doc.open = true;
    expect(shouldStart(button as never, 0, 1)).toBe(false);
  });

  it('en campos, modales, listas de modal, modo cancha y lo marcado con data-no-pull: no', () => {
    const { card } = page();
    const inside = (parent: FakeEl) => el('span', { parent });
    expect(shouldStart(el('input', { parent: card }) as never, 0, 1)).toBe(false);
    expect(shouldStart(el('textarea', { parent: card }) as never, 0, 1)).toBe(false);
    expect(shouldStart(el('select', { parent: card }) as never, 0, 1)).toBe(false);
    expect(shouldStart(inside(el('div', { parent: card, attrs: { contenteditable: 'true' } })) as never, 0, 1)).toBe(false);
    expect(shouldStart(inside(el('div', { parent: card, attrs: { contenteditable: 'false' } })) as never, 0, 1)).toBe(true);
    expect(shouldStart(inside(el('dialog', { parent: card })) as never, 0, 1)).toBe(false);
    expect(shouldStart(inside(el('div', { parent: card, cls: ['modal-scroll'] })) as never, 0, 1)).toBe(false);
    expect(shouldStart(inside(el('div', { parent: card, cls: ['fixed', 'inset-0', 'overscroll-none'] })) as never, 0, 1)).toBe(false);
    expect(shouldStart(inside(el('div', { parent: card, attrs: { 'data-no-pull': '' } })) as never, 0, 1)).toBe(false);
    expect(shouldStart(inside(el('div', { parent: card, attrs: { role: 'slider' } })) as never, 0, 1)).toBe(false);
    const editable = el('p', { parent: card });
    editable.isContentEditable = true;
    expect(shouldStart(editable as never, 0, 1)).toBe(false);
  });

  it('dentro de algo fijo (barra de abajo, pantallas encima): no', () => {
    const { card } = page();
    const nav = el('nav', { parent: card, position: 'fixed' });
    expect(shouldStart(el('a', { parent: nav }) as never, 0, 1)).toBe(false);
  });

  it('en una lista con su propio scroll que no está arriba: no (el dedo la sube a ella)', () => {
    const { card } = page();
    const list = el('div', { parent: card, scrollTop: 40 });
    expect(shouldStart(el('li', { parent: list }) as never, 0, 1)).toBe(false);
    list.scrollTop = 0;
    expect(shouldStart(el('li', { parent: list }) as never, 0, 1)).toBe(true);
  });

  it('sin elemento: no', () => {
    expect(shouldStart(null, 0, 1)).toBe(false);
    expect(shouldStart({} as never, 0, 1)).toBe(false);
  });

  it('el selector lista lo que no actualiza', () => {
    for (const s of ['dialog', '.modal-scroll', 'input', 'textarea', 'select', '.overscroll-none', '[data-no-pull]']) expect(NO_PULL_SELECTOR).toContain(s);
  });
});

describe('la dirección', () => {
  it('se decide a los 10 px: hacia abajo actualiza; de lado o hacia arriba no', () => {
    expect(lockDirection(3, 6)).toBe('pending');
    expect(lockDirection(DIRECTION_SLOP - 1, -(DIRECTION_SLOP - 1))).toBe('pending');
    expect(lockDirection(2, DIRECTION_SLOP)).toBe('pull');
    expect(lockDirection(DIRECTION_SLOP, 2)).toBe('cancel');
    expect(lockDirection(-14, 3)).toBe('cancel');
    expect(lockDirection(0, -DIRECTION_SLOP)).toBe('cancel');
    expect(lockDirection(12, 12)).toBe('cancel'); // en diagonal justa, mejor no
  });

  it('mientras se decide, frena el navegador solo si va más hacia abajo que de lado', () => {
    const t = beginPull(100, 100);
    expect(movePull(t, 100, 104)).toMatchObject({ prevent: true, tracker: { phase: 'pending' } });
    expect(movePull(t, 106, 103)).toMatchObject({ prevent: false, tracker: { phase: 'pending' } });
    expect(movePull(t, 100, 96)).toMatchObject({ prevent: false, tracker: { phase: 'pending' } });
    expect(movePull(t, 100, 100)).toMatchObject({ prevent: false });
  });

  it('un carrusel (de lado) cancela y ya no frena nada', () => {
    let t = beginPull(100, 100);
    const step = movePull(t, 125, 104);
    expect(step).toMatchObject({ prevent: false, tracker: { phase: 'cancelled' } });
    t = step.tracker;
    expect(movePull(t, 125, 300)).toMatchObject({ prevent: false, tracker: { phase: 'cancelled' } });
    expect(releasePull(t)).toBe(false);
  });

  it('hacia abajo: sigue al dedo, avisa al cruzar el umbral (y al volver) y suelta solo pasado el umbral', () => {
    let t = beginPull(50, 100);
    let s = movePull(t, 52, 130);
    expect(s).toMatchObject({ prevent: true, crossed: null, tracker: { phase: 'pulling', distance: 15, armed: false } });
    expect(releasePull(s.tracker)).toBe(false);
    s = movePull(s.tracker, 52, 100 + PULL_THRESHOLD * 2);
    expect(s).toMatchObject({ crossed: 'armed', tracker: { armed: true, distance: PULL_THRESHOLD } });
    s = movePull(s.tracker, 52, 400);
    expect(s.crossed).toBeNull();
    expect(releasePull(s.tracker)).toBe(true);
    s = movePull(s.tracker, 52, 150);
    expect(s).toMatchObject({ crossed: 'disarmed', tracker: { armed: false } });
    // El dedo vuelve más arriba de donde empezó: escondido, sigue siendo este gesto (no se suelta al navegador).
    t = movePull(s.tracker, 52, 60).tracker;
    expect(t).toMatchObject({ phase: 'pulling', distance: 0, armed: false });
    expect(movePull(t, 52, 60).prevent).toBe(true);
    expect(releasePull(t)).toBe(false);
    expect(releasePull(null)).toBe(false);
  });
});

// ---------- Los toques de punta a punta ----------

type Listener = (e: TouchEvent) => void;

function fakeWindow(scrollY = 0) {
  const listeners = new Map<string, Map<Listener, AddEventListenerOptions | undefined>>();
  const win: PullWindow & { scrollY: number } = {
    scrollY,
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

function setup(opts: { refresh?: () => unknown; canStart?: () => boolean; reduced?: boolean; scrollY?: number } = {}) {
  vi.useFakeTimers();
  const w = fakeWindow(opts.scrollY);
  const phases: PullPhase[] = [];
  const frames: PullFrame[] = [];
  const refresh = vi.fn(opts.refresh ?? (() => undefined));
  const vibrate = vi.fn();
  const detach = attachPullToRefresh({
    win: w.win,
    view: { draw: (f) => frames.push(f), phase: (p) => phases.push(p) },
    refresh,
    canStart: opts.canStart ?? (() => true),
    reducedMotion: () => opts.reduced ?? false,
    vibrate,
  });
  const start = (x = 100, y = 100) => w.fire('touchstart', [[x, y]]);
  const move = (x: number, y: number) => w.fire('touchmove', [[x, y]]);
  const end = () => w.fire('touchend', []);
  return { ...w, phases, frames, refresh, vibrate, detach, start, move, end };
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

  it('deslizar hasta el umbral y soltar: vibra una vez, gira al menos 600 ms y se esconde', async () => {
    const s = setup();
    s.start();
    expect(s.move(100, 105).preventDefault).toHaveBeenCalled(); // antes de decidir, ya frena el rebote
    s.move(100, 140);
    expect(s.phases).toEqual(['pulling']);
    expect(s.frames.at(-1)).toEqual({ distance: 20, animate: false, reduced: false });
    s.move(100, 100 + PULL_THRESHOLD * 2 + 10);
    s.move(100, 400);
    expect(s.vibrate).toHaveBeenCalledTimes(1);
    expect(s.vibrate).toHaveBeenCalledWith(8);
    expect(s.phases).toEqual(['pulling', 'armed']);

    s.end();
    expect(s.phases.at(-1)).toBe('refreshing');
    expect(s.frames.at(-1)).toEqual({ distance: PULL_THRESHOLD, animate: true, reduced: false });
    expect(s.count('touchmove')).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.refresh).toHaveBeenCalledTimes(1);

    // Mientras gira, otro toque no empieza nada.
    s.start();
    expect(s.count('touchmove')).toBe(0);

    await vi.advanceTimersByTimeAsync(MIN_SPIN_MS - 1);
    expect(s.phases.at(-1)).toBe('refreshing');
    await vi.advanceTimersByTimeAsync(1);
    expect(s.phases.at(-1)).toBe('settling');
    expect(s.frames.at(-1)).toEqual({ distance: 0, animate: true, reduced: false });
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(s.phases).toEqual(['pulling', 'armed', 'refreshing', 'settling', 'idle']);
    s.start();
    expect(s.count('touchmove')).toBe(1); // ya se puede otra vez
  });

  it('sigue girando hasta que llega lo nuevo (aunque pasen los 600 ms)', async () => {
    let finish!: () => void;
    const s = setup({ refresh: () => new Promise<void>((r) => (finish = r)) });
    s.start();
    s.move(100, 400);
    s.end();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.phases.at(-1)).toBe('refreshing');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.phases.at(-1)).toBe('settling');
  });

  it('si actualizar falla, igual se esconde', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup({
      refresh: () => {
        throw new Error('sin señal');
      },
    });
    s.start();
    s.move(100, 400);
    s.end();
    await vi.advanceTimersByTimeAsync(MIN_SPIN_MS + SETTLE_MS);
    expect(s.phases.at(-1)).toBe('idle');
    expect(warn).toHaveBeenCalled();
  });

  it('soltar antes del umbral no actualiza: vuelve a esconderse', async () => {
    const s = setup();
    s.start();
    s.move(100, 160);
    s.end();
    expect(s.refresh).not.toHaveBeenCalled();
    expect(s.phases).toEqual(['pulling', 'idle']);
    expect(s.frames.at(-1)).toEqual({ distance: 0, animate: true, reduced: false });
    expect(s.vibrate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it('de lado (carrusel) o hacia arriba (scroll normal): no frena, no dibuja, no actualiza', () => {
    const s = setup();
    s.start();
    const side = s.move(130, 104);
    expect(side.preventDefault).not.toHaveBeenCalled();
    expect(s.count('touchmove')).toBe(0);
    s.start();
    const up = s.move(100, 70);
    expect(up.preventDefault).not.toHaveBeenCalled();
    s.end();
    expect(s.phases).toEqual([]);
    expect(s.frames).toEqual([]);
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it('un segundo dedo o touchcancel cancelan', () => {
    const s = setup();
    s.start();
    s.move(100, 400);
    s.fire('touchstart', [
      [100, 400],
      [200, 400],
    ]);
    expect(s.phases.at(-1)).toBe('idle');
    expect(s.count('touchmove')).toBe(0);
    s.end();

    s.start();
    s.move(100, 400);
    s.fire('touchcancel', []);
    expect(s.phases.at(-1)).toBe('idle');
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it('si no puede empezar (página bajada, modal…), no escucha el movimiento', () => {
    const s = setup({ canStart: () => false });
    s.start();
    expect(s.count('touchmove')).toBe(0);
    // Con el filtro de verdad: la página bajada no empieza.
    vi.useRealTimers();
    const w = fakeWindow(300);
    const stop = attachPullToRefresh({ win: w.win, view: { draw: () => {}, phase: () => {} }, refresh: () => {} });
    const { button } = page();
    w.fire('touchstart', [[100, 100]], button);
    expect(w.count('touchmove')).toBe(0);
    w.win.scrollY = 0;
    w.fire('touchstart', [[100, 100]], button);
    expect(w.count('touchmove')).toBe(1);
    stop();
  });

  it('movimiento reducido: el indicador no sigue al dedo y se esconde sin esperar', async () => {
    const s = setup({ reduced: true });
    s.start();
    s.move(100, 400);
    expect(s.frames.at(-1)).toMatchObject({ animate: false, reduced: true });
    s.end();
    expect(s.frames.at(-1)).toEqual({ distance: PULL_THRESHOLD, animate: false, reduced: true });
    await vi.advanceTimersByTimeAsync(MIN_SPIN_MS);
    expect(s.phases).toEqual(['armed', 'refreshing', 'idle']);
    expect(s.frames.at(-1)).toEqual({ distance: 0, animate: false, reduced: true });
  });

  it('al desmontar deja de escuchar y no termina lo pendiente', async () => {
    const s = setup();
    s.start();
    s.move(100, 400);
    s.end();
    s.detach();
    expect(s.count('touchstart')).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.phases.at(-1)).toBe('refreshing');
  });
});
