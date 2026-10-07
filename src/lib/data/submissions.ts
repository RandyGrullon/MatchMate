import type { Filter } from '../backend/types';
import { scoreGame } from '../bowling';
import { uuidv7 } from '../db/ids';
import type { CompressedImage } from '../image';
import type { BowlingEvent, Entry, GameFrames, Submission } from '../types';
import { lastBall } from '../balls';
import { queueGameBalls, rememberBall } from './balls';
import { backend, enqueue, getUserId, invalidate, rpc, select, useLive, type Live, type QueryDesc } from './client';
import { keys, tags } from './keys';
import { organizerTags } from './organizer';
import { overlaySubs, pendingOps } from './pending';
import { toSubmission, type SubmissionRow } from './rows';
import type { Wire } from './stamp';
import { useTopic } from './topics';
import { stashPhoto } from './uploads';

// ---------- Lecturas ----------

/** Envíos (con los que están en la cola de este teléfono y todavía no llegan). */
export async function fetchSubmissions(desc: QueryDesc, filters: Filter[]): Promise<Wire<Submission>[]> {
  const rows = await select<SubmissionRow>({ table: 'submissions', filters, order: [{ col: 'created_at' }] });
  return overlaySubs(rows.map(toSubmission), desc, pendingOps(desc.lid));
}

/** Envíos de un evento (para ver en vivo lo que mandaron los jugadores). */
export function useEventSubmissions(lid: string | undefined, eventId: string | undefined): Live<Submission[]> {
  useTopic(lid && eventId ? `event:${eventId}` : null, lid ?? null);
  const desc: QueryDesc = { kind: 'subs', lid, eventId };
  return useLive<Submission[]>(
    lid && eventId ? keys.eventSubs(eventId) : null,
    desc,
    () => fetchSubmissions(desc, [{ col: 'event_id', op: 'eq', value: eventId }]),
    { initial: [], tags: lid && eventId ? [tags.league(lid), tags.subs(lid), tags.eventSubs(eventId)] : [] },
  );
}

/** Admin: envíos de la liga por estado. Los pendientes se avisan en vivo (o se consultan cada 45 s). */
export function useSubmissions(lid: string | undefined, status: Submission['status'] = 'pendiente'): Live<Submission[]> {
  useTopic(lid && status === 'pendiente' ? `league:${lid}` : null, lid ?? null);
  const desc: QueryDesc = { kind: 'subs', lid, status };
  return useLive<Submission[]>(
    lid ? keys.subs(lid, status) : null,
    desc,
    () =>
      fetchSubmissions(desc, [
        { col: 'league_id', op: 'eq', value: lid },
        { col: 'status', op: 'eq', value: status },
      ]),
    { initial: [], tags: lid ? [tags.league(lid), tags.subs(lid)] : [], pollMs: status === 'pendiente' ? 45_000 : undefined },
  );
}

export function usePlayerSubmissions(lid: string | undefined, playerId: string | undefined): Live<Submission[]> {
  const desc: QueryDesc = { kind: 'subs', lid, playerId };
  return useLive<Submission[]>(
    lid && playerId ? keys.playerSubs(lid, playerId) : null,
    desc,
    () =>
      fetchSubmissions(desc, [
        { col: 'league_id', op: 'eq', value: lid },
        { col: 'player_id', op: 'eq', value: playerId },
      ]),
    { initial: [], tags: lid ? [tags.league(lid), tags.subs(lid)] : [] },
  );
}

// ---------- Envíos del jugador (van por la cola) ----------

/** Envíos que salieron de este teléfono y todavía no confirma el servidor (para agregarles la lectura de la foto). */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Envío de un jugador: juegos (y foto si hay), quedan pendientes de aprobación. El id sale ya: sin señal el
 * envío queda en la cola (con la foto guardada en el teléfono) y sale solo al volver la conexión; `sent` se
 * cumple cuando el servidor lo tiene y falla si lo rechaza (la pantalla lo espera con un tiempo límite).
 */
