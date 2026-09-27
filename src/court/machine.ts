import { asBackendError, classifyError } from '../lib/db/errors';
import type { ClaimResult, FinishResult, MatchScore, MatchStatus, PublishResult } from '../lib/data/matches';
import type { Side } from '../sports/types';
import type { CourtStore } from './log';
import { createPublisher, type Publisher } from './publisher';
import { applyEvent, canUndo, isSnapshot, outcome, pickSnapshot, snapshotState, startSnapshot, undoEvent, withOrigin, type LocalCourt } from './session';
import type { CourtAdapter, CourtParent, CourtSnapshot } from './types';

/**
 * El anotador de un partido sin React: lista de jugadas guardada en el teléfono, turno de anotar, publicación
 * con tope y final. `useCourt` lo envuelve para las pantallas; las pruebas lo usan directo.
 */

/** Quién tiene el turno de anotar, visto desde este teléfono. */
export type LeaseState =
  /** Preguntando al servidor (se puede anotar mientras tanto). */
  | { kind: 'checking' }
  /** Este teléfono anota. */
  | { kind: 'mine' }
  /** Sin señal: se anota igual y se publica al volver. */
  | { kind: 'offline' }
  /** Otro anotador tomó el control. La lista de este teléfono queda guardada. */
  | { kind: 'other'; scorerId: string | null; scorerName: string | null; expired: boolean }
  /** Otro teléfono de la misma cuenta publicó algo más nuevo. */
  | { kind: 'stale' }
  /** Esta cuenta no puede anotar este partido. */
  | { kind: 'denied' }
  /** El partido ya no se anota (terminado, aplazado, suspendido, anulado). Suspendido: se retoma con `claim`. */
  | { kind: 'closed'; status: MatchStatus };

export interface CourtView<C = unknown, S = unknown, E = unknown> {
  ready: boolean;
  snapshot: CourtSnapshot<C, S, E> | null;
  state: S | null;
  over: boolean;
  winner: Side | null;
  summary: string;
  score: MatchScore | null;
  canUndo: boolean;
  lease: LeaseState;
  /** No se puede anotar desde este teléfono (otro anota, o el partido se cerró). */
  readOnly: boolean;
  /** Acciones que el servidor todavía no confirma. */
  unsent: number;
  /** Se usó la lista del servidor y la de este teléfono (con jugadas sin enviar) quedó guardada aparte. */
  conflict: boolean;
  /** Última jugada rechazada por el motor (mensaje en español). */
  error: string | null;
}

export interface CourtDeps {
  claim(force: boolean): Promise<ClaimResult>;
  /** Publica (por la cola); la promesa se cumple cuando el servidor responde. */
  publish(p: { seq: number; state: Record<string, unknown>; score: MatchScore | null }): Promise<PublishResult>;
  /** Termina; undefined = quedó en la cola (sin señal). */
  finish(r: { score: MatchScore; winner: Side | null; state: Record<string, unknown>; seq: number }): Promise<FinishResult | undefined>;
  suspend(r: { score: MatchScore | null; state: Record<string, unknown>; seq: number; note?: string }): Promise<void>;
  /** Suelta el turno (al salir sin haber anotado nada de un partido suspendido que se abrió solo para mirar). */
  release?(): Promise<void>;
  /**
   * Quita de la cola lo que este teléfono tenía por publicar o terminar de este partido: su lista ya no vale (otro
   * anotador, otra lista más nueva, se tomó la del servidor, el partido se suspendió).
   */
  discardQueued?(): Promise<unknown>;
  /** Lo último que este teléfono vio del partido (caché de useMatch): para seguir sin señal y sin lista propia. */
  cached?(): { state: unknown; seq: number } | null;
  store: CourtStore;
  /** Id de este teléfono para este partido (ver courtOrigin). */
  origin: string;
}

export interface CourtMachineOptions<C, S, E> {
  lid: string;
  mid: string;
  userId: string | null;
  adapter: CourtAdapter<C, S, E>;
  /** Para empezar si no hay lista en el teléfono ni en el servidor (null = la pantalla pide el sorteo y llama start). */
  config?: C | null;
  deps: CourtDeps;
  publisher?: { minGapMs?: number; idleMs?: number };
  /** Sin señal, cada cuánto se vuelve a pedir el turno (ms). Por defecto 20 s (y al volver la señal, ya). */
  claimRetryMs?: number;
}

