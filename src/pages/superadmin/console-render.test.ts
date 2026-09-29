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
    useAdminStorageUsage: () => live(d.storageUsage, null),
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

const SECTIONS = ['', '/cuentas', '/ligas', '/deportes', '/anuncios', '/fotos', '/sistema', '/errores', '/auditoria', '/logo'];

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
    for (const label of ['Resumen', 'Cuentas', 'Ligas y torneos', 'Deportes', 'Anuncios', 'Lectura de fotos', 'Sistema', 'Errores', 'Auditoría', 'Marca']) expect(out).toContain(label);
    expect(out).toContain('Superadmin: Randy Dueño');
    expect(out).toContain('(1 avisos)');
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
    // Espacio del plan gratis (admin_storage_usage): barras con el porcentaje, la marca del aviso y lo que falta borrar.
    expect(out).toContain('Espacio del plan gratis');
    expect(out).toContain('Desde el 70 % llega un aviso');
    expect(out).toContain('Base de datos 36 %');
    expect(out).toContain('180 MB de 500 MB');
    expect(out).toContain('Fotos (Storage) 75 %');
    expect(out).toContain('768 MB de 1 GB');
    expect(out).toContain('Último aviso de espacio');
    expect(out).toContain('Fotos por quitar del bucket 12');
    expect(html('/superadmin/sistema')).toContain('aria-valuetext="75 % (768 MB de 1 GB)"');
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
      if (mode === 'error' && ['', '/cuentas', '/ligas', '/fotos', '/errores', '/auditoria'].includes(s)) expect(out, s).toContain('Intentar de nuevo');
    }
    if (mode === 'empty') {
      expect(render('/superadmin/cuentas')).toContain('Todavía nadie se ha registrado');
      expect(render('/superadmin/cuentas?q=zz')).toContain('Nada con «zz»');
      expect(render('/superadmin/ligas')).toContain('Todavía no hay ligas');
      expect(render('/superadmin/auditoria')).toContain('Todavía no hay nada en la auditoría');
      expect(render('/superadmin/anuncios')).toContain('Todavía no se ha mandado ningún anuncio');
      expect(render('/superadmin/errores')).toContain('Sin errores en estos días');
    }
  });
});
