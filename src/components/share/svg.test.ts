import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { buildScene, type CardFrame, type ShareCard } from './cards';
import { INK, sportColor } from './palette';
import { sceneToSvg } from './svg';

/** XML bien formado (lo justo para estos SVG): etiquetas balanceadas y atributos con comillas. */
function checkXml(xml: string) {
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g;
  let last = 0;
  for (const m of xml.matchAll(tag)) {
    if (/[<>]/.test(xml.slice(last, m.index))) throw new Error(`XML roto antes de ${m[0]}`);
    last = m.index + m[0].length;
    if (m[1]) {
      if (stack.pop() !== m[2]) throw new Error(`</${m[2]}> no cierra lo que abrió`);
    } else if (!m[4]) stack.push(m[2]);
  }
  if (/[<>]/.test(xml.slice(last))) throw new Error('XML roto al final');
  if (stack.length) throw new Error(`sin cerrar: ${stack.join(', ')}`);
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;

const cards: [string, ShareCard, string][] = [
  [
    'tabla de natación',
    {
      kind: 'table',
      title: 'Copa Delfín <sub-12> & "amigos"',
      subtitle: 'Prueba 3 · 50 m libre',
      nameLabel: 'Nadador',
      columns: [{ label: 'Pts', optional: true }, { label: 'Tiempo', strong: true }],
      sections: [
        {
          heading: 'Femenino · 9-10',
          rows: [
            { rank: 1, name: 'Ana Pérez', sub: 'Delfines', dot: '#0ea5e9', values: ['6', '32.45'] },
            { rank: null, name: 'Rosa Díaz', sub: 'Tiburones', dim: true, values: ['', 'DQ'] },
          ],
        },
      ],
      note: 'Resultados provisionales.',
    },
    'swimming',
  ],
  [
    'resultado de tenis',
    {
      kind: 'result',
      title: 'Liga de tenis',
      status: { label: 'Final', tone: 'accent' },
      sides: [
        { name: 'Ana', winner: true, cells: [{ text: '7', strong: true }, { text: '6', strong: true }] },
        { name: 'Rosa', cells: [{ text: '6', sup: '4' }, { text: '2' }] },
      ],
    },
    'tennis',
  ],
];

describe('la imagen en SVG (y pasada a PNG)', () => {
  it.each(cards)('%s: SVG bien formado, textos escapados y PNG de 1080 con el color del deporte', (_, card, sport) => {
    const frame: CardFrame = { sportLabel: sport, color: sportColor(sport), date: '27 sep 2026', link: 'https://matchmate.do/l/x' };
    const scene = buildScene(card, frame);
    const svg = sceneToSvg(scene);
    checkXml(svg);
    expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}"`)).toBe(true);
    expect(svg).not.toContain('<sub-12>');
    if (card.kind === 'table') expect(svg).toContain('Copa Delfín &lt;sub-12&gt; &amp; &quot;amigos&quot;');

    const img = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, font: { loadSystemFonts: false } }).render();
    expect(img.width).toBe(1080);
    expect(img.height).toBe(scene.height * 2);
    const px = (x: number, y: number) => {
      const i = (y * img.width + x) * 4;
      return hex(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]);
    };
    // Esquina: el color del deporte. Centro del cuadro blanco: blanco.
    expect(px(4, 4)).toBe(frame.color.toLowerCase());
    const box = scene.nodes.find((n) => n.t === 'rect' && n.color === INK.surface && n.opacity == null && n.w === scene.width - 32);
    if (box?.t !== 'rect') throw new Error('sin cuadro blanco');
    expect(px(Math.round((box.x + 30) * 2), Math.round((box.y + box.h - 4) * 2))).toBe('#ffffff');
  });
});
