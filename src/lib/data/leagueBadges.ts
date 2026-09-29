import { useMemo } from 'react';
import { uuidv7 } from '../db/ids';
import type { BadgeMakers, League, Member } from '../types';
import { badgeTags, type LeagueBadgeDesign } from './badges';
import { getUserId, invalidate, queryClient, remember, rpc, select, type Live } from './client';
import { tags } from './keys';
import { useTopic } from './topics';

/**
 * El creador de insignias de la liga (docs/insignias.md §5; 20260929000820_insignias_creador.sql): los diseños de
 * una liga, quién los tiene y lo que escriben las pantallas del creador. Todo por RPC; las lecturas directas solo
 * piden las columnas que la base deja ver (`note`, `awarded_by`, `revoked_by`, `revoke_reason` y `seen_at` NO: salen
 * por `league_badge_holders`).
 *
 * Tiempo real: la base avisa `badges` por `league:<liga>` al cambiar un diseño o un otorgamiento; topics.ts invalida
 * `badges:l:<liga>` (badgeTags.league), que es la etiqueta de todo lo de aquí.
 */

export type { BadgeMakers };

/** Cupo por insignia, periodo y división: Única 1, Selecta 3, Abierta 20 (con `byTeam`, equipos). */
export type LimitKind = 'unica' | 'selecta' | 'abierta';
/** `oculta` = escondido por el superadmin (moderación): solo lo ven los admins de la liga. */
export type DesignStatus = 'activa' | 'archivada' | 'oculta';
/** Un metal, el color de la liga (el del deporte) o un color libre (`color`). */
export type DesignPalette = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante' | 'liga' | 'color';

export const LIMIT_KINDS: readonly LimitKind[] = ['unica', 'selecta', 'abierta'];
export const LIMIT_OF: Readonly<Record<LimitKind, number>> = { unica: 1, selecta: 3, abierta: 20 };
export const DESIGN_PALETTES: readonly DesignPalette[] = ['bronce', 'plata', 'oro', 'platino', 'diamante', 'liga', 'color'];
/** Diseños activos por liga (y en total, con los archivados). */
export const MAX_ACTIVE_DESIGNS = 30;
export const MAX_DESIGNS = 100;
/** Jugadores por otorgamiento (una plantilla entera cabe). */
export const MAX_AWARD_PLAYERS = 30;
/** Quien la dio la puede deshacer por 24 h. */
export const UNDO_HOURS = 24;

/** Un diseño de la liga (`LeagueBadge` de la base). */
export interface LeagueBadge extends LeagueBadgeDesign {
  leagueId: string;
  template: string | null;
  limitKind: LimitKind;
  byTeam: boolean;
  status: DesignStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Cuántas veces se dio (también las retiradas). En la lista de la liga: las que ve quien mira. */
  given: number;
  /** Vigentes (las que la tienen hoy). */
  active: number;
  /** Ya se dio: solo cambian la descripción y el estado («Duplicar» para más). */
  locked: boolean;
  /** Reportes abiertos (solo los admins; null para los demás). */
  openReports: number | null;
}

/** Un otorgamiento leído directo (las columnas que se pueden leer). */
export interface MadeAward {
  id: string;
  badgeId: string;
  leagueId: string;
  playerId: string;
  teamId: string | null;
  period: string;
  division: string;
  awardedAt: string;
  revokedAt: string | null;
  hidden: boolean;
}

/** Los diseños de una liga y sus otorgamientos (más nuevos primero). */
export interface LeagueBadgesData {
  designs: LeagueBadge[];
  awards: MadeAward[];
}

/** Una fila de «quién la tiene» (`league_badge_holders`). Lo privado viene null si no eres admin. */
export interface BadgeHolder {
  id: string;
  playerId: string;
  playerName: string;
  /** Cuenta del jugador (null = sin cuenta). */
  userId: string | null;
  teamId: string | null;
  teamName: string | null;
  period: string;
  division: string;
  awardedAt: string;
  hidden: boolean;
  revokedAt: string | null;
  /** La nota: la ven el jugador y los admins. */
  note: string | null;
  awardedBy: string | null;
  awardedByName: string | null;
  revokedBy: string | null;
  /** Motivo privado de la retirada (dueño y admins). */
  revokeReason: string | null;
  /** Se puede deshacer (quien la dio, en 24 h) o retirar (el dueño). */
  canUndo: boolean;
}

