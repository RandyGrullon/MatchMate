import { Resvg } from '@resvg/resvg-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLook, TIERS } from '../../badges/visual';
import { badgeShare } from './badge';
import { canPaintBadges, paintBadge, pathBox, withAlpha } from './badgePaint';
import { BADGE_CARD_HEIGHT, buildScene, CARD_WIDTH, type CardFrame } from './cards';
import { paintScene, type Ctx2D } from './paint';
import { contrastRatio, INK, sportColor } from './palette';
import { estimateWidth, type SceneNode } from './scene';
import { sceneToSvg } from './svg';

/** La tarjeta para compartir una insignia (docs/insignias.md §4.9): figura, SVG, PNG y el pintor del canvas. */

const look = makeLook({ shape: 'medal', tier: 'oro', sport: 'bowling', icon: 'star', period: { long: 'SEP 2026', short: 'SEP 26' } });
const input = {
  name: 'Figura del mes',
  look,
  levelLine: 'Oro · Septiembre 2026',
  description: 'Fuiste la figura de Liga Los Pinos en septiembre de 2026: promedio 187 en 12 juegos.',
  player: 'Ana Pérez',
  league: 'Liga Los Pinos',
  footnote: 'Solo el 4 % de los jugadores de boliche la tiene',
  caption: '¡Me gané «Figura del mes» (oro) en MatchMate!',
};
const frame: CardFrame = { sportLabel: 'Boliche', color: sportColor('bowling'), date: '3 oct 2026', link: 'https://matchmate.do/u/abc?tab=insignias' };
const texts = (nodes: SceneNode[]) => nodes.flatMap((n) => (n.t === 'text' ? [n.text] : []));
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tarjeta de una insignia', () => {
  it('el nivel va en el color de la cinta (se lee sobre blanco)', () => {
    const spec = badgeShare(input);
    expect(spec).toMatchObject({ kind: 'badge', title: 'Figura del mes', levelColor: TIERS.oro.ribbon, player: 'Ana Pérez', league: 'Liga Los Pinos' });
    expect(contrastRatio(spec.levelColor, INK.surface)).toBeGreaterThanOrEqual(7);
    expect(badgeShare({ ...input, league: null, footnote: null })).not.toHaveProperty('league');
  });

  it('540 × 675: la insignia a 240, nombre, nivel, descripción, jugador, rareza y link', () => {
    const scene = buildScene(badgeShare(input), frame);
    expect(scene.width).toBe(CARD_WIDTH);
    expect(scene.height).toBe(BADGE_CARD_HEIGHT);
    expect(scene.background).toBe(frame.color);
    expect(scene.nodes.filter((n) => n.t === 'badge')).toEqual([{ t: 'badge', x: 150, y: 88, size: 240, look }]);
    const t = texts(scene.nodes);
    for (const s of ['Figura del mes', 'Oro · Septiembre 2026', 'Ana Pérez', 'Liga Los Pinos', 'Solo el 4 % de los jugadores de boliche la tiene', 'matchmate.do/u/abc', '3 oct 2026'])
      expect(t, s).toContain(s);
    expect(t.some((x) => x.startsWith('Fuiste la figura'))).toBe(true);
    // Todo cabe en el ancho.
    for (const n of scene.nodes) if (n.t === 'text' && n.align === 'center') expect(estimateWidth(n.text, n.size, n.weight)).toBeLessThanOrEqual(CARD_WIDTH);
  });

  it('un nombre largo baja de tamaño', () => {
    const scene = buildScene(badgeShare({ ...input, name: 'Récord personal en el campo de golf del club' }), frame);
    const name = scene.nodes.find((n) => n.t === 'text' && n.y === 368);
    expect(name?.t === 'text' && name.size).toBeLessThan(30);
  });

  it('en SVG la insignia va anidada y pasa a PNG con la insignia pintada', () => {
    const scene = buildScene(badgeShare(input), frame);
    const svg = sceneToSvg(scene);
    expect(svg).toContain('<svg x="150" y="88" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="240" height="240"');
    const img = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, font: { loadSystemFonts: false } }).render();
    expect(img.width).toBe(1080);
    expect(img.height).toBe(1350);
    // `pixels` copia la imagen cada vez que se lee: una sola vez.
    const data = img.pixels;
    const px = (x: number, y: number) => {
      const i = (y * img.width + x) * 4;
      return hex(data[i], data[i + 1], data[i + 2]);
    };
    expect(px(4, 4)).toBe(frame.color.toLowerCase());
    // Dentro del cuadro de la insignia hay dibujo (no todo blanco).
    let painted = 0;
    let total = 0;
    for (let y = 200; y < 650; y += 10)
      for (let x = 320; x < 760; x += 10) {
        total++;
        if (px(x, y) !== '#ffffff') painted++;
      }
    expect(painted / total).toBeGreaterThan(0.3);
  });
});

