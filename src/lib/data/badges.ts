import { useMemo } from 'react';
import { BackendError } from '../backend/types';
import type { BadgesAutoMode } from '../types';
import { getUserId, invalidate, queryClient, remember, rpc, select, type Live } from './client';
import { tags } from './keys';
import { useTopic } from './topics';

/**
 * Insignias (docs/insignias.md §3.9 y §6; 20260929001100_insignias.sql y …1110_insignias_motor.sql): lo que leen y
 * escriben las pantallas. La app nunca escribe `badge_awards` directo: todo por RPC.
 *
 * Lecturas:
 * - `profile_badges(p_user)`: la vitrina de una cuenta (la base aplica las reglas sociales: otra cuenta solo ve lo
 *   público; la propia ve también ocultas, en revisión y la línea de las retiradas que ya vio);
 * - `badge_notices()`: las insignias sin ver (aviso de desbloqueo) y las hazañas que la cuenta puede confirmar;
 * - `badge_progress` (RLS: solo las propias), `badge_stats` (rareza, todos) y `badge_awards` de una liga o de un
 *   jugador (RLS: provisionales o firmes, no ocultas, de ligas que se pueden ver).
 * Escrituras: set_featured_badges, set_badge_hidden, mark_badges_seen, set_badges_auto y review_badge.
 *
 * Tiempo real: la base avisa `badges` por `user:<cuenta>` (cambió algo de sus insignias) y por `league:<liga>`
 * (cambió algo que se ve en la liga); src/lib/data/topics.ts invalida las etiquetas de aquí (`badges:me`,
 * `badges:l:<liga>`).
 */

// ---------- Tipos ----------

export type BadgeStatus = 'provisional' | 'firme' | 'en_revision' | 'revocada';
/** `leagues.badges_auto`: insignias automáticas de la liga. */
export type { BadgesAutoMode };
export const BADGES_AUTO_MODES: readonly BadgesAutoMode[] = ['todas', 'sin_titulos', 'ninguna'];
export const isBadgesAutoMode = (v: unknown): v is BadgesAutoMode => typeof v === 'string' && (BADGES_AUTO_MODES as readonly string[]).includes(v);

/** Evidencia guardada con la insignia (`badge_awards.context`): `values`, `league`, `event`, `season`, `team`, `window`… */
export type BadgeAwardContext = Record<string, unknown>;

/** Una insignia otorgada tal como la ven las pantallas (horas en ISO). */
export interface BadgeAward {
  id: string;
  key: string;
  /** 'all' = de cuenta, sin deporte. */
  sport: string;
  /** 0 única, 1 bronce … 5 diamante (en los podios: 3 = 1.º). */
  level: number;
  periodKey: string;
  scope: 'cuenta' | 'liga';
  status: BadgeStatus;
  awardedAt: string;
  firmAt: string | null;
  leagueId: string | null;
  leagueName: string | null;
  playerId: string | null;
  context: BadgeAwardContext;
  /** Oculta por el dueño (o privada por defecto): solo la ve él (y los admins de su liga). */
  hidden: boolean;
  /** Cuándo vio el aviso de desbloqueo (solo en las propias). */
  seenAt: string | null;
  /** Llegó con la primera corrida del historial (un solo aviso para todas). */
  history: boolean;
}

/**
 * La vitrina de una cuenta (`profile_badges`). `featured`: ids de las destacadas que se ven, en su orden, de las dos
 * listas (20260929001300_insignias_perfil.sql): una automática está en `awards`; una de la liga, en `leagueAwards`.
 */
export interface ProfileBadges {
  userId: string;
  isMe: boolean;
  featured: string[];
  /** Cuáles de `featured` son de la liga (del creador o premios del torneo), en el mismo orden. */
  featuredLeague: string[];
  /**
   * La cuenta eligió alguna destacada que todavía vale, la vea o no quien mira. false: no eligió ninguna y salen solas
   * (docs/insignias.md §6.1); true con `featured` vacío: eligió, pero quien mira no ve ninguna (no sale nada).
   */
  hasChosen: boolean;
  awards: BadgeAward[];
  /** Había más de 1000: la lista viene cortada. */
  truncated: boolean;
  /** Las que le dieron sus ligas: del creador y premios del torneo (cuentan en el total y se pueden destacar). */
  leagueAwards: LeagueBadgeAward[];
}

