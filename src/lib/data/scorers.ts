import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import { safeAppPath } from '../notifications';
import type { LeagueKind, Member, Visibility } from '../types';
import { getUserId, invalidate, queryClient, remember, rpc, type Live } from './client';
import { peopleTags } from './follows';
import type { InviteResult, InviteResultStatus, InviteSendResult } from './invites';
import { tags } from './keys';
import { afterJoinLeague, joinLeagueClaim } from './leagues';
import { setMemberScorer } from './members';

/**
 * Anotadores del torneo (20260929001400_anotadores.sql, docs/anotadores.md). El permiso es de la liga
 * (`league_members.is_scorer`); el dueño o un admin lo da desde el botón «Anotadores» de cada torneo de tres formas:
 * - a un miembro, directo (set_member_scorer: le llega «Ahora puedes anotar en …»);
 * - a una cuenta por su @usuario (invite_scorers): una invitación de anotador («Ana te invitó a anotar en …») que
 *   al aceptarla lo deja en la liga con el permiso y sin jugador (salvo que también lo invitaran a jugar);
 * - con el link para anotar (/anotar/<código>, create_/rotate_/revoke_scorer_link): su propio código, vence a los
 *   7 días, 20 usos; quien entra queda anotador sin jugador, también en una liga privada (join_as_scorer).
 *
 * Quien entró solo para anotar (`Member.scorerOnly`) no tiene jugador y nadie se lo crea solo; «También juego»
 * (playToo) se lo crea.
 *
 * RPC: set_member_scorer, invite_scorers, scorer_access, create_scorer_link, rotate_scorer_link, revoke_scorer_link,
 * scorer_link_preview (también sin cuenta) y join_as_scorer. Tiempo real: 'scorers' en 'league:<liga>' y
 * 'user:<cuenta>' (src/lib/data/topics.ts). Las horas van en texto ISO.
 */

// ---------- Tipos ----------

/** Desde dónde se nombra: la liga (o el torneo sin liga), un evento o un playoff. */
export type ScorerScope = 'liga' | 'evento' | 'playoff';

/** El torneo desde el que se abre la hoja: el texto («anotar en Copa Aniversario») y a dónde llevan el push y el link. */
export interface ScorerTarget {
  scope: ScorerScope;
  /** El evento o el playoff; null con 'liga'. */
  refId: string | null;
  /** Su nombre para los textos. */
  title: string;
}

/** Cómo está un link: sirve, venció, se llenó, se quitó (o se cambió) o se cerró (quien lo creó ya no es admin). */
export type ScorerLinkStatus = 'ok' | 'expired' | 'full' | 'revoked' | 'closed';

export interface ScorerPerson {
  id: string;
  name: string;
}

/** Un link para anotar de la liga (scorer_access, create_scorer_link, rotate_scorer_link). */
export interface ScorerLink {
  id: string;
  code: string;
  scope: ScorerScope;
  refId: string | null;
  title: string;
  /** A dónde lleva: /l/<liga>/e/<evento>, /l/<liga>/playoffs o /l/<liga>. */
  path: string;
  /** ISO. */
  expiresAt: string;
  uses: number;
  maxUses: number;
  status: ScorerLinkStatus;
  createdBy: ScorerPerson | null;
  /** ISO. */
  createdAt: string;
}

/** Una invitación de anotador pendiente de la liga (la hoja la muestra «Invitado», con «Retirar»). */
export interface ScorerInvite {
  id: string;
  user: ScorerPerson & { username: string };
  invitedBy: ScorerPerson | null;
  /** También la invitaron a jugar (y esa parte todavía vale). */
  asPlayer: boolean;
  scope: ScorerScope;
  refId: string | null;
  title: string;
  /** ISO. */
  createdAt: string;
}

/** Lo que la hoja «Anotadores» no saca de los miembros: las invitaciones pendientes y los links abiertos. */
export interface ScorerAccess {
  invites: ScorerInvite[];
  links: ScorerLink[];
}

