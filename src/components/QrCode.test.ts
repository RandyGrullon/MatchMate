/**
 * El QR con el estilo de la app tiene que seguir leyéndose: se dibuja (renderToString), se pasa a PNG con resvg y se
 * lee con jsQR (el mismo lector del iPhone en la app), con los colores de claro y de oscuro, chico como en pantalla y
 * girado como lo ve una cámara. resvg no entiende variables CSS: las pruebas pasan los colores fijos.
 */
import { Resvg } from '@resvg/resvg-js';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { decodePixels, unwrapJsQr } from './scanner/decoder';
import { PRODUCTION_ORIGIN, routeFromScan } from './scanner/logic';
import { QR_INK, QrCode, qrModel, type QrPalette } from './QrCode';

const jsQR = unwrapJsQr(await import('jsqr'));

const INVITE = `${PRODUCTION_ORIGIN}/unirse/ABCD2345`;
const TEAM = `${PRODUCTION_ORIGIN}/esports/unirse/WXYZ6789?desde=equipo-de-la-liga-de-los-martes`;
const LOCAL = 'http://localhost:5173/unirse/ABCD2345';

/** Los colores de los ojos: el morado de claro, el de oscuro oscurecido (color-mix 60 % con negro) y la tinta. */
const PALETTES: Record<string, Partial<QrPalette>> = {
  claro: { eye: '#4338ca' },
  oscuro: { eye: '#43437b' },
  tinta: { eye: QR_INK },
};

function svgOf(value: string, palette: Partial<QrPalette>): string {
  return renderToString(h(QrCode, { value, palette, className: 'size-44' }));
}

function read(svg: string, width: number): string | null {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: '#ffffff', font: { loadSystemFonts: false } }).render();
  const hit = decodePixels(jsQR, new Uint8ClampedArray(img.pixels), img.width, img.height, true);
  return hit?.text ?? null;
}

describe('el modelo del QR', () => {
  it('el link de invitación: versión 6 (ecc H), margen de 2, los 3 ojos y el logo en el centro', () => {
    const m = qrModel(INVITE);
    expect(m.version).toBe(6);
    expect(m.size).toBe(17 + 4 * 6 + 4);
    expect(m.eyes).toEqual([
      { x: 2, y: 2 },
      { x: m.size - 2 - 7, y: 2 },
      { x: 2, y: m.size - 2 - 7 },
    ]);
    expect(m.logo).toEqual({ x: 18, y: 18, size: 9 });
    // el logo tapa poco (menos del 6 % del código)
    expect((m.logo!.size / (m.size - 4)) ** 2).toBeLessThan(0.06);
    // módulos redondeados (arcos), no cuadrados sueltos
    expect(m.d).toContain('a.5 .5');
  });

  it('un código corto no lleva logo', () => {
    expect(qrModel('ABCD2345').logo).toBeNull();
  });

  it('sin colores fijos usa el color de la app (con su regla para modo oscuro) y queda sobre blanco', () => {
    const html = renderToString(h(QrCode, { value: INVITE }));
    expect(html).toContain('class="mm-qr size-44"');
    expect(html).toContain('var(--qr-eye, #151822)');
    expect(html).toContain('.mm-qr{--qr-eye:var(--accent)}');
    expect(html).toContain('color-mix(in oklab,var(--accent) 60%,#000)');
    expect(html).toContain('fill="#ffffff"');
    expect(html).toContain('aria-label="Código QR de la invitación"');
  });

  it('con colores fijos no hay variables (resvg y las imágenes las necesitan así)', () => {
    const svg = svgOf(INVITE, PALETTES.claro);
    expect(svg).not.toContain('var(');
    expect(svg).not.toContain('<style');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });
});

describe('se sigue leyendo', () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    it(`invitación de liga, ojos ${name}`, () => {
      expect(read(svgOf(INVITE, palette), 540)).toBe(INVITE);
    });
  }

  it('el link largo de un equipo de esports (versión más grande, logo más grande)', () => {
    const m = qrModel(TEAM);
    expect(m.version).toBeGreaterThanOrEqual(7);
    expect(m.logo).not.toBeNull();
    expect(read(svgOf(TEAM, PALETTES.claro), 600)).toBe(TEAM);
    expect(read(svgOf(TEAM, PALETTES.oscuro), 600)).toBe(TEAM);
  });

  it('chico, como se ve en la pantalla (168 px)', () => {
    expect(read(svgOf(INVITE, PALETTES.claro), 168)).toBe(INVITE);
    expect(read(svgOf(LOCAL, PALETTES.oscuro), 168)).toBe(LOCAL);
  });

  it('el código suelto, sin logo', () => {
    expect(read(svgOf('ABCD2345', PALETTES.claro), 300)).toBe('ABCD2345');
  });

  it('girado y con margen, como lo ve una cámara; y lo leído abre la invitación en la app', () => {
    const inner = svgOf(INVITE, PALETTES.claro).replace('<svg ', '<svg width="400" height="400" ');
    const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700" viewBox="0 0 700 700"><rect width="700" height="700" fill="#d9dce3"/><g transform="rotate(17 350 350) translate(150 150)">${inner}</g></svg>`;
    const text = read(scene, 700);
    expect(text).toBe(INVITE);
    expect(routeFromScan(text!, ['http://localhost:5173', PRODUCTION_ORIGIN])).toEqual({ kind: 'app', path: '/unirse/ABCD2345' });
  });
});
