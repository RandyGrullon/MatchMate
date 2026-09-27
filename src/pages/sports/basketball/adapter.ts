import type { CourtAdapter } from '../../../court/types';
import { isFinal, sideKey, type Match, type MatchScore, type MatchSide } from '../../../lib/data/matches';
import {
  basketball,
  basketballLines,
  basketballPeriodLabel,
  inPenalty,
  remainingMs,
  type BasketballConfig,
  type BasketballEvent,
  type BasketballLine,
  type BasketballState,
  type FoulKind,
} from '../../../sports/team/basketball';
import type { TeamMatchResult } from '../../../sports/team/standings';
import type { Side } from '../../../sports/types';

/**
 * La mesa anotadora de baloncesto enchufada al modo cancha (src/court): el motor puro de src/sports/team, el
 * marcador resumido que ven las tarjetas y los espectadores (matches.score) y cuándo publicar.
 *
 * `matches.score` de un partido de baloncesto:
 *   { text: "78-72" | "78-72 (pr.)" | "20-0 (forfeit)", sides: [78, 72], totals: {points}, periods: [[20,18], …],
 *     live: {p, pl, tf, bonus, clk: {r, ms, t} | null}, lines: "<jugador>:<lado>:<pts>:<1>:<2>:<3>:<faltas>;…",
 *     ending?: {kind: 'forfeit' | 'default', side} }
 * `lines` son los presentes con sus puntos y faltas: de ahí salen la tabla de anotadores y el perfil (sin bajar el
 * estado completo). `clk.t` es la hora del SERVIDOR (ms) en que el reloj marcaba `clk.ms`.
 */

/** Lo que ven los espectadores del partido en vivo (chico). */
export interface BasketballLive {
  /** Periodo (1..; más allá del último, prórroga). */
  p: number;
  /** «3.er cuarto», «Prórroga». */
  pl: string;
  /** Faltas de equipo del periodo. */
  tf: [number, number];
  /** El equipo ya está en bonus: su próxima falta da tiros libres. */
  bonus: [boolean, boolean];
  /** Reloj de referencia: corriendo, lo que faltaba (ms) y la hora del servidor de esa lectura. */
  clk: { r: boolean; ms: number; t: number } | null;
}

/** Línea de un jugador en un partido guardada en `score.lines`. */
export interface ScoreLine {
  playerId: string;
  side: Side;
  points: number;
  ones: number;
  twos: number;
  threes: number;
  fouls: number;
}

/** Tope de texto de `lines` (matches.score tiene que pesar menos de 4 KB). */
const MAX_LINES_CHARS = 2800;

function lineText(l: ScoreLine): string {
  return [l.playerId, l.side, l.points, l.ones, l.twos, l.threes, l.fouls].join(':');
}

/** Presentes con sus puntos y faltas, en texto compacto. Si no cabe, solo los que anotaron o hicieron falta. */
export function encodeLines(state: BasketballState): string {
  const lines: ScoreLine[] = basketballLines(state, ['1', '2']).map((l) => ({
    playerId: l.player,
    side: l.team === '2' ? 2 : 1,
    points: l.points,
    ones: l.ones,
    twos: l.twos,
    threes: l.threes,
    fouls: l.fouls,
  }));
  let text = lines.map(lineText).join(';');
  if (text.length > MAX_LINES_CHARS) text = lines.filter((l) => l.points || l.fouls).map(lineText).join(';');
  return text.length > MAX_LINES_CHARS ? '' : text;
}

export function decodeLines(raw: unknown): ScoreLine[] {
  if (typeof raw !== 'string' || !raw) return [];
  const out: ScoreLine[] = [];
  for (const part of raw.split(';')) {
    const [playerId, side, ...nums] = part.split(':');
    const n = nums.map(Number);
    if (!playerId || (side !== '1' && side !== '2') || n.length !== 5 || n.some((x) => !Number.isInteger(x) || x < 0)) continue;
    out.push({ playerId, side: side === '2' ? 2 : 1, points: n[0], ones: n[1], twos: n[2], threes: n[3], fouls: n[4] });
  }
  return out;
}

