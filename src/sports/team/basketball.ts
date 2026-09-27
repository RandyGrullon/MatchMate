/**
 * Mesa anotadora de baloncesto (FIBA 5x5 y 3x3). El partido es la lista de jugadas y el estado se recalcula
 * desde ella (deshacer = replay sin la última). Todo puro: la hora llega en cada jugada (`at`, ms).
 *
 * Reglas (FIBA 2024):
 * - Faltas de equipo por cuarto; desde la 5.ª hay tiros libres. La prórroga cuenta como el último periodo.
 *   Todas las faltas de jugador cuentan como de equipo (también la ofensiva, que no da tiros libres).
 *   Las técnicas del entrenador o del banco no cuentan como falta de equipo.
 * - El jugador sale con 5 faltas (de cualquier tipo), 2 técnicas, 2 antideportivas, 1 de cada o 1 descalificante;
 *   aviso con 4. El entrenador sale con 2 técnicas suyas o 3 en total contando las del banco.
 * - Tiempos muertos: 2 en la primera mitad, 3 en la segunda (máximo 2 con 2:00 o menos en el último periodo)
 *   y 1 por prórroga. Los que no se usan se pierden.
 * - Flecha de posesión alterna: la pone el salto inicial y se voltea con cada posesión alterna y al empezar
 *   cada periodo.
 * - 3x3: un periodo de 10 min, gana quien llegue a 21 antes; canastas de 1 y 2; desde la 7.ª falta de equipo
 *   2 tiros libres y desde la 10.ª 2 tiros más la posesión; nadie sale por faltas personales (sí con 2
 *   antideportivas); 1 tiempo muerto por equipo; prórroga sin reloj: gana el primero que anote 2 puntos.
 */

import type { MatchEngine, Side } from '../types';
import { elapsedAt, newClock, setElapsed, startClock, stopClock, type ClockState } from './clock';
import type { TeamMatchResult } from './standings';

export type BasketballVariant = '5x5' | '3x3';

export type FoulKind = 'personal' | 'offensive' | 'technical' | 'unsportsmanlike' | 'disqualifying' | 'coach_technical' | 'bench_technical';

export type EjectionReason = 'fouls' | 'technicals' | 'unsportsmanlike' | 'technical_unsportsmanlike' | 'disqualifying';

export interface EjectionRules {
  /** Faltas (de cualquier tipo) para salir: 5 en FIBA; null = no sale por faltas (3x3). */
  fouls: number | null;
  /** Técnicas para salir (2); null = no aplica. */
  technicals: number | null;
  /** Antideportivas para salir (2). */
  unsportsmanlike: number | null;
  /** 1 técnica + 1 antideportiva también saca. */
  mixed: boolean;
}

export interface BasketballConfig {
  variant: BasketballVariant;
  /** Periodos de tiempo regular: 4 cuartos (FIBA) o 2 mitades. En 3x3, 1. */
  periods: number;
  periodMinutes: number;
  /** Minutos de cada prórroga (5). 0 = prórroga sin reloj (3x3). */
  overtimeMinutes: number;
  /** Reloj opcional (de referencia, no oficial). Sin reloj, la regla de los 2 minutos la marca el anotador. */
  clock: boolean;
  /** Falta de equipo desde la que hay tiros libres (5.ª en FIBA, 7.ª en 3x3). */
  bonusFrom: number;
  /** 3x3: desde esta falta, 2 tiros libres más la posesión (10.ª). null en 5x5. */
  doubleBonusFrom: number | null;
  ejection: EjectionRules;
  timeouts: {
    firstHalf: number;
    secondHalf: number;
    /** Máximo con 2:00 o menos en el último periodo regular. */
    lastTwoMinutes: number;
    overtime: number;
    /** 3x3: tiempos muertos para todo el juego (manda sobre los de arriba). */
    perGame: number | null;
  };
  /** 3x3: gana quien llegue a este puntaje antes de que se acabe el tiempo (21). null en 5x5. */
  target: number | null;
  /** 3x3: en la prórroga gana el primero que anote estos puntos (2). null = prórroga normal. */
  overtimeTarget: number | null;
  /** Marcador de un forfeit (Art. 20: 20-0). */
  forfeitScore: number;
}

export type BasketballPreset = 'fiba' | 'halves' | '3x3';

