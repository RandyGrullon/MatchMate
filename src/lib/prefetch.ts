import { leagueSport, sportMeta } from '../sports/registry';
import type { Backend } from './backend/types';
import { isMatchSport, myMatchesSince, zonedParts } from './calendar';
import { fetchLive, getUserId, isOnline, select, type QueryDesc } from './data/client';
import { fetchEntries } from './data/entries';
import { fetchEvent } from './data/events';
import { fetchGolfEvent, golfKeys } from './data/golf';
import { keys, tags } from './data/keys';
import { fetchLeague, fetchLeaguesByIds } from './data/leagues';
import { matchKeys, prefetchMatch, prefetchMatches, prefetchMyMatches, seasonTeamTag, type Match } from './data/matches';
import { fetchMembership, fetchMyMemberships } from './data/members';
import { fetchPlayers } from './data/players';
import { fetchLeagueRules as fetchRacketRules, fetchRacketEvent, racketKeys } from './data/racket';
import { chunks } from './data/rows';
import { fetchSeasonTeams, seasonTeamKeys } from './data/seasonTeams';
import { fetchLeagueRules as fetchTeamRules, teamSportKeys, teamSportTags } from './data/teamSports';
import { parseDate, toIsoDate } from './format';
import { watchSessionUser } from './persist';
import type { League, Member } from './types';

/**
 * Precarga para jugar sin señal. La copia del teléfono (src/lib/db/query.ts) solo guarda lo que ya se abrió: quien
 * llega a la cancha sin señal no podía abrir (ni anotar) un partido que nunca abrió. Con señal, después de entrar
 * y al volver a la app, esto trae a la copia lo de hoy y mañana de tus ligas:
 *
 * - tus partidos en vivo, suspendidos o programados para hoy o mañana (en la hora de su liga): el partido completo
 *   (reglas y estado del anotador, lo que necesita la cancha) y la lista donde se abre (del evento o de la liga);
 * - los eventos de hoy y mañana (práctica, torneo, noche, ronda, encuentro) con lo que abre su pantalla;
 * - de esas ligas, lo que usa cualquier pantalla: la liga, tu membresía, los jugadores, parejas/equipos y reglas.
 *
 * Todo con la misma clave, tipo y etiquetas que el hook de la pantalla, así la pantalla lo encuentra. Como mucho
 * una vez por hora (o al cambiar el día), 3 lecturas a la vez, y con «ahorro de datos» solo lo justo. Si se va la
 * señal, cambia la cuenta o la app pasa a segundo plano, para y sigue la próxima vez.
 */

/** Lo de una liga que la precarga necesita. */
export type PrefetchLeague = Pick<League, 'id' | 'tz'> & { sport?: string | null };

/** Un evento de hoy o mañana (solo lo que hace falta para decidir). */
export interface PrefetchEvent {
  id: string;
  lid: string;
  date: string;
  type: string;
}

export type PrefetchMatch = Pick<Match, 'id' | 'leagueId' | 'eventId' | 'scheduledAt' | 'status'>;

export type PrefetchKind =
  | 'match'
  | 'eventMatches'
  | 'leagueMatches'
  | 'event'
  | 'racketEvent'
  | 'golfEvent'
  | 'eventEntries'
  | 'league'
  | 'membership'
  | 'players'
  | 'seasonTeams'
  | 'racketRules'
  | 'teamRules';

export interface PrefetchTask {
  kind: PrefetchKind;
  /** Clave de la caché (la misma del hook de la pantalla). */
  key: string;
  lid: string;
  /** Partido o evento. */
  id?: string;
}

export interface PrefetchPlanInput {
  uid: string;
  leagues: readonly PrefetchLeague[];
  events: readonly PrefetchEvent[];
  matches: readonly PrefetchMatch[];
  now: number;
  /** «Ahorro de datos» del teléfono: sin las listas grandes de la liga (jugadores, todos los partidos). */
  saveData?: boolean;
}

/** Tope de partidos y de eventos por vez (un torneo de todo el día no baja la liga entera). */
export const PREFETCH_MAX_MATCHES = 12;
export const PREFETCH_MAX_EVENTS = 12;

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

