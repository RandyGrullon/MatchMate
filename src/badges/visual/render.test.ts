/**
 * Las insignias se dibujan (en el servidor, sin navegador): el componente de React con las variables del tema, los
 * `defs` compartidos, la animación y el SVG de texto que se pasa a PNG con resvg (la galería entera).
 */
import { Resvg } from '@resvg/resvg-js';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BadgeDefs, ensureBadgeDefs } from './BadgeDefs';
import { SHAPE_ORDER } from './geometry';
import { Insignia } from './Insignia';
import { makeLook, tierOfLevel } from './look';
import { TIER_ORDER } from './palette';
import { periodRibbon } from './period';
import { badgeDefsMarkup, badgeSvg, elementToXml, SHARED_DEFS } from './svg';
import { prefersCalm, UnlockInsignia } from './UnlockInsignia';
import type { BadgeLook, BadgeState } from './types';

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

const CLUB = makeLook({ shape: 'star', tier: 'oro', sport: 'bowling' });
const render = (props: Parameters<typeof Insignia>[0]) => renderToString(h(Insignia, props));

describe('<Insignia>', () => {
  it('sola, con nombre: role="img" con su <title>; al lado del nombre: aria-hidden', () => {
    const named = render({ badge: CLUB, size: 64, label: 'Club 250, oro' });
    expect(named).toMatch(/^<svg[^>]*role="img"[^>]*aria-labelledby="(mm-bt-[\w-]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(named)![1];
    expect(named).toContain(`<title id="${id}">Club 250, oro</title>`);
    const quiet = render({ badge: CLUB, size: 64 });
    expect(quiet).toContain('aria-hidden="true"');
    expect(quiet).not.toContain('role="img"');
    expect(quiet).not.toContain('<title');
  });

  it('tamaño real, viewBox de 128 y la clase bd (sombra del tema)', () => {
    const out = render({ badge: CLUB, size: 40, className: 'shrink-0' });
    expect(out).toContain('viewBox="0 0 128 128"');
    expect(out).toContain('width="40"');
    expect(out).toContain('height="40"');
    expect(out).toContain('class="bd shrink-0"');
    expect(render({ badge: CLUB, size: 64, px: 76, pad: true })).toMatch(/viewBox="-10 -10 148 148" width="76" height="76"/);
  });

  it('el metal viene de los defs compartidos y el borde de la variable del tema', () => {
    const out = render({ badge: CLUB, size: 64 });
    expect(out).toContain('fill="url(#mm-tier-oro)"');
    expect(out).toContain('stroke:var(--bd-rim-oro)');
    expect(out).toContain('clip-path="url(#mm-clip-star)"');
    expect(out).not.toContain('<defs>');
  });

  it('un color de liga trae su degradado con un id propio y un borde por tema', () => {
    const out = render({ badge: makeLook({ shape: 'hex', tier: { custom: '#0d9488' }, icon: 'bird', origin: 'liga' }), size: 128 });
    const id = /<linearGradient id="(mm-gc-[\w-]+)"/.exec(out)?.[1];
    expect(id).toMatch(/^mm-gc-[A-Za-z0-9_-]+$/);
    expect(out).toContain(`fill="url(#${id})"`);
    expect(out).toContain('stroke-opacity:var(--bd-l)');
    expect(out).toContain('stroke-opacity:var(--bd-d)');
    expect(out).toContain('>LIGA</text>');
  });

  it('cada estado se dibuja: bloqueada con los colores del tema, progreso con el acento', () => {
    for (const state of ['locked', 'progress', 'unlocked', 'new', 'review', 'hidden'] as BadgeState[]) {
      const out = render({ badge: CLUB, size: 64, state, progress: 0.5, label: 'Club 250' });
      expect(out, state).toContain('<svg');
    }
    const locked = render({ badge: CLUB, size: 64, state: 'locked' });
    expect(locked).toContain('fill:var(--bd-lock-fill)');
    expect(locked).toContain('stroke:var(--bd-lock-line)');
    expect(locked).not.toContain('mm-tier-oro');
    expect(render({ badge: CLUB, size: 64, state: 'progress', progress: 0.5 })).toContain('stroke:var(--accent)');
    expect(render({ badge: CLUB, size: 64, state: 'new' })).toContain('stroke:var(--bd-glow)');
    expect(render({ badge: CLUB, size: 64, state: 'review' })).toContain('opacity="0.6"');
  });

  it('el texto de la cinta va escapado', () => {
    const out = render({ badge: { ...CLUB, shape: 'shield', period: { long: 'A&B <C>', short: 'A&B' } }, size: 128 });
    expect(out).toContain('A&amp;B &lt;C&gt;');
  });
});

describe('defs compartidos', () => {
  it('cinco metales, el brillo y un recorte por forma', () => {
    const out = renderToString(h(BadgeDefs));
    for (const t of TIER_ORDER) expect(out).toContain(`id="mm-tier-${t}"`);
    expect(out).toContain('id="mm-shine"');
    for (const s of SHAPE_ORDER) expect(out).toContain(`id="mm-clip-${s}"`);
    expect(out).toContain('stop-color="#FFE8A0"');
    expect(SHARED_DEFS).toHaveLength(5 + 1 + 7);
    checkXml(badgeDefsMarkup());
  });

  it('sin navegador no hace nada; con documento se pone una sola vez', () => {
    expect(() => ensureBadgeDefs(undefined)).not.toThrow();
    const added: { id: string }[] = [];
    const doc = {
      body: { appendChild: (el: { id: string }) => added.push(el) },
      getElementById: (id: string) => added.find((e) => e.id === id) ?? null,
      createElement: () => {
        const holder = { innerHTML: '', get firstElementChild() { return { id: /id="([^"]+)"/.exec(holder.innerHTML)![1] }; } };
        return holder;
      },
    } as unknown as Document;
    ensureBadgeDefs(doc);
    ensureBadgeDefs(doc);
    expect(added).toEqual([{ id: 'mm-badge-defs' }]);
  });
});

describe('<UnlockInsignia>', () => {
  it('sin navegador sale calmada (el último cuadro, sin movimiento) con sus capas', () => {
    expect(prefersCalm()).toBe(true);
    const out = renderToString(h(UnlockInsignia, { badge: { ...CLUB, period: periodRibbon({ kind: 'year', year: 2026 }) }, label: 'Club 250, oro' }));
    expect(out).toContain('class="bd bd-anim bd-calm"');
    expect(out).toContain('viewBox="-36 -36 200 200"');
    expect(out).toContain('width="240"');
    for (const c of ['bd-a-all', 'bd-a-lock', 'bd-a-on', 'bd-a-band', 'bd-a-part', 'bd-a-ribbon']) expect(out).toContain(c);
    expect(out).toMatch(/--dx:-?[\d.]+px/);
  });
});

describe('SVG de texto y PNG', () => {
  it('XML bien formado en todas las formas, niveles, tamaños y estados, en claro y oscuro', () => {
    for (const shape of SHAPE_ORDER) {
      for (const tier of [...TIER_ORDER, 'unico' as const, { custom: '#facc15' }]) {
        for (const size of [24, 40, 64, 128] as const) {
          for (const state of ['locked', 'progress', 'unlocked', 'new', 'review', 'hidden'] as BadgeState[]) {
            const l = makeLook({ shape, tier, sport: 'tennis', period: periodRibbon({ kind: 'month', year: 2026, month: 10 }), top: 'TORNEO' });
            for (const mode of ['light', 'dark'] as const) {
              const svg = badgeSvg(l, { size, state, progress: 0.4, mode, label: 'Prueba' });
              checkXml(svg);
              // Los colores del tema quedan resueltos: nada de var(--…).
              expect(svg).not.toContain('var(');
            }
          }
        }
      }
    }
    expect(elementToXml({ tag: 'text', attrs: { textLength: 10, fontSize: 8 }, text: 'x' })).toBe('<text textLength="10" font-size="8">x</text>');
  });

  it('los temas cambian solo el borde: claro con rimL, oscuro con rimD', () => {
    const light = badgeSvg(CLUB, { size: 64 });
    const dark = badgeSvg(CLUB, { size: 64, mode: 'dark' });
    expect(light).toContain('stroke="#855A06"');
    expect(dark).toContain('stroke="#F6CF63"');
    expect(light.replace(/#855A06/g, '#F6CF63')).toBe(dark);
  });

  it('la galería entera en PNG (resvg): cada insignia pinta algo', () => {
    const cells: string[] = [];
    let x = 0;
    let y = 0;
    for (const shape of SHAPE_ORDER) {
      for (const level of [0, 1, 2, 3, 4, 5]) {
        const l: BadgeLook = makeLook({ shape, tier: tierOfLevel(level), sport: 'swimming', period: shape === 'hex' ? null : periodRibbon({ kind: 'year', year: 2026 }) });
        cells.push(badgeSvg(l, { size: 64, px: 64 }).replace('<svg ', `<svg x="${x}" y="${y}" `));
        x += 72;
      }
      x = 0;
      y += 72;
    }
    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${6 * 72}" height="${y}">${cells.join('')}</svg>`;
    const img = new Resvg(sheet, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render();
    expect(img.asPng().subarray(1, 4).toString()).toBe('PNG');
    // `pixels` copia todo el cuadro cada vez que se lee: una sola vez.
    const { width, pixels } = img;
    // Cada celda tiene pintura (el marco de metal no se quedó sin degradado).
    for (let r = 0; r < SHAPE_ORDER.length; r++) {
      for (let c = 0; c < 6; c++) {
        let painted = 0;
        for (let yy = r * 72; yy < r * 72 + 64; yy++) {
          for (let xx = c * 72; xx < c * 72 + 64; xx++) if (pixels[(yy * width + xx) * 4 + 3] > 200) painted++;
        }
        expect(painted, `${SHAPE_ORDER[r]} nivel ${c}`).toBeGreaterThan(64 * 64 * 0.3);
      }
    }
  });
});
