/**
 * Marcador de una serie (docs/esports.md §2.3 y §3.2): una serie es una fila de `public.matches` y su detalle va en
 * `score.games[]`, un mapa o juego por elemento. La regla de cada mapa o juego depende del juego (13 rondas y
 * prórroga por 2 en VALORANT, MR12 + MR3 en CS2, gol de oro en Rocket League, penales en FC, rondas en los juegos
 * de pelea, vidas en Smash, coronas en Clash Royale…). Es la misma tabla que `private.esp_game_winner` y
 * `private.esp_series_ok`: si cambia una, cambia la otra (y sus pruebas, que son las mismas filas).
 */
import type { Side } from '../types';
import { GAMES, type BestOf, type GameId } from './catalog';
import type { TournamentSettings } from './settings';

/** Un mapa o juego: `a` es el número del lado 1 y `b` el del lado 2; `w` el lado que lo ganó. Todos enteros. */
export interface GameRecord {
  w?: Side | null;
  a?: number;
  b?: number;
  /** Penales (EA SPORTS FC, solo con empate). */
  pa?: number;
  pb?: number;
  /** Rocket League: se ganó en prórroga (gol de oro). */
  ot?: boolean;
  /** Id del mapa de la lista del juego, o texto libre (≤ 24). */
  map?: string;
}

export interface SeriesRules {
  game: GameId;
  bestOf: BestOf;
  /** Empate permitido (solo FC al mejor de 1 en grupos o liga). */
  draws: boolean;
  /** Juegos de pelea. */
  roundsToWin?: 2 | 3;
  /** Smash. */
  stocks?: number;
}

/**
 * Es un `type` (no `interface`) a propósito: así se puede pasar tal cual donde se espera el `MatchScore` de
 * `matches.ts` (que tiene firma de índice), p. ej. `finishMatch(lid, id, { score: buildSeriesScore(...) })`.
 */
export type SeriesScore = {
  text: string;
  sides: [number, number];
  totals: { maps: [number, number]; points: [number, number] };
  games: GameRecord[];
  bestOf: BestOf;
  /** Ids de public.photos (0–3) de la misma liga. */
  proof?: string[];
  /** W.O. */
  wo?: true;
};

/** Mapas o juegos para ganar la serie: (bestOf + 1) / 2. */
export const needed = (bestOf: BestOf): number => (bestOf + 1) / 2;

const GAME_KEYS = new Set(['w', 'a', 'b', 'pa', 'pb', 'ot', 'map']);
const SCORE_KEYS = new Set(['text', 'sides', 'totals', 'games', 'bestOf', 'proof', 'wo']);
const BEST_OF: readonly number[] = [1, 3, 5, 7];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const inRange = (v: number, min: number, max: number) => v >= min && v <= max;
const present = (v: unknown) => v !== undefined && v !== null;

/** Rondas para ganar de un juego de pelea y vidas de Smash, con los del catálogo por defecto. */
const roundsToWinOf = (rules: SeriesRules): number => rules.roundsToWin ?? GAMES[rules.game].roundsToWin?.default ?? 2;
const stocksOf = (rules: SeriesRules): number => rules.stocks ?? GAMES[rules.game].stocks?.default ?? 3;
const prefixOf = (rules: SeriesRules): string => (GAMES[rules.game].scoring === 'val' || GAMES[rules.game].scoring === 'cs' ? 'Mapa' : 'Juego');

/**
 * Revisa un mapa o juego con la regla del juego. Devuelve el error (null = bien) y el ganador (null = empate del FC o
 * inválido). `n` es el número que se muestra (desde 1).
 */