export function liveOf(state: BasketballState, now: number, offset = 0): BasketballLive {
  const cfg = state.config;
  const left = cfg.clock ? remainingMs(state, now) : null;
  return {
    p: state.period,
    pl: basketballPeriodLabel(cfg, state.period),
    tf: [state.teamFouls[0], state.teamFouls[1]],
    bonus: [inPenalty(state, 1), inPenalty(state, 2)],
    clk: left === null ? null : { r: state.clock.running, ms: Math.round(left), t: Math.round(now + offset) },
  };
}

/** Marcador resumido para matches.score. `now` = hora del teléfono; `offset` = servidor − teléfono (ms). */
export function basketballScore(state: BasketballState, now: number, offset = 0): MatchScore {
  const [a, b] = state.score;
  let text = `${a}-${b}`;
  if (state.ending?.kind === 'forfeit') text += ' (forfeit)';
  else if (state.ending?.kind === 'default') text += ' (default)';
  else if (state.period > state.config.periods) text += ' (pr.)';
  const out: MatchScore = {
    text,
    sides: [a, b],
    totals: { points: [a, b] },
    periods: state.periodScores.map(([x, y]) => [x, y]),
    live: liveOf(state, now, offset) as unknown as Record<string, unknown>,
  };
  const lines = encodeLines(state);
  if (lines) out.lines = lines;
  if (state.ending) out.ending = { kind: state.ending.kind, side: state.ending.side };
  return out;
}

/** El ganador para terminar: el del motor; si el anotador termina antes (se acabó la luz), el que va arriba. */
export function basketballWinner(state: BasketballState): Side | null {
  if (state.status === 'final') return state.winner;
  return state.score[0] > state.score[1] ? 1 : state.score[1] > state.score[0] ? 2 : null;
}

/**
 * Adaptador del modo cancha. Publica enseguida al cambiar de periodo o al terminar, y cuando el reloj arranca o
 * se para (los espectadores lo avanzan solos con la hora del servidor); si no, como mucho cada 60 s. Nunca por
 * canasta. `clock.offset` = diferencia con el servidor (useServerOffset).
 */
export function basketballAdapter(clock: { now?: () => number; offset?: () => number } = {}): CourtAdapter<BasketballConfig, BasketballState, BasketballEvent> {
  const now = clock.now ?? Date.now;
  return {
    engine: basketball,
    score: (s) => basketballScore(s, now(), clock.offset?.() ?? 0),
    winner: basketballWinner,
    milestone: (prev, next) =>
      prev.period !== next.period ||
      prev.status !== next.status ||
      prev.clock.running !== next.clock.running ||
      (prev.ending?.kind ?? null) !== (next.ending?.kind ?? null),
  };
}

// ---------- Lo publicado, visto desde las pantallas ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** El en vivo del marcador publicado (null si no hay). */
export function liveFromScore(score: MatchScore | null | undefined): BasketballLive | null {
  const l = score?.live;
  if (!isObj(l) || typeof l.p !== 'number') return null;
  const tf = Array.isArray(l.tf) && l.tf.length === 2 ? ([Number(l.tf[0]) || 0, Number(l.tf[1]) || 0] as [number, number]) : ([0, 0] as [number, number]);
  const bonus = Array.isArray(l.bonus) && l.bonus.length === 2 ? ([!!l.bonus[0], !!l.bonus[1]] as [boolean, boolean]) : ([false, false] as [boolean, boolean]);
  const c = l.clk;
  const clk = isObj(c) && typeof c.ms === 'number' && typeof c.t === 'number' ? { r: c.r === true, ms: c.ms, t: c.t } : null;
  return { p: l.p, pl: typeof l.pl === 'string' ? l.pl : `Periodo ${l.p}`, tf, bonus, clk };
}

/** Lo que marca ahora el reloj de referencia publicado. `serverNow` = Date.now() + offset. */
export function liveClockMs(live: Pick<BasketballLive, 'clk'>, serverNow: number): number | null {
  if (!live.clk) return null;
  return live.clk.r ? Math.max(0, live.clk.ms - Math.max(0, serverNow - live.clk.t)) : live.clk.ms;
}

