import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import { isUuid } from '../db/ids';
import { gameMeta, isGameId, type GameId, type IdStatus, type LinkProvider, type Ownership, type RankMap, type RankSource } from '../../sports/esports';
import { backend, getUserId, invalidate, queryClient, rpc, select, useLive, type Live } from './client';
import { sortedKey } from './keys';
import type { Stamp } from '../types';
import type { Wire } from './stamp';

/**
 * IDs de juego, rangos y «Conectar con…» (docs/esports.md §6 y §10.2). La verificación solo existe donde es
 * automática (`verify` del catálogo): conectando la cuenta (Epic, Steam; Riot con RSO) o con la búsqueda de Riot (LoL y
 * VALORANT). En los demás juegos el ID y el rango quedan declarados y no son exclusivos.
 *
 * CONTRATO:
 * - Las filas son de `public.esports_game_ids` (20261008000100_esports.sql). Lo propio se lee entero con la RPC
 *   `esports_my_game_ids`; lo de otras cuentas, con `select` y solo las columnas públicas (`PUBLIC_COLUMNS`).
 * - Buscar un ID con la API del juego es la Edge Function `esports-verify`; conectar la cuenta, `esports-auth`
 *   (`startLink`). En el modo local no hay funciones: todo apagado (`useProviders`) y la búsqueda da `no_disponible`.
 * - «Tu ID pasó a otra cuenta» (alguien entró con esa cuenta de Epic/Steam/Riot en otra cuenta de MatchMate):
 *   `esports_my_id_moves` (los no vistos de los últimos 30 días) y `esports_seen_id_move` al cerrar el aviso.
 * - Escrituras con señal (no van por la cola).
 */

export interface GameIdRecord {
  userId: string;
  game: GameId;
  platform: string;
  region: string;
  idDisplay: string;
  idNormalized?: string;
  /** 'confirmado' = comprobado (ownership 'busqueda' o 'login'); 'pendiente' = declarado. */
  status: IdStatus;
  ownership: Ownership;
  ranks: RankMap;
  rankSource: RankSource;
  lookupName?: string | null;
  externalId?: string | null;
  verifiedAt: string | null;
  confirmedAt: string | null;
  updatedAt: Stamp | null;
}

export type LookupResult =
  | { status: 'found'; lookupId: string; displayName: string; ranks: RankMap }
  | { status: 'not_found' | 'no_disponible' | 'rate_limited' | 'error' };

/** Qué está encendido en esports-verify y esports-auth: los juegos con búsqueda y los proveedores para conectar. */
export interface ProvidersStatus {
  lookup: GameId[];
  link: Record<LinkProvider, boolean>;
}

/** Un ID de la cuenta que pasó a otra (alguien entró con esa cuenta de Epic, Steam o Riot en otra cuenta). */
export interface IdMove {
  id: string;
  game: GameId;
  platform: string;
  idDisplay: string;
  provider: LinkProvider;
  createdAt: string;
}

// ---------- Claves y etiquetas ----------

export const esportsIdKeys = {
  mine: (uid: string) => `esports-ids:mine:${uid}`,
  of: (game: GameId, ids: string) => `esports-ids:of:${game}:${ids}`,
  moves: (uid: string) => `esports-ids:moves:${uid}`,
  providers: 'esports-ids:providers',
};

export const esportsIdTags = {
  all: 'esports-ids',
  mine: 'esports-ids:mine',
  moves: 'esports-ids:moves',
} as const;

/** Columnas que cualquier cuenta puede leer de otra (grant select por columna, §9.3). */
export const PUBLIC_COLUMNS = 'user_id,game,platform,region,id_display,status,ranks,rank_source,ownership,verified_at,confirmed_at,updated_at';

/** Lo que usa el módulo y se cambia en las pruebas. */
export const esportsIdsDeps = {
  /** Lleva el navegador al paso «go» de esports-auth con un formulario POST (manda la cabecera Origin de la app). */
  navigate: (url: string) => postNavigate(url),
};

/** Navegación de verdad con POST (no fetch): esports-auth revisa que el Origin sea el de la app. */
function postNavigate(url: string) {
  if (typeof document === 'undefined') throw new BackendError('Conectar la cuenta solo funciona en el navegador.', 'validation', 'no_disponible');
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.style.display = 'none';
  document.body.appendChild(form);
  form.submit();
}

const isLocal = () => backend().mode === 'local';