export interface BadgeHolders {
  badge: LeagueBadge;
  /** Quien mira puede darla (tiene permiso y el diseño está activo). */
  canGive: boolean;
  awards: BadgeHolder[];
}

/** Lo que se manda a `save_league_badge` (snake_case; al editar, solo lo que cambia). */
export interface DesignPayload {
  template?: string | null;
  name?: string;
  description?: string;
  shape?: string;
  palette?: DesignPalette;
  color?: string | null;
  icon?: string;
  top_text?: string;
  period_text?: string;
  limit_kind?: LimitKind;
  by_team?: boolean;
  status?: 'activa' | 'archivada';
}

/** Un otorgamiento recién hecho (`award_league_badge`). */
export interface GivenAward {
  id: string;
  badgeId: string;
  leagueId: string;
  playerId: string;
  teamId: string | null;
  period: string;
  division: string;
  note: string;
  awardedAt: string;
}

export interface GiveResult {
  awards: GivenAward[];
  /** A cuántos jugadores con cuenta les llegó el aviso. */
  notified: number;
}

// ---------- Permisos ----------

/** «¿Quién diseña y da insignias?» (§5.1). `label` lo lee el dueño; `who`, los demás. */
export const BADGE_MAKERS_OPTIONS: readonly { value: BadgeMakers; label: string; hint: string; who: string }[] = [
  { value: 'owner', label: 'Solo yo', hint: 'Solo tú diseñas y das las insignias de la liga.', who: 'solo el dueño' },
  { value: 'admins', label: 'Yo y los admins', hint: 'Tú y los admins de la liga.', who: 'el dueño y los admins' },
  { value: 'chosen', label: 'Yo y los que yo elija', hint: 'Tú y los miembros que marques en Miembros con «Diseña insignias».', who: 'el dueño y los miembros que él elige' },
];

export const isBadgeMakers = (v: unknown): v is BadgeMakers => v === 'owner' || v === 'admins' || v === 'chosen';

/** La regla de la liga (sin dato: 'admins', el valor por defecto). */
export const badgeMakersOf = (league: Pick<League, 'badgeMakers'>): BadgeMakers => league.badgeMakers ?? 'admins';

/**
 * ¿La cuenta diseña y da insignias en esta liga? Lo mismo que `private.can_badges`: el dueño (o el superadmin),
 * los admins con 'admins', y los marcados con «Diseña insignias» con 'chosen'.
 */
export function canMakeBadges(ctx: { isOwner: boolean; member: Pick<Member, 'role' | 'badgeMaker'> | null; league: Pick<League, 'badgeMakers'> }): boolean {
  if (ctx.isOwner) return true;
  const m = ctx.member;
  if (!m) return false;
  const policy = badgeMakersOf(ctx.league);
  return (policy === 'admins' && m.role === 'admin') || (policy === 'chosen' && m.badgeMaker === true);
}

// ---------- De la base a la pantalla ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Un diseño de la RPC (camelCase: `LeagueBadge`) o de la tabla (snake_case); null si le falta lo básico. */
export function toLeagueBadge(raw: unknown): LeagueBadge | null {
  if (!isObj(raw)) return null;
  const r = raw;
  const id = str(r.id);
  const name = str(r.name).trim();
  const leagueId = str(r.leagueId ?? r.league_id);
  if (!id || !name || !leagueId) return null;
  const given = int(r.given);
  return {
    id,
    leagueId,
    name,
    description: str(r.description),
    shape: str(r.shape) || 'hex',
    palette: oneOf(str(r.palette), DESIGN_PALETTES, 'oro'),
    color: strOrNull(r.color),
    icon: str(r.icon),
    topText: str(r.topText ?? r.top_text),
    periodText: str(r.periodText ?? r.period_text),
    template: strOrNull(r.template),
    limitKind: oneOf(str(r.limitKind ?? r.limit_kind), LIMIT_KINDS, 'abierta'),
    byTeam: (r.byTeam ?? r.by_team) === true,
    status: oneOf(str(r.status), ['activa', 'archivada', 'oculta'] as const, 'activa'),
    createdBy: strOrNull(r.createdBy ?? r.created_by),
    createdAt: str(r.createdAt ?? r.created_at),
    updatedAt: str(r.updatedAt ?? r.updated_at),
    given,
    active: int(r.active),
    locked: r.locked === true || given > 0,
    openReports: typeof r.openReports === 'number' ? r.openReports : null,
  };
}

