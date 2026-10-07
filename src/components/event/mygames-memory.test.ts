/**
 * «Mis juegos» con un juego a medias en la memoria del teléfono (renderToString): al abrir ese juego (desde "En juego
 * ahora") sigue donde lo dejó, con el aviso y «Descartar». La memoria es de esa cuenta, jugador, evento y juego: la de
 * otro juego, otro evento, otro jugador u otra cuenta no sale.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDraft } from '../../lib/draft';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { BowlingEvent, League } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { gameKey, myGamesPlace, storageKey } from '../frames/draftMemory';
import { MyGamesPanel } from './MyGamesPanel';

const world = vi.hoisted(() => ({ uid: 'u-memoria' as string | null, draft: null as GameDraft | null }));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => world.uid,
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

const TODAY = '2026-10-06';
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
const ctx: LeagueCtx = { lid: 'L1', league, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: 'p1', base: '/l/L1' };
const practice: BowlingEvent = { id: 'E1', type: 'practica', name: 'Práctica', date: TODAY, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 1 };

const render = () =>
  renderToString(
    h(
      MemoryRouter,
      null,
      h(
        FeedbackProvider,
        null,
        h(
          LeagueContext.Provider,
          { value: ctx },
          h(MyGamesPanel, {
            event: practice,
            playerId: 'p1',
            entry: null,
            subs: [],
            live: { live: true, startLabel: null, startsSoon: false },
            today: TODAY,
            autoStart: true,
            onAutoStarted: () => undefined,
            onOpenEntry: () => undefined,
            onSend: () => undefined,
          }),
        ),
      ),
    ),
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const remember = (key: string, rolls: number[]) => store.set(storageKey(key), JSON.stringify({ score: null, frames: { rolls }, at: Date.now() }));
const NOTICE = 'Seguimos donde lo dejaste (sin guardar)';

beforeAll(() => {
  vi.stubGlobal('localStorage', memoryStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  store.clear();
  world.uid = 'u-memoria';
  world.draft = null;
});

describe('Mis juegos: el juego a medias no se pierde al cerrar la hoja', () => {
  it('el juego 2 sigue donde lo dejó (con el máximo posible), con «Descartar»', () => {
    world.draft = { eventId: 'E1', values: ['200'] };
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p1', 'E1'), 1), [10, 9]);
    const out = render();
    const t = text(out);
    expect(t).toContain('Juego 2');
    expect(t).toContain(NOTICE);
    expect(t).toContain('Descartar');
    expect(out).toContain('data-max="280"');
    expect(t).toContain('Máximo posible Máx. 280');
  });

  it('la de otro juego, otro evento, otro jugador u otra cuenta no sale', () => {
    world.draft = { eventId: 'E1', values: ['200'] };
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p1', 'E1'), 2), [10]);
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p1', 'E2'), 1), [10]);
    remember(gameKey(myGamesPlace('otra-cuenta', 'L1', 'p1', 'E1'), 1), [10]);
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p2', 'E1'), 1), [10]);
    const t = text(render());
    expect(t).toContain('Juego 2');
    expect(t).not.toContain(NOTICE);
  });
});
