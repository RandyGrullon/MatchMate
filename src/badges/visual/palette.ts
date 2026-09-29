/**
 * Colores de las insignias (docs/insignias.md §4.3). El degradado del metal es igual en claro y en oscuro; solo cambia
 * el borde (claro: el tono oscuro del nivel; oscuro: el claro), con las variables --bd-* de index.css. Todo texto va
 * sobre un color sólido (la cinta), así el contraste no depende del modo. palette.test.ts revisa cada par.
 */
import { contrastRatio, shade, tint } from '../../components/share/palette';
import type { BadgeLook, BadgeTier } from './types';

export interface TierPalette {
  key: BadgeTier;
  /** Nombre del nivel («Oro»). */
  name: string;
  /** Degradado del marco a 135°: `hi` 0 %, `mid` 45 %, `lo` 100 %. `hi` es también el bisel. */
  hi: string;
  mid: string;
  lo: string;
  /** Borde en modo claro (3:1 o más contra toda superficie clara de la app). */
  rimL: string;
  /** Borde en modo oscuro (3:1 o más contra toda superficie oscura). */
  rimD: string;
  /** Cinta y banda de arriba: el blanco encima pasa 7:1. */
  ribbon: string;
  /** Nivel del 1 (bronce) al 5 (diamante): los puntos que lleva. */
  level: 1 | 2 | 3 | 4 | 5;
}

export const TIERS: Readonly<Record<BadgeTier, TierPalette>> = {
  bronce: { key: 'bronce', name: 'Bronce', hi: '#F3C9A1', mid: '#C27C44', lo: '#8A4B22', rimL: '#7A4019', rimD: '#E9B084', ribbon: '#6E3812', level: 1 },
  plata: { key: 'plata', name: 'Plata', hi: '#F5F7FA', mid: '#B7C0CB', lo: '#768291', rimL: '#5B6675', rimD: '#D5DCE5', ribbon: '#475262', level: 2 },
  oro: { key: 'oro', name: 'Oro', hi: '#FFE8A0', mid: '#E2B03A', lo: '#A77412', rimL: '#855A06', rimD: '#F6CF63', ribbon: '#6F4A04', level: 3 },
  platino: { key: 'platino', name: 'Platino', hi: '#EFF8F7', mid: '#A6CEC9', lo: '#5A8C87', rimL: '#3F6F6A', rimD: '#BFE3DE', ribbon: '#2D5A56', level: 4 },
  diamante: { key: 'diamante', name: 'Diamante', hi: '#E4F3FF', mid: '#86C6FF', lo: '#5A67EE', rimL: '#4338CA', rimD: '#A5D8FF', ribbon: '#312E81', level: 5 },
};

export const TIER_ORDER: readonly BadgeTier[] = ['bronce', 'plata', 'oro', 'platino', 'diamante'];

/** Nombre de cada nivel; «Única» para las de un solo nivel. */
export const TIER_LABEL: Readonly<Record<BadgeTier | 'unico', string>> = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
  platino: 'Platino',
  diamante: 'Diamante',
  unico: 'Única',
};

/** Campo de las insignias de varios deportes o de cuenta: el morado de la marca. */
export const BRAND_FIELD = '#4338ca';
/** Facetas del diamante (al 35 %). */
export const FACET = '#B197FC';
/** Pestaña «LIGA» de las insignias del creador. */
export const LEAGUE_TAB = '#312E81';

/** Superficies de la app (src/index.css): contra ellas se miden los bordes. */
export const SURFACES = {
  light: ['#ffffff', '#f4f5f8', '#eef0f4'],
  dark: ['#161922', '#0d0f15', '#1e222d'],
} as const;

/**
 * Un color que cambia con el tema: React usa la variable CSS (`css`); el canvas de compartir (siempre claro) y el
 * SVG de texto de las pruebas usan el valor resuelto. `alpha` es la opacidad que la variable ya trae.
 */
export interface ThemeColor {
  css: string;
  light: string;
  dark: string;
  alpha?: number;
}

/** Tokens del tema que usan las insignias (§4.3 y §4.7), con sus valores de index.css. */
export const TOKENS = {
  lockFill: { css: 'var(--bd-lock-fill)', light: '#eef0f4', dark: '#1e222d' },
  lockLine: { css: 'var(--bd-lock-line)', light: '#646b7a', dark: '#9aa1b0' },
  muted: { css: 'var(--muted)', light: '#646b7a', dark: '#9aa1b0' },
  surface: { css: 'var(--surface)', light: '#ffffff', dark: '#161922' },
  line: { css: 'var(--line)', light: '#e2e5eb', dark: '#2a2f3b' },
  accent: { css: 'var(--accent)', light: '#4338ca', dark: '#8b8cf6' },
  glow: { css: 'var(--bd-glow)', light: '#4338ca', dark: '#8b8cf6', alpha: 0.35 },
} as const satisfies Record<string, ThemeColor>;

/** Borde de un nivel: la variable --bd-rim-<nivel> de index.css. */
export const rimToken = (tier: BadgeTier): ThemeColor => ({ css: `var(--bd-rim-${tier})`, light: TIERS[tier].rimL, dark: TIERS[tier].rimD });