/** Lo que enseña un link que sirve (/anotar/<código>), con sesión o sin ella. */
export interface ScorerLinkInfo {
  status: 'ok';
  leagueId: string;
  name: string;
  sport: string;
  kind: LeagueKind;
  visibility: Visibility;
  logoPath: string | null;
  scope: ScorerScope;
  refId: string | null;
  title: string;
  /** A dónde llevar después de entrar (ya revisado: siempre una ruta /l/…). */
  path: string;
  /** ISO. */
  expiresAt: string;
  /** La cuenta de la sesión ya está en la liga. */
  member: boolean;
  /** Además ya anota (dueño, admin o con la marca): no hace falta entrar. */
  canScore: boolean;
}

/**
 * El link sirve, pero no para esta cuenta: un admin le quitó el permiso de anotar o la sacó de la liga (hasta que un
 * admin la vuelva a nombrar o a invitar, ningún link de la liga la deja entrar).
 */
export type ScorerLinkRemoved = 'removed';

/**
 * A qué lleva un código: el link que sirve, cómo está uno que ya no sirve (o 'removed' para quien un admin quitó),
 * 'rate_limited' (demasiados códigos malos seguidos: el mismo límite de /unirse) o null (el código no existe).
 */
export type ScorerLinkPreview = ScorerLinkInfo | { status: Exclude<ScorerLinkStatus, 'ok'> | ScorerLinkRemoved | 'rate_limited' } | null;

/** 'joined' (entró a la liga), 'upgraded' (ya era miembro: ahora anota) o 'already' (ya podía anotar). */
export type ScorerJoinStatus = 'joined' | 'upgraded' | 'already';

export interface ScorerJoined {
  status: ScorerJoinStatus;
  leagueId: string;
  scope: ScorerScope;
  refId: string | null;
  title: string;
  /** Ya revisado: siempre una ruta /l/…. */
  path: string;
}

/**
 * Cómo le fue al entrar con el link: entró, el link ya no sirve ({status}; 'removed': un admin quitó a esta cuenta) o
 * null (el código no existe).
 */
export type ScorerJoinResult = ScorerJoined | { status: Exclude<ScorerLinkStatus, 'ok'> | ScorerLinkRemoved } | null;

// ---------- Claves y etiquetas ----------

export const scorerTags = {
  /** Las invitaciones de anotador y los links de una liga. */
  access: (lid: string) => `scorers:${lid}`,
};

export const scorerKeys = {
  access: (lid: string) => `scorers:a:${lid}`,
};

/** Cuántas cuentas por vez (la base: 'invalido' con más). */
export const SCORER_INVITE_MAX = 20;

// ---------- Lecturas ----------

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : null);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const scopeOf = (v: unknown): ScorerScope => (v === 'evento' || v === 'playoff' ? v : 'liga');

/** La ruta a la que llevar dentro de la liga: la que dice la base si es de la app y de una liga; si no, la portada. */
export function leaguePathOr(path: unknown, leagueId: string): string {
  const p = safeAppPath(typeof path === 'string' ? path.trim() : null);
  return p && p.startsWith('/l/') ? p : `/l/${leagueId}`;
}

const STATUSES: readonly ScorerLinkStatus[] = ['ok', 'expired', 'full', 'revoked', 'closed'];
const linkStatusOf = (v: unknown): ScorerLinkStatus => (STATUSES.includes(v as ScorerLinkStatus) ? (v as ScorerLinkStatus) : 'closed');

/** Por qué un link no sirve (para quien lo abre): lo que no se conoce, 'closed'. */
const deadStatusOf = (v: unknown): Exclude<ScorerLinkStatus, 'ok'> | ScorerLinkRemoved =>
  v === 'expired' || v === 'full' || v === 'revoked' || v === 'removed' ? v : 'closed';

function toPerson(v: unknown): ScorerPerson | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as { id?: unknown; name?: unknown };
  return idOf(p.id) ? { id: String(p.id), name: text(p.name) } : null;
}

type Raw = Record<string, unknown>;

