/**
 * Las piezas del rediseño «Calma y foco» en ui.tsx dibujadas sin navegador (renderToString), y sus medidas en
 * index.css: tarjetas sin borde, fichas de juego, bloque de fecha («OCT / 13», nunca el día de la semana), filas de 64 px
 * (56 en Pro), dos números lado a lado y el segmentado. Todo con los colores del tema (claro y oscuro).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it } from 'vitest';
import { Button, Card, DateBlock, GameTile, ListRow, RowIcon, SectionHeader, Segmented, StatDuo, cardBorder, monthShort, sectionLinkClass, toLocalDate } from './ui';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const firstClass = (html: string) => /class="([^"]*)"/.exec(html)?.[1].split(/\s+/) ?? [];
/** Ningún color fijo: todo del tema (sirve en claro y en oscuro). */
const noFixedColors = (html: string) => expect(html).not.toMatch(/\b(?:bg|text|border)-(?:white|black|gray|slate|zinc|neutral)\b/);

let indexCss = '';
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync(path: URL, encoding: 'utf8'): string };
  indexCss = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
});

describe('tokens (index.css)', () => {
  /** El bloque de variables de :root, del oscuro del teléfono y del oscuro elegido. */
  const block = (start: string) => indexCss.slice(indexCss.indexOf(start), indexCss.indexOf('}', indexCss.indexOf(start)));

  it('--fg-2 y --faint en claro, en oscuro (teléfono) y en oscuro elegido, y como colores de Tailwind', () => {
    expect(block(':root {\n  color-scheme: light;')).toContain('--fg-2: #3d4352;');
    expect(block(':root {\n  color-scheme: light;')).toContain('--faint: #a3a9b6;');
    for (const dark of [':root:not([data-theme="light"]) {\n    color-scheme: dark;', ':root[data-theme="dark"] {\n  color-scheme: dark;']) {
      expect(block(dark)).toContain('--fg-2: #c9cdd6;');
      expect(block(dark)).toContain('--faint: #646b7b;');
      expect(block(dark)).toContain('--seg-on: #303545;');
    }
    for (const t of ['--color-fg-2: var(--fg-2);', '--color-faint: var(--faint);', '--color-seg-on: var(--seg-on);']) expect(indexCss).toContain(t);
    // Los valores de antes no cambian.
    expect(indexCss).toContain('--accent: #4338ca;');
    expect(indexCss).toContain('--surface-2: #eef0f4;');
  });

  it('sombra de tarjeta suave en claro y ninguna en oscuro', () => {
    expect(indexCss).toContain('--shadow-card: 0 1px 2px rgb(21 24 34 / 0.04), 0 8px 24px rgb(21 24 34 / 0.05);');
    expect(indexCss.match(/--shadow-card: none;/g)).toHaveLength(2);
  });

  it('tipografía, radios y alturas como utilidades (text-hero 64, text-title 32/28, rounded-btn 18, h-btn 56/48, min-h-row 64/56)', () => {
    for (const t of [
      '--text-hero: 4rem;',
      '--text-hero-sm: 3.25rem;',
      '--text-tile: 2.125rem;',
      '--text-tile-pro: 1.5rem;',
      '--text-title: 2rem;',
      '--text-title-pro: 1.75rem;',
      '--text-section: 1.1875rem;',
      '--text-row-num: 1.375rem;',
      '--radius-btn: 1.125rem;',
      '--radius-tile: 1.125rem;',
      '--radius-sheet: 1.75rem;',
      '--spacing-btn: 3.5rem;',
      '--spacing-btn-pro: 3rem;',
      '--spacing-row: 4rem;',
      '--spacing-row-pro: 3.5rem;',
      '--spacing-key: 3.625rem;',
      '--spacing-touch: 2.75rem;',
    ])
      expect(indexCss).toContain(t);
    expect(indexCss).toMatch(/@utility num \{\s*font-variant-numeric: tabular-nums;\s*letter-spacing: -0\.03em;/);
  });
});

describe('Card', () => {
  it('sin borde, redondeada (24 px), blanca y con la sombra suave', () => {
    const cls = firstClass(renderToString(h(Card, null, 'x')));
    expect(cls).toEqual(expect.arrayContaining(['rounded-3xl', 'card-shadow', 'bg-surface']));
    expect(cls).not.toContain('border');
    expect(cls).not.toContain('border-line');
  });

  it('las que marcan un estado con el color del borde lo siguen teniendo (1 px); si es solo al pasar, transparente', () => {
    expect(cardBorder('p-4 border-ok/40')).toBe('border');
    expect(cardBorder('border-warn')).toBe('border');
    expect(cardBorder('overflow-hidden hover:border-accent/50')).toBe('border border-transparent');
    expect(cardBorder('p-4 bg-accent-soft')).toBeNull();
    expect(cardBorder(undefined)).toBeNull();
    expect(firstClass(renderToString(h(Card, { className: 'border-ok/40', children: 'x' })))).toEqual(expect.arrayContaining(['border', 'border-ok/40']));
  });

  it('`soft`: acento suave y sin sombra («lo de ahora»)', () => {
    const cls = firstClass(renderToString(h(Card, { soft: true, children: 'x' })));
    expect(cls).toContain('bg-accent-soft');
    expect(cls).not.toContain('card-shadow');
  });
});

describe('Button', () => {
  it('xl (56 px, radio 18) para el principal en Lite y lg (48 px) en Pro; sm y md como siempre', () => {
    expect(firstClass(renderToString(h(Button, { variant: 'primary', size: 'xl' }, 'Seguir mi juego 3')))).toEqual(
      expect.arrayContaining(['h-btn', 'rounded-btn', 'text-[17px]', 'px-6', 'bg-accent']),
    );
    expect(firstClass(renderToString(h(Button, { variant: 'quiet', size: 'lg' }, 'Planilla')))).toEqual(
      expect.arrayContaining(['h-btn-pro', 'bg-surface-2', 'text-fg']),
    );
    expect(firstClass(renderToString(h(Button, { variant: 'soft' }, 'Voy')))).toEqual(expect.arrayContaining(['h-10', 'rounded-xl', 'bg-accent-soft', 'text-accent']));
    expect(firstClass(renderToString(h(Button, { size: 'sm' }, 'x')))).toEqual(expect.arrayContaining(['h-8', 'px-3', 'rounded-xl']));
    // Solo ícono: cuadrado del mismo alto.
    expect(firstClass(renderToString(h(Button, { size: 'xl', icon: h('svg', { className: 'size-5' }) })))).toContain('w-btn');
  });

  it('cargando: la ruedita del tamaño del ícono (no se mueve nada)', () => {
    const html = renderToString(h(Button, { size: 'xl', loading: true, icon: h('svg', { className: 'size-5' }) }, 'Guardar'));
    expect(html).toContain('disabled=""');
    expect(html).toMatch(/<svg[^>]*class="[^"]*size-5 animate-spin/);
  });
});