/** Una fila de `league_badge_awards`. */
export function madeAwardFromRow(r: Record<string, unknown>): MadeAward | null {
  const id = str(r.id);
  const badgeId = str(r.badge_id);
  const playerId = str(r.player_id);
  const awardedAt = str(r.awarded_at);
  if (!id || !badgeId || !playerId || !awardedAt) return null;
  return {
    id,
    badgeId,
    leagueId: str(r.league_id),
    playerId,
    teamId: strOrNull(r.team_id),
    period: str(r.period),
    division: str(r.division),
    awardedAt,
    revokedAt: strOrNull(r.revoked_at),
    hidden: r.hidden === true,
  };
}

/** Los diseños con cuántas veces se dieron según los otorgamientos que se ven. */
export function withCounts(designs: readonly LeagueBadge[], awards: readonly MadeAward[]): LeagueBadge[] {
  const given = new Map<string, number>();
  const active = new Map<string, number>();
  for (const a of awards) {
    given.set(a.badgeId, (given.get(a.badgeId) ?? 0) + 1);
    if (!a.revokedAt) active.set(a.badgeId, (active.get(a.badgeId) ?? 0) + 1);
  }
  return designs.map((d) => {
    const g = Math.max(d.given, given.get(d.id) ?? 0);
    return { ...d, given: g, active: active.get(d.id) ?? 0, locked: d.locked || g > 0 };
  });
}

export function toBadgeHolder(raw: unknown): BadgeHolder | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const playerId = str(raw.playerId);
  if (!id || !playerId) return null;
  return {
    id,
    playerId,
    playerName: str(raw.playerName).trim() || 'Jugador',
    userId: strOrNull(raw.userId),
    teamId: strOrNull(raw.teamId),
    teamName: strOrNull(raw.teamName),
    period: str(raw.period),
    division: str(raw.division),
    awardedAt: str(raw.awardedAt),
    hidden: raw.hidden === true,
    revokedAt: strOrNull(raw.revokedAt),
    note: strOrNull(raw.note),
    awardedBy: strOrNull(raw.awardedBy),
    awardedByName: strOrNull(raw.awardedByName),
    revokedBy: strOrNull(raw.revokedBy),
    revokeReason: strOrNull(raw.revokeReason),
    canUndo: raw.canUndo === true,
  };
}

export function toBadgeHolders(raw: unknown): BadgeHolders | null {
  if (!isObj(raw)) return null;
  const badge = toLeagueBadge(raw.badge);
  if (!badge) return null;
  return {
    badge,
    canGive: raw.canGive === true,
    awards: Array.isArray(raw.awards) ? raw.awards.map(toBadgeHolder).filter((a): a is BadgeHolder => a !== null) : [],
  };
}

function toGivenAward(raw: unknown): GivenAward | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    badgeId: str(raw.badgeId),
    leagueId: str(raw.leagueId),
    playerId: str(raw.playerId),
    teamId: strOrNull(raw.teamId),
    period: str(raw.period),
    division: str(raw.division),
    note: str(raw.note),
    awardedAt: str(raw.awardedAt),
  };
}

export function toGiveResult(raw: unknown): GiveResult {
  if (!isObj(raw)) return { awards: [], notified: 0 };
  return {
    awards: Array.isArray(raw.awards) ? raw.awards.map(toGivenAward).filter((a): a is GivenAward => a !== null) : [],
    notified: int(raw.notified),
  };
}

// ---------- Lecturas ----------

const DESIGN_COLUMNS =
  'id, league_id, template, name, description, shape, palette, color, icon, top_text, period_text, limit_kind, by_team, status, created_by, created_at, updated_at';
// Las que se pueden leer directo (la base niega note, awarded_by, revoked_by, revoke_reason y seen_at).
const AWARD_COLUMNS = 'id, badge_id, league_id, player_id, team_id, period, division, awarded_at, revoked_at, hidden';

