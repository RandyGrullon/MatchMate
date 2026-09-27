import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { claimScorer, finishMatch, publishMatch, suspendMatch, type ClaimResult, type MatchStatus } from '../lib/data/matches';
import { courtDeviceId, courtStore, pruneCourtLogs, type CourtStore } from './log';
import { createCourtMachine, type CourtDeps, type CourtMachine, type CourtView } from './machine';
import type { CourtAdapter } from './types';

export interface UseCourtOptions<C, S, E> {
  lid: string;
  matchId: string;
  userId: string | null;
  adapter: CourtAdapter<C, S, E>;
  /** Estado del partido que da el servidor (useMatch): si deja de estar abierto, el teléfono deja de anotar. */
  status?: MatchStatus | null;
  /** Configuración para empezar de cero (sorteo, reglas). null = la pantalla la pide y llama `start`. */
  config?: C | null;
  /** Pedir el turno al abrir (por defecto sí). */
  autoClaim?: boolean;
  store?: CourtStore;
  publisher?: { minGapMs?: number; idleMs?: number };
}

export interface CourtController<C, S, E> extends CourtView<C, S, E> {
  start(config: C): void;
  /** Aplica una jugada: null o el mensaje del motor si no se puede. */
  apply(ev: E): string | null;
  undo(): boolean;
  /** Pide el turno otra vez; el admin con `force` se lo quita a otro (confirmar antes en pantalla). */
  claim(force?: boolean): Promise<ClaimResult | null>;
  /** 'sent' = el servidor lo tiene; 'queued' = sin señal, sale solo; 'stale' = otro teléfono va más adelante. */
  finish(): Promise<'sent' | 'queued' | 'stale'>;
  suspend(note?: string): Promise<void>;
  flush(): void;
}

/** Lo que usa el modo cancha de la capa de datos (las pruebas pasan otro). */
export function courtDeps(lid: string, mid: string, store: CourtStore = courtStore()): CourtDeps {
  return {
    claim: (force) => claimScorer(lid, mid, force),
    publish: (p) => publishMatch(lid, mid, p).done,
    finish: (r) => finishMatch(lid, mid, r),
    suspend: (r) => suspendMatch(lid, mid, { state: r.state, score: r.score, seq: r.seq, note: r.note }),
    store,
    origin: courtDeviceId(),
  };
}

const EMPTY: CourtView = {
  ready: false,
  snapshot: null,
  state: null,
  over: false,
  winner: null,
  summary: '',
  score: null,
  canUndo: false,
  lease: { kind: 'checking' },
  readOnly: false,
  unsent: 0,
  conflict: false,
  error: null,
};

const noop = () => () => {};

/** Una vez por sesión: se borran las listas de más de 30 días sin tocar. */
let pruned = false;

/**
 * Anotar un partido en la cancha: la lista de jugadas se guarda en el teléfono después de cada toque, el marcador
 * sale de `replay`, deshacer quita la última jugada, y se publica con tope por la cola (sin señal no se pierde
 * nada). Un solo anotador: si otro toma el control, este teléfono queda en solo lectura y conserva su lista.
 *
 * El adaptador puede cambiar de objeto entre renders (se usa el último); la lista se reinicia solo si cambia la
 * liga, el partido o la cuenta.
 */
export function useCourt<C, S, E>(o: UseCourtOptions<C, S, E>): CourtController<C, S, E> {
  const adapterRef = useRef(o.adapter);
  adapterRef.current = o.adapter;
  const configRef = useRef(o.config);
  configRef.current = o.config;
  const optsRef = useRef({ autoClaim: o.autoClaim, publisher: o.publisher });
  optsRef.current = { autoClaim: o.autoClaim, publisher: o.publisher };
  const [machine, setMachine] = useState<CourtMachine<C, S, E> | null>(null);

  useEffect(() => {
    // El adaptador se lee por referencia: un render con otro objeto no reinicia la lista.
    const a = () => adapterRef.current;
    const adapter: CourtAdapter<C, S, E> = {
      engine: {
        init: (c) => a().engine.init(c),
        apply: (s, e) => a().engine.apply(s, e),
        isOver: (s) => a().engine.isOver(s),
        result: (s) => a().engine.result(s),
      },
      score: (s) => a().score(s),
      winner: (s) => (a().winner ? a().winner!(s) : a().engine.result(s).winner),
      milestone: (p, n, e) => !!a().milestone?.(p, n, e),
    };
    const m = createCourtMachine<C, S, E>({
      lid: o.lid,
      mid: o.matchId,
      userId: o.userId,
      adapter,
      config: configRef.current ?? null,
      deps: courtDeps(o.lid, o.matchId, o.store),
      publisher: optsRef.current.publisher,
    });
    setMachine(m);
    void m.open(optsRef.current.autoClaim !== false);
    if (!pruned) {
      pruned = true;
      void pruneCourtLogs(o.store ?? courtStore(), new Set()).catch(() => {});
    }
    // Al pasar a segundo plano o cerrar la pestaña: publicar lo pendiente.
    const onHide = () => {
      if (document.visibilityState === 'hidden') m.flush();
    };
    const onPageHide = () => m.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      m.close();
    };
  }, [o.lid, o.matchId, o.userId, o.store]);

  useEffect(() => machine?.setStatus(o.status), [machine, o.status]);

  const subscribe = useCallback((l: () => void) => (machine ? machine.subscribe(l) : noop()), [machine]);
  const getView = useCallback(() => (machine ? machine.getView() : (EMPTY as CourtView<C, S, E>)), [machine]);
  const view = useSyncExternalStore(subscribe, getView, getView);

  return useMemo(
    () => ({
      ...view,
      start: (c: C) => machine?.start(c),
      apply: (ev: E) => (machine ? machine.apply(ev) : 'Cargando…'),
      undo: () => machine?.undo() ?? false,
      claim: (force?: boolean) => (machine ? machine.claim(force) : Promise.resolve(null)),
      finish: () => (machine ? machine.finish() : Promise.reject(new Error('Cargando…'))),
      suspend: (note?: string) => (machine ? machine.suspend(note) : Promise.resolve()),
      flush: () => machine?.flush(),
    }),
    [view, machine],
  );
}
