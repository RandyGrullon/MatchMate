import { scoreGame, validRolls } from '../../lib/bowling';
import type { GameFrames } from '../../lib/types';
import type { EditorWork, ScoreMode, ScoreValue } from './FrameEditor';

/**
 * Memoria del juego que se está anotando: cada cambio de la hoja queda en el teléfono hasta «Guardar», así cerrarla
 * (Cancelar, Esc, el fondo, el gesto de atrás o la app cerrada) no pierde los tiros. Una por juego: la clave lleva la
 * cuenta, el lugar (evento, envío o juego suelto), el jugador y el número del juego.
 *
 * Se guarda lo que hay en el editor y no solo lo que daría «Guardar»: los tiros aunque esté mirando «Total», el total
 * escrito aunque haya vuelto a los tiros, la forma de anotar y el tiro que falta escribir al corregir. En el teléfono:
 * `{ score, frames, mode, hole, base, at }` (`score` = el total escrito; `frames` = los tiros con sus pines). `base` es lo
 * guardado cuando se empezó: si después se guardó otra cosa (otro teléfono, la casilla), se avisa al volver.
 */
const PREFIX = 'mm:juego-en-curso:';
/** Más vieja que esto ya no se ofrece (y se borra). */
export const DRAFT_MAX_AGE_MS = 14 * 86_400_000;

/** La clave de un juego con sus partes (las vacías quedan como «-»). */
export const memoryKeyOf = (...parts: (string | number | null | undefined)[]) =>
  parts.map((p) => (p == null || p === '' ? '-' : String(p))).join(':');

export const storageKey = (memoryKey: string) => PREFIX + memoryKey;

/**
 * Los juegos del jugador en un evento (o «por fecha»): «Mis juegos» y «Subir mis juegos» usan la misma, es el mismo
 * juego en el teléfono. `place` = el id del evento o el de «Otro día».
 */
export const myGamesPlace = (uid: string | null, lid: string, playerId: string, place: string) => memoryKeyOf('juego', uid, lid, playerId, place);
/** Las filas de la tabla de un evento (admin o anotador): cada fila y juego la suya. */
export const tableGameKey = (uid: string | null, lid: string, eventId: string, entryId: string, game: number) =>
  memoryKeyOf('tabla', uid, lid, eventId, entryId, game);
/** Las casillas de un juego suelto (uno nuevo: «nuevo», así se encuentra también después de cerrar la app). */
export const soloPlace = (uid: string | null, sessionId: string | null | undefined) => memoryKeyOf('solo', uid, sessionId ?? 'nuevo');
/** La de un juego de un lugar. */
export const gameKey = (place: string, game: number) => `${place}:${game}`;

/** Lo que cuenta para saber si cambió algo (la forma de anotar no). */
type Content = Pick<EditorWork, 'rolls' | 'masks' | 'total'>;

/** Lo que tiene el editor al abrir un juego guardado. */
export const contentOf = (v: ScoreValue): Content => ({
  rolls: v.frames?.rolls ?? [],
  masks: v.frames?.masks ?? [],
  total: v.score != null ? String(v.score) : '',
});

/** El total que se ve en «Total»: lo escrito o, sin escribir, el del juego terminado (así se llena al pasar ahí). */
function shownTotal(c: Content): string {
  const t = c.total.trim();
  if (t !== '') return Number.isFinite(Number(t)) ? String(Number(t)) : t;
  const g = scoreGame(c.rolls);
  return c.rolls.length && g.complete ? String(g.score) : '';
}

const sameRolls = (a: Content, b: Content) =>
  a.rolls.length === b.rolls.length && a.rolls.every((r, i) => r === b.rolls[i] && (a.masks[i] ?? null) === (b.masks[i] ?? null));

/** ¿Nada anotado? (ni tiros ni total escrito) */
export const emptyWork = (c: Content) => !c.rolls.length && c.total.trim() === '';

/**
 * ¿Lo mismo? Los mismos tiros con los mismos pines marcados (sin marcar = null) y el mismo total en «Total». Solo pasar
 * de una forma de anotar a otra no es un cambio.
 */
export const sameWork = (a: Content, b: Content) => sameRolls(a, b) && shownTotal(a) === shownTotal(b);

const sameHole = (a: EditorWork['hole'], b: EditorWork['hole']) => (a?.roll ?? null) === (b?.roll ?? null) && (a?.kind ?? null) === (b?.kind ?? null);

