/**
 * La hoja para anotar un juego dibujada sin navegador (renderToString): con algo sin guardar en la memoria del teléfono
 * arranca desde ahí con el aviso y «Descartar» (en la forma donde se ve lo anotado y con el tiro que faltaba escribir); lo
 * igual a lo guardado, lo vencido o lo de otro juego no se ofrece. Y el máximo posible debajo del puntaje mientras el juego
 * va por la mitad (por pines o teclado, no en Total), en un lugar que no se mueve.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceRoll } from '../../lib/bowling';
import { FeedbackProvider } from '../feedback';
import { DRAFT_MAX_AGE_MS, gameKey, myGamesPlace, soloPlace, storageKey, tableGameKey } from './draftMemory';
import { FrameEditor, type EditorWork, type ScoreMode, type ScoreValue } from './FrameEditor';
import { ScoreEntryModal } from './ScoreEntryModal';

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

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const KEY = gameKey(myGamesPlace('u1', 'L1', 'p1', 'E1'), 1);
const EMPTY: ScoreValue = { score: null, frames: null };
const NOTICE = 'Seguimos donde lo dejaste (sin guardar)';
const NBSP = String.fromCharCode(0xa0);
const rep = (n: number, ...rolls: number[]) => Array.from({ length: n }, () => rolls).flat();

/** Lo que quedó en el teléfono como lo deja la hoja (sin `mode`: se deduce de los tiros). */
const remember = (
  key: string,
  v: { score: number | null; frames: ScoreValue['frames']; mode?: ScoreMode; hole?: EditorWork['hole']; base?: ScoreValue },
  at = Date.now(),
) => store.set(storageKey(key), JSON.stringify({ ...v, at }));
const render = (p: { initial?: ScoreValue; memoryKey?: string; startMode?: ScoreMode; resetKey?: string; stored?: ScoreValue } = {}) =>
  renderToString(
    h(
      FeedbackProvider,
      null,
      h(ScoreEntryModal, {
        open: true,
        onClose: () => undefined,
        title: 'Juego 2',
        initial: p.initial ?? EMPTY,
        onSave: () => undefined,
        resetKey: p.resetKey ?? '1',
        memoryKey: 'memoryKey' in p ? p.memoryKey : KEY,
        stored: p.stored,
        startMode: p.startMode,
      }),
    ),
  );
/** El máximo posible que se ve debajo del puntaje (undefined: no sale). */
const best = (html: string) => html.match(/data-max="(\d+)"/)?.[1];
const selected = (html: string, tab: string) => new RegExp(`aria-selected="true"[^>]*>(?:(?!</button>).)*${tab}`).test(html);
/** El botón de guardar de la hoja (el del pie). */
const saveButton = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Guardar(?:(?!<\/button>).)*<\/button>/g)?.at(-1) ?? '';

