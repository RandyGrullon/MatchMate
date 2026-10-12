import { useEffect, useMemo, useState } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import { uuidv7 } from '../db/ids';
import type { CompressedLogo } from '../image';
import { LOGO_BUCKET, logoPath, prepareLogo, removeLogoFile } from '../logos';
import { backend, getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live } from './client';
import { tags } from './keys';
import { postTags } from './posts';

/**
 * Equipos fuera de una liga (docs/equipos-y-en-vivo.md §1, 20261011000100_equipos_en_vivo.sql). En la base se llaman
 * `squads` (`teams` ya son los equipos de cada liga); en la app, «Equipos». Esports tiene los suyos (esports.ts).
 *
 * RPC: create_squad, update_squad, delete_squad, squad_code, renew_squad_code, squad_preview, join_squad, leave_squad,
 * remove_squad_member, set_squad_member, begin_squad_logo, set_squad_logo, squad_page, my_squads, follow_squad,
 * unfollow_squad, followed_squads, search_squads, request_squad_league, withdraw_squad_request, league_squad_requests,
 * decide_squad_request, sync_squad_roster.
 */

// ---------- Tipos ----------

export interface SquadLite {
  id: string;
  sport: string;
  name: string;
  tag: string;
  /** Ruta del logo en el bucket `logos` (useLogo). */
  logo: string | null;
  color: string | null;
  city: string | null;
  /** Busca jugadores. */
  recruiting: boolean;
  members: number;
  followers: number;
}

export type SquadRole = 'captain' | 'member';

export interface SquadMember {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  role: SquadRole;
  position: string | null;
  jersey: number | null;
  isMe: boolean;
}

export interface SquadRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
}

export type SquadRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface SquadLeague {
  leagueId: string;
  name: string;
  sport: string;
  logo: string | null;
  status: SquadRequestStatus;
  requestId: string;
  record: SquadRecord;
}

export interface SquadPage extends SquadLite {
  description: string;
  captainId: string;
  isMember: boolean;
  myRole: SquadRole | null;
  isFollowing: boolean;
  createdAt: string;
  /** La plantilla (vacía sin sesión); `members` es el número. */
  roster: SquadMember[];
  leagues: SquadLeague[];
  record: SquadRecord;
}

export interface MySquad extends SquadLite {
  role: SquadRole;
}

export interface SquadRequest {
  id: string;
  squad: SquadLite;
  status: SquadRequestStatus;
  note: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string };
}

// ---------- Límites (los mismos de la base) ----------

export const SQUAD_NAME_MIN = 2;
export const SQUAD_NAME_MAX = 40;
export const SQUAD_TAG_RE = /^[A-Z0-9]{2,5}$/;
export const SQUAD_DESCRIPTION_MAX = 200;
export const SQUAD_CITY_MAX = 40;
export const SQUAD_MEMBERS_MAX = 40;
/** El bucket `logos` acepta hasta 256 kB. */
const MAX_LOGO_UPLOAD_BYTES = 262_144;

// ---------- Claves y etiquetas ----------

export const squadTags = {
  all: 'squads',
  squad: (id: string) => `squads:${id}`,
  mine: 'squads:mine',
  followed: 'squads:followed',
  search: 'squads:search',
  requests: (lid: string) => `squads:requests:${lid}`,
};

const keys = {
  page: (id: string) => `squads:page:${id}`,
  mine: 'squads:mine',
  followed: 'squads:followed',
  search: (q: string, sport: string | null) => `squads:search:${sport ?? '*'}:${q}`,
  requests: (lid: string) => `squads:requests:${lid}`,
};

function afterSquad(id: string | null) {
  invalidate(squadTags.mine, squadTags.search, ...(id ? [squadTags.squad(id)] : []));
}

// ---------- Leer ----------