/** Paleta que sale de un color libre o de la liga (solo en el creador). */
export interface CustomPalette {
  hi: string;
  mid: string;
  lo: string;
  /** Campo: el color oscurecido hasta que el blanco dé 4.5:1. */
  field: string;
  /** Cinta: oscurecido hasta 7:1 con el blanco. */
  ribbon: string;
  /** Borde claro: oscurecido hasta 3:1 contra #eef0f4 (la superficie clara más oscura). */
  rimL: string;
  /** Borde oscuro: aclarado hasta 3:1 contra #1e222d (la superficie oscura más clara). */
  rimD: string;
  /** Hubo que cambiar el tono: el editor dice «Ajustamos el tono para que se lea bien». */
  adjusted: boolean;
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** Acerca `hex` a negro (o a blanco) en pasos de 5 % hasta llegar a `min` contra `against` (como `readable` de lib/theme). */
function adjust(hex: string, against: string, min: number, toward: 'black' | 'white'): string {
  for (let i = 0; i <= 20; i++) {
    const c = toward === 'black' ? shade(hex, i / 20) : tint(hex, i / 20);
    if (contrastRatio(c, against) >= min) return c;
  }
  return toward === 'black' ? '#000000' : '#ffffff';
}

/**
 * Paleta de insignia a partir de un color (§4.3): `hi = tint(c, .6)`, `mid = c`, `lo = shade(c, .35)`, y el campo,
 * la cinta y los bordes ajustados para leerse. null si el color no es #rrggbb.
 */
export function badgePaletteFrom(hex: string): CustomPalette | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const c = `#${m[1].toLowerCase()}`;
  const field = adjust(c, '#ffffff', 4.5, 'black');
  return {
    hi: tint(c, 0.6),
    mid: c,
    lo: shade(c, 0.35),
    field,
    ribbon: adjust(c, '#ffffff', 7, 'black'),
    rimL: adjust(c, SURFACES.light[2], 3, 'black'),
    rimD: adjust(c, SURFACES.dark[2], 3, 'white'),
    adjusted: field !== c,
  };
}

/** Id del degradado de un nivel (lo define BadgeDefs una sola vez en la página). */
export const tierGradientId = (tier: BadgeTier) => `mm-tier-${tier}`;
/** Id del brillo blanco de arriba. */
export const SHINE_ID = 'mm-shine';

/** La paleta ya resuelta de una insignia, lista para pintar. */
export interface ResolvedPalette {
  /** El metal, o null si es un color de liga. */
  tier: BadgeTier | null;
  /** Insignia de un solo nivel: oro sin puntos ni tachas. */
  unico: boolean;
  hi: string;
  mid: string;
  lo: string;
  ribbon: string;
  rimL: string;
  rimD: string;
  field: string;
  /** Id del degradado del marco (el de un color de liga lo define la propia insignia). */
  gradient: string;
  /** Solo en colores de liga: la paleta generada (el degradado va en la escena). */
  custom: CustomPalette | null;
}

/**
 * Paleta de una insignia. `customId` es el id del degradado propio de un color de liga (React le pasa uno de `useId`
 * para que dos insignias con colores distintos no choquen). Un color que no sirve cae al morado de la marca.
 */
export function resolvePalette(look: Pick<BadgeLook, 'tier' | 'field'>, customId = 'mm-gc'): ResolvedPalette {
  if (typeof look.tier === 'object') {
    const p = badgePaletteFrom(look.tier.custom) ?? badgePaletteFrom(BRAND_FIELD)!;
    return { tier: null, unico: false, hi: p.hi, mid: p.mid, lo: p.lo, ribbon: p.ribbon, rimL: p.rimL, rimD: p.rimD, field: p.field, gradient: customId, custom: p };
  }
  const unico = look.tier === 'unico';
  const t = TIERS[unico ? 'oro' : (look.tier as BadgeTier)] ?? TIERS.oro;
  return { tier: t.key, unico, hi: t.hi, mid: t.mid, lo: t.lo, ribbon: t.ribbon, rimL: t.rimL, rimD: t.rimD, field: look.field || BRAND_FIELD, gradient: tierGradientId(t.key), custom: null };
}

/** Color del puntito de nivel en textos y listas (el `mid` del metal; oro para «Única»). */
export function tierDot(tier: BadgeLook['tier']): string {
  if (typeof tier === 'object') return badgePaletteFrom(tier.custom)?.mid ?? BRAND_FIELD;
  return TIERS[tier === 'unico' ? 'oro' : tier].mid;
}

/**
 * Variables CSS de un recuadro que se ve siempre claro u oscuro, sin importar el modo de la pantalla (la galería y la
 * vista previa del creador, que muestran las dos lado a lado). Van en `style` del recuadro. El relleno y la línea de
 * las bloqueadas y el anillo de «Nueva» los calcula `.bd` (index.css) con estas mismas variables.
 */
export function badgeThemeVars(mode: 'light' | 'dark'): Record<string, string> {
  const dark = mode === 'dark';
  const vars: Record<string, string> = {
    '--surface': dark ? '#161922' : '#ffffff',
    '--surface-2': dark ? '#1e222d' : '#eef0f4',
    '--fg': dark ? '#eceef3' : '#151822',
    '--muted': dark ? '#9aa1b0' : '#646b7a',
    '--line': dark ? '#2a2f3b' : '#e2e5eb',
    '--accent': dark ? '#8b8cf6' : '#4338ca',
    '--accent-fg': dark ? '#0d0f15' : '#ffffff',
    '--accent-soft': dark ? '#25264a' : '#e8e7fb',
    '--bd-shadow': dark ? 'none' : 'drop-shadow(0 1px 1px rgb(0 0 0 / .15))',
    '--bd-l': dark ? '0' : '1',
    '--bd-d': dark ? '1' : '0',
    background: 'var(--surface)',
    color: 'var(--fg)',
    colorScheme: mode,
  };
  for (const t of TIER_ORDER) vars[`--bd-rim-${t}`] = dark ? TIERS[t].rimD : TIERS[t].rimL;
  return vars;
}
