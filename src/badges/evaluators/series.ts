/**
 * Ayudas de los evaluadores de series (boliche, golf y natación) sobre el kit común (kit.ts): a quién evalúa el
 * trabajo, el primer resultado que llega a cada nivel (con lo extra que pide el nivel: B2, G2), el progreso hacia un
 * nivel que todavía no tiene, las hazañas que piden aval (§1.7.5) y el retiro de lo que ya no cumple, incluidas las
 * que esperan aval.
 */
import { levelDef, levelsReached, thresholdOf, type VariantArg } from '../catalog';
import type { SnapPlayer } from '../snapshot';
import type {
  AwardDecision,
  BadgeContext,
  BadgeDecision,
  BadgeDef,
  BadgeHolder,
  BadgeJob,
  BadgeSport,
  Level,
  LevelDef,
  ProgressDecision,
  ReviewDecision,
  RevokeDecision,
} from '../types';
import type { SportId } from '../../sports/types';
import { accountTargets, awardOf, holderKey, payloadPlayers, statusFor, type AccountTarget, type Kit } from './kit';

// ---------------------------------------------------------------------------------------------------------
// El trabajo

/** Una referencia del trabajo: 'entry:<id>' → `{ type: 'entry', id }`. */
export interface JobRef {
  type: string;
  id: string;
}

function parseRef(ref: unknown): JobRef | null {
  if (typeof ref !== 'string') return null;
  const i = ref.indexOf(':');
  return i > 0 && i < ref.length - 1 ? { type: ref.slice(0, i), id: ref.slice(i + 1) } : null;
}

/** `job.ref` y `payload.refs` (un borrado o un cambio que toca varias filas: 'entry:<id>', 'card:<id>'…). */
export function jobRefs(job: Pick<BadgeJob, 'ref' | 'payload'>): JobRef[] {
  const extra = Array.isArray(job.payload?.refs) ? (job.payload.refs as unknown[]) : [];
  return [job.ref, ...extra].map(parseRef).filter((r): r is JobRef => !!r);
}

/** Ids de las referencias de un tipo. */
export const refIds = (job: Pick<BadgeJob, 'ref' | 'payload'>, ...types: string[]): string[] =>
  jobRefs(job)
    .filter((r) => types.includes(r.type))
    .map((r) => r.id);

/** Eventos del trabajo: 'event:', 'meet:', 'round:' y las rondas de un torneo de golf 'gt:'. */
export function jobEvents(kit: Kit): Set<string> {
  const out = new Set(refIds(kit.job, 'event', 'meet', 'round'));
  for (const t of refIds(kit.job, 'gt')) for (const r of kit.snap.golf_rounds ?? []) if (r.tournament_id === t) out.add(r.event_id);
  return out;
}

/**
 * Jugadores que evalúa el trabajo: `snapshot.targets` si viene; si no, los de `payload.players`, los de la cuenta del
 * trabajo (`job.user_id`), todos los de la liga en el historial y los dueños de lo que dicen las referencias
 * (`entry:`, `card:`, `swim:`, `player:` y todos los de un `event:`, `meet:`, `round:` o `gt:`). De ellos viene el
 * historial completo en la foto.
 */
export function targetIds(kit: Kit): string[] {
  const { job, snap } = kit;
  if (snap.targets) return [...new Set(snap.targets)];
  const ids = new Set<string>(payloadPlayers(job));
  const players = snap.players ?? [];
  if (job.kind === 'historial') for (const p of players) if (!job.league_id || p.league_id === job.league_id) ids.add(p.id);
  if (job.user_id) for (const p of players) if (p.user_id === job.user_id) ids.add(p.id);
  for (const id of refIds(job, 'player')) ids.add(id);
  // 'entry:<id>' o 'entry:<id>:<g>' (un juego).
  const entries = new Set(refIds(job, 'entry').map((id) => id.split(':')[0]));
  const cards = new Set(refIds(job, 'card'));
  const swims = new Set(refIds(job, 'swim'));
  const events = jobEvents(kit);
  for (const e of snap.entries ?? []) if (entries.has(e.id) || events.has(e.event_id)) ids.add(e.player_id);
  for (const c of snap.golf_cards ?? []) if (cards.has(c.id) || events.has(c.event_id)) ids.add(c.player_id);
  for (const s of snap.swim_entries ?? []) if (swims.has(s.id) || events.has(s.event_id)) ids.add(s.player_id);
  return [...ids];
}