function inspect(rules: SeriesRules, g: unknown, n: number): { error: string | null; winner: Side | null } {
  const meta = GAMES[rules.game];
  const rule = meta.scoring;
  const bad = (msg: string) => ({ error: `${prefixOf(rules)} ${n}: ${msg}`, winner: null });
  const structural = bad('revisa el marcador.');
  if (!isObj(g)) return structural;
  for (const k of Object.keys(g)) if (!GAME_KEYS.has(k) && g[k] !== undefined) return structural;

  const w = g.w ?? null;
  if (w !== null && w !== 1 && w !== 2) return structural;
  for (const k of ['a', 'b', 'pa', 'pb']) if (present(g[k]) && !isInt(g[k])) return structural;
  if (present(g.ot) && (typeof g.ot !== 'boolean' || rule !== 'goals_ot')) return structural;
  if ((present(g.pa) || present(g.pb)) && rule !== 'goals_pen') return structural;
  if (present(g.map)) {
    const map = g.map;
    if (typeof map !== 'string') return structural;
    if (meta.maps.length ? !/^[a-z0-9_]{1,24}$/.test(map) : !map.trim() || [...map].length > 24) return structural;
  }
  const hasAB = present(g.a);
  if (hasAB !== present(g.b)) return structural;
  const a = (g.a ?? 0) as number;
  const b = (g.b ?? 0) as number;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const byScore: Side = a > b ? 1 : 2;
  const checkW = (win: Side, msg: string) => (w !== null && w !== win ? bad(msg) : { error: null, winner: win });

  switch (rule) {
    case 'val': {
      const msg = 'en VALORANT se gana con 13 (o por 2 desde 12-12).';
      if (!hasAB) return bad(msg);
      if (!inRange(a, 0, 99) || !inRange(b, 0, 99)) return structural;
      if (!((hi === 13 && lo <= 11) || (hi >= 14 && hi - lo === 2 && lo >= 12))) return bad(msg);
      return checkW(byScore, msg);
    }
    case 'cs': {
      const msg = 'en CS2 se gana con 13, o en prórroga a 16, 19, 22…';
      if (!hasAB) return bad(msg);
      if (!inRange(a, 0, 99) || !inRange(b, 0, 99)) return structural;
      if (!((hi === 13 && lo <= 11) || (hi >= 16 && (hi - 13) % 3 === 0 && lo >= hi - 4 && lo <= hi - 1))) return bad(msg);
      return checkW(byScore, msg);
    }
    case 'win': {
      if (hasAB && (!inRange(a, 0, 200) || !inRange(b, 0, 200))) return structural;
      if (w === null) return bad('elige quién ganó.');
      return { error: null, winner: w };
    }
    case 'goals_ot': {
      const msg = 'no hay empates; la prórroga es a gol de oro (por 1).';
      if (!hasAB) return bad(msg);
      if (!inRange(a, 0, 99) || !inRange(b, 0, 99)) return structural;
      if (a === b || (g.ot === true && hi - lo !== 1)) return bad(msg);
      return checkW(byScore, msg);
    }
    case 'goals_pen': {
      if (!hasAB || !inRange(a, 0, 30) || !inRange(b, 0, 30)) return structural;
      const hasPens = present(g.pa);
      if (hasPens !== present(g.pb)) return structural;
      const pa = (g.pa ?? 0) as number;
      const pb = (g.pb ?? 0) as number;
      if (hasPens && (!inRange(pa, 0, 30) || !inRange(pb, 0, 30))) return structural;
      if (a !== b) return hasPens ? bad('los penales solo van con empate.') : checkW(byScore, 'revisa el marcador.');
      if (hasPens) return pa === pb ? bad('con empate, pon los penales.') : checkW(pa > pb ? 1 : 2, 'revisa el marcador.');
      if (!(rules.draws && rules.bestOf === 1)) return bad('con empate, pon los penales.');
      return w === null ? { error: null, winner: null } : structural;
    }
    case 'points': {
      const msg = 'no hay empates.';
      if (!hasAB) return bad(msg);
      if (!inRange(a, 0, 300) || !inRange(b, 0, 300)) return structural;
      if (a === b) return bad(msg);
      return checkW(byScore, msg);
    }
    case 'fight': {
      const rtw = roundsToWinOf(rules);
      if (w === null) return bad('elige quién ganó.');
      if (hasAB) {
        const mine = w === 1 ? a : b;
        const theirs = w === 1 ? b : a;
        if (mine !== rtw || !inRange(theirs, 0, rtw - 1)) return bad(`quien gana tiene ${rtw} rondas.`);
      }
      return { error: null, winner: w };
    }
    case 'stocks': {
      const st = stocksOf(rules);
      if (w === null) return bad('elige quién ganó.');
      if (hasAB) {
        const mine = w === 1 ? a : b;
        const theirs = w === 1 ? b : a;
        if (!inRange(mine, 1, st) || theirs !== 0) return bad(`quien gana tiene de 1 a ${st} vidas y el otro 0.`);
      }
      return { error: null, winner: w };
    }
    case 'crowns': {
      const msg = 'de 0 a 3 coronas, y quien gana tiene igual o más.';
      if (!hasAB || !inRange(a, 0, 3) || !inRange(b, 0, 3)) return bad(msg);
      if (w === null) return bad('elige quién ganó.');
      if ((w === 1 ? a : b) < (w === 1 ? b : a)) return bad(msg);
      return { error: null, winner: w };
    }
    default:
      return structural;
  }
}

