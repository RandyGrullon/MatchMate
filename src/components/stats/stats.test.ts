/**
 * Lo que sale de los cuadros dibujado sin navegador (renderToString): los porcentajes, el pino por pino (mapa de calor,
 * fuertes y débiles, spares según lo que quedó), la tendencia, los splits en la hoja y cómo se abre el editor desde el
 * botón de cuadros.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL_PINS } from '../../lib/bowling';
import type { GameFrames } from '../../lib/types';
import { FrameEditor, editorValue } from '../frames/FrameEditor';
import { FramesGrid, FramesSheet } from '../frames/FramesGrid';
import { heatStyle } from '../frames/PinHeatDeck';
import { FrameStatsPanel, heatPins } from './FrameStatsPanel';
import { monthLabels, TrendSection } from './TrendSection';
import { chartRange, labelStep, ScoreChart } from '../ScoreChart';
import { pinReport } from '../../lib/bowlingStats';

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const mask = (...pins: number[]) => pins.reduce((m, p) => m | (1 << (p - 1)), 0);

/** Un juego pino por pino: 'X' o lo que quedó y si se hizo el spare. */
function pinGame(...specs: ('X' | [number[], boolean])[]): GameFrames {
  const rolls: number[] = [];
  const masks: number[] = [];
  for (const s of specs) {
    if (s === 'X') {
      rolls.push(10);
      masks.push(ALL_PINS);
      continue;
    }
    const [leave, spare] = s;
    const left = mask(...leave);
    rolls.push(10 - leave.length, spare ? leave.length : 0);
    masks.push(ALL_PINS & ~left, spare ? left : 0);
  }
  return { rolls, masks };
}

/** X · 9/ · 8- (7-10) · 9- · X · X · 8/ · 6/ · 8/ · X 9/ */
const GAME = pinGame('X', [[10], true], [[7, 10], false], [[10], false], 'X', 'X', [[4, 7], true], [[2, 4, 5, 8], true], [[6, 10], true], 'X', [[10], true]);
const KEYPAD: GameFrames = { rolls: GAME.rolls };

describe('por cuadros y pino por pino', () => {
  it('los porcentajes con cuántos juegos se anotaron por cuadros', () => {
    const t = text(renderToString(h(FrameStatsPanel, { frames: [GAME], games: 3 })));
    expect(t).toContain('Con 1 juego anotado por cuadros (de 3)');
    for (const s of ['Strikes 36% 4 de 11', 'Spares 67% 4 de 6', 'Cuadros abiertos 20% 2 de 10', 'Primera bola 8.8', 'Racha de strikes 2', 'Juegos limpios 0']) {
      expect(t).toContain(s);
    }
  });

  it('pino por pino: el mapa, los fuertes y débiles y los spares según lo que quedó', () => {
    const games = Array.from({ length: 2 }, () => GAME);
    const out = renderToString(h(FrameStatsPanel, { frames: games, games: 2 }));
    const t = text(out);
    expect(t).toContain('Con 2 juegos anotados pino por pino (22 primeras bolas)');
    expect(out).toContain('aria-label="Pino 10: se queda parado el 45% (10 de 22)"');
    expect(out).toContain('role="radiogroup" aria-label="Qué ver en los pinos"');
    expect(t).toContain('A mejorar');
    expect(t).toContain('Te queda mucho el pino 10: en el 45% de tus primeras bolas.');
    expect(t).toContain('Spares según lo que quedó');
    expect(t).toContain('Pino 10 4 de 6 67%');
    expect(t).toContain('7-10 split 0 de 2 0%');
    expect(t).toContain('Un pino 67% 4 de 6');
    expect(t).toContain('Sin splits 83% 10 de 12');
    expect(t).toContain('Splits 0% 0 de 2');
  });

  it('de otro jugador: los números, pero no los fuertes y débiles en palabras', () => {
    const t = text(renderToString(h(FrameStatsPanel, { frames: [GAME, GAME], games: 2, mine: false })));
    expect(t).toContain('Pino por pino');
    expect(t).not.toContain('A mejorar');
    expect(t).not.toContain('Te queda mucho');
  });

  it('sin cuadros: a quien son sus juegos le dice cómo verlos; a otro, nada', () => {
    expect(text(renderToString(h(FrameStatsPanel, { frames: [], games: 4 })))).toContain('Anota tus juegos por cuadros');
    expect(renderToString(h(FrameStatsPanel, { frames: [], games: 4, mine: false }))).toBe('');
    expect(renderToString(h(FrameStatsPanel, { frames: [], games: 0 }))).toBe('');
  });

  it('por teclado: los porcentajes y cómo ver el pino por pino', () => {
    const t = text(renderToString(h(FrameStatsPanel, { frames: [KEYPAD], games: 1 })));
    expect(t).toContain('Strikes 36%');
    expect(t).not.toContain('Spares según lo que quedó');
    expect(t).toContain('Anota pino por pino (Pines)');
  });

  it('los pinos del mapa en las dos vistas', () => {
    const report = pinReport([GAME]);
    const left = heatPins(report, 'quedan');
    expect(left[9]).toMatchObject({ pin: 10, value: '45%', level: 3 });
    expect(left[0]).toMatchObject({ pin: 1, value: '0%', level: 0 });
    const spare = heatPins(report, 'spare');
    expect(spare[9]).toMatchObject({ pin: 10, value: '60%', level: 2 });
    expect(spare[0]).toMatchObject({ pin: 1, value: null, label: 'Pino 1: todavía no le ha quedado para el spare' });
  });

  it('el color del mapa: un tono del tema y el texto que contrasta', () => {
    expect(heatStyle(0)).toEqual({ background: 'color-mix(in oklab, var(--accent) 10%, var(--surface))', color: 'var(--fg)' });
    expect(heatStyle(4)).toEqual({ background: 'color-mix(in oklab, var(--accent) 92%, var(--surface))', color: 'var(--accent-fg)' });
    expect(heatStyle(9).background).toContain('92%');
  });
});