/** Un diseño del creador de insignias de una liga, lo que hace falta para dibujarlo. */
export interface LeagueBadgeDesign {
  id: string;
  name: string;
  description: string;
  shape: string;
  /** 'bronce' … 'diamante', 'liga' (el color de la liga) o 'color' (con `color`). */
  palette: string;
  color: string | null;
  icon: string;
  topText: string;
  periodText: string;
}

/**
 * El premio del torneo de un otorgamiento (`private.league_award_prize`, docs/premios-torneo.md). Si la competencia
 * se borró, todo menos `slotId` y `verified` llega null.
 */
export interface LeagueBadgePrize {
  slotId: string;
  /** El servidor comprobó el orden al entregar (boliche, cuadros, playoffs). */
  verified: boolean;
  /** 1 a 3. */
  place: number | null;
  /** «1.er lugar». */
  placeLabel: string | null;
  category: 'equipo' | 'individual' | 'pareja' | null;
  /** «Individual (handicap)», «Parejas · Categoría A». */
  title: string | null;
  /** «Copa de Octubre», «Torneo del 12 oct». */
  competition: string | null;
}

/** Una insignia que le dio su liga (el creador, §5, o un premio del torneo). */
export interface LeagueBadgeAward {
  id: string;
  badgeId: string;
  leagueId: string;
  leagueName: string;
  sport: string | null;
  playerId: string;
  teamName: string | null;
  period: string;
  division: string;
  awardedAt: string;
  hidden: boolean;
  /** Nota de quien la dio (solo la ve el jugador). */
  note: string | null;
  seenAt: string | null;
  badge: LeagueBadgeDesign;
  /** El lugar premiado del torneo (null: la dio una persona con «Dar insignia»). */
  prizeSlotId: string | null;
  prize: LeagueBadgePrize | null;
  /**
   * Sale en el perfil para los demás (`profile_badges`; en el de otra cuenta, siempre). En el propio: no está oculta y
   * la liga ya la deja ver (6+ cuentas y 14+ días, o un premio con el orden verificado de una competencia que jugaron
   * 2+ cuentas; nunca en ligas con menores).
   */
  onProfile: boolean;
}

/** Una hazaña por confirmar (aval, §1.7.5) que la cuenta puede revisar. */
export interface BadgeReview {
  id: string;
  key: string;
  sport: string;
  level: number;
  periodKey: string;
  leagueId: string;
  leagueName: string;
  playerId: string;
  playerName: string;
  refs: string[];
  context: BadgeAwardContext;
  awardedAt: string;
  /** Lleva 14 días o más (el superadmin también la ve). */
  overdue: boolean;
}

/** `badge_notices`: las propias sin ver (más nuevas primero), cuántas son en total y las hazañas por confirmar. */
export interface BadgeNotices {
  awards: BadgeAward[];
  unseen: number;
  reviews: BadgeReview[];
  /** Las del creador sin ver («Liga Los Pinos te dio una insignia»). */
  leagueAwards: LeagueBadgeAward[];
}

/** Cuánto le falta a un dueño para el siguiente nivel (`badge_progress`, solo el propio). */
export interface BadgeProgress {
  key: string;
  sport: string;
  value: number;
  target: number;
  nextLevel: number;
  playerId: string | null;
  leagueId: string | null;
}

export type BadgeRarity = 'nueva' | 'comun' | 'poco_comun' | 'rara' | 'epica' | 'legendaria';

/** Rareza medida cada noche (`badge_stats`). */
export interface BadgeStat {
  key: string;
  sport: string;
  level: number;
  holders: number;
  base: number;
  pct: number;
  rarity: BadgeRarity;
}

// ---------- Claves y etiquetas ----------

export const badgeKeys = {
  profile: (uid: string) => `badges:profile:${uid}`,
  notices: 'badges:notices',
  progress: 'badges:progress',
  stats: 'badges:stats',
  /** Lo reciente de una liga (desde `since`, 'YYYY-MM-DD'). */
  league: (lid: string, since: string) => `badges:league:${lid}:${since}`,
  player: (lid: string, pid: string) => `badges:player:${lid}:${pid}`,
  event: (lid: string, eventId: string) => `badges:event:${lid}:${eventId}`,
  title: (lid: string) => `badges:title:${lid}`,
};

/** Etiquetas (topics.ts usa `badges:me` y `badges:l:<liga>` escritas a mano: no se puede importar de aquí). */
export const badgeTags = {
  all: 'badges',
  /** Lo de la cuenta que entró: su vitrina, sus avisos y su progreso. */
  mine: 'badges:me',
  user: (uid: string) => `badges:u:${uid}`,
  league: (lid: string) => `badges:l:${lid}`,
  stats: 'badges:stats',
};

