/**
 * Round robin social de pickleball: compañeros que rotan cada ronda (el calendario del americano) y cada partido
 * es UN juego a 11 (o 15, 21) ganando por 2, con conteo tradicional o por rally; no una suma de puntos.
 * Opción «mixto»: cada pareja con uno de cada grupo (A y B), rotando compañeros.
 *
 * Se guarda como un evento 'americano' (así sirven save_night_round y save_points_result del pádel) con
 * `config.game = {to, winBy, scoring}`. Los partidos llevan `rules.match` = un juego de pickleball y
 * `rules.points = {mode: 'game', target}` (la base no revisa un total fijo). Puro.
 */
import type { MatchDraft } from '../../../../lib/data/matches';
import { resolveTies, seededRandom, shuffle, socialStandings, tiebreak, type SocialRound } from '../../../../sports/formats';
import { raceFinal, resolveRules, type PickleballRules } from '../../../../sports/racket';
import type { StandingRow } from '../../../../sports/types';
import type { ResultParser } from '../../../../components/match';
import {
  newNightConfig,
  nextNightRound,
  nightConfigJson,
  parseNightConfig,
  redoNightRound,
  roundDrafts,
  type NextRound,
  type NightConfig,
  type NightRound,
} from '../../racket/logic/night';

export interface GameRules {
  /** Puntos del juego: 11, 15 o 21. */
  to: number;
  winBy: 1 | 2;
  scoring: 'sideout' | 'rally';
}

export const DEFAULT_GAME: GameRules = { to: 11, winBy: 2, scoring: 'sideout' };
export const GAME_TARGETS = [11, 15, 21] as const;

