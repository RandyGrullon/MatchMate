/**
 * Acta en vivo de fútbol de campo y fútbol sala (futsal). Un solo motor con variante; el fútbol 7 es una
 * configuración. El partido es la lista de jugadas y el estado se recalcula desde ella. Todo puro: la hora
 * llega en cada jugada (`at`, ms) y con ella se llena el minuto ("45+2") desde el reloj.
 *
 * Reglas:
 * - Dos tiempos (45/40/35/30 en campo, 20 en sala), añadido informativo, prórroga opcional de 2×15 (sala 2×5)
 *   y penales aparte del marcador: 5 por equipo (sala 3 o 5) y luego muerte súbita.
 * - Autogol: suma al equipo, no al jugador (se guarda aparte como autogol del que lo hizo).
 * - Amarilla; la segunda amarilla es roja. Roja directa. El expulsado no vuelve.
 * - Cambios: límite configurable (5 en campo, más 1 en la prórroga), ilimitados o con reingreso (sala).
 * - Portero por lado: los goles recibidos van al portero que estaba; valla invicta si el equipo no recibió.
 * - Sala: faltas acumuladas por mitad (alerta en la 5.ª; desde la 6.ª, tiro libre desde 10 m sin barrera);
 *   se reinician en el descanso y la prórroga cuenta con la 2.ª mitad. 1 tiempo muerto por mitad, ninguno
 *   en la prórroga. Tras una roja el equipo juega con uno menos 2 minutos de juego, salvo que el rival
 *   con MÁS jugadores le marque (entonces completa uno); si están iguales o marca el que tiene menos, nada cambia.
 */

import type { MatchEngine, Side } from '../types';
import { elapsedAt, newClock, setElapsed, startClock, stopClock, type ClockState } from './clock';
import type { CardLine } from './discipline';
import type { TeamMatchResult } from './standings';

export type FootballVariant = 'football' | 'futsal';

export interface SubRules {
  /** Cambios por partido; null = sin límite. */
  max: number | null;
  /** El que salió puede volver a entrar (cambios "volantes" de sala o ligas amateur). */
  reentry: boolean;
  /** Cambios extra en la prórroga (IFAB: 1). */
  extraTimeBonus: number;
}

export interface FootballConfig {
  variant: FootballVariant;
  halfMinutes: number;
  /** 'running' = corrido (campo, sala amateur); 'stopped' = parado (sala oficial); 'none' = sin reloj. */
  clock: 'running' | 'stopped' | 'none';
  /** Prórroga si termina empatado (solo eliminatorias). */
  extraTime: boolean;
  extraTimeMinutes: number;
  /** Penales si sigue empatado. */
  shootout: boolean;
  /** Penales por equipo antes de la muerte súbita (5; en sala 3 o 5). */
  shootoutKicks: number;
  subs: SubRules;
  /** Sala: faltas acumuladas por mitad. null en campo (las faltas quedan solo como dato). */
  accumulatedFouls: { alertAt: number; penaltyFrom: number } | null;
  /** Sala: 1 por mitad; campo: 0. */
  timeoutsPerHalf: number;
  /** Sala: 2 minutos con uno menos tras una roja. null en campo (el expulsado no se repone). */
  powerPlayMs: number | null;
  /** Jugadores en cancha por equipo (11, 7, 5). */
  players: number;
  /** Marcador del W.O. para el que sí se presentó (3-0). */
  walkoverScore: number;
}

export type FootballPreset = 'football' | 'football7' | 'futsal' | 'futsal_amateur';

