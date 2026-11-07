import type { FootballConfig, FootballEvent, FootballState, ShootoutKick } from '../../../sports/team/football';
import type { Side } from '../../../sports/types';

/**
 * Lo que el acta digital de fútbol y sala calcula para pintar (FootballCourt.tsx de la web y la app del teléfono): el
 * orden de los dorsales, a quién se puede elegir, el banco de un cambio, quién patea en la tanda, el botón de fin del
 * tiempo, qué pasa al terminarlo y el resumen al final. Sin React ni pantallas.
 */

/** Después de un gol: quién marcó, quién asistió o de quién fue el autogol. */
export interface GoalFlow {
  side: Side;
  at: number;
  step: 'scorer' | 'assist' | 'own';
  scorer?: string;
}

/** ¿La última jugada es ese gol? (para cambiar quién marcó sin perder su minuto). */
export const sameGoal = (a: FootballEvent | undefined, side: Side, at: number) => a?.type === 'goal' && a.side === side && a.at === at;

/** Los de un lado: primero los que están en la cancha, después el banco; los que salieron o fueron expulsados al final. */
export function sideIds(
  s: Pick<FootballState, 'onField' | 'present' | 'players'>,
  side: Side,
  roster: readonly string[],
  jerseyOf: (playerId: string) => number | null,
  nameOf: (playerId: string) => string,
): string[] {
  const i = side - 1;
  const all = [...new Set([...(s.onField[i] ?? []), ...s.present[i], ...roster, ...Object.keys(s.players[i])])];
  const field = s.onField[i];
  const rank = (id: string) => {
    const p = s.players[i][id];
    if (p?.red) return 3;
    if (field) return field.includes(id) ? 0 : p?.subbedOff ? 2 : 1;
    return p?.subbedOff ? 2 : 0;
  };
  return all.sort((a, b) => rank(a) - rank(b) || (jerseyOf(a) ?? 1000) - (jerseyOf(b) ?? 1000) || nameOf(a).localeCompare(nameOf(b), 'es'));
}

/** Dorsales de un lado para elegir (los expulsados no; con `onlyAvailable`, solo los que están jugando). */
export function pickableIds(
  s: Pick<FootballState, 'onField' | 'players' | 'config'>,
  side: Side,
  ids: readonly string[],
  opts: { exclude?: readonly string[]; onlyAvailable?: boolean } = {},
): string[] {
  const i = side - 1;
  const field = s.onField[i];
  const exclude = opts.exclude ?? [];
  const onlyAvailable = opts.onlyAvailable ?? true;
  return ids.filter((id) => {
    if (exclude.includes(id)) return false;
    const p = s.players[i][id];
    if (p?.red) return false;
    if (!onlyAvailable) return true;
    if (field) return field.includes(id);
    return !(p?.subbedOff && !s.config.subs.reentry);
  });
}

/** Cuántos cambios se pueden en este periodo (null = sin límite; en la prórroga, más los de la prórroga). */
export const subsMax = (config: Pick<FootballConfig, 'subs'>, period: number): number | null =>
  config.subs.max === null ? null : config.subs.max + (period >= 3 ? config.subs.extraTimeBonus : 0);

/** Los que pueden entrar por `out` (el banco, sin expulsados ni los que ya salieron si no hay reingreso). */
export function benchFor(s: Pick<FootballState, 'onField' | 'players'>, config: Pick<FootballConfig, 'subs'>, out: { side: Side; playerId: string }, ids: readonly string[]): string[] {
  const i = out.side - 1;
  const field = s.onField[i];
  return ids.filter((id) => {
    if (id === out.playerId) return false;
    const p = s.players[i][id];
    if (p?.red) return false;
    if (p?.subbedOff && !config.subs.reentry) return false;
    return field ? !field.includes(id) : true;
  });
}

/** Quién patea el próximo penal (null hasta elegir quién empieza). */
export function nextKicker(kicks: readonly Pick<ShootoutKick, 'side'>[], first: Side | null): Side | null {
  if (!kicks.length) return first;
  return kicks.length % 2 === 0 ? kicks[0].side : kicks[0].side === 1 ? 2 : 1;
}

/** El botón de fin del tiempo: «Fin del 1.er tiempo», «Fin del 2.º tiempo», «Fin de la prórroga 1». */
export function periodEndLabel(period: number): string {
  return period === 1 ? 'Fin del 1.er tiempo' : period === 2 ? 'Fin del 2.º tiempo' : `Fin de la prórroga ${period - 2}`;
}

/** Lo que pasa al terminar el tiempo: descanso, fin de la 1.ª parte de la prórroga, prórroga, penales o el final. */
export type PeriodEndNext = 'half' | 'extra_half' | 'extra_time' | 'shootout' | 'final';

export function periodEndNext(s: Pick<FootballState, 'period' | 'score'>, config: Pick<FootballConfig, 'extraTime' | 'shootout'>): PeriodEndNext {
  const tied = s.score[0] === s.score[1];
  if (s.period === 1) return 'half';
  if (s.period === 3) return 'extra_half';
  if (s.period === 2 && tied && config.extraTime) return 'extra_time';
  if (tied && config.shootout) return 'shootout';
  return 'final';
}

/** «2-1 (pen. 4-3) · Gana Tigres» o «1-1 · Empate» (lo que se ve al terminar). */
export function finishText(s: Pick<FootballState, 'score'>, pens: readonly [number, number] | null, winner: Side | null, names: readonly [string, string]): string {
  return `${s.score[0]}-${s.score[1]}${pens && pens[0] + pens[1] > 0 ? ` (pen. ${pens[0]}-${pens[1]})` : ''}${winner ? ` · Gana ${names[winner - 1]}` : s.score[0] === s.score[1] ? ' · Empate' : ''}`;
}

/** El título de la hoja después del gol. */
export function goalSheetTitle(flow: GoalFlow, names: readonly [string, string], who: (side: Side, id?: string | null) => string, minute: string | null | undefined): string {
  const other: Side = flow.side === 1 ? 2 : 1;
  if (flow.step === 'own') return `Autogol: ¿de quién de ${names[other - 1]}?`;
  if (flow.step === 'assist') return `¿Quién asistió a ${who(flow.side, flow.scorer)}?`;
  return `¡Gol de ${names[flow.side - 1]}!${minute ? ` (${minute}')` : ''} ¿Quién marcó?`;
}

/** El minuto del último gol del acta (para el título de la hoja del gol). */
export const lastGoalMinute = (s: Pick<FootballState, 'timeline'>): string | null | undefined => [...s.timeline].reverse().find((t) => t.kind === 'goal' || t.kind === 'own_goal')?.minute;

const CLOCK = /^(\d{1,3})[:.](\d{2})$/;

/** «23:00» → el tiempo jugado en ms; null si no se entiende. */
export function parseElapsed(text: string): number | null {
  const m = CLOCK.exec(text.trim());
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : null;
}

/** Los minutos de añadido que se pueden anunciar. */
export const ADDED_MINUTES = [0, 1, 2, 3, 4, 5, 6, 8, 10] as const;