// ---------- De la base a la pantalla ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const STATUSES: readonly BadgeStatus[] = ['provisional', 'firme', 'en_revision', 'revocada'];
const RARITIES: readonly BadgeRarity[] = ['nueva', 'comun', 'poco_comun', 'rara', 'epica', 'legendaria'];
const levelOf = (v: unknown) => Math.max(0, Math.min(5, Math.trunc(num(v))));

/** Una insignia de `profile_badges` o `badge_notices` (camelCase); null si le falta lo básico. */
export function toBadgeAward(raw: unknown): BadgeAward | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const key = str(raw.key);
  const awardedAt = str(raw.awardedAt);
  if (!id || !key || !awardedAt) return null;
  const context = isObj(raw.context) ? raw.context : {};
  const status = STATUSES.includes(raw.status as BadgeStatus) ? (raw.status as BadgeStatus) : 'provisional';
  return {
    id,
    key,
    sport: str(raw.sport) || 'all',
    level: levelOf(raw.level),
    periodKey: str(raw.periodKey) || '-',
    scope: raw.scope === 'liga' ? 'liga' : 'cuenta',
    status,
    awardedAt,
    firmAt: strOrNull(raw.firmAt),
    leagueId: strOrNull(raw.leagueId),
    leagueName: strOrNull(raw.leagueName),
    playerId: strOrNull(raw.playerId),
    context,
    hidden: raw.hidden === true,
    seenAt: strOrNull(raw.seenAt),
    history: raw.history === true || 'historial' in context,
  };
}

/** Una fila de `badge_awards` leída con `select` (snake_case). */
export function awardFromRow(r: Record<string, unknown>): BadgeAward | null {
  const context = isObj(r.context) ? r.context : {};
  const league = isObj(context.league) ? str(context.league.name) : '';
  return toBadgeAward({
    id: r.id,
    key: r.badge_key,
    sport: r.sport,
    level: r.level,
    periodKey: r.period_key,
    scope: r.user_id ? 'cuenta' : 'liga',
    status: r.status,
    awardedAt: r.awarded_at,
    firmAt: r.firm_at,
    leagueId: r.league_id,
    leagueName: league || null,
    playerId: r.player_id,
    context,
    hidden: r.hidden,
    seenAt: r.seen_at,
  });
}

const awardsOf = (list: unknown): BadgeAward[] => (Array.isArray(list) ? list.map(toBadgeAward).filter((a): a is BadgeAward => a !== null) : []);

const PRIZE_CATEGORIES: readonly NonNullable<LeagueBadgePrize['category']>[] = ['equipo', 'individual', 'pareja'];
const trimmed = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** El premio del torneo de un otorgamiento (`prize`); null si no es premio o le falta el lugar premiado. */
export function toLeagueBadgePrize(raw: unknown, slotId?: string | null): LeagueBadgePrize | null {
  const slot = (isObj(raw) ? str(raw.slotId) : '') || slotId || '';
  if (!slot) return null;
  const p = isObj(raw) ? raw : {};
  const place = Math.trunc(num(p.place, NaN));
  return {
    slotId: slot,
    verified: p.verified === true,
    place: place >= 1 && place <= 3 ? place : null,
    placeLabel: trimmed(p.placeLabel),
    category: PRIZE_CATEGORIES.includes(p.category as NonNullable<LeagueBadgePrize['category']>) ? (p.category as LeagueBadgePrize['category']) : null,
    title: trimmed(p.title),
    competition: trimmed(p.competition),
  };
}

