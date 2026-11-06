/**
 * Lo que hace el editor de un juego de boliche sin pantallas (FrameEditor.tsx lo dibuja en la web y la app del teléfono,
 * movil/, en React Native): la forma de anotar, lo que hay en el editor, con qué arranca y lo que devuelve.
 */
import { scoreGame } from '../../lib/bowling';
import { isValidScore } from '../../lib/stats';
import type { GameFrames } from '../../lib/types';

export interface ScoreValue {
  score: number | null;
  /** Tiros del juego si se anotó por cuadros. */
  frames: GameFrames | null;
}

export type ScoreMode = 'pines' | 'teclado' | 'total';

/**
 * Lo que hay en el editor, para seguir después donde se dejó (ver draftMemory): la forma de anotar, los tiros (aunque esté
 * mirando «Total»), el total escrito (aunque haya vuelto a los tiros) y el tiro vacío que falta escribir al corregir.
 */
export interface EditorWork {
  mode: ScoreMode;
  rolls: number[];
  masks: (number | null)[];
  total: string;
  /** Teclado: el tiro que quedó vacío esperando el valor ('borrado' o 'falta', como `hole` del editor). */
  hole: { roll: number; kind: 'borrado' | 'falta' } | null;
}

const MODE_KEY = 'mm:modo-anotar';

export function savedMode(): ScoreMode | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'pines' || m === 'teclado' || m === 'total' ? m : null;
  } catch {
    return null;
  }
}

/** La forma de anotar que eligió el jugador (la próxima vez se abre así). */
export const preferredMode = (): ScoreMode => savedMode() ?? 'teclado';

/**
 * Cómo se abre el editor desde el botón de cuadros junto a una casilla del total (ahí el total ya se escribe a mano):
 * pines si es la preferida y, si no, teclado.
 */
export const framesMode = (): Exclude<ScoreMode, 'total'> => (savedMode() === 'pines' ? 'pines' : 'teclado');
export function setPreferredMode(m: ScoreMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // sin almacenamiento
  }
}

/**
 * Lo que el editor devuelve en cada cambio. Por cuadros sin ningún tiro, un juego que ya tenía solo el total se queda con
 * ese total (listo para guardar): así se abre «cuadros» para cambiar otra cosa (la bola) sin anotar los tiros ni pasar a
 * Total.
 */
export function editorValue(
  mode: ScoreMode,
  st: { rolls: readonly number[]; masks: readonly (number | null)[]; total: string; hole: boolean },
  initial: ScoreValue,
): ScoreValue & { ready: boolean } {
  if (mode === 'total') {
    const n = st.total.trim() === '' ? null : Number(st.total);
    return { score: n, frames: null, ready: n != null && isValidScore(n) };
  }
  if (!st.rolls.length && initial.score != null && !initial.frames?.rolls?.length) {
    return { score: initial.score, frames: null, ready: isValidScore(initial.score) };
  }
  const game = scoreGame(st.rolls);
  const withMasks = st.masks.some((m) => m != null);
  return {
    score: game.complete ? game.score : null,
    frames: st.rolls.length ? { rolls: [...st.rolls], ...(withMasks ? { masks: [...st.masks] } : {}) } : null,
    // Con un tiro borrado sin volver a escribir, el juego no está listo.
    ready: game.complete && !st.hole,
  };
}

/** Con qué arranca el editor: lo que quedó sin guardar (`resume`) o el juego guardado (`initial`). */
export function startState(initial: ScoreValue, startMode: ScoreMode | undefined, resume: EditorWork | null | undefined) {
  const mode: ScoreMode = resume
    ? resume.mode
    : initial.frames?.rolls?.length
      ? initial.frames.masks?.some((m) => m != null)
        ? 'pines'
        : 'teclado'
      : (startMode ?? (initial.score != null ? 'total' : (savedMode() ?? 'teclado')));
  const rolls = resume?.rolls ?? initial.frames?.rolls ?? [];
  // Al seguir donde se dejó, el tiro que faltaba sigue faltando (no se guarda el 0 de mientras como si fuera el tiro).
  const hole = resume?.mode === 'teclado' ? resume.hole : null;
  return {
    mode,
    rolls,
    masks: resume?.masks ?? initial.frames?.masks ?? initial.frames?.rolls?.map(() => null) ?? [],
    total: resume?.total ?? (initial.score != null ? String(initial.score) : ''),
    sel: hole?.roll ?? null,
    hole: hole?.kind ?? null,
  };
}

/** Filas de pines vistas desde el jugador: 7-8-9-10 al fondo, el 1 adelante (PinDeck de la web y del teléfono). */
export const PIN_ROWS: readonly (readonly number[])[] = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1],
];
