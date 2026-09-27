import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applySelect, createSupabaseBackend, LAST_SESSION_KEY } from './supabase';
import { BackendError, type AuthEvent, type Backend, type RealtimeMessage, type Session } from './types';

type Res = { data: unknown; error: unknown; status?: number };
type AuthCb = (event: string, session: unknown) => void;

/** Cliente de supabase-js simulado: anota las llamadas y responde lo que diga cada prueba. */
function mockClient() {
  const calls: unknown[][] = [];
  let next: Res = { data: [], error: null, status: 200 };
  // Respuestas en orden (una por pedido); cuando se acaban, `next`.
  const queue: Res[] = [];
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'contains', 'order', 'limit', 'range']) {
      b[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return b;
      };
    }
    b.maybeSingle = () => {
      calls.push(['maybeSingle']);
      return Promise.resolve(profileRes);
    };
    b.then = (ok: (r: Res) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(queue.shift() ?? next).then(ok, fail);
    return b;
  };
  let profileRes: Res = { data: { name: 'Ana Perfil' }, error: null };
  const authCbs: AuthCb[] = [];
  const channels: { topic: string; opts: unknown; handlers: ((m: unknown) => void)[]; subscribed: boolean }[] = [];
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return {
        select: (cols: string) => {
          calls.push(['select', cols]);
          return builder();
        },
      };
    },
    rpc: vi.fn(async (_fn: string, _args: unknown) => next),
    auth: {
      onAuthStateChange: (cb: AuthCb) => {
        authCbs.push(cb);
        return { data: { subscription: { unsubscribe: () => authCbs.splice(authCbs.indexOf(cb), 1) } } };
      },
      getSession: vi.fn(async (): Promise<Res> => ({ data: { session: null }, error: null })),
      signUp: vi.fn(async (_x: unknown): Promise<Res> => ({ data: { user: null, session: null }, error: null })),
      signInWithPassword: vi.fn(async (_x: unknown): Promise<Res> => ({ data: { session: null }, error: null })),
      signInWithOAuth: vi.fn(async (_x: unknown): Promise<Res> => ({ data: {}, error: null })),
      signOut: vi.fn(async (_x: unknown): Promise<Res> => ({ data: null, error: null })),
      resetPasswordForEmail: vi.fn(async (_e: string, _o: unknown): Promise<Res> => ({ data: {}, error: null })),
      updateUser: vi.fn(async (_x: unknown): Promise<Res> => ({ data: {}, error: null })),
    },
    realtime: { setAuth: vi.fn(async (_t?: string | null) => undefined) },
    channel: vi.fn((topic: string, opts: unknown) => {
      const ch = {
        topic,
        opts,
        handlers: [] as ((m: unknown) => void)[],
        subscribed: false,
        on(_type: string, _filter: unknown, cb: (m: unknown) => void) {
          ch.handlers.push(cb);
          return ch;
        },
        subscribe() {
          ch.subscribed = true;
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    }),
    removeChannel: vi.fn(async (_ch: unknown) => 'ok'),
    storage: {
      from: vi.fn((_bucket: string) => ({
        upload: vi.fn(async (_p: string, _d: unknown, _o: unknown): Promise<Res> => storageRes),
        createSignedUrl: vi.fn(async (_p: string, _s: number): Promise<Res> => storageRes),
        remove: vi.fn(async (_p: string[]): Promise<Res> => storageRes),
      })),
    },
    functions: { invoke: vi.fn(async (_fn: string, _o: unknown): Promise<Res> => next) },
  };
  let storageRes: Res = { data: null, error: null };
  return {
    client,
    calls,
    channels,
    authCbs,
    respond: (r: Res) => void (next = r),
    respondPages: (...r: Res[]) => void queue.push(...r),
    respondProfile: (r: Res) => void (profileRes = r),
    respondStorage: (r: Res) => void (storageRes = r),
    fire: (event: string, session: unknown) => [...authCbs].forEach((cb) => cb(event, session)),
  };
}

