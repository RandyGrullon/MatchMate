import type { CourtAdapter } from '../../../court/types';
import { isFinal, sideKey, type Match, type MatchScore, type MatchSide } from '../../../lib/data/matches';
import type { ParsedResult, ResultParser } from '../../../components/match/parsers';
import {
  activePowerPlays,
  football,
  footballMatchResult,
  footballPeriodLabel,
  periodElapsed,
  shootoutScore,
  type FootballConfig,
  type FootballEvent,
  type FootballState,
} from '../../../sports/team/football';
import type { CardLine } from '../../../sports/team/discipline';
import type { TeamMatchResult } from '../../../sports/team/standings';
import type { Side } from '../../../sports/types';

/**
 * El acta de fútbol y sala enchufada al modo cancha (src/court): el motor puro de src/sports/team/football.ts, el
 * marcador resumido que ven las tarjetas, las tablas y los espectadores (matches.score) y cuándo publicar.
 *
 * `matches.score` de un partido de fútbol (menos de 4 KB):
 *   { text: "2-1" | "1-1 (pen. 4-3)" | "3-0 (W.O.)", sides: [2, 1], pens?: [4, 3],
 *     totals: {goals, yellow, red, cardsYellow, cardsSecondYellow, cardsRed, cardsYellowRed, shootout?},
 *     periods: [[1, 0], [1, 1]], live: FootballLive, lines: "…", tl: "…" }
 * - `lines`: un renglón por jugador que jugó o vio tarjeta: `id:lado:jugó:goles:asist:autogoles:amarillas:roja:portero:recibidos`
 *   (roja: 0, d = directa, s = doble amarilla; se quitan los ceros del final). De ahí salen goleadores, tarjetas,
 *   vallas invictas, partidos jugados y la disciplina, sin bajar el estado completo.
 * - `tl`: goles y tarjetas con su minuto: `<g|o|y|s|r><lado>.<minuto>.<jugador>.<asistencia>` separados por `;`,
 *   donde jugador y asistencia son el número de renglón en `lines` (vacío = sin jugador). Autogol: el lado es el
 *   que suma el gol y el jugador es del otro equipo.
 * - `live.clk.t` es la hora del SERVIDOR (ms) en que el reloj marcaba `clk.ms` (tiempo jugado del periodo).
 * Los penales (`pens`) van aparte: no cuentan en los goles ni en la tabla.
 */

/** Lo que ven los espectadores del partido en vivo (chico). */
export interface FootballLive {
  /** Periodo: 1-2 tiempos, 3-4 prórroga. */
  p: number;
  /** «1.er tiempo», «Descanso», «Penales». */
  pl: string;
  /** Minutos antes del periodo (0, 45, 90, 105) y lo que dura (para el minuto «45+2»). */
  b: number;
  len: number;
  /** Reloj: corriendo, tiempo jugado del periodo (ms) y la hora del servidor de esa lectura. null = sin reloj. */
  clk: { r: boolean; ms: number; t: number } | null;
  /** Añadido anunciado del periodo (minutos). */
  add: number | null;
  /** Sala: faltas acumuladas de la mitad. null en campo. */
  f: [number, number] | null;
  /** Sala: expulsados cumpliendo los 2 minutos: [lado, ms que faltaban en `clk.t`]. */
  pp: [Side, number][];
  /** Rojas de cada lado. */
  r: [number, number];
  /** Tanda de penales en curso. */
  so: boolean;
}

/** Una línea de un jugador en el partido (lo que va en `score.lines`). */
export interface ScoreLine {
  playerId: string;
  side: Side;
  /** Jugó (alineación, cambio, gol…); una tarjeta desde el banco no cuenta como jugar. */
  played: boolean;
  goals: number;
  assists: number;
  ownGoals: number;
  yellows: number;
  red: 'direct' | 'second_yellow' | null;
  keeper: boolean;
  conceded: number;
}

export type TimelineKind = 'goal' | 'own_goal' | 'yellow' | 'second_yellow' | 'red';

/** Un gol o una tarjeta del acta resumida (`score.tl`). */
export interface ScoreEvent {
  kind: TimelineKind;
  /** Gol y autogol: el equipo que suma. Tarjeta: el del jugador. */
  side: Side;
  minute: string | null;
  player: string | null;
  assist: string | null;
}

