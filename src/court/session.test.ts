import { describe, expect, it } from 'vitest';
import { seededRandom } from '../sports/formats/random';
import { pointsEngine, type PointsConfig, type PointsEvent, type PointsState } from '../sports/formats/social';
import { createRacketEngine, matchTotals, type MatchSetup, type TennisEvent, type TennisState } from '../sports/racket';
import { replay, type Side } from '../sports/types';
import { applyEvent, compact, isSnapshot, outcome, pickSnapshot, snapshotState, startSnapshot, undoEvent, withOrigin } from './session';
import type { CourtAdapter, CourtSnapshot } from './types';

const points: CourtAdapter<PointsConfig, PointsState, PointsEvent> = {
  engine: pointsEngine,
  score: (s) => ({ text: `${s.score[0]}-${s.score[1]}`, sides: [s.score[0], s.score[1]] }),
};

const padelEngine = createRacketEngine('padel');
const padel: CourtAdapter<MatchSetup, TennisState, TennisEvent> = {
  engine: padelEngine,
  score: (s) => {
    const t = matchTotals(s);
    return { text: padelEngine.result(s).summary, sides: [t.sets[0], t.sets[1]] };
  },
  // Hito: terminó un juego (cambian los juegos o los sets).
  milestone: (prev, next) => prev.sets.length !== next.sets.length || prev.games[0] !== next.games[0] || prev.games[1] !== next.games[1],
};

const pt = (side: Side): PointsEvent => ({ type: 'point', side });
const tp = (side: Side): TennisEvent => ({ type: 'point', side });

function play<C, S, E>(adapter: CourtAdapter<C, S, E>, snap: CourtSnapshot<C, S, E>, evs: E[]) {
  let s = snap;
  let state = snapshotState(adapter, s);
  for (const ev of evs) {
    const r = applyEvent(adapter, s, ev, 1000, state);
    s = r.snap;
    state = r.state;
  }
  return { snap: s, state };
}

describe('lista de jugadas', () => {
  it('el marcador sale de reproducir la lista; cada acción sube seq', () => {
    const start = startSnapshot<PointsConfig, PointsState, PointsEvent>({ mode: 'total', target: 8 }, 0, 'tel-1');
    const { snap, state } = play(points, start, [pt(1), pt(1), pt(2)]);
    expect(state.score).toEqual([2, 1]);
    expect(snap).toMatchObject({ v: 1, seq: 3, log: [pt(1), pt(1), pt(2)], origin: 'tel-1' });
    expect(snapshotState(points, snap)).toEqual(replay(pointsEngine, { mode: 'total', target: 8 }, snap.log));
    expect(isSnapshot(snap)).toBe(true);
    expect(isSnapshot({ v: 2, seq: 1, log: [], config: {} })).toBe(false);
    expect(isSnapshot(null)).toBe(false);
  });

  it('deshacer quita la última jugada y también sube seq (nunca baja)', () => {
    const { snap } = play(points, startSnapshot({ mode: 'total', target: 8 }), [pt(1), pt(2), pt(2)]);
    const u = undoEvent(points, snap, 2000)!;
    expect(u.state.score).toEqual([1, 1]);
    expect(u.snap.seq).toBe(4);
    expect(u.snap.log).toHaveLength(2);
    const u2 = undoEvent(points, undoEvent(points, u.snap)!.snap)!;
    expect(u2.state.score).toEqual([0, 0]);
    expect(undoEvent(points, u2.snap)).toBeNull();
  });

  it('una jugada que el motor rechaza no cambia nada', () => {
    const { snap } = play(points, startSnapshot({ mode: 'total', target: 2 }), [pt(1), pt(2)]);
    expect(() => applyEvent(points, snap, pt(1))).toThrow('El partido ya terminó.');
    expect(snap.log).toHaveLength(2);
    expect(outcome(points, snapshotState(points, snap))).toEqual({ over: true, winner: null, summary: '1-1' });
  });

  it('hitos: el fin de un juego y el fin del partido publican ya; un punto suelto no', () => {
    let snap = startSnapshot<MatchSetup, TennisState, TennisEvent>({ firstServer: 1 });
    const flags: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = applyEvent(padel, snap, tp(1));
      snap = r.snap;
      flags.push(r.milestone);
    }
    // 15, 30, 40 y juego.
    expect(flags).toEqual([false, false, false, true]);
    const end = play(points, startSnapshot({ mode: 'total', target: 2 }), [pt(1)]);
    expect(applyEvent(points, end.snap, pt(2)).milestone).toBe(true);
  });

  it('deshacer al azar siempre vuelve al estado de antes (pádel, 300 secuencias)', () => {
    const rand = seededRandom('deshacer');
    for (let run = 0; run < 300; run++) {
      let snap = startSnapshot<MatchSetup, TennisState, TennisEvent>({ firstServer: rand() < 0.5 ? 1 : 2 });
      const states: TennisState[] = [snapshotState(padel, snap)];
      const n = 1 + Math.floor(rand() * 60);
      for (let i = 0; i < n; i++) {
        const cur = states[states.length - 1];
        if (padelEngine.isOver(cur)) break;
        if (states.length > 1 && rand() < 0.2) {
          const u = undoEvent(padel, snap)!;
          states.pop();
          expect(u.state).toEqual(states[states.length - 1]);
          snap = u.snap;
          continue;
        }
        const r = applyEvent(padel, snap, tp(rand() < 0.5 ? 1 : 2), 0, cur);
        snap = r.snap;
        states.push(r.state);
      }
      expect(snapshotState(padel, snap)).toEqual(states[states.length - 1]);
    }
  });

  it('compactar: el estado no cambia y se puede deshacer hasta lo que quedó en la lista', () => {
    const { snap, state } = play(points, startSnapshot({ mode: 'total', target: 999 }), Array.from({ length: 30 }, (_, i) => pt(i % 3 === 0 ? 2 : 1)));
    const c = compact(points, snap, 20, 5);
    expect(c.log).toHaveLength(5);
    expect(c.base).toEqual(replay(pointsEngine, snap.config, snap.log.slice(0, 25)));
    expect(snapshotState(points, c)).toEqual(state);
    let u = c;
    for (let i = 0; i < 5; i++) u = undoEvent(points, u)!.snap;
    expect(snapshotState(points, u)).toEqual(c.base);
    expect(undoEvent(points, u)).toBeNull();
    // Con la lista corta no toca nada.
    expect(compact(points, snap)).toBe(snap);
  });
});

