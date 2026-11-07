import { describe, expect, it } from 'vitest';
import { makeLook } from '../../badges/visual/look';
import { GLOW_ALPHA, badgeVars, paintBadge, pathBox, type PaintedElement } from './paint';

const look = makeLook({ shape: 'hex', tier: 'oro', sport: 'bowling', icon: 'sport' });
const flat = (els: readonly PaintedElement[]): PaintedElement[] => els.flatMap((e) => [e, ...flat(e.children ?? [])]);
const values = (els: readonly PaintedElement[]) => flat(els).flatMap((e) => Object.values(e.attrs).map(String));

describe('una insignia para react-native-svg (paint.ts)', () => {
  it('sin variables CSS: el borde del metal cambia con el tema', () => {
    const light = paintBadge(look, { size: 64, dark: false, suffix: 'x1' });
    const dark = paintBadge(look, { size: 64, dark: true, suffix: 'x1' });
    expect(values(light.nodes).some((v) => v.includes('var('))).toBe(false);
    expect(values(light.nodes)).toContain('#855A06');
    expect(values(dark.nodes)).toContain('#F6CF63');
  });

  it('cada dibujo lleva solo los degradados y recortes que usa, con su sufijo', () => {
    const p = paintBadge(look, { size: 64, dark: false, suffix: 'x1' });
    const ids = p.defs.map((d) => d.attrs.id);
    expect(ids).toContain('mm-tier-oro-x1');
    expect(ids).not.toContain('mm-tier-plata-x1');
    const refs = values(p.nodes).filter((v) => v.startsWith('url(#'));
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(ids).toContain(r.slice(5, -1));
  });

  it('bloqueada con los colores de la app; «Nueva» con el acento al 35 %', () => {
    const locked = paintBadge(look, { size: 64, state: 'locked', dark: false, colors: { surface2: '#111111', muted: '#222222' }, suffix: 'x2' });
    expect(values(locked.nodes)).toEqual(expect.arrayContaining(['#111111', '#222222']));
    const fresh = paintBadge(look, { size: 64, state: 'new', pad: true, dark: false, colors: { accent: '#00aa00' }, suffix: 'x3' });
    const ring = flat(fresh.nodes).find((e) => e.attrs.stroke === '#00aa00' && e.attrs.strokeOpacity === GLOW_ALPHA);
    expect(ring?.tag).toBe('circle');
    expect(badgeVars(true)['--bd-lock-fill']).toBe('#1e222d');
  });

  it('la animación marca sus capas con su centro, y las partículas hacia dónde salen', () => {
    const p = paintBadge(look, { size: 128, px: 220, animate: true, dark: false, suffix: 'x4' });
    const layers = flat(p.nodes).filter((e) => e.cls);
    expect(new Set(layers.map((e) => e.cls))).toEqual(new Set(['bd-a-all', 'bd-a-lock', 'bd-a-on', 'bd-a-band', 'bd-a-part']));
    expect(layers.find((e) => e.cls === 'bd-a-part')?.drift).toHaveLength(2);
    expect(pathBox('M4 88H124L117 98L124 108H4L11 98Z')).toEqual({ x: 64, y: 98 });
    expect(pathBox('M0 0a2 2 0 1 0 4 0')).toBeNull();
  });
});
