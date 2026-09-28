import { BRAND } from '../splash/brand';

/**
 * Colores de las imágenes para compartir. Siempre en claro (la imagen se ve en el chat de WhatsApp, no en la
 * app): fondo del color del deporte con letras blancas, y el cuadro blanco con los colores de siempre.
 */

/** Tinta del cuadro blanco (los mismos valores del modo claro de index.css). */
export const INK = {
  text: '#151822',
  muted: '#646b7a',
  line: '#e7e9ee',
  soft: '#f4f5f8',
  surface: '#ffffff',
  onColor: '#ffffff',
  gold: '#c79a1c',
  silver: '#8a94a3',
  bronze: '#b0703a',
} as const;

/**
 * Color de cada deporte (fondo de la imagen). Todos se leen con letras blancas (contraste 4.5:1 o más, lo revisa
 * palette.test.ts). El boliche va con el morado de la marca.
 */
export const SPORT_COLORS: Readonly<Record<string, string>> = {
  bowling: BRAND.light.accent,
  padel: '#0f766e',
  tennis: '#4d7c0f',
  pickleball: '#0369a1',
  basketball: '#c2410c',
  football: '#15803d',
  futsal: '#1d4ed8',
  golf: '#065f46',
  swimming: '#0e7490',
};

/** Color del deporte (el de la marca si no se conoce). */
export const sportColor = (sport: string | null | undefined): string =>
  sport && Object.hasOwn(SPORT_COLORS, sport) ? SPORT_COLORS[sport] : BRAND.light.accent;

/** Oro, plata y bronce para los 3 primeros (null para el resto). */
export const medalColor = (rank: number | null | undefined): string | null => (rank === 1 ? INK.gold : rank === 2 ? INK.silver : rank === 3 ? INK.bronze : null);

export type ShareTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: readonly number[]) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Mezcla `hex` con blanco (`amount` = cuánto blanco, de 0 a 1): el fondo suave de una insignia. */
export function tint(hex: string, amount: number): string {
  const c = rgb(hex);
  return c ? toHex(c.map((v) => Math.round(v + (255 - v) * clamp01(amount)))) : INK.soft;
}

/** Mezcla `hex` con negro (`amount` = cuánto negro, de 0 a 1). */
export function shade(hex: string, amount: number): string {
  const c = rgb(hex);
  return c ? toHex(c.map((v) => Math.round(v * (1 - clamp01(amount))))) : INK.text;
}

/** Contraste WCAG entre dos colores #rrggbb (de 1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = (rgb(hex) ?? [0, 0, 0]).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` oscurecido lo justo para leerse sobre `bg` (4.5:1, lo del texto chico). */
export function readableOn(fg: string, bg: string, min = 4.5): string {
  for (let k = 0; k <= 10; k++) {
    const c = shade(fg, k / 10);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return INK.text;
}

/**
 * Letra y fondo de una insignia de estado («Final», «Por confirmar»…). `accent` usa el color del deporte. La
 * letra se oscurece lo que haga falta para leerse (4.5:1).
 */
export function toneColors(tone: ShareTone, accent: string): { fg: string; bg: string } {
  const pair = (fg: string, bg: string) => ({ fg: readableOn(fg, bg), bg });
  switch (tone) {
    case 'ok':
      return pair('#1b7f4b', '#e4f5ec');
    case 'warn':
      return pair('#a15c00', '#fdf2df');
    case 'danger':
      return pair('#c62828', '#fdecec');
    case 'accent':
      return pair(accent, tint(accent, 0.88));
    default:
      return pair(INK.muted, '#eef0f4');
  }
}