const MAX_LINES_CHARS = 2400;
const MAX_TL_CHARS = 700;

const RED_CODE = { direct: 'd', second_yellow: 's' } as const;

function lineText(l: ScoreLine): string {
  const f: (string | number)[] = [
    l.side,
    l.played ? 1 : 0,
    l.goals,
    l.assists,
    l.ownGoals,
    l.yellows,
    l.red ? RED_CODE[l.red] : 0,
    l.keeper ? 1 : 0,
    l.conceded,
  ];
  // Los ceros del final no se escriben (el lado siempre va).
  while (f.length > 1 && (f[f.length - 1] === 0 || f[f.length - 1] === '0')) f.pop();
  return [l.playerId, ...f].join(':');
}

/** Todos los que jugaron o vieron tarjeta, lado por lado (orden: presentes, después los del banco con tarjeta). */
export function stateLines(state: FootballState): ScoreLine[] {
  const out: ScoreLine[] = [];
  ([1, 2] as const).forEach((side) => {
    const i = side - 1;
    const players = state.players[i];
    const ids = [...state.present[i], ...Object.keys(players).filter((id) => !state.present[i].includes(id))];
    for (const id of new Set(ids)) {
      const p = players[id];
      const played = state.present[i].includes(id) || !!p?.played;
      const line: ScoreLine = {
        playerId: id,
        side,
        played,
        goals: p?.goals ?? 0,
        assists: p?.assists ?? 0,
        ownGoals: p?.ownGoals ?? 0,
        yellows: p?.yellows ?? 0,
        red: p?.red ?? null,
        keeper: !!p?.keeper,
        conceded: p?.conceded ?? 0,
      };
      if (!played && !line.yellows && !line.red) continue;
      out.push(line);
    }
  });
  return out;
}

const hasStats = (l: ScoreLine) => l.goals || l.assists || l.ownGoals || l.yellows || l.red || l.keeper;

/** Las líneas en texto compacto. Si no caben, primero los que tienen algo (goles, tarjetas, portero). */
export function encodeLines(lines: readonly ScoreLine[]): { text: string; kept: ScoreLine[] } {
  let kept = [...lines];
  let text = kept.map(lineText).join(';');
  if (text.length > MAX_LINES_CHARS) {
    kept = kept.filter(hasStats);
    text = kept.map(lineText).join(';');
  }
  if (text.length > MAX_LINES_CHARS) return { text: '', kept: [] };
  return { text, kept };
}

export function decodeLines(raw: unknown): ScoreLine[] {
  if (typeof raw !== 'string' || !raw) return [];
  const out: ScoreLine[] = [];
  for (const part of raw.split(';')) {
    const [playerId, side, ...rest] = part.split(':');
    if (!playerId || (side !== '1' && side !== '2')) continue;
    const n = (i: number) => {
      const v = Number(rest[i] ?? 0);
      return Number.isInteger(v) && v >= 0 ? v : 0;
    };
    const red = rest[5] === 'd' ? 'direct' : rest[5] === 's' ? 'second_yellow' : null;
    out.push({
      playerId,
      side: side === '2' ? 2 : 1,
      played: rest[0] === '1',
      goals: n(1),
      assists: n(2),
      ownGoals: n(3),
      yellows: n(4),
      red,
      keeper: rest[6] === '1',
      conceded: n(7),
    });
  }
  return out;
}

const TL_CODE: Record<TimelineKind, string> = { goal: 'g', own_goal: 'o', yellow: 'y', second_yellow: 's', red: 'r' };
const TL_KIND: Record<string, TimelineKind> = { g: 'goal', o: 'own_goal', y: 'yellow', s: 'second_yellow', r: 'red' };

