/**
 * Las pistas dibujadas sin navegador (renderToString), con los datos de mentira: la pestaña «Pistas» del admin
 * (generador, las pistas con «Mover a…», WhatsApp y publicar) y «Tu pista: 7» del jugador.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaneRow } from '../../lib/lanes';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { NextPracticeCard, nextPractice } from '../NextPracticeCard';
import { FeedbackProvider } from '../feedback';
import { LanesPanel } from './LanesPanel';
import { MyLane, myLaneText } from './MyLane';

const players: Player[] = [
  { id: 'a', name: 'Ana', averageOverride: null },
  { id: 'b', name: 'Beto', averageOverride: 190 },
  { id: 'c', name: 'Carla', averageOverride: null },
  { id: 'd', name: 'Dani', averageOverride: null },
];

const data = vi.hoisted(() => ({ rows: [] as LaneRow[] }));
vi.mock('../../lib/data/lanes', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/lanes')>()),
  useEventLanes: (lid: string | null) => ({ data: lid ? data.rows : [], loading: false, error: null }),
}));
vi.mock('../../lib/data', async (orig) => ({
  ...(await orig<typeof import('../../lib/data')>()),
  usePlayers: () => ({ data: players, loading: false, error: null }),
}));

const row = (playerId: string, lane: number, position: number, publishedAt: string | null = null): LaneRow => ({
  eventId: 'e1',
  playerId,
  lane,
  position,
  publishedAt,
});

const event: BowlingEvent = {
  id: 'e1',
  type: 'practica',
  name: '',
  date: '2026-09-29',
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  teams: {},
  playerCount: 2,
  rsvp: { c: true, d: true },
};

const entries = (teamId: string | null = null): Entry[] =>
  ['a', 'b'].map((p) => ({ id: `en-${p}`, eventId: 'e1', playerId: p, teamId, average: 0, handicapOverride: null, scores: [], photos: [] }));

const ctx: LeagueCtx = {
  lid: 'L1',
  league: {
    id: 'L1',
    name: 'Liga del Club',
    kind: 'liga',
    visibility: 'private',
    ownerUid: 'u1',
    venue: '',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    sport: 'bowling',
  },
  member: { id: 'L1_u1', leagueId: 'L1', uid: 'u1', name: 'Rosa', role: 'owner', playerId: 'a' },
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: 'a',
  base: '/l/L1',
};

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, node))));

beforeEach(() => {
  data.rows = [];
});

describe('Evento › Pistas (admin)', () => {
  it('sin pistas: el generador con los que van y el vacío', () => {
    const out = render(h(LanesPanel, { event, entries: entries(), players }));
    expect(out).toContain('4 jugadores: los que dijeron «voy» o están inscritos.');
    expect(out).toContain('Hacen falta 1 pista de 4.');
    expect(out).toContain('Por promedio');
    expect(out).toContain('Al azar');
    // Sin equipos armados no se ofrece «Por equipo».
    expect(out).not.toContain('Por equipo');
    expect(out).toContain('Armar pistas');
    expect(out).toContain('Sin pistas todavía');
    // «5-9» o «3, 5, 7» necesitan guion y coma: el teclado numérico del iPhone no los tiene.
    expect(out).toContain('placeholder="5-9"');
    expect(out).not.toMatch(/inputmode="numeric"/i);
    expect(render(h(LanesPanel, { event, entries: entries('t1'), players }))).toContain('Por equipo');
  });

  it('con pistas: por pista, «Mover a…», los que quedaron sin pista, WhatsApp y publicar', () => {
    data.rows = [row('b', 7, 1), row('a', 7, 2), row('c', 8, 1)];
    const out = render(h(LanesPanel, { event, entries: entries(), players }));
    expect(out).toContain('Pista <!-- -->7');
    expect(out).toContain('Pista <!-- -->8');
    expect(out).toContain('aria-label="Mover a Beto"');
    expect(out).toContain('Quitar de la pista');
    // Dani dijo «voy» y no tiene pista.
    expect(out).toContain('Sin pista (<!-- -->1<!-- -->)');
    expect(out).toContain('aria-label="Mover a Dani"');
    expect(out).toContain('Copiar para WhatsApp');
    expect(out).toContain('Publicar y avisar');
    expect(out).toContain('Sin publicar');
    expect(out).toContain('Armar de nuevo');
    expect(out.indexOf('Beto')).toBeLessThan(out.indexOf('>Ana<'));
  });

  it('publicadas y con un cambio sin avisar', () => {
    data.rows = [row('b', 7, 1, '2026-09-28T20:00:00Z'), row('a', 7, 2)];
    expect(render(h(LanesPanel, { event, entries: entries(), players }))).toContain('1 cambio sin avisar');
  });
});

describe('«Tu pista» del jugador', () => {
  it('el texto: su pista y con quién', () => {
    const rows = [row('b', 7, 1, '2026-09-28T20:00:00Z'), row('a', 7, 2), row('c', 7, 3), row('d', 8, 1)];
    const nameOf = (id: string) => players.find((p) => p.id === id)?.name;
    expect(myLaneText(rows, 'a', nameOf)).toEqual({ lane: 7, mates: 'con Beto y Carla' });
    expect(myLaneText(rows, 'd', nameOf)).toEqual({ lane: 8, mates: '' });
    expect(myLaneText(rows, 'x', nameOf)).toBeNull();
    // Antes de publicar no se ve.
    expect(myLaneText([row('a', 7, 1)], 'a', nameOf)).toBeNull();
  });

  it('sale solo si ya se publicaron', () => {
    data.rows = [row('a', 7, 1, '2026-09-28T20:00:00Z'), row('b', 7, 2, '2026-09-28T20:00:00Z')];
    const out = render(h(MyLane, { lid: 'L1', eventId: 'e1', playerId: 'a' }));
    expect(out).toContain('Tu pista: <!-- -->7');
    expect(out).toContain('con Beto');
    data.rows = [row('a', 7, 1)];
    expect(render(h(MyLane, { lid: 'L1', eventId: 'e1', playerId: 'a' }))).not.toContain('Tu pista');
  });
});

describe('«Tu pista» en el inicio del boliche', () => {
  it('la tarjeta de la próxima práctica la dice; si esa práctica ya está en vivo arriba, no otra vez', () => {
    data.rows = [row('a', 7, 1, '2026-09-28T20:00:00Z'), row('b', 7, 2, '2026-09-28T20:00:00Z')];
    const later: BowlingEvent = { ...event, date: '2099-01-05' };
    const sooner: BowlingEvent = { ...event, id: 'e0', date: '2099-01-02' };
    expect(nextPractice([later, { ...sooner, type: 'torneo' }], '2099-01-01')?.id).toBe('e1');
    expect(nextPractice([later, sooner], '2099-01-01')?.id).toBe('e0');
    expect(nextPractice([later], '2099-01-06')).toBeUndefined();
    expect(render(h(NextPracticeCard, { events: [later], playerId: 'a' }))).toContain('Tu pista');
    expect(render(h(NextPracticeCard, { events: [later], playerId: 'a', lane: false }))).not.toContain('Tu pista');
    // La de hoy que ya se está jugando no es «la próxima» (esa se anota): sale la siguiente.
    expect(nextPractice([later, sooner], '2099-01-01', new Set(['e0']))?.id).toBe('e1');
    // Una fila con la fecha y «Voy» en línea (sin botón grande).
    const card = render(h(NextPracticeCard, { events: [later], playerId: 'a', lane: false }));
    expect(card).toContain('Próxima práctica');
    expect(card).toMatch(/<time dateTime="2099-01-05"/);
    expect(card).toContain('aria-label="Voy"');
  });
});