export const leagueBadgeKeys = {
  league: (lid: string) => `badges:made:${lid}`,
  holders: (badgeId: string) => `badges:holders:${badgeId}`,
};

/** Los diseños y los otorgamientos que la cuenta puede ver en la liga (la RLS decide). */
export async function fetchLeagueBadges(lid: string): Promise<LeagueBadgesData> {
  const byLeague = { col: 'league_id', op: 'eq' as const, value: lid };
  const [designs, awards] = await Promise.all([
    select<Record<string, unknown>>({ table: 'league_badges', columns: DESIGN_COLUMNS, filters: [byLeague], order: [{ col: 'created_at', asc: false }] }),
    select<Record<string, unknown>>({ table: 'league_badge_awards', columns: AWARD_COLUMNS, filters: [byLeague], order: [{ col: 'awarded_at', asc: false }], limit: 1000 }),
  ]);
  const list = awards.map(madeAwardFromRow).filter((a): a is MadeAward => a !== null);
  return {
    designs: withCounts(
      designs.map(toLeagueBadge).filter((d): d is LeagueBadge => d !== null),
      list,
    ),
    awards: list,
  };
}

export async function fetchBadgeHolders(badgeId: string): Promise<BadgeHolders | null> {
  return toBadgeHolders(await rpc<unknown>('league_badge_holders', { p_badge: badgeId }));
}

const EMPTY: LeagueBadgesData = { designs: [], awards: [] };
const live = <T>(st: { data: T; loading: boolean; error: Error | null }): Live<T> => ({ data: st.data, loading: st.loading, error: st.error });

