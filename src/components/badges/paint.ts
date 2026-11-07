/**
 * Una insignia lista para pintarla sin CSS (la app del teléfono, con react-native-svg; movil/src/components/badges/
 * Insignia.tsx). Es la misma escena de la web (badgeModel de src/badges/visual/geometry.ts y nodesToElements de svg.ts
 * en modo `css`) con lo que en la web hace index.css ya puesto:
 * - las variables (--muted, --bd-rim-oro, --bd-glow…) pasan a los colores de la pantalla, claros u oscuros, como
 *   `.bd` y `badgeThemeVars`;
 * - cada <Svg> lleva sus propios degradados y recortes (en react-native-svg no se comparten entre dibujos), solo los que
 *   usa, con los ids terminados en `-<sufijo>` para que dos insignias no choquen (en la vista previa web son de la
 *   página entera);
 * - en la animación de desbloqueo, cada capa dice su clase (bd-a-all, bd-a-on…), su centro y hacia dónde sale (las
 *   partículas), para moverla como los @keyframes de index.css (motion.ts).
 * Sin React ni DOM, con pruebas en paint.test.ts.
 */
import { badgeModel, type BadgeModelOptions } from '../../badges/visual/geometry';
import { badgeThemeVars } from '../../badges/visual/palette';
import { SHARED_DEFS, nodesToElements, sceneDefs, type SvgElement } from '../../badges/visual/svg';
import type { BadgeLook } from '../../badges/visual/types';

/** Los colores de la pantalla que usan las insignias (los del tema de la app; sin ellos, los de la web). */
export interface PaintColors {
  surface: string;
  surface2: string;
  muted: string;
  line: string;
  accent: string;
}

export interface PaintOptions extends Omit<BadgeModelOptions, 'gradientId'> {
  dark: boolean;
  colors?: Partial<PaintColors>;
  /** Lo que termina cada id de esta insignia (sin signos: letras, números, - y _). */
  suffix: string;
}

/** Un elemento con todo resuelto: atributos de react-native-svg (camelCase) y, en la animación, su capa. */
export interface PaintedElement {
  tag: string;
  attrs: Record<string, string | number>;
  children?: PaintedElement[];
  text?: string;
  /** Clase de la animación de desbloqueo (bd-a-all, bd-a-lock, bd-a-on, bd-a-band, bd-a-ribbon, bd-a-part). */
  cls?: string;
  /** Hacia dónde sale una partícula (--dx, --dy). */
  drift?: readonly [number, number];
  /** Centro de la capa (transform-box: fill-box; transform-origin: center). */
  center?: readonly [number, number];
}

export interface PaintedBadge {
  viewBox: string;
  defs: PaintedElement[];
  nodes: PaintedElement[];
}

/** El brillo de «Nueva»: el acento al 35 % (`color-mix(in srgb, var(--accent) 35%, transparent)` en index.css). */
export const GLOW_ALPHA = 0.35;

/** Los valores de las variables de las insignias en un tema (los de index.css, con los colores de la app encima). */
export function badgeVars(dark: boolean, colors: Partial<PaintColors> = {}): Record<string, string> {
  const base = badgeThemeVars(dark ? 'dark' : 'light');
  const vars: Record<string, string> = { ...base };
  if (colors.surface) vars['--surface'] = colors.surface;
  if (colors.surface2) vars['--surface-2'] = colors.surface2;
  if (colors.muted) vars['--muted'] = colors.muted;
  if (colors.line) vars['--line'] = colors.line;
  if (colors.accent) vars['--accent'] = colors.accent;
  // `.bd` de index.css: el relleno y la línea de las bloqueadas, y el brillo de «Nueva».
  vars['--bd-lock-fill'] = vars['--surface-2'];
  vars['--bd-lock-line'] = vars['--muted'];
  vars['--bd-glow'] = vars['--accent'];
  return vars;
}

