/**
 * La memoria del juego que se está anotando (sin navegador: el almacenamiento del teléfono es un Map): se guarda con cada
 * cambio lo que hay en el editor (también al pasar a «Total» o con un tiro por escribir), se borra vacía o igual a lo
 * guardado, avisa si lo guardado cambió, vence a los 14 días, se pasa de un evento a otro y no se rompe con datos dañados
 * ni sin almacenamiento.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceRoll } from '../../lib/bowling';
import {
  DRAFT_MAX_AGE_MS,
  clearGameDraft,
  clearGameDrafts,
  forgetAfterSave,
  gameKey,
  memoryKeyOf,
  moveGameDrafts,
  myGamesPlace,
  pendingDraft,
  readGameDraft,
  rememberGame,
  sameWork,
  soloPlace,
  storageKey,
  tableGameKey,
  writeGameDraft,
} from './draftMemory';
import { editorValue, type EditorWork, type ScoreValue } from './FrameEditor';

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

const NOW = Date.parse('2026-10-06T20:00:00Z');
const DAY = 86_400_000;
const PLACE = myGamesPlace('u1', 'L1', 'p1', 'E1');
const KEY = gameKey(PLACE, 0);
const EMPTY: ScoreValue = { score: null, frames: null };
const rep = (n: number, ...rolls: number[]) => Array.from({ length: n }, () => rolls).flat();
/** Lo que hay en el editor (por teclado, sin total escrito ni tiro vacío, salvo que se diga). */
const w = (p: Partial<EditorWork> = {}): EditorWork => {
  const rolls = p.rolls ?? [];
  return { mode: 'teclado', total: '', hole: null, ...p, rolls, masks: p.masks ?? rolls.map(() => null) };
};
/** Un juego de 90 (9 y 0 en los diez cuadros), guardado con sus tiros. */
const NINETY: ScoreValue = { score: 90, frames: { rolls: rep(10, 9, 0) } };

