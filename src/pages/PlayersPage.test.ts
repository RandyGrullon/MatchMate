/**
 * Organizar › Jugadores (PlayersPage) dibujada sin navegador (renderToString) con jugadores de mentira: un solo botón
 * «Agregar jugador», una línea de ayuda (no tres), cada jugador en una fila con su promedio del handicap grande y
 * «prom. fijo · 12 juegos · mejor 245», «Sin cuenta», lo sin foto, sin los íconos de compartir y ver en cada fila (están
 * en su hoja), y los miembros sin jugador.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, Member, Player } from '../lib/types';
import { FeedbackProvider } from '../components/feedback';

const live = <T,>(data: T) => ({ data, loading: false, error: null });

const state = vi.hoisted(() => ({
  sport: 'bowling',
  players: [] as Player[],
  members: [] as Member[],
  entries: [] as Entry[],
}));

vi.mock('../lib/league', async (orig) => ({
  ...(await orig<typeof import('../lib/league')>()),
  useLeagueCtx: () => ({
    lid: 'L1',
    base: '/l/L1',
    league: { id: 'L1', name: 'Liga de los martes', sport: state.sport, kind: 'liga', tz: 'America/Santo_Domingo' },
    isAdmin: true,
    isOwner: true,
  }),
}));
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<typeof import('../lib/data')>()),
  usePlayers: () => live(state.players),
  useLeagueMembers: () => live(state.members),
  useAllEntries: () => live(state.entries),
  useEvents: () => live([{ id: 'e1', date: '2026-10-06', type: 'practica', games: 3 }]),
}));
vi.mock('../lib/data/seasons', async (orig) => ({ ...(await orig<typeof import('../lib/data/seasons')>()), useLeagueSeasons: () => live([]) }));
vi.mock('../lib/data/players', async (orig) => ({ ...(await orig<typeof import('../lib/data/players')>()), useGuardians: () => live({}) }));
vi.mock('../lib/data/claims', async (orig) => ({ ...(await orig<typeof import('../lib/data/claims')>()), useLeagueClaims: () => live([]) }));
vi.mock('../components/players/data', async (orig) => ({ ...(await orig<typeof import('../components/players/data')>()), usePlayerAttrs: () => live({}) }));

const { default: PlayersPage, playerLine } = await import('./PlayersPage');

const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({ id, name, averageOverride: null, uid: null, ...extra });
const entry = (playerId: string, scores: number[], photos = scores.map(() => 'NO_PHOTO' as string | null)): Entry => ({
  id: `e1_${playerId}`,
  eventId: 'e1',
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores,
  photos,
});

const render = () => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(PlayersPage))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.sport = 'bowling';
  state.players = [player('p1', 'Ana Pérez', { uid: 'u1', averageOverride: 180 }), player('p2', 'Luis Martínez')];
  state.members = [{ id: 'm1', uid: 'u1', name: 'Ana Pérez', role: 'owner', playerId: 'p1' } as Member, { id: 'm2', uid: 'u3', name: 'Carla Núñez', role: 'member', playerId: null } as Member];
  state.entries = [entry('p1', [200, 190, 210]), entry('p2', [150, 160], ['NO_PHOTO', null])];
});

describe('Organizar › Jugadores', () => {
  it('un botón «Agregar jugador», una línea y una fila por jugador', () => {
    const out = render();
    const t = text(out);
    expect(t.match(/Agregar jugador/g)).toHaveLength(1);
    expect(t).toContain('El número es el promedio del handicap');
    // Ya no está el título repetido ni los íconos de compartir y ver en cada fila.
    expect(out).not.toContain('aria-label="Compartir link"');
    expect(out).not.toContain('aria-label="Ver su página"');
    expect(out).toContain('aria-label="Editar a Ana Pérez"');
    expect(out).toContain('aria-label="Admin"');
    expect(t).toContain('Sin cuenta');
    expect(t).toContain('1 sin foto');
    // Los miembros que todavía no tienen jugador.
    expect(t).toContain('Miembros sin jugador (1)');
    expect(t).toContain('Carla Núñez');
    expect(t).toContain('Su jugador se crea al abrir la liga');
  });

  it('otro deporte: sin promedio ni juegos', () => {
    state.sport = 'padel';
    const t = text(render());
    expect(t).not.toContain('juegos');
    expect(t).toContain('Toca a alguien para cambiar su nombre o su cuenta.');
  });

  it('la línea de cada jugador', () => {
    expect(playerLine({ bowling: true, hasAccount: false, games: 12, high: 245, pending: 0, source: 'fijo' })).toBe('Sin cuenta · prom. fijo · 12 juegos · mejor 245');
    expect(playerLine({ bowling: true, hasAccount: true, games: 1, high: 0, pending: 2, source: 'temporada' })).toBe('1 juego · 2 sin foto');
    expect(playerLine({ bowling: false, hasAccount: false, isMinor: true, games: 0, high: 0, pending: 0, summary: 'Nivel 3.5' })).toBe('Menor · sin cuenta · Nivel 3.5');
  });
});
