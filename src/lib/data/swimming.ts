import type { Filter, RealtimeMessage, SelectQuery } from '../backend/types';
import type { OutboxItem } from '../db/outbox';
import { uuidv7 } from '../db/ids';
import type { PoolLength, SwimDistance, SwimEvent, SwimGender, SwimStatus, SwimStroke, SwimSwim } from '../../sports/swimming';
import { enqueue, getUserId, invalidate, onOutbox, queryClient, rpc, select, sentOrQueued, updateCached, useLive, type Live } from './client';
import { tags } from './keys';
import { pendingOps } from './pending';
import { chunks } from './rows';
import { nowIso } from './stamp';

/**
 * Natación (Fase 7): encuentros, pruebas, clubes, nadadores, inscripciones, hoja de series y resultados.
 * Contrato de la base: supabase/migrations/20260927000500_natacion.sql.
 *
 * - Lecturas con la caché de consultas (se ven sin señal con lo último que se bajó). Los datos privados de los
 *   nadadores (año de nacimiento, sexo, tutor) solo los lee el admin y NO se guardan en el teléfono.
 * - Escrituras por RPC (admin, con señal), salvo los resultados de una serie: van por la cola sin conexión
 *   (una sola operación por serie, `swim_record_heat` con `p_op_id`), se ven de una en pantalla y salen solos.
 * - Tiempo real: `event:<id>` y `league:<id>` con el evento 'swim' ({t, op}); sin canal, se consulta.
 * - Las listas largas se leen de a páginas de 500 (el `max_rows` de Supabase) por id.
 *
 * Tiempos siempre en centésimas (enteros), como el motor (src/sports/swimming).
 */

// ---------- Tipos de la app ----------

/** Encuentro de club, «Control de marcas», o el encuentro de un torneo sin liga. */
export type MeetType = 'encuentro' | 'control' | 'torneo';
/** Categorías del encuentro: CCCAN (8 y menos … 18 y más), másters (de 5 en 5 desde 25) o sin categorías. */
export type AgeScheme = 'cccan' | 'masters' | 'none';
export type Sex = 'F' | 'M' | 'X';

export interface SwimMeet {
  /** Id del evento (events.id). */
  id: string;
  type: MeetType;
  name: string;
  date: string;
  /** 'HH:MM' o null. */
  startTime: string | null;
  announcement: string;
  pool: PoolLength;
  lanes: number;
  points: number[];
  ageGroups: AgeScheme;
  /** Hoja de series publicada (ISO) o null. */
  heatsPublishedAt: string | null;
  /** Encuentro cerrado (ISO) o null. */
  finalizedAt: string | null;
}

/** Una prueba del encuentro (lo que el motor llama SwimEvent, más su encuentro y su número). */
export interface SwimEventItem extends SwimEvent {
  meetId: string;
  num: number;
}

export interface SwimEntry {
  id: string;
  meetId: string;
  swimEventId: string;
  playerId: string;
  clubId: string | null;
  /** Categoría del nadador en el encuentro (id de AgeGroup) o null. */
  ageGroup: string | null;
  /** Siembra en centésimas; null = NT. */
  seed: number | null;
  heat: number | null;
  lane: number | null;
  time: number | null;
  status: SwimStatus;
  /** Cuándo se anotó su resultado (null = todavía no). */
  resultAt: string | null;
}

export interface SwimClub {
  id: string;
  name: string;
  short: string;
  color: string | null;
  /** Cuenta del entrenador (miembro de la liga) o null. */
  coachId: string | null;
}

/** Lo público del nadador: su club y su categoría ya calculada. */
export interface SwimmerInfo {
  playerId: string;
  clubId: string | null;
  category: string | null;
  categoryYear: number | null;
}

/** Lo privado (solo admins): nunca se guarda en el teléfono. */
export interface SwimmerPrivate {
  playerId: string;
  birthYear: number | null;
  sex: Sex | null;
  guardianName: string | null;
  /** Cuándo se registró el consentimiento del tutor (ISO) o null. */
  consentAt: string | null;
}

/** Un tiempo del historial de un nadador (lo que usa personalBests, más de dónde salió). */
export interface SwimHistoryItem extends SwimSwim {
  entryId: string;
  meetId: string;
  meetName: string;
  meetType: MeetType;
  swimEventId: string;
  gender: SwimGender;
  ageGroup: string | null;
}

// ---------- Filas de la base ----------

export interface SwimMeetRow {
  event_id: string;
  pool: number;
  lanes: number;
  points: number[];
  age_groups: AgeScheme;
  heats_published_at: string | null;
  finalized_at: string | null;
}

export interface MeetEventRow {
  id: string;
  type: string;
  name: string;
  date: string;
  start_time: string | null;
  announcement: string;
}