beforeAll(() => {
  vi.stubGlobal('localStorage', memoryStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => store.clear());

describe('claves', () => {
  it('cada juego la suya: cuenta, lugar, jugador (o fila) y juego (lo que falta queda como «-»)', () => {
    expect(KEY).toBe('juego:u1:L1:p1:E1:0');
    expect(memoryKeyOf('juego', 'u1', 'L1', 'p1', 'E1', 0)).toBe(KEY);
    expect(storageKey(KEY)).toBe('mm:juego-en-curso:juego:u1:L1:p1:E1:0');
    expect(tableGameKey('u1', 'L1', 'E1', 'fila-9', 2)).toBe('tabla:u1:L1:E1:fila-9:2');
    expect(gameKey(soloPlace(null, null), 2)).toBe('solo:-:nuevo:2');
    expect(gameKey(soloPlace('u1', 's-1'), 0)).toBe('solo:u1:s-1:0');
    const keys = [
      KEY,
      gameKey(PLACE, 1),
      gameKey(myGamesPlace('u2', 'L1', 'p1', 'E1'), 0),
      gameKey(myGamesPlace('u1', 'L1', 'p2', 'E1'), 0),
      gameKey(myGamesPlace('u1', 'L1', 'p1', 'E2'), 0),
      gameKey(myGamesPlace('u1', 'L2', 'p1', 'E1'), 0),
      tableGameKey('u1', 'L1', 'E1', 'p1', 0),
      tableGameKey('u2', 'L1', 'E1', 'p1', 0),
      gameKey(soloPlace('u1', null), 0),
      gameKey(soloPlace('u1', 'E1'), 0),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('memoria del juego en curso', () => {
  it('guarda lo que hay en el editor (tiros con sus pines, la forma) y lo vuelve a leer igual', () => {
    const work = w({ mode: 'pines', rolls: [10, 7], masks: [1023, 127] });
    writeGameDraft(KEY, work, EMPTY, NOW);
    expect(JSON.parse(store.get(storageKey(KEY))!)).toEqual({ score: null, frames: { rolls: [10, 7], masks: [1023, 127] }, mode: 'pines', base: EMPTY, at: NOW });
    expect(readGameDraft(KEY, NOW + DAY)).toEqual({ work, base: EMPTY, at: NOW });
    // Solo el total también.
    writeGameDraft(KEY, w({ mode: 'total', total: '187' }), null, NOW);
    expect(readGameDraft(KEY, NOW)?.work).toEqual(w({ mode: 'total', total: '187' }));
  });

  it('lo anotado antes sin la forma: por cuadros si tiene tiros (pines si los marcó) y si no, el total', () => {
    store.set(storageKey(KEY), JSON.stringify({ score: null, frames: { rolls: [9], masks: [511] }, at: NOW }));
    expect(readGameDraft(KEY, NOW)?.work.mode).toBe('pines');
    store.set(storageKey(KEY), JSON.stringify({ score: 215, frames: null, at: NOW }));
    expect(readGameDraft(KEY, NOW)?.work).toMatchObject({ mode: 'total', total: '215' });
  });

  it('vacía (ni tiros ni total) se borra', () => {
    writeGameDraft(KEY, w({ rolls: [8] }), EMPTY, NOW);
    writeGameDraft(KEY, w(), EMPTY, NOW);
    expect(store.size).toBe(0);
    rememberGame(KEY, w({ rolls: [8] }), EMPTY, NOW);
    rememberGame(KEY, w({ mode: 'total', total: '  ' }), EMPTY, NOW);
    expect(store.size).toBe(0);
  });

  it('a los 14 días todavía está; pasados, ya no (y se borra)', () => {
    writeGameDraft(KEY, w({ rolls: [9] }), EMPTY, NOW);
    expect(readGameDraft(KEY, NOW + DRAFT_MAX_AGE_MS)).not.toBeNull();
    expect(readGameDraft(KEY, NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(store.has(storageKey(KEY))).toBe(false);
  });

  it('dañada, con tiros imposibles o un tiro vacío que no existe: no se ofrece y se borra', () => {
    for (const raw of [
      '{',
      '"hola"',
      JSON.stringify({ score: null, frames: { rolls: [8, 5] }, at: NOW }),
      JSON.stringify({ score: 'x', frames: null, at: NOW }),
      JSON.stringify({ score: 200, frames: null }),
      JSON.stringify({ score: null, frames: { rolls: [10, 7] }, mode: 'dedos', at: NOW }),
      JSON.stringify({ score: null, frames: { rolls: [10, 7] }, hole: { roll: 2, kind: 'falta' }, at: NOW }),
      JSON.stringify({ score: null, frames: { rolls: [10, 7] }, hole: { roll: 1, kind: 'otro' }, at: NOW }),
      JSON.stringify({ score: null, frames: { rolls: [10, 7] }, base: { score: 'x' }, at: NOW }),
    ]) {
      store.set(storageKey(KEY), raw);
      expect(readGameDraft(KEY, NOW), raw).toBeNull();
      expect(store.size, raw).toBe(0);
    }
  });

  it('cada cambio: se guarda si es distinto de lo guardado; vacío o igual, se borra', () => {
    const saved = { score: 180, frames: null };
    rememberGame(KEY, w({ rolls: [10] }), saved, NOW);
    expect(readGameDraft(KEY, NOW)?.work.rolls).toEqual([10]);
    rememberGame(KEY, w({ mode: 'total', total: '180' }), saved, NOW);
    expect(store.size).toBe(0);
    rememberGame(KEY, w({ mode: 'total', total: '181' }), saved, NOW);
    expect(store.size).toBe(1);
    rememberGame(KEY, w({ mode: 'total' }), saved, NOW);
    expect(store.size).toBe(0);
  });

  it('lo que ya está igual no se reescribe: la fecha es la del último cambio', () => {
    rememberGame(KEY, w({ rolls: [10] }), EMPTY, NOW);
    rememberGame(KEY, w({ rolls: [10] }), EMPTY, NOW + DAY);
    expect(readGameDraft(KEY, NOW + DAY)?.at).toBe(NOW);
    rememberGame(KEY, w({ rolls: [10, 3] }), EMPTY, NOW + DAY);
    expect(readGameDraft(KEY, NOW + DAY)?.at).toBe(NOW + DAY);
  });
});

describe('cambiar de forma de anotar no borra lo anotado', () => {
  it('a mitad del juego, pasar a «Total» (que no tiene total) deja los tiros en la memoria', () => {
    const rolls = [10, 7, 2, 9];
    rememberGame(KEY, w({ rolls }), EMPTY, NOW);
    // En «Total» el editor no da tiros ni puntaje (no hay nada que guardar)…
    const onTotal = w({ mode: 'total', rolls });
    expect(editorValue('total', { ...onTotal, hole: false }, EMPTY)).toEqual({ score: null, frames: null, ready: false });
    // …pero lo que hay en el editor sigue teniendo los tiros, y eso es lo que queda.
    rememberGame(KEY, onTotal, EMPTY, NOW);
    expect(readGameDraft(KEY, NOW)?.work).toMatchObject({ mode: 'total', rolls });
    // Al volver: por cuadros, donde se ven (en «Total» no se vería nada).
    expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)?.work).toMatchObject({ mode: 'teclado', rolls });
  });

  it('un juego guardado al que se le cambian tiros y se pasa a «Total» (con el mismo total): los tiros cambiados se quedan', () => {
    const rolls = [8, 0, ...rep(9, 9, 0)];
    rememberGame(KEY, w({ rolls }), NINETY, NOW);
    rememberGame(KEY, w({ mode: 'total', rolls, total: '90' }), NINETY, NOW);
    expect(readGameDraft(KEY, NOW)?.work.rolls).toEqual(rolls);
    expect(pendingDraft(KEY, NINETY, NINETY, NOW)?.work).toMatchObject({ mode: 'teclado', rolls });
  });

  it('solo mirar «Total» en un juego guardado no es un cambio', () => {
    rememberGame(KEY, w({ mode: 'total', rolls: NINETY.frames!.rolls, total: '90' }), NINETY, NOW);
    expect(store.size).toBe(0);
    // Ni pasar a «Total» un juego terminado: el total que se llena solo es el del juego.
    expect(sameWork(w({ rolls: NINETY.frames!.rolls }), w({ mode: 'total', rolls: NINETY.frames!.rolls, total: '90' }))).toBe(true);
  });

  it('un total escrito y volver a los tiros sin anotar ninguno: el total se queda y vuelve en «Total»', () => {
    rememberGame(KEY, w({ mode: 'total', total: '215' }), EMPTY, NOW);
    rememberGame(KEY, w({ mode: 'teclado', total: '215' }), EMPTY, NOW);
    expect(readGameDraft(KEY, NOW)?.work.total).toBe('215');
    expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)?.work.mode).toBe('total');
  });

  it('con los pines marcados vuelve a «Pines»; un juego terminado mirado en «Total», en «Total»', () => {
    rememberGame(KEY, w({ mode: 'pines', rolls: [9], masks: [511] }), EMPTY, NOW);
    expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)?.work.mode).toBe('pines');
    rememberGame(KEY, w({ mode: 'total', rolls: NINETY.frames!.rolls, total: '90' }), EMPTY, NOW);
    expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)?.work.mode).toBe('total');
  });
});

describe('al volver a abrir', () => {
  it('igual a lo guardado no es pendiente: se borra y se arranca de lo guardado', () => {
    writeGameDraft(KEY, w({ rolls: NINETY.frames!.rolls }), EMPTY, NOW);
    expect(pendingDraft(KEY, NINETY, NINETY, NOW)).toBeNull();
    expect(store.size).toBe(0);
    writeGameDraft(KEY, w({ rolls: [9, 0, 7] }), NINETY, NOW);
    expect(pendingDraft(KEY, NINETY, NINETY, NOW)?.work.rolls).toEqual([9, 0, 7]);
    expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)?.work.rolls).toEqual([9, 0, 7]);
  });

  it('el tiro que faltaba escribir al corregir sigue faltando (no vuelve como un 0 listo para guardar)', () => {
    const perfect: ScoreValue = { score: 300, frames: { rolls: rep(12, 10) } };
    // La X del cuadro 3 pasó a 7 y falta el segundo tiro (quedó en 0 por ahora).
    const fix = replaceRoll(perfect.frames!.rolls, [], 2, 7, null);
    rememberGame(KEY, w({ rolls: fix.rolls, hole: { roll: fix.next!, kind: 'falta' } }), perfect, NOW);
    const back = pendingDraft(KEY, perfect, perfect, NOW)!;
    expect(back.work.hole).toEqual({ roll: 3, kind: 'falta' });
    expect(editorValue('teclado', { ...back.work, hole: !!back.work.hole }, perfect)).toMatchObject({ ready: false });
    // Si no, saldría «Guardar 261» con el 0 de mientras.
    expect(editorValue('teclado', { ...back.work, hole: false }, perfect)).toMatchObject({ score: 261, ready: true });
  });

  it('si lo guardado cambió desde que empezó (otro teléfono o la casilla), se dice cuánto quedó guardado', () => {
    rememberGame(KEY, w({ rolls: [9, 0, 8] }), EMPTY, NOW);
    expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)?.newer).toBeNull();
    const now210 = { score: 210, frames: null };
    expect(pendingDraft(KEY, now210, now210, NOW)?.newer).toEqual(now210);
    // Seguir anotando no borra de qué partió: el aviso sigue hasta guardar o descartar.
    rememberGame(KEY, w({ rolls: [9, 0, 8, 1] }), now210, NOW + DAY);
    expect(readGameDraft(KEY, NOW + DAY)?.base).toEqual(EMPTY);
    expect(pendingDraft(KEY, now210, now210, NOW + DAY)?.newer).toEqual(now210);
  });

  it('juego suelto: «Listo» la deja hasta guardar la hoja; abierta otra vez sin cambios no avisa, y si la app se cerró, vuelve', () => {
    const SOLO = gameKey(soloPlace('u1', null), 0);
    rememberGame(SOLO, w({ rolls: NINETY.frames!.rolls }), EMPTY, NOW);
    forgetAfterSave(SOLO, undefined, true);
    expect(readGameDraft(SOLO, NOW)).not.toBeNull();
    // La casilla ya tiene el juego: sin aviso, y la memoria sigue (lo guardado de verdad todavía no lo tiene).
    expect(pendingDraft(SOLO, NINETY, EMPTY, NOW)).toBeNull();
    rememberGame(SOLO, w({ rolls: NINETY.frames!.rolls, total: '90' }), EMPTY, NOW + DAY);
    expect(readGameDraft(SOLO, NOW)?.at).toBe(NOW);
    // La app se cerró antes de «Guardar»: la casilla vacía y el juego vuelve con el aviso.
    expect(pendingDraft(SOLO, EMPTY, EMPTY, NOW)?.work.rolls).toEqual(NINETY.frames!.rolls);
  });
});