// ---------- De la base a la app ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** El campo en camelCase o en snake_case (las RPC devuelven camelCase; las tablas, snake_case). */
function pick(r: Record<string, unknown>, camel: string): unknown {
  if (camel in r) return r[camel];
  const snake = camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return r[snake];
}
const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const ranksOf = (v: unknown): RankMap => (isObj(v) ? (v as RankMap) : {});
const statusOf = (v: unknown): IdStatus => (v === 'confirmado' ? 'confirmado' : 'pendiente');
const ownershipOf = (v: unknown): Ownership => (v === 'busqueda' || v === 'login' ? v : 'declarado');
const rankSourceOf = (v: unknown): RankSource => (v === 'verificado' ? v : 'declarado');
const isProvider = (v: unknown): v is LinkProvider => v === 'steam' || v === 'epic' || v === 'riot';

/** Una fila (RPC en camelCase o tabla en snake_case) → GameIdRecord (horas en texto: la caché las pasa a Stamp). null si no sirve. */
export function toGameIdRecord(raw: unknown): Wire<GameIdRecord> | null {
  if (!isObj(raw)) return null;
  const userId = s(pick(raw, 'userId'));
  const game = pick(raw, 'game');
  const idDisplay = s(pick(raw, 'idDisplay'));
  if (!userId || !isGameId(game) || !idDisplay) return null;
  const out: Wire<GameIdRecord> = {
    userId,
    game,
    platform: s(pick(raw, 'platform')) ?? '',
    region: s(pick(raw, 'region')) ?? '',
    idDisplay,
    status: statusOf(pick(raw, 'status')),
    ownership: ownershipOf(pick(raw, 'ownership')),
    ranks: ranksOf(pick(raw, 'ranks')),
    rankSource: rankSourceOf(pick(raw, 'rankSource')),
    verifiedAt: s(pick(raw, 'verifiedAt')),
    confirmedAt: s(pick(raw, 'confirmedAt')),
    updatedAt: s(pick(raw, 'updatedAt')),
  };
  // Lo que solo ve su dueño (esports_my_game_ids): si no vino, no se pone.
  const own = ['idNormalized', 'lookupName', 'externalId'] as const;
  for (const k of own) {
    const v = pick(raw, k);
    if (v !== undefined) (out as Record<string, unknown>)[k] = typeof v === 'string' ? v : null;
  }
  if (out.idNormalized === null) delete out.idNormalized;
  return out;
}

/** Una fila de `esports_my_id_moves` → IdMove (null si no sirve). */
export function toIdMove(raw: unknown): IdMove | null {
  if (!isObj(raw)) return null;
  const id = s(pick(raw, 'id'));
  const game = pick(raw, 'game');
  const idDisplay = s(pick(raw, 'idDisplay'));
  const provider = pick(raw, 'provider');
  if (!id || !isUuid(id) || !isGameId(game) || !idDisplay || !isProvider(provider)) return null;
  return { id, game, platform: s(pick(raw, 'platform')) ?? '', idDisplay, provider, createdAt: s(pick(raw, 'createdAt')) ?? '' };
}

const list = <T>(raw: unknown, fn: (r: unknown) => T | null): T[] => (Array.isArray(raw) ? raw.map(fn).filter((x): x is T => x !== null) : []);

export function toProvidersStatus(raw: unknown): ProvidersStatus {
  const r = isObj(raw) ? raw : {};
  const link = isObj(r.link) ? r.link : {};
  const games = (v: unknown) => (Array.isArray(v) ? v.filter(isGameId) : []);
  return { lookup: games(r.lookup), link: { steam: link.steam === true, epic: link.epic === true, riot: link.riot === true } };
}

export function toLookupResult(raw: unknown): LookupResult {
  const r = isObj(raw) ? raw : {};
  if (r.status === 'found' && typeof r.lookupId === 'string' && isUuid(r.lookupId)) {
    return { status: 'found', lookupId: r.lookupId, displayName: typeof r.displayName === 'string' ? r.displayName : '', ranks: ranksOf(r.ranks) };
  }
  if (r.status === 'not_found' || r.status === 'no_disponible' || r.status === 'rate_limited') return { status: r.status };
  return { status: 'error' };
}

/** Todo apagado (sin sesión, en el modo local o si la función no contesta). */
export const PROVIDERS_OFF: ProvidersStatus = { lookup: [], link: { steam: false, epic: false, riot: false } };

// ---------- Lecturas ----------