export interface SwimEventRow {
  id: string;
  event_id: string;
  num: number;
  distance: number;
  stroke: SwimStroke;
  pool: number;
  gender: SwimGender;
  age_groups: string[] | null;
}

export interface SwimEntryRow {
  id: string;
  event_id: string;
  swim_event_id: string;
  player_id: string;
  club_id: string | null;
  age_group: string | null;
  seed_cs: number | null;
  heat: number | null;
  lane: number | null;
  time_cs: number | null;
  status: SwimStatus;
  result_at: string | null;
}

export interface SwimClubRow {
  id: string;
  name: string;
  short: string;
  color: string | null;
  coach_id: string | null;
}

export interface SwimmerRow {
  player_id: string;
  club_id: string | null;
  category: string | null;
  category_year: number | null;
}

export interface PlayerPrivateRow {
  player_id: string;
  birth_year: number | null;
  sex: Sex | null;
  guardian_name: string | null;
  consent_at: string | null;
}

const MEET_TYPES: readonly string[] = ['encuentro', 'control', 'torneo'];
export const isMeetType = (t: string): t is MeetType => MEET_TYPES.includes(t);

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function toMeet(e: MeetEventRow, m: SwimMeetRow | undefined): SwimMeet {
  return {
    id: e.id,
    type: isMeetType(e.type) ? e.type : 'encuentro',
    name: e.name,
    date: e.date,
    startTime: hhmm(e.start_time),
    announcement: e.announcement ?? '',
    pool: m?.pool === 50 ? 50 : 25,
    lanes: m?.lanes ?? 6,
    points: Array.isArray(m?.points) ? m.points : [6, 4, 3, 2, 1],
    ageGroups: m?.age_groups ?? 'cccan',
    heatsPublishedAt: m?.heats_published_at ?? null,
    finalizedAt: m?.finalized_at ?? null,
  };
}

export const toSwimEvent = (r: SwimEventRow): SwimEventItem => ({
  id: r.id,
  meetId: r.event_id,
  num: r.num,
  distance: r.distance as SwimDistance,
  stroke: r.stroke,
  pool: r.pool === 50 ? 50 : 25,
  gender: r.gender,
  ageGroups: r.age_groups ?? [],
});

export const toSwimEntry = (r: SwimEntryRow): SwimEntry => ({
  id: r.id,
  meetId: r.event_id,
  swimEventId: r.swim_event_id,
  playerId: r.player_id,
  clubId: r.club_id,
  ageGroup: r.age_group,
  seed: r.seed_cs,
  heat: r.heat,
  lane: r.lane,
  time: r.time_cs,
  status: r.status,
  resultAt: r.result_at,
});

export const toClub = (r: SwimClubRow): SwimClub => ({ id: r.id, name: r.name, short: r.short ?? '', color: r.color, coachId: r.coach_id });

export const toSwimmer = (r: SwimmerRow): SwimmerInfo => ({
  playerId: r.player_id,
  clubId: r.club_id,
  category: r.category,
  categoryYear: r.category_year,
});

export const toPrivate = (r: PlayerPrivateRow): SwimmerPrivate => ({
  playerId: r.player_id,
  birthYear: r.birth_year,
  sex: r.sex,
  guardianName: r.guardian_name,
  consentAt: r.consent_at,
});

// ---------- Claves de la caché y etiquetas ----------

export const swimKeys = {
  meets: (lid: string) => `swim:meets:${lid}`,
  events: (meetId: string) => `swim:events:${meetId}`,
  entries: (meetId: string) => `swim:entries:${meetId}`,
  clubs: (lid: string) => `swim:clubs:${lid}`,
  swimmers: (lid: string) => `swim:swimmers:${lid}`,
  private: (lid: string) => `swim:private:${lid}`,
  history: (lid: string, playerId: string) => `swim:history:${lid}:${playerId}`,
  season: (lid: string) => `swim:season:${lid}`,
};

export const swimTags = {
  meets: (lid: string) => `swim:meets:${lid}`,
  meet: (meetId: string) => `swim:meet:${meetId}`,
  entries: (lid: string) => `swim:entries:${lid}`,
  meetEntries: (meetId: string) => `swim:entries:m:${meetId}`,
  events: (lid: string) => `swim:events:${lid}`,
  clubs: (lid: string) => `swim:clubs:${lid}`,
  swimmers: (lid: string) => `swim:swimmers:${lid}`,
};

// ---------- Lecturas ----------

/** Máximo de filas por consulta en Supabase (config.toml: max_rows = 500). */
export const PAGE_SIZE = 500;

/** Lee todo lo que devuelve la consulta, de a páginas por la columna `key` (ordenada). */
export async function selectAll<T extends Record<string, unknown>>(q: SelectQuery, key = 'id', page = PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  let last: unknown = null;
  for (;;) {
    const filters: Filter[] = [...(q.filters ?? []), ...(last != null ? [{ col: key, op: 'gt' as const, value: last }] : [])];
    const rows = await select<T>({ ...q, filters, order: [{ col: key }], limit: page });
    out.push(...rows);
    if (rows.length < page) return out;
    last = rows[rows.length - 1][key];
  }
}

