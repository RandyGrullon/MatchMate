/**
 * «Enviar mis juegos» y la práctica que cierra al otro día (renderToString): quien no es admin no ve en «¿Dónde jugaste?»
 * una práctica de antes de ayer (la base respondería `cerrado`); el admin sí. Los torneos no cierran.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays } from '../pages/sports/racket/logic/time';
import { toIsoDate } from '../lib/format';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import type { BowlingEvent, League, Player } from '../lib/types';
import { FeedbackProvider } from './feedback';
import { SubmitGamesModal } from './SubmitGamesModal';

vi.mock('../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../lib/data/client')>()),
  getUserId: () => null,
}));
vi.mock('../lib/scanJobs', async (orig) => ({
  ...(await orig<typeof import('../lib/scanJobs')>()),
  useScanJob: () => null,
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
beforeAll(() => vi.stubGlobal('localStorage', memoryStorage));
afterAll(() => vi.unstubAllGlobals());

// Sin zona: la fecha del teléfono (la liga de verdad usa la suya, leagues.tz).
const today = toIsoDate(new Date());
const league: League = {
  id: 'l1',
  name: 'Liga del Club',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u-admin',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
};
const ctx: LeagueCtx = { lid: 'l1', league, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: 'p1', base: '/l/l1' };
const me: Player = { id: 'p1', name: 'Ana', averageOverride: null };
const ev = (id: string, date: string, type: BowlingEvent['type'] = 'practica'): BowlingEvent => ({
  id,
  type,
  name: type === 'torneo' ? 'Copa' : '',
  date,
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  teams: {},
  playerCount: 0,
});
const events = [ev('hoy', today), ev('ayer', addDays(today, -1)), ev('vieja', addDays(today, -2)), ev('copa', addDays(today, -5), 'torneo')];
const options = (admin: boolean) =>
  [
    ...renderToString(
      h(
        FeedbackProvider,
        null,
        h(LeagueContext.Provider, { value: { ...ctx, isAdmin: admin } }, h(SubmitGamesModal, { open: true, onClose: () => undefined, player: me, events, myEntries: [] })),
      ),
    ).matchAll(/<option value="([^"]+)"/g),
  ].map((m) => m[1]);

describe('«¿Dónde jugaste?» con la práctica cerrada', () => {
  it('quien no es admin: hoy, ayer y el torneo (no la de antes de ayer)', () => {
    expect(options(false)).toEqual(['hoy', 'ayer', 'copa', '__fecha__']);
  });

  it('el admin las ve todas', () => {
    expect(options(true)).toEqual(['hoy', 'ayer', 'vieja', 'copa', '__fecha__']);
  });
});