/** Lo que queda en el teléfono de un juego. */
export interface GameMemory {
  work: EditorWork;
  /** Lo guardado cuando se empezó a anotar (null = no se sabe). */
  base: ScoreValue | null;
  at: number;
}

const MODES: readonly ScoreMode[] = ['pines', 'teclado', 'total'];
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Tiros (con sus pines) que tienen sentido; null = sin tiros; undefined = dañados. */
function parseFrames(f: unknown): GameFrames | null | undefined {
  if (f == null) return null;
  const { rolls, masks } = f as { rolls?: unknown; masks?: unknown };
  if (!Array.isArray(rolls) || !rolls.length || !validRolls(rolls as number[])) return undefined;
  if (masks == null) return { rolls: [...(rolls as number[])] };
  if (!Array.isArray(masks) || masks.length !== rolls.length || masks.some((m) => m !== null && (typeof m !== 'number' || !Number.isInteger(m)))) {
    return undefined;
  }
  return { rolls: [...(rolls as number[])], masks: masks as (number | null)[] };
}

function parse(raw: string): GameMemory | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || !isNum(d.at)) return null;
    if (d.score != null && !isNum(d.score)) return null;
    const frames = parseFrames(d.frames);
    if (frames === undefined) return null;
    const rolls = frames?.rolls ?? [];
    const masks = frames?.masks ?? rolls.map(() => null);
    if (d.mode != null && !MODES.includes(d.mode as ScoreMode)) return null;
    // Sin la forma: por cuadros si tiene tiros (pines si los marcó) y si no, el total.
    const mode = (d.mode as ScoreMode | undefined) ?? (rolls.length ? (masks.some((m) => m != null) ? 'pines' : 'teclado') : 'total');
    let hole: EditorWork['hole'] = null;
    if (d.hole != null) {
      const h = d.hole as { roll?: unknown; kind?: unknown };
      if (!Number.isInteger(h.roll) || (h.roll as number) < 0 || (h.roll as number) >= rolls.length || (h.kind !== 'borrado' && h.kind !== 'falta')) return null;
      hole = { roll: h.roll as number, kind: h.kind };
    }
    let base: ScoreValue | null = null;
    if (d.base != null) {
      const b = d.base as { score?: unknown; frames?: unknown };
      const bf = parseFrames(b.frames);
      if (bf === undefined || (b.score != null && !isNum(b.score))) return null;
      base = { score: (b.score as number | null | undefined) ?? null, frames: bf };
    }
    const work: EditorWork = { mode, rolls, masks, total: isNum(d.score) ? String(d.score) : '', hole };
    return emptyWork(work) ? null : { work, base, at: d.at };
  } catch {
    return null;
  }
}

/** Lo que quedó sin guardar en ese juego, o null (no hay, está dañado o tiene más de 14 días: esos se borran). */
export function readGameDraft(memoryKey: string, now = Date.now()): GameMemory | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(memoryKey));
  } catch {
    return null; // sin almacenamiento
  }
  if (raw == null) return null;
  const d = parse(raw);
  if (!d || now - d.at > DRAFT_MAX_AGE_MS) {
    clearGameDraft(memoryKey);
    return null;
  }
  return d;
}

/** Guarda lo que hay en el editor (con lo guardado de ese juego, `base`); vacío (ni tiros ni total) la borra. */
export function writeGameDraft(memoryKey: string, work: EditorWork, base: ScoreValue | null, now = Date.now()) {
  if (emptyWork(work)) return clearGameDraft(memoryKey);
  const t = work.total.trim() === '' ? null : Number(work.total);
  const withMasks = work.masks.some((m) => m != null);
  const data = {
    score: t != null && Number.isFinite(t) ? t : null,
    frames: work.rolls.length ? { rolls: work.rolls, ...(withMasks ? { masks: work.masks } : {}) } : null,
    mode: work.mode,
    ...(work.hole ? { hole: work.hole } : {}),
    base,
    at: now,
  };
  try {
    localStorage.setItem(storageKey(memoryKey), JSON.stringify(data));
  } catch {
    // sin almacenamiento (o lleno): se anota igual, sin memoria
  }
}

export function clearGameDraft(memoryKey: string) {
  try {
    localStorage.removeItem(storageKey(memoryKey));
  } catch {
    // sin almacenamiento
  }
}

/** Las claves (completas) de los juegos de un lugar. */
function placeKeys(place: string): string[] {
  const start = storageKey(`${place}:`);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(start)) keys.push(k);
  }
  return keys;
}