/** Una insignia del creador o un premio del torneo (`private.league_award_json`); null si le falta lo básico. */
export function toLeagueBadgeAward(raw: unknown): LeagueBadgeAward | null {
  if (!isObj(raw) || !isObj(raw.badge)) return null;
  const b = raw.badge;
  const id = str(raw.id);
  const leagueId = str(raw.leagueId);
  const awardedAt = str(raw.awardedAt);
  const name = str(b.name).trim();
  if (!id || !leagueId || !awardedAt || !name) return null;
  const hidden = raw.hidden === true;
  const prize = toLeagueBadgePrize(raw.prize, strOrNull(raw.prizeSlotId));
  return {
    id,
    badgeId: str(raw.badgeId) || str(b.id),
    leagueId,
    leagueName: str(raw.leagueName).trim(),
    sport: strOrNull(raw.sport),
    playerId: str(raw.playerId),
    teamName: strOrNull(raw.teamName),
    period: str(raw.period),
    division: str(raw.division),
    awardedAt,
    hidden,
    note: strOrNull(raw.note),
    seenAt: strOrNull(raw.seenAt),
    badge: {
      id: str(b.id),
      name,
      description: str(b.description),
      shape: str(b.shape) || 'hex',
      palette: str(b.palette) || 'oro',
      color: strOrNull(b.color),
      icon: str(b.icon),
      topText: str(b.topText),
      periodText: str(b.periodText),
    },
    prizeSlotId: prize?.slotId ?? null,
    prize,
    // Solo `profile_badges` lo trae; en los avisos (o una base de antes) vale lo que dice `hidden`.
    onProfile: typeof raw.onProfile === 'boolean' ? raw.onProfile : !hidden,
  };
}

const leagueAwardsOf = (list: unknown): LeagueBadgeAward[] =>
  Array.isArray(list) ? list.map(toLeagueBadgeAward).filter((a): a is LeagueBadgeAward => a !== null) : [];

/** Lo que devuelve `profile_badges` (null = no existe o no se ve). Las destacadas, solo las que vienen en alguna lista. */
export function toProfileBadges(raw: unknown): ProfileBadges | null {
  if (!isObj(raw)) return null;
  const awards = awardsOf(raw.awards);
  const leagueAwards = leagueAwardsOf(raw.leagueAwards);
  const ids = new Set(awards.map((a) => a.id));
  const leagueIds = new Set(leagueAwards.map((a) => a.id));
  const featured = [...new Set(Array.isArray(raw.featured) ? raw.featured.map(str).filter((id) => id && (ids.has(id) || leagueIds.has(id))) : [])].slice(0, 3);
  return {
    userId: str(raw.userId),
    isMe: raw.isMe === true,
    featured,
    featuredLeague: featured.filter((id) => leagueIds.has(id)),
    // Una base de antes no lo trae: eligió si se ve alguna.
    hasChosen: raw.hasChosen === true || featured.length > 0,
    awards,
    truncated: raw.truncated === true,
    leagueAwards,
  };
}

export function toBadgeReview(raw: unknown): BadgeReview | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const key = str(raw.key);
  const leagueId = str(raw.leagueId);
  if (!id || !key || !leagueId) return null;
  return {
    id,
    key,
    sport: str(raw.sport) || 'all',
    level: levelOf(raw.level),
    periodKey: str(raw.periodKey) || '-',
    leagueId,
    leagueName: str(raw.leagueName),
    playerId: str(raw.playerId),
    playerName: str(raw.playerName).trim() || 'Un jugador',
    refs: Array.isArray(raw.refs) ? raw.refs.map(str).filter(Boolean) : [],
    context: isObj(raw.context) ? raw.context : {},
    awardedAt: str(raw.awardedAt),
    overdue: raw.overdue === true,
  };
}

export const EMPTY_NOTICES: BadgeNotices = { awards: [], unseen: 0, reviews: [], leagueAwards: [] };

/** Lo que devuelve `badge_notices`. */
export function toBadgeNotices(raw: unknown): BadgeNotices {
  if (!isObj(raw)) return EMPTY_NOTICES;
  const awards = awardsOf(raw.awards);
  const reviews = Array.isArray(raw.reviews) ? raw.reviews.map(toBadgeReview).filter((r): r is BadgeReview => r !== null) : [];
  return { awards, unseen: Math.max(awards.length, Math.trunc(num(raw.unseen))), reviews, leagueAwards: leagueAwardsOf(raw.leagueAwards) };
}

export function progressFromRow(r: Record<string, unknown>): BadgeProgress | null {
  const key = str(r.badge_key);
  const target = num(r.target, NaN);
  if (!key || !Number.isFinite(target)) return null;
  return { key, sport: str(r.sport) || 'all', value: num(r.value), target, nextLevel: levelOf(r.next_level), playerId: strOrNull(r.player_id), leagueId: strOrNull(r.league_id) };
}

export function statFromRow(r: Record<string, unknown>): BadgeStat | null {
  const key = str(r.badge_key);
  if (!key) return null;
  return {
    key,
    sport: str(r.sport) || 'all',
    level: levelOf(r.level),
    holders: num(r.holders),
    base: num(r.base),
    pct: num(r.pct),
    rarity: RARITIES.includes(r.rarity as BadgeRarity) ? (r.rarity as BadgeRarity) : 'nueva',
  };
}

