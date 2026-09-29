/**
 * Solo pruebas: trabajos, fotos con una liga real y un `badge_apply` de mentira para probar los evaluadores de punta
 * a punta (dar, revocar, reactivar e idempotencia).
 */
import { rowKey } from '../engine';
import { addMonths } from '../rules/periods';
import type { BadgeSnapshot, LeagueMonthActivity, SnapLeague, SnapMember, SnapPlayer, SnapProfile } from '../snapshot';
import { snapLeague, snapMember, snapPlayer, snapProfile } from '../testkit';
import type { AwardDecision, BadgeAwardRow, BadgeDecision, BadgeJob, BadgeProgressRow, JobKind, ReviewDecision } from '../types';

export const NOW = '2026-11-20T16:00:00.000Z';

let jobIds = 0;
export const job = (kind: JobKind, over: Partial<BadgeJob> = {}): BadgeJob => ({
  id: ++jobIds,
  kind,
  league_id: 'L',
  user_id: null,
  ref: '',
  payload: {},
  run_after: NOW,
  attempts: 0,
  created_at: NOW,
  ...over,
});

/** Cuentas de relleno que hacen real una liga (4 establecidas con actividad en cada mes). */
export const FILLER = ['u-f1', 'u-f2', 'u-f3', 'u-f4'];