export interface CourtMachine<C, S, E> {
  getView(): CourtView<C, S, E>;
  subscribe(listener: () => void): () => void;
  /** Carga la lista del teléfono y (si `claim`) pide el turno. */
  open(claim?: boolean): Promise<void>;
  /** Empieza de cero con esta configuración (si todavía no hay lista). */
  start(config: C): void;
  /** Aplica una jugada. Devuelve null o el mensaje de error del motor. */
  apply(ev: E): string | null;
  undo(): boolean;
  /** Pide el turno otra vez (el admin con `force` se lo quita a otro; también retoma un suspendido). */
  claim(force?: boolean): Promise<ClaimResult | null>;
  finish(): Promise<'sent' | 'queued' | 'stale'>;
  suspend(note?: string): Promise<void>;
  /** Publica ya lo pendiente (al pasar a segundo plano). */
  flush(): void;
  /** El servidor dice que el partido cambió de estado (useMatch). */
  setStatus(status: MatchStatus | null | undefined): void;
  close(): void;
}

const OPEN: readonly MatchStatus[] = ['scheduled', 'live', 'suspended'];
const READ_ONLY = new Set<LeaseState['kind']>(['other', 'stale', 'denied', 'closed']);
/** Sin señal: cada cuánto se vuelve a pedir el turno. */
export const CLAIM_RETRY_MS = 20_000;

const plain = (snap: CourtSnapshot) => snap as unknown as Record<string, unknown>;
const originOf = (state: unknown): string | null => {
  const o = state && typeof state === 'object' ? (state as { origin?: unknown }).origin : null;
  return typeof o === 'string' && o ? o : null;
};

/** Lo que manda el publicador: la lista y en qué «época» (cambia al tomar otra lista: lo de antes ya no cuenta). */
interface Sent {
  epoch: number;
  result?: PublishResult;
  error?: unknown;
}

