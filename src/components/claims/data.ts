import { useEffect, useMemo } from 'react';
import { claimTags, sortClaims, toClaim, CLAIM_COLUMNS, useLeagueClaims, type ClaimRow, type PlayerClaim } from '../../lib/data/claims';
import { invalidate, select, useLive, type Live } from '../../lib/data/client';
import { tags } from '../../lib/data/keys';
import { EMPTY_HISTORY, pendingCount, type PlayerHistory } from './logic';

/**
 * Lecturas de las pantallas de reclamos que no están en src/lib/data/claims.ts: lo que jugó un jugador (para que
 * el admin sepa qué se junta) y los pedidos pendientes de todas las ligas donde la cuenta es admin (la campana).
 */

const HISTORY_LIMIT = 1000;

/** Cuántas filas tiene el jugador en una tabla (0 si la tabla no se puede leer). */
async function countRows(table: string, playerId: string): Promise<number> {
  try {
    const rows = await select<{ player_id: string }>({
      table,
      columns: 'player_id',
      filters: [{ col: 'player_id', op: 'eq', value: playerId }],
      limit: HISTORY_LIMIT,
    });
    return rows.length;
  } catch (e) {
    console.warn(`[reclamos] no se pudo contar ${table}`, e);
    return 0;
  }
}

export async function fetchPlayerHistory(playerId: string): Promise<PlayerHistory> {
  const [entries, matches, golfCards, swims] = await Promise.all([
    countRows('entries', playerId),
    countRows('match_players', playerId),
    countRows('golf_cards', playerId),
    countRows('swim_entries', playerId),
  ]);
  return { entries, matches, golfCards, swims };
}

/** Lo que jugó el jugador en la liga (null mientras carga o sin jugador). */
export function usePlayerHistory(lid: string | null | undefined, playerId: string | null | undefined): Live<PlayerHistory | null> {
  const on = !!(lid && playerId);
  const live = useLive<PlayerHistory>(
    on ? `claims:hist:${playerId}` : null,
    on ? { kind: 'claims:hist', lid: lid as string, playerId: playerId as string } : null,
    () => fetchPlayerHistory(playerId as string),
    {
      initial: EMPTY_HISTORY,
      tags: on ? [tags.players(lid as string), tags.entries(lid as string), claimTags.league(lid as string)] : [],
      staleMs: 60_000,
    },
  );
  return useMemo(() => ({ ...live, data: on && !live.loading ? live.data : null }), [live, on]);
}

/** Admin: cuántos pedidos de la liga esperan decisión (para las marcas de las pestañas). 0 si no es admin. */
export function usePendingClaimCount(lid: string | null | undefined, uid?: string | null): number {
  const list = useLeagueClaims(lid).data;
  return useMemo(() => pendingCount(list, uid), [list, uid]);
}

export async function fetchPendingClaimsOf(lids: readonly string[]): Promise<PlayerClaim[]> {
  if (!lids.length) return [];
  const rows = await select<ClaimRow>({
    table: 'player_claims',
    columns: CLAIM_COLUMNS,
    filters: [
      { col: 'league_id', op: 'in', value: [...lids] },
      { col: 'status', op: 'eq', value: 'pending' },
    ],
    order: [{ col: 'created_at', asc: false }],
    limit: 200,
  });
  return sortClaims(rows.map(toClaim));
}

/**
 * Los pendientes de todas esas ligas (donde la cuenta es dueña o admin), en una sola lectura. Vuelve a leer cada
 * minuto mientras el tiempo real no avise 'claims'.
 */
export function usePendingClaimsOf(lids: readonly string[]): Live<PlayerClaim[]> {
  const sorted = useMemo(() => [...new Set(lids)].sort(), [lids]);
  const key = sorted.join(',');
  return useLive<PlayerClaim[]>(
    sorted.length ? `claims:admin:${key}` : null,
    sorted.length ? { kind: 'claims', id: key } : null,
    () => fetchPendingClaimsOf(sorted),
    {
      initial: [],
      tags: sorted.map((l) => claimTags.league(l)),
      staleMs: 30_000,
      pollMs: 60_000,
    },
  );
}

/** Mientras la cuenta tiene un pedido pendiente, vuelve a leer sus pedidos cada `everyMs` (para enterarse de la decisión). */
export function useRefreshWhilePending(pending: boolean, everyMs = 90_000) {
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => invalidate(claimTags.mine), everyMs);
    return () => clearInterval(t);
  }, [pending, everyMs]);
}