/** Configuraciones listas. En eliminatorias se prende `extraTime` y/o `shootout`. */
export function footballConfig(preset: FootballPreset = 'football', overrides: Partial<FootballConfig> = {}): FootballConfig {
  const field: FootballConfig = {
    variant: 'football',
    halfMinutes: 45,
    clock: 'running',
    extraTime: false,
    extraTimeMinutes: 15,
    shootout: false,
    shootoutKicks: 5,
    subs: { max: 5, reentry: false, extraTimeBonus: 1 },
    accumulatedFouls: null,
    timeoutsPerHalf: 0,
    powerPlayMs: null,
    players: 11,
    walkoverScore: 3,
  };
  const futsal: FootballConfig = {
    ...field,
    variant: 'futsal',
    halfMinutes: 20,
    clock: 'stopped',
    extraTimeMinutes: 5,
    subs: { max: null, reentry: true, extraTimeBonus: 0 },
    accumulatedFouls: { alertAt: 5, penaltyFrom: 6 },
    timeoutsPerHalf: 1,
    powerPlayMs: 120_000,
    players: 5,
  };
  const base =
    preset === 'futsal'
      ? futsal
      : preset === 'futsal_amateur'
        ? { ...futsal, clock: 'running' as const }
        : preset === 'football7'
          ? { ...field, halfMinutes: 30, players: 7, subs: { max: null, reentry: true, extraTimeBonus: 0 } }
          : field;
  return { ...base, ...overrides };
}

export interface FootballPlayer {
  id: string;
  goals: number;
  assists: number;
  /** Autogoles (no suman a sus goles; el gol va al otro equipo). */
  ownGoals: number;
  yellows: number;
  red: 'direct' | 'second_yellow' | null;
  fouls: number;
  /** Fue portero en algún momento del partido. */
  keeper: boolean;
  /** Goles recibidos mientras estuvo de portero. */
  conceded: number;
  /** Está fuera por un cambio. */
  subbedOff: boolean;
  /** Jugó (alineación, entró de cambio, marcó, asistió, fue portero o hizo falta). */
  played: boolean;
}

/** Sala: equipo con uno menos tras una roja. Los tiempos son de juego (ms jugados en todo el partido). */
export interface PowerPlay {
  side: Side;
  player: string;
  startMs: number;
  endsAtMs: number;
  /** 'goal' = le marcaron teniendo menos; 'manual' = lo cerró el anotador. */
  endedBy: 'goal' | 'manual' | null;
}

export interface TimelineItem {
  kind: 'goal' | 'own_goal' | 'yellow' | 'second_yellow' | 'red' | 'sub' | 'goalkeeper' | 'timeout' | 'period_end' | 'shootout';
  side: Side | null;
  player?: string;
  assist?: string;
  /** En un cambio, `player` sale e `in` entra. */
  in?: string;
  scored?: boolean;
  period: number;
  /** "23", "45+2"; null si no hay reloj ni minuto escrito. */
  minute: string | null;
}

export interface ShootoutKick {
  side: Side;
  player: string | null;
  scored: boolean;
}

export interface FootballState {
  config: FootballConfig;
  status: 'playing' | 'shootout' | 'final';
  /** 1-2 = tiempos; 3-4 = prórroga. */
  period: number;
  score: [number, number];
  periodScores: [number, number][];
  clock: ClockState;
  /** Tiempo jugado (ms) en los periodos ya cerrados. */
  playedMs: number;
  /** Minutos de añadido anunciados en cada periodo. */
  addedTime: (number | null)[];
  players: [Record<string, FootballPlayer>, Record<string, FootballPlayer>];
  /** Quién jugó en cada lado (lo confirma el anotador; alineación, cambios y goles también lo llenan). */
  present: [string[], string[]];
  /** Quién está en cancha; null = sin alineación (no se valida quién entra o sale). */
  onField: [string[] | null, string[] | null];
  subsUsed: [number, number];
  goalkeeper: [string | null, string | null];
  /** Faltas de la mitad (en sala, las acumuladas; la prórroga sigue con las de la 2.ª mitad). */
  fouls: [number, number];
  timeoutsUsed: [number, number];
  powerPlays: PowerPlay[];
  shootout: { kicks: ShootoutKick[] } | null;
  timeline: TimelineItem[];
  walkover: Side | null;
  winner: Side | null;
  /** Sala: lo que provocó la última falta, para la alerta. */
  lastFoul: { side: Side; count: number; alert: boolean; tenMeter: boolean } | null;
}

