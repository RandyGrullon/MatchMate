import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { courtDeps, createCourtMachine, type CourtAdapter, type CourtController, type CourtDeps, type CourtMachine, type CourtView } from '../../../../court';
import type { MatchStatus } from '../../../../lib/data/matches';

/**
 * El modo cancha con cualquier motor y con otro final: lo mismo que `useCourt` (lista de jugadas en el teléfono,
 * deshacer, un solo anotador, publicación con tope por la cola, retomar en otro teléfono), pero con `deps`
 * propias. Lo usa el juego del round robin de pickleball: se anota con el motor de pickleball y al terminar se
 * guarda con save_points_result (los puntos del juego), como el americano.
 */

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

export function useAdapterCourt<C, S, E>(o: {
  lid: string;
  matchId: string;
  userId: string | null;
  status?: MatchStatus | null;
  /** null = la pantalla pide el sorteo y llama `start`. */
  config: C | null;
  adapter: CourtAdapter<C, S, E>;
  /** Por defecto las de siempre (finish_match); p. ej. `pointsDeps` para save_points_result. */
  deps?: (lid: string, matchId: string) => CourtDeps;
}): CourtController<C, S, E> {
  const configRef = useRef(o.config);
  configRef.current = o.config;
  const adapterRef = useRef(o.adapter);
  adapterRef.current = o.adapter;
  const depsRef = useRef(o.deps);
  depsRef.current = o.deps;
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
      deps: depsRef.current ? depsRef.current(o.lid, o.matchId) : courtDeps(o.lid, o.matchId),
    });
    setMachine(m);
    void m.open(true);
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
  }, [o.lid, o.matchId, o.userId]);

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
