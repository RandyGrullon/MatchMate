/**
 * La plataforma de los torneos en la página del juego y en «Mis torneos» (docs/perfiles-equipos-esports.md §4): las RPC
 * no traen los ajustes, así que la de un juego de una sola plataforma sale sola y la de los de varias se lee de
 * `esports_tournaments.settings` (backend de mentira). Y «Actualizar mi ID en la inscripción» (`refreshEntryIds`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBackendForTests } from '../backend';
import { createFakeBackend, type FakeBackend } from '../db/fakeBackend';
import { esportsErrorText, fetchHub, fetchMyEntries, refreshEntryIds, toHubData, toMyEntries } from './esports';

let fake: FakeBackend;
beforeEach(() => {
  fake = createFakeBackend();
  setBackendForTests(fake);
});
afterEach(() => {
  setBackendForTests(null);
  vi.restoreAllMocks();
});

const hubRow = (eventId: string, over: Record<string, unknown> = {}) => ({
  eventId,
  leagueId: `l-${eventId}`,
  name: `Copa ${eventId}`,
  leagueName: 'Copa',
  visibility: 'public',
  logoPath: null,
  mode: '3v3',
  entryType: 'teams',
  format: 'single_elim',
  status: 'registration',
  startsAt: '2026-10-20T23:00:00Z',
  registrationOpensAt: null,
  registrationClosesAt: '2026-10-20T22:00:00Z',
  checkinMinutes: null,
  maxEntries: 16,
  approved: 2,
  pending: 0,
  prizeText: '',
  ...over,
});

const entryRow = (entryId: string, game: string, over: Record<string, unknown> = {}) => ({
  entryId,
  eventId: `ev-${entryId}`,
  leagueId: 'l1',
  tournament: `Copa ${entryId}`,
  game,
  mode: '1v1',
  entryStatus: 'approved',
  tournamentStatus: 'registration',
  startsAt: '2026-10-21T00:00:00Z',
  entryName: 'Ana',
  role: 'captain',
  kind: 'player',
  ...over,
});

describe('la plataforma de los torneos de la página del juego y de «Mis torneos»', () => {
  it('lo que traiga la fila (platform o settings); un juego de una sola plataforma, la suya; si no, no se sabe', () => {
    const val = toHubData({ tournaments: [hubRow('a', { mode: '5v5' })] }, 'valorant');
    expect(val.tournaments[0].platform).toBe('pc');
    const rl = toHubData({ tournaments: [hubRow('a'), hubRow('b', { platform: 'xbox' }), hubRow('c', { settings: { platform: 'playstation' } }), hubRow('d', { settings: {} })] }, 'rocket_league');
    expect(rl.tournaments.map((t) => t.platform)).toEqual([undefined, 'xbox', 'playstation', 'crossplay']);
    const mine = toMyEntries([entryRow('e1', 'smash'), entryRow('e2', 'nba_2k', { platform: 'psn' }), entryRow('e3', 'sf6')]);
    expect(mine.map((e) => [e.entryId, e.platform])).toEqual([
      ['e1', 'switch'],
      ['e2', 'playstation'],
      ['e3', undefined],
    ]);
  });

  it('fetchHub: los de varias plataformas la leen de los ajustes del torneo (una consulta); lo viejo de NBA 2K, convertido', async () => {
    fake.onRpc = () => ({ tournaments: [hubRow('a'), hubRow('b'), hubRow('c')], teams: [] });
    const selects: { table: string; columns?: string; filters?: unknown }[] = [];
    fake.select = (async (q: { table: string; columns?: string; filters?: unknown }) => {
      selects.push(q);
      return [
        { event_id: 'a', game: 'rocket_league', settings: { platform: 'playstation' } },
        { event_id: 'b', game: 'rocket_league', settings: {} },
      ];
    }) as FakeBackend['select'];
    const hub = await fetchHub('rocket_league');
    expect(hub.tournaments.map((t) => [t.eventId, t.platform])).toEqual([
      ['a', 'playstation'],
      ['b', 'crossplay'],
      ['c', undefined],
    ]);
    expect(selects).toHaveLength(1);
    expect(selects[0]).toMatchObject({ table: 'esports_tournaments', columns: 'event_id,game,settings' });

    // Un juego de una sola plataforma no consulta nada.
    selects.length = 0;
    fake.onRpc = () => ({ tournaments: [hubRow('v', { mode: '5v5' })], teams: [] });
    expect((await fetchHub('valorant')).tournaments[0].platform).toBe('pc');
    expect(selects).toHaveLength(0);
  });

  it('fetchMyEntries: igual, y si la consulta falla quedan sin plataforma (no se cae la lista)', async () => {
    fake.onRpc = () => [entryRow('e1', 'nba_2k'), entryRow('e2', 'valorant', { mode: '5v5' })];
    fake.select = (async () => [{ event_id: 'ev-e1', game: 'nba_2k', settings: { platform: 'steam' } }]) as FakeBackend['select'];
    expect((await fetchMyEntries()).map((e) => [e.entryId, e.platform])).toEqual([
      ['e1', 'pc'],
      ['e2', 'pc'],
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fake.select = (async () => {
      throw new Error('sin señal');
    }) as FakeBackend['select'];
    expect((await fetchMyEntries()).map((e) => [e.entryId, e.platform])).toEqual([
      ['e1', undefined],
      ['e2', 'pc'],
    ]);
  });
});

describe('«Actualizar mi ID en la inscripción» y los códigos de la plataforma', () => {
  it('refreshEntryIds manda la inscripción y devuelve cuántos cambió', async () => {
    fake.onRpc = () => ({ updated: 2 });
    expect(await refreshEntryIds('e1', 'ev1')).toBe(2);
    expect(fake.calls.at(-1)).toEqual({ fn: 'esports_refresh_entry_ids', args: { p_entry: 'e1' } });
    fake.onRpc = () => null;
    expect(await refreshEntryIds('e1', 'ev1')).toBe(0);
  });

  it('otra_plataforma y sin_plataforma (tuyo o de alguien de la plantilla)', () => {
    expect(esportsErrorText(new Error('otra_plataforma'), 'rocket_league')).toBe('Tu ID de Rocket League es de otra plataforma que la del torneo.');
    expect(esportsErrorText(new Error('sin_plataforma'), 'rocket_league')).toBe('Di en qué plataforma juegas Rocket League (en Mi ID de juego).');
    expect(esportsErrorText(new Error('otra_plataforma: Bea Pérez'), 'rocket_league')).toBe('Bea Pérez juega Rocket League en otra plataforma que la del torneo.');
    expect(esportsErrorText(new Error('sin_plataforma: Bea Pérez'), 'rocket_league')).toBe('Bea Pérez todavía no dice en qué plataforma juega Rocket League.');
  });
});
