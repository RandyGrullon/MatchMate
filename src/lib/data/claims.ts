import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError } from '../backend/types';
import type { GenericNotice } from '../notifications';
import { getUserId, invalidate, rpc, select, updateCached, useLive, type Live } from './client';
import { tags } from './keys';
import { useTopic } from './topics';

/**
 * Reclamos de jugadores (20260929000100_reclamos.sql): el admin crea jugadores sin cuenta (por nombre y con lo que
 * pide su deporte); quien se hace una cuenta dice «ese soy yo» y el dueño o un admin de la liga lo aprueba. Al
 * aprobar, la base junta el jugador propio de la cuenta con el reclamado (juegos, partidos, tarjetas…); si los dos
 * jugaron lo mismo, falla con 'conflicto: <qué choca>' y el admin lo arregla antes.
 *
 * Unirse eligiendo «¿Quién eres?» (join_league con p_prefer) o con el mismo nombre ya no vincula: deja el pedido
 * (join_league devuelve `claim_id`). `claim_player` ahora es un pedido y devuelve su id.
 *
 * Lecturas: `player_claims` (la RLS deja ver los suyos a quien pidió y los de la liga a sus admins y al
 * superadmin). RPC: request_player_claim, cancel_player_claim, decide_player_claim, player_claim_conflicts.
 * Tiempo real: 'claims' en 'league:<liga>' y 'user:<cuenta>' (las etiquetas de abajo).
 *
 * Las horas van en texto ISO (`requestedAt`, `changedAt`, `decidedAt`): no se convierten a `Stamp`.
 */

// ---------- Tipos ----------

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ClaimRow {
  id: string;
  league_id: string;
  player_id: string;
  user_id: string;
  status: ClaimStatus;
  note: string | null;
  claimant_name: string;
  player_name: string;
  created_at: string;
  updated_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface PlayerClaim {
  id: string;
  leagueId: string;
  /** El jugador sin cuenta que se pide. */
  playerId: string;
  /** La cuenta que lo pide. */
  userId: string;
  status: ClaimStatus;
  note: string | null;
  /** Cómo se llamaban al pedirlo. */
  claimantName: string;
  playerName: string;
  requestedAt: string;
  /** Último cambio (sirve para saber si hay algo nuevo). */
  changedAt: string;
  decidedBy: string | null;
  /** Cuándo se aprobó, rechazó o canceló. */
  decidedAt: string | null;
  decisionNote: string | null;
}

/** Lo que chocaría al aprobar (player_claim_conflicts). */
export interface ClaimConflict {
  what: 'entries' | 'matches' | 'golf_cards' | 'swim_entries' | 'ladder_rungs' | 'event_signups' | string;
  label: string;
  count: number;
}

export const CLAIM_COLUMNS =
  'id,league_id,player_id,user_id,status,note,claimant_name,player_name,created_at,updated_at,decided_by,decided_at,decision_note';

/** Largo máximo de la nota (la base: 300). */
export const CLAIM_NOTE_MAX = 300;

export const toClaim = (r: ClaimRow): PlayerClaim => ({
  id: r.id,
  leagueId: r.league_id,
  playerId: r.player_id,
  userId: r.user_id,
  status: r.status,
  note: r.note ?? null,
  claimantName: (r.claimant_name ?? '').trim() || 'Alguien',
  playerName: (r.player_name ?? '').trim() || 'un jugador',
  requestedAt: r.created_at,
  changedAt: r.updated_at ?? r.created_at,
  decidedBy: r.decided_by ?? null,
  decidedAt: r.decided_at ?? null,
  decisionNote: r.decision_note ?? null,
});

// ---------- Claves y etiquetas ----------

export const claimTags = {
  /** Los pedidos de una liga (lista del admin). */
  league: (lid: string) => `claims:${lid}`,
  /** Los pedidos de la cuenta de la sesión. */
  mine: 'claims:me',
};

export const claimKeys = {
  league: (lid: string) => `claims:l:${lid}`,
  mine: (uid: string) => `claims:u:${uid}`,
};

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** Los pendientes primero (el más viejo arriba: lleva más esperando); después los decididos, el más nuevo arriba. */
export function sortClaims(list: readonly PlayerClaim[]): PlayerClaim[] {
  return [...list].sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : 1;
    const pb = b.status === 'pending' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (pa === 0) return ms(a.requestedAt) - ms(b.requestedAt) || a.id.localeCompare(b.id);
    return ms(b.decidedAt ?? b.changedAt) - ms(a.decidedAt ?? a.changedAt) || a.id.localeCompare(b.id);
  });
}

