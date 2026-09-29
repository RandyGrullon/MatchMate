/**
 * Geometría de las insignias (docs/insignias.md §4.2, §4.6 a §4.8): qué se pinta en cada tamaño y estado, trazos de
 * 1.5 px reales o más, y que nada se sale de la caja de 128 (se revisa pintando con resvg).
 */
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { BADGE_SIZES, SHAPES, SHAPE_ORDER, SIZE_DETAIL, badgeModel, progressArc, type BadgeNode } from './geometry';
import { TIER_ORDER } from './palette';
import { periodRibbon } from './period';
import { badgeSvg } from './svg';
import type { BadgeLook, BadgeLookTier, BadgeShape, BadgeSize, BadgeState } from './types';

const look = (shape: BadgeShape, tier: BadgeLookTier = 'oro', extra: Partial<BadgeLook> = {}): BadgeLook => ({
  shape,
  tier,
  field: '#15803d',
  icon: 'football',
  pips: 3,
  origin: 'app',
  ...extra,
});
const MONTH = periodRibbon({ kind: 'month', year: 2026, month: 10 });

/** Todas las figuras, entrando en los grupos. */
function flat(nodes: readonly BadgeNode[]): BadgeNode[] {
  return nodes.flatMap((n) => (n.t === 'group' ? [n, ...flat(n.children)] : [n]));
}
const texts = (nodes: readonly BadgeNode[]) => flat(nodes).flatMap((n) => (n.t === 'text' ? [n.text] : []));
const icons = (nodes: readonly BadgeNode[]) => flat(nodes).flatMap((n) => (n.t === 'icon' ? [n.key] : []));
const pips = (nodes: readonly BadgeNode[]) => flat(nodes).filter((n) => n.t === 'circle' && n.fill === '#ffffff' && (n.r === 4.5 || n.r === 3.4)).length;
const classes = (nodes: readonly BadgeNode[]) => flat(nodes).flatMap((n) => (n.cls ? [n.cls] : []));

/** Píxeles pintados fuera del cuadro [lo, hi] (en unidades del viewBox) al pintar con aire alrededor. */
function paintedOutside(svg: string, lo: number, hi: number): number {
  const M = 24;
  const S = 4; // píxeles por unidad
  const padded = svg
    .replace(/viewBox="[^"]+"/, `viewBox="${-M} ${-M} ${128 + 2 * M} ${128 + 2 * M}"`)
    .replace(/width="[^"]+" height="[^"]+"/, `width="${(128 + 2 * M) * S}" height="${(128 + 2 * M) * S}"`);
  const img = new Resvg(padded, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render();
  const { width, pixels } = img;
  let n = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 24) continue;
    const p = (i - 3) / 4;
    const x = (p % width) / S - M;
    const y = Math.floor(p / width) / S - M;
    if (x < lo || x > hi || y < lo || y > hi) n++;
  }
  return n;
}

describe('formas', () => {
  it('las siete, con su recorte, su caja de emblema y sus puntos dentro de la caja', () => {
    expect(SHAPE_ORDER).toEqual(['hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square']);
    for (const s of SHAPE_ORDER) {
      const g = SHAPES[s];
      expect(g.outer, s).toMatch(/^M.*Z$/);
      expect(!!g.k !== !!g.field, `${s}: campo por escala o camino propio`).toBe(true);
      for (const [cx, cy, size] of [g.emb.plain, g.emb.rib, g.emb.pips, ...(g.emb.ribPips ? [g.emb.ribPips] : [])]) {
        expect(cx - size / 2, s).toBeGreaterThanOrEqual(8);
        expect(cx + size / 2, s).toBeLessThanOrEqual(120);
        expect(cy - size / 2, s).toBeGreaterThanOrEqual(8);
        expect(cy + size / 2, s).toBeLessThanOrEqual(120);
      }
      // Con cinta, los puntos van arriba (si caben) o no van.
      expect(g.pipTopY === null, s).toBe(g.emb.ribPips === null);
    }
  });

  it('el escudo es el camino de §4.2 y el cuadrado tiene las esquinas del ícono de la app', () => {
    expect(SHAPES.shield.outer).toBe('M64 4L116 18V58C116 94 92 114 64 124C36 114 12 94 12 58V18Z');
    expect(SHAPES.square.outer).toContain('A26 26');
  });
});

