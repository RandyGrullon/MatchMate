/**
 * La hoja para anotar un juego dibujada sin navegador (renderToString): con algo sin guardar en la memoria del teléfono
 * arranca desde ahí con «Seguimos donde lo dejaste · Descartar» (en la forma donde se ve lo anotado y con el tiro que
 * faltaba escribir); lo igual a lo guardado, lo vencido o lo de otro juego no se ofrece. La hoja nueva (a pantalla
 * completa): «Teclado ▾», el progreso con «Guardado en tu teléfono», la hoja de 2 × 5, «Llevas» y «Máx. posible», las
 * teclas con nombre (solo las que valen encendidas) y «Deshacer» + «Guardar y salir» (que nunca guarda un juego a medias).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceRoll } from '../../lib/bowling';
import { FeedbackProvider } from '../feedback';
import { DRAFT_MAX_AGE_MS, gameKey, myGamesPlace, soloPlace, storageKey, tableGameKey } from './draftMemory';
import { FrameEditor, type EditorWork, type ScoreMode, type ScoreValue } from './FrameEditor';
import { FramesSheet } from './FramesGrid';
import { ScoreEntryModal, footerAction, splitTitle } from './ScoreEntryModal';

const store = new Map<string, string>();
const memoryStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const text = (html: string) =>
  html
    .replace(/<style[^>]*>.*?<\/style>/g, '')
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
const KEY = gameKey(myGamesPlace('u1', 'L1', 'p1', 'E1'), 1);
const EMPTY: ScoreValue = { score: null, frames: null };
const NOTICE = 'Seguimos donde lo dejaste (sin guardar)';
const rep = (n: number, ...rolls: number[]) => Array.from({ length: n }, () => rolls).flat();
/** El juego del diseño: X | 9 / | 7 2 | X | 8 1 | 9 (va por el cuadro 6, tiro 2). */
const MOCKUP: ScoreValue = { score: null, frames: { rolls: [10, 9, 1, 7, 2, 10, 8, 1, 9] } };

/** Lo que quedó en el teléfono como lo deja la hoja (sin `mode`: se deduce de los tiros). */
const remember = (
  key: string,
  v: { score: number | null; frames: ScoreValue['frames']; mode?: ScoreMode; hole?: EditorWork['hole']; base?: ScoreValue },
  at = Date.now(),
) => store.set(storageKey(key), JSON.stringify({ ...v, at }));
const render = (
  p: { initial?: ScoreValue; memoryKey?: string; startMode?: ScoreMode; resetKey?: string; stored?: ScoreValue; title?: string; subtitle?: string; saveText?: string } = {},
) =>
  renderToString(
    h(
      FeedbackProvider,
      null,
      h(ScoreEntryModal, {
        open: true,
        onClose: () => undefined,
        title: p.title ?? 'Juego 2',
        subtitle: p.subtitle,
        initial: p.initial ?? EMPTY,
        onSave: () => undefined,
        resetKey: p.resetKey ?? '1',
        memoryKey: 'memoryKey' in p ? p.memoryKey : KEY,
        stored: p.stored,
        startMode: p.startMode,
        saveText: p.saveText,
      }),
    ),
  );
const editor = (initial: ScoreValue, startMode?: ScoreMode, resume?: EditorWork) =>
  renderToString(h(FrameEditor, { initial, onChange: () => undefined, startMode, resume }));
/** El máximo posible que se ve debajo del puntaje (undefined: no sale). */
const best = (html: string) => html.match(/data-max="(\d+)"/)?.[1];
/** La forma de anotar del botón «Teclado ▾». */
const modeOf = (html: string) => html.match(/data-mode="(\w+)"/)?.[1];
/** El pie de la hoja («Deshacer» y el botón de guardar). */
const footer = (html: string) => html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
/** Las teclas (58 px), en orden: lo que dicen, si están encendidas y si van del color del deporte. */
const keys = (html: string) =>
  [...html.matchAll(/<button type="button"( disabled="")?[^>]*class="([^"]*\bh-key\b[^"]*)"[^>]*>(.*?)<\/button>/g)].map((m) => ({
    label: text(m[3]).trim(),
    on: !m[1],
    accent: m[2].includes('bg-accent'),
  }));