describe('tendencia', () => {
  const games = [
    ...Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, score: 150, label: `J${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, score: 180, label: `K${i}` })),
  ];

  it('los últimos juegos con la media móvil, por mes y si vas subiendo', () => {
    const out = renderToString(h(TrendSection, { games, average: 165 }));
    const t = text(out);
    expect(t).toContain('Últimos 20 juegos');
    expect(t).toContain('media de 5');
    expect(t).toContain('promedio 165');
    expect(out).toContain('data-serie="media"');
    expect(out).toContain('aria-label="Ver la tendencia"');
    expect(t).toContain('Por mes');
    expect(t).toContain('Vas subiendo: tus últimos 10 juegos promedian 180, 30 más que los 10 anteriores.');
  });

  it('los meses debajo de la gráfica: cortos y, si son de dos años, con el año en enero y el primero', () => {
    expect(monthLabels(['2026-07', '2026-08', '2026-09'])).toEqual(['jul', 'ago', 'sep']);
    expect(monthLabels(['2025-11', '2025-12', '2026-01', '2026-02'])).toEqual(['nov 25', 'dic', 'ene 26', 'feb']);
    // Con muchos meses en un teléfono, uno sí y otro no (siempre el último).
    const points = Array.from({ length: 12 }, (_, i) => ({ score: 150 + i, label: `M${i}` }));
    const labels = monthLabels(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
    const out = renderToString(h(ScoreChart, { points, average: null, xLabels: labels }));
    expect(labelStep(12, 330)).toBe(2);
    expect(labelStep(4, 330)).toBe(1);
    const shown = [...out.matchAll(/data-x-label="">([^<]+)</g)].map((m) => m[1]);
    expect(shown).toEqual(['feb', 'abr', 'jun', 'ago', 'oct', 'dic']);
  });

  it('la media móvil siempre cabe en la gráfica (aunque traiga juegos de antes de los que se ven)', () => {
    // 5 juegos de 250 y 30 de ~140: la media de los primeros puntos que se ven pasa de 200.
    const all = [...Array.from({ length: 5 }, () => 250), ...Array.from({ length: 30 }, (_, i) => 130 + (i % 3) * 10)];
    const games = all.map((score, i) => ({ date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, score, label: `J${i}` }));
    const out = renderToString(h(TrendSection, { games, average: 150 }));
    const d = out.match(/<path d="([^"]+)"[^>]*data-serie="media"/)![1];
    const ys = [...d.matchAll(/[ML][\d.]+,([\d.-]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200 - 22);
    // El rango del eje incluye todo lo que se dibuja.
    expect(chartRange([140, 150], [228, 150], 150)).toEqual({ lo: 100, hi: 250 });
    expect(chartRange([140, 150], [70, 150], null)).toEqual({ lo: 50, hi: 200 });
    expect(chartRange([300, 300], null, 300)).toEqual({ lo: 250, hi: 300 });
  });

  it('de otro jugador, en tercera persona; un solo mes, sin «Por mes»; menos de 2 juegos, nada', () => {
    const t = text(renderToString(h(TrendSection, { games: games.slice(10), average: null, mine: false })));
    expect(t).toContain('Va parejo: sus últimos 5 juegos');
    expect(t).not.toContain('Por mes');
    expect(renderToString(h(TrendSection, { games: games.slice(0, 1), average: null }))).toBe('');
  });
});

describe('la hoja y el editor', () => {
  it('el split va en un círculo (con pines); por teclado no', () => {
    const out = renderToString(h(FramesGrid, { rolls: GAME.rolls, masks: GAME.masks, compact: true }));
    expect(out.match(/data-split/g)).toHaveLength(1);
    // El círculo no tiene ancho fijo (no aprieta la otra casilla del cuadro) y las casillas pueden achicarse parejo.
    const circle = out.match(/<span class="([^"]*)" data-split=""/)![1];
    expect(circle).not.toMatch(/(^|\s)size-/);
    expect(circle).toContain('w-[min(1.4em,100%)]');
    expect(circle).toContain('aspect-square');
    expect(out.match(/min-w-0 flex-1/g)?.length).toBe(21);
    expect(out).toContain('title="Split"');
    expect(text(out)).toContain('(split)');
    expect(renderToString(h(FramesGrid, { rolls: GAME.rolls, compact: true }))).not.toContain('data-split');
  });

  it('en la hoja que se toca (la de anotar, 2 × 5), el split también se dice en el tiro', () => {
    const out = renderToString(h(FramesSheet, { rolls: GAME.rolls, masks: GAME.masks, onSelect: () => undefined }));
    expect(out).toContain('aria-label="Cuadro 3, tiro 1: 8 (split)"');
    expect(out.match(/data-split/g)).toHaveLength(1);
    // El tiro de al lado también se toca (de arriba abajo del cuadro) para corregirlo.
    expect(out.match(/<button[^>]*aria-label="Cuadro 3, tiro 2: -"[^>]*>/)?.[0]).toContain('h-full');
    // El círculo no pasa del ancho de su casilla.
    expect(out).toContain('w-[min(1.4em,100%)]');
  });

  it('el botón de cuadros abre por cuadros aunque el juego tenga total (y avisa que tiene solo el total)', () => {
    const onChange = () => undefined;
    // La forma de anotar está en «Teclado ▾» (data-mode dice cuál).
    const withTotal = renderToString(h(FrameEditor, { initial: { score: 180, frames: null }, onChange }));
    expect(withTotal).toContain('data-mode="total"');
    const byFrames = renderToString(h(FrameEditor, { initial: { score: 180, frames: null }, onChange, startMode: 'teclado' }));
    expect(byFrames).toContain('data-mode="teclado"');
    expect(text(byFrames)).toContain('Este juego tiene 180 anotado solo con el total.');
    // Con cuadros manda lo que tiene (pines si se anotó con pines).
    const withPins = renderToString(h(FrameEditor, { initial: { score: 0, frames: GAME }, onChange, startMode: 'teclado' }));
    expect(withPins).toContain('data-mode="pines"');
    expect(text(withPins)).not.toContain('solo con el total');
    // El botón de la forma de anotar se toca fácil (44 px).
    expect(byFrames).toMatch(/data-mode-trigger=""[^>]*class="[^"]*\bh-11\b/);
    expect(text(byFrames)).toContain('o guárdalo así y se queda con el total');
  });

  it('abierto por cuadros sin anotar ningún tiro, un juego con solo el total se puede guardar igual (p. ej. para cambiar la bola)', () => {
    const empty = { rolls: [], masks: [], total: '180', hole: false };
    const typed = { score: 180, frames: null };
    for (const mode of ['pines', 'teclado'] as const) {
      expect(editorValue(mode, empty, typed)).toEqual({ score: 180, frames: null, ready: true });
    }
    // Sin total antes, sin tiros no hay nada que guardar.
    expect(editorValue('teclado', { ...empty, total: '' }, { score: null, frames: null })).toEqual({ score: null, frames: null, ready: false });
    // Con tiros, mandan los tiros (un juego a medias no está listo).
    expect(editorValue('teclado', { ...empty, rolls: [10, 10] }, typed)).toEqual({ score: null, frames: { rolls: [10, 10] }, ready: false });
    // Con los pines de cada tiro.
    expect(editorValue('pines', { ...empty, rolls: GAME.rolls, masks: GAME.masks ?? [] }, typed)).toMatchObject({ score: 177, ready: true });
    // Un juego que ya tenía cuadros y se borraron todos: nada (no vuelve el total viejo).
    expect(editorValue('teclado', empty, { score: 300, frames: { rolls: Array.from({ length: 12 }, () => 10) } }).ready).toBe(false);
    // Total: lo escrito.
    expect(editorValue('total', { ...empty, total: '301' }, typed)).toEqual({ score: 301, frames: null, ready: false });
    expect(editorValue('total', { ...empty, total: '199' }, typed)).toEqual({ score: 199, frames: null, ready: true });
  });
});
