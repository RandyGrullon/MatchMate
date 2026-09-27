import { describe, expect, it } from 'vitest';
import { createFakeBackend } from '../lib/db/fakeBackend';
import { BackendError, type SelectQuery } from '../lib/backend/types';
import {
  DEFAULT_SPORT_STATUS,
  SPORT_STATUS_KEY,
  canCreateSport,
  createSportStatusStore,
  creatableSports,
  fetchSportStatus,
  openSports,
  parseSportStatus,
  preselectedSport,
  sportChoices,
  type SportStatusMap,
} from './status';

const withStatus = (patch: Partial<SportStatusMap>): SportStatusMap => ({ ...DEFAULT_SPORT_STATUS, ...patch });

/** Almacenamiento en memoria (como localStorage). */
function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('estado de los deportes (lo puro)', () => {
  it('por defecto: boliche abierto y lo demás en beta', () => {
    expect(DEFAULT_SPORT_STATUS.bowling).toBe('open');
    expect(Object.entries(DEFAULT_SPORT_STATUS).filter(([, s]) => s !== 'beta').map(([id]) => id)).toEqual(['bowling']);
  });

  it('lee las filas: ignora deportes desconocidos y estados raros; lo que falta queda como estaba', () => {
    const map = parseSportStatus([
      { id: 'padel', status: 'open', family: 'racket', sort_order: 2 },
      { id: 'golf', status: 'closed' },
      { id: 'cricket', status: 'open' },
      { id: 'tennis', status: 'abierto' },
      null,
      'x',
    ]);
    expect(map.padel).toBe('open');
    expect(map.golf).toBe('closed');
    expect(map.tennis).toBe('beta');
    expect(map.bowling).toBe('open');
    expect('cricket' in map).toBe(false);
    // No toca el objeto de por defecto.
    expect(DEFAULT_SPORT_STATUS.padel).toBe('beta');
  });

  it('quién crea: abierto todos, beta el superadmin, cerrado nadie', () => {
    expect(canCreateSport('open', false)).toBe(true);
    expect(canCreateSport('open', true)).toBe(true);
    expect(canCreateSport('beta', false)).toBe(false);
    expect(canCreateSport('beta', true)).toBe(true);
    expect(canCreateSport('closed', false)).toBe(false);
    expect(canCreateSport('closed', true)).toBe(false);
    expect(canCreateSport(undefined, true)).toBe(false);
  });

  it('lo que puede crear cada quien, en el orden del registro', () => {
    expect(creatableSports(DEFAULT_SPORT_STATUS, false)).toEqual(['bowling']);
    expect(creatableSports(DEFAULT_SPORT_STATUS, true)).toEqual(['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal', 'golf', 'swimming']);
    const map = withStatus({ padel: 'open', golf: 'closed' });
    expect(creatableSports(map, false)).toEqual(['bowling', 'padel']);
    expect(creatableSports(map, true)).not.toContain('golf');
  });

  it('selector: una cuenta normal hoy solo ve el boliche; el superadmin todo, con el fútbol en un grupo', () => {
    expect(sportChoices(DEFAULT_SPORT_STATUS, false).map((g) => g.id)).toEqual(['bowling']);
    const all = sportChoices(DEFAULT_SPORT_STATUS, true);
    expect(all.map((g) => g.id)).toEqual(['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'golf', 'swimming']);
    expect(all.find((g) => g.id === 'football')?.sports).toEqual(['football', 'futsal']);
    // Campo abierto y sala en beta: una cuenta normal solo ve la modalidad de campo.
    const partial = sportChoices(withStatus({ football: 'open' }), false);
    expect(partial.find((g) => g.id === 'football')?.sports).toEqual(['football']);
    // Cerrado no sale ni para el superadmin.
    expect(sportChoices(withStatus({ futsal: 'closed' }), true).find((g) => g.id === 'football')?.sports).toEqual(['football']);
  });

  it('marcado de entrada: el boliche; si no se puede, el primero', () => {
    expect(preselectedSport(['bowling', 'padel'])).toBe('bowling');
    expect(preselectedSport(['padel', 'tennis'])).toBe('padel');
    expect(preselectedSport([])).toBeNull();
  });

  it('abiertos al público', () => {
    expect(openSports(DEFAULT_SPORT_STATUS)).toEqual(['bowling']);
    expect(openSports(withStatus({ padel: 'open', bowling: 'closed' }))).toEqual(['padel']);
  });
});

describe('estado de los deportes (copia compartida)', () => {
  function setup(rows: unknown[] | Error, storage: ReturnType<typeof memoryStorage> | null = memoryStorage()) {
    const backend = createFakeBackend();
    const queries: SelectQuery[] = [];
    let clock = 1_000;
    backend.select = (async (q: SelectQuery) => {
      queries.push(q);
      if (rows instanceof Error) throw rows;
      return rows;
    }) as typeof backend.select;
    const store = createSportStatusStore({ backend: () => backend, storage, now: () => clock, staleMs: 60_000 });
    return { store, queries, storage, tick: (ms: number) => (clock += ms) };
  }

  it('sin nada guardado: lo de por defecto mientras carga, y después lo de la base (y lo guarda)', async () => {
    const { store, queries, storage } = setup([{ id: 'padel', status: 'open' }]);
    expect(store.getState()).toMatchObject({ loading: true, fromCache: false, status: DEFAULT_SPORT_STATUS });
    let calls = 0;
    store.subscribe(() => calls++);
    await store.refresh();
    expect(queries).toEqual([{ table: 'sport_status', columns: 'id,status', order: [{ col: 'sort_order' }] }]);
    expect(store.getState()).toMatchObject({ loading: false, error: null, fromCache: false, at: 1_000 });
    expect(store.getState().status.padel).toBe('open');
    expect(calls).toBe(1);
    expect(JSON.parse(storage!.data.get(SPORT_STATUS_KEY)!)).toMatchObject({ padel: 'open', bowling: 'open' });
  });

  it('abre con la copia del teléfono y la vuelve a pedir', async () => {
    const storage = memoryStorage({ [SPORT_STATUS_KEY]: JSON.stringify({ tennis: 'open', cricket: 'open', golf: 'raro' }) });
    const { store, queries } = setup([], storage);
    expect(store.getState()).toMatchObject({ loading: false, fromCache: true, at: 0 });
    expect(store.getState().status.tennis).toBe('open');
    expect(store.getState().status.golf).toBe('beta');
    store.ensureFresh();
    await store.refresh();
    expect(queries.length).toBe(1);
    expect(store.getState().fromCache).toBe(false);
  });

  it('copia dañada: se ignora', () => {
    const { store } = setup([], memoryStorage({ [SPORT_STATUS_KEY]: '{no es json' }));
    expect(store.getState()).toMatchObject({ loading: true, fromCache: false, status: DEFAULT_SPORT_STATUS });
  });

  it('sin señal: se queda con lo que había y avisa el error', async () => {
    const storage = memoryStorage({ [SPORT_STATUS_KEY]: JSON.stringify({ padel: 'open' }) });
    const { store } = setup(new BackendError('sin señal', 'network'), storage);
    await store.refresh();
    expect(store.getState().error?.message).toBe('sin señal');
    expect(store.getState().status.padel).toBe('open');
    expect(store.getState().loading).toBe(false);
  });

  it('una sola consulta a la vez, y no vuelve a pedir mientras esté fresco', async () => {
    const { store, queries, tick } = setup([]);
    store.ensureFresh();
    store.ensureFresh();
    const p = store.refresh();
    await p;
    expect(queries.length).toBe(1);
    store.ensureFresh();
    expect(queries.length).toBe(1);
    tick(61_000);
    store.ensureFresh();
    await store.refresh();
    expect(queries.length).toBe(2);
  });

  it('sin almacenamiento también funciona', async () => {
    const { store } = setup([{ id: 'golf', status: 'open' }], null);
    await store.refresh();
    expect(store.getState().status.golf).toBe('open');
  });
});

describe('estado de los deportes contra la base real (PGlite)', () => {
  const haveMigrations = Object.keys(import.meta.glob('/supabase/migrations/*.sql')).length > 0;
  const haveShim = Object.keys(import.meta.glob('/supabase/local/shim.sql')).length > 0;

  it.skipIf(!haveMigrations || !haveShim)(
    'un visitante sin cuenta lee sport_status y sale lo de por defecto',
    async () => {
      const [{ createLocalBackend }, { loadLocalSql }] = await Promise.all([import('../lib/backend/local'), import('../lib/backend/migrations')]);
      const b = await createLocalBackend({ sql: loadLocalSql() });
      try {
        expect(await fetchSportStatus(b)).toEqual(DEFAULT_SPORT_STATUS);
      } finally {
        await b.close();
      }
    },
    120_000,
  );

  it.skipIf(!haveMigrations || !haveShim)(
    'demo local: la primera cuenta es superadmin (abre los deportes en beta); las siguientes no',
    async () => {
      const [{ createLocalBackend }, { loadLocalSql }] = await Promise.all([import('../lib/backend/local'), import('../lib/backend/migrations')]);
      const b = await createLocalBackend({ sql: loadLocalSql(), firstUserIsSuper: true, sessionStore: { get: () => null, set: () => undefined } });
      try {
        const first = (await b.auth.signUp('uno@example.com', 'secreto1', 'Uno', { adult: true }))!.userId;
        await b.rpc('set_sport_status', { p_sport: 'golf', p_status: 'open' });
        await b.auth.signOut();
        const second = (await b.auth.signUp('dos@example.com', 'secreto2', 'Dos', { adult: true }))!.userId;
        const rows = await b.db.query<{ id: string; is_superadmin: boolean }>('select id, is_superadmin from public.profiles order by email desc');
        expect(rows.rows).toEqual([
          { id: first, is_superadmin: true },
          { id: second, is_superadmin: false },
        ]);
        expect((await fetchSportStatus(b)).golf).toBe('open');
        await expect(b.rpc('set_sport_status', { p_sport: 'golf', p_status: 'beta' })).rejects.toBeInstanceOf(BackendError);
      } finally {
        await b.close();
      }
    },
    120_000,
  );
});
