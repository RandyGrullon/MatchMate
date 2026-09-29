/**
 * Funciones puras de la consola: avisos de salud, CSV, escalas de las gráficas, límites del plan,
 * secciones, anuncios y auditoría.
 */
import { describe, expect, it } from 'vitest';
import { LIMITS, healthAlerts, urgentCount } from './alerts';
import { areaPath, fraction, lastValues, linePath, meterTone, nearestIndex, niceStep, toPoints, weekOverWeek, xLabelIndexes, yTicks } from './chart';
import { LEAGUE_CSV_COLUMNS, USER_CSV_COLUMNS, csvCell, csvDate, csvFileName, toCsv } from './csv';
import { MB } from './format';
import {
  audienceKey,
  audienceLabel,
  auditActionLabel,
  auditSummary,
  auditTargetPath,
  canBlock,
  cleanAnnouncement,
  isInAppPath,
  isUserFilter,
  providerLabel,
  userFlags,
  validateAnnouncement,
} from './model';
import { planLimits } from './plan';
import { SECTIONS, sectionFromParam, sectionPath } from './sections';
import { NOW, audit, leagues, overview, series, storageUsage, users } from './testData';

describe('avisos de salud', () => {
  it('todo bien: sin avisos', () => {
    expect(healthAlerts(overview())).toEqual([]);
  });

  it('base > 400 MB avisa; ≥ 95 % de 500 MB es urgente', () => {
    expect(healthAlerts(overview({ storage: { dbBytes: 400 * MB } }))).toEqual([]);
    const warn = healthAlerts(overview({ storage: { dbBytes: 401 * MB } }));
    expect(warn.map((a) => [a.id, a.level])).toEqual([['db', 'warn']]);
    expect(warn[0].detail).toContain('401 MB de 500 MB');
    expect(healthAlerts(overview({ storage: { dbBytes: 480 * MB } }))[0].level).toBe('danger');
  });

  it('fotos > 800 MB de 1 GB', () => {
    expect(healthAlerts(overview({ storage: { photosBytes: 800 * MB } }))).toEqual([]);
    expect(healthAlerts(overview({ storage: { photosBytes: 850 * MB } }))[0]).toMatchObject({ id: 'photos', level: 'warn' });
  });

  it('bytes que no se saben (modo local) no avisan', () => {
    expect(healthAlerts(overview({ storage: { dbBytes: null, photosBytes: null } }))).toEqual([]);
  });

  it('lecturas de fotos: > 80 % avisa, el tope entero es urgente', () => {
    expect(healthAlerts(overview({ scan: { today: 400, dailyLimit: 500 } }))).toEqual([]);
    expect(healthAlerts(overview({ scan: { today: 401, dailyLimit: 500 } }))[0]).toMatchObject({ id: 'scan', level: 'warn' });
    expect(healthAlerts(overview({ scan: { today: 500, dailyLimit: 500 } }))[0]).toMatchObject({ id: 'scan', level: 'danger' });
    expect(healthAlerts(overview({ scan: { today: 10, dailyLimit: 0 } }))).toEqual([]);
  });

  it('push fallidos, cola larga, envíos pendientes y cuentas bloqueadas; los urgentes primero', () => {
    const a = healthAlerts(
      overview({
        push: { failed24h: 3, queued: LIMITS.pushQueueWarn },
        activity: { submissionsPending: LIMITS.pendingWarn },
        users: { blocked: 2 },
        storage: { dbBytes: 490 * MB },
      }),
    );
    expect(a.map((x) => x.id)).toEqual(['db', 'push-failed', 'push-queue', 'pending', 'blocked']);
    expect(a.find((x) => x.id === 'blocked')).toMatchObject({ level: 'info', title: 'Hay 2 cuentas bloqueadas', to: '/superadmin/cuentas?f=blocked' });
    expect(urgentCount(a)).toBe(4);
    expect(healthAlerts(overview({ users: { blocked: 1 } }))[0].title).toBe('Hay 1 cuenta bloqueada');
  });
});