export function submitGames(
  lid: string,
  input: {
    playerId: string;
    /** Evento elegido, o null para subir por fecha. */
    eventId: string | null;
    date: string | null;
    scores: (number | null)[];
    scanned: (number | null)[] | null;
    frames: Record<string, GameFrames> | null;
    photo: CompressedImage | null;
    /** Con qué bola tiró cada juego del envío ({"<juego>": bola}); se manda detrás del envío, en la misma cola. */
    balls?: Record<string, string> | null;
  },
): { id: string; sent: Promise<void> } {
  const id = uuidv7();
  const sent = (async () => {
    const uid = getUserId();
    const photo = input.photo && uid ? await stashPhoto(uid, lid, input.photo) : null;
    const { done } = enqueue<string>(
      'submit_games',
      {
        p_id: id,
        p_league: lid,
        p_player: input.playerId,
        p_event: input.eventId,
        p_date: input.eventId ? null : input.date,
        p_scores: input.scores,
        p_scanned: input.scanned,
        p_frames: input.frames,
        p_photo: photo,
      },
      { group: lid, label: 'Envío de juegos' },
    );
    if (input.balls) {
      queueGameBalls('sub', id, input.balls, lid);
      // Son juegos de ahora: la última bola se pone sola la próxima vez.
      rememberBall(lastBall(Object.values(input.balls)));
    }
    await done;
  })();
  inFlight.set(id, sent);
  void sent.then(
    () => inFlight.delete(id),
    () => inFlight.delete(id),
  );
  return { id, sent };
}

/**
 * Lo que leyó la IA en la foto de un envío y de qué fila (la foto se lee en segundo plano, así que llega después
 * de enviar). Si el envío todavía está en la cola, se espera a que llegue. El jugador lo pone una sola vez
 * mientras está pendiente; el admin, siempre.
 */
export async function setSubmissionScan(lid: string, subId: string, scanned: (number | null)[], scannedName: string | null) {
  await inFlight.get(subId);
  await rpc('set_submission_scan', { p_submission: subId, p_scanned: scanned, p_scanned_name: scannedName?.slice(0, 60) ?? null });
  invalidate(tags.subs(lid));
}

// ---------- Aprobar o rechazar (admin) ----------

/**
 * Aprueba un envío: copia los juegos (y sus cuadros) a la participación del jugador como verificados.
 * `values` va por juego del evento; `start` es el juego donde cae el J1 del envío. Un evento sin id (práctica
 * de una fecha que todavía no existe, ver practiceForDate) lo crea la base en la misma transacción.
 */
export async function approveSubmission(
  lid: string,
  sub: Submission,
  event: BowlingEvent,
  _entry: Entry | null,
  average: number,
  values: Record<number, number>,
  start: number,
): Promise<{ entryId: string; eventId: string }> {
  const frames: Record<string, GameFrames> = {};
  for (const [i, v] of Object.entries(values)) {
    const f = sub.frames?.[String(+i - start)];
    // Los cuadros solo valen si dan el mismo total que se aprueba.
    if (f && scoreGame(f.rolls).score === v) frames[i] = f;
  }
  const r = await rpc<{ entry_id: string; event_id: string }>('approve_submission', {
    p_submission: sub.id,
    p_values: values,
    p_frames: Object.keys(frames).length ? frames : null,
    p_event: event.id || null,
    p_average: average,
    p_games: event.games,
    // Dónde cae el J1 del envío: la bola de cada juego pasa a su juego del evento (20260930000100_bolas.sql).
    p_start: start,
  });
  // También lo pendiente de la liga (league_pending): el número de «Organizar» y la fila «Organizas esta liga» bajan ya.
  invalidate(
    tags.subs(lid),
    tags.entries(lid),
    tags.events(lid),
    tags.feeds,
    organizerTags.pending(lid),
    ...(r?.event_id ? [tags.eventEntries(r.event_id), tags.eventSubs(r.event_id)] : []),
  );
  return { entryId: r?.entry_id ?? '', eventId: r?.event_id ?? event.id };
}

export async function rejectSubmission(lid: string, sub: Pick<Submission, 'id'>, note: string | null) {
  await rpc('reject_submission', { p_submission: sub.id, p_note: note });
  invalidate(tags.subs(lid), tags.feeds, organizerTags.pending(lid));
}

/**
 * Libera espacio: borra las fotos de la liga de hace más de `months` meses (los juegos siguen verificados; solo
 * deja de verse la foto). Los archivos se quitan de Storage ahora (y si no se puede, la base los deja en cola).
 */
export async function deleteOldPhotos(lid: string, months: number): Promise<number> {
  const paths = (await rpc<string[] | null>('delete_old_photos', { p_league: lid, p_months: months })) ?? [];
  if (paths.length) await backend().storage.remove('scoreboards', paths).catch((e) => console.warn('[fotos] quedan en la cola de borrado', e));
  invalidate(tags.subs(lid));
  return paths.length;
}
