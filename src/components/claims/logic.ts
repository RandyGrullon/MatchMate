import type { PlayerClaim } from '../../lib/data/claims';

/**
 * Lógica de las pantallas de reclamos (sin React, para probarla sola). Los datos y las RPC están en
 * src/lib/data/claims.ts.
 */

/** Lo que ya jugó un jugador en la liga (cuántas filas tiene en cada tabla). */
export interface PlayerHistory {
  /** Participaciones con juegos (boliche y los que anotan por evento). */
  entries: number;
  /** Partidos (raqueta y equipos). */
  matches: number;
  /** Tarjetas de golf. */
  golfCards: number;
  /** Pruebas de natación. */
  swims: number;
}

export const EMPTY_HISTORY: PlayerHistory = { entries: 0, matches: 0, golfCards: 0, swims: 0 };

export const historyTotal = (h: PlayerHistory) => h.entries + h.matches + h.golfCards + h.swims;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** «12 eventos con juegos · 3 partidos»; sin nada: «Todavía no ha jugado». */
export function historyText(h: PlayerHistory): string {
  const parts = [
    h.entries ? count(h.entries, 'evento con juegos', 'eventos con juegos') : '',
    h.matches ? count(h.matches, 'partido', 'partidos') : '',
    h.golfCards ? count(h.golfCards, 'tarjeta de golf', 'tarjetas de golf') : '',
    h.swims ? count(h.swims, 'prueba de natación', 'pruebas de natación') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Todavía no ha jugado';
}

/** Cuántos pedidos esperan decisión (sin contar los propios: el admin que pide queda aprobado solo). */
export const pendingCount = (list: readonly PlayerClaim[], uid?: string | null) =>
  list.filter((c) => c.status === 'pending' && c.userId !== uid).length;

/** El pedido pendiente de ese jugador (para la marca en la lista de jugadores). */
export const pendingFor = (list: readonly PlayerClaim[], playerId: string) =>
  list.find((c) => c.status === 'pending' && c.playerId === playerId) ?? null;

/** «hace un momento», «hace 5 min», «hace 3 h», «hace 2 días» (la hora en ISO). */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/** La marca del estado de un pedido. */
export function statusLabel(c: Pick<PlayerClaim, 'status'>): { text: string; tone: 'warn' | 'ok' | 'danger' | 'neutral' } {
  switch (c.status) {
    case 'pending':
      return { text: 'Pendiente de aprobación', tone: 'warn' };
    case 'approved':
      return { text: 'Aprobado', tone: 'ok' };
    case 'rejected':
      return { text: 'Rechazado', tone: 'danger' };
    default:
      return { text: 'Cancelado', tone: 'neutral' };
  }
}

/** Qué mostrar en el inicio de la liga a un miembro (su pedido, o la invitación a buscar su nombre). */
export type BannerState =
  | { kind: 'pending'; claim: PlayerClaim }
  | { kind: 'rejected'; claim: PlayerClaim }
  | { kind: 'search' }
  | { kind: 'none' };

/** Un rechazo se muestra en el inicio de la liga durante estos días. */
export const REJECTED_DAYS = 7;

export function bannerState({
  claim,
  ownHistory,
  freeCount,
  dismissed,
  now = Date.now(),
}: {
  /** El pedido de la cuenta en la liga (useMyClaim). */
  claim: PlayerClaim | null;
  /** Lo que jugó su jugador propio (null = todavía cargando). */
  ownHistory: PlayerHistory | null;
  /** Cuántos jugadores sin cuenta se pueden pedir. */
  freeCount: number;
  /** La cuenta cerró la invitación a buscar su nombre (o ya ese rechazo). */
  dismissed: (key: string) => boolean;
  now?: number;
}): BannerState {
  if (claim?.status === 'pending') return { kind: 'pending', claim };
  if (claim?.status === 'rejected' && !dismissed(`rechazo:${claim.id}`)) {
    const at = Date.parse(claim.decidedAt ?? claim.changedAt);
    if (Number.isFinite(at) && now - at <= REJECTED_DAYS * 86400_000) return { kind: 'rejected', claim };
  }
  if (claim?.status === 'approved') return { kind: 'none' };
  if (!ownHistory || historyTotal(ownHistory) > 0 || freeCount === 0 || dismissed('buscar')) return { kind: 'none' };
  return { kind: 'search' };
}

/**
 * Lo que dice el toast al unirse eligiendo un jugador de la lista («¿Quién eres?»). `playerId` es el jugador que
 * devolvió join_league y `claimId` su 'claim_id' (undefined si quien llama no lo tiene: se supone pendiente).
 */
export function joinClaimMessage(
  choice: string | null,
  playerName: string | null,
  playerId: string | null,
  claimId?: string | null,
): string | null {
  if (!choice) return null;
  const who = playerName?.trim() || 'ese jugador';
  if (playerId === choice) return `Listo: ahora eres ${who}.`;
  if (claimId === null) return `${who} ya tiene cuenta o alguien más lo pidió: te dejamos tu propio jugador. Si eras tú, avísale al admin.`;
  return `Pediste ser ${who}. Queda pendiente de aprobación del admin; mientras, juegas con tu cuenta.`;
}
