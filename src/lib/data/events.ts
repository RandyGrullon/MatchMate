import { uuidv7 } from '../db/ids';
import type { BowlingEvent, EventType, RankBy } from '../types';
import { backend, enqueue, getUserId, invalidate, rpc, select, sentOrQueued, useLive, type Live } from './client';
import { keys, tags } from './keys';
import { collapse, overlayEvent, overlayEvents, pendingOps } from './pending';
import { toEvent, type EventRow, type RsvpRow, type TeamRow } from './rows';
import type { Wire } from './stamp';
import { eventTopics, useTopic } from './topics';

// ---------- Lecturas ----------
// El evento de la app lleva sus equipos y su «voy» adentro (como en BowlingX): se leen de teams y event_rsvps.

export async function fetchEvents(lid: string): Promise<Wire<BowlingEvent>[]> {
  const byLeague = [{ col: 'league_id', op: 'eq' as const, value: lid }];
  const [events, teams, rsvps] = await Promise.all([
    select<EventRow>({ table: 'events', filters: byLeague, order: [{ col: 'date', asc: false }] }),
    select<TeamRow>({ table: 'teams', columns: 'id,event_id,name,sort_order,color', filters: byLeague }),
    select<RsvpRow>({ table: 'event_rsvps', columns: 'event_id,player_id,going', filters: byLeague }),
  ]);
  return overlayEvents(
    events.map((e) => toEvent(e, teams, rsvps)),
    pendingOps(lid),
  );
}

export async function fetchEvent(lid: string, id: string): Promise<Wire<BowlingEvent> | null> {
  const byEvent = [{ col: 'event_id', op: 'eq' as const, value: id }];
  const [events, teams, rsvps] = await Promise.all([
    select<EventRow>({
      table: 'events',
      filters: [
        { col: 'id', op: 'eq', value: id },
        { col: 'league_id', op: 'eq', value: lid },
      ],
    }),
    select<TeamRow>({ table: 'teams', columns: 'id,event_id,name,sort_order,color', filters: byEvent }),
    select<RsvpRow>({ table: 'event_rsvps', columns: 'event_id,player_id,going', filters: byEvent }),
  ]);
  return events[0] ? overlayEvent(toEvent(events[0], teams, rsvps), pendingOps(lid)) : null;
}

/** Eventos de la liga, los más nuevos primero. */
export const useEvents = (lid: string | undefined): Live<BowlingEvent[]> =>
  useLive<BowlingEvent[]>(lid ? keys.events(lid) : null, lid ? { kind: 'events', lid } : null, () => fetchEvents(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.events(lid)] : [],
  });

/** Etiquetas de la lectura de un evento: el aviso 'events' de la liga y los del evento la vuelven a leer. */
export const eventTags = (lid: string, id: string) => [tags.league(lid), tags.events(lid), tags.event(id)];

/** Un evento, en vivo mientras está en pantalla (su «voy» y sus juegos cambian durante la noche). */
export function useEvent(lid: string | undefined, id: string | undefined): Live<BowlingEvent | null> {
  const [eventTopic = null, leagueTopic = null] = eventTopics(lid, id, !!getUserId());
  useTopic(eventTopic, lid ?? null);
  useTopic(leagueTopic, lid ?? null);
  return useLive<BowlingEvent | null>(lid && id ? keys.event(lid, id) : null, lid ? { kind: 'event', lid, id } : null, () => fetchEvent(lid!, id!), {
    initial: null,
    tags: lid && id ? eventTags(lid, id) : [],
  });
}

// ---------- Escrituras ----------

export interface EventInput {
  type: EventType;
  name: string;
  date: string;
  games: number;
  hcpBase: number;
  hcpPercent: number;
  individualRankBy: RankBy;
  teamRankBy: RankBy;
  categoryCuts: [number, number, number];
  teamSize: number;
  announcement: string;
  /** Hora de inicio 'HH:MM' (opcional). */
  startTime?: string | null;
}

/** EventInput (parcial) → claves de la base para `update_event`. */
export function eventPatch(patch: Partial<EventInput>): Record<string, unknown> {
  const map: Record<string, string> = {
    type: 'type',
    name: 'name',
    date: 'date',
    games: 'games',
    hcpBase: 'hcp_base',
    hcpPercent: 'hcp_percent',
    individualRankBy: 'individual_rank_by',
    teamRankBy: 'team_rank_by',
    categoryCuts: 'category_cuts',
    teamSize: 'team_size',
    announcement: 'announcement',
    startTime: 'start_time',
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) out[map[k]] = k === 'startTime' ? v || null : v;
  return out;
}