/** Goles y tarjetas del motor, con el jugador como renglón de `lines`. */
export function encodeTimeline(state: FootballState, lines: readonly ScoreLine[]): string {
  const idx = (side: Side, id: string | undefined) => {
    if (!id) return '';
    const i = lines.findIndex((l) => l.side === side && l.playerId === id);
    return i < 0 ? '' : String(i);
  };
  const parts: string[] = [];
  for (const it of state.timeline) {
    if (!it.side || !(it.kind in TL_CODE)) continue;
    const kind = it.kind as TimelineKind;
    const playerSide: Side = kind === 'own_goal' ? (it.side === 1 ? 2 : 1) : it.side;
    const minute = (it.minute ?? '').replace(/[^0-9+]/g, '');
    parts.push(`${TL_CODE[kind]}${it.side}.${minute}.${idx(playerSide, it.player)}.${kind === 'goal' ? idx(it.side, it.assist) : ''}`);
  }
  let text = parts.join(';');
  // Si no cabe, se quedan los goles y las rojas (lo más importante).
  if (text.length > MAX_TL_CHARS) text = parts.filter((p) => p[0] === 'g' || p[0] === 'o' || p[0] === 'r' || p[0] === 's').join(';');
  return text.length > MAX_TL_CHARS ? '' : text;
}

export function decodeTimeline(raw: unknown, lines: readonly ScoreLine[]): ScoreEvent[] {
  if (typeof raw !== 'string' || !raw) return [];
  const out: ScoreEvent[] = [];
  for (const part of raw.split(';')) {
    const m = /^([gosyr])([12])\.([0-9+]*)\.(\d*)\.(\d*)$/.exec(part);
    if (!m) continue;
    const who = (s: string) => (s === '' ? null : (lines[Number(s)]?.playerId ?? null));
    out.push({ kind: TL_KIND[m[1]], side: m[2] === '2' ? 2 : 1, minute: m[3] || null, player: who(m[4]), assist: who(m[5]) });
  }
  return out;
}

/** Minuto del reloj publicado: «23'», «45+2'» (null sin reloj o sin arrancar). */
export function minuteText(b: number, len: number, elapsedMs: number): string {
  const m = Math.floor(Math.max(0, elapsedMs) / 60_000) + 1;
  return m > len ? `${b + len}+${m - len}'` : `${b + m}'`;
}

function periodBase(cfg: FootballConfig, period: number): number {
  return period <= 2 ? (period - 1) * cfg.halfMinutes : 2 * cfg.halfMinutes + (period - 3) * cfg.extraTimeMinutes;
}

/** Descanso: ya terminó un tiempo y el siguiente no arrancó (sin reloj no hay cómo saberlo: nunca). */
export function atBreak(state: FootballState): boolean {
  return state.config.clock !== 'none' && state.status === 'playing' && state.period > 1 && !state.clock.running && state.clock.elapsedMs === 0;
}

/** «Descanso», «Antes de la prórroga», «Por empezar» o el periodo. */
export function stageLabel(state: FootballState): string {
  if (state.status === 'playing' && state.period === 1 && !state.clock.running && state.clock.elapsedMs === 0) {
    return state.timeline.length || state.config.clock === 'none' ? '1.er tiempo' : 'Por empezar';
  }
  if (atBreak(state)) return state.period === 2 ? 'Descanso' : state.period === 3 ? 'Antes de la prórroga' : 'Descanso de la prórroga';
  return footballPeriodLabel(state);
}

export function liveOf(state: FootballState, now: number, offset = 0): FootballLive {
  const cfg = state.config;
  const reds = (i: 0 | 1) => Object.values(state.players[i]).filter((p) => p.red).length;
  return {
    p: state.period,
    pl: stageLabel(state),
    b: periodBase(cfg, state.period),
    len: state.period <= 2 ? cfg.halfMinutes : cfg.extraTimeMinutes,
    clk: cfg.clock === 'none' ? null : { r: state.clock.running, ms: Math.round(periodElapsed(state, now)), t: Math.round(now + offset) },
    add: state.addedTime[state.period - 1] ?? null,
    f: cfg.accumulatedFouls ? [state.fouls[0], state.fouls[1]] : null,
    pp: activePowerPlays(state, now).map((x) => [x.side, Math.round(x.remainingMs)] as [Side, number]),
    r: [reds(0), reds(1)],
    so: state.status === 'shootout',
  };
}