export function toScorerLink(r: Raw, leagueId = ''): ScorerLink {
  return {
    id: String(r.id),
    code: text(r.code).toUpperCase(),
    scope: scopeOf(r.scope),
    refId: idOf(r.refId),
    title: text(r.title),
    path: leaguePathOr(r.path, leagueId),
    expiresAt: text(r.expiresAt),
    uses: count(r.uses),
    maxUses: count(r.maxUses),
    status: linkStatusOf(r.status),
    createdBy: toPerson(r.createdBy),
    createdAt: text(r.createdAt),
  };
}

function toScorerInvite(r: Raw): ScorerInvite {
  const u = (r.user && typeof r.user === 'object' ? r.user : {}) as Raw;
  return {
    id: String(r.id),
    user: { id: String(u.id ?? ''), name: text(u.name), username: text(u.username) },
    invitedBy: toPerson(r.invitedBy),
    asPlayer: r.asPlayer === true,
    scope: scopeOf(r.scope),
    refId: idOf(r.refId),
    title: text(r.title),
    createdAt: text(r.createdAt),
  };
}

const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object' && !!(x as Raw).id) : []);

/** Solo el dueño o un admin (si no, 'no_permitido'). */
export async function fetchScorerAccess(lid: string): Promise<ScorerAccess> {
  const r = await rpc<{ invites?: unknown; links?: unknown } | null>('scorer_access', { p_league: lid });
  return { invites: rows(r?.invites).map(toScorerInvite), links: rows(r?.links).map((x) => toScorerLink(x, lid)) };
}

const NO_ACCESS: ScorerAccess = { invites: [], links: [] };

/**
 * Invitaciones de anotador pendientes y links abiertos de la liga (solo para el dueño o un admin; `lid` null = no
 * leer). Se vuelven a leer con el tiempo real de la liga ('scorers', 'invites'). No se guardan en el teléfono.
 */