const OPEN = new Set<string>(['live', 'suspended']);

/**
 * Qué precargar (sin leer nada): primero tus partidos (los en vivo y los más cercanos), después los eventos de hoy
 * y mañana y al final lo de cada liga que aparece. Sin repetir claves.
 */
export function planPrefetch(input: PrefetchPlanInput): PrefetchTask[] {
  const { uid, now, saveData = false } = input;
  const leagueById = new Map(input.leagues.map((l) => [l.id, l] as const));
  const nowIso = new Date(now).toISOString();
  const soonCache = new Map<string, Set<string>>();
  /** Hoy y mañana en la zona de la liga. */
  const soon = (l: PrefetchLeague) => {
    let s = soonCache.get(l.id);
    if (!s) {
      const today = zonedParts(nowIso, l.tz)?.date ?? toIsoDate(new Date(now));
      s = new Set([today, addDays(today, 1)]);
      soonCache.set(l.id, s);
    }
    return s;
  };
  const familyOf = (l: PrefetchLeague) => sportMeta(leagueSport(l))?.family ?? null;

  const out: PrefetchTask[] = [];
  const seen = new Set<string>();
  const add = (t: PrefetchTask) => {
    if (seen.has(t.key)) return;
    seen.add(t.key);
    out.push(t);
  };
  const involved: string[] = [];
  const involve = (lid: string) => !involved.includes(lid) && involved.push(lid);

  // 1. Tus partidos.
  const at = (m: PrefetchMatch) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Number.POSITIVE_INFINITY);
  const matches = input.matches
    .filter((m) => {
      const l = leagueById.get(m.leagueId);
      if (!l || !isMatchSport(leagueSport(l))) return false;
      if (OPEN.has(m.status)) return true;
      if (m.status !== 'scheduled') return false;
      const when = zonedParts(m.scheduledAt, l.tz);
      return !!when && soon(l).has(when.date);
    })
    .sort((a, b) => Number(OPEN.has(b.status)) - Number(OPEN.has(a.status)) || at(a) - at(b))
    .slice(0, PREFETCH_MAX_MATCHES);
  for (const m of matches) {
    const l = leagueById.get(m.leagueId)!;
    add({ kind: 'match', key: matchKeys.one(m.id), lid: l.id, id: m.id });
    // En raqueta, el de un evento se abre en su evento; lo demás (y todo en equipos), en «Partidos» de la liga.
    if (familyOf(l) === 'racket' && m.eventId) {
      add({ kind: 'racketEvent', key: racketKeys.event(m.eventId), lid: l.id, id: m.eventId });
      add({ kind: 'eventMatches', key: matchKeys.event(m.eventId), lid: l.id, id: m.eventId });
    } else {
      add({ kind: 'leagueMatches', key: matchKeys.league(l.id), lid: l.id });
    }
    involve(l.id);
  }

  // 2. Los eventos de hoy y mañana.
  const events = input.events
    .filter((e) => {
      const l = leagueById.get(e.lid);
      return !!l && soon(l).has(e.date);
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, PREFETCH_MAX_EVENTS);
  for (const e of events) {
    const l = leagueById.get(e.lid)!;
    const sport = leagueSport(l);
    const family = familyOf(l);
    if (family === 'racket') {
      add({ kind: 'racketEvent', key: racketKeys.event(e.id), lid: l.id, id: e.id });
      add({ kind: 'eventMatches', key: matchKeys.event(e.id), lid: l.id, id: e.id });
    } else {
      add({ kind: 'event', key: keys.event(l.id, e.id), lid: l.id, id: e.id });
      if (family === 'team') add({ kind: 'eventMatches', key: matchKeys.event(e.id), lid: l.id, id: e.id });
      else if (sport === 'golf') add({ kind: 'golfEvent', key: golfKeys.event(e.id), lid: l.id, id: e.id });
      else if (sport === 'bowling') add({ kind: 'eventEntries', key: keys.eventEntries(e.id), lid: l.id, id: e.id });
    }
    involve(l.id);
  }

  // 3. Lo de cada liga que aparece: lo que usa cualquier pantalla de la liga.
  for (const lid of involved) {
    const l = leagueById.get(lid)!;
    const family = familyOf(l);
    add({ kind: 'league', key: keys.league(lid), lid });
    add({ kind: 'membership', key: keys.membership(lid, uid), lid });
    if (family === 'racket') add({ kind: 'racketRules', key: racketKeys.rules(lid), lid });
    if (family === 'team') add({ kind: 'teamRules', key: teamSportKeys.rules(lid), lid });
    if (saveData) continue;
    add({ kind: 'players', key: keys.players(lid), lid });
    if (family === 'racket' || family === 'team') add({ kind: 'seasonTeams', key: seasonTeamKeys.league(lid), lid });
    // Las pantallas de equipos leen todos los partidos de la liga (useTeamLeague).
    if (family === 'team') add({ kind: 'leagueMatches', key: matchKeys.league(lid), lid });
  }
  return out;
}

