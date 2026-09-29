/**
 * Humo de la consola: cada sección se dibuja (sin navegador, renderToString) con la capa de datos de la consola
 * simulada, con datos, cargando, con error y vacía. Atrapa errores al dibujar (undefined, claves, textos).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../components/feedback';

type Mode = 'data' | 'loading' | 'error' | 'empty';
const state = vi.hoisted(() => ({ mode: 'data' as Mode, super: true }));

vi.mock('../../lib/data/admin', async (importOriginal) => {
  // Lo demás del módulo (tipos, límites, touchSeenDaily…) queda como es; solo se cambian lecturas y acciones.
  const real = await importOriginal<typeof import('../../lib/data/admin')>();
  const d = await import('./testData');
  const live = <T>(data: T, empty: T) =>
    state.mode === 'data'
      ? { data, loading: false, error: null }
      : state.mode === 'loading'
        ? { data: empty, loading: true, error: null }
        : state.mode === 'error'
          ? { data: empty, loading: false, error: new Error('Failed to fetch') }
          : { data: empty, loading: false, error: null };
  const page = <T>(rows: T[]) => live({ rows, total: rows.length }, { rows: [] as T[], total: 0 });
  const done = async () => undefined;
  return {
    ...real,
    useAdminOverview: () => live(d.overview({ users: { blocked: 1 }, storage: { dbBytes: 450 * 1024 * 1024 } }), null),
    useAdminSeries: () => live(d.series(30, (i) => i % 5), []),
    useAdminUsers: () => page(d.users),
    useAdminUser: (id: string | null) => live(id ? d.userDetail : null, null),
    useAdminLeagues: () => page(d.leagues),
    useAdminAudit: (_enabled: boolean, q: { action?: string }) => page(q.action ? d.audit.filter((e) => e.action === q.action) : d.audit),
    useAdminSystem: () => live(d.system, null),
    useAdminScanStats: () => live(d.scan, null),
    useAdminClientErrors: () => live(d.clientErrors, { rows: [], total: 0, hits: 0, users: 0 }),
    clearClientErrors: async () => 2,
    blockUser: done,
    setUserSuperadmin: done,
    unblockUser: done,
    setSportStatus: done,
    transferLeague: done,
    adminDeleteLeague: done,
    sendAnnouncement: async () => ({ recipients: 42 }),
    countAnnouncementRecipients: async () => 42,
  };
});

// Reportes y legal (20260929000900_legal.sql): las lecturas simuladas igual que las de arriba.
vi.mock('../../lib/data/reports', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/data/reports')>();
  const target = (title: string, extra: Record<string, unknown> = {}) => ({
    title,
    text: null,
    url: '/l/l1',
    userId: 'u-luis',
    userName: 'Luis Soto',
    leagueId: 'l1',
    leagueName: 'Liga del Martes',
    sport: 'bowling',
    ...extra,
  });
  const base = { leagueId: 'l1', leagueName: 'Liga del Martes', note: null, status: 'open', createdAt: '2026-09-27T10:00:00.000Z', handledAt: null, handledByName: null, actionNote: null, reporterId: 'u-ana', reporterName: 'Ana Pérez', sameTarget: 1 };
  const rows = [
    real.toReport({ ...base, id: 'r1', kind: 'comment', targetId: 'c1', reason: 'acoso', note: 'Me insulta siempre', sameTarget: 2, target: target('Comentario de Luis Soto', { text: 'Eres malísimo', url: '/l/l1/juegos?juego=e1&evento=ev1' }) }),
    real.toReport({ ...base, id: 'r2', kind: 'league', targetId: 'l2', reason: 'spam', target: target('Liga Falsa', { leagueId: 'l2', kind: 'liga', members: 3, events: 0, url: '/l/l2' }) }),
    real.toReport({ ...base, id: 'r3', kind: 'user', targetId: 'u-x', reason: 'falso', leagueId: null, leagueName: null, target: null, reporterId: null, reporterName: null }),
  ];
  const page = { rows, total: rows.length, open: rows.length, all: 5 };
  const empty = { rows: [], total: 0, open: 0, all: 0 };
  const live = <T>(data: T, emptyData: T) =>
    state.mode === 'data'
      ? { data, loading: false, error: null }
      : state.mode === 'loading'
        ? { data: emptyData, loading: true, error: null }
        : state.mode === 'error'
          ? { data: emptyData, loading: false, error: new Error('Failed to fetch') }
          : { data: emptyData, loading: false, error: null };
  return {
    ...real,
    useReports: () => live(page, empty),
    useReportCounts: () => live({ open: 3, all: 5 }, { open: 0, all: 0 }),
    resolveReport: async () => undefined,
    deleteReportedComment: async () => true,
  };
});

vi.mock('../../lib/data/legal', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/data/legal')>();
  const { TERMS_VERSION, PRIVACY_VERSION } = await import('../../lib/legal');
  const stats = {
    terms: TERMS_VERSION,
    privacy: PRIVACY_VERSION,
    accounts: 1240,
    accepted: 930,
    acceptedTerms: 940,
    acceptedPrivacy: 935,
    never: 210,
    last7d: 88,
    byVersion: [{ doc: 'terminos', version: TERMS_VERSION, accounts: 940 }],
  };
  return {
    ...real,
    useAdminLegalStats: () =>
      state.mode === 'data'
        ? { data: stats, loading: false, error: null }
        : { data: null, loading: state.mode === 'loading', error: state.mode === 'error' ? new Error('Failed to fetch') : null },
  };
});

vi.mock('../../lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...real,
    useAuth: () => ({
      user: { uid: 'u-me', email: 'yo@matchmate.do', displayName: 'Randy' },
      profile: { id: 'u-me', email: 'yo@matchmate.do', name: 'Randy Dueño', superadmin: state.super },
      isSuper: state.super,
      loading: false,
      recovering: false,
    }),
  };
});

let SuperAdminPage: typeof import('../SuperAdminPage').default;

// Importar la consola entera (con lucide, react-router y la capa de datos) tarda más de los 10 s por defecto
// cuando todas las pruebas corren a la vez.
beforeAll(async () => {
  // Node 20 no tiene `navigator` (la barra «Sin conexión» lo lee al dibujar).
  if (typeof navigator === 'undefined') vi.stubGlobal('navigator', { onLine: true });
  SuperAdminPage = (await import('../SuperAdminPage')).default;
}, 120_000);

beforeEach(() => {
  state.mode = 'data';
  state.super = true;
});

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function render(url: string): string {
  return text(html(url));
}

function html(url: string): string {
  return renderToString(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(
          FeedbackProvider,
          null,
          h(
            Routes,
            null,
            h(Route, { path: '/superadmin', element: h(SuperAdminPage) }),
            h(Route, { path: '/superadmin/:section', element: h(SuperAdminPage) }),
            h(Route, { path: '/ligas', element: 'PANTALLA DE LIGAS' }),
          ),
        ),
      ),
    );
}

const SECTIONS = ['', '/cuentas', '/ligas', '/reportes', '/deportes', '/anuncios', '/fotos', '/sistema', '/errores', '/legal', '/auditoria', '/logo'];

describe('consola del superadmin', () => {
  it('guarda: sin superadmin no se dibuja la consola; secciones que no existen tampoco', () => {
    state.super = false;
    expect(render('/superadmin')).not.toContain('Consola');
    state.super = true;
    expect(render('/superadmin/nada')).not.toContain('Consola');
    // Links viejos (?tab=cuentas) se redirigen.
    expect(render('/superadmin?tab=cuentas')).not.toContain('Consola');
  });

  it('el marco: menú con todas las secciones, avisos en Resumen y el selector del teléfono', () => {
    const out = render('/superadmin');
    expect(out).toContain('Consola');
    for (const label of ['Resumen', 'Cuentas', 'Ligas y torneos', 'Reportes', 'Deportes', 'Anuncios', 'Lectura de fotos', 'Sistema', 'Errores', 'Legal', 'Auditoría', 'Marca']) expect(out).toContain(label);
    expect(out).toContain('Superadmin: Randy Dueño');
    expect(out).toContain('(1 avisos)');
    // Reportes abiertos al lado de «Reportes».
    expect(out).toContain('Reportes (3 avisos)');
  });

  it('reportes: filtros, lo reportado con link, quién reportó, cuántos de lo mismo y las herramientas', () => {
    const out = render('/superadmin/reportes');
    expect(out).toContain('Lo que la gente reportó');
    expect(out).toContain('Abiertos');
    expect(out).toContain('Cerrados');
    expect(out).toContain('Acoso o amenazas');
    expect(out).toContain('Comentario · Liga del Martes');
    expect(out).toContain('Eres malísimo');
    expect(out).toContain('«Me insulta siempre»');
    expect(out).toContain('Lo reportó Ana Pérez');
    expect(out).toContain('Lo reportó una cuenta borrada');
    expect(out).toContain('2 reportes abiertos de esto');
    expect(out).toContain('Ya no existe (se borró).');
    expect(out).toContain('Borrar comentario');
    expect(out).toContain('Bloquear cuenta');
    expect(out).toContain('Borrar liga');
    expect(out).toContain('Descartar');
    expect(out).toContain('Marcar como atendido');
    const raw = html('/superadmin/reportes');
    expect(raw).toContain('href="/l/l1/juegos?juego=e1&amp;evento=ev1"');
    expect(raw).toContain('href="/superadmin/cuentas?u=u-ana"');
    expect(raw).toContain('href="/superadmin/cuentas?u=u-luis"');
  });

  it('legal: versiones, cuántas cuentas aceptaron y lo que falta completar', () => {
    const out = render('/superadmin/legal');
    expect(out).toContain('Versiones vigentes');
    expect(out).toContain('Términos de uso');
    expect(out).toContain('Política de privacidad');
    expect(out).toContain('vigente desde');
    expect(out).toContain('Aceptaron lo vigente');
    expect(out).toContain('930');
    expect(out).toContain('Les falta aceptar');
    expect(out).toContain('310');
    expect(out).toContain('Nunca aceptaron');
    expect(out).toContain('Lo que cambió en esta versión');
    expect(out).toContain('Falta completar');
    expect(out).toContain('Pendiente: revisión por un abogado dominicano');
    expect(out).toContain('[Nombre legal del titular]');
    expect(out).toContain('[RNC o cédula del titular]');
    expect(out).not.toContain('versiones distintas');
  });

  it('resumen: números, actividad, ligas por deporte, avisos y accesos', () => {
    const out = render('/superadmin');
    expect(out).toContain('1,240');
    expect(out).toContain('Activas en 7 días');
    expect(out).toContain('Juegos anotados (7 días)');
    expect(out).toContain('Actividad');
    expect(out).toContain('Cuentas activas por día');
    expect(out).toContain('Ligas por deporte');
    expect(out).toContain('Boliche');
    expect(out).toContain('18 activas');
    expect(out).toContain('La base de datos se está llenando');
    expect(out).toContain('Hay 1 cuenta bloqueada');
    expect(out).toContain('Uso del plan gratis');
    expect(out).toContain('450 MB de 500 MB');
    expect(out).toContain('Accesos rápidos');
  });

  it('cuentas: filtros con números, tabla y tarjetas, estados y paginación', () => {
    const out = render('/superadmin/cuentas');
    expect(out).toContain('Superadmins');
    expect(out).toContain('Bloqueadas');
    expect(out).toContain('Ana Pérez');
    expect(out).toContain('ana@correo.do');
    expect(out).toContain('Tú');
    expect(out).toContain('Bloqueada');
    expect(out).toContain('Sin confirmar');
    expect(out).toContain('1–3 de 3 cuentas');
    expect(out).toContain('Bajar CSV');
  });

  it('cuentas: el detalle abierto desde el link (?u=) con sus ligas y acciones', () => {
    const out = render('/superadmin/cuentas?u=u-ana');
    expect(out).toContain('Sus ligas y torneos (2)');
    expect(out).toContain('Liga del Martes');
    expect(out).toContain('Copa Pádel');
    expect(out).toContain('Anotador');
    expect(out).toContain('Teléfonos con avisos');
    expect(out).toContain('Correo y contraseña');
    expect(out).toContain('Hacer superadmin');
    expect(out).toContain('Bloquear');
    expect(out).toContain('Copiar correo');
  });

  it('ligas: filtros, deporte, insignias, dueño y acciones', () => {
    const out = render('/superadmin/ligas?dep=padel&tipo=torneo');
    expect(out).toContain('Liga del Martes');
    expect(out).toContain('Con menores');
    expect(out).toContain('Torneo');
    expect(out).toContain('Privada');
    expect(out).toContain('Pádel');
    expect(out).toContain('Más actividad');
    expect(out).toContain('1–2 de 2 ligas');
    // Botones de solo ícono: con nombre para lectores de pantalla.
    const raw = html('/superadmin/ligas');
    expect(raw).toContain('aria-label="Pasar Copa Pádel a otro dueño"');
    expect(raw).toContain('aria-label="Borrar Liga del Martes"');
    expect(raw).toContain('href="/l/l1"');
    expect(raw).toContain('href="/superadmin/cuentas?u=u-ana"');
  });

  it('deportes: cada deporte con su estado y cuántas ligas', () => {
    const out = render('/superadmin/deportes');
    for (const name of ['Boliche', 'Pádel', 'Tenis', 'Pickleball', 'Baloncesto', 'Golf', 'Natación']) expect(out).toContain(name);
    expect(out).toContain('30 ligas');
    expect(out).toContain('Abierto');
    expect(out).toContain('Beta');
    expect(out).toContain('Cerrado');
    expect(out).toContain('Nadie puede crear nuevas');
  });

  it('anuncios: formulario, a quién, vista previa e historial', () => {
    const out = render('/superadmin/anuncios');
    expect(out).toContain('Nuevo anuncio');
    expect(out).toContain('0/60');
    expect(out).toContain('0/180');
    expect(out).toContain('Admins de ligas');
    expect(out).toContain('Así se ve en el teléfono');
    expect(out).toContain('Mandar anuncio');
    expect(out).toContain('Anuncios mandados');
    expect(out).toContain('Llegó el pádel');
    expect(out).toContain('530 cuentas');
  });

  it('lectura de fotos: hoy contra el tope, por día, por modelo y cuentas', () => {
    const out = render('/superadmin/fotos');
    expect(out).toContain('420');
    expect(out).toContain('de 500');
    expect(out).toContain('84 %');
    expect(out).toContain('Lecturas por día');
    expect(out).toContain('claude-haiku-4-5');
    expect(out).toContain('Cuentas que más leen');
    expect(out).toContain('88');
  });

  it('sistema: backend, límites del plan, tareas, cola, migraciones y respaldo', () => {
    const out = render('/superadmin/sistema');
    expect(out).toContain('Supabase');
    expect(out).toContain('Límites del plan gratis');
    expect(out).toContain('5 GB al mes');
    expect(out).toContain('50,000 al mes');
    expect(out).toContain('200 conexiones');
    expect(out).toContain('mm-push-send');
    expect(out).toContain('Falló');
    expect(out).toContain('2 migraciones');
    expect(out).toContain('Respaldo completo');
    expect(out).toContain('Fallaron (24 h)');
  });

  it('errores: agrupados, con veces, cuentas, teléfono, rutas, versión y detalle', () => {
    const out = render('/superadmin/errores');
    expect(out).toContain('Lo que falla en los teléfonos');
    expect(out).toContain("TypeError: Cannot read properties of undefined (reading 'name')");
    expect(out).toContain('12 veces · 2 errores distintos · 5 cuentas');
    expect(out).toContain('9 veces');
    expect(out).toContain('4 cuentas');
    expect(out).toContain('Android 10 · Chrome 128 · app instalada');
    expect(out).toContain('iPhone iOS 17.4 · Safari 17');
    expect(out).toContain('/l/l2/ranking');
    expect(out).toContain('Versión index-AbC123');
    expect(out).toContain('Pantalla');
    expect(out).toContain('Actualización');
    expect(out).toContain('Ver detalle');
    expect(out).toContain('Cuenta borrada');
    expect(out).toContain('Ya se arregló');
    expect(out).toContain('Borrar todos');
    const raw = html('/superadmin/errores');
    expect(raw).toContain('href="/superadmin/cuentas?u=u-ana"');
    // Filtro por tipo en el link.
    expect(render('/superadmin/errores?t=chunk')).toContain('Una parte de la app que no bajó');
  });

  it('auditoría: acciones, quién, sobre qué y el detalle', () => {
    const out = render('/superadmin/auditoria');
    expect(out).toContain('Bloqueo de cuenta');
    expect(out).toContain('Bloqueó a Luis Soto: «Anotaciones falsas»');
    expect(out).toContain('Abrió Pádel');
    expect(out).toContain('Quién: Randy Dueño');
    expect(out).toContain('Ver detalle');
    const filtered = render('/superadmin/auditoria?accion=announce');
    expect(filtered).toContain('Mandó «Llegó el pádel»');
    expect(filtered).not.toContain('Abrió Pádel');
  });

  it('marca: lleva a la página del logo', () => {
    const out = render('/superadmin/logo');
    expect(out).toContain('Logo y animaciones de apertura');
    expect(out).toContain('Abrir la marca');
  });

  it.each(['loading', 'error', 'empty'] as const)('cada sección se dibuja %s', (mode) => {
    state.mode = mode;
    for (const s of SECTIONS) {
      const out = render(`/superadmin${s}`);
      expect(out, s).toContain('Consola');
      if (mode === 'error' && ['', '/cuentas', '/ligas', '/reportes', '/fotos', '/errores', '/legal', '/auditoria'].includes(s)) expect(out, s).toContain('Intentar de nuevo');
    }
    if (mode === 'empty') {
      expect(render('/superadmin/cuentas')).toContain('Todavía nadie se ha registrado');
      expect(render('/superadmin/cuentas?q=zz')).toContain('Nada con «zz»');
      expect(render('/superadmin/ligas')).toContain('Todavía no hay ligas');
      expect(render('/superadmin/auditoria')).toContain('Todavía no hay nada en la auditoría');
      expect(render('/superadmin/anuncios')).toContain('Todavía no se ha mandado ningún anuncio');
      expect(render('/superadmin/errores')).toContain('Sin errores en estos días');
      expect(render('/superadmin/reportes')).toContain('Nada por revisar');
    }
  });
});
