/**
 * Página de avisos dibujada sin navegador (renderToString) con avisos de mentira: sin cuenta, cargando, vacía, con
 * error, los filtros por tipo y por deporte (también el deporte en el que está la app), lo sin leer y la tarjeta de
 * invitaciones a ligas.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueFeed } from '../lib/data';
import type { LeagueInvite } from '../lib/data/invites';
import type { Notice } from '../lib/notifications';
import type { League } from '../lib/types';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  current: null as string | null,
  notices: {} as Record<string, unknown>,
  invites: [] as LeagueInvite[],
  askedInvites: [] as (string | null | undefined)[],
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../components/Notifications', () => ({ useNotifications: () => state.notices }));
vi.mock('../components/NotificationsOptIn', () => ({ PushOptInNotice: () => null }));
vi.mock('../components/NoticeSlot', () => ({ NoticeSlot: () => h('div', { 'data-slot': '' }) }));
vi.mock('../components/notifications/bridge', () => ({ useCurrentSport: () => state.current }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../lib/data/invites', () => ({
  useMyInvites: (uid: string | null | undefined) => {
    state.askedInvites.push(uid);
    return { data: state.invites, loading: false, error: null };
  },
  respondInvite: vi.fn(),
  respondErrorText: () => 'No se pudo responder la invitación. Prueba otra vez.',
}));

const { default: NotificationsPage } = await import('./NotificationsPage');

const now = Date.now();
const HOUR = 3600_000;

const notice = (id: string, extra: Partial<Notice> = {}): Notice => ({
  id,
  kind: 'por-confirmar',
  category: 'partidos',
  title: `Aviso ${id}`,
  body: 'Detalle',
  lid: 'mm',
  leagueName: 'Pádel Club',
  leagueKind: 'liga',
  private: false,
  sport: 'padel',
  to: `/l/mm/juegos?partido=${id}`,
  time: now - HOUR,
  ...extra,
});

const league = (id: string, sport: string) => ({ id, name: id, sport }) as League;
const feed = (lid: string, isAdmin = false) => ({ lid, isAdmin }) as LeagueFeed;

const ITEMS = [
  notice('partido'),
  notice('torneo', { kind: 'torneo', category: 'ligas', sport: 'bowling', lid: 'l1', leagueName: 'Liga Norte', to: '/l/l1/e/t' }),
  notice('seguir', { kind: 'social', category: 'social', sport: null, lid: '', leagueName: '', to: '/perfil/ana', title: 'Ana te empezó a seguir' }),
];

function setNotices(extra: Record<string, unknown> = {}) {
  state.notices = {
    items: ITEMS,
    isUnread: (n: Notice) => n.id !== 'torneo',
    markRead: () => undefined,
    markAllRead: () => undefined,
    markSeen: () => undefined,
    loading: false,
    error: null,
    emptyText: 'Aquí te avisamos de tus partidos.',
    feeds: [feed('mm'), feed('l1')],
    leagues: [league('mm', 'padel'), league('l1', 'bowling')],
    ...extra,
  };
}

const render = (url = '/avisos') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(NotificationsPage))));
/** Texto visible (sin etiquetas), para buscar frases. */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");

const invite = (id: string, extra: Partial<LeagueInvite> = {}): LeagueInvite => ({
  id,
  leagueId: `l-${id}`,
  leagueName: `Liga ${id}`,
  logoPath: null,
  sport: 'bowling',
  kind: 'liga',
  visibility: 'private',
  members: 8,
  invitedBy: { id: 'u9', name: 'Ana Pérez', username: 'ana' },
  createdAt: new Date(now - 2 * HOUR).toISOString(),
  ...extra,
});

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.current = null;
  state.invites = [];
  state.askedInvites = [];
  setNotices();
});