/** Meses de actividad de las cuentas de relleno en una liga, de `from` a `to`. */
export function realMonths(leagueId: string, from = '2026-01', to = '2026-12', users = FILLER): LeagueMonthActivity[] {
  const out: LeagueMonthActivity[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push({ league_id: leagueId, month: m, users: [...users], players: users.map((u) => `p-${u}`) });
  return out;
}

export interface World {
  leagues?: SnapLeague[];
  players?: SnapPlayer[];
  profiles?: SnapProfile[];
  members?: SnapMember[];
  /** Ligas reales (por defecto, todas las de `leagues` todo 2026). */
  real?: string[];
}

/**
 * Una foto con una liga real y lo que se le pase. Por defecto: liga 'L' del deporte dado, dueño 'u-owner', admin
 * 'u-admin', y las cuentas de relleno que la hacen real.
 */
export function world(sport: SnapLeague['sport'], parts: Partial<BadgeSnapshot> & World = {}): Omit<BadgeSnapshot, 'job'> {
  const leagues = parts.leagues ?? [snapLeague('L', { sport })];
  const users = new Set<string>([...FILLER, 'u-owner', 'u-admin']);
  for (const p of parts.players ?? []) if (p.user_id) users.add(p.user_id);
  const profiles = parts.profiles ?? [...users].map((u) => snapProfile(u, { created_at: '2025-06-01T12:00:00.000Z' }));
  const members =
    parts.members ??
    leagues.flatMap((l) => [
      snapMember(l.id, 'u-owner', 'owner'),
      snapMember(l.id, 'u-admin', 'admin'),
      ...(parts.players ?? []).filter((p) => p.league_id === l.id && p.user_id).map((p) => snapMember(l.id, p.user_id!, 'member')),
    ]);
  const { real = leagues.map((l) => l.id), ...rest } = parts;
  return {
    v: 1,
    now: NOW,
    league_months: real.flatMap((id) => realMonths(id, '2025-01', '2026-12')),
    ...rest,
    leagues,
    profiles,
    members,
  };
}

export const snap = (j: BadgeJob, w: Omit<BadgeSnapshot, 'job'>): BadgeSnapshot => ({ ...w, job: j });

export const player = snapPlayer;

// ---------------------------------------------------------------------------------------------------------
// Un badge_apply de mentira

/**
 * Aplica las decisiones a la foto como lo haría `private.badge_apply`: inserta o reactiva (award, review), actualiza
 * la evidencia de una provisional, revoca por evidencia y escribe o borra el progreso. Devuelve una foto nueva.
 */
export function apply(s: BadgeSnapshot, decisions: readonly BadgeDecision[], at = s.now): BadgeSnapshot {
  const rows = new Map((s.awards ?? []).map((a) => [rowKey(a), { ...a }]));
  const progress = new Map((s.progress ?? []).map((p) => [`${p.player_id ?? p.user_id}|${p.badge_key}|${p.sport}`, { ...p }]));
  let n = rows.size;
  for (const d of decisions) {
    if (d.kind === 'progress') {
      const k = `${d.player_id ?? d.user_id}|${d.badge_key}|${d.sport}`;
      if (d.next_level === null) progress.delete(k);
      else
        progress.set(k, {
          player_id: d.player_id,
          user_id: d.user_id,
          league_id: d.league_id,
          badge_key: d.badge_key,
          sport: d.sport,
          value: d.value,
          target: d.target,
          next_level: d.next_level,
          updated_at: at,
        } satisfies BadgeProgressRow);
      continue;
    }
    const k = rowKey(d);
    const row = rows.get(k);
    if (d.kind === 'revoke') {
      if (row && (row.status === 'provisional' || row.status === 'en_revision')) Object.assign(row, { status: 'revocada', revoked_at: at, revoke_reason: 'evidencia' });
      continue;
    }
    const status = d.kind === 'review' ? 'en_revision' : d.status;
    if (row) Object.assign(row, { status, refs: d.refs, context: d.context, revoked_at: null, revoke_reason: null });
    else
      rows.set(k, {
        id: `a${++n}`,
        badge_key: d.badge_key,
        sport: d.sport,
        level: d.level,
        period_key: d.period_key,
        player_id: d.player_id,
        user_id: d.user_id,
        league_id: d.league_id,
        status,
        awarded_at: at,
        firm_at: null,
        refs: d.refs,
        context: d.context,
        hidden: d.kind === 'award' && !!d.hidden,
        seen_at: null,
        notified_at: null,
        revoked_at: null,
        revoke_reason: null,
        updated_at: at,
      } satisfies BadgeAwardRow);
  }
  return { ...s, awards: [...rows.values()], progress: [...progress.values()] };
}

/** Solo las filas que se dan o se mandan a aval, en forma corta: 'key:level:period@holder'. */
export const gives = (ds: readonly BadgeDecision[]): string[] =>
  ds
    .filter((d) => d.kind === 'award' || d.kind === 'review')
    .map((d) => `${d.badge_key}:${d.level}:${d.period_key}@${d.player_id ?? d.user_id}`)
    .sort();

export const revokes = (ds: readonly BadgeDecision[]): string[] =>
  ds
    .filter((d) => d.kind === 'revoke')
    .map((d) => `${d.badge_key}:${d.level}:${d.period_key}@${d.player_id ?? d.user_id}`)
    .sort();

/** Las decisiones de una key: las de ese tipo o, sin tipo, las que dan o piden aval. */
export function of(ds: readonly BadgeDecision[], key: string): (AwardDecision | ReviewDecision)[];
export function of<K extends BadgeDecision['kind']>(ds: readonly BadgeDecision[], key: string, kind: K): Extract<BadgeDecision, { kind: K }>[];
export function of(ds: readonly BadgeDecision[], key: string, kind?: BadgeDecision['kind']): BadgeDecision[] {
  return ds.filter((d) => d.badge_key === key && (kind ? d.kind === kind : d.kind === 'award' || d.kind === 'review'));
}

/** Una fila ya otorgada, para armar lo que existe antes de un trabajo. */
export const row = (over: Partial<BadgeAwardRow> & Pick<BadgeAwardRow, 'badge_key' | 'sport' | 'level' | 'period_key'>): BadgeAwardRow => ({
  id: `r-${over.badge_key}-${over.level}-${over.period_key}`,
  player_id: null,
  user_id: null,
  league_id: null,
  status: 'provisional',
  awarded_at: '2026-11-15T12:00:00.000Z',
  firm_at: '2026-11-22T12:00:00.000Z',
  refs: [],
  context: { v: 1 },
  hidden: false,
  seen_at: null,
  notified_at: null,
  revoked_at: null,
  revoke_reason: null,
  updated_at: '2026-11-15T12:00:00.000Z',
  ...over,
});