/** Borra las de todos los juegos de un lugar (p. ej. las de un juego suelto al guardarlo). */
export function clearGameDrafts(place: string) {
  try {
    placeKeys(place).forEach((k) => localStorage.removeItem(k));
  } catch {
    // sin almacenamiento
  }
}

/**
 * Pasa las de los juegos de un lugar a otro (se había elegido mal el evento y lo anotado se pasa al elegido). Si el otro
 * ya tiene una para ese juego, se queda la más nueva.
 */
export function moveGameDrafts(from: string, to: string) {
  if (from === to) return;
  try {
    const start = storageKey(`${from}:`);
    const at = (r: string | null) => (r != null ? (parse(r)?.at ?? -1) : -1);
    for (const k of placeKeys(from)) {
      const raw = localStorage.getItem(k);
      localStorage.removeItem(k);
      const target = storageKey(`${to}:${k.slice(start.length)}`);
      if (raw != null && at(raw) > at(localStorage.getItem(target))) localStorage.setItem(target, raw);
    }
  } catch {
    // sin almacenamiento
  }
}

/** Lo que se ofrece al abrir un juego: con qué sigue el editor y, si lo guardado cambió desde que empezó, lo guardado ahora. */
export interface PendingDraft {
  work: EditorWork;
  newer: ScoreValue | null;
}

/**
 * Con qué forma se sigue: la que tenía, salvo que ahí no se vea lo que cambió (en «Total» sin haber escrito otro total,
 * los tiros; por cuadros con los mismos tiros, el total escrito).
 */
function resumeMode(w: EditorWork, initial: ScoreValue): ScoreMode {
  const i = contentOf(initial);
  const rollsChanged = !sameRolls(w, i);
  const totalChanged = shownTotal(w) !== shownTotal(i);
  if (w.mode === 'total') return totalChanged || !rollsChanged ? 'total' : w.masks.some((m) => m != null) ? 'pines' : 'teclado';
  return rollsChanged || !totalChanged ? w.mode : 'total';
}

/**
 * Con qué arranca la hoja al abrir un juego: lo que quedó sin guardar si es distinto de lo que se abre (`initial`). Igual a
 * lo guardado de verdad (`saved`, si no es `initial`) se borra: no hay nada pendiente. Con `newer` si lo guardado cambió
 * desde que se empezó a anotar.
 */
export function pendingDraft(memoryKey: string, initial: ScoreValue, saved: ScoreValue = initial, now = Date.now()): PendingDraft | null {
  const d = readGameDraft(memoryKey, now);
  if (!d) return null;
  if (sameWork(d.work, contentOf(saved))) {
    clearGameDraft(memoryKey);
    return null;
  }
  // Lo mismo que se abre (lo pasó con «Listo» a una hoja que se guarda después): se queda, sin aviso.
  if (sameWork(d.work, contentOf(initial))) return null;
  const mode = resumeMode(d.work, initial);
  return {
    work: { ...d.work, mode, hole: mode === 'teclado' ? d.work.hole : null },
    newer: d.base && !sameWork(contentOf(d.base), contentOf(saved)) ? saved : null,
  };
}

/**
 * Cada cambio de la hoja: guarda lo que hay en el editor; vacío o igual a lo guardado (`saved`), la borra. Lo guardado
 * cuando empezó (`base`) se queda mientras exista (el aviso de que cambió no se pierde por seguir anotando) y lo que ya
 * está igual no se reescribe (la fecha es la del último cambio).
 */
export function rememberGame(memoryKey: string, work: EditorWork, saved: ScoreValue, now = Date.now()) {
  if (emptyWork(work) || sameWork(work, contentOf(saved))) return clearGameDraft(memoryKey);
  const had = readGameDraft(memoryKey, now);
  if (had && sameWork(had.work, work) && had.work.mode === work.mode && sameHole(had.work.hole, work.hole)) return;
  writeGameDraft(memoryKey, work, had ? had.base : saved, now);
}

/**
 * Después de «Guardar»: ya no está a medias y se borra, salvo que no se haya guardado (`onSave` devolvió `false`) o que lo
 * guarde de verdad otra hoja después (`later`: la borra esa al guardar).
 */
export function forgetAfterSave(memoryKey: string, result: unknown, later = false) {
  if (result !== false && !later) clearGameDraft(memoryKey);
}
