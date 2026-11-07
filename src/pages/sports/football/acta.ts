import type { Side } from '../../../sports/types';
import type { ScoreLine } from './adapter';

/**
 * Corregir el acta de un partido ya anotado (ActaEditor.tsx de la web y la hoja de la app del teléfono): si el marcador
 * y los penales se pueden guardar, si los goles por jugador no cuadran, a quién se puede agregar y las amarillas que
 * llevan a la roja. Sin React ni pantallas.
 */

const num = (v: string) => (/^\d{1,2}$/.test(v.trim()) ? Number(v) : null);

export interface ActaCheck {
  a: number | null;
  b: number | null;
  pa: number | null;
  pb: number | null;
  /** El marcador quedó empatado (se pueden poner los penales). */
  tied: boolean;
  /** Hay tanda de penales escrita. */
  pensSet: boolean;
  /** Se puede guardar. */
  valid: boolean;
  /** Los goles por jugador suman más que el marcador. */
  mismatch: boolean;
}

export function actaCheck(goals: readonly [string, string], pens: readonly [string, string], lines: readonly ScoreLine[]): ActaCheck {
  const a = num(goals[0]);
  const b = num(goals[1]);
  const pa = num(pens[0]);
  const pb = num(pens[1]);
  const tied = a !== null && a === b;
  const pensSet = tied && pa !== null && pb !== null;
  const valid = a !== null && b !== null && (!pensSet || pa !== pb) && (pens[0] === '' || pa !== null) && (pens[1] === '' || pb !== null);
  const scorerGoals = (s: Side) => lines.filter((l) => l.side === s).reduce((n, l) => n + l.goals, 0) + lines.filter((l) => l.side !== s).reduce((n, l) => n + l.ownGoals, 0);
  const mismatch = a !== null && b !== null && (scorerGoals(1) > a || scorerGoals(2) > b);
  return { a, b, pa, pb, tied, pensSet, valid, mismatch };
}

/** A quién se puede agregar al acta: la plantilla primero y después los demás de la liga, sin los que ya están. */
export function actaCandidates(roster: readonly string[], players: readonly string[], lines: readonly Pick<ScoreLine, 'playerId'>[]): string[] {
  return [...roster, ...players].filter((id, i, a) => a.indexOf(id) === i && !lines.some((l) => l.playerId === id));
}

/** Un jugador nuevo en el acta (jugó, sin goles ni tarjetas). */
export const newActaLine = (playerId: string, side: Side): ScoreLine => ({ playerId, side, played: true, goals: 0, assists: 0, ownGoals: 0, yellows: 0, red: null, keeper: false, conceded: 0 });

/** Las amarillas: con 2, roja por doble amarilla; al bajar, se quita esa roja (la directa se queda). */
export const withYellows = (l: Pick<ScoreLine, 'red'>, n: number): Pick<ScoreLine, 'yellows' | 'red'> => ({ yellows: n, red: n >= 2 ? 'second_yellow' : l.red === 'second_yellow' ? null : l.red });
