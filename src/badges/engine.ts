/**
 * Motor de las insignias automáticas (docs/insignias.md §3.1): `evaluate(job, snapshot, now)` corre, sin E/S, los
 * evaluadores que tocan a ese tipo de trabajo (`EVALUATOR_JOBS` en catalog.ts) y devuelve las decisiones que aplica
 * `private.badge_apply` en una sola transacción.
 *
 * Cada familia exporta un `EvaluatorSet` (id del catálogo → uno o varios evaluadores; un id compartido como `debut`
 * o `event_podium` lleva uno por deporte, y cada uno solo mira lo suyo) y se suma a `FAMILIES`. Después, el motor
 * asienta lo que salió (`settle`):
 * - descarta lo que el catálogo no permite (key o deporte que no existen, `badges_auto` de la liga, ligas con
 *   menores, las que piden cuenta) y retira la provisional que ya existía de eso;
 * - no repite lo que ya está igual (idempotencia): dar una fila provisional con la misma evidencia o una firme, pedir
 *   aval de una que ya lo espera, el mismo progreso, o retirar lo que ya no está activo. Una provisional con otra
 *   evidencia sí sale (badge_apply actualiza `refs` y `context`), igual que una provisional que ahora pide aval
 *   (pasa a `en_revision`) o una en revisión que ya no lo pide (vuelve a provisional);
 * - nunca revive lo que se retiró por aval rechazado o por fraude (solo vuelve lo que se retiró por evidencia);
 * - si un evaluador da una fila y otro la retira, gana dar.
 * `decide` (lo que corre la Edge Function) suma antes las adopciones (`adoptions`): las copias de respaldo de
 * jugadores que ahora tienen cuenta pasan a la cuenta (§1.6).
 */
import { allowedBy, badgeDef, evaluatorsFor } from './catalog';
import { BOWLING_EVALUATORS } from './evaluators/bowling';
import { ACCOUNT_EVALUATORS, PERIOD_EVALUATORS, RACKET_EVALUATORS, TEAM_EVALUATORS } from './evaluators/families';
import { GOLF_EVALUATORS } from './evaluators/golf';
import type { Evaluator } from './evaluators/kit';
import { SWIM_EVALUATORS } from './evaluators/swim';
import type { BadgeSnapshot } from './snapshot';
import type {
  AdoptDecision,
  AwardDecision,
  BadgeAwardRow,
  BadgeDecision,
  BadgeJob,
  EngineDecision,
  EvaluatorId,
  ProgressDecision,
  ReviewDecision,
  RevokeDecision,
} from './types';
import type { SportId } from '../sports/types';

/** Lo que aporta una familia: sus evaluadores por id del catálogo. */
export type EvaluatorSet = Partial<Record<EvaluatorId, Evaluator | readonly Evaluator[]>>;

/** Las familias del motor. Una familia nueva se suma aquí. */
const FAMILIES: readonly EvaluatorSet[] = [
  BOWLING_EVALUATORS,
  GOLF_EVALUATORS,
  SWIM_EVALUATORS,
  RACKET_EVALUATORS,
  TEAM_EVALUATORS,
  PERIOD_EVALUATORS,
  ACCOUNT_EVALUATORS,
];

/** Los evaluadores de un id, en el orden de las familias. */
export function evaluatorsOf(id: EvaluatorId, families: readonly EvaluatorSet[] = FAMILIES): Evaluator[] {
  const out: Evaluator[] = [];
  for (const f of families) {
    const e = f[id];
    if (!e) continue;
    if (typeof e === 'function') out.push(e);
    else out.push(...(e as readonly Evaluator[]));
  }
  return out;
}

/**
 * Evalúa un trabajo de la cola con su foto. `now` en milisegundos o ISO (por defecto, la hora de la foto). Los
 * trabajos `aviso` los resuelve SQL solo (`badge_notices`).
 */
export function evaluate(job: BadgeJob, snapshot: BadgeSnapshot, now: number | string = snapshot.now, families: readonly EvaluatorSet[] = FAMILIES): BadgeDecision[] {
  if (job.kind === 'aviso') return [];
  const t = typeof now === 'number' ? now : Date.parse(now);
  const raw: BadgeDecision[] = [];
  for (const id of evaluatorsFor(job.kind)) for (const run of evaluatorsOf(id, families)) raw.push(...run(job, snapshot, t));
  return settle(snapshot, raw);
}

