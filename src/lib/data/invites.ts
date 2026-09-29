import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import { isUuid } from '../db/ids';
import type { GenericNotice } from '../notifications';
import type { LeagueKind, Visibility } from '../types';
import { getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live } from './client';
import { peopleTags } from './follows';
import { tags } from './keys';
import { afterJoinLeague, type FreePlayer } from './leagues';
import { patchPeople } from './people';
import { useTopic } from './topics';

/**
 * Invitaciones a una liga (20260929000200_invitaciones.sql): un miembro invita a una liga pública y el dueño o un
 * admin a cualquiera de las suyas (también las privadas). La cuenta invitada recibe un push y un aviso en la
 * campana («Ana te invitó a Liga de los martes»), y acepta (entra a la liga con su jugador, como join_league, y
 * puede decir «¿Quién eres?») o rechaza (no se le puede volver a invitar en 7 días). Quien invitó o un admin la
 * puede retirar. Entrar por otro camino (código, liga pública) acepta la pendiente; salir de la liga cancela las
 * que mandó esa cuenta.
 *
 * RPC: invite_to_league, respond_league_invite, cancel_league_invite, my_league_invites, league_invite_details.
 * Tiempo real: 'invites' en 'user:<cuenta>' (la invitada y quien invitó) y 'league:<liga>' (src/lib/data/topics.ts).
 *
 * Las horas van en texto ISO (`createdAt`): no se convierten a `Stamp`.
 */

// ---------- Tipos ----------

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/**
 * Cómo le fue a cada cuenta al invitar: 'sent' (nueva, con push), 'pending' (ya tenía una), 'member' (ya está en
 * la liga), 'declined' (la rechazó hace menos de 7 días), 'unavailable' (yo, no existe o bloqueada) o
 * 'rate_limited' (no cupo en el límite de 100 por día).
 */
export type InviteResultStatus = 'sent' | 'pending' | 'member' | 'declined' | 'unavailable' | 'rate_limited';

/** Quien invitó (null si ya no tiene cuenta). */
export interface InvitePerson {
  id: string;
  name: string;
  /** Sin la @. */
  username: string;
}

/** Una invitación pendiente de la cuenta (my_league_invites). */
export interface LeagueInvite {
  id: string;
  leagueId: string;
  leagueName: string;
  sport: string;
  kind: LeagueKind;
  visibility: Visibility;
  /** Cuántas cuentas hay en la liga. */
  members: number;
  invitedBy: InvitePerson | null;
  /** ISO. */
  createdAt: string;
}

/** La liga de una invitación, para la pantalla /invitacion/<id>. */
export interface InviteLeague {
  id: string;
  name: string;
  sport: string;
  kind: LeagueKind;
  visibility: Visibility;
  venue: string;
  schedule: string;
  /** YYYY-MM-DD o ''. */
  seasonStart: string;
  seasonEnd: string;
  members: number;
}

/** Lo que ve la cuenta invitada en /invitacion/<id> (league_invite_details). */
export interface LeagueInviteDetails {
  id: string;
  /** Una pendiente que ya no vale (la liga pasó a privada, quien invitó ya no es admin o está bloqueado) llega 'cancelled'. */
  status: InviteStatus;
  /** ISO. */
  createdAt: string;
  invitedBy: InvitePerson | null;
  /** Es para la cuenta de la sesión (false: el superadmin mirando la de otra cuenta; no la puede responder). */
  mine: boolean;
  /** La cuenta invitada ya es miembro de la liga (si aceptó y después salió, false). */
  member: boolean;
  league: InviteLeague;
  /** Jugadores libres para «¿Quién eres?» (sin cuenta, no menores, sin reclamo pendiente), por nombre; solo si está pendiente. */
  players: FreePlayer[];
}

/** El mismo tipo con el nombre corto (no confundir con `InviteDetails` de ./leagues, la del código de invitación). */
export type InviteDetails = LeagueInviteDetails;

export interface InviteResult {
  userId: string;
  status: InviteResultStatus;
}

