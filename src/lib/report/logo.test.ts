import { afterEach, describe, expect, it, vi } from 'vitest';

// La URL pública del logo sin la base (la de verdad la da Storage).
vi.mock('../logos', () => ({ logoUrl: async (path: string) => (path === 'sin-url' ? null : `https://cdn.test/${path}`) }));

const { reportLogo } = await import('./logo');

const bitmap = { width: 256, height: 128, close: vi.fn() };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logo de la liga para el PDF', () => {
  it('un JPEG va tal cual, con su tamaño', async () => {
    const fetch = vi.fn(async () => new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    const logo = await reportLogo('L1/logo.jpg');
    expect(fetch).toHaveBeenCalledWith('https://cdn.test/L1/logo.jpg');
    expect(logo).toEqual({ data: 'data:image/jpeg;base64,/9j/', format: 'JPEG', width: 256, height: 128 });
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('sin logo, sin URL, sin señal o si falla: sin logo (el reporte sale igual)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })));
    expect(await reportLogo(null)).toBeNull();
    expect(await reportLogo('sin-url')).toBeNull();
    expect(await reportLogo('L1/logo.webp')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await reportLogo('L1/logo.webp')).toBeNull();
  });

  it('si tarda mucho, sigue sin el logo', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    expect(await reportLogo('L1/logo.jpg', 20)).toBeNull();
  });
});