/** La página del equipo (también sin sesión: sin la plantilla). null mientras carga o si no existe. */
export function useSquad(id: string | null | undefined): Live<SquadPage | null> {
  const key = id ? keys.page(id) : null;
  if (key) remember(key, { kind: 'squadPage', id: id! });
  const st = queryClient.useQuery<SquadPage | null>(key, () => rpc<SquadPage | null>('squad_page', { p_squad: id }), {
    initial: null,
    tags: id ? [squadTags.all, squadTags.squad(id)] : [],
    staleMs: 30_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** Mis equipos (de los que soy capitán o miembro). */
export function useMySquads(): Live<MySquad[]> {
  const key = getUserId() ? keys.mine : null;
  if (key) remember(key, { kind: 'squadList', status: 'mine' });
  const st = queryClient.useQuery<MySquad[]>(key, () => rpc<MySquad[]>('my_squads'), {
    initial: [],
    tags: [squadTags.all, squadTags.mine],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** Los equipos que sigo. */
export function useFollowedSquads(): Live<SquadLite[]> {
  const key = getUserId() ? keys.followed : null;
  if (key) remember(key, { kind: 'squadList', status: 'followed' });
  const st = queryClient.useQuery<SquadLite[]>(key, () => rpc<SquadLite[]>('followed_squads', { p_limit: 50 }), {
    initial: [],
    tags: [squadTags.all, squadTags.followed],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

export const SQUAD_QUERY_MIN = 2;

export interface SquadSearch extends Live<SquadLite[]> {
  settled: boolean;
}

/** Buscar equipos por nombre, tag o ciudad (espera a que deje de escribir; menos de 2 letras no busca). */
export function useSquadSearch(query: string, sport: string | null = null, enabled = true): SquadSearch {
  const q = query.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const active = enabled && !!getUserId() && debounced.length >= SQUAD_QUERY_MIN;
  const key = active ? keys.search(debounced, sport) : null;
  if (key) remember(key, { kind: 'squadList', status: 'search' });
  const st = queryClient.useQuery<SquadLite[]>(key, () => rpc<SquadLite[]>('search_squads', { p_query: debounced, p_sport: sport, p_limit: 20 }), {
    initial: [],
    tags: [squadTags.all, squadTags.search],
    staleMs: 30_000,
    persist: false,
  });
  const settled = debounced === q && (!active || !st.loading);
  return useMemo(() => ({ data: active ? st.data : [], loading: active && st.loading, error: active ? st.error : null, settled }), [active, st, settled]);
}

/** Lo que ve quien abre un link para unirse (también sin sesión). null si el código no existe. */
export const previewSquad = (code: string) => rpc<SquadLite | null>('squad_preview', { p_code: code.trim().toUpperCase() });

// ---------- Crear, editar y la plantilla ----------

export interface NewSquad {
  sport: string;
  name: string;
  tag: string;
  description?: string;
  city?: string | null;
  color?: string | null;
}

/** El tag como lo guarda la base: mayúsculas, sin espacios. */
export const cleanTag = (tag: string) => tag.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** «Los Tigres del Este» → «LTE» (para sugerir el tag). */
export function suggestTag(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w && !['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y'].includes(w));
  const initials = words.map((w) => w[0]).join('');
  const tag = initials.length >= 2 ? initials : (words[0] ?? '').slice(0, 3);
  return tag.slice(0, 5);
}

/** Qué le falta al equipo (null = listo). */
export function squadProblem(s: Pick<NewSquad, 'name' | 'tag' | 'description' | 'city'>): string | null {
  const name = s.name.trim();
  if (name.length < SQUAD_NAME_MIN) return 'Ponle un nombre al equipo.';
  if (name.length > SQUAD_NAME_MAX) return `Usa ${SQUAD_NAME_MAX} caracteres o menos en el nombre.`;
  if (!SQUAD_TAG_RE.test(cleanTag(s.tag))) return 'El tag va de 2 a 5 letras o números (como TGR).';
  if ((s.description ?? '').trim().length > SQUAD_DESCRIPTION_MAX) return `Usa ${SQUAD_DESCRIPTION_MAX} caracteres o menos en la descripción.`;
  if ((s.city ?? '').trim().length > SQUAD_CITY_MAX) return `Usa ${SQUAD_CITY_MAX} caracteres o menos en la ciudad.`;
  return null;
}

/** Crea el equipo (quien lo crea es el capitán). Devuelve su id y el código para invitar. */
export async function createSquad(input: NewSquad): Promise<{ squadId: string; inviteCode: string }> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para crear un equipo.', 'auth', 'session_not_found');
  const problem = squadProblem(input);
  if (problem) throw new BackendError(problem, 'validation', 'invalido');
  const res = await rpc<{ squadId: string; inviteCode: string }>('create_squad', {
    p_sport: input.sport,
    p_name: input.name.trim(),
    p_tag: cleanTag(input.tag),
    p_description: (input.description ?? '').trim(),
    p_city: input.city?.trim() || null,
    p_color: input.color || null,
    p_id: uuidv7(),
  });
  afterSquad(res.squadId);
  return res;
}

export type SquadPatch = Partial<Pick<SquadPage, 'name' | 'tag' | 'description' | 'city' | 'color' | 'recruiting'>>;

/** Cambia los datos del equipo (capitán). */
export async function updateSquad(id: string, patch: SquadPatch): Promise<void> {
  const p: Record<string, unknown> = { ...patch };
  if (typeof patch.tag === 'string') p.tag = cleanTag(patch.tag);
  updateCached<SquadPage | null>('squadPage', (s, d) => (s && d.id === id ? { ...s, ...patch, ...(p.tag ? { tag: p.tag as string } : {}) } : s));
  try {
    await rpc('update_squad', { p_squad: id, p_patch: p });
  } finally {
    afterSquad(id);
  }
}

/** Borra el equipo (capitán). Los equipos de liga que salieron de él se quedan en sus ligas. */
export async function deleteSquad(id: string): Promise<void> {
  await rpc('delete_squad', { p_squad: id });
  afterSquad(id);
  invalidate(squadTags.followed);
}

export const fetchSquadCode = (id: string) => rpc<string>('squad_code', { p_squad: id });

/** El código para invitar (solo el capitán; null si no lo es o mientras carga). */
export function useSquadCode(id: string | null | undefined, enabled = true): Live<string | null> {
  const key = id && enabled && getUserId() ? `squads:code:${id}` : null;
  if (key) remember(key, { kind: 'squadCode', id: id! });
  const st = queryClient.useQuery<string | null>(key, () => fetchSquadCode(id!), {
    initial: null,
    tags: id ? [squadTags.squad(id)] : [],
    staleMs: 300_000,
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** Un código nuevo (el anterior deja de servir). */
export async function renewSquadCode(id: string): Promise<string> {
  const code = await rpc<string>('renew_squad_code', { p_squad: id });
  queryClient.setQueryData<string | null>(`squads:code:${id}`, code);
  return code;
}

/** Entra al equipo con el código. Errores: 'cupo_lleno' (40 miembros), 'limite' (ya estás en 20 equipos). */
export async function joinSquad(code: string): Promise<{ squadId: string }> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para unirte.', 'auth', 'session_not_found');
  const res = await rpc<{ squadId: string }>('join_squad', { p_code: code.trim().toUpperCase() });
  afterSquad(res.squadId);
  invalidate(postTags.feed);
  return res;
}

/** Sale del equipo (el capitán primero pasa la capitanía si hay otros). */
export async function leaveSquad(id: string): Promise<void> {
  await rpc('leave_squad', { p_squad: id });
  afterSquad(id);
  invalidate(postTags.feed);
}

/** Saca a alguien del equipo (capitán). */
export async function removeSquadMember(id: string, uid: string): Promise<void> {
  updateCached<SquadPage | null>('squadPage', (s, d) =>
    s && d.id === id && s.roster.some((m) => m.id === uid) ? { ...s, roster: s.roster.filter((m) => m.id !== uid), members: Math.max(0, s.members - 1) } : s,
  );
  try {
    await rpc('remove_squad_member', { p_squad: id, p_user: uid });
  } finally {
    afterSquad(id);
  }
}

/** Cambia la posición o el número de alguien, o le pasa la capitanía (`role: 'captain'`). Capitán. */
export async function setSquadMember(id: string, uid: string, change: { role?: SquadRole; position?: string | null; jersey?: number | null }): Promise<void> {
  try {
    await rpc('set_squad_member', {
      p_squad: id,
      p_user: uid,
      p_role: change.role ?? null,
      p_position: change.position === undefined ? null : change.position?.trim() || null,
      p_jersey: change.jersey ?? null,
    });
  } finally {
    afterSquad(id);
  }
}

const isCompressed = (v: Blob | CompressedLogo): v is CompressedLogo => typeof v === 'object' && v !== null && 'blob' in v && 'side' in v;

/** Sube el logo del equipo y lo pone (capitán). Como el de una liga: bucket `logos`, carpeta del equipo. */
export async function uploadSquadLogo(id: string, file: Blob | CompressedLogo): Promise<string> {
  const logo = isCompressed(file) ? file : await prepareLogo(file);
  if (!logo.blob.size || logo.blob.size > MAX_LOGO_UPLOAD_BYTES) throw new BackendError('El logo es muy grande.', 'validation', 'imagen');
  const squad = id.toLowerCase();
  const path = logoPath(squad, uuidv7(), logo.contentType);
  await rpc('begin_squad_logo', { p_squad: squad, p_path: path });
  await backend().storage.upload(LOGO_BUCKET, path, logo.blob, logo.contentType);
  let old: string | null;
  try {
    old = await rpc<string | null>('set_squad_logo', { p_squad: squad, p_path: path });
  } catch (e) {
    await removeLogoFile(path);
    throw e;
  }
  if (old && old !== path) await removeLogoFile(old);
  afterSquad(id);
  return path;
}

/** Quita el logo (vuelve el tag en su color). */
export async function removeSquadLogo(id: string): Promise<void> {
  const old = await rpc<string | null>('set_squad_logo', { p_squad: id, p_path: null });
  if (old) await removeLogoFile(old);
  afterSquad(id);
}

// ---------- Seguir ----------

export interface SquadFollowResult {
  following: boolean;
  followers: number;
}

/** Seguir (true) o dejar de seguir (false) un equipo. Se ve al momento; después queda lo del servidor. */
export async function setSquadFollowing(id: string, follow: boolean): Promise<SquadFollowResult> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para seguir un equipo.', 'auth', 'session_not_found');
  const patch = (following: boolean, followers?: number) =>
    updateCached<SquadPage | null>('squadPage', (s, d) =>
      s && d.id === id
        ? { ...s, isFollowing: following, followers: followers ?? Math.max(0, s.followers + (s.isFollowing === following ? 0 : following ? 1 : -1)) }
        : s,
    );
  patch(follow);
  try {
    const res = await rpc<SquadFollowResult>(follow ? 'follow_squad' : 'unfollow_squad', { p_squad: id });
    patch(res.following, res.followers);
    return res;
  } finally {
    invalidate(squadTags.squad(id), squadTags.followed, postTags.feed);
  }
}

// ---------- Ligas ----------

/** El capitán pide entrar a una liga de su deporte (fútbol, futsal o baloncesto). Los admins de la liga deciden. */
export async function requestSquadLeague(squadId: string, leagueId: string): Promise<string> {
  const id = await rpc<string>('request_squad_league', { p_squad: squadId, p_league: leagueId });
  invalidate(squadTags.squad(squadId), squadTags.requests(leagueId));
  return id;
}

export async function withdrawSquadRequest(squadId: string, request: Pick<SquadLeague, 'requestId' | 'leagueId'>): Promise<void> {
  await rpc('withdraw_squad_request', { p_request: request.requestId });
  invalidate(squadTags.squad(squadId), squadTags.requests(request.leagueId));
}

/** Los equipos que piden entrar a la liga (admins; los pendientes primero). */
export function useLeagueSquadRequests(lid: string | null | undefined, enabled = true): Live<SquadRequest[]> {
  const key = lid && enabled && getUserId() ? keys.requests(lid) : null;
  if (key) remember(key, { kind: 'squadRequests', lid: lid! });
  const st = queryClient.useQuery<SquadRequest[]>(key, () => rpc<SquadRequest[]>('league_squad_requests', { p_league: lid }), {
    initial: [],
    tags: lid ? [squadTags.all, squadTags.requests(lid), tags.league(lid)] : [],
    staleMs: 30_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

export interface SquadDecision {
  teamId?: string;
  added?: number;
  skipped?: number;
}

/** Acepta (crea el equipo en la liga con su plantilla) o rechaza a un equipo (admins). */
export async function decideSquadRequest(lid: string, requestId: string, approve: boolean, note?: string | null): Promise<SquadDecision> {
  try {
    return await rpc<SquadDecision>('decide_squad_request', { p_request: requestId, p_approve: approve, p_note: note?.trim() || null });
  } finally {
    invalidate(squadTags.requests(lid), tags.league(lid), tags.members, `seasons:${lid}`);
  }
}

/** Pasa a la liga a los miembros nuevos del equipo (capitán o admin de la liga). */
export async function syncSquadRoster(squadId: string, leagueId: string): Promise<{ added: number; skipped: number }> {
  try {
    return await rpc<{ added: number; skipped: number }>('sync_squad_roster', { p_squad: squadId, p_league: leagueId });
  } finally {
    invalidate(squadTags.squad(squadId), tags.league(leagueId));
  }
}

// ---------- Links y textos ----------

/** El link para entrar al equipo. */
export const squadJoinUrl = (origin: string, code: string): string => `${origin.replace(/\/+$/, '')}/equipos/unirse/${encodeURIComponent(code)}`;
/** La página del equipo. */
export const squadPath = (id: string) => `/equipos/${id}`;

/** «12 G · 3 E · 4 P» (vacío sin partidos). */
export function recordText(r: SquadRecord | null | undefined): string {
  if (!r || !r.played) return '';
  return r.drawn ? `${r.won} G · ${r.drawn} E · ${r.lost} P` : `${r.won} G · ${r.lost} P`;
}

/** El mensaje para un error de equipos. */
export function squadErrorText(e: unknown): string {
  // Cuenta bloqueada: su mensaje tal cual (sale como `permission`, que aquí sería «Solo el capitán…»).
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined;
  const message = e instanceof Error ? e.message : '';
  if (/^cupo_lleno/.test(message)) return `Ese equipo ya tiene ${SQUAD_MEMBERS_MAX} miembros.`;
  if (/^limite/.test(message)) return 'Llegaste al máximo de equipos. Sal de uno para entrar a otro.';
  if (/^duplicado/.test(message) || kind === 'conflict') return 'Ya hay un equipo con ese nombre en ese deporte.';
  if (/^palabras/.test(message)) return 'Ese texto tiene palabras que no se permiten.';
  if (kind === 'rate_limited') return 'Vas muy rápido. Espera un rato y vuelve a intentar.';
  if (kind === 'not_found') return 'Ese equipo ya no existe o el código cambió.';
  if (kind === 'permission') return 'Solo el capitán puede hacer eso.';
  if (kind === 'network') return 'Sin conexión. Revisa tu señal y vuelve a intentar.';
  if (kind === 'validation' && message && !/^[a-z_]+(:|$)/.test(message)) return message;
  return 'No se pudo. Inténtalo otra vez.';
}