beforeAll(() => {
  vi.stubGlobal('localStorage', memoryStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => store.clear());

describe('la hoja recuerda el juego sin guardar', () => {
  it('con tiros a medias en la memoria: arranca desde ahí, con el aviso y «Descartar»', () => {
    remember(KEY, { score: null, frames: { rolls: [10, 7] }, mode: 'teclado', base: EMPTY });
    const out = render();
    const t = text(out);
    expect(t).toContain(NOTICE);
    // «Descartar» se toca fácil (44 px) y va en rojo, como los demás que borran.
    expect(out).toMatch(/<button[^>]*class="[^"]*h-11[^"]*text-danger[^"]*"[^>]*>Descartar<\/button>/);
    // La hoja con la X y el 7 (teclado: se anotó sin pines).
    expect(selected(out, 'Teclado')).toBe(true);
    expect(t).toContain('1 X 2 7 3');
    expect(t).toContain('Cuadro 2 , tiro 2');
    // X, 7/ y ocho cuadros de 30.
    expect(best(out)).toBe('280');
  });

  it('con los pines marcados vuelve a «Pines»', () => {
    remember(KEY, { score: null, frames: { rolls: [9], masks: [0b01_1111_1111] }, mode: 'pines' });
    const out = render({ startMode: 'teclado' });
    expect(text(out)).toContain(NOTICE);
    expect(selected(out, 'Pines')).toBe(true);
  });

  it('un total sin tiros vuelve a abrir en «Total» (aunque la hoja abra por cuadros)', () => {
    remember(KEY, { score: 215, frames: null });
    const out = render({ startMode: 'teclado' });
    expect(text(out)).toContain(NOTICE);
    expect(selected(out, 'Total')).toBe(true);
    expect(out).toContain('value="215"');
  });

  it('cerrada mirando «Total» a mitad del juego: vuelve por cuadros, con los tiros', () => {
    remember(KEY, { score: null, frames: { rolls: [10, 7, 2, 9] }, mode: 'total' });
    const out = render({ startMode: 'teclado' });
    expect(text(out)).toContain(NOTICE);
    expect(selected(out, 'Teclado')).toBe(true);
    expect(text(out)).toContain('1 X 19 2 7 2 28 3 9');
  });

  it('cerrada con el tiro por escribir de una corrección: sigue faltando y no se puede guardar todavía', () => {
    const perfect: ScoreValue = { score: 300, frames: { rolls: rep(12, 10) } };
    // La X del cuadro 3 pasó a 7 y falta el segundo tiro (quedó en 0 por ahora).
    const fix = replaceRoll(perfect.frames!.rolls, [], 2, 7, null);
    remember(KEY, { score: 300, frames: { rolls: fix.rolls }, mode: 'teclado', hole: { roll: fix.next!, kind: 'falta' }, base: perfect });
    const out = render({ initial: perfect });
    expect(text(out)).toContain(NOTICE);
    expect(text(out)).toContain('Escribe el tiro 2 del cuadro 3');
    // Sin ese tiro, «Guardar» no está listo (antes salía «Guardar 261» con el 0 de mientras).
    expect(saveButton(out)).toContain('disabled');
    expect(text(out)).not.toContain('261');
    // Lo más que se puede: ese tiro como spare (7/).
    expect(best(out)).toBe('277');
  });

  it('si lo guardado cambió mientras tanto, lo dice (y cuánto quedó guardado)', () => {
    remember(KEY, { score: null, frames: { rolls: [9, 0, 8] }, mode: 'teclado', base: EMPTY });
    const t = text(render({ initial: { score: 210, frames: null } }));
    expect(t).toContain(NOTICE);
    expect(t).toContain('Ojo: mientras tanto se guardó 210 en este juego.');
    // Sin cambios en lo guardado, solo el aviso de siempre.
    expect(text(render())).not.toContain('Ojo:');
  });

  it('igual a lo guardado: arranca de lo guardado sin aviso (y la memoria se borra)', () => {
    const saved: ScoreValue = { score: 180, frames: null };
    remember(KEY, saved);
    const out = render({ initial: saved });
    expect(text(out)).not.toContain(NOTICE);
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
    expect(text(render({ memoryKey: SOLO, initial: ninety, stored: EMPTY }))).not.toContain(NOTICE);
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

describe('máximo posible', () => {
  const editor = (initial: ScoreValue, startMode?: ScoreMode, resume?: EditorWork) =>
    renderToString(h(FrameEditor, { initial, onChange: () => undefined, startMode, resume }));
  /** El renglón de debajo del puntaje, vacío (su lugar queda aunque no haya máximo). */
  const reserved = new RegExp(`<span class="text-xs leading-4[^"]*">${NBSP}</span>`);

  it('con el juego a medias: lo más que se puede hacer todavía', () => {
    expect(best(editor({ score: null, frames: { rolls: [7, 2] } }))).toBe('279');
    expect(best(editor({ score: null, frames: { rolls: [10, 10, 7] } }))).toBe('277');
    expect(best(editor({ score: null, frames: { rolls: [7] } }))).toBe('290');
    // Por pines también.
    const pins = editor({ score: null, frames: { rolls: [10, 10, 10, 10, 10, 10, 10, 10, 10, 9], masks: [1023, 1023, 1023, 1023, 1023, 1023, 1023, 1023, 1023, 511] } });
    expect(selected(pins, 'Pines')).toBe(true);
    expect(best(pins)).toBe('279');
    // Se lee «Máx. 279» (corto: no le quita ancho a lo de la izquierda) y el lector de pantalla dice «Máximo posible».
    expect(text(pins)).toContain('Máximo posible Máx. 279');
    expect(pins).toMatch(/<span class="sr-only">Máximo posible <\/span><span aria-hidden="true">Máx\. <\/span>/);
  });

  it('con un tiro borrado en medio: ese tiro con todo lo que cabe y los cuadros de después como están', () => {
    const rolls = rep(4, 0, 0);
    const out = editor(EMPTY, 'teclado', { mode: 'teclado', rolls, masks: rolls.map(() => null), total: '', hole: { roll: 2, kind: 'borrado' } });
    expect(text(out)).toContain('Borraste el tiro 1 del cuadro 2');
    // Aunque sea X, los cuadros 3 y 4 ya son 0,0: 190 (no 270).
    expect(best(out)).toBe('190');
  });

  it('sin tiros, con el juego completo o en «Total»: no sale, pero su lugar queda (nada se mueve al anotar)', () => {
    const empty = editor(EMPTY, 'teclado');
    expect(best(empty)).toBeUndefined();
    expect(text(empty)).not.toContain('Máx');
    // El renglón de debajo del puntaje está igual, vacío; y la columna, con su ancho mínimo.
    expect(empty).toMatch(/<span class="flex min-w-14 shrink-0 flex-col items-end"><span[^>]*>—<\/span>/);
    expect(empty).toMatch(reserved);
    const done = editor({ score: 90, frames: { rolls: rep(10, 9, 0) } });
    expect(text(done)).toContain('Juego completo');
    expect(best(done)).toBeUndefined();
    expect(done).toMatch(reserved);
    const total = editor({ score: 180, frames: null });
    expect(selected(total, 'Total')).toBe(true);
    expect(text(total)).not.toContain('Máx');
  });

  it('en la hoja, debajo del puntaje grande', () => {
    const out = render({ initial: { score: null, frames: { rolls: [10, 7] } }, memoryKey: undefined });
    expect(out).toMatch(/text-2xl[^>]*>0<\/span><span[^>]*data-max="280"/);
    expect(best(out)).toBe('280');
  });
});
