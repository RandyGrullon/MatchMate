/**
 * Datos de la liga por cajas y la escalera (20260927000700_raqueta.sql). Lecturas con la caché de consultas
 * (Live<T>, copia en el teléfono para ver sin señal) y tiempo real por el tema del evento ('ladder' {t, op});
 * escrituras por RPC (son del admin o de fuera de la cancha: necesitan señal). El resultado del partido del reto
 * va por el flujo de siempre (matches.ts: finishMatch, confirmResult…), que sí usa la cola.
 */
import type { RealtimeMessage } from '../../../lib/backend/types';
import { getUserId, invalidate, queryClient, rpc, select, useLive, type Live } from '../../../lib/data/client';
import { tags } from '../../../lib/data/keys';
import { draftArg, matchTags, type MatchDraft } from '../../../lib/data/matches';
import { uuidv7 } from '../../../lib/db/ids';
import type { BoxMove } from '../../../sports/formats';
import { toChallenge, toRung, type ChallengeRow, type LadderChallenge, type Rung, type RungRow } from './logic/ladder';

export const ladderKeys = {
  rungs: (eventId: string) => `ladder:rungs:${eventId}`,
  challenges: (eventId: string) => `ladder:ch:${eventId}`,
};

export const ladderTag = (eventId: string) => `ladder:${eventId}`;

const RUNG_COLUMNS = 'event_id,entrant_id,position,player_id,team_id,joined_at';
const CHALLENGE_COLUMNS =
  'id,event_id,challenger,challenged,challenger_pos,challenged_pos,match_id,status,accept_by,play_by,accepted_at,resolved_at,winner,note,created_at';

export async function fetchRungs(lid: string, eventId: string): Promise<Rung[]> {
  const rows = await select<RungRow>({
    table: 'ladder_rungs',
    columns: RUNG_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'event_id', op: 'eq', value: eventId },
    ],
    order: [{ col: 'position', asc: true }],
  });
  return rows.map(toRung).sort((a, b) => a.position - b.position);
}

export async function fetchChallenges(lid: string, eventId: string): Promise<LadderChallenge[]> {
  const rows = await select<ChallengeRow>({
    table: 'ladder_challenges',
    columns: CHALLENGE_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'event_id', op: 'eq', value: eventId },
    ],
    order: [{ col: 'created_at', asc: false }],
  });
  return rows.map(toChallenge).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Qué se vuelve a leer con cada aviso 'ladder' (o al consultar sin tiempo real). */
export function ladderMessageTags(eventId: string, msg: Pick<RealtimeMessage, 'event' | 'payload'> | null): string[] {
  if (msg && msg.event !== 'ladder') return [];
  return [ladderTag(eventId)];
}

/** Escucha los avisos de la escalera mientras la pantalla está abierta (sin cuenta: consulta cada 30–45 s). */
export function useLadderTopic(eventId: string | undefined) {
  const topic = eventId ? `event:${eventId}` : null;
  queryClient.useTopic(
    topic,
    (msg) => {
      if (eventId) invalidate(...ladderMessageTags(eventId, msg));
    },
    {
      onPoll: () => eventId && invalidate(ladderTag(eventId)),
      pollOnly: !getUserId(),
      pollMs: getUserId() ? undefined : [30_000, 45_000],
    },
  );
}

/** Puestos de la escalera (1.º primero). */
export function useLadderRungs(lid: string | undefined, eventId: string | undefined): Live<Rung[]> {
  useLadderTopic(eventId);
  return useLive<Rung[]>(lid && eventId ? ladderKeys.rungs(eventId) : null, lid && eventId ? { kind: 'ladderRungs', lid, eventId } : null, () => fetchRungs(lid!, eventId!), {
    initial: [],
    tags: lid && eventId ? [tags.league(lid), ladderTag(eventId)] : [],
  });
}

/** Retos de la escalera (los más nuevos primero). */
export function useLadderChallenges(lid: string | undefined, eventId: string | undefined): Live<LadderChallenge[]> {
  return useLive<LadderChallenge[]>(
    lid && eventId ? ladderKeys.challenges(eventId) : null,
    lid && eventId ? { kind: 'ladderChallenges', lid, eventId } : null,
    () => fetchChallenges(lid!, eventId!),
    { initial: [], tags: lid && eventId ? [tags.league(lid), ladderTag(eventId)] : [] },
  );
}

const afterLadder = (lid: string, eventId: string) =>
  invalidate(ladderTag(eventId), matchTags.league(lid), matchTags.event(eventId), matchTags.mine, tags.events(lid), tags.event(eventId));

/** Admin: la escalera completa en orden (quien no esté, sale). */
export async function setLadder(lid: string, eventId: string, entrants: readonly string[]): Promise<number> {
  const n = await rpc<number>('set_ladder', { p_event: eventId, p_entrants: [...entrants] });
  afterLadder(lid, eventId);
  return n ?? entrants.length;
}