// ---------- Leer ----------

const load = (key: string, desc: QueryDesc, fetcher: () => Promise<unknown>, initial: unknown, tagList: string[]) =>
  fetchLive<unknown>(key, desc, fetcher, { initial, tags: tagList });

/** Una tarea con la misma clave, tipo y etiquetas que el hook de su pantalla (el comentario dice cuál). */
export function runPrefetchTask(t: PrefetchTask, uid: string): Promise<unknown> {
  const { lid } = t;
  const id = t.id ?? '';
  switch (t.kind) {
    case 'match': // useMatch
      return prefetchMatch(lid, id);
    case 'eventMatches': // useMatches({ lid, eventId })
      return prefetchMatches({ lid, eventId: id });
    case 'leagueMatches': // useMatches({ lid })
      return prefetchMatches({ lid });
    case 'event': // useEvent (events.ts)
      return load(keys.event(lid, id), { kind: 'event', lid, id }, () => fetchEvent(lid, id), null, [tags.league(lid), tags.events(lid), tags.event(id)]);
    case 'racketEvent': // useRacketEvent (racket.ts)
      return load(racketKeys.event(id), { kind: 'racketEvent', lid, id }, () => fetchRacketEvent(lid, id), null, [tags.league(lid), tags.events(lid), tags.event(id)]);
    case 'golfEvent': // useGolfEvent (golf.ts)
      return load(golfKeys.event(id), { kind: 'golf-event', lid, eventId: id }, () => fetchGolfEvent(lid, id), { round: null, cards: [] }, [
        tags.league(lid),
        tags.events(lid),
        tags.event(id),
        tags.entries(lid),
        tags.eventEntries(id),
      ]);
    case 'eventEntries': // useEventEntries (entries.ts)
      return load(keys.eventEntries(id), { kind: 'entries', lid, eventId: id }, () => fetchEntries(lid, [{ col: 'event_id', op: 'eq', value: id }]), [], [
        tags.league(lid),
        tags.entries(lid),
        tags.eventEntries(id),
      ]);
    case 'league': // useLeague (leagues.ts)
      return load(keys.league(lid), { kind: 'league', lid }, () => fetchLeague(lid), null, [tags.league(lid), tags.leagues]);
    case 'membership': // useMembership (members.ts)
      return load(keys.membership(lid, uid), { kind: 'membership', lid }, () => fetchMembership(lid, uid), null, [tags.league(lid), tags.members, tags.leagueMembers(lid)]);
    case 'players': // usePlayers (players.ts)
      return load(keys.players(lid), { kind: 'players', lid }, () => fetchPlayers(lid), [], [tags.league(lid), tags.players(lid)]);
    case 'seasonTeams': // useSeasonTeams (seasonTeams.ts)
      return load(seasonTeamKeys.league(lid), { kind: 'seasonTeams', lid }, () => fetchSeasonTeams(lid), [], [tags.league(lid), seasonTeamTag(lid)]);
    case 'racketRules': // useLeagueRules (racket.ts)
      return load(racketKeys.rules(lid), { kind: 'racketRules', lid }, () => fetchRacketRules(lid), {}, [tags.league(lid)]);
    case 'teamRules': // useLeagueRules (teamSports.ts)
      return load(teamSportKeys.rules(lid), { kind: 'teamRules', lid }, () => fetchTeamRules(lid), {}, [tags.league(lid), teamSportTags.rules(lid)]);
  }
}

