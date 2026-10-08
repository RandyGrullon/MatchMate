/**
 * Resultados anteriores de la liga (/l/:lid/juegos) dibujada sin navegador (renderToString) con juegos de mentira: el
 * título, lo de hoy como una fila a la práctica (no otra tabla en vivo), cada fecha con su bloque (OCT / 6) y quienes
 * jugaron de la mejor serie a la peor, con sus juegos en una línea, «Mejor juego» / «Mejor serie», me gusta y
 * comentarios; vacía y «Ver fechas más viejas».
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BowlingEvent, Entry, GameComment, Player, Reaction } from '../lib/types';
import { FeedbackProvider } from '../components/feedback';

const live = <T,>(data: T) => ({ data, loading: false, error: null });

const state = vi.hoisted(() => ({
  events: [] as BowlingEvent[],
  players: [] as Player[],
  entries: [] as Entry[],
  reactions: [] as Reaction[],
  comments: [] as GameComment[],
  pro: false,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, loading: false }) }));
vi.mock('../lib/useNow', () => ({ useNow: () => new Date(2026, 9, 7, 12, 0) }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../lib/league', async (orig) => ({
  ...(await orig<typeof import('../lib/league')>()),
  useLeagueCtx: () => ({
    lid: 'L1',
    league: { id: 'L1', name: 'Liga de los martes', sport: 'bowling', kind: 'liga', schedule: '', venue: '', tz: 'America/Santo_Domingo' },
    base: '/l/L1',
    myPlayerId: 'p1',
    member: { role: 'member' },
    isAdmin: false,
  }),
}));
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<typeof import('../lib/data')>()),
  useEvents: () => live(state.events),
  usePlayers: () => live(state.players),
  useEntriesOfEvents: () => live(state.entries),
  useReactionsOfEvents: () => live(state.reactions),
  useCommentsOfEvents: () => live(state.comments),
}));

const { default: GamesFeedPage, eventLine, scoresLine } = await import('./GamesFeedPage');

const event = (id: string, date: string, extra: Partial<BowlingEvent> = {}): BowlingEvent =>
  ({ id, type: 'practica', name: '', date, games: 3, hcpBase: 220, hcpPercent: 0, teams: {}, playerCount: 0, ...extra }) as BowlingEvent;
const player = (id: string, name: string, uid: string | null = null): Player => ({ id, name, uid }) as Player;
const entry = (eventId: string, playerId: string, scores: number[]): Entry => ({
  id: `${eventId}_${playerId}`,
  eventId,
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores,
  photos: scores.map(() => 'NO_PHOTO'),
});

const render = (url = '/l/L1/juegos') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(GamesFeedPage))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.events = [];
  state.players = [player('p1', 'Ana Pérez', 'u1'), player('p2', 'Pedro Gómez', 'u2'), player('p3', 'Luis Martínez')];
  state.entries = [];
  state.reactions = [];
  state.comments = [];
  state.pro = false;
});

describe('resultados anteriores', () => {
  it('vacía: el título y qué sale aquí', () => {
    const out = render();
    const t = text(out);
    expect(out).toContain('class="text-title');
    expect(t).toContain('Resultados anteriores');
    expect(t).toContain('Todavía no hay juegos');
  });

  it('cada fecha con su bloque y quienes jugaron, de la mejor serie a la peor', () => {
    state.events = [event('e1', '2026-10-06', { name: 'Práctica del martes' }), event('e2', '2026-09-29', { name: 'Práctica del 29' })];
    state.entries = [entry('e1', 'p1', [176, 195, 203]), entry('e1', 'p2', [227, 199, 236]), entry('e1', 'p3', [150, 160, 170]), entry('e2', 'p1', [199, 181, 214])];
    state.reactions = [{ id: 'r1', entryId: 'e1_p1', uid: 'u2', type: 'like' } as Reaction];
    state.comments = [{ id: 'c1', entryId: 'e1_p1', uid: 'u2', text: '¡Bien!' } as GameComment];
    const out = render();
    const t = text(out);
    expect(t).toContain('Práctica del martes');
    expect(t).toContain('Martes · práctica · 3 jugaron');
    expect(t).toContain('OCT 6');
    expect(t).toContain('SEP 29');
    // Pedro (662) va antes que Ana (574) y Luis (480); los juegos en una línea y la serie grande.
    expect(t.indexOf('Pedro Gómez')).toBeLessThan(t.indexOf('Ana Pérez'));
    expect(t.indexOf('Ana Pérez')).toBeLessThan(t.indexOf('Luis Martínez'));
    expect(t).toContain('227 · 199 · 236 Mejor juego Mejor serie 662');
    // Me gusta y comentarios de Ana.
    expect(out).toContain('aria-label="1 reacciones, 1 comentarios"');
    // Sus iniciales llevan a su perfil (Luis no tiene cuenta: sin link).
    expect(out).toContain('href="/u/u2"');
    expect(out).toContain('aria-label="Ver el juego de Pedro Gómez: serie 662"');
    // Sin emojis ni la barra de reacciones en cada juego.
    expect(t).not.toContain('🏆');
    expect(t).not.toContain('Felicitar');
    // La fecha lleva a su práctica.
    expect(out).toContain('href="/l/L1/e/e1"');
  });

  it('hoy: una fila a la práctica, no la tabla en vivo', () => {
    state.events = [event('hoy', '2026-10-07', { name: 'Práctica de hoy', startTime: '00:00:00' })];
    state.entries = [entry('hoy', 'p1', [187, 210])];
    const out = render();
    const t = text(out);
    expect(t).toContain('Práctica de hoy');
    expect(out).toContain('href="/l/L1/e/hoy"');
    expect(t).not.toContain('Pinos hasta ahora');
  });

  it('más de 4 fechas: «Ver fechas más viejas»', () => {
    state.events = ['2026-10-06', '2026-09-29', '2026-09-22', '2026-09-15', '2026-09-08'].map((d, i) => event(`e${i}`, d));
    expect(text(render())).toContain('Ver fechas más viejas');
  });

  it('las líneas: el día, el tipo y cuántos jugaron; los juegos sin los vacíos', () => {
    expect(eventLine(event('x', '2026-10-24', { type: 'torneo' }), 1)).toBe('Sábado · torneo · 1 jugó');
    expect(eventLine(event('x', '2026-10-06'), 0)).toBe('Martes · práctica');
    expect(scoresLine([180, null, 200])).toBe('180 · 200');
  });
});