const byLeague = (lid: string): Filter => ({ col: 'league_id', op: 'eq', value: lid });

export async function fetchMeets(lid: string): Promise<SwimMeet[]> {
  const [events, meets] = await Promise.all([
    select<MeetEventRow>({ table: 'events', columns: 'id,type,name,date,start_time,announcement', filters: [byLeague(lid)], order: [{ col: 'date', asc: false }] }),
    select<SwimMeetRow>({
      table: 'swim_meets',
      columns: 'event_id,pool,lanes,points,age_groups,heats_published_at,finalized_at',
      filters: [byLeague(lid)],
    }),
  ]);
  const byId = new Map(meets.map((m) => [m.event_id, m] as const));
  return events.map((e) => toMeet(e, byId.get(e.id)));
}

export async function fetchSwimEvents(lid: string, meetId: string): Promise<SwimEventItem[]> {
  const rows = await select<SwimEventRow>({
    table: 'swim_events',
    columns: 'id,event_id,num,distance,stroke,pool,gender,age_groups',
    filters: [byLeague(lid), { col: 'event_id', op: 'eq', value: meetId }],
    order: [{ col: 'num' }],
  });
  return rows.map(toSwimEvent);
}

const ENTRY_COLS = 'id,event_id,swim_event_id,player_id,club_id,age_group,seed_cs,heat,lane,time_cs,status,result_at';

/** Inscripciones y resultados del encuentro (con las series que este teléfono todavía no pudo enviar). */
export async function fetchSwimEntries(lid: string, meetId: string): Promise<SwimEntry[]> {
  const rows = await selectAll<SwimEntryRow & Record<string, unknown>>({
    table: 'swim_entries',
    columns: ENTRY_COLS,
    filters: [byLeague(lid), { col: 'event_id', op: 'eq', value: meetId }],
  });
  return overlaySwimResults(rows.map(toSwimEntry), pendingOps(lid));
}

export async function fetchClubs(lid: string): Promise<SwimClub[]> {
  const rows = await select<SwimClubRow>({ table: 'swim_clubs', columns: 'id,name,short,color,coach_id', filters: [byLeague(lid)], order: [{ col: 'name' }] });
  return rows.map(toClub);
}

export async function fetchSwimmers(lid: string): Promise<SwimmerInfo[]> {
  const rows = await selectAll<SwimmerRow & Record<string, unknown>>(
    { table: 'swim_swimmers', columns: 'player_id,club_id,category,category_year', filters: [byLeague(lid)] },
    'player_id',
  );
  return rows.map(toSwimmer);
}

export async function fetchSwimmersPrivate(lid: string): Promise<SwimmerPrivate[]> {
  const rows = await selectAll<PlayerPrivateRow & Record<string, unknown>>(
    { table: 'player_private', columns: 'player_id,birth_year,sex,guardian_name,consent_at', filters: [byLeague(lid)] },
    'player_id',
  );
  return rows.map(toPrivate);
}

/** Pruebas y encuentros por id (de a pedazos). */
async function eventsByIds(lid: string, ids: string[]): Promise<SwimEventItem[]> {
  const parts = await Promise.all(
    chunks([...new Set(ids)]).map((part) =>
      select<SwimEventRow>({
        table: 'swim_events',
        columns: 'id,event_id,num,distance,stroke,pool,gender,age_groups',
        filters: [byLeague(lid), { col: 'id', op: 'in', value: part }],
      }),
    ),
  );
  return parts.flat().map(toSwimEvent);
}

async function meetsByIds(lid: string, ids: string[]): Promise<MeetEventRow[]> {
  const parts = await Promise.all(
    chunks([...new Set(ids)]).map((part) =>
      select<MeetEventRow>({
        table: 'events',
        columns: 'id,type,name,date,start_time,announcement',
        filters: [byLeague(lid), { col: 'id', op: 'in', value: part }],
      }),
    ),
  );
  return parts.flat();
}