/** Los eventos de esas ligas alrededor de hoy (de ayer a pasado mañana: cubre la zona de cada liga). Sin caché. */
export async function fetchEventsAround(lids: readonly string[], now: number): Promise<PrefetchEvent[]> {
  if (!lids.length) return [];
  const today = toIsoDate(new Date(now));
  const range = [
    { col: 'date', op: 'gte' as const, value: addDays(today, -1) },
    { col: 'date', op: 'lte' as const, value: addDays(today, 2) },
  ];
  const parts = await Promise.all(
    chunks([...new Set(lids)]).map((ids) =>
      select<{ id: string; league_id: string; date: unknown; type: string }>({
        table: 'events',
        columns: 'id,league_id,date,type',
        filters: [{ col: 'league_id', op: 'in', value: ids }, ...range],
      }),
    ),
  );
  return parts.flat().map((r) => ({
    id: r.id,
    lid: r.league_id,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    type: r.type,
  }));
}

export interface PrefetchReport {
  tasks: number;
  done: number;
  failed: number;
  /** Se cortó (sin señal, otra cuenta, la app en segundo plano). */
  stopped: boolean;
}

/** Corre las tareas en orden, `concurrency` a la vez; una que falla no corta las demás. */
export async function runPrefetchTasks(
  tasks: readonly PrefetchTask[],
  run: (t: PrefetchTask) => Promise<unknown>,
  opts: { concurrency?: number; shouldStop?: () => boolean } = {},
): Promise<Omit<PrefetchReport, 'tasks'>> {
  let next = 0;
  let done = 0;
  let failed = 0;
  let stopped = false;
  const worker = async () => {
    while (next < tasks.length) {
      if (opts.shouldStop?.()) {
        stopped = true;
        return;
      }
      const t = tasks[next++];
      try {
        await run(t);
        done++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, tasks.length)) }, worker));
  return { done, failed, stopped };
}

/**
 * Precarga lo de hoy y mañana de la cuenta `uid` (tiene que ser la que usa la capa de datos). Lee tus membresías,
 * tus ligas, tus partidos (con la misma clave que el Home) y los eventos de estos días; después corre el plan.
 */
export async function prefetchToday(
  uid: string,
  opts: { now?: number; saveData?: boolean; concurrency?: number; shouldStop?: () => boolean } = {},
): Promise<PrefetchReport> {
  const now = opts.now ?? Date.now();
  const stop = () => getUserId() !== uid || !isOnline() || !!opts.shouldStop?.();
  if (stop()) return { tasks: 0, done: 0, failed: 0, stopped: true };
  // Lo mismo que piden el Home y la campana (useMyMemberships, useLeaguesByIds, useMyMatches): se comparte.
  const members = await fetchLive<Member[]>(keys.myMemberships(uid), { kind: 'memberships' }, () => fetchMyMemberships(uid), { initial: [], tags: [tags.members] });
  const lids = [...new Set(members.map((m) => m.leagueId))];
  if (!lids.length) return { tasks: 0, done: 0, failed: 0, stopped: false };
  const [leagues, events, matches] = await Promise.allSettled([
    fetchLive<League[]>(keys.leaguesByIds(lids), { kind: 'leagues' }, () => fetchLeaguesByIds(lids), { initial: [], tags: [tags.leagues, ...lids.map(tags.league)] }),
    fetchEventsAround(lids, now),
    prefetchMyMatches(uid, myMatchesSince(new Date(now))),
  ]);
  if (leagues.status === 'rejected') throw leagues.reason;
  const failedReads = Number(events.status === 'rejected') + Number(matches.status === 'rejected');
  const tasks = planPrefetch({
    uid,
    leagues: leagues.value,
    events: events.status === 'fulfilled' ? events.value : [],
    matches: matches.status === 'fulfilled' ? matches.value : [],
    now,
    saveData: opts.saveData,
  });
  const r = await runPrefetchTasks(tasks, (t) => runPrefetchTask(t, uid), { concurrency: opts.concurrency, shouldStop: stop });
  return { tasks: tasks.length, done: r.done, failed: r.failed + failedReads, stopped: r.stopped };
}

