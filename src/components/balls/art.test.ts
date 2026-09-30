/**
 * <BallArt> dibujada sin navegador (renderToString) a 24, 40, 64 y 160 px: el SVG (tamaño, nombre accesible, ids que no
 * chocan), cada dibujo y cada figura sin números rotos, el detalle según el tamaño, el dibujo siempre igual para el
 * mismo diseño, el texto de las figuras nunca como marcado y, pasado a PNG con resvg, que se ve sobre el fondo claro y
 * sobre el oscuro (también una bola negra sobre fondo oscuro y una blanca sobre fondo blanco).
 */
import { Resvg } from '@resvg/resvg-js';
import { createElement as h, Fragment } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BALL_PATTERNS, BALL_STICKER_SHAPES, defaultBallDesign, newSticker, type BallDesign } from '../../lib/ballDesign';
import { BallArt, ballArtDetail, ballArtMetrics, patternFeatures, smoothPath } from './BallArt';

const SIZES = [24, 40, 64, 160] as const;

const art = (design: BallDesign | null, size: number, extra: Record<string, unknown> = {}) => renderToString(h(BallArt, { design, size, ...extra }));

const design = (pattern: BallDesign['pattern'], extra: Partial<BallDesign> = {}): BallDesign => ({
  ...defaultBallDesign('#7c3aed'),
  pattern,
  second: '#f0abfc',
  third: '#0ea5e9',
  ...extra,
});

/** Todas las figuras, cada una con su texto. */
const withStickers = (d: BallDesign): BallDesign => {
  const out = { ...d, stickers: [...d.stickers] };
  for (const s of BALL_STICKER_SHAPES.slice(0, 5)) out.stickers.push(newSticker(s.key, out));
  return out;
};

/** Cuántas veces sale una etiqueta. */
const count = (html: string, tag: string) => html.match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0;

