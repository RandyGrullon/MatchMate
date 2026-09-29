/**
 * Colores sobre los del tema: en el modo oscuro el oro, la plata y el bronce son claros, así que el número de la
 * medalla no puede ir en blanco fijo (no se leía). Va del color del fondo de la app, que cambia con el modo.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { LoadError, Loading, Position, Sheet, isDeniedError, keyboardInset } from './ui';

const classOf = (pos: number) => /class="([^"]*)"/.exec(renderToString(h(Position, { pos })))?.[1].split(/\s+/) ?? [];

describe('medallas de posición', () => {
  it('oro, plata y bronce con el número del color del fondo (sirve en claro y en oscuro)', () => {
    for (const [pos, bg] of [
      [1, 'bg-gold'],
      [2, 'bg-silver'],
      [3, 'bg-bronze'],
    ] as const) {
      const cls = classOf(pos);
      expect(cls).toContain(bg);
      expect(cls).toContain('text-bg');
      expect(cls).not.toContain('text-white');
    }
  });

  it('del 4 en adelante, solo el número', () => {
    const cls = classOf(4);
    expect(cls).toContain('text-muted');
    expect(cls.some((c) => c.startsWith('bg-'))).toBe(false);
  });
});

describe('carga y errores', () => {
  it('la carga es el logo de MatchMate (sirve para todos los deportes), no una bola de boliche', () => {
    const html = renderToString(h(Loading, { label: 'Cargando la liga' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Cargando la liga"');
    expect(html).toContain('mm-spin');
    expect(html.match(/class="mm-head mm-head-\d"/g)).toHaveLength(2);
    expect(html).not.toContain('bowl-loader');
  });

  it('sin señal o con el servidor caído: «Reintentar» (sin recargar la app)', () => {
    const html = renderToString(h(LoadError, { error: new Error('Failed to fetch') }));
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('recarga la página');
  });

  it('sin permiso: reintentar no sirve, no sale el botón', () => {
    for (const error of [new Error('permission-denied'), Object.assign(new Error('no_permitido'), { kind: 'permission' })]) {
      expect(isDeniedError(error)).toBe(true);
      const html = renderToString(h(LoadError, { error }));
      expect(html).toContain('No tienes permiso para ver esto.');
      expect(html).not.toContain('Reintentar');
    }
    expect(isDeniedError(Object.assign(new Error('x'), { kind: 'network' }))).toBe(false);
  });
});

describe('hoja (Sheet)', () => {
  const noop = () => {};
  const sheet = (extra: Record<string, unknown> = {}) =>
    renderToString(h(Sheet, { open: true, onClose: noop, title: 'Invitar a la liga', children: h('p', null, 'contenido'), ...extra }));
  const dialogClass = (html: string) => /<dialog[^>]*class="([^"]*)"/.exec(html)?.[1].split(/\s+/) ?? [];

  /** src/index.css y el selector de deporte tal cual (Vitest deja vacíos los .css importados): se leen del disco. */
  let indexCss = '';
  let switcher = '';
  let uiSource = '';
  beforeAll(async () => {
    const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync(path: URL, encoding: 'utf8'): string };
    indexCss = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    switcher = fs.readFileSync(new URL('./SportSwitcher.tsx', import.meta.url), 'utf8');
    uiSource = fs.readFileSync(new URL('./ui.tsx', import.meta.url), 'utf8');
  });

  it('en el teléfono sube desde abajo de lado a lado; en la computadora, un cuadro en el centro', () => {
    const cls = dialogClass(sheet());
    for (const c of ['mm-sheet', 'm-0', 'mt-auto', 'max-h-[88dvh]', 'w-full', 'max-w-none', 'rounded-t-3xl', 'border-b-0']) expect(cls).toContain(c);
    for (const c of ['sm:m-auto', 'sm:max-w-lg', 'sm:rounded-2xl', 'sm:border-b']) expect(cls).toContain(c);
    // Colores del tema (sirve en claro y en oscuro).
    expect(cls).toContain('bg-surface');
    expect(cls.some((c) => /^(bg|text|border)-(white|black|gray|slate|zinc)/.test(c))).toBe(false);
  });

  it('título con su id, línea opcional, X de 44 px, contenido que se desliza y pie fijo', () => {
    const html = sheet({ subtitle: 'Liga de los martes', footer: h('button', null, 'Enviar') });
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Invitar a la liga');
    expect(html).toContain('Liga de los martes');
    expect(html).toMatch(/aria-label="Cerrar" class="[^"]*size-11/);
    expect(html).toMatch(/class="modal-scroll [^"]*overflow-y-auto[^"]*"><p>contenido<\/p>/);
    // Con pie, el espacio de la barra del iPhone va en el pie (lo último de la hoja).
    expect(html).toMatch(/border-t border-line[^"]*safe-area-inset-bottom[^"]*"><button>Enviar<\/button>/);
    expect(html.indexOf('contenido')).toBeLessThan(html.indexOf('Enviar'));
  });

  it('sin pie, el contenido deja libre la barra del teléfono; sin línea, no sale', () => {
    const html = sheet();
    expect(html).toMatch(/class="modal-scroll [^"]*safe-area-inset-bottom/);
    expect(html).not.toContain('border-t border-line');
    expect(html).not.toContain('text-sm text-muted');
  });

  it('la barrita de arriba es solo adorno y la hoja no se arrastra con el dedo', () => {
    const html = sheet();
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*rounded-full bg-line sm:hidden"/);
    expect(html).not.toMatch(/ontouch|onpointer|draggable/i);
    // Las reglas de los modales quietos siguen en index.css.
    expect(indexCss).toContain('dialog { touch-action: none; overscroll-behavior: contain; }');
    expect(indexCss).toContain('dialog .modal-scroll { touch-action: pan-y; overscroll-behavior: contain; }');
  });

  it('cerrada no dibuja el contenido', () => {
    const html = renderToString(h(Sheet, { open: false, onClose: noop, title: 'Invitar', children: h('p', null, 'contenido') }));
    expect(html).toContain('<dialog');
    expect(html).not.toContain('contenido');
    expect(html).not.toContain('Invitar');
  });

  it('la animación de las hojas vive en index.css (también la usa el selector de deporte) y respeta menos movimiento', () => {
    expect(indexCss).toMatch(/@keyframes mm-sheet-up \{\s*from \{ transform: translateY\(100%\); \}/);
    expect(indexCss).toContain('.mm-sheet[open] { animation: mm-sheet-up 0.3s var(--ease-out); }');
    expect(indexCss).toMatch(/@media \(min-width: 640px\) \{\s*\.mm-sheet\[open\] \{ animation: pop-in/);
    // La regla general de menos movimiento va al final y apaga todas las animaciones.
    expect(indexCss.lastIndexOf('prefers-reduced-motion: reduce')).toBeGreaterThan(indexCss.indexOf('mm-sheet-up'));
    expect(switcher).toContain("'mm-sheet ");
    expect(switcher).not.toContain('@keyframes');
    expect(switcher).not.toContain('<style');
  });

  it('con el teclado abierto: cuánto tapa (lo de la ventana debajo de lo que se ve), y nada si no es el teclado', () => {
    // iPhone de 667: el teclado deja 367 a la vista.
    expect(keyboardInset(667, { height: 367, offsetTop: 0 })).toBe(300);
    // Safari corrió lo que se ve para mostrar el buscador.
    expect(keyboardInset(667, { height: 367, offsetTop: 40 })).toBe(260);
    // Sin teclado, barras del navegador, zoom o sin visualViewport: 0.
    expect(keyboardInset(667, { height: 667, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(667, { height: 620, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(667, { height: 300, offsetTop: 0, scale: 2 })).toBe(0);
    expect(keyboardInset(667, null)).toBe(0);
    // Mientras tanto, lo que no cabe (el link de la hoja de invitar) se esconde.
    expect(indexCss).toContain('dialog[data-kb] .mm-kb-hide { display: none; }');
  });

  it('al quitarla abierta se cierra antes de salir de la página (efecto de layout: el foco vuelve al botón)', () => {
    const src = uiSource.slice(uiSource.indexOf('export function Sheet('), uiSource.indexOf('export function Tabs'));
    expect(src).toMatch(/useLayoutEffect\(\(\) => \{\s*const d = ref\.current;\s*return \(\) => \{\s*if \(d\?\.open\) d\.close\(\);/);
  });
});