const key = (html: string, label: string) => keys(html).find((k) => k.label === label);

beforeAll(() => {
  vi.stubGlobal('localStorage', memoryStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => store.clear());

describe('la hoja recuerda el juego sin guardar', () => {
  it('con tiros a medias en la memoria: arranca desde ahí, con «Seguimos donde lo dejaste · Descartar»', () => {
    remember(KEY, { score: null, frames: { rolls: [10, 7] }, mode: 'teclado', base: EMPTY });
    const out = render();
    const t = text(out);
    expect(t).toContain(NOTICE);
    // «Descartar» se toca fácil (44 px), con la pregunta de siempre antes de borrar.
    expect(out).toMatch(/<button[^>]*class="[^"]*h-11[^"]*"[^>]*>Descartar<\/button>/);
    // La hoja con la X y el 7 (teclado: se anotó sin pines).
    expect(modeOf(out)).toBe('teclado');
    expect(t).toContain('1 X 2 7 3');
    expect(t).toContain('Cuadro 2 de 10 · tiro 2');
    // X, 7/ y ocho cuadros de 30.
    expect(best(out)).toBe('280');
    // Lo anotado ya está en el teléfono.
    expect(t).toContain('Guardado en tu teléfono');
  });

  it('con los pines marcados vuelve a «Pines»', () => {
    remember(KEY, { score: null, frames: { rolls: [9], masks: [0b01_1111_1111] }, mode: 'pines' });
    const out = render({ startMode: 'teclado' });
    expect(text(out)).toContain(NOTICE);
    expect(modeOf(out)).toBe('pines');
  });

  it('un total sin tiros vuelve a abrir en «Total» (aunque la hoja abra por cuadros)', () => {
    remember(KEY, { score: 215, frames: null });
    const out = render({ startMode: 'teclado' });
    expect(text(out)).toContain(NOTICE);
    expect(modeOf(out)).toBe('total');
    expect(out).toContain('value="215"');
  });

  it('cerrada mirando «Total» a mitad del juego: vuelve por cuadros, con los tiros', () => {
    remember(KEY, { score: null, frames: { rolls: [10, 7, 2, 9] }, mode: 'total' });
    const out = render({ startMode: 'teclado' });
    expect(text(out)).toContain(NOTICE);
    expect(modeOf(out)).toBe('teclado');
    // Cada cuadro: su número, el acumulado y los tiros.
    expect(text(out)).toContain('1 19 X 2 28 7 2 3 9');
  });

  it('cerrada con el tiro por escribir de una corrección: sigue faltando y no se guarda todavía', () => {
    const perfect: ScoreValue = { score: 300, frames: { rolls: rep(12, 10) } };
    // La X del cuadro 3 pasó a 7 y falta el segundo tiro (quedó en 0 por ahora).
    const fix = replaceRoll(perfect.frames!.rolls, [], 2, 7, null);
    remember(KEY, { score: 300, frames: { rolls: fix.rolls }, mode: 'teclado', hole: { roll: fix.next!, kind: 'falta' }, base: perfect });
    const out = render({ initial: perfect });
    expect(text(out)).toContain(NOTICE);
    expect(text(out)).toContain('Escribe el tiro 2 del cuadro 3');
    expect(text(out)).toContain('Corrigiendo el cuadro 3');
    // Sin ese tiro no hay «Guardar 261» (con el 0 de mientras): solo «Guardar y salir», que deja lo anotado en el teléfono.
    expect(text(footer(out))).toContain('Guardar y salir');
    expect(text(out)).not.toContain('261');
    // «Dejar en −» deja ese tiro en 0.
    expect(text(footer(out))).toContain('Dejar en −');
    // Lo más que se puede: ese tiro como spare (7/).
    expect(best(out)).toBe('277');
  });

  it('si lo guardado cambió mientras tanto, lo dice (y cuánto quedó guardado)', () => {
    remember(KEY, { score: null, frames: { rolls: [9, 0, 8] }, mode: 'teclado', base: EMPTY });
    const out = render({ initial: { score: 210, frames: null } });
    const t = text(out);
    expect(t).toContain(NOTICE);
    expect(t).toContain('Ojo: mientras tanto se guardó 210 en este juego.');
    // En ámbar, no en el gris de siempre.
    expect(out).toContain('bg-warn-soft text-warn');
    // Sin cambios en lo guardado, solo el aviso de siempre.
    expect(text(render())).not.toContain('Ojo:');
  });

  it('igual a lo guardado: arranca de lo guardado sin aviso (y la memoria se borra)', () => {
    const saved: ScoreValue = { score: 180, frames: null };
    remember(KEY, saved);
    const out = render({ initial: saved });
    expect(text(out)).not.toContain(NOTICE);
    expect(text(out)).not.toContain('Guardado en tu teléfono');
    expect(store.size).toBe(0);
  });

  it('distinta de lo guardado: manda la memoria', () => {
    remember(KEY, { score: null, frames: { rolls: [8, 1, 10] } });
    const out = render({ initial: { score: 180, frames: null } });
    expect(text(out)).toContain(NOTICE);
    expect(text(out)).not.toContain('anotado solo con el total');
  });

  it('juego suelto: lo pasado con «Listo» a la casilla no avisa al abrirlo otra vez y se queda hasta guardar la hoja', () => {
    const SOLO = gameKey(soloPlace('u1', null), 0);
    const ninety: ScoreValue = { score: 90, frames: { rolls: rep(10, 9, 0) } };
    remember(SOLO, { score: null, frames: ninety.frames, mode: 'teclado', base: EMPTY });
    const again = render({ memoryKey: SOLO, initial: ninety, stored: EMPTY });
    expect(text(again)).not.toContain(NOTICE);
    // Sigue en el teléfono (todavía no se guardó la hoja del juego suelto).
    expect(text(again)).toContain('Guardado en tu teléfono');
    expect(store.size).toBe(1);
    // Si la app se cerró antes de guardar la hoja, la casilla vuelve vacía y el juego, con el aviso.
    expect(text(render({ memoryKey: SOLO, initial: EMPTY, stored: EMPTY }))).toContain(NOTICE);
  });

  it('vencida (más de 14 días), de otro juego o sin memoryKey: no se ofrece', () => {
    remember(KEY, { score: null, frames: { rolls: [10] } }, Date.now() - DRAFT_MAX_AGE_MS - 1000);
    expect(text(render())).not.toContain(NOTICE);
    expect(store.size).toBe(0);
    remember(KEY, { score: null, frames: { rolls: [10] } });
    // Otro juego, otro jugador, otra cuenta u otro lugar (la tabla, un juego suelto): cada uno la suya.
    for (const other of [
      gameKey(myGamesPlace('u1', 'L1', 'p1', 'E1'), 2),
      gameKey(myGamesPlace('u1', 'L1', 'p2', 'E1'), 1),
      gameKey(myGamesPlace('u2', 'L1', 'p1', 'E1'), 1),
      tableGameKey('u1', 'L1', 'E1', 'p1', 1),
      gameKey(soloPlace('u1', 'E1'), 1),
    ]) {
      expect(text(render({ memoryKey: other })), other).not.toContain(NOTICE);
    }
    expect(text(render({ memoryKey: undefined }))).not.toContain(NOTICE);
    // La de este juego sigue ahí.
    expect(text(render())).toContain(NOTICE);
  });
});

describe('la hoja de anotar nueva (como el diseño)', () => {
  it('a pantalla completa: la X, el juego con su línea de debajo y «Teclado ▾»', () => {
    const out = render({ initial: MOCKUP, title: 'Juego 3', subtitle: 'Práctica de hoy' });
    expect(out).toMatch(/<dialog[^>]*class="[^"]*\bh-dvh\b[^"]*w-full[^"]*"/);
    expect(out).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"/);
    expect(out).toContain('aria-label="Cerrar"');
    expect(out).toMatch(/<h2[^>]*>Juego 3<\/h2><p[^>]*>Práctica de hoy<\/p>/);
    // El menú de la forma de anotar: 44 px para el dedo, dice cuál es y se abre como menú.
    expect(out).toMatch(/<button[^>]*data-mode-trigger=""[^>]*data-mode="teclado"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
    expect(out).toContain('aria-label="Forma de anotar: Teclado"');
    expect(out).toMatch(/data-mode-trigger=""[^>]*class="[^"]*\bh-11\b/);
    // Cerrado no hay menú (ni «Empezar de nuevo» a la vista).
    expect(out).not.toContain('role="menu"');
    expect(text(out)).not.toContain('Empezar de nuevo');
  });

  it('«Ana Pérez · Juego 3» (la tabla) se parte en dos líneas', () => {
    expect(splitTitle('Ana Pérez · Juego 3')).toEqual(['Juego 3', 'Ana Pérez']);
    expect(splitTitle('Juego 3')).toEqual(['Juego 3', null]);
    expect(splitTitle('Ana · Juego 3', 'Otra línea')).toEqual(['Ana · Juego 3', 'Otra línea']);
    expect(render({ title: 'Ana Pérez · Juego 3' })).toMatch(/<h2[^>]*>Juego 3<\/h2><p[^>]*>Ana Pérez<\/p>/);
  });

  it('el progreso: «Cuadro 6 de 10 · tiro 2», la barra y «Guardado en tu teléfono»', () => {
    remember(KEY, { score: null, frames: MOCKUP.frames, mode: 'teclado', base: EMPTY });
    const out = render({ initial: EMPTY });
    const t = text(out);
    expect(t).toContain('Cuadro 6 de 10 · tiro 2');
    expect(t).toContain('Guardado en tu teléfono');
    // 5 cuadros y medio: 55 %.
    expect(out).toMatch(/role="progressbar"[^>]*aria-valuenow="6"[^>]*><i[^>]*style="width:55%"/);
    // Sin nada en el teléfono no lo dice.
    expect(text(render({ initial: MOCKUP }))).not.toContain('Guardado en tu teléfono');
  });

  it('la hoja de 2 × 5 con el cuadro que se anota resaltado y «Toca un cuadro para corregirlo»', () => {
    const out = render({ initial: MOCKUP });
    const t = text(out);
    // Cinco columnas iguales, como el diseño (el 10 junta sus tres tiros).
    expect(out).toMatch(/class="grid grid-cols-5 overflow-hidden rounded-\[18px\]/);
    expect(t).toContain('1 20 X 2 37 9 / 3 46 7 2 4 65 X 5 74 8 1 6 9 7 8 9 10');
    // Solo un cuadro resaltado (el 6) y la rayita donde va el próximo tiro.
    expect(out.match(/bg-accent-soft ring-2 ring-accent ring-inset/g)).toHaveLength(1);
    expect(out.match(/border-b-\[2\.5px\] border-accent/g)).toHaveLength(1);
    expect(t).toContain('Toca un cuadro para corregirlo');
    // Cada tiro se toca para corregirlo (con su nombre para el lector de pantalla).
    expect(out).toContain('aria-label="Cuadro 1, tiro 1: X"');
    expect(out).toContain('aria-label="Cuadro 2, tiro 2: /"');
    expect(out).toContain('aria-label="Cuadro 6, tiro 1: 9"');
    expect(out).toContain('aria-label="Cuadro 6, tiro 2: vacío"');
    expect(out).toContain('aria-label="Cuadro 7, tiro 1: vacío"');
  });

  it('«Llevas 74» grande y «Máx. posible 214»; «Queda 1 pino en pie»', () => {
    const out = render({ initial: MOCKUP });
    const t = text(out);
    expect(out).toMatch(/<span[^>]*>Llevas<\/span><b class="[^"]*text-hero-sm[^"]*num[^"]*" data-score="">74<\/b>/);
    expect(best(out)).toBe('214');
    expect(t).toContain('Máximo posible Máx. posible 214');
    expect(out).toMatch(/<span class="sr-only">Máximo posible <\/span><span aria-hidden="true">Máx\. posible<\/span>/);
    expect(t).toContain('Queda 1 pino en pie');
  });

  it('las teclas dicen qué son y solo se encienden las que valen (el 1, igual al spare, apagado)', () => {
    const out = render({ initial: MOCKUP });
    // Como un teléfono: 1–9 y a la derecha X Strike, / Spare y 0 Fallo.
    expect(keys(out).map((k) => k.label)).toEqual(['1', '2', '3', 'X Strike', '4', '5', '6', '/ Spare', '7', '8', '9', '0 Fallo']);
    // Queda 1 pino: todos los números (también el 1) y la X apagados; el spare y el 0, encendidos.
    expect(keys(out).filter((k) => k.on).map((k) => k.label)).toEqual(['/ Spare', '0 Fallo']);
    expect(key(out, '/ Spare')).toMatchObject({ on: true, accent: true });
    expect(key(out, '0 Fallo')).toMatchObject({ on: true, accent: false });
    // La apagada queda con el contorno tenue (se lee en oscuro).
    expect(out).toMatch(/disabled=""[^>]*class="[^"]*h-key[^"]*text-faint ring-\[1\.5px\] ring-line ring-inset/);
    // 58 px de alto.
    expect(out).toContain('h-key');
  });

  it('el primer tiro de un cuadro: los números y la X encendidos, el spare no', () => {
    const out = render({ initial: { score: null, frames: { rolls: [7, 2] } } });
    expect(text(out)).toContain('10 pinos en pie');
    expect(keys(out).filter((k) => !k.on).map((k) => k.label)).toEqual(['/ Spare']);
    expect(key(out, 'X Strike')).toMatchObject({ on: true, accent: true });
  });

  it('«Deshacer» + «Guardar y salir» a mitad del juego (sin juego completo nunca es «Guardar»)', () => {
    const out = render({ initial: MOCKUP });
    const f = footer(out);
    expect(text(f)).toContain('Deshacer');
    expect(text(f)).toContain('Guardar y salir');
    expect(f).toContain('bg-accent-soft text-accent');
    expect(f).not.toContain('disabled=""');
    // Los botones del pie, de 52 px.
    expect(f.match(/h-\[52px\]/g)).toHaveLength(2);
    // Lo que decide el botón: solo con el juego listo guarda.
    expect(footerAction(false, true)).toBe('salir');
    expect(footerAction(true, true)).toBe('guardar');
    expect(footerAction(true, false)).toBe('guardar');
    expect(footerAction(false, false)).toBe('apagado');
  });

  it('sin memoria del teléfono, a mitad del juego «Guardar» queda apagado (cerrar perdería lo anotado)', () => {
    const f = footer(render({ initial: MOCKUP, memoryKey: undefined }));
    expect(text(f)).not.toContain('Guardar y salir');
    expect(f).toMatch(/<button type="button" disabled=""[^>]*>(?:(?!<\/button>).)*Guardar<\/span><\/button>/);
  });

  it('con el juego completo: «Total 201», todas las teclas apagadas y «Guardar 201»', () => {
    const done: ScoreValue = { score: null, frames: { rolls: [...MOCKUP.frames!.rolls, 1, 10, 10, 10, 10, 7, 3] } };
    const out = render({ initial: done });
    const t = text(out);
    expect(t).toContain('Juego completo');
    expect(out).toMatch(/>Total<\/span><b[^>]*>201<\/b>/);
    expect(best(out)).toBeUndefined();
    expect(keys(out).every((k) => !k.on)).toBe(true);
    const f = footer(out);
    expect(text(f)).toContain('Guardar 201');
    expect(f).toContain('bg-accent text-accent-fg');
    expect(text(footer(render({ initial: done, saveText: 'Listo' })))).toContain('Listo 201');
  });

  it('sin tiros: «Cuadro 1 de 10 · tiro 1», «Llevas 0» y «Deshacer» apagado', () => {
    const out = render({ initial: EMPTY });
    const t = text(out);
    expect(t).toContain('Cuadro 1 de 10 · tiro 1');
    expect(out).toMatch(/data-score="">0<\/b>/);
    expect(t).not.toContain('Toca un cuadro para corregirlo');
    expect(footer(out)).toMatch(/<button type="button" disabled=""[^>]*>(?:(?!<\/button>).)*Deshacer/);
  });

  it('«Pines»: los pinos para tocar y las teclas 0 Fallo, X Strike y Anotar (apagada hasta marcar)', () => {
    const out = render({ initial: EMPTY, startMode: 'pines' });
    expect(modeOf(out)).toBe('pines');
    expect(out).toContain('role="group" aria-label="Pines"');
    expect(text(out)).toContain('Toca los pinos que cayeron');
    expect(keys(out).map((k) => [k.label, k.on])).toEqual([
      ['0 Fallo', true],
      ['X Strike', true],
      ['Anotar', false],
    ]);
    // En «Pines» la hoja no se toca (no hay «Toca un cuadro…»).
    expect(text(out)).not.toContain('Toca un cuadro');
    // Los pinos, de 46 px.
    expect(out.match(/size-\[46px\]/g)).toHaveLength(10);
  });

  it('«Total»: el puntaje escrito o con la barra, sin «Deshacer»', () => {
    const out = render({ initial: { score: 180, frames: null } });
    expect(modeOf(out)).toBe('total');
    expect(out).toContain('aria-label="Puntaje del juego"');
    expect(out).toContain('value="180"');
    expect(text(out)).toContain('Escribe el puntaje final');
    expect(text(footer(out))).not.toContain('Deshacer');
    expect(text(footer(out))).toContain('Guardar 180');
  });

  it('el aviso va antes que lo de arriba (la bola) y lo de debajo, después del teclado', () => {
    remember(KEY, { score: null, frames: { rolls: [10, 7] }, mode: 'teclado', base: EMPTY });
    const out = renderToString(
      h(
        FeedbackProvider,
        null,
        h(ScoreEntryModal, {
          open: true,
          onClose: () => undefined,
          title: 'Juego 2',
          initial: EMPTY,
          onSave: () => undefined,
          memoryKey: KEY,
          top: h('i', { 'data-top': '' }),
          note: h('i', { 'data-note': '' }),
        }),
      ),
    );
    const at = (s: string) => out.indexOf(s);
    expect(at('Seguimos donde lo dejaste')).toBeLessThan(at('data-top'));
    expect(at('data-top')).toBeLessThan(at('role="progressbar"'));
    expect(at('Fallo')).toBeLessThan(at('data-note'));
    expect(at('data-note')).toBeLessThan(at('<footer'));
  });

  it('cerrada no dibuja nada adentro', () => {
    const out = renderToString(
      h(FeedbackProvider, null, h(ScoreEntryModal, { open: false, onClose: () => undefined, title: 'Juego 1', initial: EMPTY, onSave: () => undefined })),
    );
    expect(out).toContain('<dialog');
    expect(out).not.toContain('<footer');
    expect(out).not.toContain('mm-anotar{');
  });
});

describe('la hoja de cuadros para anotar (FramesSheet)', () => {
  it('un strike se toca de una vez (las dos casillas son el mismo tiro); el 10 con sus tres tiros', () => {
    const rolls = [...rep(9, 10), 10, 7, 3];
    const out = renderToString(h(FramesSheet, { rolls, onSelect: () => undefined }));
    for (let f = 1; f <= 9; f++) expect(out).toContain(`aria-label="Cuadro ${f}, tiro 1: X"`);
    expect(out).not.toContain('casilla izquierda');
    expect(out).toContain('aria-label="Cuadro 10, tiro 1: X"');
    expect(out).toContain('aria-label="Cuadro 10, tiro 2: 7"');
    expect(out).toContain('aria-label="Cuadro 10, tiro 3: /"');
    expect(out.match(/<button/g)).toHaveLength(12);
    expect(text(out)).toContain('10 287');
  });

  it('el tiro elegido lleva la rayita y su cuadro se resalta; el borrado se ve vacío y sin acumulados después', () => {
    const rolls = [7, 2, 8, 1, 9, 0];
    const sel = renderToString(h(FramesSheet, { rolls, selected: 1, onSelect: () => undefined }));
    expect(sel.match(/bg-accent-soft ring-2 ring-accent ring-inset/g)).toHaveLength(1);
    expect(sel).toMatch(/border-b-\[2\.5px\] border-accent">2<\/span>/);
    const blank = renderToString(h(FramesSheet, { rolls, selected: 2, blank: 2, onSelect: () => undefined }));
    expect(blank).toContain('aria-label="Cuadro 2, tiro 1: vacío"');
    // El acumulado del cuadro 1 se sabe; los de después, no.
    expect(text(blank)).toContain('1 9 7 2 2 1 3 9 -');
    expect(text(blank)).not.toContain('18');
  });

  it('sin `onSelect` (Pines) no se toca', () => {
    const out = renderToString(h(FramesSheet, { rolls: [10, 7], next: { frame: 1, roll: 1 } }));
    expect(out).not.toContain('<button');
    expect(out).toMatch(/pointer-events-none/);
  });
});

describe('máximo posible', () => {
  it('con el juego a medias: lo más que se puede hacer todavía', () => {
    expect(best(editor({ score: null, frames: { rolls: [7, 2] } }))).toBe('279');
    expect(best(editor({ score: null, frames: { rolls: [10, 10, 7] } }))).toBe('277');
    expect(best(editor({ score: null, frames: { rolls: [7] } }))).toBe('290');
    // Por pines también.
    const pins = editor({ score: null, frames: { rolls: [10, 10, 10, 10, 10, 10, 10, 10, 10, 9], masks: [1023, 1023, 1023, 1023, 1023, 1023, 1023, 1023, 1023, 511] } });
    expect(modeOf(pins)).toBe('pines');
    expect(best(pins)).toBe('279');
    // Se lee «Máx. posible 279» y el lector de pantalla dice «Máximo posible».
    expect(text(pins)).toContain('Máximo posible Máx. posible 279');
  });

  it('con un tiro borrado en medio: ese tiro con todo lo que cabe y los cuadros de después como están', () => {
    const rolls = rep(4, 0, 0);
    const out = editor(EMPTY, 'teclado', { mode: 'teclado', rolls, masks: rolls.map(() => null), total: '', hole: { roll: 2, kind: 'borrado' } });
    expect(text(out)).toContain('Borraste el tiro 1 del cuadro 2');
    // «Deshacer» devuelve el tiro borrado.
    expect(text(out)).toContain('Deshacer');
    // Aunque sea X, los cuadros 3 y 4 ya son 0,0: 190 (no 270).
    expect(best(out)).toBe('190');
  });

  it('sin tiros, con el juego completo o en «Total»: no sale, pero su lugar queda (nada se mueve al anotar)', () => {
    const reserved = /<div class="min-w-24 shrink-0 text-right"><\/div>/;
    const empty = editor(EMPTY, 'teclado');
    expect(best(empty)).toBeUndefined();
    expect(text(empty)).not.toContain('Máx');
    expect(empty).toMatch(reserved);
    const done = editor({ score: 90, frames: { rolls: rep(10, 9, 0) } });
    expect(text(done)).toContain('Juego completo');
    expect(best(done)).toBeUndefined();
    expect(done).toMatch(reserved);
    const total = editor({ score: 180, frames: null });
    expect(modeOf(total)).toBe('total');
    expect(text(total)).not.toContain('Máx');
  });

  it('en la hoja, al lado del puntaje grande', () => {
    const out = render({ initial: { score: null, frames: { rolls: [10, 7] } }, memoryKey: undefined });
    expect(out).toMatch(/data-score="">0<\/b><\/div><div[^>]*data-max="280"/);
    expect(best(out)).toBe('280');
  });
});