describe('CSV', () => {
  it('celdas: comillas, comas, saltos y fórmulas', () => {
    expect(csvCell('Ana')).toBe('Ana');
    expect(csvCell('Pérez, Ana')).toBe('"Pérez, Ana"');
    expect(csvCell('El "Tigre"')).toBe('"El ""Tigre"""');
    expect(csvCell('dos\nlíneas')).toBe('"dos\nlíneas"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1809')).toBe("'+1809");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell(' borde')).toBe('" borde"');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('sí');
    expect(csvCell(null)).toBe('');
  });

  it('cuentas: encabezado y una fila por cuenta, con CRLF', () => {
    const text = toCsv(users, USER_CSV_COLUMNS);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe(
      'Nombre,Correo,Alta (UTC),Última vez (UTC),Último inicio de sesión (UTC),Proveedor,Correo confirmado,Superadmin,Bloqueada,Motivo del bloqueo,Ligas,Dueño de,Id',
    );
    expect(lines).toHaveLength(users.length + 2);
    expect(lines[lines.length - 1]).toBe('');
    expect(lines[2].startsWith('Ana Pérez,ana@correo.do,')).toBe(true);
    expect(lines[3].startsWith(`"Luis ""El Tigre"", Soto","'=HYPERLINK(""x"")",`)).toBe(true);
    expect(lines[3]).toContain(',no,no,');
  });

  it('ligas', () => {
    const lines = toCsv(leagues, LEAGUE_CSV_COLUMNS).split('\r\n');
    expect(lines[1]).toContain('Liga del Martes,Boliche,Liga,Pública,sí,Randy Dueño');
    expect(lines[2]).toContain('Copa Pádel,Pádel,Torneo,Privada,no,Ana Pérez,,8,16,2,,');
  });

  it('fechas y nombre del archivo', () => {
    expect(csvDate('2026-09-27T15:04:59.000Z')).toBe('2026-09-27 15:04');
    expect(csvDate(null)).toBe('');
    expect(csvDate('x')).toBe('');
    expect(csvFileName('cuentas', new Date(2026, 8, 7))).toBe('matchmate-cuentas-2026-09-07.csv');
  });
});

describe('gráficas', () => {
  it('pasos y marcas redondas del eje Y', () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(25);
    expect(niceStep(130)).toBe(200);
    expect(niceStep(0.3, false)).toBeCloseTo(0.5);
    expect(yTicks(0)).toEqual([0, 1]);
    expect(yTicks(3)).toEqual([0, 1, 2, 3]);
    expect(yTicks(10)).toEqual([0, 5, 10]);
    expect(yTicks(97)).toEqual([0, 25, 50, 75, 100]);
    expect(yTicks(1234)).toEqual([0, 500, 1000, 1500]);
  });

  it('puntos en el lienzo 0–100 y trazos', () => {
    const pts = toPoints([0, 5, 10], 10);
    expect(pts).toEqual([
      { x: 0, y: 100 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ]);
    expect(toPoints([4], 10)).toEqual([{ x: 50, y: 60 }]);
    expect(toPoints([20, -3], 10).map((p) => p.y)).toEqual([0, 100]);
    expect(linePath(pts)).toBe('M0 100 L50 50 L100 0');
    expect(areaPath(pts)).toBe('M0 100 L50 50 L100 0 L100 100 L0 100 Z');
    expect(areaPath([])).toBe('');
  });

  it('punto más cercano al mouse y etiquetas del eje X', () => {
    expect(nearestIndex(0, 30)).toBe(0);
    expect(nearestIndex(1, 30)).toBe(29);
    expect(nearestIndex(0.5, 3)).toBe(1);
    expect(nearestIndex(-2, 30)).toBe(0);
    expect(nearestIndex(0.7, 1)).toBe(0);
    expect(xLabelIndexes(3)).toEqual([0, 1, 2]);
    expect(xLabelIndexes(30)).toEqual([0, 7, 15, 22, 29]);
    expect(xLabelIndexes(0)).toEqual([]);
  });

  it('medidores', () => {
    expect(fraction(5, 10)).toBe(0.5);
    expect(fraction(15, 10)).toBe(1);
    expect(fraction(3, 0)).toBe(0);
    expect(meterTone(0.5)).toBe('accent');
    expect(meterTone(0.8)).toBe('warn');
    expect(meterTone(0.96)).toBe('danger');
  });

  it('semana contra semana (sumando días) y los últimos valores', () => {
    const s = series(30, (i) => (i >= 23 ? 2 : 1));
    const w = weekOverWeek(s, 'events');
    expect(w).toEqual({ current: 14, previous: 7, change: 1, enough: true });
    // Aunque la serie venga desordenada.
    expect(weekOverWeek([...s].reverse(), 'events').current).toBe(14);
    expect(weekOverWeek(series(5), 'events').enough).toBe(false);
    expect(lastValues(series(40, (i) => i), 'events', 3)).toEqual([37, 38, 39]);
  });
});