/**
 * `at` = hora de la jugada (ms). Con el reloj corriendo hace falta para el minuto, los 2 minutos de la roja
 * y el cierre del periodo; sin `at` se toma el reloj como estaba al arrancar. `minute` = minuto escrito a mano.
 */
type Stamp = { at?: number; minute?: string };

export type FootballEvent =
  /** `side` = equipo al que se le suma el gol. En autogol, `player` es del otro equipo. */
  | ({ type: 'goal'; side: Side; player?: string; assist?: string; ownGoal?: boolean } & Stamp)
  | ({ type: 'card'; side: Side; player: string; card: 'yellow' | 'red' } & Stamp)
  | ({ type: 'sub'; side: Side; out: string; in: string } & Stamp)
  | ({ type: 'goalkeeper'; side: Side; player: string } & Stamp)
  | { type: 'lineup'; side: Side; players: string[]; goalkeeper?: string }
  /** Lista de presentes de un lado (reemplaza la anterior, sin quitar a los que ya jugaron). */
  | { type: 'present'; side: Side; players: string[] }
  | ({ type: 'foul'; side: Side; player?: string } & Stamp)
  | ({ type: 'timeout'; side: Side } & Stamp)
  | { type: 'added_time'; minutes: number }
  | { type: 'period_end'; at?: number }
  | { type: 'clock'; action: 'start'; at: number }
  | { type: 'clock'; action: 'stop'; at: number }
  | { type: 'clock'; action: 'set'; elapsedMs: number; at?: number }
  /** Sala: el anotador da por cumplidos los 2 minutos del expulsado más antiguo de ese lado. */
  | { type: 'power_play_end'; side: Side; at?: number }
  | { type: 'shootout'; side: Side; player?: string; scored: boolean }
  /** `side` = el que no se presentó. */
  | { type: 'walkover'; side: Side };

const other = (s: Side): Side => (s === 1 ? 2 : 1);

/** Minutos antes de empezar el periodo (0, 45, 90, 105). */
function periodStart(cfg: FootballConfig, period: number): number {
  if (period <= 2) return (period - 1) * cfg.halfMinutes;
  return 2 * cfg.halfMinutes + (period - 3) * cfg.extraTimeMinutes;
}

function periodLength(cfg: FootballConfig, period: number): number {
  return period <= 2 ? cfg.halfMinutes : cfg.extraTimeMinutes;
}

/** Minuto de juego con añadido: a los 44:10 del 1.er tiempo es "45"; a los 46:30, "45+2". */
export function minuteLabel(cfg: FootballConfig, period: number, elapsedMs: number): string {
  const len = periodLength(cfg, period);
  const base = periodStart(cfg, period);
  const m = Math.floor(Math.max(0, elapsedMs) / 60_000) + 1;
  return m > len ? `${base + len}+${m - len}` : String(base + m);
}

/** "1.er tiempo", "2.º tiempo", "Prórroga 1", "Penales", "Final". */
export function footballPeriodLabel(state: FootballState): string {
  if (state.status === 'final') return 'Final';
  if (state.status === 'shootout') return 'Penales';
  if (state.period === 1) return '1.er tiempo';
  if (state.period === 2) return '2.º tiempo';
  return `Prórroga ${state.period - 2}`;
}

/** Tiempo jugado del periodo (ms) a la hora `now`. */
export function periodElapsed(state: FootballState, now?: number): number {
  return elapsedAt(state.clock, now);
}

/** Tiempo jugado en todo el partido (ms). */
function playedAt(s: FootballState, at?: number): number {
  return s.playedMs + elapsedAt(s.clock, at);
}

/** Minuto de una jugada: el escrito por el anotador, o el del reloj si está andando. */
function minuteOf(s: FootballState, ev: Stamp): string | null {
  if (ev.minute) return ev.minute;
  if (s.config.clock === 'none') return null;
  if (!s.clock.running && s.clock.elapsedMs === 0) return null; // no arrancaron el reloj
  return minuteLabel(s.config, s.period, elapsedAt(s.clock, ev.at));
}