describe('tamaños (§4.6)', () => {
  const full = look('circle', 'oro', { period: MONTH, notches: 8, top: 'TORNEO' });

  it('24 px: borde, marco, campo y emblema; sin bisel, brillo, cinta ni puntos', () => {
    const { nodes } = badgeModel(full, { size: 24 });
    expect(texts(nodes)).toEqual([]);
    expect(pips(nodes)).toBe(0);
    expect(flat(nodes).some((n) => n.t === 'ellipse')).toBe(false);
    expect(classes(nodes)).not.toContain('bd-a-ribbon');
    expect(icons(nodes)).toEqual(['football']);
  });

  it('40 px: bisel, brillo y la cinta como franja sin texto', () => {
    const { nodes } = badgeModel(full, { size: 40 });
    expect(classes(nodes)).toContain('bd-a-ribbon');
    expect(texts(nodes)).toEqual([]);
    expect(pips(nodes)).toBe(0);
    expect(flat(nodes).some((n) => n.t === 'ellipse')).toBe(true);
  });

  it('64 px: puntos de nivel y la cinta corta', () => {
    const { nodes } = badgeModel(full, { size: 64 });
    expect(texts(nodes)).toEqual(['OCT 26']);
    expect(pips(nodes)).toBe(3);
  });

  it('128 px: todo (cinta larga, banda de arriba y la marquita Dúo)', () => {
    const { nodes } = badgeModel(full, { size: 128 });
    expect(texts(nodes)).toEqual(['OCT 2026', 'TORNEO']);
    expect(pips(nodes)).toBe(3);
    expect(flat(nodes).some((n) => n.t === 'group' && n.move)).toBe(true);
    // Las del creador llevan la pestaña «LIGA» en vez de la marquita.
    const liga = badgeModel({ ...full, origin: 'liga' }, { size: 128 }).nodes;
    expect(texts(liga)).toContain('LIGA');
    expect(flat(liga).some((n) => n.t === 'group' && n.move)).toBe(false);
  });

  it('cada tamaño suma detalle sobre el anterior', () => {
    const on = (d: (typeof SIZE_DETAIL)[BadgeSize]) => Object.values(d).filter((v) => v && v !== 'none').length;
    const counts = BADGE_SIZES.map((s) => on(SIZE_DETAIL[s]));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(SIZE_DETAIL[24].ribbon).toBe('none');
    expect(SIZE_DETAIL[40].ribbon).toBe('strip');
    expect(SIZE_DETAIL[64].ribbon).toBe('short');
    expect(SIZE_DETAIL[128].ribbon).toBe('long');
  });

  it('trazos de 1.5 px reales o más en todos los tamaños (borde y emblema)', () => {
    for (const size of BADGE_SIZES) {
      for (const px of [size, size * 1.5]) {
        const scene = badgeModel(look('hex'), { size, px });
        const k = px / scene.viewBox[2];
        for (const n of flat(scene.nodes)) {
          if (n.t === 'path' && n.stroke && typeof n.stroke === 'object' && 'css' in n.stroke) expect(n.width! * k, `borde a ${px}`).toBeGreaterThanOrEqual(1.49);
          if (n.t === 'icon') expect(n.width * n.k * k, `emblema a ${px}`).toBeGreaterThanOrEqual(1.49);
        }
      }
    }
  });

  it('la corta que no cabe en 7 usa la larga si cabe; si no, cinta sin texto', () => {
    expect(texts(badgeModel(look('shield', 'oro', { period: { long: 'COPA', short: '' } }), { size: 64 }).nodes)).toEqual(['COPA']);
    expect(texts(badgeModel(look('shield', 'oro', { period: { long: 'LOS PINOS', short: '' } }), { size: 64 }).nodes)).toEqual([]);
    // Un texto que no cabe se aprieta al ancho de la cinta.
    const wide = flat(badgeModel(look('shield', 'oro', { period: { long: 'MMMMMMMMMM', short: '' } }), { size: 128 }).nodes).find((n) => n.t === 'text');
    expect(wide).toMatchObject({ text: 'MMMMMMMMMM', fit: 96 });
    const ok = flat(badgeModel(look('shield', 'oro', { period: periodRibbon({ kind: 'season', startsOn: '2026-09-01', endsOn: '2027-06-01' }) }), { size: 128 }).nodes).find((n) => n.t === 'text');
    expect(ok).toMatchObject({ text: 'TEMP 26/27', fit: undefined });
  });
});

