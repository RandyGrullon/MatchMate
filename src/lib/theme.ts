/**
 * Apariencia de la app en este dispositivo: claro, oscuro o como el teléfono. El color ya no se elige: lo pone
 * el deporte en que estás (el morado de MatchMate fuera de un deporte y en el boliche).
 * Se guarda en el teléfono; index.html pone el modo antes de pintar (sin parpadeo).
 */
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemePrefs {
  mode: ThemeMode;
  /**
   * Color principal (hex) o null = el morado de MatchMate. Ya no se elige en Configuración: `loadTheme` siempre
   * da null (lo que quedó guardado de antes no cuenta) y cada deporte pone su color.
   */
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

const PREFS_KEY = 'mm:tema';
/** Donde antes se guardaba el CSS del color elegido: ahora solo se borra (aquí y en index.html). */
const CSS_KEY = 'mm:tema-css';
const STYLE_ID = 'mm-acento';

// Fondos de la app (deben coincidir con index.css): contra ellos se mide el contraste del color.
const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#161922';
const DARK_FG = '#0d0f15';
/** Los demás fondos donde va texto del color (el fondo de la página y el gris de los botones), en claro y oscuro. */
const LIGHT_BACKS = ['#f4f5f8', '#eef0f4'];
const DARK_BACKS = ['#0d0f15', '#1e222d'];

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

/** Acerca el color a `toward` lo mínimo necesario para que se lea (4.5:1, AA) contra todos los `surfaces`. */
function readable(base: Rgb, surfaces: Rgb[], toward: Rgb): Rgb {
  const worst = (c: Rgb) => Math.min(...surfaces.map((s) => contrast(c, s)));
  let c = base;
  for (let t = 0; t <= 1.0001 && worst(c) < 4.5; t += 0.05) c = mix(base, toward, t);
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

  const lightSoft = mix(lightSurface, base, 0.12);
  const darkSoft = mix(darkSurface, base, 0.24);
  // Se lee sobre las tarjetas, el fondo de la página, el gris de los botones y su propio fondo suave.
  const l = readable(base, [lightSurface, lightSoft, ...LIGHT_BACKS.map((h) => parseHex(h)!)], black);
  const d = readable(base, [darkSurface, darkSoft, ...DARK_BACKS.map((h) => parseHex(h)!)], white);
  const fgOn = (c: Rgb) => (contrast(c, white) >= contrast(c, darkFg) ? '#ffffff' : DARK_FG);
  return {
    light: { accent: toHex(l), fg: fgOn(l), soft: toHex(lightSoft) },
    dark: { accent: toHex(d), fg: fgOn(d), soft: toHex(darkSoft) },
  };
}

/** Los tonos diseñados a mano del morado de siempre (iguales a index.css). */
const DEFAULT_VARS: { light: AccentVars; dark: AccentVars } = {
  light: { accent: DEFAULT_ACCENT, fg: '#ffffff', soft: '#e8e7fb' },
  dark: { accent: '#8b8cf6', fg: DARK_FG, soft: '#25264a' },
};

/**
 * Los tonos del color de la marca para claro y oscuro, como los usa la app (el morado de siempre con sus tonos
 * a mano). Sirve para dibujar el logo o una animación en un modo que no es el de la pantalla (vista previa).
 */
export function brandColors(hex: string | null): { light: AccentVars; dark: AccentVars } {
  return (hex && hex.toLowerCase() !== DEFAULT_ACCENT && accentVars(hex)) || DEFAULT_VARS;
}

const decl = (x: AccentVars) => `--accent:${x.accent};--accent-fg:${x.fg};--accent-soft:${x.soft};`;

/** Las reglas CSS del color (vacío = el morado de siempre, con sus tonos diseñados a mano). */
export function accentCss(hex: string | null): string {
  if (!hex || hex.toLowerCase() === DEFAULT_ACCENT) return '';
  const v = accentVars(hex);
  if (!v) return '';
  // html:root pesa más que :root de index.css: gana aunque la hoja de la app cargue después.
  return [
    `html:root{${decl(v.light)}}`,
    `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${decl(v.dark)}}}`,
    `html:root[data-theme="dark"]{${decl(v.dark)}}`,
  ].join('');
}

/**
 * El color de un deporte dentro de sus ligas: las mismas variables del color de la app (--accent, --accent-fg,
 * --accent-soft) puestas solo en `selector` (una clase), con sus tonos para claro, oscuro y como el teléfono.
 * Todo lo de adentro las hereda (pestañas, botones, la portada y su animación). Vacío si el color no sirve.
 */
export function scopedAccentCss(selector: string, hex: string | null): string {
  const v = hex ? accentVars(hex) : null;
  if (!v || !/^\.[a-z][a-z0-9-]*$/.test(selector)) return '';
  // La regla de oscuro lleva :root delante: pesa más que la de claro (misma clase) y gana en modo oscuro.
  return [
    `${selector}{${decl(v.light)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) ${selector}{${decl(v.dark)}}}`,
    `:root[data-theme="dark"] ${selector}{${decl(v.dark)}}`,
  ].join('');
}

/**
 * ¿La cuenta dejó el color de la app como viene (el morado)? Entonces cada liga toma el color de su deporte; si
 * eligió otro color en Configuración, se respeta en todas partes.
 */
export const usesBrandAccent = (p: Pick<ThemePrefs, 'accent'>) => !p.accent || p.accent.toLowerCase() === DEFAULT_ACCENT;

/**
 * Como `scopedAccentCss`, pero sin color (null) o con el morado pone los tonos de siempre de la app (a mano) en vez
 * de dejarlo vacío: sirve para una parte de la pantalla que debe verse del color de SU deporte aunque la app entera
 * esté con el de otro (p. ej. el cuadro del boliche en el selector de deporte mientras la app está en pádel).
 */
export function scopedVarsCss(selector: string, hex: string | null): string {
  if (!/^\.[a-z][a-z0-9-]*$/.test(selector)) return '';
  if (hex && !parseHex(hex)) return '';
  const v = brandColors(hex);
  return [
    `${selector}{${decl(v.light)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) ${selector}{${decl(v.dark)}}}`,
    `:root[data-theme="dark"] ${selector}{${decl(v.dark)}}`,
  ].join('');
}

// ---------- El color del deporte en que estás (toda la app) ----------

/** Id del <style> con el color del deporte activo (aparte del color elegido en Configuración: `mm-acento`). */
export const SPORT_STYLE_ID = 'mm-acento-deporte';
/** Se avisa al cambiar la apariencia en Configuración (el color del deporte se vuelve a poner o se quita). */
export const THEME_EVENT = 'mm:tema';

/**
 * CSS del color del deporte en que estás para TODA la app (html:root, en claro, oscuro y como el teléfono), con los
 * mismos tonos que dentro de sus ligas (se leen a 4.5:1 sobre el fondo claro y el oscuro). Vacío si el deporte no
 * tiene color propio (el boliche usa el morado de siempre) o si la cuenta eligió su color en Configuración: ese se
 * respeta en todas partes.
 */
export function sportAccentCss(hex: string | null, prefs: Pick<ThemePrefs, 'accent'>): string {
  return hex && usesBrandAccent(prefs) ? accentCss(hex) : '';
}

/** Pone (o quita) el color del deporte en la página. */
export function applySportAccent(hex: string | null, prefs: Pick<ThemePrefs, 'accent'> = loadTheme()) {
  if (typeof document === 'undefined') return;
  const css = sportAccentCss(hex, prefs);
  let style = document.getElementById(SPORT_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = SPORT_STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

export function loadTheme(): ThemePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<ThemePrefs> | null;
    const mode = p?.mode === 'light' || p?.mode === 'dark' ? p.mode : 'system';
    // Un color elegido antes (cuando se podía) se ignora: el color es el del deporte.
    return { mode, accent: null };
  } catch {
    return { mode: 'system', accent: null };
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Pone el modo en la página (y el color de la barra del teléfono). El color es el del deporte (applySportAccent). */
export function applyTheme(p: Pick<ThemePrefs, 'mode'>) {
  const root = document.documentElement;
  if (p.mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.mode;

  // El color que se elegía antes en Configuración ya no se pone.
  document.getElementById(STYLE_ID)?.remove();

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
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: p.mode }));
    localStorage.removeItem(CSS_KEY);
  } catch {
    // sin almacenamiento: vale solo mientras la app está abierta
  }
  applyTheme(p);
  // El color del deporte en que estás depende de si la cuenta dejó el color de la app como viene.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_EVENT));
}