function isActive(pp: PowerPlay, now: number): boolean {
  return pp.endedBy === null && now < pp.endsAtMs;
}

/** Sala: expulsiones con uno menos todavía vigentes, con lo que les falta. */
export function activePowerPlays(state: FootballState, now?: number): { side: Side; player: string; remainingMs: number }[] {
  const t = playedAt(state, now);
  return state.powerPlays.filter((pp) => isActive(pp, t)).map((pp) => ({ side: pp.side, player: pp.player, remainingMs: pp.endsAtMs - t }));
}

/** Jugadores en cancha de un lado: campo = los que quedan tras las rojas; sala = menos los que cumplen los 2 minutos. */
export function playersOnCourt(state: FootballState, side: Side, now?: number): number {
  const n = state.config.players;
  if (state.config.powerPlayMs === null) return n - Object.values(state.players[side - 1]).filter((p) => p.red).length;
  return n - activePowerPlays(state, now).filter((pp) => pp.side === side).length;
}

/** Tiempos muertos que le quedan en esta mitad (sala). En la prórroga no hay. */
export function footballTimeoutsLeft(state: FootballState, side: Side): number {
  if (state.period > 2 || state.status !== 'playing') return 0;
  return Math.max(0, state.config.timeoutsPerHalf - state.timeoutsUsed[side - 1]);
}

/** Sala: faltas acumuladas y si ya está en alerta (la próxima es tiro desde 10 m). */
export function foulStatus(state: FootballState, side: Side): { count: number; alert: boolean } {
  const count = state.fouls[side - 1];
  const acc = state.config.accumulatedFouls;
  return { count, alert: acc !== null && count >= acc.penaltyFrom - 1 };
}

function newPlayer(id: string): FootballPlayer {
  return { id, goals: 0, assists: 0, ownGoals: 0, yellows: 0, red: null, fouls: 0, keeper: false, conceded: 0, subbedOff: false, played: false };
}

/** Registro del jugador. `plays` lo marca presente (una tarjeta desde el banco no cuenta como jugar). */
function playerOf(s: FootballState, side: Side, id: string, plays = true): FootballPlayer {
  const i = side - 1;
  if (!id.trim()) throw new Error('Falta el jugador');
  const p = (s.players[i][id] ??= newPlayer(id));
  if (plays) {
    p.played = true;
    if (!s.present[i].includes(id)) s.present[i].push(id);
  }
  return p;
}

/** El jugador puede participar en una jugada (no expulsado, no cambiado sin reingreso). */
function assertAvailable(s: FootballState, p: FootballPlayer) {
  if (p.red) throw new Error(`${p.id} fue expulsado`);
  if (p.subbedOff && !s.config.subs.reentry) throw new Error(`${p.id} ya salió de cambio`);
}

function push(s: FootballState, item: Omit<TimelineItem, 'period'>) {
  s.timeline.push({ ...item, period: s.period });
}

function stopAt(s: FootballState, at?: number) {
  if (!s.clock.running) return;
  s.clock = at === undefined ? { running: false, elapsedMs: s.clock.elapsedMs, since: null } : stopClock(s.clock, at);
}

function finish(s: FootballState, winner: Side | null, at?: number) {
  stopAt(s, at);
  s.status = 'final';
  s.winner = winner;
}

/** Sacar de la cancha a un expulsado; en sala arranca su castigo de 2 minutos. */
function sendOff(s: FootballState, side: Side, id: string, at?: number) {
  const i = side - 1;
  const field = s.onField[i];
  if (field) s.onField[i] = field.filter((x) => x !== id);
  if (s.goalkeeper[i] === id) s.goalkeeper[i] = null;
  if (s.config.powerPlayMs !== null && s.status === 'playing') {
    const t = playedAt(s, at);
    s.powerPlays.push({ side, player: id, startMs: t, endsAtMs: t + s.config.powerPlayMs, endedBy: null });
  }
}