describe('GameTile', () => {
  it('anotado: nombre arriba y el número grande (34 px; 24 en Pro)', () => {
    const html = renderToString(h(GameTile, { label: 'Juego 1', score: 187 }));
    expect(text(html)).toBe('Juego 1 187');
    expect(firstClass(html)).toEqual(expect.arrayContaining(['h-[84px]', 'rounded-tile', 'bg-surface-2']));
    expect(html).toMatch(/<b class="num text-tile">187<\/b>/);
    expect(renderToString(h(GameTile, { label: 'J1', score: 187, dense: true }))).toMatch(/<b class="num text-tile-pro">187<\/b>/);
    noFixedColors(html);
  });

  it('a medias: borde punteado, «A medias» y la barrita con lo que lleva', () => {
    const html = renderToString(h(GameTile, { label: 'Juego 3', state: 'draft', progress: 0.55 }));
    expect(text(html)).toBe('Juego 3 A medias');
    expect(firstClass(html)).toEqual(expect.arrayContaining(['border-dashed', 'border-accent', 'bg-accent-soft', 'text-accent']));
    expect(html).toContain('style="width:55%"');
    // Fuera de rango no se sale de la barra; sin progreso, sin barra.
    expect(renderToString(h(GameTile, { label: 'J', state: 'draft', progress: 3 }))).toContain('width:100%');
    expect(renderToString(h(GameTile, { label: 'J', state: 'draft' }))).not.toContain('width:');
    // En un teléfono angosto (360 px) la ficha mide 84 px: «A medias» cabe con menos margen y un punto menos.
    expect(firstClass(html)).toContain('max-[389px]:px-2');
    expect(html).toContain('text-[15px] max-[389px]:text-sm');
  });

  it('a medias en Pro: lo que lleva hasta ahora («74…»)', () => {
    expect(text(renderToString(h(GameTile, { label: 'J3', state: 'draft', score: 74, dense: true })))).toBe('J3 74…');
  });

  it('el que sigue: vacío con un «+»; la serie: solo contorno', () => {
    const next = renderToString(h(GameTile, { label: 'Juego 3', state: 'next' }));
    expect(text(next)).toBe('Juego 3 por anotar');
    expect(next).toContain('sr-only');
    expect(firstClass(next)).toContain('bg-accent-soft');
    expect(firstClass(renderToString(h(GameTile, { label: 'Serie', score: 397, state: 'total' })))).toContain('shadow-[inset_0_0_0_1px_var(--line)]');
  });

  it('con onClick es un botón que dice qué juego abre', () => {
    const html = renderToString(h(GameTile, { label: 'Juego 3', state: 'draft', onClick: () => {} }));
    expect(html).toMatch(/^<button type="button" aria-label="Juego 3: a medias"/);
    expect(renderToString(h(GameTile, { label: 'Juego 1', score: 187, onClick: () => {} }))).toContain('aria-label="Juego 1: 187"');
    expect(renderToString(h(GameTile, { label: 'Juego 1', score: 187 }))).toMatch(/^<div /);
  });
});