/** Configuraciones listas: «Liga 5x5 FIBA 4×10», «Liga de barrio a 2 mitades» y «Torneo 3x3 a 21». */
export function basketballConfig(preset: BasketballPreset = 'fiba', overrides: Partial<BasketballConfig> = {}): BasketballConfig {
  const fiba: BasketballConfig = {
    variant: '5x5',
    periods: 4,
    periodMinutes: 10,
    overtimeMinutes: 5,
    clock: true,
    bonusFrom: 5,
    doubleBonusFrom: null,
    ejection: { fouls: 5, technicals: 2, unsportsmanlike: 2, mixed: true },
    timeouts: { firstHalf: 2, secondHalf: 3, lastTwoMinutes: 2, overtime: 1, perGame: null },
    target: null,
    overtimeTarget: null,
    forfeitScore: 20,
  };
  const base: BasketballConfig =
    preset === 'halves'
      ? // Mitades de 20 con reloj corrido. Las faltas de equipo son por mitad, así que el bonus sube a la 7.ª (configurable).
        { ...fiba, periods: 2, periodMinutes: 20, bonusFrom: 7 }
      : preset === '3x3'
        ? {
            ...fiba,
            variant: '3x3',
            periods: 1,
            periodMinutes: 10,
            overtimeMinutes: 0,
            bonusFrom: 7,
            doubleBonusFrom: 10,
            ejection: { fouls: null, technicals: null, unsportsmanlike: 2, mixed: false },
            timeouts: { firstHalf: 0, secondHalf: 0, lastTwoMinutes: 0, overtime: 0, perGame: 1 },
            target: 21,
            overtimeTarget: 2,
          }
        : fiba;
  return { ...base, ...overrides };
}

export interface BasketballPlayer {
  id: string;
  points: number;
  /** Canastas de 1 (en 5x5 son los tiros libres anotados). */
  ones: number;
  twos: number;
  threes: number;
  /** Todas las faltas que cuentan para las 5 (personal, ofensiva, técnica, antideportiva, descalificante). */
  fouls: number;
  technicals: number;
  unsportsmanlike: number;
  disqualifying: number;
  /** Le queda una falta para salir (la 4.ª de 5). */
  warning: boolean;
  out: EjectionReason | null;
}

export interface CoachFouls {
  /** Técnicas del entrenador (C). */
  technicals: number;
  /** Técnicas del banco (B), cargadas al entrenador. */
  bench: number;
  out: boolean;
}

/** Qué provocó la última falta, para la alerta en pantalla. */
export interface LastFoul {
  side: Side;
  kind: FoulKind;
  player: string | null;
  /** Faltas de equipo del periodo contando esta. */
  teamFouls: number;
  /** Tiros libres que da (sin contar las faltas en acción de tiro, que el motor no conoce). */
  freeThrows: 0 | 1 | 2;
  /** Además de los tiros, el balón vuelve al equipo que recibió la falta. */
  possession: boolean;
  warning: boolean;
  out: EjectionReason | 'coach' | null;
}

export interface BasketballState {
  config: BasketballConfig;
  status: 'playing' | 'final';
  /** 1..periods = tiempo regular; más = prórroga. */
  period: number;
  score: [number, number];
  /** Puntos de cada lado en cada periodo (incluidas las prórrogas). */
  periodScores: [number, number][];
  /** Faltas de equipo del periodo (la prórroga sigue con las del último; en 3x3, las de todo el juego). */
  teamFouls: [number, number];
  /** Tiempos muertos usados por tramo ('h1', 'h2', 'ot1'…, o 'game' en 3x3). */
  timeoutsUsed: Record<string, [number, number]>;
  /** Tiempos muertos usados con 2:00 o menos en el último periodo regular. */
  lateTimeouts: [number, number];
  players: [Record<string, BasketballPlayer>, Record<string, BasketballPlayer>];
  /** Quién jugó en cada lado (lo confirma el anotador; anotar o hacer falta también lo agrega). */
  present: [string[], string[]];
  coaches: [CoachFouls, CoachFouls];
  /** Flecha de posesión alterna: a quién le toca la próxima. null hasta el salto inicial (y siempre en 3x3). */
  arrow: Side | null;
  /** Quién se llevó la última posesión alterna (o el saque del periodo). */
  lastAlternating: Side | null;
  clock: ClockState;
  /** Forfeit (no se presentó, Art. 20) o default (se quedó con menos de 2 en cancha, Art. 21). */
  ending: { kind: 'forfeit' | 'default'; side: Side } | null;
  winner: Side | null;
  lastFoul: LastFoul | null;
}

