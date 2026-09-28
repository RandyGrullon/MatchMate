import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from '../splash/brand';
import { FONT_STACK, type Scene, type SceneNode } from './scene';

/**
 * La misma imagen en SVG (texto). Sirve para las pruebas (se pasa a PNG con resvg y se revisa) y para ver el
 * dibujo sin navegador. En el teléfono se pinta con paint.ts.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => String(Math.round(v * 100) / 100);
const alpha = (o: number | undefined, attr = 'opacity') => (o != null && o < 1 ? ` ${attr}="${n(o)}"` : '');

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

function node(x: SceneNode): string {
  switch (x.t) {
    case 'rect':
      return `<rect x="${n(x.x)}" y="${n(x.y)}" width="${n(x.w)}" height="${n(x.h)}"${x.r ? ` rx="${n(x.r)}"` : ''} fill="${x.color}"${alpha(x.opacity)}/>`;
    case 'circle':
      return `<circle cx="${n(x.cx)}" cy="${n(x.cy)}" r="${n(x.r)}" fill="${x.color}"${alpha(x.opacity)}/>`;
    case 'text':
      return (
        `<text x="${n(x.x)}" y="${n(x.y)}" font-size="${x.size}" font-weight="${x.weight}" fill="${x.color}"` +
        `${x.align && x.align !== 'left' ? ` text-anchor="${ANCHOR[x.align]}"` : ''}${alpha(x.opacity, 'fill-opacity')}>${esc(x.text)}</text>`
      );
    case 'logo': {
      const k = x.size / 512;
      const heads = DUO_HEADS.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${DUO_HEAD_R}" fill="${x.ink}"/>`).join('');
      return (
        `<g transform="translate(${n(x.x)} ${n(x.y)}) scale(${k.toFixed(5)})">` +
        `<rect width="512" height="512" rx="${DUO_RX}" fill="${x.tile}"/>` +
        `<path d="${DUO_M}" fill="none" stroke="${x.ink}" stroke-width="${DUO_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `${heads}</g>`
      );
    }
  }
}

export function sceneToSvg(scene: Scene): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"` +
    ` font-family="${esc(FONT_STACK)}">` +
    `<rect width="${scene.width}" height="${scene.height}" fill="${scene.background}"/>` +
    scene.nodes.map(node).join('') +
    '</svg>'
  );
}