/** El pedido de la cuenta en esa liga: el pendiente o, si no hay, el último decidido (no los cancelados). */
export function pickClaim(list: readonly PlayerClaim[], lid: string): PlayerClaim | null {
  const mine = list.filter((c) => c.leagueId === lid && c.status !== 'cancelled');
  return mine.find((c) => c.status === 'pending') ?? sortClaims(mine)[0] ?? null;
}

// ---------- Lecturas ----------

export async function fetchLeagueClaims(lid: string): Promise<PlayerClaim[]> {
  const rows = await select<ClaimRow>({
    table: 'player_claims',
    columns: CLAIM_COLUMNS,
    filters: [{ col: 'league_id', op: 'eq', value: lid }],
    order: [{ col: 'created_at', asc: false }],
    limit: 200,
  });
  return sortClaims(rows.map(toClaim));
}

export async function fetchMyClaims(uid: string): Promise<PlayerClaim[]> {
  const rows = await select<ClaimRow>({
    table: 'player_claims',
    columns: CLAIM_COLUMNS,
    filters: [{ col: 'user_id', op: 'eq', value: uid }],
    order: [{ col: 'created_at', asc: false }],
    limit: 100,
  });
  return sortClaims(rows.map(toClaim));
}

/** Admin (dueño, admin o superadmin): los pedidos de la liga. Para los demás la RLS devuelve lista vacía. */
export function useLeagueClaims(lid: string | null | undefined): Live<PlayerClaim[]> {
  useTopic(lid ? `league:${lid}` : null, lid ?? null);
  return useLive<PlayerClaim[]>(lid ? claimKeys.league(lid) : null, lid ? { kind: 'claims', lid } : null, () => fetchLeagueClaims(lid as string), {
    initial: [],
    tags: lid ? [claimTags.league(lid), tags.league(lid)] : [],
    staleMs: 30_000,
    // Mientras el tiempo real no avise 'claims' (src/lib/data/topics.ts), se vuelve a leer cada minuto.
    pollMs: 60_000,
  });
}

/** Los pedidos de la cuenta (todas sus ligas). */
export function useMyClaims(uid: string | null | undefined): Live<PlayerClaim[]> {
  useTopic(uid ? `user:${uid}` : null);
  return useLive<PlayerClaim[]>(uid ? claimKeys.mine(uid) : null, uid ? { kind: 'claims:mine', id: uid } : null, () => fetchMyClaims(uid as string), {
    initial: [],
    tags: uid ? [claimTags.mine] : [],
    staleMs: 30_000,
  });
}

/** El pedido de la cuenta de la sesión en esa liga (ver `pickClaim`). */
export function useMyClaim(lid: string | null | undefined, uid: string | null | undefined = getUserId()): Live<PlayerClaim | null> {
  const all = useMyClaims(uid);
  return useMemo(() => ({ ...all, data: lid ? pickClaim(all.data, lid) : null }), [all, lid]);
}

// ---------- Escrituras ----------

const cleanNote = (note: string | null | undefined) => {
  const t = (note ?? '').trim();
  return t ? t.slice(0, CLAIM_NOTE_MAX) : null;
};