type WithTime = { at?: number };

export type BasketballEvent =
  | ({ type: 'score'; side: Side; points: 1 | 2 | 3; player?: string } & WithTime)
  | ({ type: 'foul'; side: Side; kind: FoulKind; player?: string } & WithTime)
  /** `lastTwoMinutes` lo marca el anotador cuando no hay reloj (con reloj se calcula). */
  | ({ type: 'timeout'; side: Side; lastTwoMinutes?: boolean } & WithTime)
  | ({ type: 'period_end' } & WithTime)
  | { type: 'clock'; action: 'start'; at: number }
  | { type: 'clock'; action: 'stop'; at: number }
  /** Corrige el reloj: lo que falta del periodo. */
  | { type: 'clock'; action: 'set'; remainingMs: number; at?: number }
  /** Lista de presentes de un lado (reemplaza la anterior). */
  | { type: 'present'; side: Side; players: string[] }
  /** Quién ganó el salto inicial: la flecha apunta al otro. */
  | { type: 'jump_ball'; side: Side }
  /** Situación de posesión alterna (balón retenido…): saca quien marca la flecha y la flecha se voltea. */
  | { type: 'alternating' }
  | ({ type: 'forfeit'; side: Side } & WithTime)
  | ({ type: 'default'; side: Side } & WithTime);

const other = (s: Side): Side => (s === 1 ? 2 : 1);

const TWO_MINUTES = 120_000;

/** Duración (ms) del periodo; Infinity si no tiene reloj (prórroga del 3x3). */
export function periodMs(config: BasketballConfig, period: number): number {
  const min = period <= config.periods ? config.periodMinutes : config.overtimeMinutes;
  return min > 0 ? min * 60_000 : Infinity;
}

/** "1.er cuarto", "2.ª mitad", "Prórroga", "Prórroga 2". */
export function basketballPeriodLabel(config: BasketballConfig, period: number): string {
  if (period > config.periods) {
    const n = period - config.periods;
    return n === 1 ? 'Prórroga' : `Prórroga ${n}`;
  }
  if (config.periods === 1) return 'Tiempo regular';
  if (config.periods === 2) return period === 1 ? '1.ª mitad' : '2.ª mitad';
  return `${period}.${period === 1 || period === 3 ? 'er' : 'º'} cuarto`;
}

/** Tramo de tiempos muertos del periodo. */
function timeoutWindow(config: BasketballConfig, period: number): string {
  if (config.timeouts.perGame !== null) return 'game';
  if (period > config.periods) return `ot${period - config.periods}`;
  return period <= config.periods / 2 ? 'h1' : 'h2';
}

function timeoutAllowance(config: BasketballConfig, window: string): number {
  const t = config.timeouts;
  if (window === 'game') return t.perGame ?? 0;
  if (window === 'h1') return t.firstHalf;
  if (window === 'h2') return t.secondHalf;
  return t.overtime;
}

/** ¿Estamos en los últimos 2 minutos del último periodo regular? */
function isLate(state: BasketballState, now?: number, flag?: boolean): boolean {
  const cfg = state.config;
  if (cfg.variant !== '5x5' || state.period !== cfg.periods) return false;
  if (flag !== undefined) return flag;
  if (!cfg.clock) return false;
  return periodMs(cfg, state.period) - elapsedAt(state.clock, now) <= TWO_MINUTES;
}

/** Tiempos muertos que le quedan a un lado ahora (con la regla de los últimos 2 minutos). */
export function basketballTimeoutsLeft(state: BasketballState, side: Side, now?: number): number {
  const i = side - 1;
  const w = timeoutWindow(state.config, state.period);
  let left = timeoutAllowance(state.config, w) - (state.timeoutsUsed[w]?.[i] ?? 0);
  if (isLate(state, now)) left = Math.min(left, state.config.timeouts.lastTwoMinutes - state.lateTimeouts[i]);
  return Math.max(0, left);
}

