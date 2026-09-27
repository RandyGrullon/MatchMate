/**
 * Noche de Americano o Mexicano (pádel, y cualquier raqueta en dobles): configuración guardada en events.config,
 * rondas a partir de los partidos, tabla individual en vivo, siguiente ronda y texto para compartir.
 * Puro: sin React ni backend. Usa los motores de src/sports/formats (americano, mexicano, social).
 */
import type { Match, MatchDraft } from '../../../../lib/data/matches';
import { isFinal } from '../../../../lib/data/matches';
import {
  americanoRoundsForAll,
  americanoSchedule,
  matchesPerRound,
  mexicanoRound,
  roundsWithEqualRests,
  socialStandings,
  type PointsConfig,
  type RestPolicy,
  type ScoredRound,
  type SocialRound,
} from '../../../../sports/formats';
import type { StandingRow } from '../../../../sports/types';

export type NightFormat = 'americano' | 'mexicano';

/** Tipos de evento que son una noche de puntos ('noche' = el formato va en config.format). */
export const NIGHT_TYPES: readonly string[] = ['americano', 'mexicano', 'noche'];
export const isNightType = (type: string) => NIGHT_TYPES.includes(type);

/** Totales comunes del americano (la suma de los dos lados). */
export const NIGHT_TARGETS = [16, 21, 24, 32] as const;
export const NIGHT_MAX_PLAYERS = 32;
export const NIGHT_MAX_COURTS = 8;

/** Lo que se guarda en events.config de una noche. `rests` y `round` los escribe la base (save_night_round). */
export interface NightConfig {
  v: 1;
  format: NightFormat;
  /** Jugadores de la noche (ids), en el orden en que se anotaron. */
  players: string[];
  /** Nombres de las canchas: una por partido a la vez. */
  courts: string[];
  /** Cómo se juega cada partido: a un total de puntos o por tiempo. */
  points: PointsConfig;
  /** Rondas previstas. */
  rounds: number;
  /** Qué recibe quien descansa en la tabla. */
  rest: RestPolicy;
  /** Mexicano: la ronda 1 al azar o por nivel. */
  firstRound: 'random' | 'level';
  /** Nivel de cada jugador (Playtomic 0–7): solo arma la ronda 1 del mexicano. */
  levels: Record<string, number>;
  /** Semilla del sorteo (la misma noche da las mismas rondas en cualquier teléfono). */
  seed: string;
  /** Americano: rondas planeadas desde `planFrom`, cada partido [a, b, c, d] = a+b contra c+d (índices de `planPlayers`). */
  plan?: number[][][];
  planPlayers?: string[];
  planFrom?: number;
  /** Quién descansó en cada ronda (lo guarda save_night_round). */
  rests: Record<string, string[]>;
  /** Última ronda publicada. */
  round: number;
  /** La noche terminó: no hay más rondas. */
  closed: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown, max = 64) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x).slice(0, max) : []);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;

const REST_POLICIES: readonly RestPolicy[] = ['own-average', 'round-average', 'normalize', 'none'];

export const REST_LABELS: Record<RestPolicy, string> = {
  'own-average': 'Su propio promedio por partido',
  'round-average': 'El promedio de la ronda',
  normalize: 'Tabla por promedio (puntos por partido)',
  none: 'Nada (solo lo que sumó)',
};

/** Reglas de puntos saneadas (total 24 por defecto; por tiempo, 15 min). */
export function parsePoints(raw: unknown): PointsConfig {
  const p = isObj(raw) ? raw : {};
  const mode = p.mode === 'time' ? 'time' : 'total';
  const out: PointsConfig = { mode, serveEvery: int(p.serveEvery, 1, 20, 4) };
  if (mode === 'total') out.target = int(p.target, 4, 99, 24);
  else out.minutes = int(p.minutes, 5, 120, 15);
  return out;
}

