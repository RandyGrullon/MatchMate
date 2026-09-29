/**
 * De las figuras de geometry.ts a elementos SVG. Lo usan los dos pintores de SVG: Insignia.tsx (React, con las
 * variables CSS del tema) y `badgeSvg` (texto, con los colores ya resueltos a claro u oscuro: pruebas, PNG con resvg
 * y vistas sin navegador).
 */
import { FONT_STACK } from '../../components/share/scene';
import { iconNode } from './icons';
import { SHINE_ID, TIERS, TIER_ORDER, tierGradientId } from './palette';
import { SHAPES, SHAPE_ORDER, badgeModel, type BadgeModelOptions, type BadgeNode, type BadgeScene, type GradientDef, type Paint } from './geometry';
import type { BadgeLook } from './types';

/** `css`: colores del tema con var(--…) (la app); `light` u `dark`: resueltos (texto, canvas, pruebas). */
export type PaintMode = 'css' | 'light' | 'dark';

/** Un elemento SVG listo para React o para texto. Atributos en camelCase (como los pide React). */
export interface SvgElement {
  tag: string;
  attrs: Record<string, string | number>;
  style?: Record<string, string>;
  children?: SvgElement[];
  text?: string;
}

const n = (v: number) => Math.round(v * 100) / 100;

function setPaint(p: Paint | undefined, prop: 'fill' | 'stroke', mode: PaintMode, el: SvgElement) {
  if (p === undefined) return;
  if (typeof p === 'string') el.attrs[prop] = p;
  else if ('grad' in p) el.attrs[prop] = `url(#${p.grad})`;
  // Las variables CSS van en `style`: en los atributos de presentación no todos los navegadores las leen.
  else if (mode === 'css') (el.style ??= {})[prop] = p.css;
  else {
    el.attrs[prop] = p[mode];
    if (p.alpha != null) el.attrs[prop === 'fill' ? 'fillOpacity' : 'strokeOpacity'] = p.alpha;
  }
}

function common(node: BadgeNode, el: SvgElement) {
  if (node.opacity != null && node.opacity < 1) el.attrs.opacity = node.opacity;
  if (node.clip) el.attrs.clipPath = `url(#mm-clip-${node.clip})`;
  if (node.cls) el.attrs.className = node.cls;
}

const drift = (el: SvgElement, d: readonly [number, number] | undefined) => {
  if (d) el.style = { ...el.style, '--dx': `${d[0]}px`, '--dy': `${d[1]}px` };
};

