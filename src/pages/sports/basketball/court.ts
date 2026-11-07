import type { BasketballConfig, BasketballState, LastFoul } from '../../../sports/team/basketball';
import type { Side } from '../../../sports/types';
import { FOUL_LABEL } from './adapter';

/**
 * Lo que la mesa anotadora de baloncesto calcula para pintar (BasketballCourt.tsx de la web y la app del teléfono): el
 * modo de anotar guardado, el botón de fin del periodo, el orden de los dorsales, el aviso de la última falta y el
 * resumen al terminar. Sin React ni pantallas.
 */

export type ScoreMode = 'quick' | 'players';
export const MODE_KEY = 'mm:bb:modo';

export function readMode(): ScoreMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'players' ? 'players' : 'quick';
  } catch {
    return 'quick';
  }
}

export function saveMode(m: ScoreMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // sin almacenamiento: solo por esta vez
  }
}

/** Botón de fin del periodo según el formato. */
export function periodEndLabel(cfg: BasketballConfig, period: number): string {
  if (period > cfg.periods) return 'Fin de la prórroga';
  if (cfg.periods === 4) return 'Fin del cuarto';
  if (cfg.periods === 2) return 'Fin de la mitad';
  return 'Fin del tiempo';
}

/** Los puntos que se pueden anotar: en 3x3, 1 y 2; si no, 1, 2 y 3. */
export const pointButtons = (cfg: Pick<BasketballConfig, 'variant'>): readonly (1 | 2 | 3)[] => (cfg.variant === '3x3' ? [1, 2] : [1, 2, 3]);

/**
 * Los dorsales de un lado en la mesa: los presentes (o la plantilla si nadie está marcado) y los que ya anotaron, por
 * dorsal y luego por nombre.
 */
export function courtPlayerIds(
  state: Pick<BasketballState, 'present' | 'players'>,
  side: Side,
  roster: readonly string[],
  jerseyOf: (playerId: string) => number | null,
  nameOf: (playerId: string) => string,
): string[] {
  const i = side - 1;
  const ids = [...new Set([...(state.present[i].length ? state.present[i] : roster), ...Object.keys(state.players[i])])];
  return ids.sort((a, b) => (jerseyOf(a) ?? 1000) - (jerseyOf(b) ?? 1000) || nameOf(a).localeCompare(nameOf(b), 'es'));
}

/** «Falta personal de #7 Ana · 5.ª del equipo · bonus: 2 tiros libres» (la línea de arriba de la mesa). */
export function lastFoulText(lf: LastFoul | null | undefined, who: (side: Side, playerId?: string | null) => string): string | null {
  if (!lf) return null;
  return [
    `Falta ${FOUL_LABEL[lf.kind].toLowerCase()} de ${who(lf.side, lf.player)}`,
    lf.kind === 'coach_technical' || lf.kind === 'bench_technical' ? '1 tiro libre' : `${lf.teamFouls}.ª del equipo`,
    lf.kind === 'offensive'
      ? 'sin tiros libres'
      : lf.freeThrows && lf.kind === 'personal'
        ? `bonus: ${lf.freeThrows} tiros libres${lf.possession ? ' + posesión' : ''}`
        : lf.freeThrows && lf.kind !== 'coach_technical' && lf.kind !== 'bench_technical'
          ? `${lf.freeThrows} ${lf.freeThrows === 1 ? 'tiro libre' : 'tiros libres'}${lf.possession ? ' + posesión' : ''}`
          : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** «78-72 · Gana Tigres» (lo que se ve al terminar). */
export function finishText(state: Pick<BasketballState, 'score'>, winner: Side | null, names: readonly [string, string]): string {
  return `${state.score[0]}-${state.score[1]}${winner ? ` · Gana ${names[winner - 1]}` : ''}`;
}

const CLOCK = /^(\d{1,2})[:.](\d{2})$/;

/** «2:00» o «2.00» → lo que falta en ms; null si no se entiende. */
export function parseRemaining(text: string): number | null {
  const m = CLOCK.exec(text.trim());
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : null;
}