describe('DateBlock', () => {
  it('el mes arriba y el día grande; la fecha del día no se corre por la zona horaria', () => {
    const html = renderToString(h(DateBlock, { date: '2026-10-13' }));
    expect(html).toMatch(/^<time dateTime="2026-10-13"/);
    expect(html).toMatch(/>OCT<\/span><b [^>]*>13<\/b>/);
    expect(html).toContain('<span class="sr-only">13 de octubre</span>');
    expect(firstClass(html)).toEqual(expect.arrayContaining(['h-[54px]', 'w-[50px]', 'bg-surface-2']));
    expect(firstClass(renderToString(h(DateBlock, { date: '2026-10-13', raised: true })))).toContain('bg-surface');
  });

  it('siempre el mes (marzo es MAR), nunca el día de la semana', () => {
    expect(['2026-01-05', '2026-03-03', '2026-09-30', '2026-12-31'].map((d) => monthShort(toLocalDate(d)!))).toEqual(['ENE', 'MAR', 'SEP', 'DIC']);
    // Un martes de octubre: OCT, no MAR.
    expect(monthShort(toLocalDate('2026-10-13')!)).toBe('OCT');
    expect(toLocalDate(new Date(2026, 9, 24))?.getDate()).toBe(24);
  });

  it('lo que no es fecha no dibuja nada', () => {
    expect(toLocalDate('mañana')).toBeNull();
    expect(renderToString(h(DateBlock, { date: 'x' }))).toBe('');
  });
});

