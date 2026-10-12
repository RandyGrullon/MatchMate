/**
 * PullToRefresh dibujado sin navegador (quieto: escondido, sin texto) y lo que actualiza `refreshApp`: espera lo que
 * está en pantalla; lo demás (deportes, avisos, cola, versión nueva) va al lado y si falla no frena nada.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => ({
  refreshActive: vi.fn<() => Promise<void>>(),
  flush: vi.fn<() => Promise<void>>(),
  outbox: true,
  refreshSportStatus: vi.fn<() => Promise<void>>(),
  refreshNotices: vi.fn<() => void>(),
}));
vi.mock('../lib/data/client', () => ({
  queryClient: { refreshActive: () => fx.refreshActive() },
  currentOutbox: () => (fx.outbox ? { flush: () => fx.flush() } : null),
}));
vi.mock('../sports/status', () => ({ refreshSportStatus: () => fx.refreshSportStatus() }));
vi.mock('../lib/notices', () => ({ refreshNotices: () => fx.refreshNotices() }));

const { PullToRefresh, refreshApp } = await import('./PullToRefresh');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  fx.outbox = true;
  fx.refreshActive.mockReset().mockResolvedValue(undefined);
  fx.flush.mockReset().mockResolvedValue(undefined);
  fx.refreshSportStatus.mockReset().mockResolvedValue(undefined);
  fx.refreshNotices.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PullToRefresh quieto', () => {
  it('no se ve ni se puede tocar: el círculo está escondido arriba y el aviso para lectores de pantalla vacío', () => {
    const html = renderToString(h(PullToRefresh));
    expect(html).toContain('data-pull="idle"');
    expect(html).toMatch(/class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/style="transform:translate3d\(-50%, -40px, 0\);opacity:0"/);
    expect(html).toContain('top-[env(safe-area-inset-top)]');
    expect(html).toMatch(/role="status" aria-live="polite"/);
    expect(text(html)).toBe('');
    // La flecha y el anillo (no el logo girando, que es para cuando actualiza).
    expect(html).toContain('lucide-arrow-down');
    expect(html).not.toContain('mm-spin');
  });

  it('acepta su propio onRefresh (pruebas) sin cambiar lo que dibuja', () => {
    expect(renderToString(h(PullToRefresh, { onRefresh: () => {} }))).toBe(renderToString(h(PullToRefresh)));
  });
});

describe('refreshApp', () => {
  it('espera lo que está en pantalla; lo demás sale al mismo tiempo', async () => {
    let finish!: () => void;
    fx.refreshActive.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const update = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ update }) } });
    let done = false;
    const run = refreshApp().then(() => (done = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(fx.refreshActive).toHaveBeenCalledTimes(1);
    expect(fx.flush).toHaveBeenCalledTimes(1);
    expect(fx.refreshSportStatus).toHaveBeenCalledTimes(1);
    expect(fx.refreshNotices).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    finish();
    await run;
    expect(done).toBe(true);
  });

  it('si lo de al lado falla (o no hay cola ni service worker), igual termina', async () => {
    fx.outbox = false;
    fx.refreshSportStatus.mockRejectedValue(new Error('sin señal'));
    fx.refreshNotices.mockImplementation(() => {
      throw new Error('roto');
    });
    vi.stubGlobal('navigator', {});
    await expect(refreshApp()).resolves.toBeUndefined();

    fx.outbox = true;
    fx.flush.mockRejectedValue(new Error('sin sesión'));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => Promise.reject(new Error('no')) } });
    await expect(refreshApp()).resolves.toBeUndefined();
    expect(fx.refreshActive).toHaveBeenCalledTimes(2);
  });
});
