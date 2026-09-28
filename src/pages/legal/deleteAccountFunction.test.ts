import { describe, expect, it, vi } from 'vitest';
import {
  CONFIRM_WORD,
  corsHeaders,
  deleteFailure,
  explainDeleteError,
  handleDeleteRequest,
  isDeleteConfirmation,
  LAST_SUPER,
  OWNED,
  parseDeleteBody,
  parseOrigins,
  planBlocker,
  prepareFailure,
  SERVER,
  SESSION,
  type DeleteDeps,
  type DepError,
} from '../../../supabase/functions/delete-account/core';

// Pruebas de la Edge Function delete-account (su lógica vive en supabase/functions/delete-account/core.ts).

const APP = 'https://matchmate.vercel.app';
const USER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'aaa.bbb.ccc';
const OK_PLAN = { canDelete: true, blockers: [], ownedLeagues: [], summary: { leagues: 1 } };
const OWNER_PLAN = { canDelete: false, blockers: ['owned_leagues'], ownedLeagues: [{ id: 'l1', name: 'Liga', members: [] }] };

function deps(patch: Partial<DeleteDeps> = {}): DeleteDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    allowedOrigins: [APP],
    configError: null,
    getClaims: async (token) => {
      calls.push(`claims:${token}`);
      return { data: { claims: { sub: USER, role: 'authenticated' } }, error: null };
    },
    prepare: async (token) => {
      calls.push(`prepare:${token}`);
      return { data: OK_PLAN, error: null };
    },
    deleteUser: async (id) => {
      calls.push(`delete:${id}`);
      return { error: null };
    },
    ...patch,
  };
}

function req(opts: { method?: string; origin?: string | null; auth?: string | null; body?: unknown } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.origin !== null) headers.set('origin', opts.origin ?? APP);
  if (opts.auth !== null) headers.set('authorization', opts.auth ?? `Bearer ${TOKEN}`);
  const method = opts.method ?? 'POST';
  const body = method === 'POST' || method === 'PUT' ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? { confirm: CONFIRM_WORD })) : undefined;
  return new Request('https://x.supabase.co/functions/v1/delete-account', { method, headers, body });
}

const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe('ayudas', () => {
  it('orígenes: exactos, sin barra final ni repetidos; CORS solo para esos', () => {
    expect(parseOrigins(` ${APP}/, http://localhost:5173 ,${APP} nada`)).toEqual([APP, 'http://localhost:5173']);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(corsHeaders(APP, [APP])).toMatchObject({ 'access-control-allow-origin': APP, vary: 'Origin' });
    expect(corsHeaders('https://otro.com', [APP])).toBeNull();
    expect(corsHeaders(null, [APP])).toBeNull();
  });

  it('confirmación: solo {confirm: "BORRAR"}', () => {
    expect(isDeleteConfirmation({ confirm: 'BORRAR' })).toBe(true);
    for (const bad of [null, [], 'BORRAR', { confirm: 'borrar' }, { confirm: true }, {}]) expect(isDeleteConfirmation(bad)).toBe(false);
    expect(parseDeleteBody('{"confirm":"BORRAR"}')).toBe(true);
    expect(parseDeleteBody('no es json')).toBe(false);
  });

  it('plan: se puede, tiene ligas, último superadmin o algo raro', () => {
    expect(planBlocker(OK_PLAN)).toBeNull();
    expect(planBlocker(OWNER_PLAN)).toEqual({ ...OWNED, plan: OWNER_PLAN });
    const lastSuper = { canDelete: false, blockers: ['last_superadmin'] };
    expect(planBlocker(lastSuper)).toEqual({ ...LAST_SUPER, plan: lastSuper });
    // Las dos cosas: primero las ligas.
    expect(planBlocker({ canDelete: false, blockers: ['owned_leagues', 'last_superadmin'] })?.code).toBe('tiene_ligas');
    expect(planBlocker(null)).toBe(SERVER);
    expect(planBlocker('x')).toBe(SERVER);
  });

  it('errores al preparar y al borrar', () => {
    expect(prepareFailure({ message: 'bloqueada', code: '42501' })).toEqual({ code: 'bloqueada', message: 'bloqueada' });
    expect(prepareFailure({ message: 'no_permitido', code: '42501' })).toBe(SESSION);
    expect(prepareFailure({ message: 'JWT expired', code: 'PGRST301' })).toBe(SESSION);
    expect(prepareFailure({ message: 'boom', code: 'XX000' })).toBe(SERVER);
    expect(deleteFailure({ status: 404, message: 'User not found' }).code).toBe('sesion');
    expect(deleteFailure({ message: 'update or delete on table "profiles" violates foreign key constraint "leagues_owner_id_fkey"' })).toBe(OWNED);
    expect(deleteFailure({ status: 500, message: 'Database error deleting user' })).toBe(SERVER);
  });

  it('un borrado que falló sin decir por qué: se revisa el plan otra vez', async () => {
    const e: DepError = { status: 500, message: 'Database error deleting user' };
    expect(await explainDeleteError({ prepare: async () => ({ data: OWNER_PLAN, error: null }) }, TOKEN, e)).toMatchObject({ code: 'tiene_ligas' });
    expect(await explainDeleteError({ prepare: async () => ({ data: OK_PLAN, error: null }) }, TOKEN, e)).toBe(SERVER);
    expect(await explainDeleteError({ prepare: async () => ({ data: null, error: { message: 'x' } }) }, TOKEN, e)).toBe(SERVER);
    expect(await explainDeleteError({ prepare: () => Promise.reject(new Error('red')) }, TOKEN, e)).toBe(SERVER);
  });
});