/** Lo que falta del periodo (ms) a la hora `now`; null si el periodo no tiene reloj. */
export function remainingMs(state: BasketballState, now?: number): number | null {
  const total = periodMs(state.config, state.period);
  if (total === Infinity) return null;
  return Math.max(0, total - elapsedAt(state.clock, now));
}

/**
 * El equipo está en situación de penalización: su próxima falta (no ofensiva) da tiros libres.
 * Con bonus desde la 5.ª, se enciende con 4 faltas de equipo.
 */
export function inPenalty(state: BasketballState, side: Side): boolean {
  return state.teamFouls[side - 1] >= state.config.bonusFrom - 1;
}

function ejectionOf(p: BasketballPlayer, r: EjectionRules): EjectionReason | null {
  if (p.disqualifying > 0) return 'disqualifying';
  if (r.technicals !== null && p.technicals >= r.technicals) return 'technicals';
  if (r.unsportsmanlike !== null && p.unsportsmanlike >= r.unsportsmanlike) return 'unsportsmanlike';
  if (r.mixed && p.technicals >= 1 && p.unsportsmanlike >= 1) return 'technical_unsportsmanlike';
  if (r.fouls !== null && p.fouls >= r.fouls) return 'fouls';
  return null;
}

function newPlayer(id: string): BasketballPlayer {
  return { id, points: 0, ones: 0, twos: 0, threes: 0, fouls: 0, technicals: 0, unsportsmanlike: 0, disqualifying: 0, warning: false, out: null };
}

/** Registro del jugador (lo crea y lo marca presente si hace falta). */
function playerOf(s: BasketballState, side: Side, id: string): BasketballPlayer {
  const i = side - 1;
  if (!id.trim()) throw new Error('Falta el jugador');
  if (!s.present[i].includes(id)) s.present[i].push(id);
  return (s.players[i][id] ??= newPlayer(id));
}

function assertIn(p: BasketballPlayer) {
  if (p.out) throw new Error(`${p.id} ya salió del juego`);
}

function finish(s: BasketballState, winner: Side, at?: number) {
  s.status = 'final';
  s.winner = winner;
  if (s.clock.running) s.clock = at === undefined ? { running: false, elapsedMs: s.clock.elapsedMs, since: null } : stopClock(s.clock, at, periodMs(s.config, s.period));
}

function init(config: BasketballConfig): BasketballState {
  if (config.periods < 1) throw new Error('Tiene que haber al menos un periodo');
  return {
    config,
    status: 'playing',
    period: 1,
    score: [0, 0],
    periodScores: [[0, 0]],
    teamFouls: [0, 0],
    timeoutsUsed: {},
    lateTimeouts: [0, 0],
    players: [{}, {}],
    present: [[], []],
    coaches: [
      { technicals: 0, bench: 0, out: false },
      { technicals: 0, bench: 0, out: false },
    ],
    arrow: null,
    lastAlternating: null,
    clock: newClock(),
    ending: null,
    winner: null,
    lastFoul: null,
  };
}

