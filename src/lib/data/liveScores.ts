import type { LiveScore } from '../types';
import { enqueue, useLive, select, type Live } from './client';
import { keys, tags } from './keys';
import { collapse, overlayLive, pendingOps } from './pending';
import { toLive, type LiveRow } from './rows';
import type { Wire } from './stamp';
import { useTopic } from './topics';

/**
 * Juegos que los jugadores van anotando en su teléfono (tabla live_states). Mientras la pizarra está abierta
 * llegan por tiempo real con el estado completo; sin tiempo real se consulta cada 15–20 s, pero solo se bajan
 * las filas cuya versión cambió (para no gastar el egress del plan gratis con muchos espectadores).
 */

/** Última lectura de cada evento: fila por sujeto con su versión. */
const seen = new Map<string, Map<string, LiveRow>>();

export async function fetchEventLive(lid: string, eventId: string): Promise<Wire<LiveScore>[]> {
  const byEvent = { col: 'event_id', op: 'eq' as const, value: eventId };
  const before = seen.get(eventId);
  let rows: LiveRow[];
  if (!before) {
    rows = await select<LiveRow>({ table: 'live_states', filters: [byEvent] });
  } else {
    const versions = await select<Pick<LiveRow, 'subject_key' | 'version'>>({ table: 'live_states', columns: 'subject_key,version', filters: [byEvent] });
    const changed = versions.filter((v) => before.get(v.subject_key)?.version !== v.version).map((v) => v.subject_key);
    const fresh = changed.length
      ? await select<LiveRow>({ table: 'live_states', filters: [byEvent, { col: 'subject_key', op: 'in', value: changed }] })
      : [];
    const byKey = new Map(fresh.map((r) => [r.subject_key, r] as const));
    rows = versions.map((v) => byKey.get(v.subject_key) ?? before.get(v.subject_key)).filter((r): r is LiveRow => !!r);
  }
  seen.set(eventId, new Map(rows.map((r) => [r.subject_key, r] as const)));
  const list = rows.map(toLive).filter((l): l is Wire<LiveScore> => !!l);
  return overlayLive(list, eventId, pendingOps(lid));
}

/** Juegos que los jugadores van anotando en su teléfono en ese evento (en vivo). */
export function useEventLive(lid: string | undefined, eventId: string | undefined): Live<LiveScore[]> {
  useTopic(lid && eventId ? `event:${eventId}` : null, lid ?? null);
  return useLive<LiveScore[]>(lid && eventId ? keys.live(eventId) : null, lid ? { kind: 'live', lid, eventId } : null, () => fetchEventLive(lid!, eventId!), {
    initial: [],
    tags: lid && eventId ? [tags.league(lid), tags.live(eventId)] : [],
  });
}

/**
 * Publica (o quita, si no hay ninguno) los juegos que el jugador lleva anotados en el evento. Va por la cola:
 * sin señal se guarda y al volver se manda solo el último estado. Se cumple cuando el servidor lo tiene.
 */
export async function publishLiveScores(lid: string, eventId: string, playerId: string, values: string[]): Promise<void> {
  const scores = values.map((v) => (v.trim() === '' ? null : Number(v)));
  while (scores.length && scores[scores.length - 1] == null) scores.pop();
  const { done } = enqueue(
    'publish_live',
    { p_event: eventId, p_scores: scores },
    { group: lid, collapseKey: collapse.live(eventId, playerId), label: 'Juegos en vivo' },
  );
  await done;
}