/** Cambio optimista en todas las listas de pedidos que hay en la caché. */
function patchClaim(id: string, patch: Partial<PlayerClaim>) {
  const fn = (list: PlayerClaim[]) => {
    let changed = false;
    const next = list.map((c) => {
      if (c.id !== id) return c;
      changed = true;
      return { ...c, ...patch };
    });
    return changed ? sortClaims(next) : list;
  };
  updateCached<PlayerClaim[]>('claims', fn);
  updateCached<PlayerClaim[]>('claims:mine', fn);
}

/** Después de pedir o decidir: los pedidos, y si se aprobó, todo lo del jugador (se juntaron dos en uno). */
function afterClaim(lid: string, joined: boolean) {
  invalidate(claimTags.league(lid), claimTags.mine, tags.players(lid), tags.leagueMembers(lid), tags.members, tags.feeds);
  if (joined) invalidate(tags.entries(lid), tags.subs(lid), tags.events(lid), tags.social(lid));
}

/**
 * La cuenta pide ser ese jugador. Devuelve el id del pedido (null si el jugador ya era suyo). Si quien pide es
 * dueño o admin de la liga, la base lo aprueba al momento.
 */
export async function requestClaim(lid: string, playerId: string, note?: string | null): Promise<string | null> {
  const id = await rpc<string | null>('request_player_claim', { p_player: playerId, p_note: cleanNote(note) });
  afterClaim(lid, true);
  return id ?? null;
}

/** Quien pidió lo retira. */
export async function cancelClaim(lid: string, claimId: string): Promise<void> {
  patchClaim(claimId, { status: 'cancelled', decidedAt: new Date().toISOString() });
  try {
    await rpc('cancel_player_claim', { p_claim: claimId });
  } finally {
    afterClaim(lid, false);
  }
}

/** Dueño o admin: aprueba o rechaza. Devuelve cómo quedó (si otro admin ya lo decidió, lo que decidió él). */
export async function decideClaim(lid: string, claimId: string, approve: boolean, note?: string | null): Promise<ClaimStatus> {
  try {
    const status = await rpc<ClaimStatus>('decide_player_claim', { p_claim: claimId, p_approve: approve, p_note: cleanNote(note) });
    patchClaim(claimId, { status, decidedAt: new Date().toISOString(), decidedBy: getUserId(), decisionNote: cleanNote(note) });
    return status;
  } finally {
    afterClaim(lid, approve);
  }
}

/** Admin: lo que chocaría al aprobar (vacío = se puede aprobar). */
export async function fetchClaimConflicts(claimId: string): Promise<ClaimConflict[]> {
  const r = await rpc<ClaimConflict[] | null>('player_claim_conflicts', { p_claim: claimId });
  return Array.isArray(r) ? r : [];
}

// ---------- Errores ----------

const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();