/** events.config → NightConfig con todo lo que falte puesto (datos viejos o a medias no rompen la pantalla). */
export function parseNightConfig(raw: unknown, type = 'americano'): NightConfig {
  const c = isObj(raw) ? raw : {};
  const format: NightFormat = c.format === 'mexicano' || c.format === 'americano' ? c.format : type === 'mexicano' ? 'mexicano' : 'americano';
  const players = [...new Set(strList(c.players))];
  const courts = strList(c.courts, NIGHT_MAX_COURTS).map((x) => x.slice(0, 40));
  const levels: Record<string, number> = {};
  if (isObj(c.levels)) for (const [k, v] of Object.entries(c.levels)) if (typeof v === 'number' && Number.isFinite(v)) levels[k] = v;
  const rests: Record<string, string[]> = {};
  if (isObj(c.rests)) for (const [k, v] of Object.entries(c.rests)) rests[k] = strList(v);
  const out: NightConfig = {
    v: 1,
    format,
    players,
    courts: courts.length ? courts : ['Cancha 1'],
    points: parsePoints(c.points),
    rounds: int(c.rounds, 1, 30, format === 'mexicano' ? 6 : 7),
    rest: REST_POLICIES.includes(c.rest as RestPolicy) ? (c.rest as RestPolicy) : 'own-average',
    firstRound: c.firstRound === 'level' ? 'level' : 'random',
    levels,
    seed: typeof c.seed === 'string' && c.seed ? c.seed : 'noche',
    rests,
    round: int(c.round, 0, 99, 0),
    closed: c.closed === true,
  };
  if (Array.isArray(c.plan) && Array.isArray(c.planPlayers)) {
    out.plan = (c.plan as unknown[]).filter(Array.isArray).map((r) =>
      (r as unknown[]).filter((m): m is number[] => Array.isArray(m) && m.length === 4 && m.every((i) => Number.isInteger(i))),
    );
    out.planPlayers = strList(c.planPlayers);
    out.planFrom = int(c.planFrom, 1, 99, 1);
  }
  return out;
}

/** Lo que se guarda (sin lo que escribe la base: rests y round se conservan si ya estaban). */
export function nightConfigJson(c: NightConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {
    v: 1,
    format: c.format,
    players: c.players,
    courts: c.courts,
    points: c.points,
    rounds: c.rounds,
    rest: c.rest,
    firstRound: c.firstRound,
    levels: c.levels,
    seed: c.seed,
    rests: c.rests,
    round: c.round,
    closed: c.closed,
  };
  if (c.plan && c.planPlayers) {
    out.plan = c.plan;
    out.planPlayers = c.planPlayers;
    out.planFrom = c.planFrom ?? 1;
  }
  return out;
}

/** Rondas recomendadas: americano hasta 7 (con descansos parejos si se puede); mexicano 6. */
export function suggestRounds(format: NightFormat, players: number, courts: number): number {
  if (format === 'mexicano') return 6;
  const all = americanoRoundsForAll(players, courts);
  if (!all) return 1;
  const cap = Math.min(all, 7);
  const even = roundsWithEqualRests(players, courts, cap);
  const best = even.filter((r) => r >= Math.min(4, cap)).at(-1);
  return best ?? cap;
}

export interface NightInfo {
  /** Partidos por ronda (canchas en uso). */
  perRound: number;
  /** Descansan por ronda. */
  resting: number;
  /** Canchas que sobran. */
  idleCourts: number;
  /** Rondas para que todos jueguen con todos (americano). */
  roundsForAll: number;
  /** Con cuántas rondas (hasta 12) todos descansan lo mismo. */
  equalRests: number[];
  /** Hace falta al menos 4 jugadores. */
  tooFew: boolean;
}

export function nightInfo(players: number, courts: number): NightInfo {
  const perRound = matchesPerRound(players, courts);
  return {
    perRound,
    resting: Math.max(0, players - perRound * 4),
    idleCourts: Math.max(0, courts - perRound),
    roundsForAll: americanoRoundsForAll(players, courts),
    equalRests: roundsWithEqualRests(players, courts, 12),
    tooFew: players < 4,
  };
}

/** Noche nueva con los valores de la plantilla. */
export function newNightConfig(
  format: NightFormat,
  opts: {
    players: string[];
    courts: string[];
    points?: Partial<PointsConfig>;
    rounds?: number;
    rest?: RestPolicy;
    firstRound?: 'random' | 'level';
    levels?: Record<string, number>;
    seed?: string;
  },
): NightConfig {
  const players = [...new Set(opts.players)];
  return {
    v: 1,
    format,
    players,
    courts: opts.courts.length ? opts.courts : ['Cancha 1'],
    points: parsePoints({ mode: 'total', target: 24, ...opts.points }),
    rounds: opts.rounds ?? suggestRounds(format, players.length, opts.courts.length || 1),
    rest: opts.rest ?? 'own-average',
    firstRound: opts.firstRound ?? 'random',
    levels: opts.levels ?? {},
    seed: opts.seed ?? `noche:${Date.now().toString(36)}`,
    rests: {},
    round: 0,
    closed: false,
  };
}

/** Texto corto de cómo se juega: «A 24 puntos» / «15 minutos». */
export const pointsLabel = (p: PointsConfig) => (p.mode === 'time' ? `${p.minutes ?? 15} minutos por partido` : `A ${p.target ?? 24} puntos`);

// ---------------------------------------------------------------------------------------------------------
// Rondas desde los partidos

export interface NightMatch {
  id: string;
  round: number;
  court: string;
  side1: string[];
  side2: string[];
  /** Solo si el resultado ya cuenta. */
  score1: number | null;
  score2: number | null;
  match: Match;
}

