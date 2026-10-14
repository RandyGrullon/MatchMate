/**
 * Torneo › Equipos con los equipos fijos de la liga (docs/boliche-equipos-practicas-bolas.md §1), dibujado sin
 * navegador: «Usar los equipos fijos de la liga» sale solo si la liga tiene equipos fijos (y no en un torneo suelto).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BowlingTeam } from '../../lib/data/bowlingTeams';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, League, Player } from '../../lib/types';
import { FeedbackProvider } from '../feedback';

const data = vi.hoisted(() => ({ teams: [] as BowlingTeam[] }));
vi.mock('../../lib/data/bowlingTeams', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/bowlingTeams')>()),
  useBowlingTeams: (lid: string | null | undefined) => ({ data: lid ? data.teams : [], loading: false, error: null }),
}));

const { TeamsTab } = await import('./TeamsTab');

const league = (kind: League['kind']): League => ({
  id: 'L1',
  name: 'Liga Los Pinos',
  kind,
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
  sport: 'bowling',
});
const ctx = (kind: League['kind'] = 'liga'): LeagueCtx => ({
  lid: 'L1',
  league: league(kind),
  member: null,
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: null,
  base: '/l/L1',
});

const event: BowlingEvent = { id: 'E1', type: 'torneo', name: 'Copa', date: '2026-10-24', games: 3, hcpBase: 220, hcpPercent: 80, teams: {}, playerCount: 1, teamSize: 3 };
const entries: Entry[] = [{ id: 'e1', eventId: 'E1', playerId: 'p1', teamId: null, average: 180, handicapOverride: null, scores: [], photos: [] }];
const players: Player[] = [{ id: 'p1', name: 'Luis', averageOverride: null }];
const fixed: BowlingTeam[] = [{ id: 'T1', name: 'Los Strikers', color: null, order: 1, players: [{ playerId: 'p1', name: 'Luis' }] }];

const draw = (value: LeagueCtx = ctx()) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value }, h(TeamsTab, { event, entries, players })))));

beforeEach(() => {
  data.teams = [];
});

describe('Torneo › Equipos: los equipos fijos de la liga', () => {
  it('con equipos fijos: el botón y que los nuevos entran solos a su equipo', () => {
    data.teams = fixed;
    const out = draw();
    expect(out).toContain('Usar los equipos fijos de la liga');
    expect(out).toContain('La liga tiene <!-- -->1<!-- --> <!-- -->equipo fijo');
    expect(out).toContain('Quien se inscribe en este torneo entra solo a su equipo.');
    // Lo de siempre sigue.
    expect(out).toContain('Armar automáticamente');
  });

  it('sin equipos fijos, o en un torneo suelto, no sale', () => {
    expect(draw()).not.toContain('Usar los equipos fijos');
    data.teams = fixed;
    expect(draw(ctx('torneo'))).not.toContain('Usar los equipos fijos');
  });
});
