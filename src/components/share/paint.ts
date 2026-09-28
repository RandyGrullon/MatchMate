import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from '../splash/brand';
import { buildScene, type CardFrame, type ShareCard } from './cards';
import { fontSpec, type Measure, type Scene } from './scene';

/**
 * Pinta la imagen en un canvas y la saca en PNG. Sin librerías: solo el canvas 2D del navegador (con la letra
 * de la app ya cargada). Nada de SVG dentro de <img>: en algunos Safari eso «ensucia» el canvas y no deja
 * sacar el PNG.
 */

/** Lo que se usa del contexto 2D (las pruebas pasan uno de mentira). */
export type Ctx2D = Pick<
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
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'arcTo'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
>;

/** Puntos de un trazo hecho solo de rectas (M, L, H, V absolutos), como la M del logo. */
export function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHV])([^MLHV]*)/gi)) {
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const c = cmd.toUpperCase();
    if (c === 'H' || c === 'V') {
      for (const v of nums) {
        if (c === 'H') x = v;
        else y = v;
        out.push([x, y]);
      }
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x = nums[i];
        y = nums[i + 1];
        out.push([x, y]);
      }
    }
  }
  return out;
}

const DUO_POINTS = pathPoints(DUO_M);

/** Rectángulo con esquinas redondas (con arcTo: sirve también en navegadores sin roundRect). */
function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Pinta la Scene en el contexto, al tamaño `scale` (2 = 1080 px de ancho). */
export function paintScene(ctx: Ctx2D, scene: Scene, scale = 2) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1;
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.textBaseline = 'alphabetic';
  for (const x of scene.nodes) {
    ctx.globalAlpha = 'opacity' in x && x.opacity != null ? x.opacity : 1;
    switch (x.t) {
      case 'rect':
        ctx.fillStyle = x.color;
        if (x.r) {
          roundRect(ctx, x.x, x.y, x.w, x.h, x.r);
          ctx.fill();
        } else {
          ctx.fillRect(x.x, x.y, x.w, x.h);
        }
        break;
      case 'circle':
        ctx.fillStyle = x.color;
        ctx.beginPath();
        ctx.arc(x.cx, x.cy, x.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'text':
        ctx.fillStyle = x.color;
        ctx.font = fontSpec(x.size, x.weight);
        ctx.textAlign = x.align ?? 'left';
        ctx.fillText(x.text, x.x, x.y);
        break;
      case 'logo': {
        ctx.save();
        ctx.translate(x.x, x.y);
        ctx.scale(x.size / 512, x.size / 512);
        ctx.fillStyle = x.tile;
        roundRect(ctx, 0, 0, 512, 512, DUO_RX);
        ctx.fill();
        ctx.strokeStyle = x.ink;
        ctx.lineWidth = DUO_STROKE;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        DUO_POINTS.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
        ctx.fillStyle = x.ink;
        for (const [cx, cy] of DUO_HEADS) {
          ctx.beginPath();
          ctx.arc(cx, cy, DUO_HEAD_R, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Mide con el canvas (la letra que de verdad se va a pintar). */
export function canvasMeasure(ctx: Ctx2D): Measure {
  const cache = new Map<string, number>();
  return (text, size, weight) => {
    const key = `${weight}|${size}|${text}`;
    let w = cache.get(key);
    if (w == null) {
      ctx.font = fontSpec(size, weight);
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

/** Espera la letra de la app (Inter) un rato; sin señal sale con la del sistema. */
async function loadFonts(timeout = 1500) {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts || typeof fonts.load !== 'function') return;
  const all = Promise.all([500, 600, 700, 800].map((w) => fonts.load(`${w} 16px Inter`, 'MatchMate 0123'))).catch(() => undefined);
  await Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
}

/** Hace la imagen (PNG) de la tarjeta. Falla si el navegador no puede (sin canvas). */
export async function renderCardPng(card: ShareCard, frame: CardFrame, scale = 2): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este teléfono no puede hacer la imagen.');
  const scene = buildScene(card, frame, canvasMeasure(ctx));
  canvas.width = Math.round(scene.width * scale);
  canvas.height = Math.round(scene.height * scale);
  paintScene(ctx, scene, scale);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo hacer la imagen.'))), 'image/png'),
  );
}