export interface SocialConfig extends NightConfig {
  game: GameRules;
  /** Mixto: los del grupo A (el resto es el grupo B); cada pareja lleva uno de cada grupo. null = libre. */
  mixed: string[] | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseGame(raw: unknown): GameRules {
  const g = isObj(raw) ? raw : {};
  const to = typeof g.to === 'number' && Number.isInteger(g.to) && g.to >= 5 && g.to <= 25 ? g.to : DEFAULT_GAME.to;
  return { to, winBy: g.winBy === 1 ? 1 : 2, scoring: g.scoring === 'rally' ? 'rally' : 'sideout' };
}

/** Evento de round robin social (americano con juego). */
export const isSocialEvent = (e: { type: string; config: Record<string, unknown> }) => e.type === 'americano' && isObj(e.config?.game);

export function parseSocialConfig(raw: unknown, type = 'americano'): SocialConfig {
  const c = isObj(raw) ? raw : {};
  const base = parseNightConfig(raw, type);
  const players = base.players;
  const mixed = Array.isArray(c.mixed) ? c.mixed.filter((x): x is string => typeof x === 'string' && players.includes(x)) : null;
  return { ...base, format: 'americano', rest: 'none', game: parseGame(c.game), mixed };
}

/** Lo que se guarda en events.config (la noche del pádel más el juego y el mixto). */
export function socialConfigJson(c: SocialConfig): Record<string, unknown> {
  return {
    ...nightConfigJson({ ...c, format: 'americano', rest: 'none' }),
    points: { mode: 'game', target: c.game.to },
    game: c.game,
    ...(c.mixed ? { mixed: c.mixed } : {}),
  };
}

/** Round robin nuevo (a 11, tradicional). */
export function newSocialConfig(opts: { players: string[]; courts: string[]; rounds?: number; game?: GameRules; mixed?: string[] | null; seed?: string }): SocialConfig {
  const base = newNightConfig('americano', { players: opts.players, courts: opts.courts, rounds: opts.rounds, rest: 'none', seed: opts.seed });
  return { ...base, rest: 'none', game: opts.game ?? DEFAULT_GAME, mixed: opts.mixed ?? null };
}

/** Reglas del motor para un juego del round robin (siempre dobles, a un juego). */
export function gameMatchRules(game: GameRules, leagueMatch: unknown = {}): PickleballRules {
  const base = isObj(leagueMatch) ? (leagueMatch as Partial<PickleballRules>) : {};
  const partial: Partial<PickleballRules> = {
    gamePointOnServeOnly: typeof base.gamePointOnServeOnly === 'boolean' ? base.gamePointOnServeOnly : false,
    doubles: true,
    bestOf: 1,
    gameTo: game.to,
    winBy: game.winBy,
    scoring: game.scoring,
  };
  return resolveRules('pickleball', partial);
}

/** «Juego a 11, ganando por 2, conteo tradicional». */
export function gameText(g: GameRules): string {
  return `Juego a ${g.to}, ganando por ${g.winBy}, ${g.scoring === 'rally' ? 'conteo por rally' : 'conteo tradicional'}`;
}

// ---------------------------------------------------------------------------------------------------------
// Mixto: cada pareja con uno de cada grupo

/**
 * Ronda mixta: en la ronda r, el i-ésimo de A juega con el (i + r)-ésimo de B (compañero distinto cada ronda
 * mientras haya); las parejas se enfrentan en un orden al azar (con la semilla) y, si sobran, descansan las que
 * menos han descansado. Del grupo más grande descansan los que sobran, rotando.
 */
export function mixedRound(groupA: readonly string[], groupB: readonly string[], opts: { round: number; courts: number; seed: string; previous?: readonly SocialRound[] }): SocialRound {
  const n = Math.min(groupA.length, groupB.length);
  if (n < 2) throw new Error('El mixto necesita al menos 2 de cada grupo.');
  const rests = new Map<string, number>();
  for (const r of opts.previous ?? []) for (const p of r.rests) rests.set(p, (rests.get(p) ?? 0) + 1);
  // Del grupo más grande juegan los que menos han descansado (a igualdad, rotando por ronda).
  const pickPlaying = (g: readonly string[]) => {
    if (g.length === n) return [...g];
    const order = g.map((p, i) => ({ p, i, k: rests.get(p) ?? 0 })).sort((a, b) => b.k - a.k || ((a.i + opts.round) % g.length) - ((b.i + opts.round) % g.length));
    const out = order.slice(0, n).map((x) => x.p);
    return g.filter((p) => out.includes(p));
  };
  const A = pickPlaying(groupA);
  const B = pickPlaying(groupB);
  const r = opts.round - 1;
  const pairs: [string, string][] = A.map((a, i) => [a, B[(i + r) % n]]);
  const rand = seededRandom(`${opts.seed}:mixto:${opts.round}`);
  const courts = Math.max(1, Math.min(opts.courts, Math.floor(pairs.length / 2)));
  // Descansan las parejas que sobran: primero las de quienes menos han descansado.
  const shuffled = shuffle(pairs, rand);
  const ranked = shuffled
    .map((p, i) => ({ p, i, k: (rests.get(p[0]) ?? 0) + (rests.get(p[1]) ?? 0) }))
    .sort((a, b) => a.k - b.k || a.i - b.i);
  const restingPairs = ranked.slice(courts * 2).map((x) => x.p);
  const playingPairs = shuffled.filter((p) => !restingPairs.includes(p));
  const matches = Array.from({ length: courts }, (_, k) => ({ court: k + 1, side1: playingPairs[2 * k], side2: playingPairs[2 * k + 1] }));
  const playing = new Set(matches.flatMap((m) => [...m.side1, ...m.side2]));
  const all = [...groupA, ...groupB];
  return { round: opts.round, matches, rests: all.filter((p) => !playing.has(p)) };
}

/**
 * La ronda que sigue: la del americano (sin repetir compañero) o, en mixto, la de los dos grupos. En mixto hacen
 * falta al menos 2 de cada grupo.
 */
export function nextSocialRound(cfg: SocialConfig, rounds: readonly NightRound[]): NextRound {
  if (!cfg.mixed) return nextNightRound(cfg, rounds);
  if (cfg.closed) return { ok: false, reason: 'El round robin ya terminó.' };
  const a = cfg.players.filter((p) => cfg.mixed!.includes(p));
  const b = cfg.players.filter((p) => !cfg.mixed!.includes(p));
  if (a.length < 2 || b.length < 2) return { ok: false, reason: 'En mixto hacen falta al menos 2 de cada grupo.' };
  const last = rounds.at(-1);
  const round = Math.max(last?.round ?? 0, cfg.round) + 1;
  if (round > cfg.rounds) return { ok: false, reason: `Ya van las ${cfg.rounds} rondas. Para jugar otra, súbele las rondas.` };
  const previous = rounds.map((r) => ({ round: r.round, rests: r.rests, matches: [] }));
  const social = mixedRound(a, b, { round, courts: cfg.courts.length, seed: cfg.seed, previous });
  return { ok: true, round, social, pendingPrev: last?.pending ?? 0 };
}

/** Rehacer la última ronda (si nadie empezó) con otro sorteo. */
export function redoSocialRound(cfg: SocialConfig, rounds: readonly NightRound[], salt: string): NextRound {
  if (!cfg.mixed) return redoNightRound(cfg, rounds, salt);
  const last = rounds.at(-1);
  if (!last) return { ok: false, reason: 'Todavía no hay ronda.' };
  if (last.started) return { ok: false, reason: 'Esa ronda ya empezó: ya no se puede rehacer.' };
  const base: SocialConfig = { ...cfg, seed: `${cfg.seed}~${salt}`, round: last.round - 1, closed: false };
  const next = nextSocialRound(base, rounds.slice(0, -1));
  if (!next.ok) return next;
  return { ...next, round: last.round, social: { ...next.social, round: last.round }, config: base, pendingPrev: 0 };
}

// ---------------------------------------------------------------------------------------------------------
// Partidos y tabla

/** Partidos de la ronda para save_night_round: un juego de pickleball en cada cancha. */
export function socialDrafts(cfg: SocialConfig, social: SocialRound, leagueRules: Record<string, unknown> = {}): { drafts: MatchDraft[]; rests: string[] } {
  const { drafts, rests } = roundDrafts(cfg, social, leagueRules);
  const rules = { ...leagueRules, match: gameMatchRules(cfg.game, leagueRules.match), points: { mode: 'game', target: cfg.game.to } };
  return { drafts: drafts.map((d) => ({ ...d, rules })), rests };
}

/**
 * Tabla individual del round robin: partidos ganados → dif. de puntos → puntos a favor (sin bono por descansar:
 * los descansos solo se cuentan).
 */
export function socialTable(players: readonly string[], rounds: readonly NightRound[]): StandingRow[] {
  const scored = rounds.map((r) => ({ rests: r.rests, matches: r.matches.map((m) => ({ side1: m.side1, side2: m.side2, score1: m.score1, score2: m.score2 })) }));
  // Los puntos de la tabla son los partidos ganados (lo que se ordena primero); los puntos anotados van en `for`.
  const rows = socialStandings(players, scored, { rest: 'none' }).map((r) => ({ ...r, points: r.won }));
  return resolveTies(rows, [], [tiebreak.wins('partidos ganados'), tiebreak.diff('dif. de puntos'), tiebreak.for('puntos a favor')]);
}

/** Texto de la tabla para WhatsApp. */
export function socialShareText(o: { title: string; date?: string; rows: readonly StandingRow[]; nameOf: (id: string) => string; final?: boolean; url?: string; top?: number }): string {
  const head = [o.title, o.date].filter(Boolean).join(' · ');
  const top = o.rows.filter((r) => r.played > 0).slice(0, o.top ?? 12);
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const lines = top.map((r) => `${r.rank}. ${o.nameOf(r.id)}: ${r.won} G, ${r.lost} P (${signed(r.diff)})`);
  return [head, `${o.final ? 'Tabla final' : 'Tabla hasta ahora'} (ganados, dif. de puntos):`, ...lines, o.url].filter(Boolean).join('\n');
}

/**
 * Lector del marcador de un juego: «11-7», «12 10». Revisa que sea un final posible (a 11 ganando por 2: 11-9 sí,
 * 11-10 no, 13-11 sí).
 */
export function gameParser(game: GameRules): ResultParser {
  return (text: string) => {
    const m = /^\s*(\d{1,2})\s*(?:[-–—:/x]|\s)\s*(\d{1,2})\s*$/i.exec(text ?? '');
    if (!m) throw new Error(`Escribe los puntos de cada lado así: ${game.to}-7.`);
    const a = Number(m[1]);
    const b = Number(m[2]);
    const w = raceFinal(game.to, game.winBy, [a, b]);
    if (w === null) throw new Error(`${a}-${b} no termina un juego a ${game.to} ganando por ${game.winBy}.`);
    return { score: { text: `${a}-${b}`, sides: [a, b] }, winner: w, summary: `Gana el lado ${w}, ${Math.max(a, b)} a ${Math.min(a, b)}` };
  };
}
