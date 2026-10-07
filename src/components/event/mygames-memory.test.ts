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
import { MyGamesPanel, type MyGamesLook } from './MyGamesPanel';

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

const render = ({ event = practice, autoStart = true, look }: { event?: BowlingEvent; autoStart?: boolean; look?: MyGamesLook } = {}) =>
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
            event,
            playerId: 'p1',
            entry: null,
            subs: [],
            live: { live: true, startLabel: null, startsSoon: false },
            today: TODAY,
            autoStart,
            onAutoStarted: () => undefined,
            onOpenEntry: () => undefined,
            onSend: () => undefined,
            look,
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
    expect(t).toContain('Máximo posible Máx. posible 280');
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

describe('Mis juegos dice lo mismo que Hoy (useNextGame)', () => {
  it('el juego que quedó a medias: la ficha «A medias» y UN botón «Seguir mi juego 2» (el del teléfono, «Enviar» discreto)', () => {
    world.draft = { eventId: 'E1', values: ['200'] };
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p1', 'E1'), 1), [10, 9, 0]);
    const out = render({ autoStart: false });
    const t = text(out);
    expect(t).toContain('Juego 2 A medias');
    expect(out).toContain('aria-label="Juego 2: a medias"');
    expect(t).toContain('Seguir mi juego 2');
    expect(t).not.toContain('Anotar juego 2');
    // Lo del teléfono se dice en una línea y se envía con un link, no con otro botón grande.
    expect(t).toContain('El juego 1 está en tu teléfono, sin enviar');
    expect(t).toContain('Enviar mi juego 1');
    expect(out.match(/bg-accent text-accent-fg/g)).toHaveLength(1);
  });

  it('en Pro, compacta: «J2 28…» (lo que lleva), la serie y «Seguir juego 2»', () => {
    world.draft = { eventId: 'E1', values: ['200'] };
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p1', 'E1'), 1), [10, 9, 0]);
    const t = text(render({ autoStart: false, look: 'pro' }));
    expect(t).toContain('J2 28… J3');
    expect(t).toContain('Serie 200');
    expect(t).toContain('Seguir juego 2');
  });

  it('Pro con Planilla: solo la hoja (sin tarjeta); con juegos sin enviar, la tarjeta para enviarlos', () => {
    world.draft = { eventId: 'E1', values: [] };
    const sheet = text(render({ autoStart: false, look: 'sheet' }));
    expect(sheet).not.toContain('Tus juegos');
    world.draft = { eventId: 'E1', values: ['200'] };
    expect(text(render({ autoStart: false, look: 'sheet' }))).toContain('Tus juegos');
  });

  it('sin nada en el teléfono: «Anotar juego 2» y la ficha vacía', () => {
    world.draft = { eventId: 'E1', values: [] };
    const t = text(render({ event: { ...practice, name: '' }, autoStart: false }));
    expect(t).toContain('Anotar juego 1');
    expect(t).not.toContain('A medias');
  });

  it('a medias y sin nada guardado todavía: «Seguir mi juego 1» como botón principal', () => {
    world.draft = { eventId: 'E1', values: [] };
    remember(gameKey(myGamesPlace('u-memoria', 'L1', 'p1', 'E1'), 0), [10]);
    const out = render({ autoStart: false });
    const t = text(out);
    expect(t).toContain('Seguir mi juego 1');
    // Todavía no suma nada (el strike espera sus dos tiros): «A medias», no «0…».
    expect(t).toContain('Juego 1 A medias');
    expect(t).toContain('Anotar con foto del marcador');
    expect(t).not.toContain('0…');
  });

  it('la hoja: «Juego 1» con «Práctica de hoy» debajo, sin la línea de abajo; «Borrar este juego» solo si está en el teléfono', () => {
    world.draft = { eventId: 'E1', values: [] };
    const out = render({ event: { ...practice, name: '' } });
    expect(out).toMatch(/Juego 1<\/h2><p[^>]*>Práctica de hoy<\/p>/);
    expect(text(out)).not.toContain('Al terminar, envíalo a revisión');
    expect(text(out)).not.toContain('Borrar este juego');
  });
});