/** Marcador resumido para matches.score. `now` = hora del teléfono; `offset` = servidor − teléfono (ms). */
export function footballScore(state: FootballState, now: number, offset = 0): MatchScore {
  const [a, b] = state.score;
  const pens = shootoutScore(state);
  const r = football.result(state);
  const totals = footballMatchResult(state, { id: '', side1: '1', side2: '2' }).totals;
  const out: MatchScore = {
    text: r.summary,
    sides: [a, b],
    totals,
    periods: state.periodScores.map(([x, y]) => [x, y]),
    live: liveOf(state, now, offset) as unknown as Record<string, unknown>,
  };
  if (pens && pens[0] + pens[1] > 0) out.pens = [pens[0], pens[1]];
  if (state.walkover) out.walkover = state.walkover;
  const { text, kept } = encodeLines(stateLines(state));
  if (text) {
    out.lines = text;
    const tl = encodeTimeline(state, kept);
    if (tl) out.tl = tl;
  }
  return out;
}

/** El ganador para terminar: el del motor; si el anotador termina antes, el que va arriba (o la tanda). */
export function footballWinner(state: FootballState): Side | null {
  if (state.status === 'final') return state.winner;
  if (state.score[0] !== state.score[1]) return state.score[0] > state.score[1] ? 1 : 2;
  const pens = shootoutScore(state);
  if (pens && pens[0] !== pens[1]) return pens[0] > pens[1] ? 1 : 2;
  return null;
}

const redCount = (s: FootballState) => Object.values(s.players[0]).filter((p) => p.red).length + Object.values(s.players[1]).filter((p) => p.red).length;

/**
 * Hito que se publica enseguida: gol, roja, cambio de periodo o de estado (descanso, penales, final), cada penal,
 * y cuando el reloj arranca o se para (los espectadores lo avanzan solos). Nunca por falta, cambio o amarilla sola.
 */
export function isMilestone(prev: FootballState, next: FootballState): boolean {
  return (
    prev.score[0] !== next.score[0] ||
    prev.score[1] !== next.score[1] ||
    redCount(prev) !== redCount(next) ||
    prev.period !== next.period ||
    prev.status !== next.status ||
    prev.clock.running !== next.clock.running ||
    (prev.shootout?.kicks.length ?? 0) !== (next.shootout?.kicks.length ?? 0) ||
    prev.walkover !== next.walkover
  );
}

/** Adaptador del modo cancha. `clock.offset` = diferencia con el servidor (useServerOffset). */
export function footballAdapter(clock: { now?: () => number; offset?: () => number } = {}): CourtAdapter<FootballConfig, FootballState, FootballEvent> {
  const now = clock.now ?? Date.now;
  return {
    engine: football,
    score: (s) => footballScore(s, now(), clock.offset?.() ?? 0),
    winner: footballWinner,
    milestone: (prev, next) => isMilestone(prev, next),
  };
}

/**
 * El adaptador con un modo «callado»: dentro de `quietly` ninguna jugada ni deshacer es hito (no se publica
 * enseguida). Lo usa `replaceLastEvent` para que el deshacer de en medio no salga a los espectadores.
 */
export function quietAdapter<C, S, E>(base: CourtAdapter<C, S, E>): { adapter: CourtAdapter<C, S, E>; quietly: <T>(fn: () => T) => T } {
  let quiet = 0;
  return {
    adapter: { ...base, milestone: (prev, next, ev) => quiet === 0 && !!base.milestone?.(prev, next, ev) },
    quietly<T>(fn: () => T): T {
      quiet++;
      try {
        return fn();
      } finally {
        quiet--;
      }
    },
  };
}

/** Lo que hace falta del modo cancha (useCourt o createCourtMachine) para cambiar la última jugada. */
export interface LastEventEditor<E> {
  undo(): boolean;
  apply(ev: E): string | null;
  flush(): void;
}

/**
 * Cambia la última jugada de la lista (`prev`) por `next` (el gol con quién marcó, la asistencia o el autogol)
 * sin que los espectadores vean el paso de en medio, con el gol quitado (1-0 → 0-0 → 1-0):
 * - el deshacer va callado (no es hito: no se publica enseguida);
 * - lo nuevo se publica ya (`flush`): una sola publicación por cambio.
 * Si igual salió el paso de en medio (hacía más de un minuto que no se publicaba nada), la de `flush` sale en el
 * mismo instante y la cola la reemplaza antes de mandarla (misma clave de colapso, todavía sin enviar): al servidor
 * nunca llega el estado sin el gol. Si el motor rechaza `next`, vuelve `prev`. Devuelve null o el error del motor.
 */