/**
 * Todo lo que decide el motor para un trabajo (lo que corre la Edge Function, edge.ts): `evaluate` más las
 * adopciones de las copias de respaldo (§1.6). Las adopciones van primero: así lo que se le da a la cuenta encuentra
 * la fila ya movida y no se avisa dos veces.
 */
export function decide(job: BadgeJob, snapshot: BadgeSnapshot, now: number | string = snapshot.now, families: readonly EvaluatorSet[] = FAMILIES): EngineDecision[] {
  if (job.kind === 'aviso') return [];
  const settled = evaluate(job, snapshot, now, families);
  const { adopt, drop, cleanup } = adoptions(snapshot, settled);
  return [...adopt, ...settled.filter((d) => d.kind === 'progress' || !drop.has(rowKey(d))), ...cleanup];
}

// ---------------------------------------------------------------------------------------------------------
// Copias de respaldo que pasan a la cuenta (§1.6)

/**
 * Las copias de respaldo de la foto cuyo jugador ya tiene cuenta: filas de insignias de ámbito cuenta guardadas en
 * el jugador (`player_id` + `league_id`). Cada una pasa a la cuenta (`adopt`) y su progreso de jugador se borra
 * (la cuenta lleva el suyo). Si el jugador se vinculó él mismo (`players[].verified_only`, §1.6), solo
 * cuenta lo verificado: pasa solo lo que la cuenta ya tiene o gana en esta corrida (se juntan); las demás
 * provisionales se retiran y las firmes se quedan en el jugador. `drop` son las filas del jugador que ya no hay que
 * tocar (se movieron o se retiran aquí).
 */
export function adoptions(
  snapshot: BadgeSnapshot,
  settled: readonly BadgeDecision[],
): { adopt: AdoptDecision[]; drop: Set<string>; cleanup: BadgeDecision[] } {
  const players = new Map((snapshot.players ?? []).map((p) => [p.id, p]));
  // La foto marca a cada jugador que se vinculó él mismo (badge_snapshot, en todos los trabajos).
  const verifiedOnly = (p: string) => players.get(p)?.verified_only === true;
  const accountOf = (playerId: string | null, leagueId: string | null, key: string): string | null => {
    if (!playerId || !leagueId || badgeDef(key)?.scope !== 'cuenta') return null;
    const p = players.get(playerId);
    return p?.user_id && p.league_id === leagueId ? p.user_id : null;
  };
  const accountRows = new Set<string>();
  for (const a of snapshot.awards ?? []) if (a.user_id && a.status !== 'revocada') accountRows.add(rowKey(a));
  for (const d of settled) if ((d.kind === 'award' || d.kind === 'review') && d.user_id) accountRows.add(rowKey(d));

  const adopt: AdoptDecision[] = [];
  const drop = new Set<string>();
  const cleanup: BadgeDecision[] = [];
  for (const a of snapshot.awards ?? []) {
    const user = accountOf(a.player_id, a.league_id, a.badge_key);
    if (!user || !a.player_id || !a.league_id) continue;
    const merges = accountRows.has(rowKey({ ...a, player_id: null, user_id: user }));
    if (verifiedOnly(a.player_id) && !merges) {
      if (a.status === 'provisional' || a.status === 'en_revision') {
        cleanup.push(revokeOf(a));
        drop.add(rowKey(a));
      }
      continue;
    }
    adopt.push({
      kind: 'adopt',
      badge_key: a.badge_key,
      sport: a.sport,
      level: a.level,
      period_key: a.period_key,
      player_id: a.player_id,
      league_id: a.league_id,
      user_id: user,
    });
    drop.add(rowKey(a));
  }
  for (const p of snapshot.progress ?? []) {
    if (!accountOf(p.player_id, p.league_id, p.badge_key)) continue;
    cleanup.push({ kind: 'progress', player_id: p.player_id, user_id: null, league_id: p.league_id, badge_key: p.badge_key, sport: p.sport, value: p.value, target: p.target, next_level: null });
  }
  return { adopt, drop, cleanup };
}

// ---------------------------------------------------------------------------------------------------------
// Asentar

type RowKeyed = Pick<AwardDecision, 'player_id' | 'user_id' | 'badge_key' | 'sport' | 'level' | 'period_key'>;

