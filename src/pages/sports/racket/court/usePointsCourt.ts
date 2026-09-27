import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { courtDeps, createCourtMachine, type CourtController, type CourtDeps, type CourtMachine, type CourtView } from '../../../../court';
import type { MatchStatus } from '../../../../lib/data/matches';
import { savePointsResult } from '../../../../lib/data/racket';
import type { PointsConfig, PointsEvent, PointsState } from '../../../../sports/formats';
import { pointsAdapter } from './adapters';

/**
 * El modo cancha del americano y el mexicano: lo mismo que `useCourt` (lista de jugadas en el teléfono,
 * deshacer, un solo anotador, publicación con tope por la cola), pero al terminar guarda con
 * save_points_result, que admite empate (12-12 a 24) y revisa el total de la noche.
 */

const EMPTY: CourtView<PointsConfig, PointsState, PointsEvent> = {
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

/** Lo que usa la cancha de puntos: lo de siempre, pero el final va por save_points_result. */
export function pointsDeps(lid: string, mid: string, base: CourtDeps = courtDeps(lid, mid)): CourtDeps {
  return {
    ...base,
    finish: (r) => {
      const sides = Array.isArray(r.score.sides) ? r.score.sides : [0, 0];
      return savePointsResult(lid, mid, [sides[0], sides[1]], { state: r.state, seq: r.seq });
    },
  };
}

export function usePointsCourt(o: {
  lid: string;
  matchId: string;
  userId: string | null;
  status?: MatchStatus | null;
  config: PointsConfig | null;
}): CourtController<PointsConfig, PointsState, PointsEvent> {
  const configRef = useRef(o.config);
  configRef.current = o.config;
  const [machine, setMachine] = useState<CourtMachine<PointsConfig, PointsState, PointsEvent> | null>(null);

  useEffect(() => {
    const m = createCourtMachine<PointsConfig, PointsState, PointsEvent>({
      lid: o.lid,
      mid: o.matchId,
      userId: o.userId,
      adapter: pointsAdapter(),
      config: configRef.current ?? null,
      deps: pointsDeps(o.lid, o.matchId),
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
  const getView = useCallback(() => (machine ? machine.getView() : EMPTY), [machine]);
  const view = useSyncExternalStore(subscribe, getView, getView);

  return useMemo(
    () => ({
      ...view,
      start: (c: PointsConfig) => machine?.start(c),
      apply: (ev: PointsEvent) => (machine ? machine.apply(ev) : 'Cargando…'),
      undo: () => machine?.undo() ?? false,
      claim: (force?: boolean) => (machine ? machine.claim(force) : Promise.resolve(null)),
      finish: () => (machine ? machine.finish() : Promise.reject(new Error('Cargando…'))),
      suspend: (note?: string) => (machine ? machine.suspend(note) : Promise.resolve()),
      flush: () => machine?.flush(),
    }),
    [view, machine],
  );
}