/** Sala: si marca el que tiene más jugadores, el rival completa uno (el castigo más antiguo). */
function releaseOnGoal(s: FootballState, scorer: Side, at?: number) {
  if (s.config.powerPlayMs === null) return;
  const t = playedAt(s, at);
  const mine = s.powerPlays.filter((pp) => pp.side === scorer && isActive(pp, t));
  const theirs = s.powerPlays.filter((pp) => pp.side !== scorer && isActive(pp, t));
  if (theirs.length > mine.length) theirs[0].endedBy = 'goal';
}

/** Ganador de la tanda o null si sigue. `n` = penales por equipo antes de la muerte súbita. */
export function shootoutWinner(kicks: readonly ShootoutKick[], n: number): Side | null {
  const k = [0, 0];
  const g = [0, 0];
  for (const kick of kicks) {
    k[kick.side - 1]++;
    if (kick.scored) g[kick.side - 1]++;
  }
  if (k[0] <= n && k[1] <= n) {
    // Serie inicial: se acaba cuando uno ya no puede alcanzar al otro aunque meta todos los que le quedan.
    if (g[0] + (n - k[0]) < g[1]) return 2;
    if (g[1] + (n - k[1]) < g[0]) return 1;
    return null;
  }
  // Muerte súbita: después de cada par de tiros.
  if (k[0] === k[1] && g[0] !== g[1]) return g[0] > g[1] ? 1 : 2;
  return null;
}

/** Goles de la tanda por lado. */
export function shootoutScore(state: FootballState): [number, number] | null {
  if (!state.shootout) return null;
  const g: [number, number] = [0, 0];
  state.shootout.kicks.forEach((k) => k.scored && g[k.side - 1]++);
  return g;
}

function nextPeriod(s: FootballState) {
  s.period++;
  s.periodScores.push([0, 0]);
  s.addedTime.push(null);
  s.timeoutsUsed = [0, 0];
  // Las faltas acumuladas se reinician en el descanso; la prórroga sigue con las de la 2.ª mitad.
  if (s.period === 2) s.fouls = [0, 0];
}

function init(config: FootballConfig): FootballState {
  if (config.shootoutKicks < 1) throw new Error('La tanda necesita al menos un penal por equipo');
  return {
    config,
    status: 'playing',
    period: 1,
    score: [0, 0],
    periodScores: [[0, 0]],
    clock: newClock(),
    playedMs: 0,
    addedTime: [null],
    players: [{}, {}],
    present: [[], []],
    onField: [null, null],
    subsUsed: [0, 0],
    goalkeeper: [null, null],
    fouls: [0, 0],
    timeoutsUsed: [0, 0],
    powerPlays: [],
    shootout: null,
    timeline: [],
    walkover: null,
    winner: null,
    lastFoul: null,
  };
}

/** Jugadas que se permiten durante la tanda de penales. */
const IN_SHOOTOUT = new Set<FootballEvent['type']>(['shootout', 'card', 'goalkeeper', 'present']);

