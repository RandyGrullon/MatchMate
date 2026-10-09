import { useEffect, useMemo, useState } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import type { UserProfile } from '../types';
import { getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live } from './client';
import { peopleTags, type PublicProfile } from './follows';
import { keys, tags } from './keys';

/**
 * @usuario y buscar personas (20260929000200_invitaciones.sql).
 *
 * - Toda cuenta tiene un @usuario (la base se lo pone al crearla, a partir del nombre): 3 a 20 minúsculas, números,
 *   '_' y puntos solo por dentro, sin '..'. Se cambia con set_username (5 cambios por día) y mientras se escribe
 *   se pregunta cómo está con username_status.
 * - search_people: por @usuario (empieza con) o por nombre (lo contiene, sin acentos). Vacío: a quién sigo. Con una
 *   liga, dice quién ya está en ella y quién ya tiene invitación (la hoja de invitar, src/lib/data/invites.ts).
 *
 * RPC: set_username, username_status, search_people.
 */

// ---------- @usuario ----------

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** El formato de la base (CHECK profiles_username_format); además, sin '..' (ver `usernameProblem`). */
export const USERNAME_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;

/** Las reglas en palabras (para cuando no se sabe qué falló). */
export const USERNAME_RULES = 'De 3 a 20 letras sin acentos, números, _ o puntos (los puntos solo por dentro).';

/** Lo que escribe la persona como lo guarda la base: sin espacios alrededor, en minúsculas y sin una @ al principio. */
export function normalizeUsername(input: string | null | undefined): string {
  const v = (input ?? '').trim().toLowerCase();
  return v.startsWith('@') ? v.slice(1) : v;
}

/** Qué le falta a un @usuario: muy corto, muy largo, caracteres que no van o puntos mal puestos. */
export type UsernameProblem = 'corto' | 'largo' | 'caracteres' | 'puntos';

/** null = el formato está bien (si está libre lo dice `checkUsername`). Se normaliza antes de mirar. */
export function usernameProblem(v: string | null | undefined): UsernameProblem | null {
  const u = normalizeUsername(v);
  if (/[^a-z0-9_.]/.test(u)) return 'caracteres';
  if (u.length < USERNAME_MIN) return 'corto';
  if (u.length > USERNAME_MAX) return 'largo';
  if (u.startsWith('.') || u.endsWith('.') || u.includes('..')) return 'puntos';
  return USERNAME_RE.test(u) ? null : 'caracteres';
}

export function usernameProblemText(problem: UsernameProblem): string {
  switch (problem) {
    case 'corto':
      return `Usa al menos ${USERNAME_MIN} caracteres.`;
    case 'largo':
      return `Usa ${USERNAME_MAX} caracteres o menos.`;
    case 'puntos':
      return 'Los puntos van solo por dentro, y nunca dos seguidos.';
    default:
      return 'Usa solo letras sin acentos, números, _ y puntos.';
  }
}

/** Cómo está un @usuario: el mío, libre, de otra cuenta, con mal formato o reservado para la app. */
export type UsernameStatus = 'mine' | 'ok' | 'taken' | 'invalid' | 'reserved';

/**
 * Pregunta a la base cómo está un @usuario mientras se escribe (600 consultas por hora: esperar a que deje de
 * escribir). Con mal formato ni pregunta: 'invalid'.
 */
export async function checkUsername(v: string): Promise<UsernameStatus> {
  const u = normalizeUsername(v);
  if (usernameProblem(u)) return 'invalid';
  return rpc<UsernameStatus>('username_status', { p_username: u });
}

/**
 * Cambia el @usuario de la cuenta. Devuelve cómo quedó (el mismo que ya tenía no cuenta en el límite). El perfil
 * de la cuenta cambia al momento y lo social se vuelve a leer.
 */