/** Lo que choca, de un error 'conflicto: Juegos en el mismo evento (1), …'; null si el error es otro. */
export function claimConflictList(e: unknown): string[] | null {
  const m = /^conflicto:\s*([\s\S]*)$/.exec(messageOf(e));
  if (!m) return null;
  return m[1]
    .split(/,\s*(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** El error de un pedido o una decisión en palabras simples. */
export function claimErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const list = claimConflictList(e);
  if (list) {
    const what = list.length ? `: ${list.join(', ')}` : '';
    return `No se pueden juntar los dos jugadores${what}. Quita lo repetido y aprueba otra vez.`;
  }
  const kind = e instanceof BackendError ? e.kind : null;
  const code = messageOf(e).split(/[\s:]/)[0];
  if (kind === 'rate_limited' || code === 'rate_limited') return 'Hiciste muchos pedidos hoy. Prueba mañana.';
  if (kind === 'conflict' || code === 'duplicado') return 'Ese jugador ya tiene cuenta o alguien más lo pidió.';
  if (kind === 'permission' || code === 'no_permitido') return 'Solo el dueño o un admin de la liga puede hacer eso.';
  if (kind === 'not_found' || code === 'no_existe') return 'Ese pedido o ese jugador ya no existe.';
  if (kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (kind === 'validation' || code === 'invalido') return 'Ese jugador no se puede pedir (un menor, o ya se decidió).';
  return 'No se pudo. Prueba otra vez.';
}

// ---------- Avisos de la campana ----------

export type ClaimNoticeKind = 'claim-request' | 'claim-approved' | 'claim-rejected';

/** Aviso de un pedido: al admin (por decidir) o a quien pidió (ya decidido). `at` en ISO. */
export interface ClaimNotice {
  id: string;
  kind: ClaimNoticeKind;
  title: string;
  body: string;
  url: string;
  at: string;
  lid: string;
  sport: string | null;
}

/** Los decididos salen en la campana de quien pidió durante 14 días. */
export const CLAIM_NOTICE_WINDOW_MS = 14 * 86400_000;

export interface ClaimNoticeInput {
  /** La cuenta que mira (sus propios pedidos no le salen como admin). */
  uid: string | null | undefined;
  /** Pedidos de las ligas donde es admin (useLeagueClaims de cada una). */
  leagueClaims?: readonly PlayerClaim[];
  /** Sus pedidos (useMyClaims). */
  myClaims?: readonly PlayerClaim[];
  /** Para el nombre y el deporte de la liga. */
  leagues?: readonly { id: string; name: string; sport?: string | null }[];
  now?: number;
}

/** Pedidos por decidir → avisos al admin; decididos (aprobados o rechazados) → avisos a quien pidió. Nuevo primero. */
export function claimNotices({ uid, leagueClaims = [], myClaims = [], leagues = [], now = Date.now() }: ClaimNoticeInput): ClaimNotice[] {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const where = (lid: string) => {
    const name = byId.get(lid)?.name?.trim();
    return name ? `En ${name}. ` : '';
  };
  const sport = (lid: string) => byId.get(lid)?.sport ?? null;
  const out: ClaimNotice[] = [];
  const seen = new Set<string>();
  for (const c of leagueClaims) {
    if (c.status !== 'pending' || c.userId === uid || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: `reclamo:${c.id}`,
      kind: 'claim-request',
      title: `${c.claimantName} dice que es ${c.playerName}`,
      body: `${where(c.leagueId)}Toca para aprobar o rechazar.`,
      url: `/l/${c.leagueId}/admin?tab=reclamos`,
      at: c.requestedAt,
      lid: c.leagueId,
      sport: sport(c.leagueId),
    });
  }
  for (const c of myClaims) {
    if (uid && c.userId !== uid) continue;
    if ((c.status !== 'approved' && c.status !== 'rejected') || !c.decidedAt) continue;
    if (now - ms(c.decidedAt) > CLAIM_NOTICE_WINDOW_MS) continue;
    const ok = c.status === 'approved';
    out.push({
      id: `reclamo-${ok ? 'ok' : 'no'}:${c.id}`,
      kind: ok ? 'claim-approved' : 'claim-rejected',
      title: ok ? `Te aprobaron: ahora eres ${c.playerName}` : `No se aprobó: no quedaste como ${c.playerName}`,
      body: ok ? `${where(c.leagueId)}Tus juegos quedaron juntos.` : c.decisionNote?.trim() || `${where(c.leagueId)}Si es un error, habla con el admin.`,
      url: `/l/${c.leagueId}`,
      at: c.decidedAt,
      lid: c.leagueId,
      sport: sport(c.leagueId),
    });
  }
  return out.sort((a, b) => ms(b.at) - ms(a.at) || a.id.localeCompare(b.id));
}

/** Para la campana de hoy, que recibe avisos genéricos (`GenericNotice` de src/lib/notifications.ts). */
export const asGenericNotice = (n: ClaimNotice): GenericNotice => ({
  id: n.id,
  kind: 'social',
  title: n.title,
  body: n.body,
  url: n.url,
  at: n.at,
  lid: n.lid,
  sport: n.sport,
});
