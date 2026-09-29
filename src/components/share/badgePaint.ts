import { SHAPES, SHARED_GRADIENTS, badgeModel, iconNode, iconToPath, type BadgeLook, type BadgeNode, type GradientDef, type Paint } from '../../badges/visual';
import { FONT_STACK } from './scene';

/**
 * Pinta una insignia en el canvas de la tarjeta para compartir (docs/insignias.md §4.9), con los colores del modo
 * claro (la imagen se ve en el chat, no en la app). Las figuras salen de `badgeModel` (las mismas del SVG de la app):
 * caminos con `Path2D`, degradados con `createLinearGradient` y recortes con la forma de la insignia. Sin `Path2D`
 * (navegador viejo) no pinta nada y la tarjeta queda solo con el texto.
 */

/** Lo que se usa del contexto 2D (además de lo de paint.ts). */
export type BadgeCtx = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'save'
  | 'restore'
  | 'scale'
  | 'translate'
  | 'rotate'
  | 'beginPath'
  | 'ellipse'
  | 'arc'
  | 'rect'
  | 'fill'
  | 'stroke'
  | 'clip'
  | 'fillText'
  | 'measureText'
  | 'createLinearGradient'
>;

type Box = [x: number, y: number, w: number, h: number];

/** ¿Este navegador puede pintar insignias? */
export const canPaintBadges = (ctx: unknown): ctx is BadgeCtx =>
  typeof Path2D !== 'undefined' && !!ctx && typeof (ctx as BadgeCtx).clip === 'function' && typeof (ctx as BadgeCtx).createLinearGradient === 'function';

/**
 * Caja aproximada de un camino SVG (M, L, H, V, C, S, Q, T, A y Z, absolutos y relativos), para ubicar los degradados
 * como en SVG (`objectBoundingBox`). Incluye los puntos de control y, en los arcos, el radio alrededor de los extremos:
 * queda un poco más grande, que para un degradado no se nota.
 */
export function pathBox(d: string): Box | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      x = sx;
      y = sy;
      cmd = '';
      continue;
    }
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'M' || C === 'L' || C === 'T') {
      x = ox + next();
      y = oy + next();
      if (C === 'M') {
        sx = x;
        sy = y;
        cmd = rel ? 'l' : 'L';
      }
      add(x, y);
    } else if (C === 'H') {
      x = (rel ? x : 0) + next();
      add(x, y);
    } else if (C === 'V') {
      y = (rel ? y : 0) + next();
      add(x, y);
    } else if (C === 'C') {
      for (let k = 0; k < 3; k++) {
        const px = ox + next();
        const py = oy + next();
        add(px, py);
        if (k === 2) {
          x = px;
          y = py;
        }
      }
    } else if (C === 'S' || C === 'Q') {
      for (let k = 0; k < 2; k++) {
        const px = ox + next();
        const py = oy + next();
        add(px, py);
        if (k === 1) {
          x = px;
          y = py;
        }
      }
    } else if (C === 'A') {
      const rx = Math.abs(next());
      const ry = Math.abs(next());
      i += 3;
      const px = ox + next();
      const py = oy + next();
      for (const [cx, cy] of [
        [x, y],
        [px, py],
      ]) {
        add(cx - rx, cy - ry);
        add(cx + rx, cy + ry);
      }
      x = px;
      y = py;
    } else {
      // Un comando que no se conoce: se deja de leer.
      break;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  }
  if (!xs.length) return null;
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0 || 1, Math.max(...ys) - y0 || 1];
}

const GRADS = new Map(SHARED_GRADIENTS.map((g) => [g.id, g]));

function paintOf(ctx: BadgeCtx, p: Paint | undefined, box: Box, own: ReadonlyMap<string, GradientDef>): { style: string | CanvasGradient; alpha: number } | null {
  if (p === undefined) return null;
  if (typeof p === 'string') return { style: p, alpha: 1 };
  if ('grad' in p) {
    const g = own.get(p.grad) ?? GRADS.get(p.grad);
    if (!g) return null;
    const [bx, by, bw, bh] = box;
    const grad = ctx.createLinearGradient(bx + g.x1 * bw, by + g.y1 * bh, bx + g.x2 * bw, by + g.y2 * bh);
    for (const [offset, color, opacity] of g.stops) grad.addColorStop(offset, opacity != null && opacity < 1 ? withAlpha(color, opacity) : color);
    return { style: grad, alpha: 1 };
  }
  return { style: p.light, alpha: p.alpha ?? 1 };
}

