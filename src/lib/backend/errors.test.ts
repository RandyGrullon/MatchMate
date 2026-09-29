import { describe, expect, it } from 'vitest';
import { mapAuthError, mapDbError, mapStorageError, toBackendError } from './errors';
import { BackendError } from './types';

describe('errores de la base', () => {
  it.each([
    ['42501', 'x', 'permission'],
    ['23505', 'x', 'conflict'],
    ['23514', 'x', 'validation'],
    ['23502', 'x', 'validation'],
    ['23503', 'x', 'validation'],
    ['22P02', 'x', 'validation'],
    ['22001', 'x', 'validation'],
    ['P0001', 'rate_limited', 'rate_limited'],
    ['P0001', 'rate_limited: 10 por minuto', 'rate_limited'],
    ['P0001', 'no_permitido', 'permission'],
    ['P0001', 'no_existe', 'not_found'],
    ['P0001', 'duplicado', 'conflict'],
    ['P0001', 'conflicto: Juegos en el mismo evento (1)', 'conflict'],
    ['P0001', 'invalido', 'validation'],
    ['P0001', 'cerrado', 'validation'],
    ['PGRST116', 'x', 'not_found'],
    ['PGRST301', 'x', 'auth'],
    ['PGRST000', 'x', 'network'],
    ['08006', 'x', 'network'],
    ['XX000', 'x', 'unknown'],
  ])('%s %s → %s', (code, message, kind) => {
    const e = mapDbError({ code, message });
    expect(e.kind).toBe(kind);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(kind === 'network');
  });

  it('sin código decide el estado HTTP', () => {
    expect(mapDbError({ message: 'x', status: 0 }).kind).toBe('network');
    expect(mapDbError({ message: 'x', status: 503 })).toMatchObject({ kind: 'network', retryable: true });
    expect(mapDbError({ message: 'x', status: 401 }).kind).toBe('auth');
    expect(mapDbError({ message: 'x', status: 429 }).kind).toBe('rate_limited');
    expect(mapDbError({ message: 'x', status: 418 }).kind).toBe('unknown');
    expect(mapDbError({ message: '' }).message).toBe('Error de la base de datos');
  });

  it('pasajeros: se reintentan aunque no sean de red', () => {
    for (const code of ['40001', '40P01', '55P03', '57014', '53300']) expect(mapDbError({ code, message: 'x' })).toMatchObject({ kind: 'unknown', retryable: true });
  });
});

describe('toBackendError', () => {
  it('fetch caído es de red; un TypeError del código no', () => {
    expect(toBackendError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(toBackendError(new TypeError('NetworkError when attempting to fetch resource.')).kind).toBe('network');
    expect(toBackendError(new TypeError('Load failed')).kind).toBe('network');
    expect(toBackendError(new TypeError("Cannot read properties of undefined (reading 'x')")).kind).toBe('unknown');
  });

  it('respeta un BackendError y lee errores con código (PGlite)', () => {
    const be = new BackendError('x', 'conflict');
    expect(toBackendError(be)).toBe(be);
    expect(toBackendError(Object.assign(new Error('check'), { code: '23514', detail: 'fila' })).kind).toBe('validation');
    expect(toBackendError('texto').message).toBe('texto');
  });
});

describe('errores de Auth y Storage', () => {
  it('Auth', () => {
    expect(mapAuthError({ name: 'AuthSessionMissingError', message: 'Auth session missing!' })).toMatchObject({ kind: 'auth', code: 'session_not_found' });
    expect(mapAuthError({ code: 'email_exists' }).kind).toBe('conflict');
    expect(mapAuthError({ code: 'otro', status: 429 }).kind).toBe('rate_limited');
    expect(mapAuthError({ code: 'otro', status: 422, message: 'm' })).toMatchObject({ kind: 'validation', message: 'm' });
    expect(mapAuthError({ status: 500, message: 'x' }).kind).toBe('network');
    expect(mapAuthError({ message: 'raro' }).kind).toBe('auth');
  });

  it('Storage', () => {
    expect(mapStorageError({ message: 'Payload too large', status: 413, statusCode: '413' }).kind).toBe('validation');
    expect(mapStorageError({ message: 'Object not found', status: 400, statusCode: '404' }).kind).toBe('not_found');
    expect(mapStorageError({ name: 'StorageUnknownError', message: 'Failed to fetch' }).kind).toBe('network');
    expect(mapStorageError({ message: 'Internal', status: 500, statusCode: '500' })).toMatchObject({ kind: 'network', retryable: true });
  });
});