/** Los diseños de la liga y sus otorgamientos (`lid` null = no leer). Con cuenta, al día con el tiempo real de la liga. */
export function useLeagueBadges(lid: string | null | undefined): Live<LeagueBadgesData> {
  const signedIn = !!getUserId();
  useTopic(lid && signedIn ? `league:${lid}` : null, lid ?? null);
  const key = lid ? leagueBadgeKeys.league(lid) : null;
  if (key) remember(key, { kind: 'leagueMadeBadges', lid: lid! });
  const st = queryClient.useQuery<LeagueBadgesData>(key, () => fetchLeagueBadges(lid!), {
    initial: EMPTY,
    tags: lid ? [badgeTags.all, badgeTags.league(lid), tags.league(lid)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/** «Quién la tiene» de un diseño (necesita cuenta). null mientras carga o si no se ve. */
export function useBadgeHolders(badge: Pick<LeagueBadge, 'id' | 'leagueId'> | null | undefined): Live<BadgeHolders | null> {
  const signedIn = !!getUserId();
  const key = badge && signedIn ? leagueBadgeKeys.holders(badge.id) : null;
  if (key) remember(key, { kind: 'leagueBadgeHolders', lid: badge!.leagueId, id: badge!.id });
  const st = queryClient.useQuery<BadgeHolders | null>(key, () => fetchBadgeHolders(badge!.id), {
    initial: null,
    tags: badge ? [badgeTags.all, badgeTags.league(badge.leagueId)] : [],
    staleMs: 30_000,
    // Quién la dio, notas y motivos: no se guardan en el teléfono.
    persist: false,
  });
  return useMemo(() => live(st), [st]);
}

// ---------- Escrituras ----------

const afterBadges = (lid: string) => invalidate(badgeTags.league(lid));

/**
 * Crea (`id` null) o cambia un diseño. Al crear, el id sale del teléfono: si la respuesta se pierde y se reintenta,
 * el segundo intento no crea otro. Devuelve el diseño como quedó.
 */
export async function saveLeagueBadge(lid: string, id: string | null, design: DesignPayload): Promise<LeagueBadge> {
  try {
    const res = await rpc<unknown>('save_league_badge', { p_league: lid, p_id: id ?? uuidv7(), p_design: design });
    const saved = toLeagueBadge(res);
    if (!saved) throw new Error('save_league_badge: respuesta sin diseño');
    return saved;
  } finally {
    afterBadges(lid);
  }
}

/** Archivar (true) o volver a activar (false). Devuelve el estado. */
export async function archiveLeagueBadge(badge: Pick<LeagueBadge, 'id' | 'leagueId'>, archived: boolean): Promise<DesignStatus> {
  try {
    return oneOf(await rpc<string>('archive_league_badge', { p_id: badge.id, p_archived: archived }), ['activa', 'archivada', 'oculta'] as const, archived ? 'archivada' : 'activa');
  } finally {
    afterBadges(badge.leagueId);
  }
}

/** Borrar un diseño que nunca se dio ('ya_dada' si se dio: se archiva). */
export async function deleteLeagueBadge(badge: Pick<LeagueBadge, 'id' | 'leagueId'>): Promise<void> {
  try {
    await rpc('delete_league_badge', { p_id: badge.id });
  } finally {
    afterBadges(badge.leagueId);
  }
}

export interface GiveInput {
  badge: Pick<LeagueBadge, 'id' | 'leagueId'>;
  players: readonly string[];
  /** Con `byTeam`: el equipo o la pareja. */
  teamId?: string | null;
  /** null = el texto del diseño; '' = sin periodo. */
  period?: string | null;
  division?: string;
  note?: string;
  /** Avisarle (push) a los que tienen cuenta. */
  notify?: boolean;
}

/** Dar una insignia a uno o varios jugadores de la liga (1–30). */
export async function awardLeagueBadge(input: GiveInput): Promise<GiveResult> {
  try {
    const res = await rpc<unknown>('award_league_badge', {
      p_badge: input.badge.id,
      p_players: [...new Set(input.players)],
      p_team: input.teamId ?? null,
      p_period: input.period ?? null,
      p_division: input.division?.trim() || null,
      p_note: input.note?.trim() || null,
      p_notify: input.notify ?? true,
    });
    return toGiveResult(res);
  } finally {
    afterBadges(input.badge.leagueId);
  }
}

/** Deshacer (quien la dio, en 24 h) o retirar (el dueño). Sin aviso al jugador; el motivo es privado. */
export async function revokeLeagueBadgeAward(lid: string, awardIds: string | readonly string[], reason?: string | null): Promise<void> {
  const ids = typeof awardIds === 'string' ? [awardIds] : [...awardIds];
  try {
    for (const id of ids) await rpc('revoke_league_badge_award', { p_award: id, p_reason: reason?.trim() || null });
  } finally {
    afterBadges(lid);
  }
}

/** Reportar un diseño al superadmin (miembros; 5 reportes por día por cuenta). */
export async function reportLeagueBadge(badge: Pick<LeagueBadge, 'id'>, reason?: string | null): Promise<void> {
  await rpc('report_league_badge', { p_badge: badge.id, p_reason: reason?.trim().slice(0, 140) || null });
}

/** Superadmin: esconder (moderación) o dejar de esconder un diseño. Queda en la auditoría. */
export async function hideLeagueBadge(badge: Pick<LeagueBadge, 'id' | 'leagueId'>, hidden: boolean, note?: string | null): Promise<DesignStatus> {
  try {
    return oneOf(await rpc<string>('hide_league_badge', { p_id: badge.id, p_hidden: hidden, p_note: note?.trim() || null }), ['activa', 'archivada', 'oculta'] as const, hidden ? 'oculta' : 'archivada');
  } finally {
    afterBadges(badge.leagueId);
  }
}

/** Dueño: ¿quién diseña y da insignias? */
export async function setBadgePolicy(lid: string, policy: BadgeMakers): Promise<BadgeMakers> {
  try {
    const res = await rpc<string>('set_badge_policy', { p_league: lid, p_policy: policy });
    return isBadgeMakers(res) ? res : policy;
  } finally {
    invalidate(tags.league(lid), tags.leagues, badgeTags.league(lid));
  }
}

/** Dueño: «Diseña insignias» de un miembro (vale con la regla 'chosen'). */
export async function setMemberBadgeMaker(member: Pick<Member, 'leagueId' | 'uid'>, on: boolean): Promise<void> {
  try {
    await rpc('set_member_badge_maker', { p_league: member.leagueId, p_user: member.uid, p_on: on });
  } finally {
    invalidate(tags.leagueMembers(member.leagueId), badgeTags.league(member.leagueId));
    if (member.uid === getUserId()) invalidate(tags.members, tags.league(member.leagueId));
  }
}
