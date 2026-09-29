/**
 * Torneo por categorías (A/B/C…): en cada categoría, grupos en zigzag por nivel (todos contra todos), cruces
 * 1A–2B y cuadro de eliminación con pases directos para los mejores sembrados y 3.er lugar opcional. También
 * sirve sin grupos (cuadro directo). Puro: src/sports/formats (groups, knockout, roundRobin).
 */
import { isFinal, type Match } from '../../../../lib/data/matchCore';
import type { MatchDraft } from '../../../../lib/data/matches';
import {
  createBracket,
  crossGroups,
  groupLetter,
  roundName,
  roundRobin,
  setWinner as setBracketWinner,
  snakeGroups,
  type Bracket,
  type BracketMatch,
  type Qualifier,
} from '../../../../sports/formats';
import type { RacketSport } from '../../../../sports/racket';
import type { StandingRow } from '../../../../sports/types';
import type { ScheduleEntrant } from './league';
import { entrantKey, pairStandings, type PointsScheme } from './results';
import { parseSignup, signupJson, type SignupSettings } from './signup';

export interface TourneyCategory {
  /** Id corto para las claves del cuadro: letras o números (A, B, C, 1…). */
  id: string;
  name: string;
  /** Parejas (o jugadores) en orden de siembra: la mejor primero. */
  pairs: string[];
  /** Grupos (0 = cuadro directo). */
  groups: number;
  /** Cuántos pasan de cada grupo al cuadro. */
  perGroup: number;
  thirdPlace: boolean;
  /** Los grupos ya armados (ids por grupo). */
  groupsOf?: string[][];
  /** La siembra del cuadro ya armado. */
  seeds?: string[];
}

export interface TourneyConfig {
  v: 1;
  format: 'torneo';
  categories: TourneyCategory[];
  courts: string[];
  points: PointsScheme;
  /** Inscripción «Me apunto» (cupo por categoría, fecha límite y lista de espera). Sin ella, la lista la arma el admin. */
  signup?: SignupSettings;
}

export const CATEGORY_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown, max = 64) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x).slice(0, max) : []);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;

export function parseTourneyConfig(raw: unknown): TourneyConfig {
  const c = isObj(raw) ? raw : {};
  const seen = new Set<string>();
  const categories: TourneyCategory[] = [];
  for (const x of Array.isArray(c.categories) ? c.categories : []) {
    if (!isObj(x)) continue;
    const id = typeof x.id === 'string' && /^[A-Za-z0-9]{1,6}$/.test(x.id) ? x.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const cat: TourneyCategory = {
      id,
      name: typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 24) : `Categoría ${id}`,
      pairs: [...new Set(strList(x.pairs))],
      groups: int(x.groups, 0, 16, 0),
      perGroup: int(x.perGroup, 1, 4, 2),
      thirdPlace: x.thirdPlace === true,
    };
    if (Array.isArray(x.groupsOf)) cat.groupsOf = (x.groupsOf as unknown[]).map((g) => strList(g));
    if (Array.isArray(x.seeds)) cat.seeds = strList(x.seeds);
    categories.push(cat);
  }
  const out: TourneyConfig = {
    v: 1,
    format: 'torneo',
    categories,
    courts: strList(c.courts, 12).map((x) => x.slice(0, 40)),
    points: c.points === '2-0' ? '2-0' : 'standard',
  };
  const signup = parseSignup(c.signup);
  if (signup) out.signup = signup;
  return out;
}

/** Lo que se guarda. La inscripción va con el `rev` que se leyó (si alguien se apuntó mientras tanto, no se pierde). */
export const tourneyConfigJson = (c: TourneyConfig): Record<string, unknown> => {
  const { signup, ...rest } = c;
  return { ...rest, categories: c.categories.map((x) => ({ ...x })), ...(signup ? { signup: signupJson(signup) } : {}) };
};

/** El torneo ya empezó: alguna categoría armó sus grupos o su cuadro. */
export const tourneyStarted = (c: Pick<TourneyConfig, 'categories'>) => c.categories.some((x) => !!x.groupsOf?.length || !!x.seeds?.length);

export const newCategory = (id: string, name = `Categoría ${id}`): TourneyCategory => ({ id, name, pairs: [], groups: 0, perGroup: 2, thirdPlace: true });

/** Grupos recomendados: de 3 a 4 por grupo. */
export const suggestGroups = (n: number) => (n < 6 ? 0 : Math.max(2, Math.round(n / 4)));

