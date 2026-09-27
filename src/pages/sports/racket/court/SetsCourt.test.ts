/**
 * La barra de abajo del modo cancha (Deshacer, los botones del deporte y Terminar) tiene que caber en un teléfono de
 * 375 px. En dobles, al empezar cada set, el «Orden de saque» iba ahí como un cuarto botón y «Terminar» se salía de
 * la pantalla: ahora va junto a «Saca …», arriba. Se dibuja en el servidor con el controlador de la cancha simulado
 * (el de verdad arranca en un efecto).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../../../components/feedback';
import type { CourtController } from '../../../../court';
import { LeagueContext, type LeagueCtx } from '../../../../lib/league';
import type { League } from '../../../../lib/types';
import type { MatchSetup, RacketEvent, RacketState } from '../../../../sports/racket';
import { replay } from '../../../../sports/types';
import { sets } from '../logic/testMatch';
import { racketAdapter } from './adapters';
import { SetsCourt } from './SetsCourt';

const holder = vi.hoisted(() => ({ court: null as unknown }));
vi.mock('../../../../court', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../court')>()), useCourt: () => holder.court }));

const league = { id: 'L', name: 'Pádel', sport: 'padel', tz: 'America/Santo_Domingo', seasonStart: '', seasonEnd: '' } as unknown as League;
const ctx = { lid: 'L', league, member: null, isAdmin: true, isOwner: true, isScorer: false, canScore: true, myPlayerId: null, base: '/l/L' } as unknown as LeagueCtx;

function court(events: RacketEvent[]): CourtController<MatchSetup, RacketState, RacketEvent> {
  const a = racketAdapter('padel', { match: { sport: 'padel' } });
  const state = replay(a.engine, {} as MatchSetup, events);
  return {
    ready: true,
    snapshot: { config: {}, events, seq: events.length } as never,
    state,
    over: false,
    winner: null,
    summary: '',
    score: null,
    canUndo: events.length > 0,
    lease: { kind: 'mine' },
    readOnly: false,
    unsent: 0,
    conflict: false,
    error: null,
    start: () => undefined,
    apply: () => null,
    undo: () => false,
    claim: async () => null,
    finish: async () => 'sent',
    suspend: async () => undefined,
    flush: () => undefined,
  };
}

function render(events: RacketEvent[]) {
  holder.court = court(events);
  const m = sets(['k1', 'k2'], ['k3', 'k4'], '', 1, { sets: [0, 0], games: [0, 0] }, { status: 'live', score: null, winner: null, rules: { match: { sport: 'padel' } } });
  m.sides[0].label = 'Ana / Luis';
  m.sides[1].label = 'Rosa / Pedro';
  const html = renderToString(
    h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, h(SetsCourt, { match: m, sport: 'padel', onExit: () => undefined, isAdmin: true, userId: 'u1' })))),
  );
  // La barra de abajo es el último bloque con «pb-safe».
  const i = html.lastIndexOf('pb-safe');
  return { top: html.slice(0, i), bar: html.slice(i) };
}

describe('modo cancha a sets: la barra de abajo cabe en el teléfono', () => {
  it('al empezar el set (dobles): «Orden de saque» va arriba, junto a quién saca; abajo solo Deshacer, Retiro y Terminar', () => {
    const { top, bar } = render([]);
    expect(top).toContain('aria-label="Orden de saque"');
    expect(bar).not.toContain('Orden de saque');
    expect(bar).toContain('aria-label="Retiro"');
    expect(bar).toContain('Terminar');
    expect(bar.match(/<button/g)).toHaveLength(3);
  });

  it('empezado el juego ya no se ofrece cambiar el orden', () => {
    const { top, bar } = render([{ type: 'point', side: 1 }]);
    expect(top).not.toContain('Orden de saque');
    expect(bar.match(/<button/g)).toHaveLength(3);
  });
});
