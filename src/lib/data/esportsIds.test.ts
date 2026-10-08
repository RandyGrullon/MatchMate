/**
 * IDs de juego, rangos, «Conectar con…» y los avisos de «tu ID pasó a otra cuenta» (src/lib/data/esportsIds.ts):
 * - de la base a la app (RPC en camelCase o tabla en snake_case);
 * - con un backend de mentira: qué se manda a cada RPC y a cada función, el modo local (todo apagado, la búsqueda da
 *   `no_disponible`) y los errores en palabras simples. Ya no hay reclamos, código de prueba ni capturas.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setBackendForTests } from '../backend';
import { BackendError, type Backend, type SelectQuery } from '../backend/types';
import { queryClient, resetDataClientForTests, setDataUser } from './client';
import * as esportsIds from './esportsIds';
import {
  confirmGameId,
  deleteGameId,
  esportsIdKeys,
  esportsIdsDeps,
  esportsIdTags,
  fetchGameIdsFor,
  fetchMyGameIds,
  fetchMyIdMoves,
  fetchProviders,
  gameIdErrorText,
  lookupGameId,
  PROVIDERS_OFF,
  PUBLIC_COLUMNS,
  saveGameId,
  seenIdMove,
  setRanks,
  startLink,
  toGameIdRecord,
  toIdMove,
  toLookupResult,
  toProvidersStatus,
} from './esportsIds';

const UID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const LOOKUP = '22222222-2222-4222-8222-222222222222';
const MOVE = '44444444-4444-4444-8444-444444444444';
const MOVE2 = '55555555-5555-4555-8555-555555555555';

// ---------------------------------------------------------------------------------------------------------
describe('de la base a la app', () => {
  it('toGameIdRecord: la RPC (camelCase, todas las columnas) y la tabla (snake_case, las públicas)', () => {
    const mine = toGameIdRecord({
      userId: UID,
      game: 'lol',
      platform: '',
      region: 'la1',
      idDisplay: 'Ñandú#LAN',
      idNormalized: 'Ñandú#lan',
      status: 'confirmado',
      ownership: 'busqueda',
      externalId: 'puuid',
      ranks: { main: { tier: 'gold', div: 2 } },
      rankSource: 'verificado',
      lookupName: 'Ñandú#LAN',
      verifiedAt: '2026-10-08T10:00:00Z',
      confirmedAt: '2026-10-08T10:00:00Z',
      updatedAt: '2026-10-08T10:00:00Z',
    });
    expect(mine).toEqual({
      userId: UID,
      game: 'lol',
      platform: '',
      region: 'la1',
      idDisplay: 'Ñandú#LAN',
      idNormalized: 'Ñandú#lan',
      status: 'confirmado',
      ownership: 'busqueda',
      externalId: 'puuid',
      ranks: { main: { tier: 'gold', div: 2 } },
      rankSource: 'verificado',
      lookupName: 'Ñandú#LAN',
      verifiedAt: '2026-10-08T10:00:00Z',
      confirmedAt: '2026-10-08T10:00:00Z',
      updatedAt: '2026-10-08T10:00:00Z',
    });
    expect(toGameIdRecord({ userId: UID, game: 'cs2', idDisplay: '22202', status: 'confirmado', ownership: 'login' })).toMatchObject({ ownership: 'login' });
    const other = toGameIdRecord({
      user_id: OTHER,
      game: 'nba_2k',
      platform: 'psn',
      region: '',
      id_display: 'Yo2K',
      status: 'pendiente',
      ranks: null,
      rank_source: 'captura',
      ownership: 'codigo',
      verified_at: null,
      confirmed_at: null,
      updated_at: '2026-10-08T10:00:00Z',
    });
    // Lo que solo ve su dueño no aparece; lo que no se entiende (lo viejo: 'codigo', 'captura') queda declarado.
    expect(other).toEqual({
      userId: OTHER,
      game: 'nba_2k',
      platform: 'psn',
      region: '',
      idDisplay: 'Yo2K',
      status: 'pendiente',
      ownership: 'declarado',
      ranks: {},
      rankSource: 'declarado',
      verifiedAt: null,
      confirmedAt: null,
      updatedAt: '2026-10-08T10:00:00Z',
    });
    // Ya no hay captura de rango ni nota.
    expect(toGameIdRecord({ userId: UID, game: 'lol', idDisplay: 'A#B12', rankProof: 'x', rankNote: 'y' })).not.toHaveProperty('rankProof');
    expect(toGameIdRecord({ user_id: UID, game: 'tetris', id_display: 'x' })).toBeNull();
    expect(toGameIdRecord(null)).toBeNull();
  });

  it('toIdMove: los avisos de «tu ID pasó a otra cuenta»', () => {
    expect(toIdMove({ id: MOVE, game: 'fortnite', platform: '', idDisplay: 'NinjaDR', provider: 'epic', createdAt: '2026-10-08T10:00:00Z' })).toEqual({
      id: MOVE,
      game: 'fortnite',
      platform: '',
      idDisplay: 'NinjaDR',
      provider: 'epic',
      createdAt: '2026-10-08T10:00:00Z',
    });
    expect(toIdMove({ id: MOVE, game: 'cs2', id_display: '22202', provider: 'steam', created_at: 'x' })).toMatchObject({ idDisplay: '22202', platform: '', createdAt: 'x' });
    expect(toIdMove({ id: MOVE, game: 'cs2', idDisplay: '22202', provider: 'google' })).toBeNull();
    expect(toIdMove({ id: 'no-uuid', game: 'cs2', idDisplay: '22202', provider: 'steam' })).toBeNull();
    expect(toIdMove({ id: MOVE, game: 'tetris', idDisplay: '22202', provider: 'steam' })).toBeNull();
    expect(toIdMove({ id: MOVE, game: 'cs2', provider: 'steam' })).toBeNull();
    expect(toIdMove('basura')).toBeNull();
  });

  it('toProvidersStatus y toLookupResult', () => {
    expect(toProvidersStatus({ lookup: ['lol', 'nada'], link: { steam: true, epic: 'si' }, autoCode: ['cs2'] })).toEqual({
      lookup: ['lol'],
      link: { steam: true, epic: false, riot: false },
    });
    expect(toProvidersStatus(null)).toEqual(PROVIDERS_OFF);
    expect(PROVIDERS_OFF).toEqual({ lookup: [], link: { steam: false, epic: false, riot: false } });
    expect(toLookupResult({ status: 'found', lookupId: LOOKUP, displayName: 'Ana#LAN', ranks: { main: { value: 1 } } })).toEqual({
      status: 'found',
      lookupId: LOOKUP,
      displayName: 'Ana#LAN',
      ranks: { main: { value: 1 } },
    });
    expect(toLookupResult({ status: 'found', lookupId: 'no-uuid' })).toEqual({ status: 'error' });
    expect(toLookupResult({ status: 'rate_limited' })).toEqual({ status: 'rate_limited' });
    expect(toLookupResult('basura')).toEqual({ status: 'error' });
  });

  it('sin reclamos, código de prueba ni capturas', () => {
    for (const gone of [
      'PROOF_BUCKET',
      'uploadProof',
      'useProofUrl',
      'submitRankProof',
      'reviewRank',
      'useRankProof',
      'useAdminRankProofs',
      'useMyAppeals',
      'openAppeal',
      'appealEvidence',
      'cancelAppeal',
      'checkChallenge',
      'decideAppeal',
      'useAdminAppealQueue',
    ]) {
      expect(esportsIds, gone).not.toHaveProperty(gone);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
interface Fake extends Backend {
  rpcs: { fn: string; args?: Record<string, unknown> }[];
  invokes: { fn: string; body: unknown }[];
  selects: SelectQuery[];
  answers: Record<string, unknown>;
  invokeAnswers: Record<string, unknown>;
}

function fakeBackend(mode: 'supabase' | 'local'): Fake {
  const f: Fake = {
    mode,
    rpcs: [],
    invokes: [],
    selects: [],
    answers: {},
    invokeAnswers: {},
    auth: {} as Backend['auth'],
    async select<T>(q: SelectQuery) {
      f.selects.push(q);
      return (f.answers[`select:${q.table}`] ?? []) as T[];
    },
    async rpc<T>(fn: string, args?: Record<string, unknown>) {
      f.rpcs.push({ fn, args });
      const a = f.answers[fn];
      if (a instanceof Error) throw a;
      return (a ?? null) as T;
    },
    subscribe: () => () => undefined,
    storage: {
      upload: async () => undefined,
      signedUrl: async (bucket, path) => `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`,
      publicUrl: async (bucket, path) => `https://x/${bucket}/${path}`,
      remove: async () => undefined,
    },
    async invoke<T>(fn: string, body: unknown) {
      f.invokes.push({ fn, body });
      return (f.invokeAnswers[fn] ?? null) as T;
    },
    online: () => true,
  };
  return f;
}

const realDeps = { ...esportsIdsDeps };

describe('con un backend de mentira', () => {
  let f: Fake;
  const navigated: string[] = [];

  beforeAll(async () => {
    await setDataUser(UID);
  });
  afterAll(async () => {
    await resetDataClientForTests();
    setBackendForTests(null);
  });
  beforeEach(() => {
    f = fakeBackend('supabase');
    setBackendForTests(f);
    navigated.length = 0;
    esportsIdsDeps.navigate = (url) => void navigated.push(url);
  });
  afterEach(() => {
    Object.assign(esportsIdsDeps, realDeps);
  });

  it('el ID: guardar (declarado), comprobar con la búsqueda, rango y borrar con sus argumentos', async () => {
    f.answers.esports_save_game_id = { status: 'pendiente', idDisplay: 'Ñandú#LAN', idNormalized: 'Ñandú#lan' };
    expect(await saveGameId('lol', ' Ñandú#LAN ', '', 'la1')).toEqual({ status: 'pendiente', idDisplay: 'Ñandú#LAN' });
    f.answers.esports_confirm_game_id = { status: 'confirmado', rankSource: 'verificado', ownership: 'busqueda' };
    expect(await confirmGameId('lol', LOOKUP)).toEqual({ status: 'confirmado', rankSource: 'verificado', ownership: 'busqueda' });
    // Una fila conectada sigue «login»; sin respuesta, lo que deja la búsqueda.
    f.answers.esports_confirm_game_id = { status: 'confirmado', rankSource: 'declarado', ownership: 'login' };
    expect(await confirmGameId('valorant', LOOKUP)).toEqual({ status: 'confirmado', rankSource: 'declarado', ownership: 'login' });
    f.answers.esports_confirm_game_id = null;
    expect(await confirmGameId('valorant', LOOKUP, '')).toEqual({ status: 'confirmado', rankSource: 'declarado', ownership: 'busqueda' });
    await setRanks('rocket_league', { '3v3': { tier: 'gc1', div: 2 } });
    await setRanks('nba_2k', { main: { text: 'Pro' } }, 'psn');
    await deleteGameId('nba_2k', 'psn');
    expect(f.rpcs).toEqual([
      { fn: 'esports_save_game_id', args: { p_game: 'lol', p_id: ' Ñandú#LAN ', p_platform: '', p_region: 'la1' } },
      { fn: 'esports_confirm_game_id', args: { p_game: 'lol', p_platform: '', p_lookup: LOOKUP } },
      { fn: 'esports_confirm_game_id', args: { p_game: 'valorant', p_platform: '', p_lookup: LOOKUP } },
      { fn: 'esports_confirm_game_id', args: { p_game: 'valorant', p_platform: '', p_lookup: LOOKUP } },
      { fn: 'esports_set_ranks', args: { p_game: 'rocket_league', p_platform: '', p_ranks: { '3v3': { tier: 'gc1', div: 2 } } } },
      { fn: 'esports_set_ranks', args: { p_game: 'nba_2k', p_platform: 'psn', p_ranks: { main: { text: 'Pro' } } } },
      { fn: 'esports_delete_game_id', args: { p_game: 'nba_2k', p_platform: 'psn' } },
    ]);
  });

  it('mis IDs por RPC; los de otros por select con solo las columnas públicas', async () => {
    f.answers.esports_my_game_ids = [{ userId: UID, game: 'cs2', idDisplay: '22202', status: 'confirmado', ownership: 'login' }, { game: 'nada' }];
    expect(await fetchMyGameIds()).toMatchObject([{ userId: UID, game: 'cs2', idDisplay: '22202', status: 'confirmado', ownership: 'login' }]);
    f.answers['select:esports_game_ids'] = [{ user_id: OTHER, game: 'cs2', id_display: '1', status: 'pendiente' }];
    expect(await fetchGameIdsFor([OTHER, OTHER.toUpperCase(), 'no-uuid'], 'cs2')).toHaveLength(1);
    expect(f.selects[0]).toEqual({
      table: 'esports_game_ids',
      columns: PUBLIC_COLUMNS,
      filters: [
        { col: 'game', op: 'eq', value: 'cs2' },
        { col: 'user_id', op: 'in', value: [OTHER] },
      ],
    });
    expect(PUBLIC_COLUMNS).not.toMatch(/rank_proof|rank_note|external_id|id_normalized|lookup_name/);
    // Sin cuentas no se pregunta.
    expect(await fetchGameIdsFor([], 'cs2')).toEqual([]);
    expect(f.selects).toHaveLength(1);
  });

  it('esports-verify: qué está encendido y buscar (sin código de prueba)', async () => {
    f.invokeAnswers['esports-verify'] = { lookup: ['valorant', 'lol'], link: { steam: true, epic: false, riot: true } };
    expect(await fetchProviders()).toEqual({ lookup: ['valorant', 'lol'], link: { steam: true, epic: false, riot: true } });
    f.invokeAnswers['esports-verify'] = { status: 'found', lookupId: LOOKUP, displayName: 'Ana#LAN', ranks: {} };
    expect(await lookupGameId('lol', 'Ana#LAN', '', 'la1')).toEqual({ status: 'found', lookupId: LOOKUP, displayName: 'Ana#LAN', ranks: {} });
    f.invokeAnswers['esports-verify'] = { status: 'not_found' };
    expect(await lookupGameId('valorant', 'Nadie#LAN')).toEqual({ status: 'not_found' });
    expect(f.invokes).toEqual([
      { fn: 'esports-verify', body: { action: 'providers' } },
      { fn: 'esports-verify', body: { action: 'lookup', game: 'lol', id: 'Ana#LAN', platform: '', region: 'la1' } },
      { fn: 'esports-verify', body: { action: 'lookup', game: 'valorant', id: 'Nadie#LAN', platform: '', region: '' } },
    ]);
  });

  it('startLink: pide el inicio a esports-auth y lleva el navegador a la URL que devuelve; apagado → no_disponible', async () => {
    const go = 'https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/go?provider=epic&game=fortnite&state=s';
    f.invokeAnswers['esports-auth/start'] = { status: 'ok', url: go };
    await startLink('epic', 'fortnite');
    expect(f.invokes).toEqual([{ fn: 'esports-auth/start', body: { provider: 'epic', game: 'fortnite' } }]);
    expect(navigated).toEqual([go]);
    f.invokeAnswers['esports-auth/start'] = { status: 'no_disponible' };
    await expect(startLink('riot', 'lol')).rejects.toMatchObject({ code: 'no_disponible' });
    f.invokeAnswers['esports-auth/start'] = { status: 'ok', url: 'javascript:alert(1)' };
    await expect(startLink('riot', 'lol')).rejects.toMatchObject({ code: 'no_disponible' });
    expect(navigated).toHaveLength(1);
  });

  it('«tu ID pasó a otra cuenta»: los no vistos (el más nuevo primero) y marcarlo visto', async () => {
    f.answers.esports_my_id_moves = [
      { id: MOVE, game: 'cs2', platform: '', idDisplay: '22202', provider: 'steam', createdAt: '2026-10-07T10:00:00Z' },
      { id: 'roto', game: 'cs2', idDisplay: 'x', provider: 'steam' },
      { id: MOVE2, game: 'fortnite', platform: '', idDisplay: 'NinjaDR', provider: 'epic', createdAt: '2026-10-08T10:00:00Z' },
    ];
    expect((await fetchMyIdMoves()).map((m) => [m.id, m.game, m.provider])).toEqual([
      [MOVE2, 'fortnite', 'epic'],
      [MOVE, 'cs2', 'steam'],
    ]);
    await seenIdMove(MOVE2);
    expect(f.rpcs).toEqual([{ fn: 'esports_my_id_moves', args: undefined }, { fn: 'esports_seen_id_move', args: { p_id: MOVE2 } }]);
    f.answers.esports_my_id_moves = null;
    expect(await fetchMyIdMoves()).toEqual([]);
  });

  it('seenIdMove vuelve a pedir los avisos (la etiqueta de useMyIdMoves)', async () => {
    f.answers.esports_my_id_moves = [{ id: MOVE, game: 'cs2', idDisplay: '22202', provider: 'steam', createdAt: '2026-10-07T10:00:00Z' }];
    const key = esportsIdKeys.moves(UID);
    const opts = { initial: [], tags: [esportsIdTags.all, esportsIdTags.moves], persist: false, staleMs: 60_000 };
    const count = () => f.rpcs.filter((r) => r.fn === 'esports_my_id_moves').length;
    expect(await queryClient.fetchQuery(key, fetchMyIdMoves, opts)).toHaveLength(1);
    // Fresco: no se vuelve a pedir.
    await queryClient.fetchQuery(key, fetchMyIdMoves, opts);
    expect(count()).toBe(1);
    f.answers.esports_my_id_moves = [];
    await seenIdMove(MOVE);
    expect(await queryClient.fetchQuery(key, fetchMyIdMoves, opts)).toEqual([]);
    expect(count()).toBe(2);
  });
});

describe('en el modo local (sin Edge Functions)', () => {
  let f: Fake;
  beforeEach(() => {
    f = fakeBackend('local');
    setBackendForTests(f);
  });
  afterAll(() => setBackendForTests(null));

  it('todo apagado: la búsqueda da no_disponible sin llamar a nada; conectar falla con no_disponible', async () => {
    expect(await fetchProviders()).toEqual(PROVIDERS_OFF);
    expect(await lookupGameId('lol', 'Ana#LAN')).toEqual({ status: 'no_disponible' });
    await expect(startLink('steam', 'cs2')).rejects.toMatchObject({ code: 'no_disponible' });
    expect(f.invokes).toEqual([]);
  });
});

describe('los errores en palabras simples', () => {
  const p0001 = (message: string, kind: ConstructorParameters<typeof BackendError>[1] = 'validation') => new BackendError(message, kind, 'P0001');

  it('los códigos del contrato y los de siempre', () => {
    expect(gameIdErrorText(p0001('id_tomado'), 'fortnite')).toBe('Ese ID está conectado a otra cuenta con su inicio de sesión.');
    expect(gameIdErrorText(p0001('sin_id'), 'valorant')).toBe('Primero pon tu ID de VALORANT.');
    expect(gameIdErrorText(p0001('id_sin_comprobar'), 'cs2')).toBe('Este torneo pide tu ID de Counter-Strike 2 comprobado.');
    expect(gameIdErrorText(p0001('sin_rango'), 'lol')).toBe('Este torneo pide tu rango verificado de League of Legends.');
    expect(gameIdErrorText(p0001('cerrado'), 'cs2')).toBe('Ahora no se puede: tienes un torneo de Counter-Strike 2 en curso.');
    expect(gameIdErrorText(p0001('sin_id'))).toBe('Primero pon tu ID de ese juego.');
    expect(gameIdErrorText(p0001('rate_limited', 'rate_limited'))).toBe('Hiciste muchos intentos. Prueba más tarde.');
    expect(gameIdErrorText(p0001('no_permitido', 'permission'))).toBe('No tienes permiso para eso.');
    expect(gameIdErrorText(new BackendError('no_disponible', 'validation', 'no_disponible'))).toContain('no está disponible');
    expect(gameIdErrorText(new BackendError('Failed to fetch', 'network'))).toContain('Sin conexión');
    expect(gameIdErrorText(new BackendError('bloqueada', 'permission', 'bloqueada'))).toContain('bloqueada');
    expect(gameIdErrorText(new Error('algo raro'))).toBe('No se pudo. Prueba otra vez.');
  });
});