export interface InviteSendResult {
  /** Cuántas salieron nuevas. */
  sent: number;
  /** Una por cuenta, en el orden en que se pidieron (sin repetidas). */
  results: InviteResult[];
}

/** Cómo quedó al responder. `playerId` y `claimId` solo al aceptar. */
export interface InviteResponse {
  /**
   * 'accepted' o 'declined'; si ya estaba decidida, cómo quedó. 'cancelled' también si ya no vale (la liga ya no es
   * pública y quien invitó ya no es admin, o quien invitó está bloqueado) y no entra.
   */
  status: InviteStatus;
  leagueId: string;
  /**
   * Entró a la liga con esta respuesta. false si ya estaba decidida (se aceptó en otro teléfono o desde Avisos): la
   * base solo dice cómo quedó, sin jugador ni reclamo, y no hay nada que avisar de «¿Quién eres?».
   */
  joined: boolean;
  /** Su jugador en la liga (al aceptar). */
  playerId: string | null;
  /** El reclamo que quedó si eligió un jugador en «¿Quién eres?» (lo aprueba el admin). */
  claimId: string | null;
}

// ---------- Claves y etiquetas ----------

export const inviteTags = {
  /** Las invitaciones pendientes de la cuenta de la sesión (y sus detalles). */
  mine: tags.myInvites,
  /** Las de una liga (y la búsqueda de personas de esa liga). */
  league: tags.invites,
};

export const inviteKeys = {
  mine: (uid: string) => `invites:me:${uid}`,
  details: (id: string) => `invites:d:${id}`,
};

/** A lo sumo tantas por vez (la base: 'invalido' con más). */
export const INVITE_MAX = 50;

// ---------- Lecturas ----------

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function toPerson(v: unknown): InvitePerson | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Partial<InvitePerson>;
  return p.id ? { id: String(p.id), name: text(p.name), username: text(p.username) } : null;
}

type Raw<T> = { [K in keyof T]?: unknown };

const toInvite = (r: Raw<LeagueInvite>): LeagueInvite => ({
  id: String(r.id),
  leagueId: String(r.leagueId ?? ''),
  leagueName: text(r.leagueName),
  sport: text(r.sport) || 'bowling',
  kind: r.kind === 'torneo' ? 'torneo' : 'liga',
  visibility: r.visibility === 'private' ? 'private' : 'public',
  members: typeof r.members === 'number' ? r.members : 0,
  invitedBy: toPerson(r.invitedBy),
  createdAt: text(r.createdAt),
});

/** Mis invitaciones pendientes, la más nueva primero (hasta 50). */
export async function fetchMyInvites(): Promise<LeagueInvite[]> {
  const rows = await rpc<Raw<LeagueInvite>[] | null>('my_league_invites');
  return Array.isArray(rows) ? rows.filter((r) => r && r.id).map(toInvite) : [];
}

const NO_INVITES: LeagueInvite[] = [];

/**
 * Mis invitaciones pendientes. Se vuelven a leer con el tiempo real de la cuenta (`user:<id>`), cada minuto y al
 * volver a la app. No se guardan en el teléfono.
 */