export function replaceLastEvent<E>(court: LastEventEditor<E>, quietly: <T>(fn: () => T) => T, prev: E, next: E): string | null {
  if (!quietly(() => court.undo())) return 'No se pudo cambiar la jugada.';
  const err = court.apply(next);
  if (err) court.apply(prev);
  court.flush();
  return err;
}

// ---------- Lo publicado, visto desde las pantallas ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const pairOf = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0] as number, v[1] as number] : null;

/** El en vivo del marcador publicado (null si no hay). */
export function liveFromScore(score: MatchScore | null | undefined): FootballLive | null {
  const l = score?.live;
  if (!isObj(l) || typeof l.p !== 'number') return null;
  const c = l.clk;
  const clk = isObj(c) && typeof c.ms === 'number' && typeof c.t === 'number' ? { r: c.r === true, ms: c.ms, t: c.t } : null;
  const pp = Array.isArray(l.pp)
    ? l.pp.filter((x): x is [Side, number] => Array.isArray(x) && (x[0] === 1 || x[0] === 2) && typeof x[1] === 'number')
    : [];
  return {
    p: l.p,
    pl: typeof l.pl === 'string' ? l.pl : `Tiempo ${l.p}`,
    b: typeof l.b === 'number' ? l.b : 0,
    len: typeof l.len === 'number' && l.len > 0 ? l.len : 45,
    clk,
    add: typeof l.add === 'number' ? l.add : null,
    f: pairOf(l.f),
    pp,
    r: pairOf(l.r) ?? [0, 0],
    so: l.so === true,
  };
}

/** Tiempo jugado del periodo según lo publicado. `serverNow` = Date.now() + offset. */
export function liveElapsedMs(live: Pick<FootballLive, 'clk'>, serverNow: number): number | null {
  if (!live.clk) return null;
  return live.clk.r ? live.clk.ms + Math.max(0, serverNow - live.clk.t) : live.clk.ms;
}

/** Minuto que se ve en vivo («23'», «45+2'»); null sin reloj, en el descanso o en los penales. */
export function liveMinute(live: FootballLive, serverNow: number): string | null {
  const ms = liveElapsedMs(live, serverNow);
  if (ms === null || live.so || (!live.clk?.r && ms === 0)) return null;
  return minuteText(live.b, live.len, ms);
}

/** Sala: lo que le falta a cada expulsado (el reloj de juego corre solo si el reloj corre). */
export function livePowerPlays(live: FootballLive, serverNow: number): { side: Side; remainingMs: number }[] {
  const passed = live.clk?.r ? Math.max(0, serverNow - live.clk.t) : 0;
  return live.pp.map(([side, ms]) => ({ side, remainingMs: ms - passed })).filter((x) => x.remainingMs > 0);
}

/** Goles de cada tiempo publicados ([[1,0],[1,1]]). */
export function periodsFromScore(score: MatchScore | null | undefined): [number, number][] {
  const p = score?.periods;
  if (!Array.isArray(p)) return [];
  return p.map(pairOf).filter((x): x is [number, number] => x !== null);
}

/** Penales publicados ([4, 3]) o null. */
export const pensFromScore = (score: MatchScore | null | undefined): [number, number] | null => pairOf(score?.pens);

/** Resultado del partido para la tabla (null si no cuenta: sin marcador, W.O. doble o lado sin equipo). */
export function matchResultOf(m: Pick<Match, 'id' | 'status' | 'score' | 'winner' | 'walkoverSide'> & { sides: readonly Pick<MatchSide, 'teamId' | 'players'>[] }): TeamMatchResult | null {
  const [s1, s2] = m.sides;
  if (!s1 || !s2) return null;
  const base = { id: m.id, side1: sideKey(s1), side2: sideKey(s2) };
  if (m.status === 'walkover') {
    if (m.walkoverSide !== 1 && m.walkoverSide !== 2) return null;
    return { ...base, winner: m.walkoverSide === 1 ? 2 : 1, walkover: m.walkoverSide, totals: { goals: [0, 0] } };
  }
  const sides = pairOf(m.score?.sides);
  if (!sides) return null;
  const totals: Record<string, [number, number]> = {};
  const t = m.score?.totals;
  if (isObj(t)) {
    for (const k of ['yellow', 'red', 'cardsYellow', 'cardsSecondYellow', 'cardsRed', 'cardsYellowRed']) {
      const v = pairOf(t[k]);
      if (v) totals[k] = v;
    }
  }
  totals.goals = sides;
  const pens = pensFromScore(m.score);
  if (pens) totals.shootout = pens;
  return { ...base, winner: m.winner, totals };
}