describe('pintor de la insignia (canvas)', () => {
  it('caja de un camino: absolutos, relativos y arcos', () => {
    expect(pathBox('M10 20L30 40Z')).toEqual([10, 20, 20, 20]);
    expect(pathBox('M10 10h20v5H0')).toEqual([0, 10, 30, 5]);
    const circle = pathBox('M54 64a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z')!;
    expect(circle[0]).toBeLessThanOrEqual(54);
    expect(circle[1]).toBeLessThanOrEqual(54);
    expect(circle[0] + circle[2]).toBeGreaterThanOrEqual(74);
    expect(pathBox('')).toBeNull();
    expect(withAlpha('#ffffff', 0.35)).toBe('rgba(255, 255, 255, 0.35)');
    expect(withAlpha('oro', 0.5)).toBe('oro');
  });

  it('sin Path2D no pinta (la tarjeta queda con el texto) y no truena', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : typeof k === 'string' && k !== 'then' ? (...a: unknown[]) => calls.push(`${k}${a.length}`) : undefined), set: () => true });
    expect(canPaintBadges(ctx)).toBe(false);
    expect(paintBadge(ctx, look, 0, 0, 240)).toBe(false);
    expect(() => paintScene(ctx as unknown as Ctx2D, buildScene(badgeShare(input), frame))).not.toThrow();
    expect(calls.some((c) => c.startsWith('fillText'))).toBe(true);
  });

  it('con Path2D: recorta con la forma, degradado del metal, íconos y texto de la cinta', () => {
    const paths: string[] = [];
    class FakePath2D {
      constructor(d?: string) {
        if (typeof d === 'string') paths.push(d);
      }
      addPath() {}
      arc() {}
      ellipse() {}
      moveTo() {}
      arcTo() {}
      closePath() {}
      rect() {}
    }
    vi.stubGlobal('Path2D', FakePath2D);
    const ops: string[] = [];
    const stops: unknown[][] = [];
    const ctx = {
      fillStyle: '' as unknown,
      strokeStyle: '' as unknown,
      globalAlpha: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      save: () => ops.push('save'),
      restore: () => ops.push('restore'),
      scale: () => ops.push('scale'),
      translate: () => ops.push('translate'),
      rotate: () => ops.push('rotate'),
      beginPath: () => ops.push('beginPath'),
      ellipse: () => ops.push('ellipse'),
      arc: () => ops.push('arc'),
      rect: () => ops.push('rect'),
      fill: () => ops.push('fill'),
      stroke: () => ops.push('stroke'),
      clip: () => ops.push('clip'),
      fillText: (t: string) => ops.push(`text:${t}`),
      measureText: (t: string) => ({ width: t.length * 5 }),
      createLinearGradient: () => ({ addColorStop: (...a: unknown[]) => stops.push(a) }),
    };
    expect(canPaintBadges(ctx)).toBe(true);
    expect(paintBadge(ctx, look, 150, 88, 240)).toBe(true);
    expect(ops.filter((o) => o === 'fill').length).toBeGreaterThan(5);
    expect(ops).toContain('stroke');
    expect(ops).toContain('clip');
    // La cinta «SEP 2026», letra por letra.
    expect(ops.filter((o) => o.startsWith('text:')).join('').replace(/text:/g, '')).toBe('SEP 2026');
    // El degradado del oro (hi, mid, lo).
    expect(stops.map((s) => s[1])).toEqual(expect.arrayContaining([TIERS.oro.hi, TIERS.oro.mid, TIERS.oro.lo]));
    expect(ops.filter((o) => o === 'save').length).toBe(ops.filter((o) => o === 'restore').length);
    expect(paths.length).toBeGreaterThan(3);
  });
});
