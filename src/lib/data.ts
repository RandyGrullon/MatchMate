import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type WriteBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { scoreGame } from './bowling';
import { DEFAULT_CUTS, normalizeName, playerStats, slots } from './stats';
import type {
  BowlingEvent,
  Entry,
  EventType,
  GameComment,
  GameFrames,
  Invite,
  League,
  LeagueKind,
  LiveScore,
  LeagueRole,
  Member,
  Photo,
  Player,
  RankBy,
  Reaction,
  ReactionType,
  Submission,
  Suggestion,
  UserProfile,
  Visibility,
} from './types';
import { NO_PHOTO } from './types';

// ---------- Rutas: todo lo del boliche vive dentro de una liga ----------

type LeagueCol =
  | 'players'
  | 'events'
  | 'entries'
  | 'submissions'
  | 'photos'
  | 'reactions'
  | 'comments'
  | 'live'
  | 'limits'
  | 'suggestions';
const col = (lid: string, name: LeagueCol) => collection(db, 'leagues', lid, name);
const ref = (lid: string, name: LeagueCol, id: string) => doc(db, 'leagues', lid, name, id);
const newId = (lid: string, name: LeagueCol) => doc(col(lid, name)).id;
export const memberId = (lid: string, uid: string) => `${lid}_${uid}`;
export const entryId = (eventId: string, playerId: string) => `${eventId}_${playerId}`;

// ---------- Lecturas en vivo (onSnapshot = la pantalla se actualiza sola) ----------

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

function useLiveQuery<T>(key: string | null, make: () => Query<DocumentData>): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: key != null, error: null });
  useEffect(() => {
    if (key == null) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      make(),
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T),
          loading: false,
          error: null,
        }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

function useLiveDoc<T>(path: string | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: path != null, error: null });
  useEffect(() => {
    if (path == null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) =>
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
          loading: false,
          error: null,
        }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path]);
  return state;
}

// Ligas y cuentas
export const useLeague = (lid: string | undefined) => useLiveDoc<League>(lid ? `leagues/${lid}` : null);

export const usePublicLeagues = () =>
  useLiveQuery<League>('leagues:public', () => query(collection(db, 'leagues'), where('visibility', '==', 'public')));

/** Todas las ligas (solo el superadmin puede listarlas). */
export const useAllLeagues = (enabled: boolean) =>
  useLiveQuery<League>(enabled ? 'leagues:all' : null, () => collection(db, 'leagues'));

export interface PlayerInLeague {
  lid: string;
  playerId: string;
  entries: Entry[];
  events: BowlingEvent[];
}

/**
 * Las participaciones y los eventos del jugador de la cuenta en cada liga donde está vinculado
 * (para el perfil global). Solo se leen ligas de las que es miembro.
 */