/** La clave única de `badge_awards` (dueño, key, deporte, nivel, periodo). */
export const rowKey = (d: RowKeyed): string => `${d.player_id ?? d.user_id ?? ''}|${d.badge_key}|${d.sport}|${d.level}|${d.period_key}`;
const progressKey = (d: Pick<ProgressDecision, 'player_id' | 'user_id' | 'badge_key' | 'sport'>): string => `${d.player_id ?? d.user_id ?? ''}|${d.badge_key}|${d.sport}`;

const sameRefs = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((r, i) => r === y[i]);
};

const revokeOf = (a: BadgeAwardRow): RevokeDecision => ({
  kind: 'revoke',
  player_id: a.player_id,
  user_id: a.user_id,
  league_id: a.league_id,
  badge_key: a.badge_key,
  sport: a.sport,
  level: a.level,
  period_key: a.period_key,
  reason: 'evidencia',
});

/** ¿El catálogo deja dar esta fila? (key y deporte, liga para las de liga, `badges_auto`, menores, cuenta). */
export function permitted(d: AwardDecision | ReviewDecision, leagues: ReadonlyMap<string, NonNullable<BadgeSnapshot['leagues']>[number]>): boolean {
  const def = badgeDef(d.badge_key);
  if (!def) return false;
  if (def.sports === 'all' ? d.sport !== 'all' : d.sport === 'all' || !def.sports.includes(d.sport as SportId)) return false;
  if (def.accountOnly && !d.user_id) return false;
  if (!d.player_id && !d.user_id) return false;
  const league = d.league_id ? leagues.get(d.league_id) : undefined;
  if (def.scope === 'liga' && (!league || !d.player_id)) return false;
  if (league && def.noMinors && league.has_minors) return false;
  return !league || allowedBy(def, league.badges_auto);
}

/**
 * Deja solo lo que cambia algo frente a lo que ya existe en la foto (`snapshot.awards` y `snapshot.progress`): en
 * orden, dar y pedir aval, retirar, y el progreso.
 */
export function settle(snapshot: BadgeSnapshot, raw: readonly BadgeDecision[]): BadgeDecision[] {
  const leagues = new Map((snapshot.leagues ?? []).map((l) => [l.id, l]));
  const rows = new Map((snapshot.awards ?? []).map((a) => [rowKey(a), a]));
  const progressRows = new Map((snapshot.progress ?? []).map((p) => [progressKey(p), p]));
  const gives = new Map<string, AwardDecision | ReviewDecision>();
  const revokes = new Map<string, RevokeDecision>();
  const progress = new Map<string, ProgressDecision>();

  for (const d of raw) {
    if (d.kind === 'progress') {
      progress.set(progressKey(d), d);
      continue;
    }
    const k = rowKey(d);
    if (d.kind === 'revoke') {
      if (!revokes.has(k)) revokes.set(k, d);
      continue;
    }
    if (!permitted(d, leagues)) {
      const row = rows.get(k);
      if (row && !revokes.has(k)) revokes.set(k, revokeOf(row));
      continue;
    }
    if (!gives.has(k)) gives.set(k, d);
  }

  const out: BadgeDecision[] = [];
  for (const [k, d] of gives) {
    revokes.delete(k);
    const row = rows.get(k);
    if (!row) out.push(d);
    else if (row.status === 'revocada') {
      if (row.revoke_reason === 'evidencia') out.push(d);
    } else if (row.status === 'provisional') {
      // La misma insignia con otra evidencia (otro juego de 200): badge_apply actualiza refs y context. Si ahora
      // pide aval (el águila corregida que resultó albatros), pasa a en revisión.
      if (d.kind === 'review' || !sameRefs(row.refs, d.refs) || row.context?.alt !== d.context.alt) out.push(d);
    } else if (row.status === 'en_revision' && d.kind === 'award') {
      // Ya no pide aval (el albatros corregido a águila): vuelve a provisional con su evidencia.
      out.push(d);
    }
  }
  for (const [k, r] of revokes) {
    const row = rows.get(k);
    if (row && (row.status === 'provisional' || row.status === 'en_revision')) out.push(r);
  }
  for (const [k, p] of progress) {
    const row = progressRows.get(k);
    if (p.next_level === null) {
      if (row) out.push(p);
    } else if (!row || row.value !== p.value || row.target !== p.target || row.next_level !== p.next_level) out.push(p);
  }
  return out;
}
