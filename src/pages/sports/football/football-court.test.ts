/**
 * El acta en el teléfono (modo cancha) con el motor de verdad: cambiar quién marcó el gol recién anotado no publica
 * el paso de en medio (el marcador sin el gol), y los colores de la tanda de penales se leen en claro y en oscuro.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { createCourtStore } from '../../../court/log';
import { createCourtMachine, type CourtDeps, type CourtMachine } from '../../../court/machine';
import { matchCollapse, type ClaimResult, type MatchScore, type PublishResult } from '../../../lib/data/matches';
import { createFakeBackend } from '../../../lib/db/fakeBackend';
import { createOutbox, resetMemoryOutbox, type Outbox } from '../../../lib/db/outbox';
import { football, footballConfig, type FootballConfig, type FootballEvent, type FootballState } from '../../../sports/team/football';
import { replay } from '../../../sports/types';
import { footballAdapter, quietAdapter, replaceLastEvent } from './adapter';
import { Shootout } from './FootballCourt';

type Goal = Extract<FootballEvent, { type: 'goal' }>;
interface Sent {
  seq: number;
  state: Record<string, unknown>;
  score: MatchScore | null;
}

const FIELD = footballConfig('football');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sidesOf = (score: unknown) => (score as { sides?: number[] } | null)?.sides;
const lastLogged = (p: Sent) => (p.state.log as FootballEvent[]).at(-1);

const claimOk: ClaimResult = {
  ok: true,
  scorerId: 'u1',
  scorerName: 'Ana',
  leaseUntil: null,
  expired: false,
  status: 'live',
  seq: 0,
  version: 1,
  state: null,
};

const machines: CourtMachine<FootballConfig, FootballState, FootballEvent>[] = [];
const boxes: Outbox[] = [];

afterEach(async () => {
  for (const m of machines.splice(0)) m.close();
  for (const b of boxes.splice(0)) b.dispose();
  await wait(0);
  resetMemoryOutbox();
});

/** El anotador de un partido de campo como lo arma FootballCourt (adaptador con `quietly`). */
function scorer(publish: (p: Sent) => Promise<PublishResult>, gaps: { minGapMs: number; idleMs?: number }) {
  const { adapter, quietly } = quietAdapter(footballAdapter());
  const handed: Sent[] = [];
  const deps: CourtDeps = {
    claim: async () => claimOk,
    publish: (p) => {
      handed.push(p);
      return publish(p);
    },
    finish: async () => ({ ok: true, status: 'finished' }),
    suspend: async () => {},
    store: createCourtStore('memory'),
    origin: 'tel-A',
  };
  const m = createCourtMachine<FootballConfig, FootballState, FootballEvent>({ lid: 'L', mid: 'M', userId: 'u1', adapter, config: FIELD, deps, publisher: gaps });
  machines.push(m);
  return { m, quietly, handed };
}