describe('adornos del nivel (§4.3)', () => {
  const circles = (nodes: readonly BadgeNode[]) => flat(nodes).filter((n) => n.t === 'circle');

  it('oro: 3 tachas desde 64 px (la única, sin tachas ni puntos)', () => {
    const studs = (l: BadgeLook, size: BadgeSize) => circles(badgeModel(l, { size }).nodes).filter((n) => n.t === 'circle' && n.fill === '#FFE8A0').length;
    expect(studs(look('hex'), 64)).toBe(3);
    expect(studs(look('hex'), 40)).toBe(0);
    expect(studs(look('hex', 'unico'), 128)).toBe(0);
    expect(pips(badgeModel(look('hex', 'unico', { pips: 3 }), { size: 128 }).nodes)).toBe(0);
  });

  it('platino: bisel doble; diamante: facetas desde 64 y destellos a 128', () => {
    const hiStrokes = (tier: BadgeLookTier) => flat(badgeModel(look('hex', tier), { size: 64 }).nodes).filter((n) => n.t === 'path' && n.stroke === '#EFF8F7').length;
    expect(hiStrokes('platino')).toBe(2);
    const facets = (size: BadgeSize) => flat(badgeModel(look('hex', 'diamante'), { size }).nodes).filter((n) => n.t === 'path' && n.fill === '#B197FC').length;
    expect([facets(40), facets(64)]).toEqual([0, 1]);
    const sparkles = (size: BadgeSize) => flat(badgeModel(look('hex', 'diamante'), { size }).nodes).filter((n) => n.t === 'path' && n.fill === '#ffffff').length;
    expect([sparkles(64), sparkles(128)]).toEqual([0, 2]);
  });

  it('puntos: tantos como el nivel, desde 64 px', () => {
    for (const [i, t] of TIER_ORDER.entries()) {
      const p = (i + 1) as BadgeLook['pips'];
      expect(pips(badgeModel(look('hex', t, { pips: p }), { size: 64 }).nodes), t).toBe(i + 1);
      expect(pips(badgeModel(look('hex', t, { pips: p }), { size: 40 }).nodes), t).toBe(0);
    }
  });

  it('racha: muescas en el círculo (hasta 12)', () => {
    const notches = (n: number) => flat(badgeModel(look('circle', 'oro', { notches: n }), { size: 64 }).nodes).find((x) => x.t === 'path' && x.cap === 'round' && x.d.startsWith('M'));
    expect((notches(8) as { d: string }).d.match(/M/g)).toHaveLength(8);
    expect((notches(30) as { d: string }).d.match(/M/g)).toHaveLength(12);
  });

  it('color de liga: su propio degradado y un borde por tema', () => {
    const scene = badgeModel(look('shield', { custom: '#db2777' }, { origin: 'liga', period: MONTH }), { size: 64, gradientId: 'mm-gc-t' });
    expect(scene.gradients).toEqual([{ id: 'mm-gc-t', x1: 0, y1: 0, x2: 1, y2: 1, stops: [[0, '#f1a9c9'], [0.45, '#db2777'], [1, '#8e194d']] }]);
    const rims = flat(scene.nodes).filter((n) => n.t === 'path' && n.theme);
    expect(rims.filter((n) => n.t === 'path' && n.theme === 'light').length).toBe(rims.length / 2);
    expect(rims.length).toBeGreaterThanOrEqual(4);
  });
});

