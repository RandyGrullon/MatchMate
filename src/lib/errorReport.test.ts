import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from './backend/types';
import {
  buildReport,
  cleanRoute,
  createErrorReporter,
  ERROR_LIMITS,
  errorParts,
  installErrorReporting,
  isChunkLoadError,
  reportKey,
  scrub,
  shouldIgnore,
  type ClientErrorReport,
  type ReportEnv,
} from './errorReport';

const ENV: ReportEnv = { route: '/l/abc/ranking', ua: 'Mozilla/5.0 (Linux; Android 10)', appVersion: 'index-AbC123' };

describe('del error al reporte', () => {
  it('nombre, mensaje y pila de lo que sea', () => {
    const e = new TypeError('x is undefined');
    expect(errorParts(e)).toMatchObject({ name: 'TypeError', message: 'x is undefined' });
    expect(errorParts(e).stack).toContain('x is undefined');
    expect(errorParts('texto')).toEqual({ name: '', message: 'texto', stack: null });
    expect(errorParts({ a: 1 })).toEqual({ name: '', message: '{"a":1}', stack: null });
    expect(errorParts(undefined).message).toBe('undefined');
    // Un BackendError dice su código.
    expect(errorParts(new BackendError('invalido', 'validation', 'P0001')).message).toBe('invalido [P0001]');
  });

  it('partes de la app que no bajaron', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Admin-1.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('tapa correos y tokens', () => {
    expect(scrub('duplicado ana.p+1@correo.com.do y eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghij')).toBe('duplicado <correo> y <token>');
    expect(scrub('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer <token>');
    expect(scrub('clave sb_secret_AbC-123')).toBe('clave sb_secret_<clave>');
  });

  it('ruta sin ?… ni #… y sin el código de invitación', () => {
    expect(cleanRoute('/l/abc/ranking?tab=2#x')).toBe('/l/abc/ranking');
    expect(cleanRoute('/unirse/ABCD2345')).toBe('/unirse/:codigo');
    expect(cleanRoute('/unirse/ABCD2345/algo')).toBe('/unirse/:codigo/algo');
    expect(cleanRoute('?x=1')).toBe('/');
    expect(cleanRoute(null)).toBeNull();
    expect(cleanRoute(`/${'a'.repeat(300)}`)).toHaveLength(ERROR_LIMITS.route);
  });

  it('lo que no se reporta', () => {
    expect(shouldIgnore(new BackendError('Sin conexión', 'network'))).toBe(true);
    expect(shouldIgnore(new BackendError('JWT expired', 'auth'))).toBe(true);
    expect(shouldIgnore(new BackendError('rate_limited', 'rate_limited'))).toBe(true);
    expect(shouldIgnore(new BackendError('Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.', 'permission', 'bloqueada'))).toBe(true);
    expect(shouldIgnore(new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldIgnore(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }))).toBe(true);
    expect(shouldIgnore(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(true);
    expect(shouldIgnore('Script error.')).toBe(true);
    const ext = new Error('boom');
    ext.stack = 'Error: boom\n    at x (chrome-extension://abcdef/content.js:1:1)';
    expect(shouldIgnore(ext)).toBe(true);
    // Sí: errores de código, de la base que no son la señal, y partes que no bajaron.
    expect(shouldIgnore(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(shouldIgnore(new BackendError('invalido', 'validation', 'P0001'))).toBe(false);
    expect(shouldIgnore(new TypeError('Failed to fetch dynamically imported module: /assets/a.js'))).toBe(false);
  });

  it('arma el reporte: tipo, mensaje con el nombre, pila con los componentes, recortes', () => {
    const e = new TypeError("Cannot read properties of undefined (reading 'name')");
    const r = buildReport('render', e, { component: 'liga/ranking', componentStack: '\n    at Ranking\n    at Suspense' }, ENV)!;
    expect(r.kind).toBe('render');
    expect(r.message).toBe("TypeError: Cannot read properties of undefined (reading 'name')");
    expect(r.stack).toContain('Componentes:\n    at Ranking');
    expect(r).toMatchObject({ route: '/l/abc/ranking', component: 'liga/ranking', ua: ENV.ua, appVersion: 'index-AbC123' });

    const long = buildReport('error', new Error('x'.repeat(900)), { where: 'https://app/assets/index.js:1:2' }, { ...ENV, ua: 'u'.repeat(900) })!;
    expect(long.message).toHaveLength(ERROR_LIMITS.message);
    expect(long.ua).toHaveLength(ERROR_LIMITS.ua);
    // Un texto sin pila: la pila es dónde pasó.
    expect(buildReport('error', 'algo raro', { where: 'https://app/assets/index.js:1:2' }, ENV)!.stack).toBe('at https://app/assets/index.js:1:2');
    // Una parte que no bajó va como 'chunk' aunque llegue como 'render'.
    expect(buildReport('render', new TypeError('Failed to fetch dynamically imported module: /a.js'), {}, ENV)!.kind).toBe('chunk');
    // El mensaje vacío también se manda (con un texto que lo dice); lo que se ignora, no.
    expect(buildReport('promise', '', {}, ENV)!.message).toBe('(sin mensaje)');
    expect(buildReport('promise', new BackendError('x', 'network'), {}, ENV)).toBeNull();
  });

  it('la clave de repetidos ignora ids y números', () => {
    const a = { kind: 'error' as const, message: 'No existe 0b9f5c7e-1d2a-4e3b-9c8d-7a6b5c4d3e2f (fila 12)', component: null };
    const b = { ...a, message: 'No existe 11111111-2222-4333-8444-555555555555 (fila 3)' };
    expect(reportKey(a)).toBe(reportKey(b));
    expect(reportKey(a)).not.toBe(reportKey({ ...a, component: 'home' }));
  });
});

describe('mandar', () => {
  function setup(opts: { session?: boolean; fail?: unknown } = {}) {
    const sent: ClientErrorReport[] = [];
    let session = opts.session ?? true;
    let fail: unknown = opts.fail;
    let t = 1_000_000;
    const rep = createErrorReporter(
      {
        send: async (r) => {
          if (fail) throw fail;
          sent.push(r);
        },
        hasSession: async () => session,
        now: () => t,
        env: () => ENV,
      },
      { maxPerLoad: 5, repeatMs: 60_000, maxWaiting: 3 },
    );
    return {
      rep,
      sent,
      login: () => (session = true),
      setFail: (f: unknown) => (fail = f),
      advance: (ms: number) => (t += ms),
    };
  }

  it('manda (fuera del manejador) y no repite el mismo error en un minuto', async () => {
    const s = setup();
    s.rep.report('error', new Error('uno'));
    s.rep.report('error', new Error('uno'));
    expect(s.sent).toHaveLength(0);
    await s.rep.flush();
    expect(s.sent.map((r) => r.message)).toEqual(['uno']);
    s.advance(61_000);
    s.rep.report('error', new Error('uno'));
    await s.rep.flush();
    expect(s.sent).toHaveLength(2);
  });

  it('como mucho N por visita', async () => {
    const s = setup();
    for (let i = 0; i < 8; i++) {
      s.rep.report('error', new Error(`error ${String.fromCharCode(97 + i)}`));
      await s.rep.flush();
    }
    expect(s.sent).toHaveLength(5);
  });

  it('sin sesión esperan (hasta el tope) y salen al entrar', async () => {
    const s = setup({ session: false });
    for (const m of ['a', 'b', 'c', 'd']) s.rep.report('promise', new Error(m));
    await s.rep.flush();
    expect(s.sent).toHaveLength(0);
    expect(s.rep.waiting()).toBe(3);
    s.login();
    await s.rep.flush();
    expect(s.sent.map((r) => r.message)).toEqual(['a', 'b', 'c']);
    expect(s.rep.waiting()).toBe(0);
  });

  it('sin señal espera; otro error de la base lo descarta; nunca lanza', async () => {
    const s = setup({ fail: new BackendError('Sin conexión', 'network') });
    s.rep.report('error', new Error('uno'));
    await s.rep.flush();
    expect(s.rep.waiting()).toBe(1);
    s.setFail(new BackendError('bloqueada', 'permission', 'bloqueada'));
    await s.rep.flush();
    expect(s.rep.waiting()).toBe(0);
    s.setFail(null);
    s.rep.report('error', new Error('dos'));
    await s.rep.flush();
    expect(s.sent.map((r) => r.message)).toEqual(['dos']);
  });
});

describe('escuchar la app', () => {
  let off: (() => void) | null = null;
  afterEach(() => {
    off?.();
    off = null;
  });

  it('errores de código, promesas y partes que no bajaron; no los <img> que no cargan', async () => {
    const target = new EventTarget();
    const report = vi.fn();
    const flush = vi.fn(async () => undefined);
    off = installErrorReporting({ target, reporter: { report, flush, waiting: () => 0 }, watchAuth: false });
    // Llamarla otra vez no agrega otra escucha.
    installErrorReporting({ target, reporter: { report, flush, waiting: () => 0 }, watchAuth: false });

    const boom = new Error('boom');
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'Uncaught Error: boom', error: boom, filename: 'https://app/a.js', lineno: 3, colno: 9 }));
    target.dispatchEvent(new Event('error')); // un recurso que no cargó
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));
    target.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: new Error('Unable to preload CSS for /a.css') }));
    target.dispatchEvent(new Event('online'));

    expect(report.mock.calls).toEqual([
      ['error', boom, { where: 'https://app/a.js:3:9' }],
      ['promise', 'nope'],
      ['chunk', expect.any(Error)],
    ]);
    expect(flush).toHaveBeenCalledTimes(1);

    off();
    off = null;
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'otra' }));
    expect(report).toHaveBeenCalledTimes(3);
  });
});