// ---------------------------------------------------------------------------------------------------------
// Grupos

export const groupStage = (cat: Pick<TourneyCategory, 'name'>, g: number) => `${cat.name} · Grupo ${groupLetter(g)}`;

/** Reparte en zigzag por la siembra (1→A 2→B 3→B 4→A con 2 grupos). */
export const makeGroups = (cat: TourneyCategory): string[][] => (cat.groups > 0 ? snakeGroups(cat.pairs, Math.min(cat.groups, Math.floor(cat.pairs.length / 2) || 1)) : []);

const sideDraft = (e: ScheduleEntrant | undefined, id: string, side: 1 | 2, seed?: number | null) => ({
  side,
  teamId: e?.team === false ? null : id,
  players: (e?.players ?? []).map((playerId) => ({ playerId })),
  ...(seed != null ? { seed } : {}),
});

/** Partidos de los grupos (todos contra todos en cada grupo; la ronda = la fecha del grupo). */
export function groupDrafts(
  cat: TourneyCategory,
  groups: readonly (readonly string[])[],
  entrants: ReadonlyMap<string, ScheduleEntrant>,
  opts: { eventId: string; rules?: Record<string, unknown> },
): MatchDraft[] {
  const out: MatchDraft[] = [];
  groups.forEach((ids, g) => {
    for (const r of roundRobin(ids)) {
      for (const f of r.matches) {
        out.push({
          eventId: opts.eventId,
          round: r.round,
          stage: groupStage(cat, g),
          format: 'sets',
          ...(opts.rules ? { rules: opts.rules } : {}),
          sides: [sideDraft(entrants.get(f.home), f.home, 1), sideDraft(entrants.get(f.away), f.away, 2)],
        });
      }
    }
  });
  return out;
}

/** Partidos de un grupo (por su fase). */
export const groupMatches = (cat: TourneyCategory, g: number, matches: readonly Match[]) =>
  matches.filter((m) => m.stage === groupStage(cat, g) && !m.bracketKey && m.status !== 'void');

/** Tabla de cada grupo. */
export function groupTables(sport: RacketSport, cat: TourneyCategory, matches: readonly Match[], opts: { scheme?: PointsScheme; now?: number } = {}): StandingRow[][] {
  return (cat.groupsOf ?? []).map((ids, g) => pairStandings(sport, ids, groupMatches(cat, g, matches), { scheme: opts.scheme, lotSeed: `${cat.id}${g}`, now: opts.now }));
}

/**
 * Todos los partidos de los grupos cuentan (confirmados, W.O. o con las 48 h). `missing` = partidos que deberían
 * estar (todos contra todos en cada grupo) y no están en la base (se crearon a medias o se borraron). Un partido
 * anulado sí está (no cuenta en la tabla ni queda pendiente): así lo ve también «Crear los que faltan», que no lo
 * vuelve a crear; cada cruce se cuenta una vez aunque tenga un anulado y otro rehecho.
 */
export function groupsDone(cat: TourneyCategory, matches: readonly Match[], now = Date.now()): { done: boolean; pending: number; total: number; missing: number } {
  const groups = cat.groupsOf ?? [];
  const list = groups.flatMap((_, g) => groupMatches(cat, g, matches));
  const expected = groups.reduce((t, ids) => t + (ids.length * (ids.length - 1)) / 2, 0);
  const pending = list.filter((m) => !isFinal(m, now)).length;
  const present = new Set(
    groups.flatMap((_, g) =>
      matches.filter((m) => m.stage === groupStage(cat, g) && !m.bracketKey).map((m) => `${g}|${[entrantKey(m.sides[0]), entrantKey(m.sides[1])].sort().join('|')}`),
    ),
  );
  const missing = Math.max(0, expected - present.size);
  return { done: expected > 0 && pending === 0 && missing === 0, pending, total: list.length, missing };
}

/** Clasificados en orden de siembra (1A, 1B, …, 2A…) con los cruces que alejan a los del mismo grupo. */
export function qualifiers(sport: RacketSport, cat: TourneyCategory, matches: readonly Match[], opts: { scheme?: PointsScheme; now?: number } = {}): Qualifier[] {
  const tables = groupTables(sport, cat, matches, opts);
  return crossGroups(
    tables.map((t) => t.map((r) => r.id)),
    cat.perGroup,
  );
}

// ---------------------------------------------------------------------------------------------------------
// Cuadro

export const bracketKeyOf = (cat: Pick<TourneyCategory, 'id'>, key: string) => `${cat.id}-${key}`;

