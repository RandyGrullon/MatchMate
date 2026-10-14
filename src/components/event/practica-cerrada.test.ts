/**
 * «Tus juegos» en una práctica que ya cerró (renderToString): se anota hasta el final del día siguiente; después, quien
 * no es admin ve «Esta práctica ya cerró» y no tiene cómo anotar ni enviar (la base también responde `cerrado`). El admin
 * sigue anotando y los torneos no cierran.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDraft } from '../../lib/draft';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, League } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { MyGamesPanel } from './MyGamesPanel';

const world = vi.hoisted(() => ({ draft: null as GameDraft | null }));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => 'u-cerrada',
  currentOutbox: () => null,
}));
vi.mock('../../lib/draft', async (orig) => ({
  ...(await orig<typeof import('../../lib/draft')>()),
  useDraft: () => world.draft,
}));

const store = new Map<string, string>();
const memoryStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

/** Hoy en la zona de la liga (lo que la pantalla del evento le pasa a «Tus juegos»). */
const TODAY = '2026-10-07';
const league: League = {
  id: 'L1',
  name: 'Liga de los martes',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: 'Martes · 7:30 pm',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
};
const ctx: LeagueCtx = { lid: 'L1', league, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: 'p1', base: '/l/L1' };
const practice = (date: string, p: Partial<BowlingEvent> = {}): BowlingEvent => ({
  id: 'E1',
  type: 'practica',
  name: '',
  date,
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  teams: {},
  playerCount: 1,
  ...p,
});

const render = (event: BowlingEvent, { admin = false, entry = null as Entry | null, autoStart = false } = {}) =>
  renderToString(
    h(
      MemoryRouter,
      null,
      h(
        FeedbackProvider,
        null,
        h(
          LeagueContext.Provider,
          { value: { ...ctx, isAdmin: admin, canScore: admin } },
          h(MyGamesPanel, {
            event,
            playerId: 'p1',
            entry,
            subs: [],
            today: TODAY,
            autoStart,
            onAutoStarted: () => undefined,
            onOpenEntry: () => undefined,
            onSend: () => undefined,
          }),
        ),
      ),
    ),
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeAll(() => vi.stubGlobal('localStorage', memoryStorage));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  store.clear();
  world.draft = null;
});

describe('la práctica se cierra al otro día', () => {
  it('la de anoche todavía se anota (y se envía con la foto)', () => {
    const html = render(practice('2026-10-06'), { autoStart: true });
    const out = text(html);
    expect(out).toContain('Anotar juego 1');
    expect(out).toContain('Anotar con foto del marcador');
    expect(out).not.toContain('ya cerró');
    expect(html).toMatch(/<button[^>]*aria-label="Juego 1: anotar"/);
    // «?anotar=1» abre la hoja del juego 1.
    expect(out).toContain('Guardar');
  });

  it('la de antes de ayer ya cerró: «Esta práctica ya cerró», sin anotar ni enviar', () => {
    const html = render(practice('2026-10-05'), { autoStart: true });
    const out = text(html);
    expect(out).toContain('Esta práctica ya cerró.');
    expect(out).toContain('Si te falta un juego, pídeselo al admin.');
    expect(out).not.toContain('Anotar juego');
    expect(out).not.toContain('Anotar con foto del marcador');
    // Las fichas vacías ya no se abren (y «?anotar=1» tampoco abre la hoja).
    expect(html).not.toMatch(/<button[^>]*aria-label="Juego 1: anotar"/);
    expect(out).not.toContain('Guardar');
  });

  it('lo que quedó en el teléfono ya no se envía: se le pide al admin', () => {
    world.draft = { eventId: 'E1', values: ['200'] };
    const out = text(render(practice('2026-10-05')));
    expect(out).toContain('Lo que quedó en tu teléfono ya no se envía: pídele al admin que lo anote.');
    expect(out).not.toContain('Enviar mi juego');
  });

  it('con todo en la tabla no hace falta decirlo', () => {
    const entry: Entry = { id: 'x', eventId: 'E1', playerId: 'p1', teamId: null, average: 0, handicapOverride: null, scores: [190, 200, 210], photos: ['f', 'f', 'f'] };
    const out = text(render(practice('2026-10-05'), { entry }));
    expect(out).toContain('Tus juegos ya cuentan en la liga');
    expect(out).not.toContain('ya cerró');
  });

  it('el admin la sigue anotando; los torneos no cierran', () => {
    expect(text(render(practice('2026-10-05'), { admin: true }))).toContain('Anotar juego 1');
    expect(text(render(practice('2026-10-01', { type: 'torneo', name: 'Copa' })))).toContain('Anotar juego 1');
  });
});
