import { asBackendError, classifyError } from '../lib/db/errors';
import type { ClaimResult, FinishResult, MatchScore, MatchStatus, PublishResult } from '../lib/data/matches';
import type { Side } from '../sports/types';
import type { CourtStore } from './log';
import { createPublisher, type Publisher } from './publisher';
import { applyEvent, canUndo, outcome, pickSnapshot, snapshotState, startSnapshot, undoEvent, withOrigin, type LocalCourt } from './session';
import type { CourtAdapter, CourtSnapshot } from './types';

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
  /** El partido ya no se anota (terminado, aplazado, suspendido, anulado). */
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
  store: CourtStore;
  /** Id de este teléfono (ver courtDeviceId). */
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
  /** Pide el turno otra vez (el admin con `force` se lo quita a otro). */
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

const plain = (snap: CourtSnapshot) => snap as unknown as Record<string, unknown>;

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

  const publisher: Publisher = createPublisher({
    current: () => (snap && state !== null ? { seq: snap.seq, payload: { snap, state } } : null),
    send: ({ snap: s, state: st }) => deps.publish({ seq: s.seq, state: plain(s), score: adapter.score(st) }),
    onSent: (seq, r) => onPublished(seq, r as PublishResult),
    onError: (_seq, e) => {
      // La cola ya reintenta sola lo de red; aquí solo llega lo definitivo (sin permiso, sin sesión).
      if (classifyError(e) === 'final' && asBackendError(e)?.kind === 'permission') setLease({ kind: 'denied' });
      else console.error('publicar partido', e);
    },
    minGapMs: o.publisher?.minGapMs,
    idleMs: o.publisher?.idleMs,
  });

  function emit() {
    view = null;
    for (const l of [...listeners]) l();
  }

  function setLease(next: LeaseState) {
    lease = next;
    if (READ_ONLY.has(next.kind)) publisher.pause();
    else publisher.resume();
    emit();
  }

  function save() {
    if (!snap) return;
    void deps.store.save({ lid, mid, uid: o.userId, snap: snap as CourtSnapshot, published, orphan });
  }

  function onPublished(seq: number, r: PublishResult) {
    if (closed) return;
    if (r.ok) {
      if (seq > published) {
        published = seq;
        void deps.store.patch(lid, mid, { published });
      }
      if (lease.kind === 'offline' || lease.kind === 'checking') lease = { kind: 'mine' };
      emit();
      return;
    }
    if (r.reason === 'lease') setLease({ kind: 'other', scorerId: r.scorerId ?? null, scorerName: r.scorerName ?? null, expired: false });
    else if (r.reason === 'stale') setLease({ kind: 'stale' });
    else if (r.reason === 'cerrado') setLease({ kind: 'closed', status: r.status ?? 'finished' });
  }

  function use(next: CourtSnapshot<C, S, E>) {
    snap = withOrigin(next, deps.origin);
    try {
      state = snapshotState(adapter, snap);
      error = null;
    } catch (e) {
      // Una lista que este motor ya no entiende (otra versión de la app): se ve sin marcador.
      state = null;
      error = e instanceof Error ? e.message : 'No se pudo leer la lista de jugadas.';
    }
  }

  async function claimNow(force: boolean): Promise<ClaimResult | null> {
    try {
      const r = await deps.claim(force);
      if (closed) return r;
      if (!r.ok) {
        setLease({ kind: 'other', scorerId: r.scorerId, scorerName: r.scorerName, expired: r.expired });
        return r;
      }
      const local: LocalCourt<C, S, E> | null = snap ? { snap, published } : null;
      const picked = pickSnapshot<C, S, E>(local, r.state);
      if (picked.snap && picked.source === 'remote') {
        if (picked.conflict && snap) orphan = snap as CourtSnapshot;
        conflict = picked.conflict;
        use(picked.snap);
        // Lo del servidor ya está publicado.
        published = Math.max(published, picked.snap.seq);
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
      }
      else setLease({ kind: 'offline' });
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
      const rec = await deps.store.load(lid, mid);
      if (closed) return;
      if (rec && (rec.uid === null || rec.uid === o.userId)) {
        published = rec.published;
        orphan = rec.orphan ?? null;
        finishedSent = !!rec.finished;
        use(rec.snap as CourtSnapshot<C, S, E>);
      }
      if (claim && o.userId) await claimNow(false);
      else lease = { kind: 'offline' };
      if (closed) return;
      if (!snap && o.config != null) {
        use(startSnapshot<C, S, E>(o.config, Date.now(), deps.origin));
        save();
      }
      ready = true;
      emit();
    },

    start(config) {
      if (snap) return;
      use(startSnapshot<C, S, E>(config, Date.now(), deps.origin));
      save();
      emit();
    },

    apply(ev) {
      if (!snap || state === null) return 'Falta empezar el partido.';
      if (READ_ONLY.has(lease.kind)) return lease.kind === 'closed' ? 'El partido ya no se anota.' : 'Otro anotador tiene el control.';
      try {
        const r = applyEvent(adapter, snap, ev, Date.now(), state);
        snap = withOrigin(r.snap, deps.origin);
        state = r.state;
        error = null;
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
      snap = withOrigin(r.snap, deps.origin);
      state = r.state;
      error = null;
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
        publisher.resume();
        throw e;
      }
    },

    async suspend(note) {
      if (!snap) throw new Error('Falta empezar el partido.');
      publisher.pause();
      try {
        await deps.suspend({ score: state !== null ? adapter.score(state) : null, state: plain(snap), seq: snap.seq, note });
      } catch (e) {
        publisher.resume();
        throw e;
      }
      setLease({ kind: 'closed', status: 'suspended' });
    },

    flush() {
      if (!READ_ONLY.has(lease.kind)) publisher.flush();
    },

    setStatus(status) {
      if (!status || closed) return;
      if (OPEN.includes(status)) return;
      if (finishedSent) void deps.store.remove(lid, mid);
      if (lease.kind !== 'closed' || lease.status !== status) setLease({ kind: 'closed', status });
    },

    close() {
      if (closed) return;
      if (!READ_ONLY.has(lease.kind)) publisher.flush();
      closed = true;
      publisher.dispose();
      listeners.clear();
    },
  };
  return machine;
}