describe('retomar: la lista del teléfono o la del servidor', () => {
  const cfg: PointsConfig = { mode: 'total', target: 99 };
  const base = startSnapshot<PointsConfig, PointsState, PointsEvent>(cfg, 0, 'tel-A');
  const local5 = play(points, base, [pt(1), pt(1), pt(1), pt(2), pt(2)]).snap;

  it('sin nada en el teléfono: la del servidor (o ninguna)', () => {
    expect(pickSnapshot(null, local5)).toMatchObject({ source: 'remote', conflict: false });
    expect(pickSnapshot(null, null)).toEqual({ snap: null, source: 'none', conflict: false });
    expect(pickSnapshot(null, { basura: true })).toEqual({ snap: null, source: 'none', conflict: false });
  });

  it('sin señal: el teléfono va más adelante que lo que publicó y nadie más publicó → la del teléfono', () => {
    const published = play(points, base, [pt(1), pt(1)]).snap;
    const r = pickSnapshot({ snap: local5, published: 2 }, withOrigin(published, 'tel-A'));
    expect(r).toEqual({ snap: local5, source: 'local', conflict: false });
    // Aunque la respuesta de la última publicación se haya perdido (el servidor tiene la 5).
    expect(pickSnapshot({ snap: local5, published: 2 }, local5).source).toBe('local');
    // Y si deshizo después de publicar (su seq es mayor aunque la lista sea más corta).
    const undone = undoEvent(points, local5)!.snap;
    expect(pickSnapshot({ snap: undone, published: 5 }, local5)).toMatchObject({ snap: undone, source: 'local' });
  });

  it('otro teléfono siguió después: gana el servidor; si había jugadas sin enviar, es un conflicto', () => {
    // B retomó desde lo que A publicó (2 jugadas) y siguió.
    const fromA = play(points, base, [pt(1), pt(1)]).snap;
    const byB = play(points, withOrigin(fromA, 'tel-B'), [pt(2), pt(2), pt(2), pt(2)]).snap;
    const a = pickSnapshot({ snap: local5, published: 2 }, byB);
    expect(a).toEqual({ snap: byB, source: 'remote', conflict: true });
    // A no tenía nada sin enviar: no es conflicto.
    expect(pickSnapshot({ snap: fromA, published: 2 }, byB)).toEqual({ snap: byB, source: 'remote', conflict: false });
    // Aunque B lleve menos acciones que A, si publicó después de lo último de A, gana B.
    const shortB = play(points, withOrigin(fromA, 'tel-B'), [pt(2)]).snap;
    expect(pickSnapshot({ snap: local5, published: 2 }, shortB).source).toBe('remote');
  });
});