export interface NightRound {
  round: number;
  matches: NightMatch[];
  rests: string[];
  /** Todos los partidos terminados (o anulados). */
  done: boolean;
  /** Algún partido empezó o terminó (ya no se puede rehacer). */
  started: boolean;
  /** Partidos que faltan por terminar. */
  pending: number;
}

const playersOf = (m: Match, side: 0 | 1) => m.sides[side].players.map((p) => p.playerId);
const closedStatus = (m: Match) => m.status === 'confirmed' || m.status === 'walkover' || m.status === 'void' || m.status === 'finished' || m.status === 'disputed';

/** Rondas de la noche (en orden) con sus partidos, marcadores que cuentan y descansos. */
export function nightRounds(cfg: NightConfig, matches: readonly Match[], now = Date.now()): NightRound[] {
  const byRound = new Map<number, NightMatch[]>();
  for (const m of matches) {
    if (m.round == null || m.status === 'void') continue;
    const counts = isFinal(m, now) && Array.isArray(m.score?.sides);
    const [a, b] = counts ? (m.score!.sides as [number, number]) : [null, null];
    const nm: NightMatch = { id: m.id, round: m.round, court: m.court, side1: playersOf(m, 0), side2: playersOf(m, 1), score1: a, score2: b, match: m };
    const list = byRound.get(m.round) ?? [];
    list.push(nm);
    byRound.set(m.round, list);
  }
  const collator = new Intl.Collator('es', { numeric: true });
  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => {
      const list = byRound.get(round)!.sort((x, y) => collator.compare(x.court, y.court));
      const pending = list.filter((x) => !closedStatus(x.match)).length;
      return {
        round,
        matches: list,
        rests: cfg.rests[String(round)] ?? [],
        done: pending === 0,
        started: list.some((x) => x.match.status !== 'scheduled' || x.match.seq > 0),
        pending,
      };
    });
}

/** Todos los que jugaron o están en la noche (para la tabla). */
export function nightPeople(cfg: NightConfig, rounds: readonly NightRound[]): string[] {
  const out = new Set(cfg.players);
  for (const r of rounds) {
    for (const m of r.matches) for (const p of [...m.side1, ...m.side2]) out.add(p);
    for (const p of r.rests) out.add(p);
  }
  return [...out];
}

const scored = (rounds: readonly NightRound[]): (ScoredRound & { round: number })[] =>
  rounds.map((r) => ({ round: r.round, rests: r.rests, matches: r.matches.map((m) => ({ side1: m.side1, side2: m.side2, score1: m.score1, score2: m.score2 })) }));

/** Tabla individual: puntos → partidos ganados → dif. de puntos (src/sports/formats/social). */
export function nightTable(cfg: NightConfig, rounds: readonly NightRound[]): StandingRow[] {
  return socialStandings(nightPeople(cfg, rounds), scored(rounds), { rest: cfg.rest });
}

// ---------------------------------------------------------------------------------------------------------
// Siguiente ronda