/** El SVG sobre un fondo, en PNG (RGBA); ancho = alto = `size` + 16 de margen. */
function paint(svg: string, size: number, bg: string) {
  const W = size + 16;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="${W}" height="${W}" fill="${bg}"/>${svg.replace('<svg ', '<svg x="8" y="8" ')}</svg>`;
  const img = new Resvg(doc, { font: { loadSystemFonts: false } }).render();
  return { W, px: img.pixels };
}

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hexLum = (hex: string) => lum(Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16));

/**
 * Lo más distinto del fondo a lo largo del borde de la bola (una franja de ±3 px alrededor del radio): si el borde
 * no se separa del fondo, la bola no se ve.
 */
function edgeContrast(svg: string, size: number, bg: string): number {
  const { W, px } = paint(svg, size, bg);
  const back = hexLum(bg);
  const c = W / 2;
  const r = (size / 2) * 0.97;
  let best = 0;
  for (let a = 0; a < 360; a += 10) {
    for (let dr = -3; dr <= 3; dr++) {
      const x = Math.round(c + Math.cos((a * Math.PI) / 180) * (r + dr));
      const y = Math.round(c + Math.sin((a * Math.PI) / 180) * (r + dr));
      const i = (y * W + x) * 4;
      best = Math.max(best, Math.abs(lum(px[i], px[i + 1], px[i + 2]) - back));
    }
  }
  return best;
}

describe('<BallArt>', () => {
  it('a cada tamaño: su ancho y alto, viewBox de 100 y el borde más grueso (en unidades) cuanto más chica', () => {
    const widths: number[] = [];
    for (const size of SIZES) {
      const out = art(design('solida'), size);
      expect(out).toMatch(new RegExp(`^<svg[^>]*viewBox="0 0 100 100" width="${size}" height="${size}"`));
      const m = ballArtMetrics(size);
      expect(out).toContain(`stroke-width="${Math.round(m.outline * 100) / 100}"`);
      widths.push(m.outline);
      // El borde, el halo y la bola caben en el cuadro.
      expect(m.radius + m.outline / 2 + m.halo).toBeCloseTo(50);
      // Medidos en píxeles: nunca menos de 1.2 px de borde.
      expect((m.outline * size) / 100).toBeGreaterThanOrEqual(1.2);
    }
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    expect(SIZES.map(ballArtDetail)).toEqual(['min', 'mid', 'mid', 'full']);
  });

  it('con nombre es una imagen con su <title>; sin nombre, decorativa', () => {
    const named = art(design('solida'), 40, { label: 'La Phaze II' });
    expect(named).toMatch(/role="img" aria-labelledby="([^"]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(named)![1];
    expect(named).toContain(`<title id="${id}">La Phaze II</title>`);
    const quiet = art(design('solida'), 40, { className: 'shrink-0' });
    expect(quiet).toContain('aria-hidden="true"');
    expect(quiet).toContain('class="shrink-0"');
    expect(quiet).not.toContain('<title');
  });

  it('cada dibujo con todas las figuras, a cada tamaño: sin números rotos y el SVG se lee (resvg)', () => {
    for (const p of BALL_PATTERNS) {
      for (const size of SIZES) {
        const out = art(withStickers(design(p.key, { softness: 0.7, scale: 0.5, angle: 200 })), size);
        expect(out, `${p.key} ${size}`).not.toMatch(/NaN|Infinity|undefined|null/);
        expect(() => paint(out, size, '#ffffff'), `${p.key} ${size}`).not.toThrow();
      }
    }
  });

  it('sin diseño: la bola lisa de su color (perlada si la cubierta es perlada)', () => {
    const plain = renderToString(h(BallArt, { color: '#dc2626', size: 64 }));
    expect(plain).toContain('fill="#dc2626"');
    expect(plain).not.toContain('radialGradient');
    const pearl = renderToString(h(BallArt, { color: '#dc2626', cover: 'perlada', size: 64 }));
    expect(pearl).toContain('<radialGradient');
    // Sin nada: el azul de siempre.
    expect(renderToString(h(BallArt, { size: 24 }))).toContain('fill="#1d4ed8"');
    // Con la bola: su diseño o, sin él, su color y su cubierta.
    const ball = { design: null, color: '#16a34a', cover: 'perlada' as const };
    expect(renderToString(h(BallArt, { ball, size: 40 }))).toBe(renderToString(h(BallArt, { color: '#16a34a', cover: 'perlada', size: 40 })));
    const designed = renderToString(h(BallArt, { ball: { ...ball, design: design('galaxia', { base: '#0b1026' }) }, size: 40 }));
    expect(designed).toContain('fill="#0b1026"');
    expect(designed).not.toContain('#16a34a');
  });

  it('huecos y brillo se pueden quitar; en lo chico, sin los detalles finos', () => {
    const full = art(design('solida'), 160);
    const small = art(design('solida'), 24);
    // Cada hueco: el borde y el fondo; en 24 px, solo uno.
    expect(count(full, 'circle') - count(art(design('solida', { holes: false }), 160), 'circle')).toBe(6);
    expect(count(small, 'circle') - count(art(design('solida', { holes: false }), 24), 'circle')).toBe(3);
    expect(full).toContain('rotate(-38');
    expect(art(design('solida', { shine: false }), 160)).not.toContain('rotate(-38');
    // El puntito del brillo solo desde 32 px.
    expect(count(full, 'circle') - count(small, 'circle')).toBe(4);
  });

  it('lo que se repite (destellos, estrellas) se aclara en lo chico: menos puntos', () => {
    const d = design('destellos', { scale: 0.5 });
    const n = SIZES.map((s) => count(art(d, s), 'circle'));
    expect(n[0]).toBeLessThan(n[1]);
    expect(n[1]).toBeLessThan(n[3]);
    // Y con el dibujo grande (scale 2) se ven menos (los de afuera no se dibujan).
    expect(count(art({ ...d, scale: 2 }, 160), 'circle')).toBeLessThan(n[3] / 2);
  });

  it('siempre igual para el mismo diseño; el tamaño y el ángulo no mueven las manchas', () => {
    const d = design('camuflaje');
    expect(art(d, 64)).toBe(art(d, 64));
    const base = patternFeatures(d, 'full');
    const again = patternFeatures({ ...d, angle: 170, softness: d.softness, second: '#000000', stickers: [] }, 'full');
    expect(again.map((x) => [x.bx, x.by])).toEqual(base.map((x) => [x.bx, x.by]));
    // Más grande: se ven menos, pero son las mismas.
    const zoomed = patternFeatures({ ...d, scale: 2 }, 'full');
    expect(zoomed.length).toBeLessThan(base.length);
    const key = (x: { bx: number; by: number }) => `${x.bx},${x.by}`;
    expect(zoomed.every((x) => base.some((y) => key(y) === key(x)))).toBe(true);
    // Otro color base: otras manchas.
    expect(patternFeatures({ ...d, base: '#111111' }, 'full').map(key)).not.toEqual(base.map(key));
    expect(patternFeatures(design('solida'))).toEqual([]);
  });

  it('dos bolas en la misma página no comparten ids (recortes y degradados)', () => {
    const out = renderToString(h(Fragment, null, h(BallArt, { design: design('perlada'), size: 40 }), h(BallArt, { design: design('perlada'), size: 40 })));
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
  });

  it('el texto de las figuras nunca es marcado: solo cifras o letras, aunque el diseño venga roto', () => {
    const evil = {
      ...design('solida'),
      stickers: [
        { shape: 'iniciales', text: '<img src=x onerror=alert(1)>', color: '#ffffff', x: 0, y: 0, size: 0.4, rotation: 0 },
        { shape: 'numero', text: '"><script>alert(1)</script>9', color: '#ffffff', x: 0.3, y: 0.3, size: 0.3, rotation: 0 },
        { shape: 'estrella', text: '<b>hola</b>', color: '#ffffff" onload="alert(1)', x: 0, y: 0, size: 0.3, rotation: 0 },
      ],
    } as unknown as BallDesign;
    const out = art(evil, 160);
    expect(out).not.toMatch(/<img|<script|<b>|onerror|onload|alert/i);
    // Las iniciales quedan en 3 letras y el número en sus cifras.
    expect(out).toContain('>IMG</text>');
    expect(out).toContain('>19</text>');
    expect(() => paint(out, 160, '#ffffff')).not.toThrow();
  });

  it('se ve sobre el fondo claro y el oscuro a 24, 40, 64 y 160 px (también negra en oscuro y blanca en claro)', () => {
    const balls = [design('solida', { base: '#111827' }), design('solida', { base: '#f8fafc' }), design('galaxia', { base: '#0b1026' }), design('jaspeada')];
    for (const d of balls) {
      for (const size of SIZES) {
        for (const bg of ['#ffffff', '#f1f5f9', '#0f172a', '#000000']) {
          expect(edgeContrast(art(d, size), size, bg), `${d.base} ${d.pattern} ${size}px sobre ${bg}`).toBeGreaterThan(0.12);
        }
      }
    }
  });

  it('smoothPath: una curva por los puntos (abierta o cerrada)', () => {
    expect(smoothPath([[0, 0], [10, 0], [20, 10]], false)).toMatch(/^M0 0C.*20 10$/);
    expect(smoothPath([[0, 0], [10, 0], [10, 10]], true)).toMatch(/Z$/);
  });
});
