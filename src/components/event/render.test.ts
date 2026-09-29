/**
 * El boliche con la regla del dueño a la vista (docs/premios-torneo.md §5.1), dibujado sin navegador: los títulos de
 * la clasificación («Equipos (scratch)» e «Individual (handicap)», según el modo que se mira) y el total de cada equipo
 * en Juegos (con equipos por scratch, los pinos grandes y el total con handicap al lado).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import { entryLine } from '../../lib/stats';
import type { BowlingEvent, Entry, League, Player } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { groupTotal, TeamTotal } from './GamesTab';
import { StandingsTab } from './StandingsTab';
import { pendingWarning } from './EventPrizes';

const league: League = {
  id: 'L1',
  name: 'Liga Los Pinos',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
};
const ctx: LeagueCtx = { lid: 'L1', league, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: null, base: '/l/L1' };

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, el))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const event: BowlingEvent = {
  id: 'E1',
  type: 'torneo',
  name: 'Copa',
  date: '2026-10-12',
  games: 3,
  hcpBase: 230,
  hcpPercent: 80,
  teams: { A: { name: 'Los Strikers', order: 1 } },
  playerCount: 2,
};
const entries: Entry[] = [
  { id: 'e1', eventId: 'E1', playerId: 'p1', teamId: 'A', average: 180, handicapOverride: null, scores: [200, 210, 190], photos: ['f', 'f', 'f'] },
  { id: 'e2', eventId: 'E1', playerId: 'p2', teamId: 'A', average: 150, handicapOverride: null, scores: [180, 170, 160], photos: ['f', 'f', 'f'] },
];
const players: Player[] = [
  { id: 'p1', name: 'Luis', averageOverride: null },
  { id: 'p2', name: 'Pedro', averageOverride: null },
];

const titles = (ev: BowlingEvent) => {
  const t = text(render(h(StandingsTab, { event: ev, entries, players, readOnly: true })));
  return [t.includes('Equipos (scratch)'), t.includes('Equipos (handicap)'), t.includes('Individual (handicap)'), t.includes('Individual (scratch)'), t.includes('no es el criterio oficial')];
};

describe('la clasificación dice con qué ordena', () => {
  it('sin reglas escritas: «Equipos (scratch)» e «Individual (handicap)» (la regla del dueño)', () => {
    expect(titles(event)).toEqual([true, false, true, false, false]);
  });

  it('con las reglas al revés, al revés; con 0 % todo por scratch', () => {
    expect(titles({ ...event, individualRankBy: 'scratch', teamRankBy: 'hcp' })).toEqual([false, true, false, true, false]);
    expect(titles({ ...event, hcpPercent: 0, individualRankBy: 'hcp', teamRankBy: 'hcp' })).toEqual([true, false, false, true, false]);
  });

  it('una práctica sigue diciendo «Resultados de la práctica»', () => {
    const t = text(render(h(StandingsTab, { event: { ...event, type: 'practica', hcpPercent: 0 }, entries, players, readOnly: true })));
    expect(t).toContain('Resultados de la práctica');
    expect(t).not.toContain('Equipos (');
  });
});

describe('el total del equipo en Juegos', () => {
  const lines = entries.map((e) => entryLine(e, event, true));

  it('equipos por scratch: los pinos grandes y el total con handicap al lado, en gris', () => {
    // Scratch 600 + 510 = 1110; handicap (230 − prom.) × 80 %: 40 y 64 por juego → 1110 + 312 = 1422.
    expect(groupTotal(event, lines)).toEqual({ main: 1110, hcp: 1422 });
    expect(text(render(h(TeamTotal, { total: groupTotal(event, lines) })))).toBe('Total 1110 · con hcp 1422');
  });

  it('equipos con handicap (o sin handicap): un solo número, como antes', () => {
    expect(groupTotal({ ...event, teamRankBy: 'hcp' }, lines)).toEqual({ main: 1422, hcp: null });
    const zero = { ...event, hcpPercent: 0 };
    expect(groupTotal(zero, entries.map((e) => entryLine(e, zero, true)))).toEqual({ main: 1110, hcp: null });
    expect(text(render(h(TeamTotal, { total: { main: 1422, hcp: null } })))).toBe('Total 1422');
  });

  it('el aviso de juegos por verificar al entregar', () => {
    expect(pendingWarning(0)).toBeNull();
    expect(pendingWarning(1)).toBe('Hay 1 juego por verificar: puede cambiar el podio.');
    expect(pendingWarning(3)).toBe('Hay 3 juegos por verificar: pueden cambiar el podio.');
  });
});