export function useScorerAccess(lid: string | null | undefined): Live<ScorerAccess> {
  const key = lid && getUserId() ? scorerKeys.access(lid) : null;
  if (key) remember(key, { kind: 'scorerAccess', lid: lid! });
  const st = queryClient.useQuery<ScorerAccess>(key, () => fetchScorerAccess(lid!), {
    initial: NO_ACCESS,
    tags: lid ? [scorerTags.access(lid), tags.invites(lid)] : [],
    staleMs: 20_000,
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** El link de ese torneo entre los de la liga (mismo contexto), o null. */
export function linkFor(links: readonly ScorerLink[], target: Pick<ScorerTarget, 'scope' | 'refId'>): ScorerLink | null {
  return links.find((k) => k.scope === target.scope && (k.refId ?? null) === (target.refId ?? null)) ?? null;
}

/** El código como lo mira la base: sin espacios y en mayúsculas. */
export const normalizeScorerCode = (code: string | null | undefined) => (code ?? '').trim().toUpperCase();

/** El link para compartir: /anotar/<código>. */
export const scorerLinkUrl = (origin: string, code: string) => `${origin}/anotar/${code}`;

const isRateLimited = (e: unknown) => {
  if (e instanceof BackendError && e.kind === 'rate_limited') return true;
  const msg = e instanceof Error ? e.message : '';
  return /^rate_limited\b/.test(msg.trim());
};

/**
 * A qué lleva un link para anotar (/anotar/<código>), con sesión o sin ella. null si el código no existe; si ya no
 * sirve, solo cómo está (ni siquiera la liga; 'removed' si un admin quitó a esta cuenta); con muchos códigos malos
 * seguidos, {status: 'rate_limited'}.
 */
export async function getScorerLinkPreview(code: string): Promise<ScorerLinkPreview> {
  const c = normalizeScorerCode(code);
  if (!c) return null;
  let r: Raw | null;
  try {
    r = await rpc<Raw | null>('scorer_link_preview', { p_code: c });
  } catch (e) {
    if (isRateLimited(e)) return { status: 'rate_limited' };
    throw e;
  }
  if (!r || typeof r !== 'object') return null;
  if (r.status !== 'ok') return { status: deadStatusOf(r.status) };
  const leagueId = String(r.leagueId ?? '');
  return {
    status: 'ok',
    leagueId,
    name: text(r.name),
    sport: text(r.sport) || 'bowling',
    kind: r.kind === 'torneo' ? 'torneo' : 'liga',
    visibility: r.visibility === 'private' ? 'private' : 'public',
    logoPath: text(r.logoPath) || null,
    scope: scopeOf(r.scope),
    refId: idOf(r.refId),
    title: text(r.title) || text(r.name),
    path: leaguePathOr(r.path, leagueId),
    expiresAt: text(r.expiresAt),
    member: r.member === true,
    canScore: r.canScore === true,
  };
}

// ---------- Escrituras ----------

/**
 * El dueño o un admin nombra (true) o quita (false) a un miembro como anotador, desde ese torneo (`target`: el push
 * lleva ahí). Quitárselo a quien entró solo para anotar y no tiene jugador lo saca de la liga.
 */
export async function setScorer(member: Pick<Member, 'leagueId' | 'uid'>, on: boolean, target?: Pick<ScorerTarget, 'scope' | 'refId'> | null): Promise<void> {
  try {
    await setMemberScorer(member, on, target);
  } finally {
    invalidate(scorerTags.access(member.leagueId));
  }
}

const RESULT_STATUSES: readonly InviteResultStatus[] = ['sent', 'pending', 'member', 'declined', 'unavailable', 'rate_limited'];

/**
 * Invita a esas cuentas (sin repetidas, de 1 a 20) a anotar en la liga desde ese torneo. Quien ya tenía una
 * invitación para jugar recibe una nueva para las dos cosas. Devuelve cómo le fue a cada una (la misma forma que
 * sendInvites). Errores: 'no_permitido', 'rate_limited' (100 por día, compartido con invitar), 'invalido', 'no_existe'.
 */
export async function inviteScorers(lid: string, userIds: readonly string[], target: Pick<ScorerTarget, 'scope' | 'refId'>): Promise<InviteSendResult> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || ids.length > SCORER_INVITE_MAX) {
    throw new BackendError(`Elige entre 1 y ${SCORER_INVITE_MAX} personas.`, 'validation', 'invalido');
  }
  try {
    const r = await rpc<{ sent?: number; results?: Raw[] } | null>('invite_scorers', {
      p_league: lid,
      p_users: ids,
      p_scope: target.scope,
      p_ref: target.refId,
    });
    const results: InviteResult[] = (Array.isArray(r?.results) ? r.results : [])
      .filter((x) => x && x.userId && RESULT_STATUSES.includes(x.status as InviteResultStatus))
      .map((x) => ({ userId: String(x.userId), status: x.status as InviteResultStatus }));
    return { sent: typeof r?.sent === 'number' ? r.sent : results.filter((x) => x.status === 'sent').length, results };
  } finally {
    invalidate(scorerTags.access(lid), tags.invites(lid), peopleTags.search);
  }
}

/** Pone el link en la lista guardada de la liga (el de ese contexto se reemplaza): la hoja lo muestra al momento. */
function keepLink(lid: string, link: ScorerLink | null, drop?: string) {
  const key = scorerKeys.access(lid);
  const cur = queryClient.getQueryData<ScorerAccess>(key);
  if (!cur) return;
  const rest = cur.links.filter((k) => k.id !== drop && (!link || k.id !== link.id) && (!link || k.scope !== link.scope || k.refId !== link.refId));
  queryClient.setQueryData<ScorerAccess>(key, { ...cur, links: link ? [link, ...rest] : rest });
}

/**
 * El link para anotar de ese torneo: el que ya sirve (crear dos veces da el mismo) o uno nuevo si el que había venció,
 * se llenó o se cerró. Errores: 'no_permitido', 'invalido' (liga con menores), 'cupo_lleno' (10 abiertos en la
 * liga), 'rate_limited' (20 por día).
 */
export async function createScorerLink(lid: string, target: Pick<ScorerTarget, 'scope' | 'refId'>): Promise<ScorerLink> {
  try {
    const r = await rpc<Raw>('create_scorer_link', { p_league: lid, p_scope: target.scope, p_ref: target.refId });
    const link = toScorerLink(r, lid);
    keepLink(lid, link);
    return link;
  } finally {
    invalidate(scorerTags.access(lid));
  }
}

/** Cambia el link (el de antes deja de servir; quien ya entró sigue anotando). Devuelve el nuevo. */
export async function rotateScorerLink(lid: string, link: Pick<ScorerLink, 'id'>): Promise<ScorerLink> {
  try {
    const r = await rpc<Raw>('rotate_scorer_link', { p_link: link.id });
    const next = toScorerLink(r, lid);
    keepLink(lid, next, link.id);
    return next;
  } finally {
    invalidate(scorerTags.access(lid));
  }
}

/** Quita el link (quien ya entró sigue anotando). */
export async function revokeScorerLink(lid: string, link: Pick<ScorerLink, 'id'>): Promise<void> {
  try {
    await rpc('revoke_scorer_link', { p_link: link.id });
    keepLink(lid, null, link.id);
  } finally {
    invalidate(scorerTags.access(lid));
  }
}

/**
 * Entra con el link para anotar (también a una liga privada). Con 'joined' o 'upgraded' la liga, las membresías y
 * los avisos se vuelven a leer. A quien un admin quitó, {status: 'removed'} (no entra). Errores: 'rate_limited'
 * (muchos códigos malos), 'bloqueada', 'no_existe' (sin perfil).
 */
export async function joinAsScorer(code: string): Promise<ScorerJoinResult> {
  const c = normalizeScorerCode(code);
  if (!c) return null;
  const r = await rpc<Raw | null>('join_as_scorer', { p_code: c });
  if (!r || typeof r !== 'object') return null;
  const status = r.status;
  if (status !== 'joined' && status !== 'upgraded' && status !== 'already') return { status: deadStatusOf(status) };
  const leagueId = String(r.leagueId ?? '');
  if (status !== 'already' && leagueId) {
    afterJoinLeague(leagueId);
    invalidate(scorerTags.access(leagueId));
  }
  return { status, leagueId, scope: scopeOf(r.scope), refId: idOf(r.refId), title: text(r.title), path: leaguePathOr(r.path, leagueId) };
}

/**
 * «También juego»: quien entró solo para anotar pide su jugador (join_league con su propia liga: lo crea y deja de
 * ser «solo anota»). Devuelve su jugador.
 */
export async function playToo(lid: string): Promise<string | null> {
  const { playerId } = await joinLeagueClaim(lid, { uid: getUserId() ?? '', name: '' }, null);
  return playerId;
}

// ---------- Textos ----------

const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();

/** El error de nombrar, invitar o manejar el link en palabras simples («la liga» o «el torneo»). */
export function scorerErrorText(e: unknown, kind: LeagueKind = 'liga'): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const k = e instanceof BackendError ? e.kind : null;
  const code = messageOf(e).split(/[\s:]/)[0];
  if (code === 'cupo_lleno') return `Ya hay 10 links para anotar abiertos en ${kind === 'torneo' ? 'el torneo' : 'la liga'}. Quita alguno.`;
  if (k === 'permission' || code === 'no_permitido') return 'Solo el dueño o un admin maneja los anotadores.';
  if (k === 'rate_limited' || code === 'rate_limited') return 'Hiciste muchos cambios hoy. Prueba mañana.';
  if (k === 'not_found' || code === 'no_existe') return 'Eso ya no existe.';
  if (k === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (k === 'auth') return 'Entra a tu cuenta para eso.';
  return 'No se pudo. Prueba otra vez.';
}

/** El error de entrar con el link para anotar (lo de muchos intentos lo dice la pantalla aparte). */
export function scorerJoinErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const k = e instanceof BackendError ? e.kind : null;
  if (k === 'rate_limited' || isRateLimited(e)) return 'Demasiados intentos. Espera unos minutos.';
  if (k === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (k === 'auth') return 'Entra a tu cuenta para anotar.';
  return 'No se pudo entrar. Prueba otra vez.';
}

/** ¿Es el límite de intentos (muchos códigos malos)? */
export const isScorerRateLimited = (e: unknown) => isRateLimited(e);