export function useMyInvites(uid: string | null | undefined): Live<LeagueInvite[]> {
  useTopic(uid ? `user:${uid}` : null);
  const key = uid ? inviteKeys.mine(uid) : null;
  if (key) remember(key, { kind: 'invites:mine', id: uid! });
  const st = queryClient.useQuery<LeagueInvite[]>(key, fetchMyInvites, {
    initial: NO_INVITES,
    tags: [inviteTags.mine, tags.feeds],
    staleMs: 20_000,
    pollMs: 60_000,
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

type DetailsRaw = Raw<Omit<LeagueInviteDetails, 'league'>> & { league?: Raw<InviteLeague> | null };

function toDetails(r: DetailsRaw): LeagueInviteDetails {
  const l = r.league ?? {};
  const status = r.status;
  return {
    id: String(r.id),
    status: status === 'accepted' || status === 'declined' || status === 'cancelled' ? status : 'pending',
    createdAt: text(r.createdAt),
    invitedBy: toPerson(r.invitedBy),
    mine: r.mine !== false,
    member: r.member === true,
    league: {
      id: String(l.id ?? ''),
      name: text(l.name),
      sport: text(l.sport) || 'bowling',
      kind: l.kind === 'torneo' ? 'torneo' : 'liga',
      visibility: l.visibility === 'private' ? 'private' : 'public',
      venue: text(l.venue),
      schedule: text(l.schedule),
      seasonStart: text(l.seasonStart),
      seasonEnd: text(l.seasonEnd),
      members: typeof l.members === 'number' ? l.members : 0,
    },
    players: Array.isArray(r.players) ? (r.players as FreePlayer[]).filter((p) => p && p.id).map((p) => ({ id: p.id, name: text(p.name) })) : [],
  };
}

/** Una invitación para /invitacion/<id>. null si no existe, no es para la cuenta de la sesión o el id no sirve. */
export async function fetchInviteDetails(id: string): Promise<LeagueInviteDetails | null> {
  if (!isUuid(id)) return null;
  const r = await rpc<DetailsRaw | null>('league_invite_details', { p_invite: id });
  return r && r.id ? toDetails(r) : null;
}

/**
 * La invitación de /invitacion/<id> (null mientras carga, si no es para ti o sin cuenta: mirar `loading` y la
 * sesión). Se vuelve a leer con el tiempo real de la cuenta. No se guarda en el teléfono.
 */
export function useInviteDetails(id: string | null | undefined): Live<LeagueInviteDetails | null> {
  const uid = getUserId();
  useTopic(uid && id ? `user:${uid}` : null);
  const key = uid && id ? inviteKeys.details(id) : null;
  if (key) remember(key, { kind: 'inviteDetails', id: id! });
  const st = queryClient.useQuery<LeagueInviteDetails | null>(key, () => fetchInviteDetails(id!), {
    initial: null,
    tags: [inviteTags.mine],
    staleMs: 20_000,
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

// ---------- Escrituras ----------

/** En la búsqueda de personas de esa liga: 'Invitado' o 'En la liga' al momento. */
function markInvited(lid: string, results: readonly InviteResult[]) {
  const by = new Map(results.map((r) => [r.userId, r.status]));
  patchPeople((h) => {
    const s = by.get(h.id);
    if ((s === 'sent' || s === 'pending') && !h.invited) return { ...h, invited: true };
    if (s === 'member' && !h.inLeague) return { ...h, inLeague: true };
    return h;
  }, lid);
}

const STATUSES: readonly InviteResultStatus[] = ['sent', 'pending', 'member', 'declined', 'unavailable', 'rate_limited'];

/**
 * Invita a esas cuentas (sin repetidas, hasta 50) a la liga. Devuelve cómo le fue a cada una (ver
 * `inviteResultSummary` para el aviso). Errores: 'no_permitido' (no puede invitar a esa liga), 'rate_limited'
 * (100 por día), 'invalido' (ninguna o más de 50), 'no_existe' (la liga).
 */
export async function sendInvites(lid: string, userIds: readonly string[]): Promise<InviteSendResult> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || ids.length > INVITE_MAX) throw new BackendError(`Elige entre 1 y ${INVITE_MAX} personas.`, 'validation', 'invalido');
  try {
    const r = await rpc<{ sent?: number; results?: Raw<InviteResult>[] } | null>('invite_to_league', { p_league: lid, p_users: ids });
    const results: InviteResult[] = (Array.isArray(r?.results) ? r.results : [])
      .filter((x) => x && x.userId && STATUSES.includes(x.status as InviteResultStatus))
      .map((x) => ({ userId: String(x.userId), status: x.status as InviteResultStatus }));
    markInvited(lid, results);
    return { sent: typeof r?.sent === 'number' ? r.sent : results.filter((x) => x.status === 'sent').length, results };
  } finally {
    invalidate(peopleTags.search, inviteTags.league(lid));
  }
}

/** Ya no está pendiente: sale de mis invitaciones y su pantalla muestra cómo quedó. */
function settleMine(id: string, status: InviteStatus) {
  updateCached<LeagueInvite[]>('invites:mine', (list) => (list.some((i) => i.id === id) ? list.filter((i) => i.id !== id) : list));
  updateCached<LeagueInviteDetails | null>('inviteDetails', (d) =>
    d && d.id === id && d.status !== status ? { ...d, status, member: d.member || status === 'accepted', players: [] } : d,
  );
}

/**
 * La cuenta invitada acepta (true) o rechaza (false). Aceptar la deja en la liga con su jugador; con `prefer` (un
 * jugador de «¿Quién eres?») queda además el reclamo para que el admin lo apruebe (`claimId`), como al unirse con
 * código (joinLeagueClaim). Si ya estaba decidida, devuelve cómo quedó (`joined` false).
 */
export async function respondInvite(id: string, accept: boolean, prefer: string | null = null): Promise<InviteResponse> {
  try {
    const r = await rpc<Raw<InviteResponse> | null>('respond_league_invite', { p_invite: id, p_accept: accept, p_prefer: prefer || null });
    const status: InviteStatus = r?.status === 'accepted' || r?.status === 'declined' || r?.status === 'cancelled' ? r.status : 'pending';
    const res: InviteResponse = {
      status,
      leagueId: String(r?.leagueId ?? ''),
      // Al entrar ahora la base manda siempre `playerId` (aunque sea null); ya decidida, solo {status, leagueId}.
      joined: status === 'accepted' && !!r && 'playerId' in r,
      playerId: typeof r?.playerId === 'string' ? r.playerId : null,
      claimId: typeof r?.claimId === 'string' ? r.claimId : null,
    };
    settleMine(id, status);
    // Lo mismo que al unirse con código: ligas, membresías, jugadores, reclamos y la campana.
    if (status === 'accepted' && res.leagueId) afterJoinLeague(res.leagueId);
    return res;
  } finally {
    invalidate(inviteTags.mine, peopleTags.search);
  }
}

/** Quien invitó o un admin de la liga retira una invitación pendiente (ya decidida: nada). */
export async function cancelInvite(id: string, lid?: string | null): Promise<void> {
  try {
    await rpc('cancel_league_invite', { p_invite: id });
  } finally {
    invalidate(peopleTags.search, inviteTags.mine, ...(lid ? [inviteTags.league(lid)] : []));
  }
}

// ---------- Textos ----------

const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();

/** «la liga» o «el torneo» (lo mismo que leagueNoun de la pantalla de la invitación). */
const nounOf = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'el torneo' : 'la liga');

/** El error de invitar o retirar en palabras simples (para aceptar o rechazar: `respondErrorText`). */
export function inviteErrorText(e: unknown, kind: LeagueKind = 'liga'): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const k = e instanceof BackendError ? e.kind : null;
  const code = messageOf(e).split(/[\s:]/)[0];
  if (k === 'rate_limited' || code === 'rate_limited') return 'Mandaste muchas invitaciones hoy. Prueba mañana.';
  if (k === 'permission' || code === 'no_permitido') return `No tienes permiso para invitar a ${kind === 'torneo' ? 'este torneo' : 'esta liga'}.`;
  if (k === 'not_found' || code === 'no_existe') return `Esa invitación o ${kind === 'torneo' ? 'ese torneo' : 'esa liga'} ya no existe.`;
  if (k === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (k === 'auth') return 'Entra a tu cuenta para eso.';
  if (k === 'validation' || code === 'invalido') return `Elige entre 1 y ${INVITE_MAX} personas.`;
  return 'No se pudo. Prueba otra vez.';
}

/**
 * El error de aceptar o rechazar una invitación (la pantalla /invitacion/<id> y la tarjeta de Avisos): nada de
 * «invitar» ni de cuántas personas elegir.
 */
export function respondErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const k = e instanceof BackendError ? e.kind : null;
  const code = messageOf(e).split(/[\s:]/)[0];
  if (k === 'not_found' || code === 'no_existe') return 'Esa invitación ya no existe.';
  if (k === 'permission' || code === 'no_permitido') return 'No puedes responder esta invitación.';
  if (k === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (k === 'auth') return 'Entra a tu cuenta para responder la invitación.';
  return 'No se pudo responder la invitación. Prueba otra vez.';
}

/** Lo de cada estado, para una sola cuenta y para varias («la liga» o «el torneo»). */
function resultText(status: Exclude<InviteResultStatus, 'sent'>, noun: string): { one: string; some: (n: number) => string } {
  switch (status) {
    case 'member':
      return { one: `Ya está en ${noun}.`, some: (n) => `${n} ${n === 1 ? 'ya está' : 'ya están'} en ${noun}` };
    case 'pending':
      return { one: 'Ya tenía una invitación.', some: (n) => `${n} ${n === 1 ? 'ya tenía' : 'ya tenían'} invitación` };
    case 'declined':
      return { one: 'La rechazó hace poco. Prueba en unos días.', some: (n) => `${n} la ${n === 1 ? 'rechazó' : 'rechazaron'} hace poco` };
    case 'unavailable':
      return { one: 'Esa cuenta no está disponible.', some: (n) => `${n} no ${n === 1 ? 'está disponible' : 'están disponibles'}` };
    case 'rate_limited':
      return {
        one: 'Mandaste muchas invitaciones hoy. Prueba mañana.',
        some: (n) => `${n} no ${n === 1 ? 'cupo' : 'cupieron'} en el límite de hoy`,
      };
  }
}

/**
 * El aviso después de invitar: «Invitación enviada», «Invitación enviada a 3 personas · 1 ya está en la liga»,
 * «No se envió ninguna invitación · 2 ya tenían invitación». Con una sola cuenta, en una frase. En un torneo,
 * «en el torneo».
 */
export function inviteResultSummary(results: readonly InviteResult[], kind: LeagueKind = 'liga'): string {
  const noun = nounOf(kind);
  if (results.length === 1) {
    const s = results[0].status;
    return s === 'sent' ? 'Invitación enviada' : STATUSES.includes(s) ? resultText(s, noun).one : 'No se envió la invitación.';
  }
  const count = (s: InviteResultStatus) => results.filter((r) => r.status === s).length;
  const sent = count('sent');
  const parts = [sent ? `Invitación enviada a ${sent} ${sent === 1 ? 'persona' : 'personas'}` : 'No se envió ninguna invitación'];
  for (const s of ['member', 'pending', 'declined', 'unavailable', 'rate_limited'] as const) {
    const n = count(s);
    if (n) parts.push(resultText(s, noun).some(n));
  }
  return parts.join(' · ');
}

// ---------- Avisos de la campana ----------

const ms = (iso: string) => Date.parse(iso) || 0;

/**
 * Mis invitaciones pendientes como avisos genéricos de la campana (filtro Mis ligas): «Ana te invitó a Liga de
 * los martes» → /invitacion/<id>. Salen mientras estén pendientes. La más nueva primero.
 */
export function inviteNotices(invites: readonly LeagueInvite[] | null | undefined): GenericNotice[] {
  const out: GenericNotice[] = [];
  for (const inv of invites ?? []) {
    if (!inv?.id) continue;
    const league = inv.leagueName?.trim() || 'una liga';
    const from = inv.invitedBy?.name?.trim();
    out.push({
      id: `invitacion:${inv.id}`,
      kind: 'social',
      icon: 'invite',
      category: 'ligas',
      title: from ? `${from} te invitó a ${league}` : `Te invitaron a ${league}`,
      body: 'Toca para ver la invitación y unirte.',
      url: `/invitacion/${inv.id}`,
      at: inv.createdAt,
      lid: inv.leagueId || null,
      sport: inv.sport || null,
    });
  }
  return out.sort((a, b) => ms(String(b.at)) - ms(String(a.at)) || (a.id < b.id ? 1 : -1));
}

const NO_NOTICES: readonly GenericNotice[] = [];

/** Los avisos de mis invitaciones (la misma lista entre renders mientras no cambie). Sin cuenta, nada. */
export function useInviteNotices(uid: string | null | undefined): readonly GenericNotice[] {
  const { data } = useMyInvites(uid);
  return useMemo(() => (uid && data.length ? inviteNotices(data) : NO_NOTICES), [uid, data]);
}