// ---------- Cuándo ----------

/** Como mucho una vez por hora (o antes si cambió el día: ya hay un «mañana» nuevo). */
export const PREFETCH_EVERY_MS = 60 * 60_000;
/** Después de entrar o de volver, se espera un poco: primero lo que está en pantalla. */
export const PREFETCH_DELAY_MS = 5_000;

export interface PrefetchLast {
  at: number;
  /** Día (del teléfono) de esa precarga. */
  day: string;
}

export function prefetchDue(last: PrefetchLast | null, now: number): boolean {
  if (!last) return true;
  if (last.day !== toIsoDate(new Date(now))) return true;
  return now - last.at >= PREFETCH_EVERY_MS || now < last.at;
}

const lastKey = (uid: string) => `mm:precarga:${uid}`;
/** Si localStorage no sirve, se recuerda en esta sesión. */
const lastRuns = new Map<string, PrefetchLast>();

function readLast(uid: string): PrefetchLast | null {
  try {
    const raw = localStorage.getItem(lastKey(uid));
    const v = raw ? (JSON.parse(raw) as Partial<PrefetchLast>) : null;
    if (v && typeof v.at === 'number' && typeof v.day === 'string') return { at: v.at, day: v.day };
  } catch {
    // bloqueado o dañado: vale lo de la sesión
  }
  return lastRuns.get(uid) ?? null;
}

function writeLast(uid: string, last: PrefetchLast) {
  lastRuns.set(uid, last);
  try {
    localStorage.setItem(lastKey(uid), JSON.stringify(last));
  } catch {
    // queda en memoria
  }
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
const saveDataOn = () =>
  typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * Arranca desde main.tsx: precarga después de entrar, al volver la señal y al volver a la app (si toca). Devuelve
 * cómo pararlo.
 */
export function startPrefetch(b: Pick<Backend, 'auth'>, opts: { delayMs?: number } = {}): () => void {
  const delay = opts.delayMs ?? PREFETCH_DELAY_MS;
  let uid: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let waits = 0;

  const schedule = (ms = delay) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, ms);
  };

  async function tick() {
    const who = uid;
    if (!who || running) return;
    // La capa de datos cambia de cuenta un momento después de la sesión (auth.tsx): se espera a que sea la misma.
    if (getUserId() !== who) {
      if (waits++ < 10) schedule(2_000);
      return;
    }
    waits = 0;
    // Sin señal o en segundo plano no: al volver la señal o la app se intenta de nuevo.
    if (!isOnline() || hidden()) return;
    const now = Date.now();
    if (!prefetchDue(readLast(who), now)) return;
    running = true;
    try {
      const r = await prefetchToday(who, { now, saveData: saveDataOn(), shouldStop: () => uid !== who || hidden() });
      // Lo que falló se vuelve a intentar a la próxima hora (no en cada vuelta a la app).
      if (!r.stopped && (r.done > 0 || r.tasks === 0)) writeLast(who, { at: now, day: toIsoDate(new Date(now)) });
    } catch (e) {
      console.warn('[precarga] no se pudo', e);
    } finally {
      running = false;
    }
  }

  const offUser = watchSessionUser(b, (next) => {
    uid = next;
    waits = 0;
    if (next) schedule();
    else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });
  const kick = () => {
    if (uid) schedule();
  };
  const onVisible = () => {
    if (!hidden()) kick();
  };
  if (typeof window !== 'undefined') window.addEventListener('online', kick);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => {
    offUser();
    if (timer) clearTimeout(timer);
    timer = null;
    uid = null;
    if (typeof window !== 'undefined') window.removeEventListener('online', kick);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Solo pruebas: olvida cuándo se precargó. */
export function resetPrefetchForTests() {
  lastRuns.clear();
}