const afterEvent = (lid: string, id?: string) => invalidate(tags.events(lid), ...(id ? [tags.event(id)] : []), tags.feeds);

export async function createEvent(lid: string, input: EventInput): Promise<string> {
  const id = uuidv7();
  await rpc('create_event', {
    p_id: id,
    p_league: lid,
    p_type: input.type,
    p_date: input.date,
    p_name: input.name.trim(),
    p_games: input.games,
    p_hcp_base: input.hcpBase,
    p_hcp_percent: input.hcpPercent,
    p_individual_rank_by: input.individualRankBy ?? null,
    p_team_rank_by: input.teamRankBy ?? null,
    p_category_cuts: input.categoryCuts,
    p_team_size: input.teamSize,
    p_announcement: input.announcement ?? '',
    p_start_time: input.startTime || null,
  });
  afterEvent(lid);
  return id;
}

export async function updateEvent(lid: string, id: string, patch: Partial<EventInput>) {
  const p = eventPatch(patch);
  if (!Object.keys(p).length) return;
  await rpc('update_event', { p_event: id, p_patch: p });
  afterEvent(lid, id);
}

/** Rutas en Storage de las fotos del evento (vacío si no se pueden leer). */
async function eventPhotoPaths(lid: string, id: string): Promise<string[]> {
  try {
    const rows = await select<{ path: string }>({
      table: 'photos',
      columns: 'path',
      filters: [
        { col: 'league_id', op: 'eq', value: lid },
        { col: 'event_id', op: 'eq', value: id },
      ],
    });
    return rows.map((r) => r.path);
  } catch (e) {
    console.warn('[fotos] no se pudieron leer las del evento', e);
    return [];
  }
}

/**
 * Borra el evento con sus participaciones, envíos, fotos, equipos, «voy», en vivo y social. La base borra las filas
 * de las fotos; los archivos se quitan de Storage aquí (como deleteOldPhotos): nadie más vacía esa cola, y en
 * BowlingX borrar el evento liberaba el espacio de sus fotos.
 */
export async function deleteEvent(lid: string, id: string) {
  const paths = await eventPhotoPaths(lid, id);
  await rpc('delete_event', { p_event: id });
  if (paths.length) await backend().storage.remove('scoreboards', paths).catch((e) => console.warn('[fotos] quedan en la cola de borrado', e));
  afterEvent(lid, id);
  invalidate(tags.entries(lid), tags.subs(lid), tags.social(lid));
}

/**
 * Un juego más en la sesión (hasta 10): en la práctica siguieron jugando. Va por la cola (sirve sin señal):
 * lleva los juegos que veía el teléfono, así si otro ya lo agregó no se suma dos veces. En un torneo solo el
 * admin lo cambia (necesita señal).
 */
export async function addEventGame(lid: string, event: Pick<BowlingEvent, 'id' | 'games'> & { type?: BowlingEvent['type'] }): Promise<void> {
  if (event.games >= 10) return;
  if (event.type && event.type !== 'practica') {
    await updateEvent(lid, event.id, { games: event.games + 1 });
    return;
  }
  const { done } = enqueue<number>(
    'add_practice_game',
    { p_event: event.id, p_expected: event.games },
    { group: lid, label: `Juego ${event.games + 1} de la práctica` },
  );
  await sentOrQueued(done);
}

/** El jugador confirma (o quita) que va a la práctica. Va por la cola: sirve sin señal. */
export async function setRsvp(lid: string, eventId: string, playerId: string, going: boolean): Promise<void> {
  const { done } = enqueue(
    'set_rsvp',
    { p_event: eventId, p_going: going, p_player: playerId },
    { group: lid, collapseKey: collapse.rsvp(eventId, playerId), label: going ? '«Voy» a la práctica' : 'Quitar «Voy»' },
  );
  await sentOrQueued(done);
}

/**
 * Evento donde se aprueba un envío por fecha: la práctica de ese día si ya existe. Si no, un evento todavía
 * sin crear (id vacío): `approveSubmission` deja que la base la cree en la misma transacción (sin duplicarla).
 */
export async function practiceForDate(_lid: string, events: BowlingEvent[], date: string, games: number): Promise<BowlingEvent> {
  const existing = events.find((e) => e.type === 'practica' && e.date === date);
  if (existing) return existing;
  return {
    id: '',
    type: 'practica',
    name: '',
    date,
    games: Math.min(10, Math.max(3, games)),
    hcpBase: 0,
    hcpPercent: 0,
    individualRankBy: 'scratch',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 0,
    announcement: '',
    teams: {},
    playerCount: 0,
  };
}