// ---------- Lecturas ----------

const AWARD_COLUMNS = 'id, badge_key, sport, level, period_key, player_id, user_id, league_id, status, awarded_at, firm_at, context, hidden';
const VISIBLE: BadgeStatus[] = ['provisional', 'firme'];

export async function fetchProfileBadges(uid: string): Promise<ProfileBadges | null> {
  return toProfileBadges(await rpc<unknown>('profile_badges', { p_user: uid }));
}

export async function fetchBadgeNotices(limit = 50): Promise<BadgeNotices> {
  return toBadgeNotices(await rpc<unknown>('badge_notices', { p_limit: limit }));
}

/** Lo que se ganó en la liga desde `since` ('YYYY-MM-DD'): provisionales o firmes y no ocultas, más nuevas primero. */
export async function fetchLeagueAwards(lid: string, since: string): Promise<BadgeAward[]> {
  const rows = await select<Record<string, unknown>>({
    table: 'badge_awards',
    columns: AWARD_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'awarded_at', op: 'gte', value: `${since}T00:00:00Z` },
      { col: 'status', op: 'in', value: VISIBLE },
      { col: 'hidden', op: 'eq', value: false },
    ],
    order: [{ col: 'awarded_at', asc: false }],
    limit: 400,
  });
  return rows.map(awardFromRow).filter((a): a is BadgeAward => a !== null);
}

/** Las de un jugador en su liga (ámbito liga y, si no tiene cuenta, sus copias de respaldo): más nuevas primero. */
export async function fetchPlayerAwards(lid: string, playerId: string): Promise<BadgeAward[]> {
  const rows = await select<Record<string, unknown>>({
    table: 'badge_awards',
    columns: AWARD_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'player_id', op: 'eq', value: playerId },
      { col: 'status', op: 'in', value: VISIBLE },
      { col: 'hidden', op: 'eq', value: false },
    ],
    order: [{ col: 'awarded_at', asc: false }],
    limit: 500,
  });
  return rows.map(awardFromRow).filter((a): a is BadgeAward => a !== null);
}

/**
 * Lo que se dio al cerrar un evento (fecha 'YYYY-MM-DD'): las filas de la liga dadas desde ese día y hasta 60 días
 * después (el podio sale a los 3 días); la pantalla se queda con las de ese evento (`eventAwards` de logic.ts).
 */
export async function fetchEventAwards(lid: string, date: string): Promise<BadgeAward[]> {
  const start = Date.parse(`${date}T00:00:00Z`);
  const until = new Date((Number.isFinite(start) ? start : Date.now()) + 60 * 86400_000).toISOString();
  const rows = await select<Record<string, unknown>>({
    table: 'badge_awards',
    columns: AWARD_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'awarded_at', op: 'gte', value: `${date}T00:00:00Z` },
      { col: 'awarded_at', op: 'lte', value: until },
      { col: 'status', op: 'in', value: VISIBLE },
      { col: 'hidden', op: 'eq', value: false },
    ],
    order: [{ col: 'awarded_at', asc: false }],
    limit: 500,
  });
  return rows.map(awardFromRow).filter((a): a is BadgeAward => a !== null);
}

/** Los títulos de temporada (oro de `season_podium`) de la liga, más nuevos primero: el escudo «Título vigente». */
export async function fetchTitleAwards(lid: string): Promise<BadgeAward[]> {
  const rows = await select<Record<string, unknown>>({
    table: 'badge_awards',
    columns: AWARD_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'badge_key', op: 'eq', value: 'season_podium' },
      { col: 'level', op: 'eq', value: 3 },
      { col: 'status', op: 'in', value: VISIBLE },
      { col: 'hidden', op: 'eq', value: false },
    ],
    order: [{ col: 'awarded_at', asc: false }],
    limit: 30,
  });
  return rows.map(awardFromRow).filter((a): a is BadgeAward => a !== null);
}

const live = <T>(st: { data: T; loading: boolean; error: Error | null }): Live<T> => ({ data: st.data, loading: st.loading, error: st.error });

