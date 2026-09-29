import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { reloadOnTakeover, updatePrompt, UPDATE_CHECK_EVERY_MS, UPDATE_CHECK_GAP_MS, watchForUpdates } from './appUpdate';

describe('qué aviso de versión nueva se muestra', () => {
  it.each([
    [{ needsUpdate: false, newVersion: false }, 'none'],
    [{ needsUpdate: false, newVersion: true }, 'new_version'],
    // La cola espera la versión nueva: se pide actualizar aunque el service worker todavía no la haya encontrado.
    [{ needsUpdate: true, newVersion: false }, 'needs_update'],
    [{ needsUpdate: true, newVersion: true }, 'needs_update'],
  ] as const)('%o → %s', (state, expected) => {
    expect(updatePrompt(state)).toBe(expected);
  });
});

describe('la versión nueva tomó el control de la página', () => {
  it('con algo por enviar no se recarga sola: se muestra el aviso', () => {
    expect(reloadOnTakeover({ requested: false, pending: 1 })).toBe(false);
    expect(reloadOnTakeover({ requested: false, pending: 5 })).toBe(false);
  });

  it('sin nada por enviar se recarga como siempre', () => {
    expect(reloadOnTakeover({ requested: false, pending: 0 })).toBe(true);
  });

  it('si la persona tocó «Actualizar» aquí, se recarga aunque haya pendientes (se envían después)', () => {
    expect(reloadOnTakeover({ requested: true, pending: 3 })).toBe(true);
    expect(reloadOnTakeover({ requested: true, pending: 0 })).toBe(true);
  });
});

describe('preguntar si hay versión nueva', () => {
  let win: EventTarget;
  let doc: EventTarget;
  let visible: boolean;
  let online: boolean;
  let update: Mock<() => Promise<unknown>>;
  let reg: { update: Mock<() => Promise<unknown>>; installing: unknown };
  let stop: () => void;

  const start = () => {
    stop = watchForUpdates(reg, { win, doc, visible: () => visible, online: () => online });
  };
  const resume = () => doc.dispatchEvent(new Event('visibilitychange'));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    win = new EventTarget();
    doc = new EventTarget();
    visible = true;
    online = true;
    update = vi.fn(async () => undefined);
    reg = { update, installing: null };
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  it('al volver a la app (visibilitychange a visible)', async () => {
    start();
    visible = false;
    resume(); // se fue a otra app: no pregunta
    await vi.advanceTimersByTimeAsync(0);
    expect(update).not.toHaveBeenCalled();
    visible = true;
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('al volver la señal (online)', async () => {
    start();
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('cada 30 minutos mientras la app está a la vista (en segundo plano no gasta datos)', async () => {
    start();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_EVERY_MS - 1);
    expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(update).toHaveBeenCalledTimes(1);
    visible = false;
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_EVERY_MS);
    expect(update).toHaveBeenCalledTimes(1);
    visible = true;
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_EVERY_MS);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('volver a la app y volver la señal juntos: una sola pregunta por minuto', async () => {
    start();
    resume();
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_GAP_MS - 1);
    resume();
    expect(update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('sin señal, o si ya está bajando una versión, no pregunta', async () => {
    start();
    online = false;
    resume();
    win.dispatchEvent(new Event('online')); // el evento llegó pero navigator.onLine sigue en false
    await vi.advanceTimersByTimeAsync(0);
    expect(update).not.toHaveBeenCalled();
    online = true;
    reg.installing = {};
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).not.toHaveBeenCalled();
    reg.installing = null;
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('si el servidor no responde, no rompe nada y vuelve a preguntar la próxima vez', async () => {
    update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    start();
    resume();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_GAP_MS);
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('una pregunta a la vez (la anterior todavía no termina)', async () => {
    let finish!: () => void;
    update.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    start();
    resume();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_GAP_MS);
    resume();
    expect(update).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('al parar ya no escucha ni pregunta', async () => {
    start();
    stop();
    resume();
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(2 * UPDATE_CHECK_EVERY_MS);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('una versión nueva que queda esperando', () => {
  /** Un service worker de prueba: `state` y el evento `statechange`. */
  class FakeWorker extends EventTarget {
    state = 'installing';
  }
  type Reg = EventTarget & { update: Mock<() => Promise<unknown>>; installing: FakeWorker | null; waiting: FakeWorker | null };
  let reg: Reg;
  let doc: EventTarget;
  let onWaiting: Mock<() => void>;
  let stop: () => void;

  const start = () => {
    stop = watchForUpdates(reg, { win: null, doc, visible: () => true, online: () => true, onWaiting });
  };
  const resume = () => doc.dispatchEvent(new Event('visibilitychange'));
  /** Lo que hace el navegador cuando `update()` encuentra una versión nueva: la baja, la instala y queda esperando. */
  const deploy = (result: 'installed' | 'redundant' = 'installed') => {
    reg.update.mockImplementationOnce(async () => {
      const sw = new FakeWorker();
      reg.installing = sw;
      reg.dispatchEvent(new Event('updatefound'));
      setTimeout(() => {
        sw.state = result;
        reg.installing = null;
        if (result === 'installed') reg.waiting = sw;
        sw.dispatchEvent(new Event('statechange'));
      }, 50);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    doc = new EventTarget();
    onWaiting = vi.fn();
    reg = Object.assign(new EventTarget(), { update: vi.fn(async () => undefined), installing: null, waiting: null });
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  it('avisa cada una, también la segunda del día aunque se haya cerrado el aviso de la primera (workbox solo avisa la primera)', async () => {
    start();
    deploy();
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).not.toHaveBeenCalled(); // todavía se está instalando
    await vi.advanceTimersByTimeAsync(50);
    expect(onWaiting).toHaveBeenCalledTimes(1);
    const first = reg.waiting;

    // Se cerró el aviso; horas después sale otra versión y la app sigue abierta.
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_GAP_MS);
    deploy();
    resume();
    await vi.advanceTimersByTimeAsync(50);
    expect(reg.waiting).not.toBe(first);
    expect(onWaiting).toHaveBeenCalledTimes(2);

    // Preguntar otra vez sin nada nuevo (la misma sigue esperando) no avisa de nuevo; una instalación que falla, tampoco.
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_GAP_MS);
    resume();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_GAP_MS);
    deploy('redundant');
    resume();
    await vi.advanceTimersByTimeAsync(50);
    expect(onWaiting).toHaveBeenCalledTimes(2);
  });

  it('la que instaló otra pestaña se ve al terminar la pregunta', async () => {
    start();
    reg.update.mockImplementationOnce(async () => {
      reg.waiting = new FakeWorker();
    });
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it('la que ya esperaba al empezar no se repite (esa la avisa workbox al registrar); al parar ya no escucha', async () => {
    reg.waiting = new FakeWorker();
    start();
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).not.toHaveBeenCalled();
    stop();
    const sw = new FakeWorker();
    reg.installing = sw;
    reg.dispatchEvent(new Event('updatefound'));
    sw.state = 'installed';
    reg.waiting = sw;
    sw.dispatchEvent(new Event('statechange'));
    expect(onWaiting).not.toHaveBeenCalled();
  });
});
