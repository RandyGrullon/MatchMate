/**
 * Colores de las insignias (docs/insignias.md §4.3): cada par nivel × deporte se lee. Texto blanco sobre la cinta 7:1
 * o más (AAA; AA pide 4.5), emblema blanco sobre el campo 4.5:1, bisel contra el campo 3:1 y borde contra toda
 * superficie 3:1 en los dos temas. El generador de colores de liga se prueba con 500 colores al azar.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPORT_COLORS, contrastRatio } from '../../components/share/palette';
import { BRAND_FIELD, SURFACES, TIERS, TIER_ORDER, TOKENS, badgePaletteFrom, badgeThemeVars, resolvePalette, rimToken, tierDot } from './palette';

const WHITE = '#ffffff';
const FIELDS = [...Object.values(SPORT_COLORS), BRAND_FIELD];
const worst = (c: string, list: readonly string[]) => Math.min(...list.map((s) => contrastRatio(c, s)));

describe('metales', () => {
  it('los valores de la tabla de §4.3', () => {
    expect(TIER_ORDER).toEqual(['bronce', 'plata', 'oro', 'platino', 'diamante']);
    expect(TIER_ORDER.map((t) => [TIERS[t].hi, TIERS[t].mid, TIERS[t].lo, TIERS[t].rimL, TIERS[t].rimD, TIERS[t].ribbon])).toEqual([
      ['#F3C9A1', '#C27C44', '#8A4B22', '#7A4019', '#E9B084', '#6E3812'],
      ['#F5F7FA', '#B7C0CB', '#768291', '#5B6675', '#D5DCE5', '#475262'],
      ['#FFE8A0', '#E2B03A', '#A77412', '#855A06', '#F6CF63', '#6F4A04'],
      ['#EFF8F7', '#A6CEC9', '#5A8C87', '#3F6F6A', '#BFE3DE', '#2D5A56'],
      ['#E4F3FF', '#86C6FF', '#5A67EE', '#4338CA', '#A5D8FF', '#312E81'],
    ]);
    expect(TIER_ORDER.map((t) => TIERS[t].level)).toEqual([1, 2, 3, 4, 5]);
  });

  it('texto blanco sobre la cinta: 7:1 o más en todos los niveles (pasa AA de sobra)', () => {
    for (const t of TIER_ORDER) expect(contrastRatio(WHITE, TIERS[t].ribbon), t).toBeGreaterThanOrEqual(7);
    // Los valores de la tabla.
    expect(TIER_ORDER.map((t) => contrastRatio(WHITE, TIERS[t].ribbon).toFixed(2))).toEqual(['9.39', '7.92', '7.90', '7.75', '11.42']);
  });

  it('borde claro 3:1 contra toda superficie clara y borde oscuro contra toda superficie oscura', () => {
    for (const t of TIER_ORDER) {
      expect(worst(TIERS[t].rimL, SURFACES.light), t).toBeGreaterThanOrEqual(3);
      expect(worst(TIERS[t].rimD, SURFACES.dark), t).toBeGreaterThanOrEqual(3);
    }
    expect(TIER_ORDER.map((t) => worst(TIERS[t].rimL, SURFACES.light).toFixed(2))).toEqual(['7.15', '5.11', '5.32', '4.98', '6.93']);
    expect(TIER_ORDER.map((t) => worst(TIERS[t].rimD, SURFACES.dark).toFixed(2))).toEqual(['8.33', '11.50', '10.61', '11.54', '10.49']);
  });

  it('bisel (hi) contra todo campo de deporte: 3:1 o más; el peor es bronce sobre tenis', () => {
    let min = Infinity;
    let pair = '';
    for (const t of TIER_ORDER) {
      for (const f of FIELDS) {
        const c = contrastRatio(TIERS[t].hi, f);
        expect(c, `${t} sobre ${f}`).toBeGreaterThanOrEqual(3);
        if (c < min) [min, pair] = [c, `${t} ${f}`];
      }
    }
    expect(pair).toBe(`bronce ${SPORT_COLORS.tennis}`);
    expect(min.toFixed(2)).toBe('3.25');
  });

  it('emblema blanco sobre cada campo: 4.5:1 o más (el peor es tenis, 4.99)', () => {
    for (const f of FIELDS) expect(contrastRatio(WHITE, f), f).toBeGreaterThanOrEqual(4.5);
    expect(worst(WHITE, FIELDS).toFixed(2)).toBe('4.99');
  });

  it('bloqueadas: la línea y el emblema gris se leen sobre el relleno en los dos temas', () => {
    for (const m of ['light', 'dark'] as const) {
      expect(contrastRatio(TOKENS.lockLine[m], TOKENS.lockFill[m]), m).toBeGreaterThanOrEqual(4.5);
      expect(worst(TOKENS.lockLine[m], SURFACES[m]), m).toBeGreaterThanOrEqual(3);
    }
  });

  it('index.css declara los mismos bordes que la paleta, en claro y en oscuro', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n').toLowerCase();
    const block = (head: string) => {
      const i = css.indexOf(head);
      expect(i, head).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    const light = block(':root {\n  --bd-rim-bronce');
    const darkAuto = block(':root:not([data-theme="light"]) {\n    --bd-rim-bronce');
    const darkForced = block(':root[data-theme="dark"] {\n  --bd-rim-bronce');
    for (const t of TIER_ORDER) {
      expect(light, t).toContain(`--bd-rim-${t}: ${TIERS[t].rimL.toLowerCase()};`);
      expect(darkAuto, t).toContain(`--bd-rim-${t}: ${TIERS[t].rimD.toLowerCase()};`);
      expect(darkForced, t).toContain(`--bd-rim-${t}: ${TIERS[t].rimD.toLowerCase()};`);
    }
    expect(css).toContain('--bd-glow: color-mix(in srgb, var(--accent) 35%, transparent);');
  });

  it('recuadros que fuerzan un tema: bordes y sombra de ese tema', () => {
    const l = badgeThemeVars('light');
    const d = badgeThemeVars('dark');
    for (const t of TIER_ORDER) {
      expect(l[`--bd-rim-${t}`]).toBe(TIERS[t].rimL);
      expect(d[`--bd-rim-${t}`]).toBe(TIERS[t].rimD);
    }
    expect([l['--bd-l'], l['--bd-d'], d['--bd-l'], d['--bd-d']]).toEqual(['1', '0', '0', '1']);
    expect(d['--bd-shadow']).toBe('none');
    expect(rimToken('oro')).toEqual({ css: 'var(--bd-rim-oro)', light: '#855A06', dark: '#F6CF63' });
  });
});

describe('paleta resuelta', () => {
  it('«única» se pinta en oro, sin dejar de ser única; el campo es el del deporte', () => {
    const p = resolvePalette({ tier: 'unico', field: SPORT_COLORS.golf });
    expect(p.tier).toBe('oro');
    expect(p.unico).toBe(true);
    expect(p.gradient).toBe('mm-tier-oro');
    expect(p.field).toBe(SPORT_COLORS.golf);
    expect(resolvePalette({ tier: 'plata', field: '' }).field).toBe(BRAND_FIELD);
  });

  it('un color de liga trae su propio degradado y campo ajustado; un color que no sirve cae a la marca', () => {
    const p = resolvePalette({ tier: { custom: '#facc15' }, field: SPORT_COLORS.bowling }, 'mm-gc-x');
    expect(p.tier).toBeNull();
    expect(p.gradient).toBe('mm-gc-x');
    expect(p.field).toBe('#8a700c');
    expect(resolvePalette({ tier: { custom: 'amarillo' }, field: '#000000' }).mid).toBe(BRAND_FIELD);
    expect(tierDot('unico')).toBe(TIERS.oro.mid);
    expect(tierDot({ custom: '#0d9488' })).toBe('#0d9488');
  });
});

describe('colores de liga (badgePaletteFrom)', () => {
  it('los ejemplos de §4.3', () => {
    expect(badgePaletteFrom('#facc15')).toMatchObject({ field: '#8a700c', ribbon: '#645208', adjusted: true });
    expect(badgePaletteFrom('#22d3ee')).toMatchObject({ field: '#147f8f', ribbon: '#0f5f6b', adjusted: true });
    // Un color que ya se lee con blanco no se toca.
    expect(badgePaletteFrom('#4338CA')).toMatchObject({ mid: '#4338ca', field: '#4338ca', adjusted: false });
    expect(badgePaletteFrom('#0d9488')?.hi).toBe('#9ed4cf');
    expect(badgePaletteFrom('#0d9488')?.lo).toBe('#086058');
  });

  it('solo #rrggbb', () => {
    expect(badgePaletteFrom('rojo')).toBeNull();
    expect(badgePaletteFrom('#fff')).toBeNull();
    expect(badgePaletteFrom('0d9488')?.mid).toBe('#0d9488');
  });

  it('500 colores al azar: campo 4.5:1, cinta 7:1, bordes 3:1 en los dos temas', () => {
    // Semilla fija: la prueba da lo mismo siempre.
    let seed = 20260929;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const hex = () => `#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}`;
    for (let i = 0; i < 500; i++) {
      const c = i === 0 ? '#ffffff' : i === 1 ? '#000000' : hex();
      const p = badgePaletteFrom(c)!;
      expect(contrastRatio(WHITE, p.field), `${c} campo`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(WHITE, p.ribbon), `${c} cinta`).toBeGreaterThanOrEqual(7);
      expect(worst(p.rimL, SURFACES.light), `${c} borde claro`).toBeGreaterThanOrEqual(3);
      expect(worst(p.rimD, SURFACES.dark), `${c} borde oscuro`).toBeGreaterThanOrEqual(3);
      expect(p.adjusted).toBe(p.field !== c);
    }
  });
});