/** Una línea de la temporada: el jugador en un partido que cuenta, con el partido y su lado. */
export interface SeasonLine extends ScoreLine {
  matchId: string;
  team: string;
  cleanSheet: boolean;
}

/** Líneas de un partido (con valla invicta calculada). `final` = el partido cuenta. */
export function matchLines(m: Pick<Match, 'id' | 'status' | 'score' | 'sides'>): SeasonLine[] {
  if (m.status === 'walkover') return [];
  const sides = pairOf(m.score?.sides) ?? [0, 0];
  return decodeLines(m.score?.lines).map((l) => ({
    ...l,
    matchId: m.id,
    team: sideKey(m.sides[l.side - 1]),
    cleanSheet: l.keeper && l.played && sides[l.side === 1 ? 1 : 0] === 0,
  }));
}

/** Las líneas de los partidos que cuentan (confirmados o de hace 48 h), para goleadores, tarjetas y perfiles. */
export function seasonLines(matches: readonly Match[], now: number = Date.now()): SeasonLine[] {
  return matches.filter((m) => m.status !== 'walkover' && isFinal(m, now)).flatMap(matchLines);
}

/** Tarjetas de un partido para la disciplina (también las del banco). */
export function cardLinesOf(m: Pick<Match, 'id' | 'status' | 'score' | 'sides'>): CardLine[] {
  return matchLines(m)
    .filter((l) => l.yellows > 0 || l.red)
    .map((l) => ({ player: l.playerId, team: l.team, yellows: l.yellows, red: l.red }));
}

/** Marcador del W.O.: 3-0 para el que vino (0 = no vino ninguno: 0-0). */
export function walkoverScore(goals: number, absent: 0 | 1 | 2): MatchScore {
  const sides: [number, number] = absent === 1 ? [0, goals] : absent === 2 ? [goals, 0] : [0, 0];
  return { text: `${sides[0]}-${sides[1]} (W.O.)`, sides, totals: { goals: sides } };
}

// ---------- «Solo resultado» ----------

const RESULT = /^\s*(\d{1,3})\s*(?:[-–—:/x]|\s)\s*(\d{1,3})\s*(?:\(?\s*(?:pen(?:ales|\.)?|p\.?)\s*(\d{1,3})\s*(?:[-–—:/x]|\s)\s*(\d{1,3})\s*\.?\s*\)?)?\s*$/i;

/**
 * Lector de «solo resultado»: «2-1», «1-1 (pen. 4-3)», «1-1 pen 4-3». `keep` = el marcador que ya tenía el partido:
 * se conservan el acta por jugador (`lines`: tarjetas y presentes, de ahí sale la disciplina) y las tarjetas de la
 * tabla de juego limpio; los minutos de los goles (`tl`) solo si los goles no cambian.
 */
