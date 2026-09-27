/**
 * El destino Supabase con el supabase-js de verdad y un servidor falso (fetch): revisa las peticiones que salen
 * (API de admin de Auth, upsert de PostgREST, Storage) sin tocar internet.
 */
import { describe, expect, it } from 'vitest';
import { createNodeClient, createSupabaseTarget } from './target';
import type { UserPlan } from './types';

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

const URL_ = 'https://proyecto.supabase.co';

/** supabase-js con un fetch que anota cada petición y responde con `route`. */
function fake(route: (c: Call) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined) {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const text = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Binario (foto).
    }
    const call = { method: req.method, path: u.pathname, query: u.searchParams, headers: req.headers, body };
    calls.push(call);
    const r = route(call) ?? { status: 200, body: [] };
    return new Response(r.body === undefined || req.method === 'HEAD' ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  const client = createNodeClient(URL_, 'sb_secret_prueba', fetchFn as typeof fetch);
  return { calls, target: createSupabaseTarget({ url: URL_, secretKey: 'sb_secret_prueba', client }) };
}

const USER: UserPlan = {
  id: '5b1f8a52-2f0e-5a7e-9c43-2a1b0c9d8e7f',
  firebaseUid: 'uLuis',
  email: 'luis@bowling.do',
  name: 'Luis',
  emailConfirmed: false,
  passwordHash: '$fbscrypt$v=1,n=14,r=8,p=1,ss=Bw==,sk=abc=$c2Fs$aGFzaA==',
  providers: ['password'],
  banned: true,
  isSuperadmin: false,
  createdAt: '2025-10-03T12:00:00.000Z',
  existing: false,
};

describe('destino Supabase', () => {
  it('crea la cuenta con su id, el hash de Firebase, sin confirmar y bloqueada', async () => {
    const { calls, target } = fake((c) => (c.path === '/auth/v1/admin/users' && c.method === 'POST' ? { body: { id: USER.id, email: USER.email } } : undefined));
    expect(await target.createUser(USER)).toBe('created');
    expect(calls[0].body).toEqual({
      id: USER.id,
      email: USER.email,
      email_confirm: false,
      password_hash: USER.passwordHash,
      user_metadata: { name: 'Luis' },
      app_metadata: { firebase_uid: 'uLuis' },
      ban_duration: '876000h',
    });
    // Google (sin hash): sin password_hash.
    await target.createUser({ ...USER, passwordHash: null, banned: false, emailConfirmed: true });
    expect(calls[1].body).toEqual({ id: USER.id, email: USER.email, email_confirm: true, user_metadata: { name: 'Luis' }, app_metadata: { firebase_uid: 'uLuis' } });
  });

  it('si la cuenta ya está (mismo id) no falla', async () => {
    const { target } = fake((c) =>
      c.method === 'POST'
        ? { status: 422, body: { code: 'email_exists', msg: 'A user with this email address has already been registered' } }
        : { body: { id: USER.id, email: USER.email } },
    );
    expect(await target.createUser(USER)).toBe('exists');
  });

  it('lista todas las cuentas por páginas', async () => {
    const { calls, target } = fake((c) => {
      const page = Number(c.query.get('page'));
      return { body: { users: page <= 2 ? [{ id: `u${page}`, email: `u${page}@x.do` }] : [], aud: 'authenticated' } };
    });
    expect(await target.listUsers()).toEqual([
      { id: 'u1', email: 'u1@x.do' },
      { id: 'u2', email: 'u2@x.do' },
    ]);
    expect(calls).toHaveLength(3);
  });

  it('upsert por la clave de la tabla, en lotes de 500', async () => {
    const { calls, target } = fake(() => ({ status: 201 }));
    const rows = Array.from({ length: 1001 }, (_, i) => ({ event_id: 'e', player_id: `p${i}`, league_id: 'l', going: true, created_at: 'x' }));
    await target.upsert('event_rsvps', rows);
    expect(calls.map((c) => [c.method, c.path, c.query.get('on_conflict'), (c.body as unknown[]).length])).toEqual([
      ['POST', '/rest/v1/event_rsvps', 'event_id,player_id', 500],
      ['POST', '/rest/v1/event_rsvps', 'event_id,player_id', 500],
      ['POST', '/rest/v1/event_rsvps', 'event_id,player_id', 1],
    ]);
    expect(calls[0].headers.get('prefer')).toContain('resolution=merge-duplicates');
  });

  it('un error de PostgREST sale con la tabla y el código', async () => {
    const { target } = fake(() => ({ status: 409, body: { code: '23505', message: 'duplicate key value', details: 'Key (invite_code)=(ABCD2345) already exists.' } }));
    await expect(target.upsert('league_secrets', [{ league_id: 'l', invite_code: 'ABCD2345' }])).rejects.toThrow(/league_secrets: duplicate key value \[23505\]/);
  });

  it('fotos: lista lo que ya está, sube lo nuevo y no falla si ya existía', async () => {
    const { calls, target } = fake((c) => {
      if (c.path === '/storage/v1/object/list/scoreboards') {
        return { body: (c.body as { offset: number }).offset === 0 ? [{ name: 'a.jpg' }, { name: 'b.jpg' }] : [] };
      }
      if (c.path.endsWith('/dup.jpg')) return { status: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } };
      return { body: { Key: 'scoreboards/x' } };
    });
    expect([...(await target.existingFiles('scoreboards', ['L1']))]).toEqual(['L1/a.jpg', 'L1/b.jpg']);
    const file = { bucket: 'scoreboards' as const, path: 'L1/c.jpg', contentType: 'image/jpeg' as const, bytes: 3, source: { dataUrl: '' } };
    await target.upload(file, new Uint8Array([1, 2, 3]));
    const up = calls.find((c) => c.path === '/storage/v1/object/scoreboards/L1/c.jpg')!;
    expect(up.method).toBe('POST');
    expect(up.headers.get('content-type')).toBe('image/jpeg');
    await expect(target.upload({ ...file, path: 'L1/dup.jpg' }, new Uint8Array([1]))).resolves.toBeUndefined();
  });

  it('cuenta filas de las ligas migradas (y perfiles con firebase_uid)', async () => {
    const { calls, target } = fake(() => ({ status: 200, headers: { 'content-range': '0-13/14' } }));
    expect(await target.count('entries', ['l1', 'l2'])).toBe(14);
    expect(calls[0].method).toBe('HEAD');
    expect(calls[0].query.get('league_id')).toBe('in.(l1,l2)');
    await target.count('profiles', []);
    expect(calls[1].query.get('firebase_uid')).toBe('not.is.null');
    await target.count('leagues', ['l1']);
    expect(calls[2].query.get('id')).toBe('in.(l1)');
  });

  it('lee por páginas hasta una vacía (aunque max_rows corte antes)', async () => {
    const { calls, target } = fake((c) => {
      const [from] = (c.headers.get('range') ?? c.query.get('offset') ?? '0').split('-').map(Number);
      return { body: from < 3 ? [{ id: `r${from}` }, { id: `r${from + 1}` }] : [] };
    });
    const rows = await target.read('players', ['l1']);
    expect(rows.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3']);
    expect(calls).toHaveLength(3);
  });
});
