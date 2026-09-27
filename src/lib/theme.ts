/**
 * Apariencia de la app en este dispositivo: claro, oscuro o como el teléfono, y el color principal.
 * Se guarda en el teléfono; index.html la aplica antes de pintar (sin parpadeo).
 */
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemePrefs {
  mode: ThemeMode;
  /** Color principal (hex) o null = el morado de BowlingX. */
  accent: string | null;
}

export const DEFAULT_ACCENT = '#4338ca';
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Morado', hex: DEFAULT_ACCENT },
  { name: 'Azul', hex: '#2563eb' },
  { name: 'Turquesa', hex: '#0d9488' },
  { name: 'Verde', hex: '#15803d' },
  { name: 'Naranja', hex: '#ea580c' },
  { name: 'Rojo', hex: '#dc2626' },
  { name: 'Rosa', hex: '#db2777' },
  { name: 'Grafito', hex: '#475569' },
];

const PREFS_KEY = 'bowlingx:tema';
/** CSS ya calculado del color: index.html lo pone antes de que cargue la app. */
const CSS_KEY = 'bowlingx:tema-css';
const STYLE_ID = 'bowlingx-acento';

// Fondos de la app (deben coincidir con index.css): contra ellos se mide el contraste del color.
const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#161922';
const DARK_FG = '#0d0f15';

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Acerca el color a `toward` lo mínimo necesario para que se lea contra `surface` (4.5:1). */
function readable(base: Rgb, surface: Rgb, toward: Rgb): Rgb {
  let c = base;
  for (let t = 0; t <= 1.0001 && contrast(c, surface) < 4.5; t += 0.05) c = mix(base, toward, t);
  return c;
}

export interface AccentVars {
  accent: string;
  fg: string;
  soft: string;
}

/**
 * Las variantes del color para claro y oscuro: el color de marca (que se lea sobre blanco o sobre el
 * fondo oscuro), el texto encima (blanco u oscuro, el que más contraste) y el fondo suave.
 */
export function accentVars(hex: string): { light: AccentVars; dark: AccentVars } | null {
  const base = parseHex(hex);
  if (!base) return null;
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  const lightSurface = parseHex(LIGHT_SURFACE)!;
  const darkSurface = parseHex(DARK_SURFACE)!;
  const darkFg = parseHex(DARK_FG)!;

  const l = readable(base, lightSurface, black);
  const d = readable(base, darkSurface, white);
  const fgOn = (c: Rgb) => (contrast(c, white) >= contrast(c, darkFg) ? '#ffffff' : DARK_FG);
  return {
    light: { accent: toHex(l), fg: fgOn(l), soft: toHex(mix(lightSurface, base, 0.12)) },
    dark: { accent: toHex(d), fg: fgOn(d), soft: toHex(mix(darkSurface, base, 0.24)) },
  };
}

/** Las reglas CSS del color (vacío = el morado de siempre, con sus tonos diseñados a mano). */
export function accentCss(hex: string | null): string {
  if (!hex || hex.toLowerCase() === DEFAULT_ACCENT) return '';
  const v = accentVars(hex);
  if (!v) return '';
  const decl = (x: AccentVars) => `--accent:${x.accent};--accent-fg:${x.fg};--accent-soft:${x.soft};`;
  // html:root pesa más que :root de index.css: gana aunque la hoja de la app cargue después.
  return [
    `html:root{${decl(v.light)}}`,
    `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${decl(v.dark)}}}`,
    `html:root[data-theme="dark"]{${decl(v.dark)}}`,
  ].join('');
}

export function loadTheme(): ThemePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<ThemePrefs> | null;
    const mode = p?.mode === 'light' || p?.mode === 'dark' ? p.mode : 'system';
    const accent = typeof p?.accent === 'string' && parseHex(p.accent) ? p.accent : null;
    return { mode, accent };
  } catch {
    return { mode: 'system', accent: null };
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Pone el modo y el color en la página (y el color de la barra del teléfono). */
export function applyTheme(p: ThemePrefs) {
  const root = document.documentElement;
  if (p.mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.mode;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = accentCss(p.accent);
  if (css) {
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
  } else {
    style?.remove();
  }

  // Barra de estado del teléfono: el fondo de las tarjetas del modo que se ve.
  const dark = p.mode === 'dark' || (p.mode === 'system' && systemDark());
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  if (p.mode === 'system') {
    metas.forEach((m) => {
      const media = m.dataset.media ?? m.media;
      if (media) m.media = media;
      m.content = media.includes('dark') ? DARK_SURFACE : LIGHT_SURFACE;
    });
  } else {
    metas.forEach((m) => {
      if (m.media) m.dataset.media = m.media;
      m.removeAttribute('media');
      m.content = dark ? DARK_SURFACE : LIGHT_SURFACE;
    });
  }
}

export function saveTheme(p: ThemePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    localStorage.setItem(CSS_KEY, accentCss(p.accent));
  } catch {
    // sin almacenamiento: vale solo mientras la app está abierta
  }
  applyTheme(p);
}