export function footballResultParser(opts: { keep?: MatchScore | null } = {}): ResultParser {
  return (text): ParsedResult => {
    const m = RESULT.exec(text ?? '');
    if (!m) throw new Error('Escribe los goles, el de tu izquierda primero: 2-1 (y si hubo penales: 1-1 pen 4-3).');
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 99 || b > 99) throw new Error('Cada equipo marca de 0 a 99 goles.');
    const pens: [number, number] | null = m[3] !== undefined ? [Number(m[3]), Number(m[4])] : null;
    if (pens) {
      if (a !== b) throw new Error('Los penales son solo si empataron.');
      if (pens[0] > 99 || pens[1] > 99) throw new Error('Los penales van de 0 a 99.');
      if (pens[0] === pens[1]) throw new Error('La tanda de penales no termina empatada.');
    }
    const sides: [number, number] = [a, b];
    const winner: Side | null = a !== b ? (a > b ? 1 : 2) : pens ? (pens[0] > pens[1] ? 1 : 2) : null;
    const keep = opts.keep ?? null;
    const oldTotals = isObj(keep?.totals) ? keep.totals : {};
    const totals: Record<string, unknown> = { ...oldTotals, goals: sides };
    delete totals.shootout;
    if (pens) totals.shootout = pens;
    const score: MatchScore = { text: pens ? `${a}-${b} (pen. ${pens[0]}-${pens[1]})` : `${a}-${b}`, sides, totals };
    if (pens) score.pens = pens;
    if (typeof keep?.lines === 'string' && keep.lines) score.lines = keep.lines;
    const sameGoals = pairOf(keep?.sides)?.join() === sides.join();
    if (sameGoals && typeof keep?.tl === 'string' && keep.tl) score.tl = keep.tl;
    if (sameGoals && Array.isArray(keep?.periods)) score.periods = keep.periods;
    return {
      score,
      winner,
      summary: winner ? `Gana el lado ${winner}, ${a} a ${b}${pens ? ` (penales ${pens[0]} a ${pens[1]})` : ''}` : `Empate ${a} a ${b}`,
    };
  };
}

// ---------- Textos de las jugadas ----------

/** «Gol #9 Tigres», «Amarilla #4», «Cambio: sale #7, entra #12»… (para «Deshacer: …»). */
export function eventLabel(ev: FootballEvent, who: (side: Side, playerId?: string) => string): string {
  switch (ev.type) {
    case 'goal':
      if (ev.ownGoal) return `Autogol${ev.player ? ` de ${who(ev.side === 1 ? 2 : 1, ev.player)}` : ''} (a favor de ${who(ev.side)})`;
      return `Gol ${ev.player ? who(ev.side, ev.player) : who(ev.side)}`;
    case 'card':
      return `${ev.card === 'yellow' ? 'Amarilla' : 'Roja'} ${who(ev.side, ev.player)}`;
    case 'sub':
      return `Cambio: sale ${who(ev.side, ev.out)}, entra ${who(ev.side, ev.in)}`;
    case 'goalkeeper':
      return `Portero ${who(ev.side, ev.player)}`;
    case 'lineup':
      return `Alineación ${who(ev.side)}`;
    case 'present':
      return `Presentes ${who(ev.side)}`;
    case 'foul':
      return `Falta ${ev.player ? who(ev.side, ev.player) : who(ev.side)}`;
    case 'timeout':
      return `Tiempo muerto ${who(ev.side)}`;
    case 'added_time':
      return `Añadido +${ev.minutes}`;
    case 'period_end':
      return 'Fin del tiempo';
    case 'clock':
      return ev.action === 'start' ? 'Arrancar reloj' : ev.action === 'stop' ? 'Parar reloj' : 'Corregir reloj';
    case 'power_play_end':
      return `Completa ${who(ev.side)}`;
    case 'shootout':
      return `Penal ${ev.player ? who(ev.side, ev.player) : who(ev.side)}: ${ev.scored ? 'gol' : 'fallado'}`;
    case 'walkover':
      return `W.O. ${who(ev.side)}`;
  }
}

// ---------- Acta corregida por el admin ----------

/** Totales de tarjetas de un lado (lo que usa el juego limpio de la tabla), desde las líneas. */
export function cardTotals(lines: readonly ScoreLine[]): Record<string, [number, number]> {
  const pair = (f: (l: ScoreLine) => number): [number, number] => [1, 2].map((side) => lines.filter((l) => l.side === side).reduce((n, l) => n + f(l), 0)) as [number, number];
  return {
    yellow: pair((l) => l.yellows),
    red: pair((l) => (l.red ? 1 : 0)),
    cardsYellow: pair((l) => (l.yellows === 1 && !l.red ? 1 : 0)),
    cardsSecondYellow: pair((l) => (l.red === 'second_yellow' ? 1 : 0)),
    cardsRed: pair((l) => (l.red === 'direct' && l.yellows === 0 ? 1 : 0)),
    cardsYellowRed: pair((l) => (l.red === 'direct' && l.yellows > 0 ? 1 : 0)),
  };
}