/** La vitrina de una cuenta (null mientras carga, si no existe o si no se ve: mirar `loading`). */
export function useProfileBadges(uid: string | null | undefined): Live<ProfileBadges | null> {
  const me = getUserId();
  const key = uid && me ? badgeKeys.profile(uid) : null;
  if (key) remember(key, { kind: 'profileBadges', id: uid! });
  const st = queryClient.useQuery<ProfileBadges | null>(key, () => fetchProfileBadges(uid!), {
    initial: null,
    tags: uid ? [badgeTags.all, badgeTags.user(uid), ...(uid === me ? [badgeTags.mine] : [])] : [],
    staleMs: 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/**
 * Avisos de insignias de la cuenta: las que no vio (aviso de desbloqueo y Avisos) y las hazañas que puede confirmar.
 * Se vuelven a leer con el tiempo real de la cuenta (`user:<id>`), al volver a la app y cada 5 minutos.
 */
export function useBadgeNotices(): Live<BadgeNotices> {
  const uid = getUserId();
  useTopic(uid ? `user:${uid}` : null);
  const key = uid ? badgeKeys.notices : null;
  if (key) remember(key, { kind: 'badgeNotices' });
  const st = queryClient.useQuery<BadgeNotices>(key, () => fetchBadgeNotices(), {
    initial: EMPTY_NOTICES,
    tags: [badgeTags.all, badgeTags.mine],
    staleMs: 30_000,
    pollMs: 5 * 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/** El progreso propio hacia el siguiente nivel (solo el dueño lo ve; `enabled` = es tu vitrina). */
export function useBadgeProgress(enabled: boolean): Live<BadgeProgress[]> {
  const uid = getUserId();
  const key = enabled && uid ? badgeKeys.progress : null;
  if (key) remember(key, { kind: 'badgeProgress' });
  const st = queryClient.useQuery<BadgeProgress[]>(
    key,
    async () =>
      (await select<Record<string, unknown>>({ table: 'badge_progress', columns: 'player_id, user_id, league_id, badge_key, sport, value, target, next_level' }))
        .map(progressFromRow)
        .filter((p): p is BadgeProgress => p !== null),
    { initial: [], tags: [badgeTags.all, badgeTags.mine], staleMs: 60_000 },
  );
  return useMemo(() => live(st), [st]);
}

/** La rareza medida (se calcula de noche: se guarda medio día). */
export function useBadgeStats(enabled: boolean): Live<BadgeStat[]> {
  const key = enabled ? badgeKeys.stats : null;
  if (key) remember(key, { kind: 'badgeStats' });
  const st = queryClient.useQuery<BadgeStat[]>(
    key,
    async () =>
      (await select<Record<string, unknown>>({ table: 'badge_stats', columns: 'badge_key, sport, level, holders, base, pct, rarity' }))
        .map(statFromRow)
        .filter((s): s is BadgeStat => s !== null),
    { initial: [], tags: [badgeTags.all, badgeTags.stats], staleMs: 12 * 3600_000 },
  );
  return useMemo(() => live(st), [st]);
}

/** 'YYYY-MM-DD' de hace `days` días (en UTC: la clave cambia una vez al día). */
export function daysAgo(days: number, now: number = Date.now()): string {
  return new Date(now - days * 86400_000).toISOString().slice(0, 10);
}

/**
 * Lo que se ganó en la liga en los últimos 16 días («Premios de octubre» del día 3 al 9 y «Campeones» por 14 días).
 * `lid` null = no leer. Con cuenta escucha `league:<id>` (la liga ya lo hace; es el mismo canal).
 */
export function useLeagueAwards(lid: string | null | undefined, now: number = Date.now()): Live<BadgeAward[]> {
  const since = daysAgo(16, now);
  const signedIn = !!getUserId();
  useTopic(lid && signedIn ? `league:${lid}` : null, lid ?? null);
  const key = lid ? badgeKeys.league(lid, since) : null;
  if (key) remember(key, { kind: 'leagueBadges', lid: lid! });
  const st = queryClient.useQuery<BadgeAward[]>(key, () => fetchLeagueAwards(lid!, since), {
    initial: [],
    tags: lid ? [badgeTags.all, badgeTags.league(lid), tags.league(lid)] : [],
    staleMs: 5 * 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/** Las insignias de un jugador en su liga (página del jugador). */
export function usePlayerAwards(lid: string | null | undefined, playerId: string | null | undefined): Live<BadgeAward[]> {
  const key = lid && playerId ? badgeKeys.player(lid, playerId) : null;
  if (key) remember(key, { kind: 'playerBadges', lid: lid!, playerId: playerId! });
  const st = queryClient.useQuery<BadgeAward[]>(key, () => fetchPlayerAwards(lid!, playerId!), {
    initial: [],
    tags: lid ? [badgeTags.all, badgeTags.league(lid), tags.league(lid)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/** Lo que se dio en un evento (su página: el podio con sus insignias). `lid` o `eventId` null = no leer. */
export function useEventAwards(lid: string | null | undefined, eventId: string | null | undefined, date: string | null | undefined): Live<BadgeAward[]> {
  const key = lid && eventId && date ? badgeKeys.event(lid, eventId) : null;
  if (key) remember(key, { kind: 'eventBadges', lid: lid!, eventId: eventId! });
  const st = queryClient.useQuery<BadgeAward[]>(key, () => fetchEventAwards(lid!, date!), {
    initial: [],
    tags: lid ? [badgeTags.all, badgeTags.league(lid), tags.league(lid)] : [],
    staleMs: 5 * 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/** Los títulos de temporada de la liga (el escudo «Título vigente» en la tabla). */
export function useTitleAwards(lid: string | null | undefined): Live<BadgeAward[]> {
  const key = lid ? badgeKeys.title(lid) : null;
  if (key) remember(key, { kind: 'titleBadges', lid: lid! });
  const st = queryClient.useQuery<BadgeAward[]>(key, () => fetchTitleAwards(lid!), {
    initial: [],
    tags: lid ? [badgeTags.all, badgeTags.league(lid), tags.league(lid)] : [],
    staleMs: 30 * 60_000,
  });
  return useMemo(() => live(st), [st]);
}

// ---------- Escrituras ----------

function needUser(): string {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta para cambiar tus insignias.', 'auth', 'session_not_found');
  return me;
}

/** Cambia la vitrina propia en la caché (cambio optimista). */
function patchMine(me: string, fn: (p: ProfileBadges) => ProfileBadges) {
  const key = badgeKeys.profile(me);
  const old = queryClient.getQueryData<ProfileBadges | null>(key);
  if (old) queryClient.setQueryData<ProfileBadges | null>(key, fn(old));
}

function patchNotices(fn: (n: BadgeNotices) => BadgeNotices) {
  const old = queryClient.getQueryData<BadgeNotices>(badgeKeys.notices);
  if (old) queryClient.setQueryData<BadgeNotices>(badgeKeys.notices, fn(old));
}

/**
 * Las destacadas de la vitrina con cuáles de ellas son de la liga (las que están en `leagueAwards`). En la propia, las
 * que se ven son las elegidas: sin ninguna, salen solas (lo confirma la base al volver a leer).
 */
const withFeatured = (p: ProfileBadges, featured: string[]): ProfileBadges => {
  const league = new Set(p.leagueAwards.map((a) => a.id));
  return { ...p, featured, featuredLeague: featured.filter((id) => league.has(id)), hasChosen: featured.length > 0 };
};

/**
 * Hasta 3 destacadas debajo del nombre, en ese orden ([] las quita): automáticas o de la liga (del creador o premios
 * del torneo). Devuelve cómo quedaron.
 */
export async function setFeaturedBadges(ids: readonly string[]): Promise<string[]> {
  const me = needUser();
  const list = [...new Set(ids)].slice(0, 3);
  patchMine(me, (p) => withFeatured(p, list));
  try {
    const res = await rpc<string[] | null>('set_featured_badges', { p_ids: list });
    const saved = Array.isArray(res) ? res.map(str).filter(Boolean) : list;
    patchMine(me, (p) => withFeatured(p, saved));
    return saved;
  } finally {
    invalidate(badgeTags.user(me));
  }
}

/** Ocultar (true) o mostrar (false) una insignia propia en el perfil. Oculta, deja de ser destacada. */
export async function setBadgeHidden(award: Pick<BadgeAward, 'id' | 'leagueId'>, hidden: boolean): Promise<boolean> {
  const me = needUser();
  patchMine(me, (p) =>
    withFeatured(
      { ...p, awards: p.awards.map((a) => (a.id === award.id ? { ...a, hidden } : a)) },
      hidden ? p.featured.filter((id) => id !== award.id) : p.featured,
    ),
  );
  patchNotices((n) => ({ ...n, awards: n.awards.map((a) => (a.id === award.id ? { ...a, hidden } : a)) }));
  try {
    return await rpc<boolean>('set_badge_hidden', { p_award: award.id, p_hidden: hidden });
  } finally {
    invalidate(badgeTags.user(me), ...(award.leagueId ? [badgeTags.league(award.leagueId)] : []));
  }
}

/**
 * Ya vio el aviso de desbloqueo de esas insignias (en ningún teléfono vuelve a salir). De 50 en 50, como pide la
 * base. Devuelve cuántas marcó.
 */
export async function markBadgesSeen(ids: readonly string[]): Promise<number> {
  const me = needUser();
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return 0;
  const set = new Set(list);
  const now = new Date().toISOString();
  patchNotices((n) => {
    const awards = n.awards.filter((a) => !set.has(a.id));
    return { ...n, awards, unseen: Math.max(awards.length, n.unseen - (n.awards.length - awards.length)) };
  });
  patchMine(me, (p) => ({ ...p, awards: p.awards.map((a) => (set.has(a.id) && !a.seenAt ? { ...a, seenAt: now } : a)) }));
  let n = 0;
  try {
    for (let i = 0; i < list.length; i += 50) n += (await rpc<number>('mark_badges_seen', { p_ids: list.slice(i, i + 50) })) ?? 0;
    return n;
  } finally {
    invalidate(badgeTags.mine);
  }
}

/** Ya vio el aviso de estas insignias de sus ligas (el creador). De 50 en 50. */
export async function markLeagueBadgesSeen(ids: readonly string[]): Promise<number> {
  const me = needUser();
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return 0;
  const set = new Set(list);
  const now = new Date().toISOString();
  patchNotices((n) => ({ ...n, leagueAwards: n.leagueAwards.filter((a) => !set.has(a.id)) }));
  patchMine(me, (p) => ({ ...p, leagueAwards: p.leagueAwards.map((a) => (set.has(a.id) && !a.seenAt ? { ...a, seenAt: now } : a)) }));
  let n = 0;
  try {
    for (let i = 0; i < list.length; i += 50) n += (await rpc<number>('mark_league_badges_seen', { p_ids: list.slice(i, i + 50) })) ?? 0;
    return n;
  } finally {
    invalidate(badgeTags.mine);
  }
}

/**
 * Ocultar (true) o mostrar (false) en tu perfil una insignia que te dio tu liga. Oculta, deja de ser destacada (la
 * base la saca sola); al mostrarla, si los demás la ven lo dice la base al volver a leer.
 */
export async function setLeagueBadgeHidden(award: Pick<LeagueBadgeAward, 'id' | 'leagueId'>, hidden: boolean): Promise<boolean> {
  const me = needUser();
  patchMine(me, (p) =>
    withFeatured(
      { ...p, leagueAwards: p.leagueAwards.map((a) => (a.id === award.id ? { ...a, hidden, onProfile: hidden ? false : a.onProfile } : a)) },
      hidden ? p.featured.filter((id) => id !== award.id) : p.featured,
    ),
  );
  try {
    return await rpc<boolean>('set_league_badge_hidden', { p_award: award.id, p_hidden: hidden });
  } finally {
    invalidate(badgeTags.user(me), badgeTags.league(award.leagueId));
  }
}

/** Reportar una insignia automática al superadmin (miembro de la liga; 5 por día). Motivo opcional (hasta 140). */
export async function reportBadge(awardId: string, reason?: string | null): Promise<void> {
  needUser();
  await rpc('report_badge', { p_award: awardId, p_reason: reason?.trim().slice(0, 140) || null });
}

/** Dueño: insignias automáticas de la liga. */
export async function setBadgesAuto(lid: string, mode: BadgesAutoMode): Promise<BadgesAutoMode> {
  try {
    const res = await rpc<string>('set_badges_auto', { p_league: lid, p_mode: mode });
    return isBadgesAutoMode(res) ? res : mode;
  } finally {
    invalidate(tags.league(lid), tags.leagues);
  }
}

/** Aval: confirmar (true) o «No se pudo confirmar» (false) una hazaña. Nota opcional (hasta 140). Devuelve el estado. */
export async function reviewBadge(review: Pick<BadgeReview, 'id' | 'leagueId'>, ok: boolean, note?: string | null): Promise<BadgeStatus> {
  needUser();
  const clean = note?.trim().slice(0, 140) || null;
  const res = await rpc<string>('review_badge', { p_award: review.id, p_ok: ok, p_note: clean });
  patchNotices((n) => ({ ...n, reviews: n.reviews.filter((r) => r.id !== review.id) }));
  invalidate(badgeTags.mine, badgeTags.league(review.leagueId));
  return STATUSES.includes(res as BadgeStatus) ? (res as BadgeStatus) : ok ? 'firme' : 'revocada';
}
