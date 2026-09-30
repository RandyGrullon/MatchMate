import { describe, expect, it } from 'vitest';
import { BRAND } from '../splash/brand';
import { INK, SPORT_COLORS, contrastRatio, medalColor, readableOn, shade, sportColor, tint, toneColors } from './palette';

/** Contraste WCAG entre dos colores #rrggbb. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('colores de las imágenes', () => {
  it('cada deporte tiene color y todos se leen con letras blancas', () => {
    for (const id of ['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'table_tennis']) {
      const c = SPORT_COLORS[id];
      expect(c, id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(c, INK.onColor), id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('los deportes se distinguen entre sí (ninguno repite color)', () => {
    const values = Object.values(SPORT_COLORS).map((c) => c.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  it('el boliche y lo que no se conoce van con el morado de la marca', () => {
    expect(sportColor('bowling')).toBe(BRAND.light.accent);
    expect(sportColor('ajedrez')).toBe(BRAND.light.accent);
    expect(sportColor(null)).toBe(BRAND.light.accent);
    expect(sportColor('constructor')).toBe(BRAND.light.accent);
    expect(sportColor('padel')).toBe(SPORT_COLORS.padel);
  });

  it('la tinta del cuadro blanco se lee (texto normal y gris)', () => {
    expect(contrast(INK.text, INK.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(INK.muted, INK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('medallas para los 3 primeros, con el número blanco legible', () => {
    expect([1, 2, 3, 4, null, undefined].map(medalColor)).toEqual([INK.gold, INK.silver, INK.bronze, null, null, null]);
    for (const m of [INK.gold, INK.silver, INK.bronze]) expect(contrast(m, INK.onColor)).toBeGreaterThanOrEqual(2.5);
  });

  it('mezclar con blanco: 0 = igual, 1 = blanco; un color que no se entiende da el gris suave', () => {
    expect(tint('#0f766e', 0)).toBe('#0f766e');
    expect(tint('#0f766e', 1)).toBe('#ffffff');
    expect(tint('#000000', 0.5)).toBe('#808080');
    expect(tint('0f766e', 2)).toBe('#ffffff');
    expect(tint('rojo', 0.5)).toBe(INK.soft);
  });

  it('insignias de estado: letras legibles sobre su fondo con cualquier deporte; «accent» con su color', () => {
    for (const sport of Object.keys(SPORT_COLORS)) {
      for (const tone of ['neutral', 'accent', 'ok', 'warn', 'danger'] as const) {
        const { fg, bg } = toneColors(tone, SPORT_COLORS[sport]);
        expect(contrast(fg, bg), `${sport} ${tone}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // El azul ya se lee: queda igual. El verde del fútbol se oscurece un poco.
    expect(toneColors('accent', '#1d4ed8').fg).toBe('#1d4ed8');
    const green = toneColors('accent', SPORT_COLORS.football).fg;
    expect(green).not.toBe(SPORT_COLORS.football);
    expect(green).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('contraste, oscurecer y hacer legible', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
    expect(contrastRatio(SPORT_COLORS.padel, '#ffffff')).toBeCloseTo(contrast(SPORT_COLORS.padel, '#ffffff'));
    expect(shade('#ffffff', 0.5)).toBe('#808080');
    expect(shade('#123456', 0)).toBe('#123456');
    expect(shade('nada', 0.5)).toBe(INK.text);
    expect(readableOn('#ffffff', '#ffffff')).toBe('#666666');
    expect(readableOn('#1d4ed8', '#ffffff')).toBe('#1d4ed8');
  });
});