const create = (m: ReturnType<typeof mockClient>): Backend =>
  createSupabaseBackend({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', client: m.client as unknown as SupabaseClient });

const sbSession = (id = 'u1', token = 't1') => ({ access_token: token, user: { id, email: `${id}@example.com`, user_metadata: { name: 'Meta' } } });

const fail = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(BackendError);
  return e as BackendError;
};

const flush = () => new Promise((r) => setTimeout(r, 30));

describe('select → PostgREST', () => {
  const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}` }));

  it('de a páginas de 500 con orden fijo hasta traer todo (Supabase corta en max_rows)', async () => {
    const m = mockClient();
    const b = create(m);
    m.respondPages({ data: rows(500), error: null }, { data: rows(500, 500), error: null }, { data: rows(3, 1000), error: null });
    const out = await b.select({ table: 'entries', filters: [{ col: 'league_id', op: 'eq', value: 'l1' }], order: [{ col: 'date', asc: false }] });
    expect(out).toHaveLength(1003);
    expect(m.calls.filter((c) => c[0] === 'range')).toEqual([
      ['range', 0, 499],
      ['range', 500, 999],
      ['range', 1000, 1499],
    ]);
    // El orden pedido y la clave al final como desempate.
    expect(m.calls.filter((c) => c[0] === 'order').slice(0, 2)).toEqual([
      ['order', 'date', { ascending: false }],
      ['order', 'id', { ascending: true }],
    ]);
  });

  it('tablas sin id: desempata por su clave; con límite chico, un solo pedido sin páginas', async () => {
    const m = mockClient();
    const b = create(m);
    m.respondPages({ data: rows(2), error: null });
    await b.select({ table: 'event_rsvps' });
    expect(m.calls.filter((c) => c[0] === 'order')).toEqual([
      ['order', 'event_id', { ascending: true }],
      ['order', 'player_id', { ascending: true }],
    ]);
    const m2 = mockClient();
    const b2 = create(m2);
    await b2.select({ table: 'events', limit: 20 });
    expect(m2.calls.some((c) => c[0] === 'range')).toBe(false);
    expect(m2.calls.filter((c) => c[0] === 'limit')).toEqual([['limit', 20]]);
  });

  it('límite mayor que una página: pide solo lo que falta', async () => {
    const m = mockClient();
    const b = create(m);
    m.respondPages({ data: rows(500), error: null }, { data: rows(200, 500), error: null });
    expect(await b.select({ table: 'matches', limit: 700 })).toHaveLength(700);
    expect(m.calls.filter((c) => c[0] === 'range')).toEqual([
      ['range', 0, 499],
      ['range', 500, 699],
    ]);
  });

  it('traduce columnas, filtros, orden y límite', () => {
    const m = mockClient();
    const when = new Date('2026-09-26T12:00:00Z');
    applySelect(m.client as unknown as SupabaseClient, {
      table: 'events',
      columns: 'id, name,starts_at',
      filters: [
        { col: 'league_id', op: 'eq', value: 'L1' },
        { col: 'status', op: 'neq', value: 'draft' },
        { col: 'n', op: 'gt', value: 1 },
        { col: 'n', op: 'gte', value: 2 },
        { col: 'n', op: 'lt', value: 9 },
        { col: 'starts_at', op: 'lte', value: when },
        { col: 'id', op: 'in', value: ['a', 'b'] },
        { col: 'deleted_at', op: 'is', value: null },
        { col: 'tags', op: 'contains', value: ['x'] },
      ],
      order: [{ col: 'starts_at', asc: false }, { col: 'name' }],
      limit: 50,
    });
    expect(m.calls).toEqual([
      ['from', 'events'],
      ['select', 'id,name,starts_at'],
      ['eq', 'league_id', 'L1'],
      ['neq', 'status', 'draft'],
      ['gt', 'n', 1],
      ['gte', 'n', 2],
      ['lt', 'n', 9],
      ['lte', 'starts_at', '2026-09-26T12:00:00.000Z'],
      ['in', 'id', ['a', 'b']],
      ['is', 'deleted_at', null],
      ['contains', 'tags', ['x']],
      ['order', 'starts_at', { ascending: false }],
      ['order', 'name', { ascending: true }],
      ['limit', 50],
    ]);
  });

  it('valida antes de llamar a la red', async () => {
    const m = mockClient();
    const b = create(m);
    expect((await fail(b.select({ table: 'Events' }))).kind).toBe('validation');
    expect((await fail(b.select({ table: 'events', columns: 'profiles(name)' }))).kind).toBe('validation');
    expect((await fail(b.select({ table: 'events', filters: [{ col: 'a', op: 'eq', value: undefined }] }))).kind).toBe('validation');
    expect(m.calls.filter((c) => c[0] === 'from')).toEqual([]);
  });

  it('devuelve las filas y traduce los errores', async () => {
    const m = mockClient();
    const b = create(m);
    m.respond({ data: [{ id: 1 }], error: null, status: 200 });
    expect(await b.select({ table: 'events' })).toEqual([{ id: 1 }]);

    m.respond({ data: null, error: { code: '42501', message: 'permission denied for table events' }, status: 403 });
    expect((await fail(b.select({ table: 'events' }))).kind).toBe('permission');

    m.respond({ data: null, error: { code: '', message: 'TypeError: fetch failed', details: '', hint: '' }, status: 0 });
    const net = await fail(b.select({ table: 'events' }));
    expect(net.kind).toBe('network');
    expect(net.retryable).toBe(true);

    m.respond({ data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 });
    expect((await fail(b.select({ table: 'events' }))).kind).toBe('auth');

    m.respond({ data: null, error: { message: 'Bad gateway' }, status: 502 });
    expect(await fail(b.select({ table: 'events' }))).toMatchObject({ kind: 'network', retryable: true });
  });
});

describe('rpc', () => {
  it('manda los argumentos por nombre y devuelve data (null en void)', async () => {
    const m = mockClient();
    const b = create(m);
    m.respond({ data: 'uuid-1', error: null, status: 200 });
    expect(await b.rpc('create_league', { p_name: 'Liga' })).toBe('uuid-1');
    expect(m.client.rpc).toHaveBeenLastCalledWith('create_league', { p_name: 'Liga' });
    m.respond({ data: null, error: null, status: 204 });
    expect(await b.rpc('touch')).toBeNull();
    expect(m.client.rpc).toHaveBeenLastCalledWith('touch', {});
  });

  it.each([
    [{ code: 'P0001', message: 'rate_limited' }, 400, 'rate_limited', false],
    [{ code: 'P0001', message: 'invalido: nombre' }, 400, 'validation', false],
    [{ code: 'P0001', message: 'cerrado' }, 400, 'validation', false],
    [{ code: 'P0001', message: 'no_permitido' }, 400, 'permission', false],
    [{ code: 'P0001', message: 'no_existe' }, 400, 'not_found', false],
    [{ code: 'P0001', message: 'duplicado' }, 400, 'conflict', false],
    [{ code: '42501', message: 'permission denied for function x' }, 403, 'permission', false],
    [{ code: '23505', message: 'duplicate key' }, 409, 'conflict', false],
    [{ code: '23514', message: 'check violation' }, 400, 'validation', false],
    [{ code: '22P02', message: 'invalid input syntax for type uuid' }, 400, 'validation', false],
    [{ code: 'PGRST116', message: 'no rows' }, 406, 'not_found', false],
    [{ code: 'PGRST202', message: 'Could not find the function' }, 404, 'not_found', false],
    [{ code: 'PGRST002', message: 'schema cache' }, 503, 'network', true],
    [{ code: '40001', message: 'could not serialize' }, 500, 'unknown', true],
  ])('%o → %s', async (error, status, kind, retryable) => {
    const m = mockClient();
    const b = create(m);
    m.respond({ data: null, error, status });
    const e = await fail(b.rpc('x'));
    expect(e.kind).toBe(kind);
    expect(e.retryable).toBe(retryable);
    expect(e.code).toBe(error.code);
    expect(e.message).toBe(error.message);
  });

  it('nombres de función o argumento inválidos no salen a la red', async () => {
    const m = mockClient();
    const b = create(m);
    expect((await fail(b.rpc('Crear liga'))).kind).toBe('validation');
    expect((await fail(b.rpc('create_league', { 'p name': 1 }))).kind).toBe('validation');
    expect(m.client.rpc).not.toHaveBeenCalled();
  });

  it('si la llamada misma revienta sin señal, es de red', async () => {
    const m = mockClient();
    m.client.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await fail(create(m).rpc('x'))).kind).toBe('network');
  });
});

describe('tiempo real', () => {
  it('un canal privado por tema, compartido y contado', async () => {
    const m = mockClient();
    const b = create(m);
    const a: RealtimeMessage[] = [];
    const c: RealtimeMessage[] = [];
    const offA = b.subscribe('event:1', (msg) => a.push(msg));
    const offC = b.subscribe('event:1', (msg) => c.push(msg));
    await vi.waitFor(() => expect(m.channels).toHaveLength(1));
    expect(m.client.realtime.setAuth).toHaveBeenCalled();
    expect(m.channels).toHaveLength(1);
    expect(m.channels[0]).toMatchObject({ topic: 'event:1', opts: { config: { private: true } }, subscribed: true });

    m.channels[0].handlers.forEach((h) => h({ type: 'broadcast', event: 'live', payload: { v: 3 } }));
    expect(a).toEqual([{ event: 'live', payload: { v: 3 } }]);
    expect(c).toEqual([{ event: 'live', payload: { v: 3 } }]);

    offA();
    offA(); // cancelar dos veces no descuenta de más
    expect(m.client.removeChannel).not.toHaveBeenCalled();
    offC();
    expect(m.client.removeChannel).toHaveBeenCalledTimes(1);

    // Volver a suscribirse abre un canal nuevo después de cerrar el viejo.
    const offD = b.subscribe('event:1', () => undefined);
    await vi.waitFor(() => expect(m.channels).toHaveLength(2));
    expect(m.channels).toHaveLength(2);
    offD();
  });

  it('cancelar antes de que abra no deja canal abierto', async () => {
    const m = mockClient();
    const b = create(m);
    b.subscribe('event:2', () => undefined)();
    await flush();
    expect(m.channels).toHaveLength(0);
    expect(m.client.removeChannel).not.toHaveBeenCalled();
  });

  it('TOKEN_REFRESHED pasa el token nuevo al socket', () => {
    const m = mockClient();
    create(m);
    m.fire('TOKEN_REFRESHED', sbSession('u1', 'nuevo'));
    expect(m.client.realtime.setAuth).toHaveBeenCalledWith('nuevo');
  });
});

describe('cuentas', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
    vi.stubGlobal('window', { location: { origin: 'https://matchmate.test' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getSession con el nombre del perfil, leído una sola vez', async () => {
    const m = mockClient();
    const b = create(m);
    m.client.auth.getSession.mockResolvedValue({ data: { session: sbSession() }, error: null });
    const s = await b.auth.getSession();
    expect(s).toEqual({ userId: 'u1', email: 'u1@example.com', name: 'Ana Perfil' });
    await b.auth.getSession();
    expect(m.calls.filter((c) => c[0] === 'maybeSingle')).toHaveLength(1);
    expect(m.calls).toContainEqual(['from', 'profiles']);
    expect(m.calls).toContainEqual(['eq', 'id', 'u1']);
  });

  it('sin perfil usa el nombre del registro; sin señal y con el token vencido, la última sesión conocida', async () => {
    const m = mockClient();
    const b = create(m);
    m.respondProfile({ data: null, error: null });
    m.client.auth.getSession.mockResolvedValue({ data: { session: sbSession('u2') }, error: null });
    expect((await b.auth.getSession())?.name).toBe('Meta');
    m.client.auth.getSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });
    expect(await b.auth.getSession()).toEqual({ userId: 'u2', email: 'u2@example.com', name: 'Meta' });
    m.client.auth.getSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', code: 'refresh_token_not_found', status: 400 } });
    expect(await b.auth.getSession()).toBeNull();
    m.fire('SIGNED_OUT', null);
    expect(localStorage.getItem(LAST_SESSION_KEY)).toBeNull();
  });

  it('signUp manda el nombre y devuelve null si hay que confirmar el correo', async () => {
    const m = mockClient();
    const b = create(m);
    m.client.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u3', identities: [{}] }, session: null }, error: null });
    expect(await b.auth.signUp(' ana@example.com ', 'secreto1', ' Ana ')).toBeNull();
    expect(m.client.auth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secreto1',
      options: { data: { name: 'Ana' }, emailRedirectTo: 'https://matchmate.test' },
    });
    // Correo ya registrado (Supabase lo disimula devolviendo un usuario sin identidades).
    m.client.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u4', identities: [] }, session: null }, error: null });
    expect(await fail(b.auth.signUp('ana@example.com', 'secreto1', 'Ana'))).toMatchObject({ kind: 'conflict', code: 'email_exists' });
    // Con sesión: entra de una vez, con el nombre que puso (sin ir al perfil).
    m.client.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u5', identities: [{}] }, session: sbSession('u5') }, error: null });
    expect(await b.auth.signUp('b@example.com', 'secreto1', 'Beto')).toEqual({ userId: 'u5', email: 'u5@example.com', name: 'Beto' });
    expect(m.calls.filter((c) => c[0] === 'maybeSingle')).toHaveLength(0);
  });

  it('errores de Auth con mensaje en español', async () => {
    const m = mockClient();
    const b = create(m);
    m.client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } });
    expect(await fail(b.auth.signIn('a@example.com', 'x'))).toMatchObject({ kind: 'auth', code: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
    m.client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });
    expect(await fail(b.auth.signIn('a@example.com', 'x'))).toMatchObject({ kind: 'network', retryable: true });
    m.client.auth.updateUser.mockResolvedValueOnce({ data: {}, error: { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, message: 'weak' } });
    expect(await fail(b.auth.updatePassword('1'))).toMatchObject({ kind: 'validation', code: 'weak_password' });
    m.client.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429, message: 'x' } });
    expect(await fail(b.auth.resetPassword('a@example.com'))).toMatchObject({ kind: 'rate_limited' });
  });

  it('Google redirige al origen; recuperar vuelve a /cuenta?recuperar=1; salir es solo en este teléfono', async () => {
    const m = mockClient();
    const b = create(m);
    await b.auth.signInWithGoogle();
    expect(m.client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://matchmate.test', queryParams: { prompt: 'select_account' } },
    });
    await b.auth.resetPassword(' ana@example.com ');
    expect(m.client.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', { redirectTo: 'https://matchmate.test/cuenta?recuperar=1' });
    await b.auth.signOut();
    expect(m.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('onChange: eventos en orden, con la sesión mapeada, sin INITIAL_SESSION', async () => {
    const m = mockClient();
    const b = create(m);
    const got: [AuthEvent, Session | null][] = [];
    const off = b.auth.onChange((e, s) => got.push([e, s]));
    m.fire('INITIAL_SESSION', sbSession());
    m.fire('SIGNED_IN', sbSession());
    m.fire('SIGNED_OUT', null);
    m.fire('PASSWORD_RECOVERY', sbSession());
    await vi.waitFor(() => expect(got).toHaveLength(3));
    expect(got.map(([e]) => e)).toEqual(['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY']);
    expect(got[0][1]).toEqual({ userId: 'u1', email: 'u1@example.com', name: 'Ana Perfil' });
    expect(got[1][1]).toBeNull();
    off();
    m.fire('SIGNED_IN', sbSession());
    await flush();
    expect(got).toHaveLength(3);
  });
});

describe('archivos y funciones', () => {
  it('subir: repetir la misma ruta cuenta como hecho; RLS es permiso', async () => {
    const m = mockClient();
    const b = create(m);
    const blob = new Blob(['x'], { type: 'image/webp' });
    await b.storage.upload('scoreboards', 'l/p.webp', blob, 'image/webp');
    m.respondStorage({ data: null, error: { name: 'StorageApiError', message: 'The resource already exists', status: 409, statusCode: '409' } });
    await b.storage.upload('scoreboards', 'l/p.webp', blob, 'image/webp');
    m.respondStorage({ data: null, error: { name: 'StorageApiError', message: 'new row violates row-level security policy', status: 400, statusCode: '403' } });
    expect((await fail(b.storage.upload('scoreboards', 'l/p.webp', blob, 'image/webp'))).kind).toBe('permission');
    m.respondStorage({ data: null, error: { name: 'StorageApiError', message: 'Object not found', status: 400, statusCode: '404' } });
    expect((await fail(b.storage.signedUrl('scoreboards', 'l/x.webp'))).kind).toBe('not_found');
    m.respondStorage({ data: { signedUrl: 'https://x/sign?token=1' }, error: null });
    expect(await b.storage.signedUrl('scoreboards', 'l/p.webp')).toBe('https://x/sign?token=1');
    const bucket = m.client.storage.from.mock.results.at(-1)!.value as { createSignedUrl: ReturnType<typeof vi.fn> };
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('l/p.webp', 3600);
  });

  it('invoke: datos o errores traducidos (cuerpo {error})', async () => {
    const m = mockClient();
    const b = create(m);
    m.respond({ data: { rows: [] }, error: null });
    expect(await b.invoke('scan-bowling', { photo: 'p' })).toEqual({ rows: [] });
    expect(m.client.functions.invoke).toHaveBeenCalledWith('scan-bowling', { body: { photo: 'p' } });

    const httpError = (status: number, body: unknown) => ({
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: { status, json: async () => body },
    });
    m.respond({ data: null, error: httpError(429, { error: 'rate_limited' }) });
    expect((await fail(b.invoke('scan-bowling', {}))).kind).toBe('rate_limited');
    m.respond({ data: null, error: httpError(400, { error: 'foto ilegible' }) });
    expect(await fail(b.invoke('scan-bowling', {}))).toMatchObject({ kind: 'validation', message: 'foto ilegible' });
    m.respond({ data: null, error: httpError(401, {}) });
    expect((await fail(b.invoke('scan-bowling', {}))).kind).toBe('auth');
    m.respond({ data: null, error: httpError(504, null) });
    expect(await fail(b.invoke('scan-bowling', {}))).toMatchObject({ kind: 'network', retryable: true });
    m.respond({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
    expect((await fail(b.invoke('scan-bowling', {}))).kind).toBe('network');
  });

  it('online() sigue a navigator.onLine', () => {
    const b = create(mockClient());
    vi.stubGlobal('navigator', { onLine: false });
    expect(b.online()).toBe(false);
    vi.stubGlobal('navigator', { onLine: true });
    expect(b.online()).toBe(true);
    vi.unstubAllGlobals();
  });
});