function apply(state: FootballState, ev: FootballEvent): FootballState {
  if (state.status === 'final' && ev.type !== 'present') throw new Error('El partido ya terminó');
  if (state.status === 'shootout' && !IN_SHOOTOUT.has(ev.type)) throw new Error('Ya están en la tanda de penales');
  const s = structuredClone(state);
  const cfg = s.config;
  s.lastFoul = null;

  switch (ev.type) {
    case 'goal': {
      const i = ev.side - 1;
      const o = other(ev.side);
      if (ev.ownGoal) {
        if (ev.assist) throw new Error('Un autogol no lleva asistencia');
        if (ev.player) {
          const p = playerOf(s, o, ev.player);
          assertAvailable(s, p);
          p.ownGoals++;
        }
      } else {
        if (ev.player) {
          const p = playerOf(s, ev.side, ev.player);
          assertAvailable(s, p);
          p.goals++;
        }
        if (ev.assist) {
          if (ev.assist === ev.player) throw new Error('El que asiste no puede ser el mismo que marca');
          const a = playerOf(s, ev.side, ev.assist);
          assertAvailable(s, a);
          a.assists++;
        }
      }
      releaseOnGoal(s, ev.side, ev.at);
      s.score[i]++;
      s.periodScores[s.period - 1][i]++;
      const gk = s.goalkeeper[o - 1];
      if (gk) playerOf(s, o, gk).conceded++;
      push(s, { kind: ev.ownGoal ? 'own_goal' : 'goal', side: ev.side, player: ev.player, assist: ev.assist, minute: minuteOf(s, ev) });
      break;
    }

    case 'card': {
      const p = playerOf(s, ev.side, ev.player, false);
      if (p.red) throw new Error(`${p.id} ya fue expulsado`);
      let kind: TimelineItem['kind'];
      if (ev.card === 'yellow') {
        p.yellows++;
        kind = p.yellows >= 2 ? 'second_yellow' : 'yellow';
        if (p.yellows >= 2) p.red = 'second_yellow';
      } else {
        p.red = 'direct';
        kind = 'red';
      }
      if (p.red) sendOff(s, ev.side, p.id, ev.at);
      push(s, { kind, side: ev.side, player: p.id, minute: minuteOf(s, ev) });
      break;
    }

    case 'sub': {
      const i = ev.side - 1;
      if (ev.in === ev.out) throw new Error('Es el mismo jugador');
      const max = cfg.subs.max === null ? Infinity : cfg.subs.max + (s.period >= 3 ? cfg.subs.extraTimeBonus : 0);
      if (s.subsUsed[i] >= max) throw new Error(`Ya hizo los ${max} cambios`);
      const incoming = s.players[i][ev.in];
      if (incoming?.red) throw new Error(`${ev.in} fue expulsado`);
      if (incoming?.subbedOff && !cfg.subs.reentry) throw new Error(`${ev.in} ya salió y no puede volver a entrar`);
      const out = playerOf(s, ev.side, ev.out);
      if (out.red) throw new Error('Un expulsado no se puede cambiar');
      const field = s.onField[i];
      if (field) {
        if (!field.includes(ev.out)) throw new Error(`${ev.out} no está en la cancha`);
        if (field.includes(ev.in)) throw new Error(`${ev.in} ya está en la cancha`);
        s.onField[i] = field.map((x) => (x === ev.out ? ev.in : x));
      }
      out.subbedOff = true;
      const inP = playerOf(s, ev.side, ev.in);
      inP.subbedOff = false;
      s.subsUsed[i]++;
      if (s.goalkeeper[i] === ev.out) {
        s.goalkeeper[i] = ev.in;
        inP.keeper = true;
      }
      push(s, { kind: 'sub', side: ev.side, player: ev.out, in: ev.in, minute: minuteOf(s, ev) });
      break;
    }

    case 'goalkeeper': {
      const p = playerOf(s, ev.side, ev.player);
      if (p.red) throw new Error(`${p.id} fue expulsado`);
      s.goalkeeper[ev.side - 1] = p.id;
      p.keeper = true;
      push(s, { kind: 'goalkeeper', side: ev.side, player: p.id, minute: s.status === 'playing' ? minuteOf(s, ev) : null });
      break;
    }

    case 'lineup': {
      const i = ev.side - 1;
      const ids = [...new Set(ev.players)];
      if (ids.length > cfg.players) throw new Error(`Máximo ${cfg.players} jugadores en la cancha`);
      if (ev.goalkeeper && !ids.includes(ev.goalkeeper)) throw new Error('El portero tiene que estar en la alineación');
      ids.forEach((id) => {
        if (s.players[i][id]?.red) throw new Error(`${id} fue expulsado`);
        playerOf(s, ev.side, id);
      });
      s.onField[i] = ids;
      if (ev.goalkeeper) {
        s.goalkeeper[i] = ev.goalkeeper;
        s.players[i][ev.goalkeeper].keeper = true;
      }
      break;
    }

    case 'present': {
      const i = ev.side - 1;
      const played = Object.values(s.players[i])
        .filter((p) => p.played)
        .map((p) => p.id);
      s.present[i] = [...new Set([...ev.players, ...played])];
      break;
    }

    case 'foul': {
      const i = ev.side - 1;
      if (ev.player) playerOf(s, ev.side, ev.player).fouls++;
      const count = ++s.fouls[i];
      const acc = cfg.accumulatedFouls;
      if (acc) s.lastFoul = { side: ev.side, count, alert: count === acc.alertAt, tenMeter: count >= acc.penaltyFrom };
      break;
    }

    case 'timeout': {
      const i = ev.side - 1;
      if (cfg.timeoutsPerHalf === 0) throw new Error('En este partido no hay tiempos muertos');
      if (s.period > 2) throw new Error('En la prórroga no hay tiempos muertos');
      if (s.timeoutsUsed[i] >= cfg.timeoutsPerHalf) throw new Error('Ya usó su tiempo muerto de esta mitad');
      s.timeoutsUsed[i]++;
      push(s, { kind: 'timeout', side: ev.side, minute: minuteOf(s, ev) });
      break;
    }

    case 'added_time': {
      if (!Number.isInteger(ev.minutes) || ev.minutes < 0 || ev.minutes > 30) throw new Error('Añadido inválido');
      s.addedTime[s.period - 1] = ev.minutes;
      break;
    }

    case 'period_end': {
      s.playedMs += elapsedAt(s.clock, ev.at);
      s.clock = newClock();
      push(s, { kind: 'period_end', side: null, minute: null });
      const tied = s.score[0] === s.score[1];
      if (s.period === 1 || s.period === 3) nextPeriod(s);
      else if (s.period === 2 && tied && cfg.extraTime) nextPeriod(s);
      else if (tied && cfg.shootout) {
        s.status = 'shootout';
        s.shootout = { kicks: [] };
      } else finish(s, tied ? null : s.score[0] > s.score[1] ? 1 : 2);
      break;
    }

    case 'clock': {
      if (cfg.clock === 'none') throw new Error('Este partido no usa reloj');
      if (ev.action === 'start') s.clock = startClock(s.clock, ev.at);
      else if (ev.action === 'stop') s.clock = stopClock(s.clock, ev.at);
      else s.clock = setElapsed(s.clock, ev.elapsedMs, ev.at);
      break;
    }

    case 'power_play_end': {
      const t = playedAt(s, ev.at);
      const pp = s.powerPlays.find((x) => x.side === ev.side && isActive(x, t));
      if (!pp) throw new Error('Ese equipo no tiene a nadie cumpliendo los 2 minutos');
      pp.endedBy = 'manual';
      break;
    }

    case 'shootout': {
      if (s.status !== 'shootout' || !s.shootout) throw new Error('No hay tanda de penales');
      const kicks = s.shootout.kicks;
      if (kicks.length > 0) {
        const expected = kicks.length % 2 === 0 ? kicks[0].side : other(kicks[0].side);
        if (ev.side !== expected) throw new Error('Le toca patear al otro equipo');
      }
      if (ev.player) {
        const p = playerOf(s, ev.side, ev.player, false);
        if (p.red) throw new Error('Un expulsado no puede patear');
      }
      kicks.push({ side: ev.side, player: ev.player ?? null, scored: ev.scored });
      push(s, { kind: 'shootout', side: ev.side, player: ev.player, scored: ev.scored, minute: null });
      const w = shootoutWinner(kicks, cfg.shootoutKicks);
      if (w) finish(s, w);
      break;
    }

    case 'walkover': {
      const w = other(ev.side);
      s.walkover = ev.side;
      s.score = w === 1 ? [cfg.walkoverScore, 0] : [0, cfg.walkoverScore];
      finish(s, w);
      break;
    }

    default:
      throw new Error('Jugada desconocida');
  }
  return s;
}