export async function setUsername(uid: string, v: string): Promise<string> {
  const u = normalizeUsername(v);
  const saved = (await rpc<string | null>('set_username', { p_username: u })) || u;
  const mine = queryClient.getQueryData<UserProfile | null>(keys.profile(uid));
  if (mine && mine.username !== saved) queryClient.setQueryData<UserProfile | null>(keys.profile(uid), { ...mine, username: saved });
  updateCached<PublicProfile | null>('publicProfile', (p, d) => (p && d.id === uid && p.username !== saved ? { ...p, username: saved } : p));
  invalidate(tags.profile(uid), peopleTags.all);
  return saved;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();

/** El error de set_username en palabras simples. Con `value` (lo que escribió), el formato dice qué falló. */
export function usernameErrorText(e: unknown, value?: string): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const kind = e instanceof BackendError ? e.kind : null;
  const code = messageOf(e).split(/[\s:]/)[0];
  if (code === 'duplicado' || kind === 'conflict') return 'Ese usuario ya lo tiene otra persona.';
  if (code === 'reservado') return 'Ese usuario no está disponible.';
  if (code === 'rate_limited' || kind === 'rate_limited') return 'Cambiaste tu usuario muchas veces hoy. Prueba mañana.';
  if (code === 'invalido') {
    const problem = value === undefined ? null : usernameProblem(value);
    return problem ? usernameProblemText(problem) : USERNAME_RULES;
  }
  if (kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (kind === 'auth') return 'Entra a tu cuenta para cambiar tu usuario.';
  return 'No se pudo guardar tu usuario. Prueba otra vez.';
}

// ---------- Buscar personas ----------

/** Una persona en la búsqueda, vista por la cuenta de la sesión (y la liga, si se pidió). */
export interface PersonHit {
  id: string;
  name: string;
  /** Sin la @. */
  username: string;
  isFollowing: boolean;
  followsYou: boolean;
  /** Ya es miembro de la liga que se pidió (false sin liga). */
  inLeague: boolean;
  /** Ya tiene una invitación pendiente a esa liga (false sin liga). */
  invited: boolean;
  /** Ruta de su foto en el bucket `avatars` (falta en una copia vieja hasta que se vuelve a leer). */
  avatar?: string | null;
}

/** Lo que la base mira de la búsqueda. */
export const PEOPLE_QUERY_MAX = 60;
/** Con menos letras la base no busca (vacío sí: a quién sigo). */
export const PEOPLE_QUERY_MIN = 2;
/** Espera después de la última tecla. */
export const PEOPLE_DEBOUNCE_MS = 250;

/** La búsqueda como la mira la base: hasta 60, sin espacios alrededor, en minúsculas y sin una @ al principio. */
export function peopleQuery(input: string | null | undefined): string {
  const v = (input ?? '').slice(0, PEOPLE_QUERY_MAX).trim().toLowerCase();
  return v.startsWith('@') ? v.slice(1) : v;
}

export const peopleSearchKey = (query: string, lid?: string | null) => `people:search:${lid || '-'}:${query}`;

/** Etiquetas de una búsqueda: lo social, las búsquedas y, con liga, sus invitaciones. */
export const peopleSearchTags = (lid?: string | null): string[] =>
  lid ? [peopleTags.all, peopleTags.search, tags.invites(lid)] : [peopleTags.all, peopleTags.search];

const toHit = (r: Partial<PersonHit>): PersonHit => ({
  id: String(r.id),
  name: (r.name ?? '').trim(),
  username: r.username ?? '',
  isFollowing: r.isFollowing === true,
  followsYou: r.followsYou === true,
  inLeague: r.inLeague === true,
  invited: r.invited === true,
  avatar: typeof r.avatar === 'string' && r.avatar ? r.avatar : null,
});

/**
 * Personas: vacío = las cuentas que sigo (la más reciente primero); 1 letra = nada (ni pregunta); si no, por
 * @usuario o nombre (primero el @usuario exacto, luego a quien sigo). Nunca la cuenta de la sesión ni las
 * bloqueadas. Con `lid` (hay que ser miembro), `inLeague` e `invited`.
 */
export async function fetchPeople(query: string, lid?: string | null, limit = 30): Promise<PersonHit[]> {
  const q = peopleQuery(query);
  if (q.length > 0 && q.length < PEOPLE_QUERY_MIN) return [];
  const rows = await rpc<Partial<PersonHit>[] | null>('search_people', { p_query: q, p_league: lid || null, p_limit: limit });
  return Array.isArray(rows) ? rows.filter((r) => r && r.id).map(toHit) : [];
}

export interface PeopleLive extends Live<PersonHit[]> {
  /** false mientras espera a que deje de escribir (se sigue viendo la lista de antes). */
  settled: boolean;
  /** La búsqueda de la lista que se ve (ya normalizada). */
  query: string;
}

const NO_HITS: PersonHit[] = [];

/**
 * Búsqueda de personas con espera de 250 ms después de la última tecla. No se guarda en el teléfono; fresca 15 s.
 * Se vuelve a leer al seguir a alguien, al invitar y con el tiempo real de invitaciones. Sin cuenta, nada.
 */
export function usePeople(query: string, lid?: string | null): PeopleLive {
  const q = peopleQuery(query);
  const [wanted, setWanted] = useState(q);
  useEffect(() => {
    if (wanted === q) return;
    const t = setTimeout(() => setWanted(q), PEOPLE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, wanted]);

  const key = getUserId() ? peopleSearchKey(wanted, lid) : null;
  if (key) remember(key, { kind: 'peopleSearch', lid: lid || undefined, id: wanted });
  const st = queryClient.useQuery<PersonHit[]>(key, () => fetchPeople(wanted, lid), {
    initial: NO_HITS,
    tags: peopleSearchTags(lid),
    staleMs: 15_000,
    persist: false,
  });
  const settled = wanted === q;
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error, settled, query: wanted }), [st, settled, wanted]);
}

/** Cambio optimista en todas las búsquedas guardadas (las de esa liga si se pasa `lid`). */
export function patchPeople(fn: (hit: PersonHit) => PersonHit, lid?: string | null) {
  updateCached<PersonHit[]>('peopleSearch', (list, d) => {
    if (lid !== undefined && (d.lid ?? null) !== (lid || null)) return list;
    let changed = false;
    const next = list.map((h) => {
      const n = fn(h);
      if (n !== h) changed = true;
      return n;
    });
    return changed ? next : list;
  });
}