/** '#rrggbb' con opacidad como rgba() (los degradados del canvas no llevan opacidad por parada). */
export function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 1000) / 1000})`;
}

function fillStroke(ctx: BadgeCtx, path: Path2D, box: Box, n: { fill?: Paint; stroke?: Paint; width?: number; fillOpacity?: number }, own: ReadonlyMap<string, GradientDef>) {
  const base = ctx.globalAlpha;
  const f = paintOf(ctx, n.fill, box, own);
  if (f) {
    ctx.globalAlpha = base * f.alpha * (n.fillOpacity ?? 1);
    ctx.fillStyle = f.style;
    ctx.fill(path);
  }
  const s = paintOf(ctx, n.stroke, box, own);
  if (s && n.width) {
    ctx.globalAlpha = base * s.alpha;
    ctx.strokeStyle = s.style;
    ctx.lineWidth = n.width;
    ctx.stroke(path);
  }
  ctx.globalAlpha = base;
}

function drawText(ctx: BadgeCtx, n: Extract<BadgeNode, { t: 'text' }>) {
  ctx.font = `800 ${n.size}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = n.fill;
  const chars = [...n.text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, w) => a + w, 0) + n.spacing * chars.length;
  const k = n.fit && total > n.fit ? n.fit / total : 1;
  ctx.save();
  ctx.translate(n.x, n.y);
  ctx.scale(k, 1);
  let cx = -total / 2 + n.spacing / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, 0);
    cx += widths[i] + n.spacing;
  });
  ctx.restore();
}

function drawNode(ctx: BadgeCtx, n: BadgeNode, own: ReadonlyMap<string, GradientDef>) {
  if (n.t === 'path' && n.theme && n.theme !== 'light') return;
  ctx.save();
  if (n.opacity != null && n.opacity < 1) ctx.globalAlpha *= n.opacity;
  if (n.clip && Object.hasOwn(SHAPES, n.clip)) ctx.clip(new Path2D(SHAPES[n.clip].outer));
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  switch (n.t) {
    case 'path': {
      if (n.scaleAbout) {
        const [k, cx, cy] = n.scaleAbout;
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
      }
      if (n.cap) ctx.lineCap = n.cap;
      if (n.join) ctx.lineJoin = n.join;
      fillStroke(ctx, new Path2D(n.d), pathBox(n.d) ?? [0, 0, 128, 128], n, own);
      break;
    }
    case 'circle': {
      const p = new Path2D();
      p.arc(n.cx, n.cy, n.r, 0, Math.PI * 2);
      fillStroke(ctx, p, [n.cx - n.r, n.cy - n.r, 2 * n.r, 2 * n.r], n, own);
      break;
    }
    case 'ellipse': {
      const p = new Path2D();
      p.ellipse(n.cx, n.cy, n.rx, n.ry, ((n.rotate ?? 0) * Math.PI) / 180, 0, Math.PI * 2);
      fillStroke(ctx, p, [n.cx - n.rx, n.cy - n.ry, 2 * n.rx, 2 * n.ry], n, own);
      break;
    }
    case 'rect': {
      if (n.rotate) {
        const [deg, cx, cy] = n.rotate;
        ctx.translate(cx, cy);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      const p = new Path2D();
      if (n.rx) {
        const r = Math.min(n.rx, n.w / 2, n.h / 2);
        p.moveTo(n.x + r, n.y);
        p.arcTo(n.x + n.w, n.y, n.x + n.w, n.y + n.h, r);
        p.arcTo(n.x + n.w, n.y + n.h, n.x, n.y + n.h, r);
        p.arcTo(n.x, n.y + n.h, n.x, n.y, r);
        p.arcTo(n.x, n.y, n.x + n.w, n.y, r);
        p.closePath();
      } else p.rect(n.x, n.y, n.w, n.h);
      fillStroke(ctx, p, [n.x, n.y, n.w, n.h], n, own);
      break;
    }
    case 'text':
      drawText(ctx, n);
      break;
    case 'icon': {
      ctx.translate(n.x, n.y);
      ctx.scale(n.k, n.k);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const p = new Path2D();
      for (const el of iconNode(n.key)) p.addPath(new Path2D(iconToPath(el)));
      fillStroke(ctx, p, [0, 0, 24, 24], { stroke: n.color, width: n.width }, own);
      break;
    }
    case 'group':
      if (n.move) {
        ctx.translate(n.move[0], n.move[1]);
        ctx.scale(n.move[2], n.move[2]);
      }
      for (const c of n.children) drawNode(ctx, c, own);
      break;
  }
  ctx.restore();
}

/** Pinta la insignia (a 128, con todo el detalle) en el cuadro (x, y) de `size` píxeles lógicos. */
export function paintBadge(ctx: unknown, look: BadgeLook, x: number, y: number, size: number): boolean {
  if (!canPaintBadges(ctx)) return false;
  const scene = badgeModel(look, { size: 128, px: size * 2, gradientId: 'mm-share-grad' });
  const own = new Map(scene.gradients.map((g) => [g.id, g]));
  const [vx, vy, vw] = scene.viewBox;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / vw, size / vw);
  ctx.translate(-vx, -vy);
  for (const n of scene.nodes) drawNode(ctx, n, own);
  ctx.restore();
  return true;
}
