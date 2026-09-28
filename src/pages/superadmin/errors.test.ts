import { describe, expect, it } from 'vitest';
import { toAdminClientError, toAdminClientErrors } from '../../lib/data/admin';
import { auditActionLabel, auditSummary, auditTargetPath, auditTone, clientErrorTone, describeUa } from './model';
import { sectionFromParam, sectionPath } from './sections';

describe('errores de los teléfonos en la consola', () => {
  it('de la base a los tipos, sin romperse con lo raro', () => {
    expect(toAdminClientError({ fingerprint: 'f', hits: '3', kind: 'raro', routes: ['/a', null, 2, ''], versions: 'x' })).toEqual({
      fingerprint: 'f',
      hits: 3,
      reports: 0,
      users: 0,
      firstAt: '',
      lastAt: '',
      kind: 'error',
      message: '',
      component: null,
      stack: null,
      route: null,
      ua: null,
      appVersion: null,
      userId: null,
      userName: null,
      routes: ['/a'],
      versions: [],
    });
    const page = toAdminClientErrors({ rows: [{ fingerprint: 'a', kind: 'chunk' }], total: 0, hits: '5', users: 2 });
    expect(page).toMatchObject({ total: 1, hits: 5, users: 2 });
    expect(page.rows[0].kind).toBe('chunk');
    expect(toAdminClientErrors(null)).toEqual({ rows: [], total: 0, hits: 0, users: 0 });
  });

  it('el teléfono en pocas palabras', () => {
    expect(describeUa('Mozilla/5.0 (Linux; Android 13; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36')).toBe(
      'Android 13 · Samsung Internet 25',
    );
    expect(describeUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0')).toBe(
      'Windows · Edge 127',
    );
    expect(describeUa('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1')).toBe(
      'iPhone iOS 16.6 · Chrome 120',
    );
    expect(describeUa('Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0 [app instalada]')).toBe('Android 14 · Firefox 128 · app instalada');
    expect(describeUa(null)).toBe('No se sabe');
    expect(describeUa('curl/8.0')).toBe('curl/8.0');
  });

  it('tonos, sección y auditoría de lo nuevo', () => {
    expect(clientErrorTone('render')).toBe('danger');
    expect(clientErrorTone('chunk')).toBe('neutral');
    expect(clientErrorTone('promise')).toBe('warn');
    expect(sectionFromParam('errores')).toBe('errores');
    expect(sectionPath('errores')).toBe('/superadmin/errores');

    expect(auditActionLabel('clear_errors')).toBe('Errores borrados');
    expect(auditActionLabel('delete_account')).toBe('Cuenta borrada');
    expect(auditTone('delete_account')).toBe('danger');
    expect(auditSummary({ action: 'clear_errors', detail: { deleted: 2, all: false, message: 'TypeError: x' } })).toBe('Borró 2 reportes de errores: «TypeError: x»');
    expect(auditSummary({ action: 'clear_errors', detail: { deleted: 1, all: true } })).toBe('Vació los errores (1 reporte de errores)');
    expect(auditSummary({ action: 'delete_account', detail: { createdAt: '2026-01-01T00:00:00.000Z' } })).toBe('La persona borró su cuenta');
    expect(auditTargetPath({ action: 'clear_errors', targetType: 'app', targetId: 'f' })).toBe('/superadmin/errores');
    expect(auditTargetPath({ action: 'delete_account', targetType: 'user', targetId: 'u1' })).toBeNull();
  });
});
