import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendError, setBackendForTests } from './backend';
import { createFakeBackend } from './db/fakeBackend';
import { rowsFromResponse, SCAN_FUNCTION, scanErrorFrom, scanScoreboard, ScanError } from './scan';

const LEAGUE = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';
const ROW = { name: 'LUIS', handicap: null, games: [180, null, 200], total: 380, matchesTotal: true };

afterEach(() => {
  setBackendForTests(null);
  vi.unstubAllGlobals();
});

function fakeInvoke(reply: (fn: string, body: unknown) => unknown) {
  const b = createFakeBackend();
  const invoke = vi.fn(async (fn: string, body: unknown) => reply(fn, body));
  b.invoke = invoke as typeof b.invoke;
  setBackendForTests(b);
  return invoke;
}

/** El error que lanza scanScoreboard. */
async function scanError(p: Promise<unknown>): Promise<ScanError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ScanError);
    return e as ScanError;
  }
  throw new Error('se esperaba un error');
}

describe('leer la foto con la Edge Function', () => {
  it('manda la foto, la liga y el evento a scan-bowling y devuelve las filas', async () => {
    const invoke = fakeInvoke(() => ({ rows: [ROW], model: 'gemini-3.5-flash-lite', cached: false }));
    expect(await scanScoreboard('data:image/jpeg;base64,/9j/AAAA', { leagueId: LEAGUE, eventId: EVENT })).toEqual([ROW]);
    expect(invoke).toHaveBeenCalledWith(SCAN_FUNCTION, { image: 'data:image/jpeg;base64,/9j/AAAA', leagueId: LEAGUE, eventId: EVENT });
    // Envío por fecha: sin evento.
    await scanScoreboard('data:image/jpeg;base64,/9j/AAAA', { leagueId: LEAGUE });
    expect(invoke.mock.calls[1][1]).toMatchObject({ eventId: null });
  });

  it('sin liga no se puede leer (no llama a la función)', async () => {
    const invoke = fakeInvoke(() => ({ rows: [ROW] }));
    expect((await scanError(scanScoreboard('data:image/jpeg;base64,x', null))).kind).toBe('config');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('la foto ya guardada (URL firmada) se baja y se manda como data URL', async () => {
    const invoke = fakeInvoke(() => ({ rows: [ROW] }));
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })));
    vi.stubGlobal('fetch', fetchMock);
    await scanScoreboard('https://x.supabase.co/storage/v1/object/sign/scoreboards/l/f.webp?token=t', { leagueId: LEAGUE });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1]).toMatchObject({ image: 'data:image/webp;base64,AQID' });

    vi.stubGlobal('fetch', async () => new Response('no', { status: 400 }));
    expect((await scanError(scanScoreboard('https://x/vencida', { leagueId: LEAGUE }))).kind).toBe('red');
  });

  it('los errores de la función llegan como ScanError', async () => {
    fakeInvoke(() => {
      throw new BackendError('La foto no parece una pantalla de resultados de boliche.', 'validation', 'foto');
    });
    const e = await scanError(scanScoreboard('data:image/jpeg;base64,x', { leagueId: LEAGUE }));
    expect(e).toMatchObject({ kind: 'foto', message: 'La foto no parece una pantalla de resultados de boliche.' });
  });
});

describe('respuesta de la función', () => {
  it('filas (revisadas por si acaso)', () => {
    expect(rowsFromResponse({ rows: [ROW, { name: 1 }], model: 'm', cached: true })).toEqual([ROW]);
    expect(rowsFromResponse({ rows: [{ ...ROW, matchesTotal: undefined }] })).toEqual([{ ...ROW, matchesTotal: null }]);
    expect(() => rowsFromResponse({ rows: [] })).toThrow(/No se pudieron leer/);
  });

  it('{retry}: cupo o espera → cupo con la espera del servidor; la IA tardó o falló → red', () => {
    const err = (res: unknown) => {
      try {
        rowsFromResponse(res);
      } catch (e) {
        return e as ScanError;
      }
      throw new Error('se esperaba un error');
    };
    expect(err({ retry: true, reason: 'cupo', retryAfter: 30, message: 'Sin cupo.' })).toMatchObject({ kind: 'cupo', retryAfterMs: 30_000, message: 'Sin cupo.' });
    expect(err({ retry: true, reason: 'espera', retryAfter: 5, message: 'Espera.' })).toMatchObject({ kind: 'cupo', retryAfterMs: 5_000 });
    expect(err({ retry: true, reason: 'tiempo', retryAfter: 10, message: 'Tardó.' })).toMatchObject({ kind: 'red', retryAfterMs: 10_000 });
    expect(err({ retry: true, reason: 'servidor' })).toMatchObject({ kind: 'red', retryAfterMs: null, message: 'No se pudo escanear la foto.' });
    expect(err(null)).toMatchObject({ kind: 'red' });
  });

  it('errores: manda el código del cuerpo; si no hay, el tipo de error', () => {
    const from = (message: string, kind: ConstructorParameters<typeof BackendError>[1], code: string | null = null) =>
      scanErrorFrom(new BackendError(message, kind, code));
    expect(from('La IA no pudo leer esta foto.', 'validation', 'foto')).toMatchObject({ kind: 'foto', message: 'La IA no pudo leer esta foto.' });
    expect(from('La foto es muy grande (máximo 1 MB).', 'validation', 'invalido').kind).toBe('foto');
    // El límite del día llega con 429 (rate_limited) pero reintentar en un minuto no sirve.
    expect(from('Llegaste al límite de 40 fotos leídas con IA por hoy.', 'rate_limited', 'limite')).toMatchObject({ kind: 'config', message: expect.stringContaining('40 fotos') });
    // config llega con 500 (network) pero no se reintenta.
    expect(from('La lectura con IA no está disponible ahora.', 'network', 'config').kind).toBe('config');
    expect(from('No disponible para ti.', 'permission', 'no_permitido').kind).toBe('config');
    expect(from('Ese evento ya cerró.', 'conflict', 'cerrado').kind).toBe('config');
    expect(from('x', 'auth', 'sesion')).toMatchObject({ kind: 'config', message: expect.stringContaining('sesión') });
    expect(from('No se pudo.', 'network', 'servidor').kind).toBe('red');
    expect(from('Error 503', 'network', 'servidor').message).toBe('No se pudo escanear la foto.');
    // Sin código (no llegó a la función, o el backend local).
    expect(from('Sin conexión. Revisa tu internet.', 'network')).toMatchObject({ kind: 'red', message: 'Sin conexión para escanear la foto.' });
    expect(from('Too Many Requests', 'rate_limited').kind).toBe('cupo');
    expect(from('La lectura con IA no está disponible en modo local', 'validation')).toMatchObject({
      kind: 'config',
      message: 'La lectura con IA no está disponible en modo local',
    });
    expect(from('Not found', 'not_found').kind).toBe('config');
    expect(from('?', 'unknown').kind).toBe('red');
    expect(scanErrorFrom(new Error('raro')).kind).toBe('red');
    const same = new ScanError('igual', 'cupo');
    expect(scanErrorFrom(same)).toBe(same);
  });
});
