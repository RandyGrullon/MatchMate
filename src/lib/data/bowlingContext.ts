import { useMemo } from 'react';
import type { GameContext } from '../bowlingSeason';
import { rpc, useLive, type Live } from './client';
import { sortedKey, tags } from './keys';
import { chunks } from './rows';

/**
 * Lo que hace falta para marcar «Récord personal» y «+15 sobre tu promedio» en juegos de boliche que el teléfono no
 * tiene con toda su historia (la pantalla del evento, las tarjetas del perfil): bowling_game_context
 * (20260929000700_temporadas.sql), hasta 100 participaciones por llamada, con la RLS de quien mira. Las marcas las
 * decide src/lib/bowlingSeason.ts. Solo depende de lo jugado ANTES de cada evento: casi nunca cambia.
 */

export interface GameContextRow extends GameContext {
  entryId: string;
  playerId: string;
  leagueId: string;
  seasonId: string | null;
  prevSeason: (GameContext['prevSeason'] & { id: string }) | null;
  /** El promedio congelado de la participación (el mismo `frozen` que usa la pantalla del evento). */
  average: number | null;
}

const BATCH = 100;

export async function fetchBowlingGameContext(entryIds: readonly string[]): Promise<Record<string, GameContextRow>> {
  const ids = [...new Set(entryIds)];
  const parts = await Promise.all(chunks(ids, BATCH).map((c) => rpc<GameContextRow[] | null>('bowling_game_context', { p_entries: c })));
  const out: Record<string, GameContextRow> = {};
  for (const row of parts.flat()) {
    if (row?.entryId) out[row.entryId] = { ...row, averageOverride: row.averageOverride ?? null, prevSeason: row.prevSeason ?? null, average: row.average ?? null };
  }
  return out;
}

/** El contexto de cada participación (por id). `lid`: la liga, para volver a leer cuando cambian sus juegos. */
export function useBowlingGameContext(entryIds: readonly string[], lid?: string | null): Live<Record<string, GameContextRow>> {
  const ids = useMemo(() => [...new Set(entryIds.filter(Boolean))], [entryIds]);
  const key = ids.length ? `bowlctx:${sortedKey(ids)}` : null;
  return useLive<Record<string, GameContextRow>>(key, key ? { kind: 'bowling-context', lid: lid ?? undefined } : null, () => fetchBowlingGameContext(ids), {
    initial: {},
    tags: lid ? [tags.league(lid), tags.entries(lid)] : ['people'],
    staleMs: 5 * 60_000,
  });
}