export function bracketStage(cat: Pick<TourneyCategory, 'name'>, bm: Pick<BracketMatch, 'round' | 'thirdPlace'>, rounds: number): string {
  return `${cat.name} · ${bm.thirdPlace ? '3.er lugar' : roundName(bm.round, rounds)}`;
}

/** Partido de la base de ese lugar del cuadro (sin los anulados). */
export const matchAt = (cat: TourneyCategory, key: string, matches: readonly Match[]) =>
  matches.find((m) => m.bracketKey === bracketKeyOf(cat, key) && m.status !== 'void');

/** Ganador (id de la pareja o del jugador) de un partido que ya cuenta. */
export function winnerId(m: Match | undefined, now = Date.now()): string | null {
  if (!m || !isFinal(m, now)) return null;
  const w = m.winner ?? (m.walkoverSide === 1 ? 2 : m.walkoverSide === 2 ? 1 : null);
  return w ? entrantKey(m.sides[w - 1]) : null;
}

/** El cuadro de la categoría con los ganadores que ya cuentan (null si todavía no se armó). */
export function categoryBracket(cat: TourneyCategory, matches: readonly Match[], now = Date.now()): Bracket | null {
  const seeds = cat.seeds ?? [];
  if (seeds.length < 2) return null;
  let b = createBracket(seeds, { thirdPlace: cat.thirdPlace && seeds.length >= 4 });
  for (let r = 1; r <= b.rounds; r++) {
    for (const key of b.matches.filter((m) => m.round === r && !m.thirdPlace && !m.bye).map((m) => m.key)) {
      b = applyWinner(b, cat, key, matches, now);
    }
  }
  if (b.thirdPlace) b = applyWinner(b, cat, 'P3', matches, now);
  return b;
}

function applyWinner(b: Bracket, cat: TourneyCategory, key: string, matches: readonly Match[], now: number): Bracket {
  const bm = b.matches.find((m) => m.key === key);
  const w = winnerId(matchAt(cat, key, matches), now);
  if (!bm || !w || !bm.side1 || !bm.side2 || (w !== bm.side1 && w !== bm.side2)) return b;
  return setBracketWinner(b, key, w);
}

export interface BracketTodo {
  /** Lugares del cuadro con sus dos lados sabidos y sin partido en la base. */
  create: BracketMatch[];
  /** Partidos creados cuyos lados cambiaron (se corrigió un resultado) y todavía no empezaron. */
  update: { match: Match; bm: BracketMatch }[];
}

/** Qué falta pasar a la base para que el cuadro se pueda jugar. */
export function bracketTodo(cat: TourneyCategory, bracket: Bracket, matches: readonly Match[]): BracketTodo {
  const out: BracketTodo = { create: [], update: [] };
  for (const bm of bracket.matches) {
    if (bm.bye || !bm.side1 || !bm.side2) continue;
    const m = matchAt(cat, bm.key, matches);
    if (!m) out.create.push(bm);
    else if ((entrantKey(m.sides[0]) !== bm.side1 || entrantKey(m.sides[1]) !== bm.side2) && m.status === 'scheduled' && m.seq === 0) out.update.push({ match: m, bm });
  }
  return out;
}

/** Los dos lados de un lugar del cuadro para create_matches / set_match_sides. */
export function bracketSides(bm: BracketMatch, entrants: ReadonlyMap<string, ScheduleEntrant>) {
  return [sideDraft(entrants.get(bm.side1!), bm.side1!, 1, bm.seed1), sideDraft(entrants.get(bm.side2!), bm.side2!, 2, bm.seed2)] as const;
}

/** Partidos nuevos del cuadro (ronda 100 + la del cuadro, para que salgan después de los grupos). */
export function bracketDrafts(
  cat: TourneyCategory,
  bracket: Bracket,
  list: readonly BracketMatch[],
  entrants: ReadonlyMap<string, ScheduleEntrant>,
  opts: { eventId: string; rules?: Record<string, unknown> },
): MatchDraft[] {
  return list.map((bm) => {
    const [a, b] = bracketSides(bm, entrants);
    return {
      eventId: opts.eventId,
      round: 100 + bm.round,
      stage: bracketStage(cat, bm, bracket.rounds),
      bracketKey: bracketKeyOf(cat, bm.key),
      format: 'sets',
      ...(opts.rules ? { rules: opts.rules } : {}),
      sides: [a, b],
    };
  });
}
