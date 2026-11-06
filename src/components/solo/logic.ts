import { SOLO_MAX_GAMES, SOLO_MAX_YEARS, type SoloSession } from '../../lib/data/solo';
import { isValidScore } from '../../lib/stats';
import type { GameFrames } from '../../lib/types';

/**
 * La lógica de la hoja de juegos sueltos (sin DOM: la usan la web, SoloGameSheet.tsx y SoloGamesPage.tsx, y la app del
 * teléfono).
 */

/** Casillas con las que arranca uno nuevo (una serie de 3). */
export const NEW_SLOTS = 3;

/** Lo que dicen las casillas: los juegos válidos en orden (sin huecos), sus cuadros y si alguna está mal. */
export function slotsToGames(values: readonly string[], frames: Readonly<Record<number, GameFrames>>) {
  const scores: number[] = [];
  const out: Record<string, GameFrames> = {};
  let invalid = false;
  values.forEach((v, i) => {
    if (!v.trim()) return;
    const n = Number(v);
    if (!isValidScore(n)) {
      invalid = true;
      return;
    }
    if (frames[i]) out[String(scores.length)] = frames[i];
    scores.push(n);
  });
  return { scores, frames: Object.keys(out).length ? out : null, invalid };
}

/** Las casillas de un juego que ya existe (sus juegos y cuadros; al menos 3). */
export function initialSlots(session: SoloSession | null): { values: string[]; frames: Record<number, GameFrames> } {
  if (!session) return { values: Array.from({ length: NEW_SLOTS }, () => ''), frames: {} };
  const values = session.scores.map(String);
  while (values.length < Math.min(NEW_SLOTS, SOLO_MAX_GAMES)) values.push('');
  const frames: Record<number, GameFrames> = {};
  for (const [k, f] of Object.entries(session.frames ?? {})) frames[Number(k)] = f;
  return { values, frames };
}

/** Una casilla como juego para la hoja de cuadros: el total (si es válido) y sus cuadros. */
export function slotGame(slots: { values: readonly string[]; frames: Readonly<Record<number, GameFrames>> }, i: number | null): { score: number | null; frames: GameFrames | null } {
  const v = i != null ? (slots.values[i]?.trim() ?? '') : '';
  return { score: v && isValidScore(Number(v)) ? Number(v) : null, frames: i != null ? (slots.frames[i] ?? null) : null };
}

/** Lo que dice la fecha cuando no sirve (vacía, del futuro o de hace más de 10 años). */
export const SOLO_DATE_HINT = `Elige la fecha (de hoy hacia atrás, hasta ${SOLO_MAX_YEARS} años).`;

/** Lo que se edita en la hoja. */
export interface SoloSheetValues {
  date: string;
  venue: string;
  note: string;
  shared: boolean;
  slots: { values: string[]; frames: Record<number, GameFrames> };
}

/** ¿Cambió algo desde que se abrió? (Cerrarla así pregunta antes: se perderían los juegos anotados.) */
export function soloSheetChanged(a: SoloSheetValues, b: SoloSheetValues): boolean {
  return (
    a.date !== b.date ||
    a.venue !== b.venue ||
    a.note !== b.note ||
    a.shared !== b.shared ||
    JSON.stringify(a.slots.values) !== JSON.stringify(b.slots.values) ||
    JSON.stringify(a.slots.frames) !== JSON.stringify(b.slots.frames)
  );
}

/**
 * Lo que falta para «Guardar», debajo de los juegos: «Cada juego va de 0 a 300.», «Anota al menos un juego…», el aviso
 * de la fecha o «3 juegos · serie 580 · promedio 193». `bad`: si va en rojo.
 */
export function soloGamesHint(games: { scores: readonly number[]; invalid: boolean }, dateOk: boolean, byPins: boolean): { text: string; bad: boolean } {
  const series = games.scores.reduce((a, b) => a + b, 0);
  const bad = games.invalid || (games.scores.length > 0 && !dateOk);
  const text = games.invalid
    ? 'Cada juego va de 0 a 300.'
    : !games.scores.length
      ? byPins
        ? 'Anota al menos un juego. Toca «pines» para anotarlo pino por pino.'
        : 'Anota al menos un juego. Toca «cuadros» para anotarlo tiro por tiro.'
      : !dateOk
        ? SOLO_DATE_HINT
        : `${games.scores.length} ${games.scores.length === 1 ? 'juego' : 'juegos'} · serie ${series} · promedio ${Math.floor(series / games.scores.length)}`;
  return { text, bad };
}

/** «210 · 180 · 190»: los juegos del día, en una línea. */
export const soloScoresLine = (s: Pick<SoloSession, 'scores'>): string => s.scores.join(' · ');