function apply(state: BasketballState, ev: BasketballEvent): BasketballState {
  // La lista de presentes se puede confirmar después del final; lo demás no.
  if (state.status === 'final' && ev.type !== 'present') throw new Error('El partido ya terminó');
  const s = structuredClone(state);
  const cfg = s.config;
  s.lastFoul = null;

  switch (ev.type) {
    case 'score': {
      const allowed = cfg.variant === '3x3' ? [1, 2] : [1, 2, 3];
      if (!allowed.includes(ev.points)) throw new Error(cfg.variant === '3x3' ? 'En 3x3 las canastas valen 1 o 2' : 'Una canasta vale 1, 2 o 3');
      const i = ev.side - 1;
      if (ev.player) {
        const p = playerOf(s, ev.side, ev.player);
        assertIn(p);
        p.points += ev.points;
        if (ev.points === 1) p.ones++;
        else if (ev.points === 2) p.twos++;
        else p.threes++;
      }
      s.score[i] += ev.points;
      s.periodScores[s.period - 1][i] += ev.points;
      // 3x3: llegar a 21 en tiempo regular (o anotar 2 en la prórroga) termina el juego.
      if (cfg.target !== null && s.period <= cfg.periods && s.score[i] >= cfg.target) finish(s, ev.side, ev.at);
      if (cfg.overtimeTarget !== null && s.period > cfg.periods) {
        const inOt = s.periodScores.slice(cfg.periods).reduce((n, ps) => n + ps[i], 0);
        if (inOt >= cfg.overtimeTarget) finish(s, ev.side, ev.at);
      }
      break;
    }

    case 'foul': {
      const i = ev.side - 1;
      if (ev.kind === 'coach_technical' || ev.kind === 'bench_technical') {
        const c = s.coaches[i];
        if (c.out) throw new Error('El entrenador ya fue expulsado');
        if (ev.kind === 'coach_technical') c.technicals++;
        else c.bench++;
        c.out = c.technicals >= 2 || c.technicals + c.bench >= 3;
        s.lastFoul = { side: ev.side, kind: ev.kind, player: null, teamFouls: s.teamFouls[i], freeThrows: 1, possession: false, warning: false, out: c.out ? 'coach' : null };
        break;
      }
      let p: BasketballPlayer | null = null;
      if (ev.player) {
        p = playerOf(s, ev.side, ev.player);
        assertIn(p);
        p.fouls++;
        if (ev.kind === 'technical') p.technicals++;
        if (ev.kind === 'unsportsmanlike') p.unsportsmanlike++;
        if (ev.kind === 'disqualifying') p.disqualifying++;
        p.out = ejectionOf(p, cfg.ejection);
        p.warning = !p.out && cfg.ejection.fouls !== null && p.fouls === cfg.ejection.fouls - 1;
      }
      const n = ++s.teamFouls[i];
      let freeThrows: 0 | 1 | 2 = 0;
      let possession = false;
      if (ev.kind === 'personal') {
        if (cfg.doubleBonusFrom !== null && n >= cfg.doubleBonusFrom) [freeThrows, possession] = [2, true];
        else if (n >= cfg.bonusFrom) freeThrows = 2;
      } else if (ev.kind === 'technical') freeThrows = 1;
      else if (ev.kind === 'unsportsmanlike') [freeThrows, possession] = [2, cfg.variant === '5x5'];
      else if (ev.kind === 'disqualifying') [freeThrows, possession] = [2, true];
      s.lastFoul = { side: ev.side, kind: ev.kind, player: p?.id ?? null, teamFouls: n, freeThrows, possession, warning: p?.warning ?? false, out: p?.out ?? null };
      break;
    }

    case 'timeout': {
      const i = ev.side - 1;
      const w = timeoutWindow(cfg, s.period);
      const allowed = timeoutAllowance(cfg, w);
      const used = s.timeoutsUsed[w]?.[i] ?? 0;
      if (used >= allowed) throw new Error(allowed === 0 ? 'En este tramo no hay tiempos muertos' : 'No le quedan tiempos muertos');
      const late = isLate(s, ev.at, ev.lastTwoMinutes);
      if (late && s.lateTimeouts[i] >= cfg.timeouts.lastTwoMinutes) {
        throw new Error(`En los últimos 2 minutos solo se pueden pedir ${cfg.timeouts.lastTwoMinutes} tiempos muertos`);
      }
      const pair: [number, number] = s.timeoutsUsed[w] ?? [0, 0];
      pair[i]++;
      s.timeoutsUsed[w] = pair;
      if (late) s.lateTimeouts[i]++;
      break;
    }

    case 'period_end': {
      if (cfg.overtimeTarget !== null && s.period > cfg.periods) throw new Error(`En la prórroga gana el primero que anote ${cfg.overtimeTarget} puntos`);
      if (s.period >= cfg.periods && s.score[0] !== s.score[1]) {
        finish(s, s.score[0] > s.score[1] ? 1 : 2, ev.at);
        break;
      }
      // Sigue otro periodo, o prórroga si el tiempo regular terminó empatado.
      s.period++;
      s.periodScores.push([0, 0]);
      if (cfg.variant === '5x5' && s.period <= cfg.periods) s.teamFouls = [0, 0];
      s.clock = newClock();
      if (s.arrow !== null) {
        s.lastAlternating = s.arrow;
        s.arrow = other(s.arrow);
      }
      break;
    }

    case 'clock': {
      const total = periodMs(cfg, s.period);
      if (ev.action === 'start') {
        if (elapsedAt(s.clock) >= total) throw new Error('Al periodo no le queda tiempo');
        s.clock = startClock(s.clock, ev.at);
      } else if (ev.action === 'stop') {
        s.clock = stopClock(s.clock, ev.at, total);
      } else {
        if (total === Infinity) throw new Error('Este periodo no tiene reloj');
        if (ev.remainingMs < 0 || ev.remainingMs > total) throw new Error('Tiempo inválido');
        s.clock = setElapsed(s.clock, total - ev.remainingMs, ev.at);
      }
      break;
    }

    case 'present': {
      const i = ev.side - 1;
      const withStats = Object.keys(s.players[i]);
      s.present[i] = [...new Set([...ev.players, ...withStats])];
      break;
    }

    case 'jump_ball': {
      if (cfg.variant === '3x3') throw new Error('En 3x3 no hay salto inicial');
      if (s.arrow !== null) throw new Error('El salto inicial ya se anotó');
      s.arrow = other(ev.side);
      break;
    }

    case 'alternating': {
      if (s.arrow === null) throw new Error('Primero anota quién ganó el salto inicial');
      s.lastAlternating = s.arrow;
      s.arrow = other(s.arrow);
      break;
    }

    case 'forfeit': {
      const w = other(ev.side);
      s.ending = { kind: 'forfeit', side: ev.side };
      s.score = w === 1 ? [cfg.forfeitScore, 0] : [0, cfg.forfeitScore];
      finish(s, w, ev.at);
      break;
    }

    case 'default': {
      // Art. 21: si el ganador iba arriba se queda el marcador; si no, 2-0. El que se queda sin jugadores recibe 1 punto de tabla.
      const w = other(ev.side);
      s.ending = { kind: 'default', side: ev.side };
      if (s.score[w - 1] <= s.score[ev.side - 1]) s.score = w === 1 ? [2, 0] : [0, 2];
      finish(s, w, ev.at);
      break;
    }

    default:
      throw new Error('Jugada desconocida');
  }
  return s;
}