describe('página de avisos', () => {
  it('sin cuenta: invita a entrar y vuelve a /avisos', () => {
    state.auth = { user: null, loading: false };
    const out = render();
    expect(text(out)).toContain('Entra para ver tus avisos');
    expect(out).toContain('href="/login?next=%2Favisos"');
  });

  it('arriba: «‹ Hoy» (se llega con la campana de Hoy), el título grande y el único aviso de la pantalla', () => {
    const out = render();
    expect(out).toMatch(/<a [^>]*href="\/"[^>]*>.*?Hoy<\/a>/);
    expect(out).toContain('<h1 class="text-title">Avisos</h1>');
    // El aviso (instalar o activar las notificaciones) va en su lugar, antes de las invitaciones y la lista.
    expect(out).toContain('data-slot');
    expect(out.indexOf('data-slot')).toBeLessThan(out.indexOf('Aviso partido'));
    // Sin cuenta también se puede volver a Hoy.
    state.auth = { user: null, loading: false };
    expect(render()).toMatch(/<a [^>]*href="\/"[^>]*>.*?Hoy<\/a>/);
  });

  it('todos los avisos, por grupo, con lo sin leer y «Marcar todo como leído»', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Avisos');
    expect(t).toContain('2 sin leer');
    expect(t).toContain('Marcar todo como leído');
    for (const label of ['Todo', 'Partidos y resultados', 'Mis ligas', 'Social']) expect(t).toContain(label);
    // Admin solo para quien organiza.
    expect(t).not.toContain('Admin');
    expect(t).toContain('Aviso partido');
    expect(t).toContain('Aviso torneo');
    expect(t).toContain('Ana te empezó a seguir');
    // Varios deportes: su fila de filtros.
    expect(out).toContain('aria-label="Filtrar avisos por deporte"');
  });

  it('el organizador ve el filtro Admin', () => {
    setNotices({ feeds: [feed('mm', true)] });
    expect(text(render())).toContain('Admin');
  });

  it('por tipo (?ver=social): solo lo social', () => {
    const t = text(render('/avisos?ver=social'));
    expect(t).toContain('Ana te empezó a seguir');
    expect(t).not.toContain('Aviso partido');
    expect(t).not.toContain('Aviso torneo');
  });

  it('por deporte (?deporte=padel): lo de ese deporte y lo que no es de ninguno, con el deporte arriba', () => {
    const t = text(render('/avisos?deporte=padel'));
    expect(t).toContain('Pádel · 2 sin leer');
    expect(t).toContain('Aviso partido');
    expect(t).toContain('Ana te empezó a seguir');
    expect(t).not.toContain('Aviso torneo');
  });

  it('si la app está en un deporte, arranca en ese; ?deporte=todos los muestra todos', () => {
    state.current = 'bowling';
    const inSport = text(render());
    expect(inSport).toContain('Boliche · 1 sin leer');
    expect(inSport).toContain('Aviso torneo');
    expect(inSport).not.toContain('Aviso partido');
    const all = text(render('/avisos?deporte=todos'));
    expect(all).toContain('Aviso partido');
    expect(all).toContain('Aviso torneo');
  });

  it('en un deporte del que no tiene ligas: nada de los otros deportes (sí lo que no es de ninguno)', () => {
    state.current = 'tennis';
    const out = render();
    const t = text(out);
    expect(t).toContain('Tenis');
    expect(t).toContain('Ana te empezó a seguir');
    expect(t).not.toContain('Aviso partido');
    expect(t).not.toContain('Aviso torneo');
    // Un deporte que esta versión no conoce no filtra.
    state.current = 'curling';
    expect(text(render())).toContain('Aviso torneo');
  });

  it('con un solo deporte no hay filtro de deporte', () => {
    setNotices({ leagues: [league('mm', 'padel')] });
    expect(render()).not.toContain('Filtrar avisos por deporte');
  });

  it('un filtro sin avisos: lo dice y ofrece ver todos', () => {
    const t = text(render('/avisos?ver=partidos&deporte=bowling'));
    expect(t).toContain('Nada por aquí');
    expect(t).toContain('No tienes avisos de partidos ni resultados de boliche por ahora.');
    expect(t).toContain('Ver todos los avisos');
  });

  it('sin avisos, cargando o con error', () => {
    setNotices({ items: [] });
    const empty = text(render());
    expect(empty).toContain('No tienes avisos');
    expect(empty).toContain('Aquí te avisamos de tus partidos.');
    setNotices({ items: [], loading: true });
    expect(render()).toContain('aria-busy="true"');
    setNotices({ items: [], error: new Error('sin señal') });
    expect(text(render())).toContain('No se pudieron cargar los datos');
  });

  it('todo leído: «Estás al día» y el botón apagado', () => {
    setNotices({ isUnread: () => false });
    const out = render();
    expect(text(out)).toContain('Estás al día');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>.*Marcar todo como leído/);
  });
});

describe('invitaciones en la página de avisos', () => {
  it('sin invitaciones pendientes no sale la tarjeta', () => {
    const t = text(render());
    expect(t).not.toContain('Invitaciones');
    expect(state.askedInvites).toContain('u1');
  });

  it('arriba de la lista: la liga, quién invitó, Aceptar / Rechazar y «Ver»', () => {
    state.invites = [invite('a'), invite('b', { invitedBy: null, kind: 'torneo', leagueName: 'Copa Verano' })];
    const out = render();
    const t = text(out);
    expect(t).toContain('Invitaciones');
    expect(t).toContain('Liga a');
    expect(t).toContain('Ana Pérez (@ana) te invitó · Liga privada');
    expect(t).toContain('hace 2 h');
    expect(t).toContain('Copa Verano');
    expect(t).toContain('Te invitaron · Torneo');
    expect(out).toContain('href="/invitacion/a"');
    expect(out).toContain('href="/invitacion/b"');
    expect(out).toContain('aria-label="Aceptar la invitación a Liga a"');
    expect(out).toContain('aria-label="Rechazar la invitación a Copa Verano"');
    expect(out.match(/>Aceptar</g)).toHaveLength(2);
    expect(out.match(/>Rechazar</g)).toHaveLength(2);
    // La tarjeta va antes de la lista de avisos.
    expect(t.indexOf('Invitaciones')).toBeLessThan(t.indexOf('Aviso partido'));
  });

  it('los botones nunca van dentro de un link', () => {
    state.invites = [invite('a')];
    const out = render();
    for (const link of out.match(/<a [^>]*>.*?<\/a>/g) ?? []) expect(link).not.toContain('<button');
  });

  it('también con la lista vacía (sin otros avisos)', () => {
    state.invites = [invite('a')];
    setNotices({ items: [] });
    const t = text(render());
    expect(t).toContain('Invitaciones');
    expect(t).toContain('No tienes avisos');
  });
});