export function usePlayerAcrossLeagues(links: { lid: string; playerId: string }[]): Live<PlayerInLeague[]> {
  const key = links
    .map((l) => `${l.lid}:${l.playerId}`)
    .sort()
    .join(',');
  const [state, setState] = useState<Live<PlayerInLeague[]>>({ data: [], loading: links.length > 0, error: null });
  useEffect(() => {
    const pairs = key ? key.split(',').map((k) => k.split(':') as [string, string]) : [];
    if (!pairs.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const entries = new Map<string, Entry[]>();
    const events = new Map<string, BowlingEvent[]>();
    const publish = () =>
      setState({
        data: pairs
          .filter(([lid]) => entries.has(lid) && events.has(lid))
          .map(([lid, playerId]) => ({ lid, playerId, entries: entries.get(lid)!, events: events.get(lid)! })),
        loading: pairs.some(([lid]) => !entries.has(lid) || !events.has(lid)),
        error: null,
      });
    // Recién unido a una liga privada el servidor todavía no sabe que es miembro: se reintenta. Si una
    // liga no se puede leer, se deja sin juegos (las demás se ven igual).
    const skip = (lid: string) => (e: Error) => {
      console.warn('[perfil global]', lid, e);
      if (!entries.has(lid)) entries.set(lid, []);
      if (!events.has(lid)) events.set(lid, []);
      publish();
    };
    const unsubs = pairs.flatMap(([lid, playerId]) => [
      listenRetry(
        (onError) =>
          onSnapshot(
            query(col(lid, 'entries'), where('playerId', '==', playerId)),
            (snap) => {
              entries.set(lid, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry));
              publish();
            },
            onError,
          ),
        skip(lid),
      ),
      listenRetry(
        (onError) =>
          onSnapshot(
            col(lid, 'events'),
            (snap) => {
              events.set(lid, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BowlingEvent));
              publish();
            },
            onError,
          ),
        skip(lid),
      ),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return state;
}

export interface LeagueFeed {
  lid: string;
  /** Cuenta dueña de los avisos (para no avisarle de lo que hizo ella misma). */
  uid: string;
  playerId: string | null;
  isAdmin: boolean;
  /** Anotador del torneo (torneos sin liga). */
  isScorer: boolean;
  /** Eventos de ayer en adelante (lo que viene). */
  events: BowlingEvent[];
  /** Envíos del jugador de la cuenta. */
  mySubs: Submission[];
  /** Envíos por aprobar (solo si es admin de la liga). */
  pending: Submission[];
  /** Me gusta y felicitaciones a los juegos del jugador de la cuenta. */
  reactions: Reaction[];
  /** Comentarios en los juegos del jugador de la cuenta. */
  comments: GameComment[];
  /** Organizadores: notas del buzón sin leer. */
  suggestions: Suggestion[];
}

/**
 * onSnapshot que se reintenta (0,5 s, 1 s, 2 s, 4 s, 8 s) si Firestore lo rechaza. Pasa justo después
 * de crear o unirse a una liga: la membresía está en el teléfono pero el servidor todavía no la tiene.
 * Si sigue fallando (p. ej. te sacaron de la liga), llama a `onGiveUp`.
 */
function listenRetry(subscribe: (onError: (e: Error) => void) => () => void, onGiveUp: (e: Error) => void, attempts = 5): () => void {
  let stop = () => undefined as void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const start = (n: number) => {
    stop = subscribe((e) => {
      if (closed) return;
      if (n < attempts) timer = setTimeout(() => !closed && start(n + 1), 500 * 2 ** n);
      else onGiveUp(e);
    });
  };
  start(0);
  return () => {
    closed = true;
    clearTimeout(timer);
    stop();
  };
}

/**
 * Lo que alimenta los avisos (campana): por cada liga de la cuenta, los eventos que vienen,
 * sus envíos y, si es admin, lo que falta por aprobar. Todo en vivo y dentro de sus permisos.
 * Para los envíos aprobados o rechazados del último mes también se traen sus eventos pasados
 * (para decir en el aviso de qué torneo o práctica eran).
 */
export function useLeagueFeeds(memberships: Member[], fromDate: string): Live<LeagueFeed[]> {
  const key = memberships
    .map((m) => `${m.leagueId}:${m.playerId ?? '-'}:${m.role === 'member' ? 'm' : 'a'}:${m.scorer ? 's' : '-'}:${m.uid}`)
    .sort()
    .join(',');
  const [state, setState] = useState<Live<LeagueFeed[]>>({ data: [], loading: memberships.length > 0, error: null });
  useEffect(() => {
    const items = key
      ? key.split(',').map((k) => {
          const [lid, pid, role, scorer, uid] = k.split(':');
          return { lid, uid, playerId: pid === '-' ? null : pid, isAdmin: role === 'a', isScorer: scorer === 's' };
        })
      : [];
    if (!items.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    let closed = false;
    type Part = 'events' | 'mySubs' | 'pending' | 'reactions' | 'comments' | 'suggestions';
    const parts = new Map<string, Partial<Record<Part, unknown[]>>>();
    // Eventos pasados de envíos revisados hace poco: liga -> id -> evento.
    const older = new Map<string, Map<string, BowlingEvent>>();
    const requested = new Set<string>();
    // Lo que hace falta para mostrar la liga; los me gusta y comentarios llegan cuando lleguen (no la frenan).
    const needed = (it: (typeof items)[number]): Part[] => [
      'events',
      ...(it.playerId ? (['mySubs'] as Part[]) : []),
      ...(it.isAdmin ? (['pending'] as Part[]) : []),
    ];
    const publish = () => {
      if (closed) return;
      setState({
        data: items
          .filter((it) => needed(it).every((p) => parts.get(it.lid)?.[p]))
          .map((it) => {
            const got = parts.get(it.lid)!;
            const upcoming = (got.events ?? []) as BowlingEvent[];
            const extra = [...(older.get(it.lid)?.values() ?? [])].filter((e) => !upcoming.some((u) => u.id === e.id));
            return {
              ...it,
              events: [...upcoming, ...extra],
              mySubs: (got.mySubs ?? []) as Submission[],
              pending: (got.pending ?? []) as Submission[],
              reactions: (got.reactions ?? []) as Reaction[],
              comments: (got.comments ?? []) as GameComment[],
              suggestions: (got.suggestions ?? []) as Suggestion[],
            };
          }),
        loading: items.some((it) => !needed(it).every((p) => parts.get(it.lid)?.[p])),
        error: null,
      });
    };
    // Eventos pasados que nombran los avisos: envíos revisados y reacciones o comentarios del último mes.
    const fetchOlder = (lid: string) => {
      const got = parts.get(lid);
      if (!got?.events) return;
      const have = new Set((got.events as BowlingEvent[]).map((e) => e.id));
      const cutoff = Date.now() - 30 * 86400_000;
      const recent = (t: { toMillis?(): number } | null | undefined) => (t?.toMillis?.() ?? Date.now()) >= cutoff;
      const ids = [
        ...((got.mySubs ?? []) as Submission[]).filter((s) => s.status !== 'pendiente' && recent(s.reviewedAt ?? { toMillis: () => 0 })).map((s) => s.eventId),
        ...((got.reactions ?? []) as Reaction[]).filter((r) => recent(r.createdAt)).map((r) => r.eventId),
        ...((got.comments ?? []) as GameComment[]).filter((c) => recent(c.createdAt)).map((c) => c.eventId),
      ];
      for (const eventId of new Set(ids)) {
        if (!eventId || have.has(eventId)) continue;
        const k = `${lid}/${eventId}`;
        if (requested.has(k)) continue;
        requested.add(k);
        getDoc(ref(lid, 'events', eventId))
          .then((snap) => {
            if (!snap.exists()) return;
            if (!older.has(lid)) older.set(lid, new Map());
            older.get(lid)!.set(snap.id, { id: snap.id, ...snap.data() } as BowlingEvent);
            publish();
          })
          // Sin señal: se vuelve a intentar con el próximo cambio.
          .catch(() => requested.delete(k));
      }
    };
    const put = (lid: string, part: Part) => (snap: { docs: { id: string; data(): DocumentData }[] }) => {
      parts.set(lid, { ...parts.get(lid), [part]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      if (part !== 'pending' && part !== 'suggestions') fetchOlder(lid);
      publish();
    };
    // Si una liga sigue fallando (p. ej. te sacaron), se ignora: los avisos de las demás siguen.
    const skip = (lid: string, part: Part) => () => put(lid, part)({ docs: [] });
    const listen = (lid: string, part: Part, q: Query<DocumentData>) =>
      listenRetry((onError) => onSnapshot(q, put(lid, part), onError), skip(lid, part));
    // Me gusta y comentarios a tus juegos: solo del último mes (los avisos no muestran más).
    const since = Timestamp.fromMillis(Date.now() - 30 * 86400_000);
    const listenSocial = (lid: string, part: 'reactions' | 'comments', playerId: string) => {
      let bounded = true;
      return listenRetry(
        (onError) =>
          onSnapshot(
            bounded
              ? query(col(lid, part), where('playerId', '==', playerId), where('createdAt', '>=', since))
              : query(col(lid, part), where('playerId', '==', playerId)),
            put(lid, part),
            (e) => {
              // Si la base todavía no tiene el índice (jugador + fecha), se usa la consulta sin límite de fecha.
              if (bounded && (e as { code?: string }).code === 'failed-precondition') bounded = false;
              onError(e);
            },
          ),
        skip(lid, part),
      );
    };
    const unsubs = items.flatMap((it) => [
      listen(it.lid, 'events', query(col(it.lid, 'events'), where('date', '>=', fromDate))),
      ...(it.playerId
        ? [
            listen(it.lid, 'mySubs', query(col(it.lid, 'submissions'), where('playerId', '==', it.playerId))),
            listenSocial(it.lid, 'reactions', it.playerId),
            listenSocial(it.lid, 'comments', it.playerId),
          ]
        : []),
      ...(it.isAdmin
        ? [
            listen(it.lid, 'pending', query(col(it.lid, 'submissions'), where('status', '==', 'pendiente'))),
            listen(it.lid, 'suggestions', query(col(it.lid, 'suggestions'), where('read', '==', false))),
          ]
        : []),
    ]);
    return () => {
      closed = true;
      unsubs.forEach((u) => u());
    };
  }, [key, fromDate]);
  return state;
}

/** Varias ligas por id (las de mis membresías), en vivo. Las que no existen o no se pueden ver se omiten. */
export function useLeaguesByIds(ids: string[]): Live<League[]> {
  const key = [...ids].sort().join(',');
  const [state, setState] = useState<Live<League[]>>({ data: [], loading: ids.length > 0, error: null });
  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const found = new Map<string, League | null>();
    const publish = () =>
      setState({
        data: list.map((id) => found.get(id)).filter((l): l is League => !!l).sort((a, b) => a.name.localeCompare(b.name)),
        loading: found.size < list.length,
        error: null,
      });
    // Recién creada o recién unido: el primer intento puede fallar; se reintenta antes de darla por perdida.
    const unsubs = list.map((id) =>
      listenRetry(
        (onError) =>
          onSnapshot(
            doc(db, 'leagues', id),
            (snap) => {
              found.set(id, snap.exists() ? ({ id: snap.id, ...snap.data() } as League) : null);
              publish();
            },
            onError,
          ),
        () => {
          found.set(id, null);
          publish();
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return state;
}

export const useMembership = (lid: string | undefined, uid: string | undefined) =>
  useLiveDoc<Member>(lid && uid ? `members/${memberId(lid, uid)}` : null);

export const useMyMemberships = (uid: string | undefined) =>
  useLiveQuery<Member>(uid ? `members:u:${uid}` : null, () => query(collection(db, 'members'), where('uid', '==', uid)));

export const useLeagueMembers = (lid: string | undefined) =>
  useLiveQuery<Member>(lid ? `members:l:${lid}` : null, () => query(collection(db, 'members'), where('leagueId', '==', lid)));

/** Cuentas registradas (solo el superadmin puede leerlas todas). */
export const useUsers = (enabled: boolean) => useLiveQuery<UserProfile>(enabled ? 'users' : null, () => collection(db, 'users'));

// Contenido de una liga
export const usePlayers = (lid: string | undefined) =>
  useLiveQuery<Player>(lid ? `players:${lid}` : null, () => query(col(lid!, 'players'), orderBy('name')));

export const usePlayer = (lid: string | undefined, id: string | undefined) =>
  useLiveDoc<Player>(lid && id ? `leagues/${lid}/players/${id}` : null);

export const useEvents = (lid: string | undefined) =>
  useLiveQuery<BowlingEvent>(lid ? `events:${lid}` : null, () => query(col(lid!, 'events'), orderBy('date', 'desc')));

export const useEvent = (lid: string | undefined, id: string | undefined) =>
  useLiveDoc<BowlingEvent>(lid && id ? `leagues/${lid}/events/${id}` : null);

export const useAllEntries = (lid: string | undefined) =>
  useLiveQuery<Entry>(lid ? `entries:${lid}` : null, () => col(lid!, 'entries'));

export const useEventEntries = (lid: string | undefined, eventId: string | undefined) =>
  useLiveQuery<Entry>(lid && eventId ? `entries:${lid}:e:${eventId}` : null, () =>
    query(col(lid!, 'entries'), where('eventId', '==', eventId)),
  );

export const usePlayerEntries = (lid: string | undefined, playerId: string | undefined) =>
  useLiveQuery<Entry>(lid && playerId ? `entries:${lid}:p:${playerId}` : null, () =>
    query(col(lid!, 'entries'), where('playerId', '==', playerId)),
  );

/** Participaciones de varios eventos a la vez (posición en cada torneo, ranking de la temporada). */
export const useEntriesOfEvents = (lid: string | undefined, eventIds: string[]) => useOfEvents<Entry>(lid, 'entries', eventIds);
/** Me gusta y felicitaciones de los juegos de esos eventos. */
export const useReactionsOfEvents = (lid: string | undefined, eventIds: string[]) => useOfEvents<Reaction>(lid, 'reactions', eventIds);
/** Comentarios de los juegos de esos eventos. */
export const useCommentsOfEvents = (lid: string | undefined, eventIds: string[]) => useOfEvents<GameComment>(lid, 'comments', eventIds);

/** Documentos de una colección de la liga que son de esos eventos (en grupos de 30, el máximo de "in"). */
function useOfEvents<T>(lid: string | undefined, name: 'entries' | 'reactions' | 'comments', eventIds: string[]): Live<T[]> {
  const key = lid ? `${lid}:${[...eventIds].sort().join(',')}` : '';
  const [state, setState] = useState<Live<T[]> & { key: string }>({ data: [], loading: eventIds.length > 0, error: null, key: '' });
  useEffect(() => {
    const [league, list] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const ids = list ? list.split(',') : [];
    if (!league || !ids.length) {
      setState({ data: [], loading: false, error: null, key });
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const parts = new Map<number, T[]>();
    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(
        query(col(league, name), where('eventId', 'in', chunk)),
        (snap) => {
          parts.set(i, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
          setState({ data: [...parts.values()].flat(), loading: parts.size < chunks.length, error: null, key });
        },
        (error) => setState({ data: [], loading: false, error, key }),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key, name]);
  // Otros eventos (p. ej. "ver más viejos"): cargando desde este mismo render hasta que lleguen.
  const stale = state.key !== key && eventIds.length > 0;
  return { data: state.data, error: state.error, loading: state.loading || stale };
}

/** Envíos de un evento (para ver en vivo lo que mandaron los jugadores). */
export const useEventSubmissions = (lid: string | undefined, eventId: string | undefined) =>
  useLiveQuery<Submission>(lid && eventId ? `subs:${lid}:e:${eventId}` : null, () => query(col(lid!, 'submissions'), where('eventId', '==', eventId)));

/** Juegos que los jugadores van anotando en su teléfono en ese evento (en vivo). */
export const useEventLive = (lid: string | undefined, eventId: string | undefined) =>
  useLiveQuery<LiveScore>(lid && eventId ? `live:${lid}:e:${eventId}` : null, () => query(col(lid!, 'live'), where('eventId', '==', eventId)));

/** Publica (o quita, si no hay ninguno) los juegos que el jugador lleva anotados en el evento. */
export async function publishLiveScores(lid: string, eventId: string, playerId: string, values: string[]) {
  const scores = values.map((v) => (v.trim() === '' ? null : Number(v)));
  while (scores.length && scores[scores.length - 1] == null) scores.pop();
  const r = ref(lid, 'live', `${eventId}_${playerId}`);
  if (!scores.some((s) => s != null)) return deleteDoc(r);
  await setDoc(r, { eventId, playerId, scores, updatedAt: serverTimestamp() });
}

export const useSubmissions = (lid: string | undefined, status: Submission['status'] = 'pendiente') =>
  useLiveQuery<Submission>(lid ? `subs:${lid}:${status}` : null, () => query(col(lid!, 'submissions'), where('status', '==', status)));

export const usePlayerSubmissions = (lid: string | undefined, playerId: string | undefined) =>
  useLiveQuery<Submission>(lid && playerId ? `subs:${lid}:p:${playerId}` : null, () =>
    query(col(lid!, 'submissions'), where('playerId', '==', playerId)),
  );

export const usePhoto = (lid: string | undefined, id: string | null | undefined) =>
  useLiveDoc<Photo>(lid && id ? `leagues/${lid}/photos/${id}` : null);

/** Promedio que tiene hoy cada jugador en la liga (fijo o calculado con sus juegos verificados). */
export async function fetchEffectiveAverages(lid: string, players: Pick<Player, 'id' | 'averageOverride'>[]) {
  const result = new Map<string, number>();
  const need = players.filter((p) => {
    if (p.averageOverride != null) result.set(p.id, p.averageOverride);
    return p.averageOverride == null;
  });
  for (let i = 0; i < need.length; i += 30) {
    const chunk = need.slice(i, i + 30);
    const snap = await getDocs(query(col(lid, 'entries'), where('playerId', 'in', chunk.map((p) => p.id))));
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry);
    for (const p of chunk) {
      result.set(p.id, playerStats(entries.filter((e) => e.playerId === p.id)).autoAverage ?? 0);
    }
  }
  return result;
}

async function commitInChunks(ops: ((b: WriteBatch) => void)[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
}

// ---------- Ligas ----------

export interface LeagueInput {
  name: string;
  kind: LeagueKind;
  visibility: Visibility;
  venue: string;
  schedule: string;
  seasonStart: string;
  seasonEnd: string;
  contactName: string;
  contactPhone: string;
  requirePhoto: boolean;
}

/**
 * Crea la liga y deja a quien la crea como dueño (las reglas exigen que ambas cosas vayan juntas).
 * El dueño también juega: su jugador se crea enseguida (con su cuenta).
 */
export async function createLeague(owner: { uid: string; name: string }, input: LeagueInput) {
  const leagueRef = doc(collection(db, 'leagues'));
  const batch = writeBatch(db);
  batch.set(leagueRef, { ...input, name: input.name.trim(), ownerUid: owner.uid, createdAt: serverTimestamp() });
  batch.set(doc(db, 'members', memberId(leagueRef.id, owner.uid)), {
    leagueId: leagueRef.id,
    uid: owner.uid,
    name: owner.name,
    role: 'owner',
    playerId: null,
    joinedAt: serverTimestamp(),
  });
  // Mientras se crea, el relleno de jugadores no la toca (leería la lista antes de que la liga exista).
  setJoining(leagueRef.id, true);
  const committed = batch.commit();
  // Liga nueva: todavía no hay jugadores con quién vincularse. Va en cola después de la liga (sirve sin
  // señal); si falla, se crea al abrir la liga.
  ensurePlayer(leagueRef.id, owner.uid, owner.name, { fresh: true })
    .catch((e) => console.error(e))
    .finally(() => setJoining(leagueRef.id, false));
  try {
    await committed;
  } catch (e) {
    setJoining(leagueRef.id, false);
    throw e;
  }
  return leagueRef.id;
}

export async function updateLeague(lid: string, patch: Partial<LeagueInput>) {
  const code = patch.name != null ? await getInviteCode(lid) : null;
  const batch = writeBatch(db);
  batch.update(doc(db, 'leagues', lid), patch);
  // La invitación muestra el nombre de la liga antes de unirse.
  if (code) batch.update(doc(db, 'invites', code), { leagueName: patch.name });
  await batch.commit();
}

/** Borra la liga con todo su contenido, miembros e invitación. */
export async function deleteLeague(lid: string, myUid: string) {
  // Las marcas de ritmo (limits) no se pueden listar (nadie las lee): se borran por cada miembro.
  const cols: LeagueCol[] = ['reactions', 'comments', 'live', 'suggestions', 'entries', 'submissions', 'photos', 'events', 'players'];
  const [code, members, ...snaps] = await Promise.all([
    getInviteCode(lid),
    getDocs(query(collection(db, 'members'), where('leagueId', '==', lid))),
    ...cols.map((c) => getDocs(col(lid, c))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  snaps.forEach((s) => s.docs.forEach((d) => ops.push((b) => b.delete(d.ref))));
  members.docs.forEach((d) => ops.push((b) => b.delete(ref(lid, 'limits', String(d.get('uid'))))));
  members.docs.filter((d) => d.get('uid') !== myUid).forEach((d) => ops.push((b) => b.delete(d.ref)));
  if (code) ops.push((b) => b.delete(doc(db, 'invites', code)));
  ops.push((b) => b.delete(doc(db, 'leagues', lid, 'private', 'invite')));
  await commitInChunks(ops);
  // Lo último, juntos: mientras exista la membresía del dueño, las reglas lo reconocen como admin.
  const last = writeBatch(db);
  if (members.docs.some((d) => d.get('uid') === myUid)) last.delete(doc(db, 'members', memberId(lid, myUid)));
  last.delete(doc(db, 'leagues', lid));
  await last.commit();
}

/** Torneo sin liga: su "liga" de un solo torneo (con dueño, invitación y admins) y el torneo adentro. */
export async function createTournament(owner: { uid: string; name: string }, input: LeagueInput, date: string) {
  const lid = await createLeague(owner, { ...input, kind: 'torneo', schedule: '', seasonStart: date, seasonEnd: date });
  const eid = await createEvent(lid, {
    type: 'torneo',
    name: input.name.trim(),
    date,
    games: 3,
    hcpBase: 230,
    hcpPercent: 80,
    individualRankBy: 'hcp',
    teamRankBy: 'scratch',
    categoryCuts: DEFAULT_CUTS,
    teamSize: 3,
    announcement: '',
  });
  return { lid, eid };
}

/** Código de invitación: 8 caracteres sin letras que se confundan (O/0, I/1). */
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

/** Código vigente de la liga (solo lo leen sus admins). */
export async function getInviteCode(lid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'leagues', lid, 'private', 'invite'));
  return snap.exists() ? (snap.get('code') as string) : null;
}

/** Crea (o cambia) el código de invitación: el anterior deja de servir. */
export async function renewInviteCode(league: League) {
  const old = await getInviteCode(league.id);
  const code = randomCode();
  const batch = writeBatch(db);
  if (old) batch.delete(doc(db, 'invites', old));
  batch.set(doc(db, 'invites', code), { leagueId: league.id, leagueName: league.name, createdAt: serverTimestamp() });
  batch.set(doc(db, 'leagues', league.id, 'private', 'invite'), { code });
  await batch.commit();
  return code;
}

export async function getInvite(code: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', code.trim().toUpperCase()));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Invite) : null;
}

// Ligas a las que la cuenta se está uniendo ahora (mientras se le crea su jugador).
const joining = new Set<string>();
const joiningListeners = new Set<() => void>();
function setJoining(lid: string, on: boolean) {
  if (on) joining.add(lid);
  else joining.delete(lid);
  joiningListeners.forEach((l) => l());
}
export const isJoining = (lid: string) => joining.has(lid);

export function useJoining(lid: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      joiningListeners.add(cb);
      return () => joiningListeners.delete(cb);
    },
    () => joining.has(lid),
  );
}

/**
 * Unirse a una liga (pública sin más, privada con el código de invitación). Entrar es participar:
 * la cuenta juega con su propio jugador. Devuelve su jugador (o null si no se pudo crear todavía:
 * se crea solo la próxima vez que abra la liga).
 */
export async function joinLeague(
  lid: string,
  user: { uid: string; name: string },
  code: string | null,
  /** El jugador de la lista que dijo ser ("¿Eres tú? Crea tu cuenta"): se vincula si sigue sin cuenta. */
  prefer: string | null = null,
): Promise<string | null> {
  setJoining(lid, true);
  try {
    return await joinAsPlayer(lid, user, code, prefer);
  } finally {
    setJoining(lid, false);
  }
}

async function joinAsPlayer(lid: string, user: { uid: string; name: string }, code: string | null, prefer: string | null): Promise<string | null> {
  await setDoc(doc(db, 'members', memberId(lid, user.uid)), {
    leagueId: lid,
    uid: user.uid,
    name: user.name,
    role: 'member',
    playerId: null,
    joinedAt: serverTimestamp(),
    ...(code ? { code: code.trim().toUpperCase() } : {}),
  });
  try {
    return await ensurePlayer(lid, user.uid, user.name, { prefer });
  } catch (e) {
    // Ya es miembro; su jugador se crea solo la próxima vez que abra la liga.
    console.error(e);
    return null;
  }
}

// Jugadores que se están dejando listos ahora (una sola vez aunque se pida desde varios lados).
const ensuring = new Map<string, Promise<string>>();

/**
 * La cuenta juega en la liga con su propia cuenta. Si en la lista hay un jugador sin cuenta con su mismo
 * nombre (lo creó el admin, p. ej. de un torneo importado), se vincula con él y conserva sus juegos; si
 * no, se crea su jugador. `fresh`: liga recién creada (no hay lista que mirar; sirve sin señal).
 */
export function ensurePlayer(
  lid: string,
  uid: string,
  name: string,
  { fresh = false, prefer = null }: { fresh?: boolean; prefer?: string | null } = {},
): Promise<string> {
  const key = `${lid}:${uid}`;
  const pending = ensuring.get(key);
  // Una liga recién creada no espera a un intento anterior que pudo fallar (se reintenta sin mirar la lista).
  if (pending) return fresh ? pending.catch(() => ensurePlayer(lid, uid, name, { fresh })) : pending;
  const next = becomePlayer(lid, uid, name, fresh, prefer).finally(() => ensuring.delete(key));
  ensuring.set(key, next);
  return next;
}

async function becomePlayer(lid: string, uid: string, name: string, fresh: boolean, prefer: string | null): Promise<string> {
  if (fresh) return createOwnPlayer(lid, uid, name);
  // Lo que dice el servidor, no la copia del teléfono: en otro teléfono o pestaña quizá ya tiene su jugador.
  // Sin señal no se crea nada (se intenta otra vez al abrir la liga).
  const memberRef = doc(db, 'members', memberId(lid, uid));
  const [me, snap] = await Promise.all([getDocFromServer(memberRef), getDocsFromServer(col(lid, 'players'))]);
  const current = me.get('playerId') as string | null | undefined;
  if (current) return current;
  // Ya tiene un jugador suyo (se creó en otro lado y la membresía no llegó a apuntarlo).
  const mine = snap.docs.find((d) => d.get('uid') === uid);
  if (mine) {
    await updateDoc(memberRef, { playerId: mine.id });
    return mine.id;
  }
  const free = snap.docs.filter((d) => !d.get('uid'));
  const chosen = prefer ? free.find((d) => d.id === prefer) : undefined;
  const same = free.filter((d) => normalizeName(String(d.get('name') ?? '')) === normalizeName(name));
  const claim = chosen ?? (same.length === 1 ? same[0] : undefined);
  if (claim) {
    await claimPlayer(lid, uid, claim.id);
    return claim.id;
  }
  return createOwnPlayer(lid, uid, name);
}

/** Salir de la liga (o que un admin saque a alguien): su jugador queda sin cuenta. */
export async function removeMember(member: Member) {
  // Sus juegos "en vivo" también se van (si no, seguirían saliendo a nombre de su jugador).
  const live = member.playerId ? await getDocs(query(col(member.leagueId, 'live'), where('playerId', '==', member.playerId))) : null;
  const batch = writeBatch(db);
  live?.docs.forEach((d) => batch.delete(d.ref));
  if (member.playerId) batch.update(ref(member.leagueId, 'players', member.playerId), { uid: null });
  batch.delete(doc(db, 'members', member.id));
  await batch.commit();
}

export async function setMemberRole(member: Member, role: Exclude<LeagueRole, 'owner'>) {
  await updateDoc(doc(db, 'members', member.id), { role });
}

/** Anotador del torneo (solo lo cambia el dueño). */
export async function setMemberScorer(member: Member, scorer: boolean) {
  await updateDoc(doc(db, 'members', member.id), { scorer });
}

export async function setSuperadmin(uid: string, value: boolean) {
  await updateDoc(doc(db, 'users', uid), { superadmin: value });
}

// ---------- Jugadores y vínculo con la cuenta ----------

export async function createPlayer(lid: string, name: string, averageOverride: number | null) {
  const r = doc(col(lid, 'players'));
  await setDoc(r, { name: name.trim(), averageOverride, createdAt: serverTimestamp() });
  return r.id;
}

export async function updatePlayer(lid: string, id: string, patch: Partial<Omit<Player, 'id'>>) {
  await updateDoc(ref(lid, 'players', id), patch);
}

/** Borra el jugador con sus participaciones y envíos; su cuenta, si tiene, queda sin vincular. */
export async function deletePlayer(lid: string, id: string, uid?: string | null) {
  const [entries, subs, reactions, comments, live] = await Promise.all([
    getDocs(query(col(lid, 'entries'), where('playerId', '==', id))),
    getDocs(query(col(lid, 'submissions'), where('playerId', '==', id))),
    getDocs(query(col(lid, 'reactions'), where('playerId', '==', id))),
    getDocs(query(col(lid, 'comments'), where('playerId', '==', id))),
    getDocs(query(col(lid, 'live'), where('playerId', '==', id))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  entries.docs.forEach((d) => {
    const eventId = d.get('eventId') as string;
    ops.push((b) => b.delete(d.ref));
    ops.push((b) => b.update(ref(lid, 'events', eventId), { playerCount: increment(-1) }));
  });
  [...subs.docs, ...reactions.docs, ...comments.docs, ...live.docs].forEach((d) => ops.push((b) => b.delete(d.ref)));
  if (uid) ops.push((b) => b.update(doc(db, 'members', memberId(lid, uid)), { playerId: null }));
  ops.push((b) => b.delete(ref(lid, 'players', id)));
  await commitInChunks(ops);
}

/** La cuenta se vincula con un jugador de la liga que todavía no tiene cuenta (conserva sus juegos). */
export async function claimPlayer(lid: string, uid: string, playerId: string) {
  const batch = writeBatch(db);
  batch.update(ref(lid, 'players', playerId), { uid });
  batch.update(doc(db, 'members', memberId(lid, uid)), { playerId });
  await batch.commit();
}

/** Crea el jugador de la cuenta en la liga, ya vinculado. */
export async function createOwnPlayer(lid: string, uid: string, name: string) {
  const playerId = newId(lid, 'players');
  const batch = writeBatch(db);
  batch.set(ref(lid, 'players', playerId), { name: name.trim(), averageOverride: null, uid, createdAt: serverTimestamp() });
  batch.update(doc(db, 'members', memberId(lid, uid)), { playerId });
  await batch.commit();
  return playerId;
}

/**
 * Admin: une la cuenta de un miembro con un jugador de la lista que no tiene cuenta (p. ej. el de un
 * torneo importado, que se unió con otro nombre): sus juegos pasan a ser de la cuenta. Del jugador que
 * tenía, lo pendiente (envíos por aprobar, "voy") pasa al nuevo; si nunca participó en un evento se borra,
 * y si participó se queda en la lista sin cuenta. Se decide con lo que hay en el servidor (necesita señal).
 */
export async function linkAccountToPlayer(lid: string, member: Member, playerId: string): Promise<{ removedOld: boolean }> {
  const [target, me] = await Promise.all([getDocFromServer(ref(lid, 'players', playerId)), getDocFromServer(doc(db, 'members', member.id))]);
  if (!target.exists()) throw new Error('Ese jugador ya no existe.');
  const owner = target.get('uid') as string | null | undefined;
  if (owner && owner !== member.uid) throw new Error('Ese jugador ya tiene cuenta.');
  const current = (me.get('playerId') as string | null | undefined) ?? null;
  const old = current && current !== playerId ? current : null;
  const ops: ((b: WriteBatch) => void)[] = [
    (b) => b.update(ref(lid, 'players', playerId), { uid: member.uid }),
    (b) => b.update(doc(db, 'members', member.id), { playerId }),
  ];
  let removedOld = false;
  if (old) {
    const [entries, subs, live, going] = await Promise.all([
      getDocsFromServer(query(col(lid, 'entries'), where('playerId', '==', old), limit(1))),
      getDocsFromServer(query(col(lid, 'submissions'), where('playerId', '==', old))),
      getDocsFromServer(query(col(lid, 'live'), where('playerId', '==', old))),
      getDocsFromServer(query(col(lid, 'events'), where(`rsvp.${old}`, '==', true))),
    ]);
    removedOld = entries.empty;
    // Sus envíos pasan al jugador de la cuenta (los ya revisados solo si el viejo se borra: sus juegos se quedan con él).
    subs.docs
      .filter((d) => removedOld || d.get('status') === 'pendiente')
      .forEach((d) => ops.push((b) => b.update(d.ref, { playerId })));
    // Lo "en vivo" del viejo se quita; el "voy" pasa al nuevo.
    live.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    going.docs.forEach((d) => ops.push((b) => b.update(d.ref, { [`rsvp.${old}`]: deleteField(), [`rsvp.${playerId}`]: true })));
    ops.push((b) => (removedOld ? b.delete(ref(lid, 'players', old)) : b.update(ref(lid, 'players', old), { uid: null })));
  }
  await commitInChunks(ops);
  return { removedOld };
}

/**
 * Admin: separa la cuenta del jugador (se vinculó al perfil equivocado, p. ej. otra persona con el mismo
 * nombre) y le da a la cuenta su propio jugador nuevo en el mismo momento: si quedara sin jugador, al abrir
 * la liga se volvería a vincular sola con este mismo por el nombre.
 */
export async function unlinkAccount(lid: string, playerId: string, account: { uid: string; name: string }) {
  // Lo que esa cuenta publicó en vivo a nombre del jugador se quita (la anotó quien no era).
  const live = await getDocs(query(col(lid, 'live'), where('playerId', '==', playerId)));
  const self = account.uid === auth.currentUser?.uid;
  const own = newId(lid, 'players');
  const batch = writeBatch(db);
  live.docs.forEach((d) => batch.delete(d.ref));
  batch.update(ref(lid, 'players', playerId), { uid: null });
  if (self) {
    // Uno mismo: las reglas no dejan tener dos jugadores propios a la vez; el nuevo va justo después.
    batch.update(doc(db, 'members', memberId(lid, account.uid)), { playerId: null });
  } else {
    batch.set(ref(lid, 'players', own), { name: account.name.trim(), averageOverride: null, uid: account.uid, createdAt: serverTimestamp() });
    batch.update(doc(db, 'members', memberId(lid, account.uid)), { playerId: own });
  }
  await batch.commit();
  if (self) await createOwnPlayer(lid, account.uid, account.name);
}

// ---------- Eventos ----------

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
}

export async function createEvent(lid: string, input: EventInput) {
  const r = doc(col(lid, 'events'));
  await setDoc(r, { ...input, teams: {}, playerCount: 0, createdAt: serverTimestamp() });
  return r.id;
}

export async function updateEvent(lid: string, id: string, patch: Partial<EventInput>) {
  await updateDoc(ref(lid, 'events', id), patch);
}

export async function deleteEvent(lid: string, id: string) {
  const names: LeagueCol[] = ['entries', 'submissions', 'photos', 'reactions', 'comments', 'live'];
  const snaps = await Promise.all(names.map((n) => getDocs(query(col(lid, n), where('eventId', '==', id)))));
  const ops: ((b: WriteBatch) => void)[] = [];
  snaps.flatMap((s) => s.docs).forEach((d) => ops.push((b) => b.delete(d.ref)));
  ops.push((b) => b.delete(ref(lid, 'events', id)));
  await commitInChunks(ops);
}

/** Las participaciones de esos eventos (para descargar la temporada o la liga en Excel), de a 30. */
export async function fetchEntriesOfEvents(lid: string, eventIds: string[]): Promise<Entry[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 30) chunks.push(eventIds.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map((chunk) => getDocs(query(col(lid, 'entries'), where('eventId', 'in', chunk)))));
  return snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry));
}

/** Un juego más en la sesión (hasta 10): en la práctica siguieron jugando. */
export async function addEventGame(lid: string, event: Pick<BowlingEvent, 'id' | 'games'>) {
  if (event.games >= 10) return;
  try {
    await updateDoc(ref(lid, 'events', event.id), { games: event.games + 1 });
  } catch (e) {
    // Otro jugador lo agregó al mismo tiempo (las reglas dejan sumar de uno en uno): ya está.
    const now = await getDoc(ref(lid, 'events', event.id)).catch(() => null);
    if (Number(now?.get('games') ?? 0) > event.games) return;
    throw e;
  }
}

/** El jugador confirma (o quita) que va a la práctica. */
export async function setRsvp(lid: string, eventId: string, playerId: string, going: boolean) {
  await updateDoc(ref(lid, 'events', eventId), { [`rsvp.${playerId}`]: going ? true : deleteField() });
}

/** Inscribe jugadores en el evento con el promedio que tienen hoy. */
export async function addEntries(lid: string, event: BowlingEvent, players: { id: string; average: number }[]) {
  const batch = writeBatch(db);
  for (const p of players) {
    batch.set(ref(lid, 'entries', entryId(event.id, p.id)), {
      eventId: event.id,
      playerId: p.id,
      teamId: null,
      average: p.average,
      handicapOverride: null,
      scores: slots([], event.games, null),
      photos: slots([], event.games, null),
      createdAt: serverTimestamp(),
    });
  }
  batch.update(ref(lid, 'events', event.id), { playerCount: increment(players.length) });
  await batch.commit();
}

export async function updateEntry(lid: string, id: string, patch: Partial<Omit<Entry, 'id' | 'eventId' | 'playerId'>>) {
  await updateDoc(ref(lid, 'entries', id), patch);
}

export async function updateEntries(lid: string, patches: { id: string; patch: Partial<Entry> }[]) {
  await commitInChunks(patches.map(({ id, patch }) => (b) => b.update(ref(lid, 'entries', id), patch)));
}

/** Guarda un juego: pinos, cuadros (si se anotó tiro por tiro) y si cuenta sin foto. */
export async function saveGame(
  lid: string,
  event: BowlingEvent,
  entry: Entry,
  game: number,
  value: { score: number | null; frames: GameFrames | null },
  requirePhoto: boolean,
) {
  const scores = slots(entry.scores, event.games, null);
  const photos = slots(entry.photos, event.games, null);
  scores[game] = value.score;
  // Sin foto obligatoria el juego cuenta de una; con foto, vuelve a borrador hasta verificarlo.
  photos[game] = value.score != null && !requirePhoto ? NO_PHOTO : null;
  await updateDoc(ref(lid, 'entries', entry.id), {
    scores,
    photos,
    [`frames.${game}`]: value.frames ?? deleteField(),
  });
}

export async function removeEntry(lid: string, entry: Entry) {
  // Con sus me gusta y comentarios.
  const social = await Promise.all(
    (['reactions', 'comments'] as const).map((n) => getDocs(query(col(lid, n), where('entryId', '==', entry.id)))),
  );
  const ops: ((b: WriteBatch) => void)[] = social.flatMap((s) => s.docs).map((d) => (b: WriteBatch) => b.delete(d.ref));
  ops.push((b) => b.delete(ref(lid, 'entries', entry.id)));
  // Lo que anotaba en vivo en ese evento (mismo id que la participación).
  ops.push((b) => b.delete(ref(lid, 'live', entry.id)));
  ops.push((b) => b.update(ref(lid, 'events', entry.eventId), { playerCount: increment(-1) }));
  await commitInChunks(ops);
}

// ---------- Social: me gusta, felicitar y comentarios en los juegos ----------

export const reactionId = (entryId: string, uid: string) => `${entryId}_${uid}`;
type SocialTarget = Pick<Entry, 'id' | 'eventId' | 'playerId'>;
const target = (entry: SocialTarget) => ({ entryId: entry.id, eventId: entry.eventId, playerId: entry.playerId });

/** Me gusta o felicitar el juego de alguien (una reacción por persona; null la quita). */
export async function setReaction(lid: string, entry: SocialTarget, user: { uid: string; name: string }, type: ReactionType | null) {
  const r = ref(lid, 'reactions', reactionId(entry.id, user.uid));
  if (!type) return deleteDoc(r);
  await setDoc(r, { ...target(entry), uid: user.uid, name: user.name, type, createdAt: serverTimestamp() });
}

export const MAX_COMMENT = 500;
/** Segundos entre dos comentarios de la misma persona (las reglas lo exigen). */
export const COMMENT_PACE_S = 3;

/** Comenta el juego de alguien; junto se marca la hora (las reglas ponen un ritmo: nada de spam). */
export async function addComment(lid: string, entry: SocialTarget, user: { uid: string; name: string }, text: string) {
  const batch = writeBatch(db);
  const comment = doc(col(lid, 'comments'));
  batch.set(comment, {
    ...target(entry),
    uid: user.uid,
    name: user.name,
    text: text.trim().slice(0, MAX_COMMENT),
    createdAt: serverTimestamp(),
  });
  // La marca dice cuál comentario es: un lote no puede meter muchos comentarios con una sola marca.
  batch.set(ref(lid, 'limits', user.uid), { lastComment: serverTimestamp(), commentId: comment.id }, { merge: true });
  await batch.commit();
}

// ---------- Buzón de sugerencias (anónimo) ----------

export const MAX_SUGGESTION = 1000;
/** Segundos entre dos sugerencias de la misma persona (las reglas lo exigen). */
export const SUGGESTION_PACE_S = 60;

/**
 * Deja una nota en el buzón de la liga. No guarda quién la escribió: solo el mensaje y la fecha.
 * El ritmo (una por minuto) se marca aparte, en un documento que nadie de la app puede leer.
 */
export async function sendSuggestion(lid: string, uid: string, text: string) {
  const batch = writeBatch(db);
  const note = doc(col(lid, 'suggestions'));
  batch.set(note, { text: text.trim().slice(0, MAX_SUGGESTION), read: false, createdAt: serverTimestamp() });
  // La marca de ritmo (que nadie de la app puede leer) dice cuál nota es: una por lote, una por minuto.
  batch.set(ref(lid, 'limits', uid), { lastSuggestion: serverTimestamp(), suggestionId: note.id }, { merge: true });
  await batch.commit();
}

/** Organizadores: las notas del buzón (las nuevas primero en la pantalla). */
export const useSuggestions = (lid: string | undefined) =>
  useLiveQuery<Suggestion>(lid ? `sugerencias:${lid}` : null, () => query(col(lid!, 'suggestions'), orderBy('createdAt', 'desc')));

export async function markSuggestions(lid: string, ids: string[], read: boolean) {
  await commitInChunks(ids.map((id) => (b: WriteBatch) => b.update(ref(lid, 'suggestions', id), { read })));
}

export async function deleteSuggestion(lid: string, id: string) {
  await deleteDoc(ref(lid, 'suggestions', id));
}

export async function deleteComment(lid: string, id: string) {
  await deleteDoc(ref(lid, 'comments', id));
}

// ---------- Equipos ----------

export async function addTeam(lid: string, eventId: string, name: string) {
  await updateDoc(ref(lid, 'events', eventId), { [`teams.${newId(lid, 'events')}`]: { name, order: Date.now() } });
}

export async function renameTeam(lid: string, eventId: string, teamId: string, name: string) {
  await updateDoc(ref(lid, 'events', eventId), { [`teams.${teamId}.name`]: name });
}

/**
 * Arma los equipos de una vez: reutiliza los equipos existentes en orden (con el nombre que se les dio),
 * crea los que falten, borra los que sobren y asigna a cada inscrito. Todo en una sola escritura.
 */
export async function applyTeams(lid: string, event: BowlingEvent, groups: { teamId: string | null; name: string; entryIds: string[] }[]) {
  const batch = writeBatch(db);
  const eventPatch: Record<string, unknown> = {};
  const used = new Set<string>();
  groups.forEach((g, i) => {
    const teamId = g.teamId ?? newId(lid, 'events');
    used.add(teamId);
    if (!g.teamId) eventPatch[`teams.${teamId}`] = { name: g.name, order: Date.now() + i };
    // Un equipo que se reutiliza se queda con el nombre nuevo si se lo cambiaron.
    else if (event.teams?.[g.teamId] && event.teams[g.teamId].name !== g.name) eventPatch[`teams.${teamId}.name`] = g.name;
    g.entryIds.forEach((id) => batch.update(ref(lid, 'entries', id), { teamId }));
  });
  Object.keys(event.teams ?? {})
    .filter((id) => !used.has(id))
    .forEach((id) => (eventPatch[`teams.${id}`] = deleteField()));
  if (Object.keys(eventPatch).length) batch.update(ref(lid, 'events', event.id), eventPatch);
  await batch.commit();
}

export async function deleteTeam(lid: string, eventId: string, teamId: string, memberEntryIds: string[]) {
  const batch = writeBatch(db);
  batch.update(ref(lid, 'events', eventId), { [`teams.${teamId}`]: deleteField() });
  memberEntryIds.forEach((id) => batch.update(ref(lid, 'entries', id), { teamId: null }));
  await batch.commit();
}

// ---------- Fotos, verificación y envíos ----------

/** Solo lo que se guarda de la foto (la versión grande para la IA no sube). */
const photoFields = (p: Omit<Photo, 'id'>) => ({ data: p.data, width: p.width, height: p.height });

export interface VerifiedWrite {
  /** Participación existente o null si hay que inscribir al jugador. */
  entry: Entry | null;
  playerId: string;
  average: number;
  /** juego (índice) -> pinos */
  values: Record<number, number>;
}

/**
 * Guarda la foto y marca como verificados los juegos que se leyeron de ella (admin).
 * Inscribe al jugador si todavía no estaba en el evento.
 */
export async function saveVerifiedGames(lid: string, event: BowlingEvent, photo: Omit<Photo, 'id'>, writes: VerifiedWrite[]) {
  const photoId = newId(lid, 'photos');
  const batch = writeBatch(db);
  batch.set(ref(lid, 'photos', photoId), { ...photoFields(photo), eventId: event.id, createdAt: serverTimestamp() });
  let added = 0;
  for (const w of writes) {
    const scores = slots(w.entry?.scores, event.games, null);
    const photos = slots(w.entry?.photos, event.games, null);
    for (const [i, v] of Object.entries(w.values)) {
      scores[+i] = v;
      photos[+i] = photoId;
    }
    if (w.entry) {
      batch.update(ref(lid, 'entries', w.entry.id), { scores, photos });
    } else {
      added++;
      batch.set(ref(lid, 'entries', entryId(event.id, w.playerId)), {
        eventId: event.id,
        playerId: w.playerId,
        teamId: null,
        average: w.average,
        handicapOverride: null,
        scores,
        photos,
        createdAt: serverTimestamp(),
      });
    }
  }
  if (added) batch.update(ref(lid, 'events', event.id), { playerCount: increment(added) });
  await batch.commit();
  return photoId;
}

/** Envío de un jugador: juegos (y foto si hay), quedan pendientes de aprobación. */
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
    photo: Omit<Photo, 'id'> | null;
  },
) {
  const photoId = input.photo ? newId(lid, 'photos') : null;
  const subId = newId(lid, 'submissions');
  const batch = writeBatch(db);
  if (input.photo && photoId) {
    batch.set(ref(lid, 'photos', photoId), { ...photoFields(input.photo), eventId: input.eventId, createdAt: serverTimestamp() });
  }
  // Lo enviado sale de "en vivo" (ahora se ve como enviado); lo que siga anotando se vuelve a publicar.
  if (input.eventId) batch.delete(ref(lid, 'live', `${input.eventId}_${input.playerId}`));
  batch.set(ref(lid, 'submissions', subId), {
    playerId: input.playerId,
    eventId: input.eventId,
    date: input.eventId ? null : input.date,
    scores: input.scores,
    scanned: input.scanned,
    frames: input.frames,
    photoId,
    status: 'pendiente',
    note: null,
    createdAt: serverTimestamp(),
  });
  // El id sale ya (sin señal el envío queda en cola): la lectura de la foto se le agrega después.
  return { id: subId, sent: batch.commit() };
}

/**
 * Lo que leyó la IA en la foto de un envío y de qué fila de la foto (la foto se lee en segundo plano,
 * así que llega después de enviar). El jugador lo pone una sola vez mientras está pendiente; el admin,
 * siempre (lee la foto él o cambia la fila).
 */
export async function setSubmissionScan(lid: string, subId: string, scanned: (number | null)[], scannedName: string | null) {
  await updateDoc(ref(lid, 'submissions', subId), { scanned, scannedName: scannedName?.slice(0, 60) ?? null });
}

/**
 * Aprueba un envío: copia los juegos (y sus cuadros) a la participación del jugador como verificados.
 * `values` va por juego del evento; `start` es el juego donde cae el J1 del envío.
 */
export async function approveSubmission(
  lid: string,
  sub: Submission,
  event: BowlingEvent,
  entry: Entry | null,
  average: number,
  values: Record<number, number>,
  start: number,
) {
  const batch = writeBatch(db);
  const scores = slots(entry?.scores, event.games, null);
  const photos = slots(entry?.photos, event.games, null);
  const frames: Record<string, GameFrames> = { ...(entry?.frames ?? {}) };
  for (const [i, v] of Object.entries(values)) {
    scores[+i] = v;
    photos[+i] = sub.photoId ?? NO_PHOTO;
    const f = sub.frames?.[String(+i - start)];
    // Los cuadros solo valen si dan el mismo total que se aprueba.
    if (f && scoreGame(f.rolls).score === v) frames[i] = f;
    else delete frames[i];
  }
  const payload = { scores, photos, frames };
  if (entry) {
    batch.update(ref(lid, 'entries', entry.id), payload);
  } else {
    batch.set(ref(lid, 'entries', entryId(event.id, sub.playerId)), {
      eventId: event.id,
      playerId: sub.playerId,
      teamId: null,
      average,
      handicapOverride: null,
      ...payload,
      createdAt: serverTimestamp(),
    });
    batch.update(ref(lid, 'events', event.id), { playerCount: increment(1) });
  }
  batch.update(ref(lid, 'submissions', sub.id), {
    status: 'aprobado',
    eventId: event.id,
    reviewedAt: serverTimestamp(),
    reviewedBy: auth.currentUser?.uid ?? null,
  });
  // La foto de un envío por fecha queda asociada al evento (se borra con él).
  if (!sub.eventId && sub.photoId) batch.update(ref(lid, 'photos', sub.photoId), { eventId: event.id });
  await batch.commit();
}

/**
 * Evento donde se aprueba un envío por fecha: la práctica de ese día o, si no existe, se crea.
 * Devuelve el evento listo para usar en approveSubmission.
 */
export async function practiceForDate(lid: string, events: BowlingEvent[], date: string, games: number): Promise<BowlingEvent> {
  const existing = events.find((e) => e.type === 'practica' && e.date === date);
  if (existing) return existing;
  const input: EventInput = {
    type: 'practica',
    name: '',
    date,
    games: Math.max(3, games),
    hcpBase: 0,
    hcpPercent: 0,
    individualRankBy: 'scratch',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 0,
    announcement: '',
  };
  const id = await createEvent(lid, input);
  return { id, ...input, teams: {}, playerCount: 0 };
}

export async function rejectSubmission(lid: string, sub: Submission, note: string | null) {
  await updateDoc(ref(lid, 'submissions', sub.id), { status: 'rechazado', note, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser?.uid ?? null });
}

/**
 * Libera espacio: borra las fotos de la liga de hace más de `months` meses.
 * Los juegos siguen verificados; solo deja de verse la foto.
 */
export async function deleteOldPhotos(lid: string, months: number) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const snap = await getDocs(query(col(lid, 'photos'), where('createdAt', '<', Timestamp.fromDate(cutoff))));
  await commitInChunks(snap.docs.map((d) => (b) => b.delete(d.ref)));
  return snap.size;
}