const VAR = /^var\((--[\w-]+)\)$/;
const URL_REF = /url\(#([^)]+)\)/g;
const num = (v: string) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Caja de un camino con solo comandos absolutos M, L, H, V, C y Z (la cinta y los destellos); null si no se puede. */
export function pathBox(d: string): { x: number; y: number } | null {
  if (/[^MLHVCZ\d.,\s-]/.test(d.replace(/e-?\d/g, ''))) return null;
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let cmd = '';
  let i = 0;
  let x = 0;
  let y = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MLHVCZ]/.test(t)) {
      cmd = t;
      i++;
      continue;
    }
    if (cmd === 'H') x = Number(tokens[i++]);
    else if (cmd === 'V') y = Number(tokens[i++]);
    else {
      x = Number(tokens[i++]);
      y = Number(tokens[i++]);
    }
    xs.push(x);
    ys.push(y);
  }
  if (!xs.length) return null;
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** El centro de una capa de la animación (como lo calcula el navegador con fill-box). */
function centerOf(el: SvgElement, cls: string): readonly [number, number] {
  if (cls === 'bd-a-all') return [64, 64];
  if (el.tag === 'circle') return [Number(el.attrs.cx), Number(el.attrs.cy)];
  const path = el.children?.find((c) => c.tag === 'path');
  const box = path ? pathBox(String(path.attrs.d)) : null;
  return box ? [box.x, box.y] : [64, 64];
}

function resolve(el: SvgElement, vars: Record<string, string>, suffix: string, used: Set<string>): PaintedElement {
  const attrs: Record<string, string | number> = {};
  let cls: string | undefined;
  for (const [k, v] of Object.entries(el.attrs)) {
    if (k === 'className') cls = String(v);
    else if (k === 'id') attrs.id = `${v}-${suffix}`;
    else if (typeof v === 'string' && v.includes('url(#')) {
      attrs[k] = v.replace(URL_REF, (_, id: string) => {
        used.add(id);
        return `url(#${id}-${suffix})`;
      });
    } else attrs[k] = v;
  }
  let dx: number | null = null;
  let dy: number | null = null;
  for (const [k, v] of Object.entries(el.style ?? {})) {
    if (k === '--dx') dx = num(v);
    else if (k === '--dy') dy = num(v);
    else {
      const name = VAR.exec(v)?.[1];
      const value = name ? vars[name] : v;
      if (value === undefined) continue;
      if (k === 'strokeOpacity' || k === 'fillOpacity') attrs[k] = num(value);
      else {
        attrs[k] = value;
        if (name === '--bd-glow') attrs[k === 'fill' ? 'fillOpacity' : 'strokeOpacity'] = GLOW_ALPHA;
      }
    }
  }
  const out: PaintedElement = { tag: el.tag, attrs };
  if (el.text != null) out.text = el.text;
  if (el.children) out.children = el.children.map((c) => resolve(c, vars, suffix, used));
  if (cls) {
    out.cls = cls;
    out.center = centerOf(el, cls);
  }
  if (dx !== null || dy !== null) out.drift = [dx ?? 0, dy ?? 0];
  return out;
}

/**
 * La insignia con sus colores, sus degradados y recortes propios y, en la animación (`animate`), sus capas. Las
 * opciones son las de `badgeModel` (tamaño, estado, progreso, px, pad, animate).
 */
export function paintBadge(look: BadgeLook, opts: PaintOptions): PaintedBadge {
  const { dark, colors, suffix, ...model } = opts;
  const scene = badgeModel(look, { ...model, gradientId: 'mm-gc' });
  const vars = badgeVars(dark, colors);
  const used = new Set<string>();
  const nodes = nodesToElements(scene.nodes, 'css').map((el) => resolve(el, vars, suffix, used));
  const own = sceneDefs(scene);
  const shared = SHARED_DEFS.filter((d) => used.has(String(d.attrs.id)));
  const defs = [...shared, ...own].map((d) => resolve(d, vars, suffix, used));
  return { viewBox: scene.viewBox.join(' '), defs, nodes };
}