/** Jugadores del trabajo en ligas de un deporte. */
export function targetPlayers(kit: Kit, sport: SportId): SnapPlayer[] {
  const out: SnapPlayer[] = [];
  for (const id of targetIds(kit)) {
    const p = kit.players.get(id);
    if (p && kit.sportOf(p.league_id) === sport) out.push(p);
  }
  return out;
}

/** Dueños de las insignias de cuenta del trabajo en un deporte (la cuenta con todos sus jugadores, o el jugador). */
export const targetAccounts = (kit: Kit, sport: SportId): AccountTarget[] =>
  accountTargets(
    kit,
    targetPlayers(kit, sport).map((p) => p.id),
    [sport],
  );

// ---------------------------------------------------------------------------------------------------------
// Niveles

/** El primer elemento (en el orden dado) que llega a cada nivel. */
export interface Milestone<T> {
  level: Level;
  item: T;
}

/**
 * Recorre en orden y se queda con el primero que llega a cada nivel (un mismo elemento puede dar varios). `ok` pide
 * lo extra del nivel (p. ej. `strict`: B2 o G2). `variant` puede depender del elemento (9 hoyos).
 */
export function milestones<T>(
  def: BadgeDef,
  items: readonly T[],
  valueOf: (t: T) => number | null,
  opts: { variant?: VariantArg | ((t: T) => VariantArg); ok?: (t: T, level: LevelDef) => boolean } = {},
): Milestone<T>[] {
  const got = new Map<Level, T>();
  for (const t of items) {
    const v = valueOf(t);
    if (v == null || !Number.isFinite(v)) continue;
    const variant = typeof opts.variant === 'function' ? opts.variant(t) : opts.variant;
    for (const level of levelsReached(def, v, variant)) {
      if (got.has(level)) continue;
      if (opts.ok && !opts.ok(t, levelDef(def, level)!)) continue;
      got.set(level, t);
    }
    if (got.size === def.levels.length) break;
  }
  return [...got].map(([level, item]) => ({ level, item })).sort((a, b) => a.level - b.level);
}

/** La evidencia de un hito: fecha, referencias y lo que va en `context`. */
export interface Proof {
  date: string;
  refs: string[];
  values: Record<string, number | string | boolean | null>;
  context?: Omit<BadgeContext, 'v' | 'values'>;
}

/** Las filas de carrera (periodo '-') de unos hitos. */
export function careerAwards<T>(kit: Kit, def: BadgeDef, holder: BadgeHolder, sport: BadgeSport, hits: readonly Milestone<T>[], proof: (t: T, level: Level) => Proof): AwardDecision[] {
  return hits.map(({ level, item }) => {
    const p = proof(item, level);
    return awardOf(def, holder, sport, level, '-', statusFor(kit, p.date), p.refs, { ...p.context, values: p.values });
  });
}

/** Niveles que el dueño ya tiene activos (provisional, firme o en revisión). */
export function heldLevels(kit: Kit, holder: BadgeHolder, key: string, sport: BadgeSport): Set<Level> {
  return new Set(
    kit
      .existing(holder, key, sport)
      .filter((a) => a.status !== 'revocada')
      .map((a) => a.level),
  );
}

/**
 * Progreso hacia el primer nivel que no tiene (ni gana en esta corrida). `value` puede depender del nivel (lo que
 * vale para ese nivel: los estrictos solo cuentan lo verificado). Sin nivel que falte, `next_level = null` (borra).
 */
