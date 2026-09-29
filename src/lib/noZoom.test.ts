import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Un documento mínimo (las pruebas corren en Node): <html> con su estilo y el meta viewport de antes.
const meta = { content: 'width=device-width, initial-scale=1, viewport-fit=cover' };
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

const touchMove = (fingers: number) => {
  const e = { touches: Array.from({ length: fingers }, () => ({})), preventDefault: vi.fn() };
  listeners.get('touchmove')?.(e as unknown as Event);
  return e.preventDefault;
};

describe('sin zoom en toda la app', () => {
  it('bloquea pellizco y doble toque desde que abre, en todas las pantallas', () => {
    mod.setupZoom();
    mod.setupZoom(); // una sola vez las escuchas
    expect(doc.addEventListener).toHaveBeenCalledTimes(4);
    expect(meta.content).toBe(mod.LOCKED_VIEWPORT);
    expect(meta.content).toContain('user-scalable=no');
    expect(meta.content).toContain('maximum-scale=1');
    expect(html.style.touchAction).toBe('pan-x pan-y');
    expect('zoomLock' in html.dataset).toBe(true);
    expect(mod.blockZoom).toBe(mod.setupZoom);
  });

  it('Safari: se frena el gesto de pellizco y el movimiento con dos dedos; con un dedo se desliza normal', () => {
    expect(touchMove(2)).toHaveBeenCalled();
    expect(touchMove(1)).not.toHaveBeenCalled();
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      const e = { preventDefault: vi.fn() };
      listeners.get(type)?.(e as unknown as Event);
      expect(e.preventDefault, type).toHaveBeenCalled();
    }
  });

  it('el modo cancha se cuenta, y al salir el zoom sigue bloqueado', () => {
    const a = mod.lockZoom();
    const b = mod.lockZoom();
    expect(mod.zoomLocks()).toBe(2);
    a();
    a(); // soltar dos veces no cuenta doble
    b();
    expect(mod.zoomLocks()).toBe(0);
    expect(html.style.touchAction).toBe('pan-x pan-y');
    expect(meta.content).toBe(mod.LOCKED_VIEWPORT);
    expect(touchMove(2)).toHaveBeenCalled();
  });

  it('index.html ya abre con el zoom bloqueado (antes de que cargue la app)', () => {
    const page = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(page).toContain(`<meta name="viewport" content="${mod.LOCKED_VIEWPORT}" />`);
  });
});