function summary(s: FootballState): string {
  const [a, b] = s.score;
  if (s.walkover) return `${a}-${b} (W.O.)`;
  const pens = shootoutScore(s);
  if (pens && pens[0] + pens[1] > 0) return `${a}-${b} (pen. ${pens[0]}-${pens[1]})`;
  if (s.period >= 3) return `${a}-${b} (prórroga)`;
  return `${a}-${b}`;
}

export const football: MatchEngine<FootballConfig, FootballState, FootballEvent> = {
  init,
  apply,
  isOver: (s) => s.status === 'final',
  result: (s) => ({ winner: s.status === 'final' ? s.winner : null, summary: summary(s) }),
};

/**
 * Resultado para la tabla. `winner` es el del partido (con penales incluidos); la tabla usa los goles,
 * así que un empate definido en penales cuenta como empate (salvo que la liga dé puntos por la tanda).
 * Tarjetas para el juego limpio, por jugador: solo amarilla, doble amarilla, roja directa, amarilla + roja directa.
 */
export function footballMatchResult(state: FootballState, meta: { id: string; side1: string; side2: string }): TeamMatchResult {
  const count = (i: number, f: (p: FootballPlayer) => boolean) => Object.values(state.players[i]).filter(f).length;
  const pair = (f: (p: FootballPlayer) => boolean): [number, number] => [count(0, f), count(1, f)];
  const sum = (f: (p: FootballPlayer) => number): [number, number] => [0, 1].map((i) => Object.values(state.players[i]).reduce((n, p) => n + f(p), 0)) as [number, number];
  const totals: Record<string, [number, number]> = {
    goals: [state.score[0], state.score[1]],
    yellow: sum((p) => p.yellows),
    red: pair((p) => p.red !== null),
    cardsYellow: pair((p) => p.yellows === 1 && p.red === null),
    cardsSecondYellow: pair((p) => p.red === 'second_yellow'),
    cardsRed: pair((p) => p.red === 'direct' && p.yellows === 0),
    cardsYellowRed: pair((p) => p.red === 'direct' && p.yellows > 0),
  };
  const pens = shootoutScore(state);
  if (pens) totals.shootout = pens;
  const r: TeamMatchResult = { ...meta, winner: state.status === 'final' ? state.winner : null, totals };
  if (state.walkover) r.walkover = state.walkover;
  return r;
}