describe('cambiar quién marcó el gol recién anotado', () => {
  it('no publica el marcador sin el gol: una sola publicación por cambio, siempre 1-0', async () => {
    const { m, quietly, handed } = scorer(async (p) => ({ ok: true, seq: p.seq }), { minGapMs: 20 });
    await m.open();
    const goal: Goal = { type: 'goal', side: 1, at: Date.now() };
    expect(m.apply(goal)).toBeNull();
    expect(handed.map((p) => sidesOf(p.score))).toEqual([[1, 0]]);

    // Pasa más que el tope entre hitos mientras se elige de la lista quién marcó.
    await wait(40);
    const scorerSet: Goal = { ...goal, player: 'p9' };
    expect(replaceLastEvent<FootballEvent>(m, quietly, goal, scorerSet)).toBeNull();
    await wait(40);
    const assisted: Goal = { ...scorerSet, assist: 'p7' };
    expect(replaceLastEvent<FootballEvent>(m, quietly, scorerSet, assisted)).toBeNull();
    // Asistencia del mismo que marcó: el motor la rechaza y vuelve el gol como estaba.
    await wait(40);
    expect(replaceLastEvent<FootballEvent>(m, quietly, assisted, { ...assisted, assist: 'p9' })).toBe('El que asiste no puede ser el mismo que marca');
    await wait(40);

    expect(handed.map((p) => sidesOf(p.score))).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
    expect(handed.map(lastLogged)).toEqual([goal, scorerSet, assisted, assisted]);
    const view = m.getView();
    expect(view.state?.score).toEqual([1, 0]);
    expect(view.state?.players[0].p9).toMatchObject({ goals: 1 });
    expect(view.state?.players[0].p7).toMatchObject({ assists: 1 });
    expect(view.snapshot?.log).toEqual([assisted]);
    expect(view.unsent).toBe(0);

    // Así era (deshacer y volver a aplicar a mano): el deshacer salía solo, con 0-0.
    m.undo();
    m.apply(assisted);
    expect(handed.slice(4).map((p) => sidesOf(p.score))).toEqual([[0, 0]]);
  });

  it('más de un minuto sin publicar: el paso de en medio sale, pero la cola lo reemplaza y el servidor solo ve 1-0', async () => {
    const be = createFakeBackend();
    be.onRpc = (_fn, args) => ({ ok: true, seq: args.p_seq });
    const box = createOutbox({ backend: be, userId: 'u-cancha', storage: 'memory', listenWindow: false, random: () => 0 });
    boxes.push(box);
    await box.ready;
    const publish = (p: Sent) =>
      box
        .enqueue<{ ok: boolean; seq: number }>('publish_match', { p_match: 'M', p_seq: p.seq, p_state: p.state, p_score: p.score }, { group: 'L', collapseKey: matchCollapse.publish('M') })
        .done.then((r): PublishResult => ({ ok: r.ok, seq: r.seq }));
    // idleMs corto = «hace más de un minuto que no se publica nada».
    const { m, quietly, handed } = scorer(publish, { minGapMs: 20, idleMs: 30 });
    await m.open();
    const goal: Goal = { type: 'goal', side: 1, at: Date.now() };
    m.apply(goal);
    for (let i = 0; i < 200 && be.calls.length < 1; i++) await wait(5);
    expect(be.calls).toHaveLength(1);

    await wait(50);
    const scorerSet: Goal = { ...goal, player: 'p9' };
    expect(replaceLastEvent<FootballEvent>(m, quietly, goal, scorerSet)).toBeNull();
    for (let i = 0; i < 200 && (box.getSnapshot().pendingCount > 0 || m.getView().unsent > 0); i++) await wait(5);

    // El anotador sí entregó el paso de en medio (0-0) a la cola…
    expect(handed.map((p) => sidesOf(p.score))).toEqual([
      [1, 0],
      [0, 0],
      [1, 0],
    ]);
    // …pero la publicación de flush salió en el mismo instante y lo reemplazó antes de mandarlo.
    const server = be.calls.filter((c) => c.fn === 'publish_match');
    expect(server.map((c) => sidesOf(c.args.p_score))).toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect((server[1].args.p_state as { log: FootballEvent[] }).log).toEqual([scorerSet]);
    expect(m.getView().unsent).toBe(0);
  });
});

describe('tanda de penales', () => {
  it('los puntos y el botón GOL usan la letra del tema sobre el verde (nunca blanco fijo)', () => {
    const cup = footballConfig('football', { shootout: true, shootoutKicks: 3 });
    const s = replay(football, cup, [
      { type: 'goal', side: 1 },
      { type: 'goal', side: 2 },
      { type: 'period_end' },
      { type: 'period_end' },
      { type: 'shootout', side: 1, scored: true },
      { type: 'shootout', side: 2, scored: false },
    ]);
    expect(s.status).toBe('shootout');
    const html = renderToString(
      h(Shootout, { state: s, names: ['Tigres', 'Leones'], colors: ['#f97316', '#2563eb'], readOnly: false, who: () => 'Ana', ids: () => [], act: () => true }),
    );
    expect(html).toContain('bg-ok text-[color:var(--on-ok,var(--bg))]');
    expect(html).toContain('bg-danger text-on-danger');
    expect(html).toContain('background:var(--ok);color:var(--on-ok, var(--bg))');
    expect(html).toContain('background:var(--danger);color:var(--on-danger)');
    expect(html).not.toContain('text-white');
    expect(html).not.toMatch(/#fff(fff)?\b/i);
  });
});
