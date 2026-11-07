import { PER_LANE_OPTIONS, parseLanes, type LaneMode } from '../../lib/lanes';

/**
 * Evento › Pistas sin pantalla (LanesPanel de la web y la pantalla de pistas de la app): lo último que usó el admin en
 * este teléfono, las formas de repartir y lo que dice cada aviso. Pruebas en logic.test.ts.
 */

/** Lo último que usó el admin (en este teléfono): las pistas que escribió y cuántos por pista. */
export interface LanePrefs {
  lanes: string;
  perLane: number;
}

const prefsKey = (lid: string) => `mm:pistas:${lid}`;

export function readLanePrefs(lid: string): LanePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(prefsKey(lid)) ?? 'null') as Partial<LanePrefs> | null;
    const perLane = Number(v?.perLane);
    return {
      lanes: typeof v?.lanes === 'string' && parseLanes(v.lanes) ? v.lanes : '',
      perLane: PER_LANE_OPTIONS.includes(perLane as (typeof PER_LANE_OPTIONS)[number]) ? perLane : 4,
    };
  } catch {
    return { lanes: '', perLane: 4 };
  }
}

export function saveLanePrefs(lid: string, prefs: LanePrefs) {
  try {
    localStorage.setItem(prefsKey(lid), JSON.stringify(prefs));
  } catch {
    // sin almacenamiento: la próxima vez se escribe de nuevo
  }
}

export const LANE_MODES: readonly { key: LaneMode; label: string }[] = [
  { key: 'promedio', label: 'Por promedio' },
  { key: 'equipo', label: 'Por equipo' },
  { key: 'azar', label: 'Al azar' },
];

/** Las formas que se pueden elegir («Por equipo» solo si el evento tiene equipos) y la que queda elegida. */
export function laneModes(mode: LaneMode, teams: boolean): { modes: { key: LaneMode; label: string }[]; active: LaneMode } {
  const modes = LANE_MODES.filter((m) => m.key !== 'equipo' || teams);
  return { modes, active: modes.some((m) => m.key === mode) ? mode : 'promedio' };
}

/** La línea de debajo de las formas: cómo se reparten y, si hay jugadores, cuántas pistas hacen falta. */
export function laneModeHint(mode: LaneMode, players: number, need: number, perLane: number): string {
  const how = mode === 'promedio' ? 'Los de promedios parecidos juntos.' : mode === 'equipo' ? 'Los de un mismo equipo juntos.' : 'Al azar, cada vez distinto.';
  return players > 0 && need > 0 ? `${how} Hacen falta ${need} ${need === 1 ? 'pista' : 'pistas'} de ${perLane}.` : how;
}

/** Quiénes entran: «3 jugadores: los que dijeron «voy» o están inscritos.» o que todavía nadie. */
export const laneCandidatesText = (n: number) =>
  n ? `${n} ${n === 1 ? 'jugador' : 'jugadores'}: los que dijeron «voy» o están inscritos.` : 'Todavía nadie dijo «voy» ni está inscrito.';

/** No caben todos en las pistas escritas. */
export const lanesDontFitText = (players: number, places: number) =>
  `No caben: son ${players} y hay ${places} lugares. Agrega pistas o sube los jugadores por pista.`;

/** Cómo están las pistas: sin publicar, con cambios sin avisar o publicadas. */
export function lanesStatus(published: boolean, changed: number): { tone: 'warn' | 'ok'; text: string } {
  if (!published) return { tone: 'warn', text: 'Sin publicar' };
  if (changed) return { tone: 'warn', text: changed === 1 ? '1 cambio sin avisar' : `${changed} cambios sin avisar` };
  return { tone: 'ok', text: 'Publicadas' };
}

/** El aviso al publicar: a cuántos les llegó (o que nadie de la lista tiene cuenta). */
export const lanesPublishedText = (pushed: number) =>
  pushed ? `Pistas publicadas: le avisamos a ${pushed} ${pushed === 1 ? 'jugador' : 'jugadores'}` : 'Pistas publicadas (nadie de la lista tiene cuenta)';

/** La pregunta antes de publicar (la primera vez o al avisar otra vez). */
export const publishLanesConfirm = (published: boolean) => ({
  title: published ? '¿Avisar las pistas otra vez?' : '¿Publicar las pistas?',
  message: 'A cada jugador con cuenta le llega «Tu pista: …» al teléfono, y la ve en el evento y en el inicio de la liga.',
  confirmText: 'Publicar y avisar',
});

/** La pregunta antes de armar otra vez (se pierden los cambios a mano). */
export const rebuildLanesConfirm = {
  title: '¿Armar las pistas otra vez?',
  message: 'Se reemplazan las que hay ahora, también los cambios que hiciste a mano.',
  confirmText: 'Armar de nuevo',
};

/** La pregunta antes de borrarlas. */
export const clearLanesConfirm = (published: boolean) => ({
  title: '¿Borrar las pistas?',
  message: published ? 'Los jugadores dejan de ver su pista. Puedes armarlas otra vez cuando quieras.' : 'Puedes armarlas otra vez cuando quieras.',
  confirmText: 'Borrar',
  danger: true,
});

/** Lo que se dice cuando ya se avisó muchas veces en la hora (publish_lanes contesta 'rate_limited'). */
export const LANES_RATE_LIMITED = 'Ya avisaste varias veces en esta hora. Espera un rato.';