/** Ganador de un mapa o juego que ya es válido: 1 o 2; null = empate del FC. */
export function gameWinner(rules: SeriesRules, g: GameRecord): Side | null {
  const r = inspect(rules, g, 1);
  if (!r.error) return r.winner;
  // Inválido: lo que diga el marcador, para no romper una pantalla a medio anotar.
  if (g.w === 1 || g.w === 2) return g.w;
  if (typeof g.a === 'number' && typeof g.b === 'number' && g.a !== g.b) return g.a > g.b ? 1 : 2;
  return null;
}

/**
 * Error de un mapa o juego con la regla del juego (null = bien). `index` es la posición en la serie, desde 0: el
 * mensaje dice «Mapa 2: en VALORANT se gana con 13 (o por 2 desde 12-12).» para el segundo.
 */
export function validateGame(rules: SeriesRules, g: GameRecord, index: number): string | null {
  return inspect(rules, g, index + 1).error;
}

/** ¿Es el empate del FC (empates permitidos, al mejor de 1, un solo juego empatado sin penales)? */
function isFcDraw(rules: SeriesRules, games: readonly GameRecord[], winners: readonly (Side | null)[]): boolean {
  return rules.draws && rules.bestOf === 1 && games.length === 1 && winners[0] === null;
}

/**
 * Errores de una serie (§2.3, pasos 1–3): de 1 a `bestOf` mapas válidos, ninguno después de que alguien llegó a
 * `need` y, si es final (`finished`, `confirmed` o `disputed`), que alguien haya llegado justo en el último o que
 * sea el empate del FC. En vivo o suspendido (`final: false`) no se pide que haya terminado.
 */
export function validateSeries(rules: SeriesRules, games: readonly GameRecord[], opts: { final: boolean }): string[] {
  const bo = rules.bestOf;
  const need = needed(bo);
  const missing = `Faltan juegos: nadie llegó a ${need}.`;
  const list = Array.isArray(games) ? games : [];
  const errors: string[] = [];
  if (list.length > bo) errors.push(`Al mejor de ${bo} se juegan como mucho ${bo}.`);
  const checked = list.map((g, i) => inspect(rules, g, i + 1));
  for (const c of checked) if (c.error) errors.push(c.error);
  if (errors.length && checked.some((c) => c.error)) return errors;
  if (!list.length) return [missing];
  const winners = checked.map((c) => c.winner);
  const won: [number, number] = [0, 0];
  let doneAt = -1;
  let extra = false;
  winners.forEach((w, i) => {
    if (doneAt >= 0) {
      errors.push(`Sobra el juego ${i + 1}: la serie ya terminó.`);
      extra = true;
      return;
    }
    if (w) won[w - 1]++;
    if (won[0] === need || won[1] === need) doneAt = i;
  });
  if (opts.final && !extra && doneAt !== list.length - 1 && !isFcDraw(rules, list, winners)) errors.push(missing);
  return errors;
}

/** Ganador de la serie: 1 o 2; null = empate del FC; undefined = todavía no termina. */
export function seriesWinner(rules: SeriesRules, games: readonly GameRecord[]): Side | null | undefined {
  const need = needed(rules.bestOf);
  const winners = games.map((g) => gameWinner(rules, g));
  const won: [number, number] = [0, 0];
  for (const w of winners) {
    if (w) won[w - 1]++;
    if (won[0] === need) return 1;
    if (won[1] === need) return 2;
  }
  return isFcDraw(rules, games, winners) ? null : undefined;
}

/** Copia limpia de un mapa: solo las claves que van, con `w` puesto (salvo el empate del FC) y `ot` solo si es true. */
function cleanGame(rules: SeriesRules, g: GameRecord): GameRecord {
  const out: GameRecord = {};
  const w = gameWinner(rules, g);
  if (w) out.w = w;
  if (typeof g.a === 'number' && typeof g.b === 'number') {
    out.a = g.a;
    out.b = g.b;
  }
  if (typeof g.pa === 'number' && typeof g.pb === 'number') {
    out.pa = g.pa;
    out.pb = g.pb;
  }
  if (g.ot === true) out.ot = true;
  if (typeof g.map === 'string' && g.map) out.map = g.map;
  return out;
}

