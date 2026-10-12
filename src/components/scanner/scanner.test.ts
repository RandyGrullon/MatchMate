/**
 * El lector de QR dibujado sin navegador (renderToString): sin QR a la vista, sin permiso en el iPhone, un QR que no es
 * de MatchMate, escribir el código, y el botón que lo abre. También cómo se carga jsQR (viene en CommonJS).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CameraState } from './camera';
import { unwrapJsQr } from './decoder';
import { QrScannerButton } from './index';
import { ScannerView, scanHint, type ScanPhase, type ScannerHandlers } from './QrScanner';
import { idleQuad, type Platform } from './logic';

const noop = () => undefined;
const on: ScannerHandlers = {
  close: noop,
  torch: noop,
  retry: noop,
  photo: noop,
  file: noop,
  openCode: noop,
  closeCode: noop,
  code: noop,
  submitCode: noop,
  copy: noop,
  rescan: noop,
};

const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function view(o: {
  camera?: CameraState;
  phase?: ScanPhase;
  platform?: Platform;
  foreign?: string | null;
  copied?: boolean;
  note?: string | null;
  code?: string;
  torch?: { available: boolean; on: boolean };
  box?: { w: number; h: number } | null;
}) {
  return renderToString(
    h(ScannerView, {
      camera: o.camera ?? { status: 'live' },
      phase: o.phase ?? 'scan',
      box: o.box === undefined ? { w: 390, h: 844 } : o.box,
      platform: o.platform ?? 'ios',
      foreign: o.foreign ?? null,
      copied: o.copied ?? false,
      note: o.note ?? null,
      code: o.code ?? '',
      torch: o.torch ?? { available: false, on: false },
      on,
    }),
  );
}

describe('el lector', () => {
  it('sin QR a la vista: título, la pista bajo el marco, cerrar, «Elegir foto» y «Escribir el código»', () => {
    const html = view({});
    const t = text(html);
    expect(t).toContain('Escanea el QR');
    expect(t).toContain('Apunta al código de la liga, equipo o invitación');
    expect(t).toContain('Elegir foto');
    expect(t).toContain('Escribir el código');
    expect(html).toContain('aria-label="Cerrar"');
    expect(html).toMatch(/<video[^>]*playsInline|<video[^>]*playsinline/);
    expect(html).toContain('object-cover');
    // el oscurecido con su hueco y las esquinas del marco (los pinta QrScanner en cada repintado)
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).toContain('stroke="var(--scan-accent)"');
    expect(html).toContain('class="mm-scan-line');
    // la pista va 26 px debajo del cuadro del centro (273 px de lado, centrado en el 44 % del alto)
    expect(html).toContain(`top:${idleQuad(390, 844)[2].y + 26}px`);
    // sin linterna en el teléfono: no hay botón
    expect(html).not.toContain('aria-label="Linterna"');
    expect(t).not.toContain('Ese QR no es de MatchMate');
  });

  it('con linterna (Android) sale el botón, marcado si está prendida', () => {
    expect(view({ torch: { available: true, on: false } })).toContain('aria-label="Linterna" aria-pressed="false"');
    expect(view({ torch: { available: true, on: true } })).toContain('aria-pressed="true"');
  });

  it('abriendo la cámara y leyendo', () => {
    expect(text(view({ camera: { status: 'starting' } }))).toContain('Abriendo la cámara…');
    expect(text(view({ phase: 'lock' }))).toContain('Código encontrado');
    expect(text(view({ phase: 'photo' }))).toContain('Leyendo la foto…');
    const done = view({ phase: 'done' });
    expect(text(done)).toContain('Abriendo…');
    expect(done).toContain('class="mm-scan-pop');
    expect(scanHint({ status: 'live' }, 'scan')).toBe('Apunta al código de la liga, equipo o invitación');
  });

  it('sin permiso en el iPhone: dónde darlo, «Intentar de nuevo» y las otras dos formas', () => {
    const html = view({ camera: { status: 'problem', problem: 'denied' }, platform: 'ios' });
    const t = text(html);
    expect(t).toContain('Falta el permiso de la cámara');
    expect(t).toContain('Ajustes › Safari › Cámara');
    expect(t).toContain('Ajustes › MatchMate › Cámara');
    expect(t).toContain('Intentar de nuevo');
    expect(t).toContain('Elegir foto');
    expect(t).toContain('Escribir el código');
    // sin marco ni pista de apuntar
    expect(html).not.toContain('class="mm-scan-line');
    expect(t).not.toContain('Apunta al código');
  });

  it('sin https: lo explica, sin «Intentar de nuevo»', () => {
    const t = text(view({ camera: { status: 'problem', problem: 'insecure' }, platform: 'other' }));
    expect(t).toContain('La cámara no está disponible aquí');
    expect(t).not.toContain('Intentar de nuevo');
  });

  it('un QR que no es de MatchMate: lo dice, muestra lo leído y deja copiarlo (sin link)', () => {
    const html = view({ phase: 'foreign', foreign: 'https://example.com/promo?a=1&b=<2>' });
    const t = text(html);
    expect(t).toContain('Ese QR no es de MatchMate');
    expect(t).toContain('https://example.com/promo?a=1&b=');
    expect(html).toContain('&lt;2&gt;');
    expect(t).toContain('Copiar');
    expect(t).toContain('Escanear otro');
    expect(html).not.toContain('href="https://example.com');
    expect(t).not.toContain('Elegir foto');
    expect(text(view({ phase: 'foreign', foreign: 'hola', copied: true }))).toContain('Copiado');
  });

  it('escribir el código: «Unirme» se activa con 8 letras y números', () => {
    const empty = view({ phase: 'code', code: 'ABC' });
    expect(text(empty)).toContain('Escribe el código');
    expect(empty).toContain('aria-label="Código de invitación"');
    expect(empty).toMatch(/<button type="submit" disabled=""/);
    expect(view({ phase: 'code', code: 'ABCD2345' })).not.toMatch(/<button type="submit" disabled=""/);
  });

  it('el aviso de abajo (foto sin QR)', () => {
    expect(text(view({ note: 'No encontramos un QR en esa foto.' }))).toContain('No encontramos un QR en esa foto.');
  });

  it('sin medir la pantalla todavía, la pista queda abajo del medio', () => {
    expect(view({ box: null })).toContain('top-[68%]');
  });
});

describe('abrirlo desde otra pantalla', () => {
  const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
  it('QrScannerButton: el botón, con el lector cerrado', () => {
    const html = render(h(QrScannerButton, { className: 'x', label: 'Escanear QR', children: 'o escanea el QR' }));
    expect(html).toContain('aria-label="Escanear QR"');
    expect(text(html)).toContain('o escanea el QR');
    expect(html).not.toContain('<dialog');
  });
});

describe('jsQR en CommonJS', () => {
  it('encuentra la función en default o en default.default', () => {
    const fn = () => null;
    expect(unwrapJsQr({ default: fn })).toBe(fn);
    expect(unwrapJsQr({ default: { default: fn } })).toBe(fn);
    expect(() => unwrapJsQr({ default: {} })).toThrow();
  });

  it('la de verdad carga', async () => {
    const jsQR = unwrapJsQr(await import('jsqr'));
    expect(typeof jsQR).toBe('function');
    expect(jsQR(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });
});