describe('la función', () => {
  it('borra: valida el JWT, prepara como la cuenta y borra con la API de administración', async () => {
    const d = deps();
    const res = await handleDeleteRequest(req(), d);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ deleted: true });
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(d.calls).toEqual([`claims:${TOKEN}`, `prepare:${TOKEN}`, `delete:${USER}`]);
  });

  it('preflight de la app: 204 con CORS; otra página: 403 sin tocar nada', async () => {
    const d = deps();
    const pre = await handleDeleteRequest(req({ method: 'OPTIONS' }), d);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    const other = await handleDeleteRequest(req({ origin: 'https://malo.com' }), d);
    expect(other.status).toBe(403);
    expect(d.calls).toEqual([]);
  });

  it('solo POST', async () => {
    const res = await handleDeleteRequest(req({ method: 'GET' }), deps());
    expect(res.status).toBe(405);
  });

  it('sin configurar: 500 con un mensaje claro', async () => {
    const res = await handleDeleteRequest(req(), deps({ configError: 'falta la clave secreta' }));
    expect(res.status).toBe(500);
    expect(await json(res)).toMatchObject({ code: 'config' });
  });

  it('sin sesión, JWT raro, anónimo o de otro rol: 401', async () => {
    expect((await handleDeleteRequest(req({ auth: null }), deps())).status).toBe(401);
    expect((await handleDeleteRequest(req({ auth: 'Bearer nada' }), deps())).status).toBe(401);
    for (const claims of [{ sub: USER, role: 'anon' }, { sub: 'no-uuid', role: 'authenticated' }, { sub: USER, role: 'authenticated', is_anonymous: true }]) {
      const res = await handleDeleteRequest(req(), deps({ getClaims: async () => ({ data: { claims }, error: null }) }));
      expect(res.status).toBe(401);
      expect(await json(res)).toMatchObject({ code: 'sesion' });
    }
    const expired = await handleDeleteRequest(req(), deps({ getClaims: async () => ({ data: null, error: { name: 'AuthInvalidJwtError', status: 401 } }) }));
    expect(expired.status).toBe(401);
    // Auth caído no es culpa de la sesión.
    const down = await handleDeleteRequest(req(), deps({ getClaims: async () => ({ data: null, error: { name: 'AuthRetryableFetchError', status: 0 } }) }));
    expect(down.status).toBe(500);
  });

  it('sin la palabra BORRAR no se borra nada', async () => {
    const d = deps();
    const res = await handleDeleteRequest(req({ body: { confirm: 'si' } }), d);
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: 'invalido' });
    expect(d.calls).toEqual([`claims:${TOKEN}`]);
    expect((await handleDeleteRequest(req({ body: 'x'.repeat(5000) }), deps())).status).toBe(400);
  });

  it('con ligas a su nombre: 409 con el plan para guiarla, y no se borra', async () => {
    const d = deps({ prepare: async () => ({ data: OWNER_PLAN, error: null }) });
    const res = await handleDeleteRequest(req(), d);
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ ...OWNED, plan: OWNER_PLAN });
    expect(d.calls.some((c) => c.startsWith('delete:'))).toBe(false);
  });

  it('cuenta bloqueada: 403 «bloqueada»', async () => {
    const res = await handleDeleteRequest(req(), deps({ prepare: async () => ({ data: null, error: { message: 'bloqueada', code: '42501' } }) }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ code: 'bloqueada', message: 'bloqueada' });
  });

  it('justo quedó dueña de una liga entre la revisión y el borrado: 409', async () => {
    let n = 0;
    const d = deps({
      prepare: async () => ({ data: n++ === 0 ? OK_PLAN : OWNER_PLAN, error: null }),
      deleteUser: async () => ({ error: { status: 500, message: 'Database error deleting user' } }),
      log: vi.fn(),
    });
    const res = await handleDeleteRequest(req(), d);
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: 'tiene_ligas' });
    expect(d.log).toHaveBeenCalled();
  });

  it('otro error al borrar: 500; ya no existía: 401', async () => {
    const fail = await handleDeleteRequest(req(), deps({ deleteUser: async () => ({ error: { status: 500, message: 'boom' } }) }));
    expect(fail.status).toBe(500);
    const gone = await handleDeleteRequest(req(), deps({ deleteUser: async () => ({ error: { status: 404, message: 'User not found' } }) }));
    expect(gone.status).toBe(401);
    expect(await json(gone)).toMatchObject({ message: 'Esta cuenta ya no existe.' });
  });

  it('una excepción en cualquier paso: 500 (nunca se cae la función)', async () => {
    const res = await handleDeleteRequest(req(), deps({ prepare: () => Promise.reject(new Error('red')) }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual(SERVER);
  });

  it('sin Origin (una herramienta con el JWT) también funciona', async () => {
    const res = await handleDeleteRequest(req({ origin: null }), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
