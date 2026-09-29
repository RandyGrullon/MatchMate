import { useEffect } from 'react';
import type { Backend, RealtimeMessage } from '../backend/types';
import { watchTopic } from '../db/query';
import { backend, getUserId, invalidate, queryClient } from './client';
import { keys, tags } from './keys';
import { laneTags } from './lanes';
import { liveId } from './rows';
import type { LiveScore } from '../types';
import type { Wire } from './stamp';

/**
 * Tiempo real por temas (`event:<id>`, `league:<id>`, `user:<id>`), uno por tema aunque lo pidan varias
 * pantallas. Los avisos solo dicen qué cambió: se invalidan esas etiquetas y la caché vuelve a leer. El en vivo
 * trae el estado completo y se pone directo en la caché. Si el canal falla (o hay demasiadas conexiones) se
 * consulta cada 15–20 s; oculta más de 60 s, la pantalla se desconecta y al volver se pone al día.
 */

interface Watching {
  count: number;
  stop: () => void;
}

const watching = new Map<string, Watching>();

type LivePayload = { k?: string; player_id?: string | null; s?: { scores?: (number | null)[] }; v?: number; at?: string; deleted?: boolean };

/** El en vivo llega completo: se pone en la caché sin volver a leer (ahorra consultas). */
function applyLive(eventId: string, p: LivePayload) {
  const key = keys.live(eventId);
  const list = queryClient.getQueryData<Wire<LiveScore>[]>(key);
  const pid = p.player_id;
  if (!list || !pid) {
    invalidate(tags.live(eventId));
    return;
  }
  const id = liveId(eventId, pid);
  const rest = list.filter((l) => l.id !== id);
  const scores = p.s?.scores;
  queryClient.setQueryData<Wire<LiveScore>[]>(
    key,
    p.deleted || !Array.isArray(scores) ? rest : [...rest, { id, eventId, playerId: pid, scores, updatedAt: p.at ?? new Date().toISOString() }],
  );
}

/** Qué etiquetas invalida cada aviso (la liga hace falta para las lecturas de toda la liga). */
export function handleMessage(topic: string, lid: string | null, msg: RealtimeMessage) {
  const [kind, id] = [topic.slice(0, topic.indexOf(':')), topic.slice(topic.indexOf(':') + 1)];
  if (kind === 'event') {
    if (msg.event === 'live') return applyLive(id, (msg.payload ?? {}) as LivePayload);
    if (msg.event === 'entries') return invalidate(tags.eventEntries(id), ...(lid ? [tags.entries(lid)] : []));
    if (msg.event === 'submissions') return invalidate(tags.eventSubs(id), ...(lid ? [tags.subs(lid)] : []));
    if (msg.event === 'rsvps') return invalidate(tags.event(id));
    // Pistas del boliche.
    if (msg.event === 'lanes') return invalidate(laneTags.event(id));
  } else if (kind === 'league') {
    if (msg.event === 'events') return invalidate(tags.events(id));
    if (msg.event === 'announcements') return invalidate(`announcements:${id}`);
    // Aprobar un envío también cambia las participaciones.
    if (msg.event === 'submissions') return invalidate(tags.subs(id), tags.entries(id), tags.feeds);
    // Reclamos «ese jugador soy yo» (etiquetas de claimTags en ./claims): al aprobar cambian los jugadores.
    if (msg.event === 'claims') return invalidate(`claims:${id}`, tags.players(id), tags.entries(id));
    // Invitaciones a la liga (src/lib/data/invites.ts): la hoja de invitar dice quién ya tiene una.
    if (msg.event === 'invites') return invalidate(tags.invites(id), 'people:search');
  } else if (kind === 'user') {
    if (msg.event === 'submission') return invalidate(tags.feeds);
    // Alguien me siguió / dejó de seguirme o le dio me gusta a un juego mío (etiquetas de src/lib/data/follows.ts).
    if (msg.event === 'follow' || msg.event === 'like') return invalidate('people:notices', `people:${id}`, tags.feeds);
    if (msg.event === 'claims') return invalidate('claims:me', tags.members, tags.feeds);
    // Me invitaron, o una que mandé se aceptó, rechazó o retiró (aceptar también cambia mis membresías).
    if (msg.event === 'invites') return invalidate(tags.myInvites, 'people:search', tags.members, tags.feeds);
  }
}

/** Sin tiempo real: lo que se vuelve a leer cada 15–20 s. */
function poll(topic: string) {
  const [kind, id] = [topic.slice(0, topic.indexOf(':')), topic.slice(topic.indexOf(':') + 1)];
  if (kind === 'event') invalidate(tags.live(id), tags.eventEntries(id), tags.eventSubs(id), tags.event(id), laneTags.event(id));
  else if (kind === 'league') invalidate(tags.events(id), tags.subs(id), `announcements:${id}`);
  else if (kind === 'user') invalidate(tags.feeds);
}

function acquire(topic: string, lid: string | null): () => void {
  let w = watching.get(topic);
  if (!w) {
    let b: Backend | null = null;
    try {
      b = backend();
    } catch {
      // sin backend: solo consultas
    }
    const watch = watchTopic(b, topic, (msg) => handleMessage(topic, lid, msg), {
      onPoll: () => poll(topic),
      // Sin cuenta no hay canal privado: se consulta.
      pollOnly: !getUserId(),
    });
    w = { count: 0, stop: () => watch.stop() };
    watching.set(topic, w);
  }
  const mine = w;
  mine.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--mine.count <= 0) {
      mine.stop();
      if (watching.get(topic) === mine) watching.delete(topic);
    }
  };
}

/** Escucha un tema sin pantalla (lo mismo que useTopic). Devuelve cómo soltarlo. */
export const watchTopicFor = (topic: string, lid: string | null = null): (() => void) => acquire(topic, lid);

/**
 * Temas de la pantalla de un evento: el del evento (en vivo, juegos, envíos, «voy») y, con cuenta, el de la liga,
 * que es por donde avisan los cambios del evento mismo (el juego que sumó otro jugador en la práctica, el nombre, el
 * anuncio). En BowlingX el evento se veía en vivo; sin el de la liga, un jugador no veía el juego nuevo hasta volver
 * a la app. Sin cuenta el evento ya se consulta cada 15–20 s por su propio tema.
 */
export function eventTopics(lid: string | null | undefined, eventId: string | null | undefined, signedIn: boolean): string[] {
  if (!lid || !eventId) return [];
  return signedIn ? [`event:${eventId}`, `league:${lid}`] : [`event:${eventId}`];
}

/** Mientras la pantalla esté abierta, escucha ese tema (null = nada). */
export function useTopic(topic: string | null, lid: string | null = null) {
  useEffect(() => {
    if (!topic) return;
    return acquire(topic, lid);
  }, [topic, lid]);
}