/** useQuery sin pasar las horas a Stamp (aquí van en texto) y sin guardar en el teléfono. */
function usePlainQuery<T>(key: string | null, fetcher: () => Promise<T>, initial: T, tagList: string[], staleMs?: number): Live<T> {
  const st = queryClient.useQuery<T>(key, fetcher, { initial, tags: tagList, persist: false, staleMs });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

const NO_IDS: Wire<GameIdRecord>[] = [];
const NO_MOVES: IdMove[] = [];

export const fetchMyGameIds = async (): Promise<Wire<GameIdRecord>[]> => list(await rpc('esports_my_game_ids'), toGameIdRecord);

/** Mis IDs (todas las columnas). */
export function useMyGameIds(uid: string | null | undefined): Live<GameIdRecord[]> {
  const key = uid ? esportsIdKeys.mine(uid) : null;
  return useLive<GameIdRecord[]>(key, key ? { kind: 'esportsIds', id: uid! } : null, fetchMyGameIds, {
    initial: NO_IDS,
    tags: [esportsIdTags.all, esportsIdTags.mine],
  });
}

export async function fetchGameIdsFor(userIds: readonly string[], game: GameId): Promise<Wire<GameIdRecord>[]> {
  const ids = [...new Set(userIds.filter(isUuid).map((id) => id.toLowerCase()))];
  if (!ids.length) return [];
  const rows = await select<Record<string, unknown>>({
    table: 'esports_game_ids',
    columns: PUBLIC_COLUMNS,
    filters: [
      { col: 'game', op: 'eq', value: game },
      { col: 'user_id', op: 'in', value: ids },
    ],
  });
  return list(rows, toGameIdRecord);
}

/** Los IDs de esas cuentas en ese juego (solo las columnas públicas). */
export function useGameIdsFor(userIds: readonly string[], game: GameId | null): Live<GameIdRecord[]> {
  const ids = useMemo(() => sortedKey(userIds.filter(isUuid).map((id) => id.toLowerCase())), [userIds]);
  const key = game && ids ? esportsIdKeys.of(game, ids) : null;
  return useLive<GameIdRecord[]>(key, key ? { kind: 'esportsIdsOf', id: key } : null, () => fetchGameIdsFor(ids.split(','), game!), {
    initial: NO_IDS,
    tags: [esportsIdTags.all],
  });
}

export async function fetchProviders(): Promise<ProvidersStatus> {
  if (isLocal()) return PROVIDERS_OFF;
  return toProvidersStatus(await backend().invoke('esports-verify', { action: 'providers' }));
}

/** Qué está encendido (búsquedas y «Conectar con…»). En el modo local, todo apagado. */
export function useProviders(): Live<ProvidersStatus> {
  return usePlainQuery(getUserId() ? esportsIdKeys.providers : null, fetchProviders, PROVIDERS_OFF, [esportsIdTags.all], 10 * 60_000);
}

/** Mis IDs que pasaron a otra cuenta y todavía no vi (los últimos 30 días), los más nuevos primero. */
export async function fetchMyIdMoves(): Promise<IdMove[]> {
  const moves = list(await rpc('esports_my_id_moves'), toIdMove);
  return moves.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Los avisos de «Tu ID pasó a otra cuenta» de la cuenta (vacío sin sesión). */
export function useMyIdMoves(uid: string | null | undefined): Live<IdMove[]> {
  return usePlainQuery(uid ? esportsIdKeys.moves(uid) : null, fetchMyIdMoves, NO_MOVES, [esportsIdTags.all, esportsIdTags.moves]);
}

/** Lo marca como visto (al cerrar el aviso): ya no vuelve a salir. */
export async function seenIdMove(id: string): Promise<void> {
  await rpc('esports_seen_id_move', { p_id: id });
  invalidate(esportsIdTags.moves);
}

// ---------- Escrituras: el ID y el rango ----------

const afterMine = () => invalidate(esportsIdTags.mine, esportsIdTags.all);

/** Guarda el ID (declarado). Si otra cuenta lo tiene conectado con su inicio de sesión: 'id_tomado'. */
export async function saveGameId(game: GameId, id: string, platform = '', region = ''): Promise<{ status: IdStatus; idDisplay: string }> {
  const res = await rpc<unknown>('esports_save_game_id', { p_game: game, p_id: id, p_platform: platform, p_region: region });
  afterMine();
  const r = isObj(res) ? res : {};
  return { status: statusOf(r.status), idDisplay: s(r.idDisplay) ?? id.trim() };
}

/** Busca el ID con la API del juego (esports-verify; solo LoL y VALORANT). En el modo local: no_disponible. */
export async function lookupGameId(game: GameId, id: string, platform = '', region = ''): Promise<LookupResult> {
  if (isLocal()) return { status: 'no_disponible' };
  return toLookupResult(await backend().invoke('esports-verify', { action: 'lookup', game, id, platform, region }));
}

/**
 * «Sí, soy yo»: deja el ID comprobado con lo que encontró la búsqueda (`lookupId`, de hace menos de 15 min). En LoL,
 * si la búsqueda trajo el rango, queda verificado.
 */
export async function confirmGameId(game: GameId, lookupId: string, platform = ''): Promise<{ status: IdStatus; rankSource: RankSource; ownership: Ownership }> {
  const res = await rpc<unknown>('esports_confirm_game_id', { p_game: game, p_platform: platform, p_lookup: lookupId });
  afterMine();
  const r = isObj(res) ? res : {};
  return { status: statusOf(r.status ?? 'confirmado'), rankSource: rankSourceOf(r.rankSource), ownership: ownershipOf(r.ownership ?? 'busqueda') };
}

/** El rango declarado (queda «Declarado»). */
export async function setRanks(game: GameId, ranks: RankMap, platform = ''): Promise<void> {
  await rpc('esports_set_ranks', { p_game: game, p_platform: platform, p_ranks: ranks });
  afterMine();
}

export async function deleteGameId(game: GameId, platform = ''): Promise<void> {
  await rpc('esports_delete_game_id', { p_game: game, p_platform: platform });
  afterMine();
}

/**
 * «Conectar con Steam / Epic / Riot»: pide el inicio a esports-auth (con la sesión) y lleva el navegador al
 * proveedor (por el paso «go», con un formulario: así la función sabe que viene de la app). Vuelve a
 * `/esports/mi-id?conectado=<proveedor>` o `?error=<codigo>`. Si no está encendido: BackendError 'no_disponible'.
 */
export async function startLink(provider: LinkProvider, game: GameId): Promise<void> {
  const off = new BackendError('no_disponible', 'validation', 'no_disponible');
  if (isLocal()) throw off;
  const res = await backend().invoke<unknown>('esports-auth/start', { provider, game });
  const r = isObj(res) ? res : {};
  if (r.status !== 'ok' || typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) throw off;
  esportsIdsDeps.navigate(r.url);
}

// ---------- Errores ----------

/** El código corto de la base: 'cerrado: …' → 'cerrado'. */
const errorCode = (e: unknown) => (e instanceof Error ? e.message : String(e ?? '')).trim().split(/[\s:]/)[0];

/** El error de un ID o un rango en palabras simples (§9.13). */
export function gameIdErrorText(e: unknown, game?: GameId): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const be = e instanceof BackendError ? e : null;
  const code = be?.code && !/^(P0001|\d{3}|[0-9A-Z]{5})$/.test(be.code) ? be.code : errorCode(e);
  const name = gameMeta(game)?.name ?? 'ese juego';
  switch (code) {
    case 'id_tomado':
      return 'Ese ID está conectado a otra cuenta con su inicio de sesión.';
    case 'sin_id':
      return `Primero pon tu ID de ${name}.`;
    case 'id_sin_comprobar':
      return `Este torneo pide tu ID de ${name} comprobado.`;
    case 'sin_rango':
      return `Este torneo pide tu rango verificado de ${name}.`;
    case 'cerrado':
      return `Ahora no se puede: tienes un torneo de ${name} en curso.`;
    case 'no_existe':
      return 'No encontramos ese ID. Revisa cómo lo escribiste.';
    case 'no_disponible':
      return 'Esto no está disponible ahora. Prueba más tarde.';
    case 'invalido':
      return 'Algo no cuadra: revisa el ID (o búscalo otra vez) y vuelve a intentar.';
  }
  if (be?.kind === 'rate_limited' || code === 'rate_limited') return 'Hiciste muchos intentos. Prueba más tarde.';
  if (be?.kind === 'permission' || code === 'no_permitido') return 'No tienes permiso para eso.';
  if (be?.kind === 'not_found') return 'No encontramos ese ID. Revisa cómo lo escribiste.';
  if (be?.kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (be?.kind === 'auth') return 'Entra a tu cuenta para eso.';
  if (be?.kind === 'validation') return 'Algo no cuadra: revisa los datos y vuelve a intentar.';
  return 'No se pudo. Prueba otra vez.';
}