const sidesOf = (rules: SeriesRules, games: readonly GameRecord[]): [number, number] => {
  const sides: [number, number] = [0, 0];
  for (const g of games) {
    const w = gameWinner(rules, g);
    if (w) sides[w - 1]++;
  }
  return sides;
};

const pointsOf = (games: readonly GameRecord[]): [number, number] => {
  const pts: [number, number] = [0, 0];
  for (const g of games) {
    if (typeof g.a === 'number') pts[0] += g.a;
    if (typeof g.b === 'number') pts[1] += g.b;
  }
  return pts;
};

/**
 * El `score` de la serie para `finishMatch`: mapas limpios, `sides` (ganados), `totals` (`maps` = sides, `points` =
 * suma de `a` y de `b`), `bestOf` de las reglas, el texto y las capturas (si hay).
 */
export function buildSeriesScore(rules: SeriesRules, games: readonly GameRecord[], proof?: readonly string[]): SeriesScore {
  const clean = games.map((g) => cleanGame(rules, g));
  const sides = sidesOf(rules, clean);
  const score: SeriesScore = {
    text: '',
    sides,
    totals: { maps: [sides[0], sides[1]], points: pointsOf(clean) },
    games: clean,
    bestOf: rules.bestOf,
  };
  score.text = seriesText(rules, score);
  if (proof && proof.length) score.proof = proof.slice(0, 3);
  return score;
}

/** Marcador de un W.O.: `absent` = el lado que no vino (0 = ninguno de los dos). */
export function walkoverScore(rules: SeriesRules, absent: 0 | 1 | 2): SeriesScore {
  const need = needed(rules.bestOf);
  const sides: [number, number] = absent === 2 ? [need, 0] : absent === 1 ? [0, need] : [0, 0];
  return { text: 'W.O.', wo: true, sides, totals: { maps: [sides[0], sides[1]], points: [0, 0] }, games: [], bestOf: rules.bestOf };
}

/** Un mapa como texto: «13-9», «3-2 (prórroga)» (o «4-3 prórroga» dentro del detalle), «2-2 (4-3 pen.)». */
function gameText(rules: SeriesRules, g: GameRecord, single: boolean): string | null {
  if (typeof g.a !== 'number' || typeof g.b !== 'number') return null;
  const rule = GAMES[rules.game].scoring;
  let t = `${g.a}-${g.b}`;
  if (rule === 'goals_ot' && g.ot === true) t += single ? ' (prórroga)' : ' prórroga';
  if (rule === 'goals_pen' && typeof g.pa === 'number' && typeof g.pb === 'number') t += ` (${g.pa}-${g.pb} pen.)`;
  return t;
}

/**
 * Texto de la serie (≤ 80): al mejor de 1 con números (y regla distinta de `win`), el del juego («13-9», «14-12»,
 * «3-2 (prórroga)», «2-2 (4-3 pen.)», «2-2», «98-91»); si no, «ganados1-ganados2» y, si cabe, el detalle entre
 * paréntesis: «2-1 (13-9 7-13 13-11)». W.O.: «W.O.».
 */
export function seriesText(rules: SeriesRules, score: Pick<SeriesScore, 'games' | 'sides' | 'wo'>): string {
  if (score.wo) return 'W.O.';
  const rule = GAMES[rules.game].scoring;
  const games = score.games ?? [];
  if (rules.bestOf === 1 && games.length === 1 && rule !== 'win') {
    const t = gameText(rules, games[0], true);
    if (t) return t;
  }
  const base = `${score.sides[0]}-${score.sides[1]}`;
  if (rule === 'win' || !games.length) return base;
  const parts = games.map((g) => gameText(rules, g, false));
  if (parts.some((p) => p === null)) return base;
  const full = `${base} (${parts.join(' ')})`;
  return [...full].length <= 80 ? full : base;
}