describe('estados (§4.7)', () => {
  const model = (state: BadgeState, size: BadgeSize = 64) => badgeModel(look('hex'), { size, state, progress: 0.7, pad: true });

  it('bloqueada: silueta sin metal ni cinta, con candadito desde 40 px', () => {
    const { nodes } = model('locked');
    expect(flat(nodes).some((n) => n.t === 'path' && typeof n.fill === 'object' && 'grad' in n.fill)).toBe(false);
    expect(icons(nodes)).toEqual(['football', 'lock']);
    expect(icons(model('locked', 24).nodes)).toEqual(['football']);
  });

  it('progreso: la silueta más el arco desde las 12', () => {
    const arc = flat(model('progress').nodes).find((n) => n.t === 'path' && n.cap === 'round' && n.d.startsWith('M64 -4'));
    expect(arc).toBeDefined();
    expect(progressArc(0.25)).toBe('M64 -4A68 68 0 0 1 132 64');
    expect(progressArc(0.75)).toBe('M64 -4A68 68 0 1 1 -4 64');
    expect(progressArc(1)).toContain('A68 68 0 1 1 64 132');
    // Sin avance, solo el aro de fondo.
    expect(flat(badgeModel(look('hex'), { size: 64, state: 'progress' }).nodes).filter((n) => n.t === 'path' && n.d.startsWith('M64 -4'))).toHaveLength(0);
  });

  it('nueva: anillo y punto; en revisión: atenuada con reloj; oculta: atenuada con ojo tachado', () => {
    const nw = flat(model('new').nodes);
    expect(nw.filter((n) => n.t === 'circle' && n.r === 68)).toHaveLength(1);
    expect(nw.some((n) => n.t === 'circle' && n.cx === 118 && n.cy === 12)).toBe(true);
    const rv = model('review').nodes;
    expect(rv[0]).toMatchObject({ t: 'group', opacity: 0.6 });
    expect(icons(rv)).toContain('hourglass');
    const hd = model('hidden').nodes;
    expect(hd[0]).toMatchObject({ t: 'group', opacity: 0.45 });
    expect(icons(hd)).toContain('eye-off');
  });
});

describe('animación de desbloqueo (§4.8)', () => {
  it('capas bloqueada y desbloqueada, brillo recortado y partículas del metal', () => {
    const scene = badgeModel(look('star', 'oro', { period: MONTH }), { size: 128, px: 240, animate: true });
    expect(scene.viewBox).toEqual([-36, -36, 200, 200]);
    const cls = classes(scene.nodes);
    for (const c of ['bd-a-all', 'bd-a-lock', 'bd-a-on', 'bd-a-band', 'bd-a-ribbon']) expect(cls).toContain(c);
    expect(cls.filter((c) => c === 'bd-a-part')).toHaveLength(10);
    const diamond = classes(badgeModel(look('star', 'diamante'), { size: 128, animate: true }).nodes).filter((c) => c === 'bd-a-part');
    expect(diamond).toHaveLength(16);
    // Siempre las mismas partículas.
    expect(badgeModel(look('star'), { size: 128, animate: true }).nodes).toEqual(badgeModel(look('star'), { size: 128, animate: true }).nodes);
  });
});

describe('nada se sale de la caja (pintado con resvg)', () => {
  it('toda forma × nivel × tamaño, desbloqueada y bloqueada: dentro de 0–128 (más medio trazo en los chicos)', () => {
    const tiers: BadgeLookTier[] = [...TIER_ORDER, 'unico', { custom: '#22d3ee' }];
    for (const shape of SHAPE_ORDER) {
      for (const tier of tiers) {
        for (const size of BADGE_SIZES) {
          for (const state of ['unlocked', 'locked'] as const) {
            const l = look(shape, tier, { period: shape === 'hex' ? null : MONTH, notches: 12, top: 'TORNEO', origin: typeof tier === 'object' ? 'liga' : 'app' });
            // A 24 y 40 px el borde es más grueso en unidades (1.5 px reales): puede pasar medio trazo.
            const half = Math.max(2, 1.5 * (128 / size)) / 2;
            const out = paintedOutside(badgeSvg(l, { size, state }), -half - 0.5, 128 + half + 0.5);
            expect(out, `${shape} ${JSON.stringify(tier)} ${size} ${state}`).toBe(0);
          }
        }
      }
    }
  }, 120_000);

  it('con aire (pad), los anillos de progreso y «Nueva» caben en el cuadro de 148', () => {
    for (const size of [40, 64, 128] as const) {
      for (const state of ['progress', 'new'] as const) {
        const svg = badgeSvg(look('hex'), { size, state, progress: 0.99, pad: true });
        expect(paintedOutside(svg, -10.5, 138.5), `${size} ${state}`).toBe(0);
      }
    }
  });
});