/** Junta las inscripciones con su prueba y su encuentro (fecha, piscina) para el historial y las marcas. */
export function historyOf(entries: readonly SwimEntry[], events: readonly SwimEventItem[], meets: readonly Pick<MeetEventRow, 'id' | 'name' | 'date' | 'type'>[]): SwimHistoryItem[] {
  const ev = new Map(events.map((e) => [e.id, e] as const));
  const mt = new Map(meets.map((m) => [m.id, m] as const));
  const out: SwimHistoryItem[] = [];
  for (const e of entries) {
    const se = ev.get(e.swimEventId);
    const m = mt.get(e.meetId);
    if (!se || !m) continue;
    out.push({
      entryId: e.id,
      meetId: e.meetId,
      meetName: m.name,
      meetType: isMeetType(m.type) ? m.type : 'encuentro',
      swimEventId: e.swimEventId,
      distance: se.distance,
      stroke: se.stroke,
      pool: se.pool,
      gender: se.gender,
      ageGroup: e.ageGroup,
      time: e.time,
      status: e.status,
      date: m.date,
      eventId: e.meetId,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.entryId.localeCompare(b.entryId));
}

/** Todo lo que nadó un nadador en la liga (con resultado), para sus marcas personales. */
export async function fetchSwimHistory(lid: string, playerId: string): Promise<SwimHistoryItem[]> {
  const rows = await selectAll<SwimEntryRow & Record<string, unknown>>({
    table: 'swim_entries',
    columns: ENTRY_COLS,
    filters: [byLeague(lid), { col: 'player_id', op: 'eq', value: playerId }],
  });
  const entries = rows.map(toSwimEntry).filter((e) => e.resultAt != null || e.time != null);
  if (!entries.length) return [];
  const [events, meets] = await Promise.all([eventsByIds(lid, entries.map((e) => e.swimEventId)), meetsByIds(lid, entries.map((e) => e.meetId))]);
  return historyOf(entries, events, meets);
}

/** Lo que hace falta para la tabla de clubes de la temporada: encuentros, pruebas y los tiempos que puntúan. */
export interface SwimSeason {
  meets: SwimMeet[];
  events: SwimEventItem[];
  /** Solo resultados válidos (ok con tiempo): los demás no tienen puesto ni puntos. */
  entries: SwimEntry[];
}

export async function fetchSwimSeason(lid: string): Promise<SwimSeason> {
  const [meets, events, rows] = await Promise.all([
    fetchMeets(lid),
    selectAll<SwimEventRow & Record<string, unknown>>({ table: 'swim_events', columns: 'id,event_id,num,distance,stroke,pool,gender,age_groups', filters: [byLeague(lid)] }),
    selectAll<SwimEntryRow & Record<string, unknown>>({
      table: 'swim_entries',
      columns: ENTRY_COLS,
      filters: [byLeague(lid), { col: 'status', op: 'eq', value: 'ok' }, { col: 'time_cs', op: 'gt', value: 0 }],
    }),
  ]);
  return { meets, events: events.map(toSwimEvent), entries: rows.map(toSwimEntry) };
}

/** Etiquetas de una lectura de la liga (la de la liga siempre, para purgar al perder el acceso). */
const leagueTags = (lid: string | undefined, ...more: string[]) => (lid ? [tags.league(lid), ...more.filter(Boolean)] : []);

// ---------- Reglas de la liga (leagues.rules) ----------

/** Lo que la liga pone por defecto a cada encuentro nuevo (registry: `{pool, lanes, points}`, más `ageGroups`). */
export interface SwimRules {
  pool: PoolLength;
  lanes: number;
  points: number[];
  ageGroups: AgeScheme;
}

export const DEFAULT_SWIM_RULES: SwimRules = { pool: 25, lanes: 6, points: [6, 4, 3, 2, 1], ageGroups: 'cccan' };

/** leagues.rules → reglas de natación (lo que falte o no sirva, por defecto; igual que el trigger de la base). */
export function toSwimRules(raw: unknown): SwimRules {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lanes = r.lanes;
  const points = r.points;
  return {
    pool: r.pool === 50 ? 50 : 25,
    lanes: typeof lanes === 'number' && Number.isInteger(lanes) && lanes >= 1 && lanes <= 10 ? lanes : DEFAULT_SWIM_RULES.lanes,
    points:
      Array.isArray(points) && points.length >= 1 && points.length <= 50 && points.every((x) => typeof x === 'number' && x >= 0 && x <= 100)
        ? (points as number[])
        : [...DEFAULT_SWIM_RULES.points],
    ageGroups: r.ageGroups === 'masters' || r.ageGroups === 'none' ? r.ageGroups : 'cccan',
  };
}

export async function fetchSwimRules(lid: string): Promise<SwimRules & { raw: Record<string, unknown> }> {
  const rows = await select<{ id: string; rules: Record<string, unknown> | null }>({ table: 'leagues', columns: 'id,rules', filters: [{ col: 'id', op: 'eq', value: lid }] });
  const raw = rows[0]?.rules ?? {};
  return { ...toSwimRules(raw), raw };
}

export function useSwimRules(lid: string | undefined): Live<SwimRules & { raw: Record<string, unknown> }> {
  return useLive<SwimRules & { raw: Record<string, unknown> }>(lid ? `swim:rules:${lid}` : null, lid ? { kind: 'swimRules', lid } : null, () => fetchSwimRules(lid!), {
    initial: { ...DEFAULT_SWIM_RULES, raw: {} },
    tags: leagueTags(lid, tags.leagues),
    staleMs: 5 * 60_000,
  });
}

/** Admin: cambia lo que la liga pone por defecto a los encuentros nuevos (conserva las demás claves de rules). */
export async function saveSwimRules(lid: string, current: Record<string, unknown>, rules: SwimRules): Promise<void> {
  await rpc('update_league', { p_league: lid, p_patch: { rules: { ...current, ...rules } } });
  invalidate(tags.league(lid), tags.leagues);
}

// ---------- Tiempo real ----------

/** Qué se vuelve a leer con cada aviso 'swim' (o al consultar sin tiempo real). */
export function swimMessageTags(topic: string, lid: string, msg: Pick<RealtimeMessage, 'event' | 'payload'> | null): string[] {
  const [kind, id] = [topic.slice(0, topic.indexOf(':')), topic.slice(topic.indexOf(':') + 1)];
  const t = msg ? ((msg.payload ?? {}) as { t?: string }).t : null;
  if (msg && msg.event !== 'swim') return [];
  if (kind === 'event') {
    if (t === 'entries') return [swimTags.meetEntries(id), swimTags.entries(lid)];
    if (t === 'events') return [swimTags.meet(id), swimTags.events(lid)];
    if (t === 'meet') return [swimTags.meets(lid)];
    return [swimTags.meetEntries(id), swimTags.meet(id), swimTags.meets(lid)];
  }
  if (kind === 'league') {
    if (t === 'meets') return [swimTags.meets(lid), tags.events(lid)];
    if (t === 'clubs') return [swimTags.clubs(lid)];
    if (t === 'swimmers') return [swimTags.swimmers(lid), tags.players(lid)];
    return [swimTags.meets(lid), swimTags.clubs(lid), swimTags.swimmers(lid)];
  }
  return [];
}

/**
 * Escucha los avisos de natación de ese tema mientras la pantalla esté abierta (el canal se comparte con las
 * demás pantallas). Sin cuenta no hay canal privado: se consulta cada 30–45 s para no gastar de más.
 */
export function useSwimTopic(topic: string | null, lid: string | undefined) {
  queryClient.useTopic(
    topic && lid ? topic : null,
    (msg) => {
      if (topic && lid) invalidate(...swimMessageTags(topic, lid, msg));
    },
    {
      onPoll: () => topic && lid && invalidate(...swimMessageTags(topic, lid, null)),
      pollOnly: !getUserId(),
      pollMs: getUserId() ? undefined : [30_000, 45_000],
    },
  );
}

// ---------- Hooks ----------

/** Encuentros de la liga (los más nuevos primero). */
export function useSwimMeets(lid: string | undefined): Live<SwimMeet[]> {
  useSwimTopic(lid ? `league:${lid}` : null, lid);
  return useLive<SwimMeet[]>(lid ? swimKeys.meets(lid) : null, lid ? { kind: 'swimMeets', lid } : null, () => fetchMeets(lid!), {
    initial: [],
    tags: leagueTags(lid, lid ? swimTags.meets(lid) : '', lid ? tags.events(lid) : ''),
  });
}

/** Pruebas del encuentro, en orden del programa. */
export function useSwimEvents(lid: string | undefined, meetId: string | undefined): Live<SwimEventItem[]> {
  return useLive<SwimEventItem[]>(
    lid && meetId ? swimKeys.events(meetId) : null,
    lid ? { kind: 'swimEvents', lid, eventId: meetId } : null,
    () => fetchSwimEvents(lid!, meetId!),
    { initial: [], tags: leagueTags(lid, meetId ? swimTags.meet(meetId) : '', lid ? swimTags.events(lid) : '') },
  );
}

/** Inscripciones, series y resultados del encuentro, en vivo mientras está en pantalla. */
export function useSwimEntries(lid: string | undefined, meetId: string | undefined): Live<SwimEntry[]> {
  useSwimTopic(lid && meetId ? `event:${meetId}` : null, lid);
  return useLive<SwimEntry[]>(
    lid && meetId ? swimKeys.entries(meetId) : null,
    lid ? { kind: 'swimEntries', lid, eventId: meetId } : null,
    () => fetchSwimEntries(lid!, meetId!),
    { initial: [], tags: leagueTags(lid, meetId ? swimTags.meetEntries(meetId) : '', lid ? swimTags.entries(lid) : '') },
  );
}

export function useSwimClubs(lid: string | undefined): Live<SwimClub[]> {
  return useLive<SwimClub[]>(lid ? swimKeys.clubs(lid) : null, lid ? { kind: 'swimClubs', lid } : null, () => fetchClubs(lid!), {
    initial: [],
    tags: leagueTags(lid, lid ? swimTags.clubs(lid) : ''),
    staleMs: 60_000,
  });
}

export function useSwimmers(lid: string | undefined): Live<SwimmerInfo[]> {
  return useLive<SwimmerInfo[]>(lid ? swimKeys.swimmers(lid) : null, lid ? { kind: 'swimSwimmers', lid } : null, () => fetchSwimmers(lid!), {
    initial: [],
    tags: leagueTags(lid, lid ? swimTags.swimmers(lid) : '', lid ? tags.players(lid) : ''),
    staleMs: 60_000,
  });
}

/** Solo admins: año de nacimiento, sexo y tutor. No se guarda en el teléfono (datos de menores). */
export function useSwimmersPrivate(lid: string | undefined, isAdmin: boolean): Live<SwimmerPrivate[]> {
  return useLive<SwimmerPrivate[]>(
    lid && isAdmin ? swimKeys.private(lid) : null,
    lid ? { kind: 'swimPrivate', lid } : null,
    () => fetchSwimmersPrivate(lid!),
    { initial: [], tags: leagueTags(lid, lid ? swimTags.swimmers(lid) : ''), persist: false },
  );
}

/** Historial de un nadador (para sus marcas personales y su progresión). */
export function useSwimHistory(lid: string | undefined, playerId: string | undefined | null): Live<SwimHistoryItem[]> {
  return useLive<SwimHistoryItem[]>(
    lid && playerId ? swimKeys.history(lid, playerId) : null,
    lid ? { kind: 'swimHistory', lid, playerId: playerId ?? undefined } : null,
    () => fetchSwimHistory(lid!, playerId!),
    { initial: [], tags: leagueTags(lid, lid ? swimTags.entries(lid) : ''), staleMs: 60_000 },
  );
}

/** Temporada: encuentros, pruebas y los tiempos que puntúan (para la tabla de clubes). */
export function useSwimSeason(lid: string | undefined): Live<SwimSeason> {
  useSwimTopic(lid ? `league:${lid}` : null, lid);
  return useLive<SwimSeason>(lid ? swimKeys.season(lid) : null, lid ? { kind: 'swimSeason', lid } : null, () => fetchSwimSeason(lid!), {
    initial: { meets: [], events: [], entries: [] },
    tags: leagueTags(lid, lid ? swimTags.meets(lid) : '', lid ? swimTags.entries(lid) : '', lid ? swimTags.events(lid) : ''),
    staleMs: 5 * 60_000,
  });
}

// ---------- Escrituras (admin, con señal) ----------

const afterMeets = (lid: string, meetId?: string) =>
  invalidate(swimTags.meets(lid), tags.events(lid), tags.feeds, ...(meetId ? [swimTags.meet(meetId), swimTags.meetEntries(meetId)] : []));

export interface MeetInput {
  type: 'encuentro' | 'control';
  name: string;
  date: string;
  startTime?: string | null;
  announcement?: string;
  pool: PoolLength;
  lanes: number;
  points: number[];
  ageGroups: AgeScheme;
}

export interface SwimEventInput {
  id?: string;
  num?: number;
  distance: number;
  stroke: SwimStroke;
  gender: SwimGender;
  ageGroups: string[];
}

const eventArg = (e: SwimEventInput) => ({
  ...(e.id ? { id: e.id } : {}),
  ...(e.num != null ? { num: e.num } : {}),
  distance: e.distance,
  stroke: e.stroke,
  gender: e.gender,
  age_groups: e.ageGroups,
});

/** Crea el encuentro (y sus pruebas, p. ej. de una plantilla). Devuelve su id. */
export async function createMeet(lid: string, input: MeetInput, events: SwimEventInput[] = []): Promise<string> {
  const id = uuidv7();
  await rpc('swim_create_meet', {
    p_id: id,
    p_league: lid,
    p_date: input.date,
    p_name: input.name.trim(),
    p_type: input.type,
    p_pool: input.pool,
    p_lanes: input.lanes,
    p_points: input.points,
    p_age_groups: input.ageGroups,
    p_start_time: input.startTime || null,
    p_announcement: input.announcement ?? '',
  });
  if (events.length) await rpc('swim_save_events', { p_meet: id, p_events: events.map(eventArg) });
  afterMeets(lid, id);
  return id;
}

export type MeetPatch = Partial<Omit<MeetInput, 'type'> & { type: MeetType }>;

/** Cambia el encuentro: nombre, fecha, hora y anuncio (update_event) y/o piscina, carriles, puntos y categorías. */
export async function updateMeet(lid: string, meetId: string, patch: MeetPatch): Promise<void> {
  const ev: Record<string, unknown> = {};
  if (patch.name !== undefined) ev.name = patch.name.trim();
  if (patch.date !== undefined) ev.date = patch.date;
  if (patch.startTime !== undefined) ev.start_time = patch.startTime || null;
  if (patch.announcement !== undefined) ev.announcement = patch.announcement;
  if (patch.type !== undefined) ev.type = patch.type;
  const sw: Record<string, unknown> = {};
  if (patch.pool !== undefined) sw.pool = patch.pool;
  if (patch.lanes !== undefined) sw.lanes = patch.lanes;
  if (patch.points !== undefined) sw.points = patch.points;
  if (patch.ageGroups !== undefined) sw.age_groups = patch.ageGroups;
  if (Object.keys(ev).length) await rpc('update_event', { p_event: meetId, p_patch: ev });
  if (Object.keys(sw).length) await rpc('swim_update_meet', { p_meet: meetId, p_patch: sw });
  afterMeets(lid, meetId);
}

/** Borra el encuentro con sus pruebas, inscripciones y resultados. */
export async function deleteMeet(lid: string, meetId: string): Promise<void> {
  await rpc('delete_event', { p_event: meetId });
  afterMeets(lid, meetId);
  invalidate(swimTags.entries(lid), swimTags.events(lid));
}

/** Cierra el encuentro (ya no cambian resultados) o lo vuelve a abrir. */
export async function finalizeMeet(lid: string, meetId: string, final = true): Promise<void> {
  await rpc('swim_finalize_meet', { p_meet: meetId, p_final: final });
  afterMeets(lid, meetId);
  invalidate(swimTags.entries(lid));
}

/** Agrega o cambia pruebas (una o varias). Devuelve los ids en el mismo orden. */
export async function saveSwimEvents(lid: string, meetId: string, events: SwimEventInput[]): Promise<string[]> {
  if (!events.length) return [];
  const ids = (await rpc<string[]>('swim_save_events', { p_meet: meetId, p_events: events.map(eventArg) })) ?? [];
  invalidate(swimTags.meet(meetId), swimTags.events(lid));
  return ids;
}

export async function deleteSwimEvent(lid: string, meetId: string, swimEventId: string): Promise<void> {
  await rpc('swim_delete_event', { p_swim_event: swimEventId });
  invalidate(swimTags.meet(meetId), swimTags.meetEntries(meetId), swimTags.events(lid), swimTags.entries(lid));
}

export async function saveClub(lid: string, club: Omit<SwimClub, 'id'> & { id?: string }): Promise<string> {
  const id = club.id ?? uuidv7();
  await rpc('swim_save_club', {
    p_id: id,
    p_league: lid,
    p_name: club.name.trim(),
    p_short: club.short.trim(),
    p_color: club.color || null,
    p_coach: club.coachId || null,
  });
  invalidate(swimTags.clubs(lid));
  return id;
}

export async function deleteClub(lid: string, clubId: string): Promise<void> {
  await rpc('swim_delete_club', { p_club: clubId });
  invalidate(swimTags.clubs(lid), swimTags.swimmers(lid));
}

export interface SwimmerInput {
  name: string;
  clubId: string | null;
  isMinor: boolean;
  birthYear: number | null;
  sex: Sex | null;
  /** El padre, madre o tutor dio su permiso (obligatorio para menores). */
  consent: boolean;
  guardianName: string | null;
}

/** Registra un nadador sin cuenta (admin, o el entrenador en su club). Devuelve su id de jugador. */
export async function registerSwimmer(lid: string, input: SwimmerInput): Promise<string> {
  const id = uuidv7();
  await rpc('swim_register_swimmer', {
    p_id: id,
    p_league: lid,
    p_name: input.name.trim(),
    p_club: input.clubId,
    p_is_minor: input.isMinor,
    p_birth_year: input.birthYear,
    p_sex: input.sex,
    p_consent: input.consent,
    p_guardian_name: input.guardianName?.trim() || null,
  });
  invalidate(swimTags.swimmers(lid), tags.players(lid));
  return id;
}

export interface SwimmerPatch {
  name?: string;
  clubId?: string | null;
  birthYear?: number | null;
  sex?: Sex | null;
  guardianName?: string | null;
  /** true = el tutor dio su permiso ahora. */
  consent?: boolean;
}

/** SwimmerPatch → claves de `swim_update_swimmer`. */
export function swimmerPatch(p: SwimmerPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.name !== undefined) out.name = p.name.trim();
  if (p.clubId !== undefined) out.club_id = p.clubId;
  if (p.birthYear !== undefined) out.birth_year = p.birthYear;
  if (p.sex !== undefined) out.sex = p.sex;
  if (p.guardianName !== undefined) out.guardian_name = p.guardianName?.trim() || null;
  if (p.consent) out.consent = true;
  return out;
}

/** Admin: cambia al nadador (también a uno con cuenta: su club, año y sexo). */
export async function updateSwimmer(lid: string, playerId: string, patch: SwimmerPatch): Promise<void> {
  const p = swimmerPatch(patch);
  if (!Object.keys(p).length) return;
  await rpc('swim_update_swimmer', { p_player: playerId, p_patch: p });
  invalidate(swimTags.swimmers(lid), tags.players(lid));
}

/** Inscribe nadadores en una prueba (o cambia su siembra). Devuelve cuántos entraron o cambiaron. */
export async function enterSwimmers(lid: string, meetId: string, swimEventId: string, list: { playerId: string; seed: number | null }[]): Promise<number> {
  if (!list.length) return 0;
  const n = await rpc<number>('swim_enter', { p_swim_event: swimEventId, p_entries: list.map((x) => ({ player_id: x.playerId, seed_cs: x.seed })) });
  invalidate(swimTags.meetEntries(meetId), swimTags.entries(lid), swimTags.swimmers(lid));
  return n ?? 0;
}

export async function unenterSwimmer(lid: string, meetId: string, entryId: string): Promise<boolean> {
  const r = await rpc<boolean>('swim_unenter', { p_entry: entryId });
  invalidate(swimTags.meetEntries(meetId), swimTags.entries(lid));
  return r === true;
}

export interface HeatAssignment {
  swimEventId: string;
  lanes: { entryId: string; heat: number; lane: number }[];
}

/** Publica la hoja de series (las pruebas listadas se arman de nuevo enteras). */
export async function publishHeats(lid: string, meetId: string, heats: HeatAssignment[]): Promise<number> {
  const n = await rpc<number>('swim_publish_heats', {
    p_meet: meetId,
    p_heats: heats.map((h) => ({ swim_event_id: h.swimEventId, lanes: h.lanes.map((l) => ({ entry_id: l.entryId, heat: l.heat, lane: l.lane })) })),
  });
  invalidate(swimTags.meetEntries(meetId), swimTags.meets(lid));
  return n ?? 0;
}

// ---------- Resultados de una serie (van por la cola) ----------

export interface LaneResult {
  entryId: string;
  /** Centésimas; null = sin tiempo (con 'ok' borra el resultado de ese carril). */
  time: number | null;
  status: SwimStatus;
}

export const swimCollapse = {
  heat: (swimEventId: string, heat: number) => `swimheat:${swimEventId}:${heat}`,
};

/**
 * «Publicar serie»: manda los resultados de TODA la serie en una sola operación de la cola (nunca por carril ni
 * por toque). Sin señal queda guardada y ya se ve en los resultados; si se vuelve a publicar la misma serie antes
 * de que salga, solo se manda la última. Se cumple cuando el servidor la tiene (o a los 6 s con mala señal).
 */
export async function recordHeat(lid: string, swimEventId: string, heat: number, results: LaneResult[], label?: string): Promise<number | undefined> {
  const { done } = enqueue<number>(
    'swim_record_heat',
    {
      p_swim_event: swimEventId,
      p_heat: heat,
      p_results: results.map((r) => ({ entry_id: r.entryId, time_cs: r.time, status: r.status })),
    },
    { group: lid, collapseKey: swimCollapse.heat(swimEventId, heat), label: label ?? `Serie ${heat}` },
  );
  return sentOrQueued(done);
}

/** Resultados de las series que están en la cola, encima de lo que llegó del servidor (en orden). */
export function overlaySwimResults(list: SwimEntry[], ops: readonly OutboxItem[]): SwimEntry[] {
  const heats = ops.filter((o) => o.fn === 'swim_record_heat');
  if (!heats.length) return list;
  const byEntry = new Map<string, { time: number | null; status: SwimStatus }>();
  for (const o of heats) {
    const rows = Array.isArray(o.args.p_results) ? (o.args.p_results as { entry_id?: unknown; time_cs?: unknown; status?: unknown }[]) : [];
    for (const r of rows) {
      if (typeof r.entry_id !== 'string') continue;
      const time = typeof r.time_cs === 'number' ? r.time_cs : null;
      const status = (typeof r.status === 'string' ? r.status : 'ok') as SwimStatus;
      byEntry.set(r.entry_id, { time, status });
    }
  }
  let changed = false;
  const out = list.map((e) => {
    const r = byEntry.get(e.id);
    if (!r) return e;
    changed = true;
    const cleared = r.status === 'ok' && r.time == null;
    return { ...e, time: r.time, status: r.status, resultAt: cleared ? null : (e.resultAt ?? nowIso()) };
  });
  return changed ? out : list;
}

// Al encolar se ve de una; al confirmarse (o rechazarse) se vuelve a leer.
onOutbox({
  enqueue: (item) => {
    if (item.fn !== 'swim_record_heat') return;
    updateCached<SwimEntry[]>('swimEntries', (data) => overlaySwimResults(data, [item]));
  },
  settled: (item) => {
    if (item.fn !== 'swim_record_heat') return;
    invalidate(swimTags.entries(item.group));
  },
});