describe('límites del plan gratis', () => {
  it('lo que se sabe con su proporción y lo demás en «—»', () => {
    const rows = planLimits(overview({ storage: { dbBytes: 250 * MB, photosBytes: null, photos: 12 } }));
    expect(rows.map((r) => r.id)).toEqual(['db', 'storage', 'egress', 'mau', 'functions', 'realtime']);
    expect(rows[0]).toMatchObject({ limit: '500 MB', current: '250 MB', used: 0.5 });
    expect(rows[1]).toMatchObject({ limit: '1 GB', current: '12 fotos', used: null });
    expect(rows[2]).toMatchObject({ limit: '5 GB al mes', current: null });
    expect(rows[3]).toMatchObject({ limit: '50,000 al mes', current: '≈ 780' });
    expect(rows[3].used).toBeCloseTo(780 / 50_000);
    expect(rows[4].limit).toBe('500,000 al mes');
    expect(rows[5].limit).toBe('200 conexiones');
    expect(planLimits(null).every((r) => r.current == null && r.used == null)).toBe(true);
  });

  it('con admin_storage_usage: la base y lo que pesa Storage; sin Storage (0) vale lo del resumen', () => {
    const o = overview({ storage: { dbBytes: 250 * MB, photosBytes: 300 * MB, photos: 12 } });
    const rows = planLimits(o, storageUsage);
    expect(rows[0]).toMatchObject({ current: '180 MB', used: (180 * MB) / (500 * MB) });
    expect(rows[1]).toMatchObject({ current: '768 MB', used: 0.75 });
    const local = planLimits(o, { ...storageUsage, storageBytes: 0, storagePct: 0 });
    expect(local[1]).toMatchObject({ current: '300 MB' });
    expect(planLimits(null, storageUsage)[1]).toMatchObject({ current: '768 MB' });
    expect(planLimits(null, { ...storageUsage, storageBytes: 0 })[1]).toMatchObject({ current: '0 B', used: 0 });
  });
});

describe('secciones', () => {
  it('de la ruta a la sección', () => {
    expect(sectionFromParam(undefined)).toBe('resumen');
    expect(sectionFromParam('cuentas')).toBe('cuentas');
    expect(sectionFromParam('logo')).toBe('logo');
    expect(sectionFromParam('marca')).toBeNull();
    expect(sectionFromParam('nada')).toBeNull();
    expect(sectionPath('resumen')).toBe('/superadmin');
    expect(sectionPath('auditoria')).toBe('/superadmin/auditoria');
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
  });
});

describe('cuentas', () => {
  it('estados', () => {
    expect(userFlags(users[0], NOW)).toEqual({ superadmin: true, blocked: false, unconfirmed: false, inactive: false });
    expect(userFlags(users[2], NOW)).toEqual({ superadmin: false, blocked: true, unconfirmed: true, inactive: true });
    expect(userFlags({ ...users[1], lastSeenAt: null }, NOW).inactive).toBe(true);
    expect(isUserFilter('blocked')).toBe(true);
    expect(isUserFilter('otro')).toBe(false);
  });

  it('no se bloquea a sí mismo ni a un superadmin', () => {
    expect(canBlock(users[1], 'u-me')).toBe(true);
    expect(canBlock(users[0], 'u-otro')).toBe(false);
    expect(canBlock(users[1], 'u-ana')).toBe(false);
  });

  it('proveedor', () => {
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('email')).toBe('Correo y contraseña');
    expect(providerLabel('apple')).toBe('Apple');
    expect(providerLabel(null)).toBe('No se sabe');
  });
});