/** Una figura como elemento SVG; null si es de otro tema (bordes de los colores de liga en modo resuelto). */
export function nodeToElement(node: BadgeNode, mode: PaintMode): SvgElement | null {
  switch (node.t) {
    case 'path': {
      if (node.theme && mode !== 'css' && node.theme !== mode) return null;
      const el: SvgElement = { tag: 'path', attrs: { d: node.d } };
      if (node.fill === undefined) el.attrs.fill = 'none';
      setPaint(node.fill, 'fill', mode, el);
      if (node.fillOpacity != null) el.attrs.fillOpacity = node.fillOpacity;
      setPaint(node.stroke, 'stroke', mode, el);
      if (node.stroke !== undefined && node.width != null) el.attrs.strokeWidth = node.width;
      if (node.cap) el.attrs.strokeLinecap = node.cap;
      if (node.join) el.attrs.strokeLinejoin = node.join;
      if (node.scaleAbout) {
        const [k, cx, cy] = node.scaleAbout;
        el.attrs.transform = `translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`;
      }
      // Un color de liga lleva dos bordes: cada uno se ve solo en su tema (--bd-l y --bd-d valen 1 o 0).
      if (node.theme && mode === 'css') el.style = { ...el.style, strokeOpacity: node.theme === 'light' ? 'var(--bd-l)' : 'var(--bd-d)' };
      common(node, el);
      return el;
    }
    case 'circle': {
      const el: SvgElement = { tag: 'circle', attrs: { cx: node.cx, cy: node.cy, r: node.r } };
      if (node.fill === undefined) el.attrs.fill = 'none';
      setPaint(node.fill, 'fill', mode, el);
      setPaint(node.stroke, 'stroke', mode, el);
      if (node.stroke !== undefined && node.width != null) el.attrs.strokeWidth = node.width;
      drift(el, node.drift);
      common(node, el);
      return el;
    }
    case 'ellipse': {
      const el: SvgElement = { tag: 'ellipse', attrs: { cx: node.cx, cy: node.cy, rx: node.rx, ry: node.ry } };
      setPaint(node.fill, 'fill', mode, el);
      if (node.rotate) el.attrs.transform = `rotate(${node.rotate} ${node.cx} ${node.cy})`;
      common(node, el);
      return el;
    }
    case 'rect': {
      const el: SvgElement = { tag: 'rect', attrs: { x: node.x, y: node.y, width: node.w, height: node.h } };
      if (node.rx) el.attrs.rx = node.rx;
      setPaint(node.fill, 'fill', mode, el);
      setPaint(node.stroke, 'stroke', mode, el);
      if (node.stroke !== undefined && node.width != null) el.attrs.strokeWidth = node.width;
      if (node.rotate) el.attrs.transform = `rotate(${node.rotate.join(' ')})`;
      common(node, el);
      return el;
    }
    case 'text': {
      const el: SvgElement = {
        tag: 'text',
        attrs: {
          x: node.x,
          y: node.y,
          textAnchor: 'middle',
          dominantBaseline: 'central',
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: node.size,
          letterSpacing: node.spacing,
          fill: node.fill,
        },
        text: node.text,
      };
      // Si no cabe, se aprieta al ancho de la cinta (nunca se sale).
      if (node.fit) Object.assign(el.attrs, { textLength: node.fit, lengthAdjust: 'spacingAndGlyphs' });
      common(node, el);
      return el;
    }
    case 'icon': {
      const el: SvgElement = {
        tag: 'g',
        attrs: {
          transform: `translate(${node.x} ${node.y}) scale(${node.k})`,
          fill: 'none',
          strokeWidth: node.width,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        children: iconNode(node.key).map(([tag, a]) => ({ tag, attrs: { ...a } })),
      };
      setPaint(node.color, 'stroke', mode, el);
      common(node, el);
      return el;
    }
    case 'group': {
      const el: SvgElement = { tag: 'g', attrs: {}, children: nodesToElements(node.children, mode) };
      if (node.move) el.attrs.transform = `translate(${node.move[0]} ${node.move[1]}) scale(${node.move[2]})`;
      drift(el, node.drift);
      common(node, el);
      return el;
    }
  }
}

export const nodesToElements = (nodes: readonly BadgeNode[], mode: PaintMode): SvgElement[] =>
  nodes.map((x) => nodeToElement(x, mode)).filter((x): x is SvgElement => x !== null);

function gradientElement(g: GradientDef): SvgElement {
  return {
    tag: 'linearGradient',
    attrs: { id: g.id, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 },
    children: g.stops.map(([offset, color, opacity]): SvgElement => {
      const attrs: SvgElement['attrs'] = { offset, stopColor: color };
      if (opacity != null) attrs.stopOpacity = opacity;
      return { tag: 'stop', attrs };
    }),
  };
}

/** Degradados de los cinco metales (135°: `hi` 0 %, `mid` 45 %, `lo` 100 %) y el brillo de arriba. */
export const SHARED_GRADIENTS: readonly GradientDef[] = [
  ...TIER_ORDER.map((t) => ({ id: tierGradientId(t), x1: 0, y1: 0, x2: 1, y2: 1, stops: [[0, TIERS[t].hi], [0.45, TIERS[t].mid], [1, TIERS[t].lo]] as const })),
  { id: SHINE_ID, x1: 0, y1: 0, x2: 0, y2: 1, stops: [[0, '#ffffff', 0.35], [1, '#ffffff', 0]] },
];

/** Lo que comparten todas las insignias: los degradados y un recorte por forma (`mm-clip-<forma>`). */
export const SHARED_DEFS: readonly SvgElement[] = [
  ...SHARED_GRADIENTS.map(gradientElement),
  ...SHAPE_ORDER.map((s) => ({ tag: 'clipPath', attrs: { id: `mm-clip-${s}` }, children: [{ tag: 'path', attrs: { d: SHAPES[s].outer } }] })),
];

/** Los degradados propios de una escena (colores de liga). */
export const sceneDefs = (scene: BadgeScene): SvgElement[] => scene.gradients.map(gradientElement);

// ---------- SVG de texto ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Atributos que en SVG van en camelCase (los demás pasan a guiones: strokeWidth → stroke-width). */
const KEEP_CASE = new Set(['textLength', 'lengthAdjust', 'viewBox', 'pathLength']);
const kebab = (k: string) => (k === 'className' ? 'class' : KEEP_CASE.has(k) || k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
const attrValue = (v: string | number) => (typeof v === 'number' ? String(n(v)) : esc(v));

/** Un elemento como texto XML. */
export function elementToXml(el: SvgElement): string {
  let s = `<${el.tag}`;
  for (const [k, v] of Object.entries(el.attrs)) s += ` ${kebab(k)}="${attrValue(v)}"`;
  if (el.style && Object.keys(el.style).length) s += ` style="${esc(Object.entries(el.style).map(([k, v]) => `${kebab(k)}:${v}`).join(';'))}"`;
  const inner = el.text != null ? esc(el.text) : (el.children ?? []).map(elementToXml).join('');
  return inner ? `${s}>${inner}</${el.tag}>` : `${s}/>`;
}

export interface BadgeSvgOptions extends BadgeModelOptions {
  /** Tema de los colores (por defecto claro, como las tarjetas para compartir). */
  mode?: 'light' | 'dark';
  /** Nombre accesible; sin él la imagen va `aria-hidden`. */
  label?: string;
  /** Incluir los degradados y recortes compartidos (por defecto sí: el SVG queda solo). */
  withDefs?: boolean;
}

/** Una insignia como SVG de texto, con los colores del tema resueltos. */
export function badgeSvg(look: BadgeLook, opts: BadgeSvgOptions): string {
  const scene = badgeModel(look, opts);
  const mode = opts.mode ?? 'light';
  const px = opts.px ?? opts.size;
  const defs = [...(opts.withDefs === false ? [] : SHARED_DEFS), ...sceneDefs(scene)];
  const a11y = opts.label ? ` role="img" aria-label="${esc(opts.label)}"` : ' aria-hidden="true"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.viewBox.join(' ')}" width="${px}" height="${px}"${a11y}>` +
    (defs.length ? `<defs>${defs.map(elementToXml).join('')}</defs>` : '') +
    nodesToElements(scene.nodes, mode).map(elementToXml).join('') +
    '</svg>'
  );
}

/** Los degradados y recortes compartidos como `<svg>` escondido (lo mismo que monta BadgeDefs). */
export const badgeDefsMarkup = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${SHARED_DEFS.map(elementToXml).join('')}</defs></svg>`;