const sameList = (a: readonly string[] | undefined, b: readonly string[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

/** Americano: planea las rondas `fromRound`..`cfg.rounds` con los jugadores de ahora (sin repetir compañero si se puede). */
export function planAmericano(cfg: NightConfig, fromRound: number): NightConfig {
  const rounds = Math.max(1, cfg.rounds - fromRound + 1);
  const sched = americanoSchedule(cfg.players, { courts: cfg.courts.length, rounds, seed: `${cfg.seed}:${fromRound}` });
  const idx = new Map(cfg.players.map((p, i) => [p, i]));
  const plan = sched.map((r) => r.matches.map((m) => [idx.get(m.side1[0])!, idx.get(m.side1[1])!, idx.get(m.side2[0])!, idx.get(m.side2[1])!]));
  return { ...cfg, plan, planPlayers: [...cfg.players], planFrom: fromRound };
}

/** Ronda del plan del americano (null si no está planeada con estos jugadores). */
export function roundFromPlan(cfg: NightConfig, round: number): SocialRound | null {
  if (!cfg.plan || !cfg.planPlayers || !sameList(cfg.planPlayers, cfg.players)) return null;
  const k = round - (cfg.planFrom ?? 1);
  const r = cfg.plan[k];
  if (!r || !r.length) return null;
  const ids = cfg.planPlayers;
  const playing = new Set(r.flat());
  return {
    round,
    matches: r.map(([a, b, c, d], i) => ({ court: i + 1, side1: [ids[a], ids[b]], side2: [ids[c], ids[d]] })),
    rests: ids.filter((_, i) => !playing.has(i)),
  };
}

export type NextRound =
  | {
      ok: true;
      round: number;
      social: SocialRound;
      /** La configuración cambió (plan nuevo del americano): guardarla antes de publicar la ronda. */
      config?: NightConfig;
      /** Partidos de la ronda anterior sin terminar (el americano deja seguir con aviso). */
      pendingPrev: number;
    }
  | { ok: false; reason: string };

/** La ronda que sigue (o por qué todavía no). */
export function nextNightRound(cfg: NightConfig, rounds: readonly NightRound[]): NextRound {
  if (cfg.closed) return { ok: false, reason: 'La noche ya terminó.' };
  if (cfg.players.length < 4) return { ok: false, reason: 'Hacen falta al menos 4 jugadores.' };
  const last = rounds.at(-1);
  const round = Math.max(last?.round ?? 0, cfg.round) + 1;
  if (round > cfg.rounds) return { ok: false, reason: `Ya van las ${cfg.rounds} rondas. Para jugar otra, súbele las rondas a la noche.` };
  const pendingPrev = last?.pending ?? 0;
  if (cfg.format === 'mexicano') {
    if (pendingPrev) return { ok: false, reason: `Falta${pendingPrev === 1 ? '' : 'n'} ${pendingPrev} partido${pendingPrev === 1 ? '' : 's'} de la ronda ${last!.round}: el mexicano arma la ronda con la tabla.` };
    const social = mexicanoRound(cfg.players, scored(rounds), {
      courts: cfg.courts.length,
      firstRound: cfg.firstRound,
      levels: cfg.levels,
      seed: `${cfg.seed}:${round}`,
      rest: cfg.rest,
    });
    return { ok: true, round, social: { ...social, round }, pendingPrev };
  }
  const planned = roundFromPlan(cfg, round);
  if (planned) return { ok: true, round, social: planned, pendingPrev };
  const config = planAmericano(cfg, round);
  return { ok: true, round, social: roundFromPlan(config, round)!, config, pendingPrev };
}

/**
 * Rehacer la última ronda (si ningún partido empezó): con los jugadores de ahora y otro sorteo (`salt`). El
 * americano vuelve a planear desde esa ronda; el mexicano la arma otra vez con la tabla.
 */
export function redoNightRound(cfg: NightConfig, rounds: readonly NightRound[], salt: string): NextRound {
  const last = rounds.at(-1);
  if (!last) return { ok: false, reason: 'Todavía no hay ronda.' };
  if (last.started) return { ok: false, reason: 'Esa ronda ya empezó: ya no se puede rehacer.' };
  const prev = rounds.slice(0, -1);
  const base: NightConfig = { ...cfg, seed: `${cfg.seed}~${salt}`, round: last.round - 1, closed: false, plan: undefined, planPlayers: undefined, planFrom: undefined };
  const next = nextNightRound(base, prev);
  if (!next.ok) return next;
  return { ...next, round: last.round, social: { ...next.social, round: last.round }, config: next.config ?? base, pendingPrev: 0 };
}

/** Partidos para save_night_round: cancha con su nombre y las reglas de puntos de la noche en cada partido. */
export function roundDrafts(cfg: NightConfig, social: SocialRound, leagueRules: Record<string, unknown> = {}): { drafts: MatchDraft[]; rests: string[] } {
  const rules = { ...leagueRules, points: cfg.points };
  const drafts = social.matches.map(
    (m): MatchDraft => ({
      court: cfg.courts[m.court - 1] ?? `Cancha ${m.court}`,
      format: cfg.format,
      requireConfirm: false,
      rules,
      sides: [
        { side: 1, players: m.side1.map((playerId) => ({ playerId })) },
        { side: 2, players: m.side2.map((playerId) => ({ playerId })) },
      ],
    }),
  );
  return { drafts, rests: social.rests };
}

// ---------------------------------------------------------------------------------------------------------
// Compartir

/** Texto de la tabla para WhatsApp. */
export function nightShareText(o: {
  title: string;
  date?: string;
  rows: readonly StandingRow[];
  nameOf: (id: string) => string;
  points: PointsConfig;
  final?: boolean;
  url?: string;
  top?: number;
}): string {
  const head = [o.title, o.date].filter(Boolean).join(' · ');
  const top = o.rows.filter((r) => r.played > 0 || r.points > 0).slice(0, o.top ?? 12);
  const lines = top.map((r) => `${r.rank}. ${o.nameOf(r.id)}: ${fmtPoints(r.points)} pts (${r.won} G${r.drawn ? `, ${r.drawn} E` : ''}, ${r.lost} P)`);
  return [head, `${o.final ? 'Tabla final' : 'Tabla hasta ahora'} (${pointsLabel(o.points).toLowerCase()}):`, ...lines, o.url].filter(Boolean).join('\n');
}

/** 86 → «86»; 72.5 → «72,5». */
export const fmtPoints = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-DO', { maximumFractionDigits: 2 }));