function summary(s: BasketballState): string {
  const cfg = s.config;
  const [a, b] = s.score;
  if (s.ending?.kind === 'forfeit') return `${a}-${b} (forfeit)`;
  if (s.ending?.kind === 'default') return `${a}-${b} (se quedó sin jugadores)`;
  if (cfg.variant === '3x3' || cfg.periods === 1) return `${a}-${b}${s.period > cfg.periods ? ' (pr.)' : ''}`;
  const parts = s.periodScores.map(([x, y], k) => `${k >= cfg.periods ? 'pr. ' : ''}${x}-${y}`);
  return `${a}-${b} (${parts.join(', ')})`;
}

export const basketball: MatchEngine<BasketballConfig, BasketballState, BasketballEvent> = {
  init,
  apply,
  isOver: (s) => s.status === 'final',
  result: (s) => ({ winner: s.status === 'final' ? s.winner : null, summary: summary(s) }),
};

/** Resultado para la tabla (forfeit = walkover; default = defaulted). */
export function basketballMatchResult(state: BasketballState, meta: { id: string; side1: string; side2: string }): TeamMatchResult {
  const r: TeamMatchResult = { ...meta, winner: state.status === 'final' ? state.winner : null, totals: { points: [state.score[0], state.score[1]] } };
  if (state.ending?.kind === 'forfeit') r.walkover = state.ending.side;
  if (state.ending?.kind === 'default') r.defaulted = state.ending.side;
  return r;
}

/** Línea de un jugador en un partido (para anotadores de la temporada). */
export interface BasketballLine {
  player: string;
  team: string;
  points: number;
  ones: number;
  twos: number;
  threes: number;
  fouls: number;
}

/** Una línea por jugador presente (con 0 si no anotó). `teams` = ids de los equipos de los lados 1 y 2. */
export function basketballLines(state: BasketballState, teams: [string, string]): BasketballLine[] {
  const out: BasketballLine[] = [];
  ([1, 2] as const).forEach((side) => {
    const i = side - 1;
    for (const id of state.present[i]) {
      const p = state.players[i][id] ?? newPlayer(id);
      out.push({ player: id, team: teams[i], points: p.points, ones: p.ones, twos: p.twos, threes: p.threes, fouls: p.fouls });
    }
  });
  return out;
}