describe('después de «Guardar»', () => {
  it('se borra si se guardó; si no se guardó (false) o lo guarda otra hoja después, se queda', () => {
    for (const [result, later, kept] of [
      [undefined, false, false],
      [true, false, false],
      [false, false, true],
      [undefined, true, true],
    ] as const) {
      rememberGame(KEY, w({ rolls: [10] }), EMPTY, NOW);
      forgetAfterSave(KEY, result, later);
      expect(store.has(storageKey(KEY)), `${result} ${later}`).toBe(kept);
    }
  });
});

describe('lugares', () => {
  it('se borran las de un lugar sin tocar las de otro', () => {
    const nuevo = soloPlace('u1', null);
    writeGameDraft(gameKey(nuevo, 0), w({ rolls: [5] }), EMPTY, NOW);
    writeGameDraft(gameKey(nuevo, 3), w({ mode: 'total', total: '120' }), EMPTY, NOW);
    writeGameDraft(gameKey(soloPlace('u1', 'nuevo2'), 0), w({ mode: 'total', total: '120' }), EMPTY, NOW);
    store.set('mm:modo-anotar', 'pines');
    clearGameDrafts(nuevo);
    expect([...store.keys()]).toEqual(['mm:juego-en-curso:solo:u1:nuevo2:0', 'mm:modo-anotar']);
    clearGameDraft(gameKey(soloPlace('u1', 'nuevo2'), 0));
    expect([...store.keys()]).toEqual(['mm:modo-anotar']);
  });

  it('elegir otro evento pasa lo anotado a medias a ese evento (si allá hay una más nueva para ese juego, se queda esa)', () => {
    const X = myGamesPlace('u1', 'L1', 'p1', 'E1');
    const X10 = myGamesPlace('u1', 'L1', 'p1', 'E10');
    const Y = myGamesPlace('u1', 'L1', 'p1', '__fecha__');
    writeGameDraft(gameKey(X, 1), w({ rolls: [6, 3] }), EMPTY, NOW);
    writeGameDraft(gameKey(X, 2), w({ rolls: [7] }), EMPTY, NOW);
    writeGameDraft(gameKey(Y, 2), w({ rolls: [10] }), EMPTY, NOW + 1);
    writeGameDraft(gameKey(X10, 1), w({ rolls: [1] }), EMPTY, NOW);
    moveGameDrafts(X, Y);
    expect(readGameDraft(gameKey(X, 1), NOW)).toBeNull();
    expect(readGameDraft(gameKey(X, 2), NOW)).toBeNull();
    expect(readGameDraft(gameKey(Y, 1), NOW)?.work.rolls).toEqual([6, 3]);
    expect(readGameDraft(gameKey(Y, 2), NOW)?.work.rolls).toEqual([10]);
    // E10 empieza igual que E1 pero es otro evento.
    expect(readGameDraft(gameKey(X10, 1), NOW)?.work.rolls).toEqual([1]);
  });
});

describe('sin almacenamiento', () => {
  it('no se rompe (o si falla): no hay memoria', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
      key: () => {
        throw new Error('bloqueado');
      },
      get length() {
        throw new Error('bloqueado');
      },
    });
    try {
      expect(() => writeGameDraft(KEY, w({ mode: 'total', total: '200' }), EMPTY, NOW)).not.toThrow();
      expect(readGameDraft(KEY, NOW)).toBeNull();
      expect(pendingDraft(KEY, EMPTY, EMPTY, NOW)).toBeNull();
      expect(() => rememberGame(KEY, w({ rolls: [10] }), EMPTY, NOW)).not.toThrow();
      expect(() => rememberGame(KEY, w(), EMPTY, NOW)).not.toThrow();
      expect(() => clearGameDrafts(PLACE)).not.toThrow();
      expect(() => moveGameDrafts(PLACE, myGamesPlace('u1', 'L1', 'p1', 'E2'))).not.toThrow();
      expect(() => forgetAfterSave(KEY, undefined)).not.toThrow();
    } finally {
      vi.stubGlobal('localStorage', memoryStorage);
    }
  });
});