describe('anuncios', () => {
  const ok = { title: 'Hola', body: 'Mensaje', audience: { kind: 'all' as const } };

  it('solo rutas de adentro de la app', () => {
    expect(isInAppPath('/')).toBe(true);
    expect(isInAppPath('/l/abc?tab=1#x')).toBe(true);
    expect(isInAppPath('//evil.com')).toBe(false);
    expect(isInAppPath('https://evil.com')).toBe(false);
    expect(isInAppPath('/\\evil.com')).toBe(false);
    expect(isInAppPath('/ con espacio')).toBe(false);
    expect(isInAppPath('javascript:alert(1)')).toBe(false);
    expect(isInAppPath('ligas')).toBe(false);
    expect(isInAppPath(`/${'a'.repeat(200)}`)).toBe(false);
  });

  it('validación', () => {
    expect(validateAnnouncement(ok)).toEqual({});
    expect(validateAnnouncement({ ...ok, url: '' })).toEqual({});
    expect(validateAnnouncement({ ...ok, title: '  ', body: '' })).toEqual({ title: 'Escribe un título.', body: 'Escribe el mensaje.' });
    expect(validateAnnouncement({ ...ok, title: 'x'.repeat(61) }).title).toBe('Máximo 60 letras.');
    expect(validateAnnouncement({ ...ok, title: `  ${'x'.repeat(60)}  ` })).toEqual({});
    expect(validateAnnouncement({ ...ok, body: 'x'.repeat(181) }).body).toBe('Máximo 180 letras.');
    expect(validateAnnouncement({ ...ok, url: '//x.com' }).url).toBeTruthy();
    expect(validateAnnouncement({ ...ok, audience: { kind: 'league', leagueId: '' } }).audience).toBe('Elige la liga.');
    expect(validateAnnouncement({ ...ok, audience: { kind: 'sport', sport: '' } }).audience).toBe('Elige el deporte.');
  });

  it('limpio para mandar, público y clave', () => {
    expect(cleanAnnouncement({ ...ok, title: ' Hola ', body: ' Msj ', url: '  ' })).toEqual({ title: 'Hola', body: 'Msj', audience: { kind: 'all' } });
    expect(cleanAnnouncement({ ...ok, url: ' /ligas ' }).url).toBe('/ligas');
    expect(audienceLabel({ kind: 'sport', sport: 'padel' })).toBe('Miembros de ligas de pádel');
    expect(audienceLabel({ kind: 'league', leagueId: 'l1' }, 'Liga X')).toBe('Miembros de «Liga X»');
    expect(audienceLabel({ kind: 'admins' })).toBe('Dueños y admins de ligas');
    expect(audienceKey({ kind: 'league', leagueId: 'l1' })).toBe('league:l1');
    expect(audienceKey({ kind: 'sport', sport: 'golf' })).toBe('sport:golf');
    expect(audienceKey({ kind: 'all' })).toBe('all');
  });
});

describe('auditoría', () => {
  it('etiquetas y frases', () => {
    expect(auditActionLabel('announce')).toBe('Anuncio');
    expect(auditActionLabel('reset_invite_code')).toBe('Reset invite code');
    expect(auditSummary(audit[0])).toBe('Mandó «Llegó el pádel» a 530 cuentas');
    expect(auditSummary(audit[1])).toBe('Bloqueó a Luis Soto: «Anotaciones falsas»');
    // El deporte va en el objetivo (targetId) y el estado nuevo en detail.to.
    expect(auditSummary(audit[2])).toBe('Abrió Pádel');
    expect(auditSummary({ action: 'set_sport_status', targetId: 'golf', detail: { from: 'open', to: 'closed' } })).toBe('Cerró Golf');
    expect(auditSummary({ action: 'set_superadmin', detail: { value: false, name: 'Ana' } })).toBe('Le quitó superadmin a Ana');
    expect(auditSummary({ action: 'set_superadmin', detail: { value: true, name: 'Ana', unblocked: true } })).toBe('Hizo superadmin a Ana (y quedó desbloqueada)');
    expect(auditSummary({ action: 'unblock_user', detail: {} })).toBe('Desbloqueó la cuenta');
    expect(auditSummary({ action: 'delete_league', detail: { name: 'Liga Vieja', ownerName: 'Ana' } })).toBe('Borró «Liga Vieja» (de Ana)');
    expect(auditSummary({ action: 'transfer_league', detail: { name: 'Copa', fromName: 'Ana', toName: 'Luis' } })).toBe('Pasó «Copa» de Ana a Luis');
    expect(auditSummary({ action: 'transfer_league', detail: {} })).toBe('Pasó la liga a otra cuenta');
  });

  it('a dónde lleva el objetivo', () => {
    expect(auditTargetPath(audit[1])).toBe('/superadmin/cuentas?u=u-luis');
    expect(auditTargetPath(audit[2])).toBe('/superadmin/deportes');
    expect(auditTargetPath(audit[0])).toBeNull();
    expect(auditTargetPath({ action: 'transfer_league', targetType: 'league', targetId: 'l1' })).toBe('/l/l1');
    expect(auditTargetPath({ action: 'delete_league', targetType: 'league', targetId: 'l1' })).toBeNull();
  });
});