describe('ListRow', () => {
  it('título, subtítulo y número grande; 64 px en Lite y 56 en Pro', () => {
    const html = render(h(ListRow, { leading: h(RowIcon, null, 'i'), title: 'Pedro Gómez', subtitle: '212 · 245 · 201', value: 658 }));
    expect(text(html)).toBe('i Pedro Gómez 212 · 245 · 201 658');
    expect(firstClass(html)).toEqual(expect.arrayContaining(['mm-row', 'min-h-row', 'pl-5']));
    expect(html).toMatch(/<span class="num shrink-0 text-row-num">658<\/span>/);
    const dense = render(h(ListRow, { title: 'Pedro', value: 658, dense: true }));
    expect(firstClass(dense)).toContain('min-h-row-pro');
    expect(dense).toContain('text-row-num-pro');
    // Sin link ni botón: no se toca y no lleva chevron.
    expect(html).not.toMatch(/<a |<button|lucide-chevron-right/);
  });

  it('con link: toda la fila se toca (el link la cubre) y lleva chevron', () => {
    const html = render(h(ListRow, { title: 'Jugadores', subtitle: '6 en la liga', to: '/l/x/jugadores' }));
    expect(html).toMatch(/<a class="mm-row-main [^"]*after:absolute after:inset-0[^"]*" href="\/l\/x\/jugadores"/);
    expect(html).toContain('lucide-chevron-right');
    expect(html).toMatch(/text-faint/);
  });

  it('con algo al final («Voy»): queda encima del link y sin chevron; la fila «Tú» en acento suave', () => {
    const html = render(h(ListRow, { title: 'Práctica', to: '/l/x/e/1', trailing: h('button', null, 'Voy'), me: true }));
    expect(html).toContain('<div class="relative z-[1] shrink-0"><button>Voy</button></div>');
    expect(html).not.toContain('lucide-chevron-right');
    expect(firstClass(html)).toEqual(expect.arrayContaining(['mm-row-me', 'bg-accent-soft']));
    // La línea entre filas empieza a 20 px y la fila «Tú» no lleva.
    expect(indexCss).toMatch(/\.mm-row \+ \.mm-row::before \{[^}]*left: 20px;/);
    expect(indexCss).toContain('.mm-row.mm-row-me::before,\n.mm-row-me + .mm-row::before { display: none; }');
  });

  it('con onClick es un botón; el ícono de la fila en caja de 40 px (ámbar solo para «Por aprobar»)', () => {
    expect(render(h(ListRow, { title: 'Aprobar juegos', onClick: () => {} }))).toMatch(/<button type="button" class="mm-row-main/);
    expect(firstClass(renderToString(h(RowIcon, null, 'i')))).toEqual(expect.arrayContaining(['size-10', 'rounded-xl', 'bg-surface-2', 'text-fg-2']));
    expect(firstClass(renderToString(h(RowIcon, { tone: 'warn', children: 'i' })))).toEqual(expect.arrayContaining(['bg-warn-soft', 'text-warn']));
  });
});

describe('StatDuo', () => {
  it('dos números grandes lado a lado; la mitad que lleva a algún lado se toca entera y lleva chevron', () => {
    const html = render(h(StatDuo, { left: { value: 195, label: 'Tu promedio' }, right: { value: '2.º', label: 'en la tabla, de 6', to: '/l/x/ranking' } }));
    expect(text(html)).toBe('195 Tu promedio 2.º en la tabla, de 6');
    expect(firstClass(html)).toEqual(expect.arrayContaining(['card-shadow', 'rounded-3xl', 'bg-surface']));
    expect(html.match(/<b class="num block text-stat">/g)).toHaveLength(2);
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*w-px[^"]*bg-line"/);
    expect(html).toMatch(/<a [^>]*href="\/l\/x\/ranking"[^>]*>.*lucide-chevron-right/);
    expect(html.match(/lucide-chevron-right/g)).toHaveLength(1);
  });
});

describe('Segmented', () => {
  it('opciones como radios; la elegida en blanco (seg-on) y se tocan en 44 px', () => {
    const html = renderToString(
      h(Segmented, {
        label: 'Tabla',
        options: [
          { key: 'scratch', label: 'Scratch' },
          { key: 'hcp', label: 'Con hcp' },
        ],
        value: 'hcp',
        onChange: () => {},
      }),
    );
    expect(html).toMatch(/^<div role="radiogroup" aria-label="Tabla" class="inline-flex [^"]*bg-surface-2/);
    expect(html).toMatch(/aria-checked="false" class="mm-seg-opt [^"]*text-muted[^"]*">Scratch/);
    expect(html).toMatch(/aria-checked="true" class="mm-seg-opt [^"]*bg-seg-on text-fg[^"]*">Con hcp/);
    // Se tocan en 44 px como mínimo aunque se vean más bajas (36 px, o 28 en «Por juego | Por mes»).
    expect(indexCss).toMatch(/\.mm-seg-opt::after \{[^}]*height: max\(100% \+ 8px, 44px\);/);
    noFixedColors(html);
  });

  it('`full`: todo el ancho, opciones iguales (caben 3 en 360 px)', () => {
    const html = renderToString(
      h(Segmented, {
        label: 'Práctica',
        full: true,
        options: [
          { key: 'a', label: 'Planilla' },
          { key: 'b', label: 'Resultados' },
          { key: 'c', label: 'Pistas' },
        ],
        value: 'a',
        onChange: () => {},
      }),
    );
    expect(firstClass(html)).toEqual(expect.arrayContaining(['flex', 'w-full']));
    expect(html.match(/min-w-0 flex-1 justify-center px-2/g)).toHaveLength(3);
  });
});

describe('SectionHeader', () => {
  it('título de sección (19 px) con el link a la derecha', () => {
    const html = render(h(SectionHeader, { title: 'Lo que viene', action: h('a', { className: sectionLinkClass }, 'Calendario') }));
    expect(html).toMatch(/<h2 class="text-section">Lo que viene<\/h2><a class="[^"]*min-h-11[^"]*text-accent">Calendario<\/a>/);
  });
});