/** Línea de un jugador en un partido (para goleadores, vallas invictas y estadísticas). */
export interface FootballLine {
  player: string;
  team: string;
  goals: number;
  assists: number;
  ownGoals: number;
  yellows: number;
  red: 'direct' | 'second_yellow' | null;
  keeper: boolean;
  conceded: number;
  /** Fue portero y su equipo no recibió goles (partido terminado, sin W.O.). */
  cleanSheet: boolean;
}

/** Una línea por jugador presente. `teams` = ids de los equipos de los lados 1 y 2. */
export function footballLines(state: FootballState, teams: [string, string]): FootballLine[] {
  const out: FootballLine[] = [];
  ([1, 2] as const).forEach((side) => {
    const i = side - 1;
    const against = state.score[other(side) - 1];
    const clean = state.status === 'final' && !state.walkover && against === 0;
    for (const id of state.present[i]) {
      const p = state.players[i][id] ?? newPlayer(id);
      out.push({ player: id, team: teams[i], goals: p.goals, assists: p.assists, ownGoals: p.ownGoals, yellows: p.yellows, red: p.red, keeper: p.keeper, conceded: p.conceded, cleanSheet: clean && p.keeper });
    }
  });
  return out;
}

/** Tarjetas del partido por jugador (también las del banco), para la disciplina. */
export function footballCards(state: FootballState, teams: [string, string]): CardLine[] {
  const out: CardLine[] = [];
  [0, 1].forEach((i) => {
    for (const p of Object.values(state.players[i])) if (p.yellows > 0 || p.red) out.push({ player: p.id, team: teams[i], yellows: p.yellows, red: p.red });
  });
  return out;
}