/**
 * El marcador de un acta corregida a mano: goles, penales (solo si empataron) y las líneas por jugador. Dos
 * amarillas son roja por doble amarilla. Los minutos del acta anterior se quedan para los goles y tarjetas que
 * siguen siendo ciertos; el resto se quita. Devuelve también el ganador (goles; si empataron, penales).
 */
export function correctedScore(input: { old: MatchScore | null | undefined; lines: readonly ScoreLine[]; sides: [number, number]; pens: [number, number] | null }): { score: MatchScore; winner: Side | null } {
  const [a, b] = input.sides;
  const pens = a === b && input.pens && input.pens[0] !== input.pens[1] ? input.pens : null;
  const lines: ScoreLine[] = input.lines.map((l) => ({
    ...l,
    yellows: Math.max(0, Math.min(2, l.yellows)),
    red: l.yellows >= 2 && l.red !== 'direct' ? 'second_yellow' : l.red === 'second_yellow' && l.yellows < 2 ? null : l.red,
  }));
  // Goles recibidos del portero: si hay uno solo por lado, los del rival.
  for (const side of [1, 2] as const) {
    const keepers = lines.filter((l) => l.side === side && l.keeper);
    if (keepers.length === 1) keepers[0].conceded = side === 1 ? b : a;
  }
  const { text: linesText, kept } = encodeLines(lines);
  const oldLines = decodeLines(input.old?.lines);
  const events = decodeTimeline(input.old?.tl, oldLines);
  const used = new Map<string, number>();
  const bump = (k: string) => {
    const n = (used.get(k) ?? 0) + 1;
    used.set(k, n);
    return n;
  };
  const find = (side: Side, id: string | null) => (id ? kept.find((l) => l.side === side && l.playerId === id) : undefined);
  const goalsBySide = [0, 0];
  const keptEvents = events.filter((e) => {
    const playerSide: Side = e.kind === 'own_goal' ? (e.side === 1 ? 2 : 1) : e.side;
    const l = find(playerSide, e.player);
    if (e.kind === 'goal' || e.kind === 'own_goal') {
      if (goalsBySide[e.side - 1] >= input.sides[e.side - 1]) return false;
      if (e.player) {
        if (!l) return false;
        const have = e.kind === 'goal' ? l.goals : l.ownGoals;
        if (bump(`${e.kind}:${playerSide}:${e.player}`) > have) return false;
      }
      goalsBySide[e.side - 1]++;
      return true;
    }
    if (!l) return false;
    if (e.kind === 'yellow') return bump(`y:${playerSide}:${e.player}`) <= (l.red === 'second_yellow' ? 1 : l.yellows);
    if (e.kind === 'second_yellow') return l.red === 'second_yellow';
    return l.red === 'direct';
  });
  const idx = (side: Side, id: string | null) => {
    if (!id) return '';
    const i = kept.findIndex((l) => l.side === side && l.playerId === id);
    return i < 0 ? '' : String(i);
  };
  const tl = keptEvents
    .map((e) => {
      const playerSide: Side = e.kind === 'own_goal' ? (e.side === 1 ? 2 : 1) : e.side;
      return `${TL_CODE[e.kind]}${e.side}.${e.minute ?? ''}.${idx(playerSide, e.player)}.${e.kind === 'goal' ? idx(e.side, e.assist) : ''}`;
    })
    .join(';');
  const totals: Record<string, [number, number]> = { goals: [a, b], ...cardTotals(kept.length ? kept : lines) };
  if (pens) totals.shootout = pens;
  const score: MatchScore = { text: pens ? `${a}-${b} (pen. ${pens[0]}-${pens[1]})` : `${a}-${b}`, sides: [a, b], totals };
  if (pens) score.pens = pens;
  if (linesText) score.lines = linesText;
  if (tl) score.tl = tl;
  const periods = periodsFromScore(input.old);
  const periodsOk = periods.length > 0 && periods.reduce((n, p) => n + p[0], 0) === a && periods.reduce((n, p) => n + p[1], 0) === b;
  if (periodsOk) score.periods = periods;
  const winner: Side | null = a !== b ? (a > b ? 1 : 2) : pens ? (pens[0] > pens[1] ? 1 : 2) : null;
  return { score, winner };
}