export function progressFor(
  kit: Kit,
  def: BadgeDef,
  holder: BadgeHolder,
  sport: BadgeSport,
  value: number | ((level: LevelDef) => number),
  opts: { variant?: VariantArg; gained?: readonly { level: Level }[] } = {},
): ProgressDecision {
  const held = heldLevels(kit, holder, def.key, sport);
  for (const g of opts.gained ?? []) held.add(g.level);
  const base = { kind: 'progress' as const, ...holder, badge_key: def.key, sport };
  for (const l of def.levels) {
    if (held.has(l.level)) continue;
    const target = thresholdOf(def, l.level, opts.variant ?? sport);
    if (target === undefined) break;
    const v = typeof value === 'function' ? value(l) : value;
    return { ...base, value: round2(v), target, next_level: l.level };
  }
  return { ...base, value: round2(typeof value === 'number' ? value : 0), target: 0, next_level: null };
}

export const round2 = (x: number): number => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------------------------------------
// Aval y retiro

/**
 * Quién puede avalar una hazaña (§1.7.5): owners y admins de la liga (y su dueño) que no sean el jugador ni compitan
 * en el mismo evento (su grupo o su tanda). Sin cuentas bloqueadas. Vacío = va a la cola del superadmin.
 */
export function reviewersFor(kit: Kit, leagueId: string, exclude: Iterable<string | null>): string[] {
  const skip = new Set([...exclude].filter((u): u is string => !!u));
  return [...kit.staff(leagueId)].filter((u) => !skip.has(u) && !kit.profiles.get(u)?.blocked_at).sort();
}

export function reviewOf(def: BadgeDef, holder: BadgeHolder, sport: BadgeSport, level: Level, periodKey: string, refs: readonly string[], context: Omit<BadgeContext, 'v'>, reviewers: string[]): ReviewDecision {
  return { kind: 'review', ...holder, badge_key: def.key, sport, level, period_key: periodKey, refs: [...new Set(refs)], context: { v: 1, ...context }, reviewers };
}

/**
 * Retira (`evidencia`) lo provisional o en revisión de un alcance que esta corrida ya no da ni manda a aval. Sin
 * `holders`, vale cualquier dueño (lo de un juego o una tarjeta borrados, que se reconoce por el periodo).
 */
export function staleRevokes(
  kit: Kit,
  produced: readonly BadgeDecision[],
  scope: { holders?: readonly BadgeHolder[]; keys: readonly string[]; sport: BadgeSport; period?: (periodKey: string) => boolean },
): RevokeDecision[] {
  const key = (h: string | null, k: string, s: string, l: number, p: string) => `${h}|${k}|${s}|${l}|${p}`;
  const given = new Set(
    produced
      .filter((d): d is AwardDecision | ReviewDecision => d.kind === 'award' || d.kind === 'review')
      .map((d) => key(holderKey(d), d.badge_key, d.sport, d.level, d.period_key)),
  );
  const holders = scope.holders ? new Set(scope.holders.map(holderKey)) : null;
  const keys = new Set(scope.keys);
  const out: RevokeDecision[] = [];
  for (const a of kit.snap.awards ?? []) {
    const h = a.player_id ?? a.user_id;
    if (!h || (holders && !holders.has(h)) || !keys.has(a.badge_key) || a.sport !== scope.sport) continue;
    if (a.status !== 'provisional' && a.status !== 'en_revision') continue;
    if (scope.period && !scope.period(a.period_key)) continue;
    if (given.has(key(h, a.badge_key, a.sport, a.level, a.period_key))) continue;
    out.push({ kind: 'revoke', player_id: a.player_id, user_id: a.user_id, league_id: a.league_id, badge_key: a.badge_key, sport: a.sport, level: a.level, period_key: a.period_key, reason: 'evidencia' });
  }
  return out;
}

/** Carrera: todo lo de las keys de cuenta del dueño (periodo '-'). */
export const always = (p: string): boolean => p === '-';
