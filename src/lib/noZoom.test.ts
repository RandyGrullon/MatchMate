import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Un documento mínimo (las pruebas corren en Node): <html> con su estilo y el meta viewport.
const meta = { content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' };
const html = { style: { touchAction: '' }, dataset: {} as Record<string, string> };
const listeners = new Map<string, (e: Event) => void>();
const doc = {
  documentElement: html,
  querySelector: (sel: string) => (sel === 'meta[name="viewport"]' ? meta : null),
  addEventListener: vi.fn((type: string, fn: (e: Event) => void) => listeners.set(type, fn)),
};

let mod: typeof import('./noZoom');

beforeAll(async () => {
  vi.stubGlobal('document', doc);
  mod = await import('./noZoom');
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const pinch = () => {
  const e = { touches: [{}, {}], preventDefault: vi.fn() };
  listeners.get('touchmove')?.(e as unknown as Event);
  return e.preventDefault;
};

describe('zoom con los dedos', () => {
  it('en toda la app se puede ampliar (sin user-scalable=no); el doble toque no amplía', () => {
    mod.setupZoom();
    mod.setupZoom(); // una sola vez las escuchas
    expect(doc.addEventListener).toHaveBeenCalledTimes(4);
    expect(meta.content).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
    expect(html.style.touchAction).toBe('manipulation');
    expect(pinch()).not.toHaveBeenCalled();
    expect(mod.blockZoom).toBe(mod.setupZoom);
  });

  it('el modo cancha lo bloquea mientras está abierto (varios a la vez se cuentan)', () => {
    const a = mod.lockZoom();
    const b = mod.lockZoom();
    expect(mod.zoomLocked()).toBe(true);
    expect(meta.content).toContain('user-scalable=no');
    expect(html.style.touchAction).toBe('pan-x pan-y');
    expect('zoomLock' in html.dataset).toBe(true);
    expect(pinch()).toHaveBeenCalled();
    const gesture = { preventDefault: vi.fn() };
    listeners.get('gesturestart')?.(gesture as unknown as Event);
    expect(gesture.preventDefault).toHaveBeenCalled();

    a();
    a(); // soltar dos veces no cuenta doble
    expect(mod.zoomLocked()).toBe(true);
    b();
    expect(mod.zoomLocked()).toBe(false);
    expect(html.style.touchAction).toBe('manipulation');
    expect('zoomLock' in html.dataset).toBe(false);
    expect(meta.content).not.toContain('user-scalable');
    expect(pinch()).not.toHaveBeenCalled();
  });
});