/** Entrar a la escalera (abajo). Sin `entrant`: mi jugador o mi pareja. Devuelve el puesto. */
export async function joinLadder(lid: string, eventId: string, entrant?: string | null): Promise<number> {
  const pos = await rpc<number>('join_ladder', { p_event: eventId, ...(entrant ? { p_entrant: entrant } : {}) });
  afterLadder(lid, eventId);
  return pos ?? 0;
}

export async function leaveLadder(lid: string, eventId: string, entrant: string): Promise<boolean> {
  const out = await rpc<boolean>('leave_ladder', { p_event: eventId, p_entrant: entrant });
  afterLadder(lid, eventId);
  return out !== false;
}

/** Retar (el retador es mi participante; el admin puede retar por otro). Devuelve el id del reto. */
export async function createChallenge(lid: string, eventId: string, challenged: string, challenger?: string | null): Promise<string> {
  const id = uuidv7();
  const out = await rpc<string>('create_challenge', { p_event: eventId, p_challenged: challenged, p_id: id, ...(challenger ? { p_challenger: challenger } : {}) });
  afterLadder(lid, eventId);
  return out ?? id;
}

/** Aceptar (con cuándo y dónde, si se sabe). Devuelve el estado: 'accepted' o el que quedó (p. ej. 'walkover'). */
export async function acceptChallenge(lid: string, eventId: string, id: string, when?: { scheduledAt?: string | null; court?: string | null }): Promise<string> {
  const out = await rpc<string>('accept_challenge', {
    p_challenge: id,
    ...(when?.scheduledAt ? { p_scheduled_at: when.scheduledAt } : {}),
    ...(when?.court?.trim() ? { p_court: when.court.trim() } : {}),
  });
  afterLadder(lid, eventId);
  return out ?? 'accepted';
}

export async function cancelChallenge(lid: string, eventId: string, id: string, note?: string): Promise<boolean> {
  const out = await rpc<boolean>('cancel_challenge', { p_challenge: id, ...(note?.trim() ? { p_note: note.trim().slice(0, 500) } : {}) });
  afterLadder(lid, eventId);
  return out !== false;
}

const SYNC_EVERY_MS = 5 * 60_000;
const syncKey = (eventId: string) => `mm:escalera-al-dia:${eventId}`;

/**
 * Pone la escalera al día (plazos vencidos y resultados que cuentan a las 48 h). La pantalla lo llama al abrir,
 * como mucho cada 5 minutos por escalera (se recuerda en el teléfono). Sin sesión no hace nada.
 */
export async function syncLadder(lid: string, eventId: string, opts: { force?: boolean; now?: number } = {}): Promise<number> {
  if (!getUserId()) return 0;
  const now = opts.now ?? Date.now();
  if (!opts.force) {
    try {
      const last = Number(localStorage.getItem(syncKey(eventId)));
      if (Number.isFinite(last) && now - last < SYNC_EVERY_MS) return 0;
    } catch {
      // sin almacenamiento: se pide igual
    }
  }
  const n = (await rpc<number>('sync_ladder', { p_event: eventId })) ?? 0;
  try {
    localStorage.setItem(syncKey(eventId), String(now));
  } catch {
    // sin almacenamiento
  }
  if (n > 0) afterLadder(lid, eventId);
  return n;
}

// ---------- Liga por cajas ----------

export interface BoxMonthInput {
  month: number;
  boxes: string[][];
  drafts: readonly MatchDraft[];
  label?: string;
  start?: string | null;
  end?: string | null;
  /** Al cerrar el mes anterior: quién sube y quién baja. */
  moves?: readonly BoxMove[];
}

/**
 * Admin: abre el mes (y cierra el anterior si lo hay) en una sola llamada: cajas, partidos del mes (lo que no se
 * jugó del mes anterior queda anulado) y las subidas y bajadas. Devuelve los ids de los partidos.
 */
export async function saveBoxMonth(lid: string, eventId: string, input: BoxMonthInput): Promise<string[]> {
  const matches = input.drafts.map((d) => draftArg({ ...d, id: d.id ?? uuidv7() }));
  const ids = await rpc<string[]>('save_box_month', {
    p_event: eventId,
    p_month: input.month,
    p_boxes: input.boxes,
    p_matches: matches,
    p_label: input.label?.trim() || null,
    p_start: input.start ?? null,
    p_end: input.end ?? null,
    p_moves: input.moves ? [...input.moves] : null,
  });
  invalidate(matchTags.league(lid), matchTags.event(eventId), matchTags.mine, tags.events(lid), tags.event(eventId), tags.feeds);
  return ids ?? [];
}