export function createCourtMachine<C, S, E>(o: CourtMachineOptions<C, S, E>): CourtMachine<C, S, E> {
  const { lid, mid, adapter, deps } = o;
  const listeners = new Set<() => void>();
  let snap: CourtSnapshot<C, S, E> | null = null;
  let state: S | null = null;
  let lease: LeaseState = { kind: 'checking' };
  let ready = false;
  let published = 0;
  let conflict = false;
  /** Lista de este teléfono que perdió contra la del servidor (se guarda aparte). */
  let orphan: CourtSnapshot | null = null;
  /** El final ya se mandó (quizá sigue en la cola): cuando el servidor lo tenga, la lista se borra. */
  let finishedSent = false;
  let error: string | null = null;
  let closed = false;
  let view: CourtView<C, S, E> | null = null;
  /** Id de este teléfono en esta lista: el de la lista guardada si hay (no cambia a mitad de partido). */
  let origin = deps.origin;
  /**
   * La lista ya se comparó con la del servidor (se pidió el turno con señal) o ya se publicó antes. Mientras no,
   * sin señal no se publica: al volver la señal primero se pide el turno (si otro siguió el partido, gana el
   * servidor y esta lista queda aparte, en vez de pisarlo o quedar «vieja»).
   */
  let verified = false;
  /** Lo que tenía el partido al tomar el turno (para las listas que empiezan después). */
  let parent: CourtParent | null = null;
  /** Estado del partido que se vio por última vez (useMatch) y al tomar el turno. */
  let lastStatus: MatchStatus | null = null;
  let claimedStatus: MatchStatus | null = null;
  /** En esta sesión se anotó, deshizo, empezó o publicó algo. */
  let touched = false;
  /** Sube al dejar una lista (se tomó la del servidor, otro anotador, lista vieja): sus respuestas ya no cuentan. */
  let epoch = 0;
  let claiming: Promise<ClaimResult | null> | null = null;
  let autoClaim = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const publisher: Publisher = createPublisher<{ snap: CourtSnapshot<C, S, E>; state: S; epoch: number }>({
    // Solo lo que el servidor todavía no tiene: abrir la cancha (se toma lo publicado) y salir no publica nada.
    current: () => (snap && state !== null && snap.seq > published ? { seq: snap.seq, payload: { snap, state, epoch } } : null),
    send: ({ snap: s, state: st, epoch: ep }) => {
      touched = true;
      return deps.publish({ seq: s.seq, state: plain(s), score: adapter.score(st) }).then(
        (result): Sent => ({ epoch: ep, result }),
        (err: unknown): Sent => ({ epoch: ep, error: err }),
      );
    },
    onSent: (seq, x) => {
      const sent = x as Sent;
      if (sent.epoch !== epoch) return;
      if (sent.error !== undefined) onPublishError(sent.error);
      else if (sent.result) onPublished(seq, sent.result);
    },
    onError: (_seq, e) => onPublishError(e),
    minGapMs: o.publisher?.minGapMs,
    idleMs: o.publisher?.idleMs,
  });

  function emit() {
    view = null;
    for (const l of [...listeners]) l();
  }

  /** Sin señal y con una lista que el servidor no conoce: no se publica hasta pedir el turno. */
  function syncPublisher() {
    if (READ_ONLY.has(lease.kind) || (!verified && (lease.kind === 'offline' || lease.kind === 'checking'))) publisher.pause();
    else publisher.resume();
  }

  function clearRetry() {
    if (retry) clearTimeout(retry);
    retry = null;
  }

  function scheduleRetry() {
    if (retry || closed || !autoClaim || !o.userId) return;
    retry = setTimeout(() => {
      retry = null;
      if (!closed && lease.kind === 'offline') void claimNow(false);
    }, o.claimRetryMs ?? CLAIM_RETRY_MS);
  }

  function setLease(next: LeaseState, notify = true) {
    lease = next;
    syncPublisher();
    if (next.kind === 'offline') scheduleRetry();
    else clearRetry();
    if (notify) emit();
  }

  const onOnline = () => {
    if (!closed && lease.kind === 'offline') void claimNow(false);
  };

  function save() {
    if (!snap) return;
    void deps.store.save({ lid, mid, uid: o.userId, snap: snap as CourtSnapshot, published, orphan });
  }

  /** La lista de este teléfono ya no vale: lo suyo en la cola se descarta y sus respuestas no cuentan. */
  function dropQueued() {
    epoch++;
    void deps.discardQueued?.().catch(() => {});
  }

  function onPublishError(e: unknown) {
    if (closed) return;
    // La cola ya reintenta sola lo de red; aquí solo llega lo definitivo (sin permiso, sin sesión).
    if (classifyError(e) === 'final' && asBackendError(e)?.kind === 'permission') setLease({ kind: 'denied' });
    else console.error('publicar partido', e);
  }

  function onPublished(seq: number, r: PublishResult) {
    if (closed) return;
    if (r.ok) {
      verified = true;
      if (seq > published) {
        published = seq;
        void deps.store.patch(lid, mid, { published });
      }
      if (lease.kind === 'offline' || lease.kind === 'checking') setLease({ kind: 'mine' }, false);
      emit();
      return;
    }
    if (r.reason === 'lease') {
      dropQueued();
      // Suspendido (por el admin) sin anotador: se retoma pidiendo el turno.
      if (r.status === 'suspended' && !r.scorerId) setLease({ kind: 'closed', status: 'suspended' });
      else setLease({ kind: 'other', scorerId: r.scorerId ?? null, scorerName: r.scorerName ?? null, expired: false });
    } else if (r.reason === 'stale') {
      dropQueued();
      setLease({ kind: 'stale' });
    } else if (r.reason === 'cerrado') setLease({ kind: 'closed', status: r.status ?? 'finished' });
  }

  function use(next: CourtSnapshot<C, S, E>) {
    snap = withOrigin(next, origin);
    try {
      state = snapshotState(adapter, snap);
      error = null;
    } catch (e) {
      // Una lista que este motor ya no entiende (otra versión de la app): se ve sin marcador.
      state = null;
      error = e instanceof Error ? e.message : 'No se pudo leer la lista de jugadas.';
    }
  }

  /** Lista nueva: sigue desde lo que tenía el partido al tomar el turno (su seq, para no llegar «vieja»). */
  function fresh(config: C): CourtSnapshot<C, S, E> {
    const s = startSnapshot<C, S, E>(config, Date.now(), origin);
    if (parent) {
      s.parent = parent;
      s.seq = Math.max(s.seq, parent.seq);
    }
    published = s.seq;
    return s;
  }

  /**
   * Sin señal y sin lista en el teléfono: se sigue desde lo que el teléfono ya había visto del partido (la caché
   * de useMatch), no desde 0-0. Al volver la señal se pide el turno antes de publicar.
   */
  function seedFromCache() {
    const c = deps.cached?.();
    if (!c || !isSnapshot(c.state)) return;
    const remote = c.state as CourtSnapshot<C, S, E>;
    use(remote);
    published = remote.seq;
    snap = { ...snap!, parent: { origin: originOf(remote), seq: Math.max(c.seq, remote.seq) } };
    save();
  }

  function claimNow(force: boolean): Promise<ClaimResult | null> {
    if (claiming && !force) return claiming;
    const p = doClaim(force);
    claiming = p;
    void p.finally(() => {
      if (claiming === p) claiming = null;
    });
    return p;
  }

  async function doClaim(force: boolean): Promise<ClaimResult | null> {
    try {
      const r = await deps.claim(force);
      if (closed) return r;
      if (!r.ok) {
        dropQueued();
        setLease({ kind: 'other', scorerId: r.scorerId, scorerName: r.scorerName, expired: r.expired });
        return r;
      }
      verified = true;
      claimedStatus = r.status;
      parent = { origin: originOf(r.state), seq: r.seq };
      const local: LocalCourt<C, S, E> | null = snap ? { snap, published } : null;
      const picked = pickSnapshot<C, S, E>(local, r.state);
      if (picked.snap && picked.source === 'remote') {
        if (picked.conflict && snap) orphan = snap as CourtSnapshot;
        conflict = picked.conflict;
        // Se sigue con la lista del servidor: lo que este teléfono tenía en la cola de la suya ya no vale.
        if (snap) dropQueued();
        use(picked.snap);
        // Lo del servidor ya está publicado.
        published = Math.max(published, picked.snap.seq);
        publisher.reset(published);
      }
      if (snap) {
        // El servidor puede ir más adelante que la lista (un estado que no se puede leer): se sigue desde su número.
        snap = { ...snap, seq: Math.max(snap.seq, r.seq), parent };
        save();
      }
      setLease({ kind: 'mine' });
      // Jugadas hechas sin señal: se publican ya.
      if (snap && snap.seq > published) publisher.changed(true);
      return r;
    } catch (e) {
      if (closed) return null;
      const be = asBackendError(e);
      if (be?.kind === 'permission') setLease({ kind: 'denied' });
      else if (be?.message === 'cerrado') {
        // El final que quedó en la cola ya llegó: la lista del teléfono ya no hace falta.
        if (finishedSent) void deps.store.remove(lid, mid);
        setLease({ kind: 'closed', status: 'finished' });
      } else setLease({ kind: 'offline' });
      return null;
    }
  }

  function computeView(): CourtView<C, S, E> {
    const out = state !== null ? outcome(adapter, state) : null;
    return {
      ready,
      snapshot: snap,
      state,
      over: out?.over ?? false,
      winner: out?.winner ?? null,
      summary: out?.summary ?? '',
      score: state !== null ? adapter.score(state) : null,
      canUndo: canUndo(snap) && !READ_ONLY.has(lease.kind),
      lease,
      readOnly: READ_ONLY.has(lease.kind),
      unsent: snap ? Math.max(0, snap.seq - published) : 0,
      conflict,
      error,
    };
  }

  const machine: CourtMachine<C, S, E> = {
    getView: () => (view ??= computeView()),
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },

    async open(claim = true) {
      autoClaim = claim && !!o.userId;
      const rec = await deps.store.load(lid, mid);
      if (closed) return;
      if (rec && (rec.uid === null || rec.uid === o.userId)) {
        // La lista sigue con el id con que se empezó en este teléfono.
        if (rec.snap.origin) origin = rec.snap.origin;
        published = rec.published;
        orphan = rec.orphan ?? null;
        finishedSent = !!rec.finished;
        verified = rec.published > 0;
        use(rec.snap as CourtSnapshot<C, S, E>);
      }
      syncPublisher();
      if (autoClaim && typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('online', onOnline);
      if (autoClaim) await claimNow(false);
      else setLease({ kind: 'offline' }, false);
      if (closed) return;
      if (!snap && lease.kind === 'offline') seedFromCache();
      if (!snap && o.config != null) {
        use(fresh(o.config));
        save();
      }
      ready = true;
      emit();
    },

    start(config) {
      if (snap) return;
      use(fresh(config));
      touched = true;
      save();
      emit();
    },

    apply(ev) {
      if (!snap || state === null) return 'Falta empezar el partido.';
      if (READ_ONLY.has(lease.kind)) return lease.kind === 'closed' ? 'El partido ya no se anota.' : 'Otro anotador tiene el control.';
      try {
        const r = applyEvent(adapter, snap, ev, Date.now(), state);
        snap = withOrigin(r.snap, origin);
        state = r.state;
        error = null;
        touched = true;
        save();
        emit();
        publisher.changed(r.milestone);
        return null;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Esa jugada no se puede.';
        emit();
        return error;
      }
    },

    undo() {
      if (!snap || state === null || READ_ONLY.has(lease.kind)) return false;
      const before = state;
      const lastEv = snap.log[snap.log.length - 1];
      const r = undoEvent(adapter, snap, Date.now());
      if (!r) return false;
      snap = withOrigin(r.snap, origin);
      state = r.state;
      error = null;
      touched = true;
      save();
      emit();
      // Deshacer un hito (fin de set, gol, fin del partido) se publica pronto.
      const wasMilestone = adapter.engine.isOver(before) || (lastEv !== undefined && !!adapter.milestone?.(r.state, before, lastEv));
      publisher.changed(wasMilestone);
      return true;
    },

    claim: (force = false) => claimNow(force),

    async finish() {
      if (!snap || state === null) throw new Error('Falta empezar el partido.');
      publisher.pause();
      const out = outcome(adapter, state);
      try {
        const r = await deps.finish({ score: adapter.score(state), winner: out.winner, state: plain(snap), seq: snap.seq });
        if (r === undefined) {
          finishedSent = true;
          await deps.store.patch(lid, mid, { finished: true });
          setLease({ kind: 'closed', status: 'finished' });
          return 'queued';
        }
        if (!r.ok) {
          setLease({ kind: 'stale' });
          return 'stale';
        }
        await deps.store.remove(lid, mid);
        setLease({ kind: 'closed', status: r.status ?? 'finished' });
        return 'sent';
      } catch (e) {
        syncPublisher();
        throw e;
      }
    },

    async suspend(note) {
      if (!snap) throw new Error('Falta empezar el partido.');
      publisher.pause();
      try {
        await deps.suspend({ score: state !== null ? adapter.score(state) : null, state: plain(snap), seq: snap.seq, note });
      } catch (e) {
        syncPublisher();
        throw e;
      }
      setLease({ kind: 'closed', status: 'suspended' });
    },

    flush() {
      if (!READ_ONLY.has(lease.kind)) publisher.flush();
    },

    setStatus(status) {
      if (!status || closed) return;
      const prev = lastStatus;
      lastStatus = status;
      if (OPEN.includes(status)) {
        // Lo suspendieron desde otro lado (el admin, lluvia) mientras este teléfono anotaba: deja de anotar y no
        // publica lo que tenía (no lo pone en vivo otra vez). Se retoma pidiendo el turno.
        if (status === 'suspended' && (prev === 'live' || prev === 'scheduled') && !READ_ONLY.has(lease.kind)) {
          dropQueued();
          setLease({ kind: 'closed', status: 'suspended' });
        }
        return;
      }
      if (finishedSent) void deps.store.remove(lid, mid);
      if (lease.kind !== 'closed' || lease.status !== status) setLease({ kind: 'closed', status });
    },

    close() {
      if (closed) return;
      if (!READ_ONLY.has(lease.kind)) publisher.flush();
      // Se abrió un partido suspendido solo para mirar: el turno queda libre otra vez (lo retoma cualquiera).
      if (lease.kind === 'mine' && claimedStatus === 'suspended' && (lastStatus === null || lastStatus === 'suspended') && !touched) {
        void deps.release?.().catch(() => {});
      }
      closed = true;
      clearRetry();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('online', onOnline);
      publisher.dispose();
      listeners.clear();
    },
  };
  return machine;
}