/** Lee `matches.score` de una serie. null si no tiene la forma (sin juegos, sin `bestOf` o sin `sides`). */
export function parseSeriesScore(v: unknown): SeriesScore | null {
  if (!isObj(v)) return null;
  if (!Array.isArray(v.games) || !BEST_OF.includes(v.bestOf as number)) return null;
  const pair = (x: unknown): [number, number] | null =>
    Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [x[0] as number, x[1] as number] : null;
  const sides = pair(v.sides);
  if (!sides) return null;
  const games: GameRecord[] = v.games.filter(isObj).map((g) => {
    const out: GameRecord = {};
    if (g.w === 1 || g.w === 2) out.w = g.w;
    for (const k of ['a', 'b', 'pa', 'pb'] as const) if (typeof g[k] === 'number') out[k] = g[k] as number;
    if (g.ot === true) out.ot = true;
    if (typeof g.map === 'string') out.map = g.map;
    return out;
  });
  const totals = isObj(v.totals) ? v.totals : {};
  const score: SeriesScore = {
    text: typeof v.text === 'string' ? v.text : '',
    sides,
    totals: { maps: pair(totals.maps) ?? [sides[0], sides[1]], points: pair(totals.points) ?? pointsOf(games) },
    games,
    bestOf: v.bestOf as BestOf,
  };
  if (Array.isArray(v.proof)) score.proof = v.proof.filter((p): p is string => typeof p === 'string');
  if (v.wo === true) score.wo = true;
  return score;
}

const samePair = (x: unknown, y: readonly [number, number]) => Array.isArray(x) && x.length === 2 && x[0] === y[0] && x[1] === y[1];

/**
 * El gemelo de `private.esp_series_ok(score, rules, final, winner)` (§2.3, pasos 1–8, menos que las fotos sean de la
 * liga): la forma del marcador, cada mapa con su regla, `sides`/`totals` que cuadran, `bestOf` de las reglas, el
 * texto ≤ 80, 0–3 capturas y, si es final, que `winner` sea el de la serie (null en el empate del FC). Un W.O. tiene
 * su forma fija; con `walkoverSide`, sus `sides` tienen que cuadrar con quien no vino.
 */
export function seriesScoreOk(rules: SeriesRules, score: unknown, final: boolean, winner: Side | null, walkoverSide?: 0 | 1 | 2 | null): boolean {
  if (!isObj(score)) return false;
  if (Object.keys(score).some((k) => !SCORE_KEYS.has(k))) return false;
  if (score.bestOf !== rules.bestOf) return false;
  if (typeof score.text !== 'string' || [...score.text].length > 80) return false;
  if (score.proof !== undefined && !(Array.isArray(score.proof) && score.proof.length <= 3 && score.proof.every((p) => typeof p === 'string' && UUID.test(p)))) return false;
  const totals = score.totals;
  if (!isObj(totals) || Object.keys(totals).some((k) => k !== 'maps' && k !== 'points')) return false;
  if (!Array.isArray(score.games)) return false;

  if (score.wo !== undefined) {
    if (score.wo !== true || score.text !== 'W.O.' || score.games.length !== 0) return false;
    const options: (0 | 1 | 2)[] = walkoverSide === 0 || walkoverSide === 1 || walkoverSide === 2 ? [walkoverSide] : [0, 1, 2];
    return options.some((x) => {
      const wo = walkoverScore(rules, x);
      return samePair(score.sides, wo.sides) && samePair(totals.maps, wo.totals.maps) && samePair(totals.points, [0, 0]);
    });
  }

  const games = score.games as GameRecord[];
  if (!games.length || games.length > rules.bestOf) return false;
  if (validateSeries(rules, games, { final }).length) return false;
  const sides = sidesOf(rules, games);
  if (!samePair(score.sides, sides) || !samePair(totals.maps, sides) || !samePair(totals.points, pointsOf(games))) return false;
  if (final) {
    const w = seriesWinner(rules, games);
    if (w === undefined || w !== winner) return false;
  }
  return true;
}

/**
 * Las reglas que van en `matches.rules` de una serie (§9.7): el juego, el mejor de, si hay empates (solo FC al mejor
 * de 1 en grupos o liga) y lo del juego (rondas para ganar en los de pelea, vidas en Smash).
 */
export function seriesRules(game: GameId, settings: TournamentSettings, bestOf: BestOf, stage: 'groups' | 'league' | 'playoffs' | 'bracket'): SeriesRules {
  const meta = GAMES[game];
  const rules: SeriesRules = {
    game,
    bestOf,
    draws: game === 'ea_fc' && !!settings.draws && bestOf === 1 && (stage === 'groups' || stage === 'league'),
  };
  if (meta.scoring === 'fight') {
    const rtw = settings.roundsToWin ?? meta.roundsToWin?.default;
    if (rtw) rules.roundsToWin = rtw;
  }
  if (meta.scoring === 'stocks') {
    const st = settings.stocks ?? meta.stocks?.default;
    if (st) rules.stocks = st;
  }
  return rules;
}