/** Puntos de cada periodo publicados ([[20,18], …]). */
export function periodsFromScore(score: MatchScore | null | undefined): [number, number][] {
  const p = score?.periods;
  if (!Array.isArray(p)) return [];
  return p.filter((x): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number'));
}

/** Resultado del partido para la tabla FIBA (null si no cuenta: sin marcador, W.O. doble o lado sin equipo). */
export function matchResultOf(m: Pick<Match, 'id' | 'status' | 'score' | 'winner' | 'walkoverSide'> & { sides: readonly Pick<MatchSide, 'teamId' | 'players'>[] }): TeamMatchResult | null {
  const [s1, s2] = m.sides;
  if (!s1 || !s2) return null;
  const base = { id: m.id, side1: sideKey(s1), side2: sideKey(s2) };
  if (m.status === 'walkover') {
    if (m.walkoverSide !== 1 && m.walkoverSide !== 2) return null;
    return { ...base, winner: m.walkoverSide === 1 ? 2 : 1, walkover: m.walkoverSide, totals: { points: [0, 0] } };
  }
  const sides = m.score?.sides;
  if (!Array.isArray(sides) || sides.length !== 2) return null;
  const r: TeamMatchResult = { ...base, winner: m.winner, totals: { points: [Number(sides[0]) || 0, Number(sides[1]) || 0] } };
  const ending = m.score?.ending;
  if (isObj(ending) && (ending.side === 1 || ending.side === 2)) {
    if (ending.kind === 'forfeit') r.walkover = ending.side;
    if (ending.kind === 'default') r.defaulted = ending.side;
  }
  return r;
}

/** Línea de un jugador en un partido de la temporada (con el partido, para el perfil). */
export interface SeasonLine extends BasketballLine {
  matchId: string;
  side: Side;
}

/** Las líneas de los partidos que cuentan (confirmados o de hace 48 h), para anotadores y perfiles. */
export function seasonLines(matches: readonly Match[], now: number = Date.now()): SeasonLine[] {
  const out: SeasonLine[] = [];
  for (const m of matches) {
    if (m.status === 'walkover' || !isFinal(m, now)) continue;
    for (const l of decodeLines(m.score?.lines)) {
      out.push({
        matchId: m.id,
        side: l.side,
        player: l.playerId,
        team: sideKey(m.sides[l.side - 1]),
        points: l.points,
        ones: l.ones,
        twos: l.twos,
        threes: l.threes,
        fouls: l.fouls,
      });
    }
  }
  return out;
}

/** Marcador del W.O. (forfeit, Art. 20): 20-0 para el que vino (0 = no vino ninguno: 0-0). */
export function forfeitScore(points: number, absent: 0 | 1 | 2): MatchScore {
  const sides: [number, number] = absent === 1 ? [0, points] : absent === 2 ? [points, 0] : [0, 0];
  return { text: `${sides[0]}-${sides[1]}`, sides, totals: { points: sides } };
}

// ---------- Textos de las jugadas ----------

export const FOUL_LABEL: Record<FoulKind, string> = {
  personal: 'Personal',
  offensive: 'Ofensiva',
  technical: 'Técnica',
  unsportsmanlike: 'Antideportiva',
  disqualifying: 'Descalificante',
  coach_technical: 'Técnica al entrenador',
  bench_technical: 'Técnica al banco',
};

/** «+2 #7», «Falta personal #10», «Tiempo muerto Tigres» (para «Deshacer: …»). */
export function eventLabel(ev: BasketballEvent, who: (side: Side, playerId?: string) => string): string {
  switch (ev.type) {
    case 'score':
      return `+${ev.points} ${who(ev.side, ev.player)}`;
    case 'foul':
      return `Falta ${FOUL_LABEL[ev.kind].toLowerCase()} ${who(ev.side, ev.player)}`;
    case 'timeout':
      return `Tiempo muerto ${who(ev.side)}`;
    case 'period_end':
      return 'Fin del periodo';
    case 'clock':
      return ev.action === 'start' ? 'Arrancar reloj' : ev.action === 'stop' ? 'Parar reloj' : 'Corregir reloj';
    case 'present':
      return `Presentes ${who(ev.side)}`;
    case 'jump_ball':
      return 'Salto inicial';
    case 'alternating':
      return 'Posesión alterna';
    case 'forfeit':
      return 'Forfeit';
    case 'default':
      return 'Default';
  }
}

/** «Sale por 5 faltas», «Sale por 2 técnicas»… */
export const EJECTION_LABEL: Record<string, string> = {
  fouls: 'sale por faltas',
  technicals: 'sale por 2 técnicas',
  unsportsmanlike: 'sale por 2 antideportivas',
  technical_unsportsmanlike: 'sale por técnica y antideportiva',
  disqualifying: 'descalificado',
  coach: 'el entrenador queda expulsado',
};
