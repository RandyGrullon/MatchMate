/**
 * La barra de secciones dibujada sin navegador (renderToString): con cuenta Hoy · Social · Ligas · Yo (Lite) o Hoy ·
 * Social · Ligas · Organizar · Yo (Pro, con el número de lo pendiente); sin cuenta Inicio · Contáctanos · Acerca de ·
 * Entrar (que vuelve a la pantalla en que estaba). Sin botón de crear ni pestaña de avisos. Y la barra de arriba: en el
 * teléfono solo dentro de una liga (con la lupa); en la computadora, la lupa antes de las secciones.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  pro: false,
  organize: { href: '/organizar', total: 0 },
  leagues: [] as { id: string; sport: string }[],
  active: null as string | null,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../lib/backend', () => ({ backendMode: () => 'supabase' }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'local', suggestedPro: false }),
}));
vi.mock('../lib/data/members', () => ({ useMyMemberships: () => ({ data: state.leagues.map((l) => ({ leagueId: l.id })), loading: false, error: null }) }));
vi.mock('../lib/data/leagues', () => ({ useLeaguesByIds: () => ({ data: state.leagues, loading: false, error: null }) }));
vi.mock('../lib/sportContext', () => ({ useActiveSport: () => state.active, setActiveSport: () => undefined }));
vi.mock('./OrganizeNav', () => ({ useOrganize: (on: boolean) => ({ href: state.organize.href, total: on ? state.organize.total : 0, probes: null }) }));
vi.mock('./Notifications', () => ({ NotificationsBell: () => h('span', null, 'CAMPANA') }));
vi.mock('./NoticeSlot', () => ({ NoticeSlot: () => h('div', { 'data-slot': '' }) }));
vi.mock('./SportSwitcher', () => ({ SportChip: () => h('span', null, 'SELECTOR') }));
vi.mock('./OutboxIndicator', () => ({ OutboxIndicator: () => null }));

// La barra «Sin conexión» lee navigator.onLine (en Node no hay navegador).
vi.stubGlobal('navigator', { onLine: true });

const { AppFrame, BottomNav, DesktopNav, currentSection, navSections, ownSportTint, showSportSwitcher, usesOwnTint } = await import('./Shell');
const { announceMode, hideModeToast } = await import('./mode/ModeToast');

const render = (el: ReturnType<typeof h>, url = '/') => renderToString(h(MemoryRouter, { initialEntries: [url] }, el));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/** El link marcado (aria-current) tiene ese href. */
const currentHref = (html: string) => /<a[^>]*aria-current="page"[^>]*href="([^"]*)"|<a[^>]*href="([^"]*)"[^>]*aria-current="page"/.exec(html)?.slice(1).find(Boolean);

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.pro = false;
  state.organize = { href: '/organizar', total: 0 };
  state.leagues = [{ id: 'L1', sport: 'bowling' }];
  state.active = null;
});

describe('secciones de la barra', () => {
  it('con cuenta en Lite: Hoy, Social, Ligas y Yo; en Pro se suma Organizar antes de Yo', () => {
    expect(navSections(true).map((s) => [s.label, s.to])).toEqual([
      ['Hoy', '/'],
      ['Social', '/social'],
      ['Ligas', '/ligas'],
      ['Yo', '/perfil'],
    ]);
    expect(navSections(true, true).map((s) => s.label)).toEqual(['Hoy', 'Social', 'Ligas', 'Organizar', 'Yo']);
    expect(navSections(true, true).map((s) => s.key)).toEqual(['home', 'social', 'leagues', 'organize', 'me']);
  });

  it('sin cuenta: Inicio, Contáctanos, Acerca de y Entrar', () => {
    expect(navSections(false).map((s) => [s.label, s.to])).toEqual([
      ['Inicio', '/'],
      ['Contáctanos', '/contacto'],
      ['Acerca de', '/acerca'],
      ['Entrar', '/login'],
    ]);
    // Pro no cambia nada sin cuenta.
    expect(navSections(false, true).map((s) => s.label)).not.toContain('Organizar');
    // Social es solo con cuenta (sin cuenta la lupa sigue arriba en la computadora: busca ligas).
    expect(navSections(false).map((s) => s.label)).not.toContain('Social');
  });

  it('cada ruta marca su pestaña: Avisos es de Hoy, buscar y los perfiles de Social, la liga de Ligas, la cuenta de Yo', () => {
    const lite = navSections(true);
    const at = (p: string) => currentSection(lite, p);
    expect(at('/')).toBe('home');
    expect(at('/avisos')).toBe('home');
    expect(at('/d/bowling')).toBe('home');
    for (const p of ['/ligas', '/l/L1', '/l/L1/ranking', '/l/L1/e/E1', '/unirse/ABCD', '/agenda', '/invitacion/i1']) expect(at(p)).toBe('leagues');
    // Esports (el índice, cada juego, equipos, unirse a un equipo e IDs de juego) es de Ligas.
    for (const p of ['/esports', '/esports/valorant', '/esports/equipo/T1', '/esports/unirse/ABCD2345', '/esports/mi-id']) expect(at(p)).toBe('leagues');
    expect(at('/esportsx')).toBeNull();
    for (const p of ['/perfil', '/cuenta', '/bolas', '/juegos-sueltos']) expect(at(p)).toBe('me');
    // Social: el feed, una publicación, la lupa y el perfil de otra cuenta (buscar ya no es de Yo).
    for (const p of ['/social', '/p/P1', '/buscar', '/u/u2']) expect(at(p)).toBe('social');
    expect(at('/socialx')).toBeNull();
    expect(at('/buscarx')).toBeNull();
    // El muro de una liga sigue siendo de Ligas.
    expect(at('/l/L1/muro')).toBe('leagues');
    expect(at('/acerca')).toBeNull();
    // /ligasx no es /ligas.
    expect(at('/ligasx')).toBeNull();
  });

  it('el admin de una liga es de Ligas en Lite y de Organizar en Pro (y la consola también)', () => {
    expect(currentSection(navSections(true), '/l/L1/admin')).toBe('leagues');
    const pro = navSections(true, true);
    expect(currentSection(pro, '/l/L1/admin')).toBe('organize');
    expect(currentSection(pro, '/l/L1/admin?tab=aprobar'.split('?')[0])).toBe('organize');
    expect(currentSection(pro, '/organizar')).toBe('organize');
    expect(currentSection(pro, '/superadmin/errores')).toBe('organize');
    // El resto de la liga sigue siendo Ligas.
    expect(currentSection(pro, '/l/L1/e/E1')).toBe('leagues');
  });
});

describe('la barra de abajo', () => {
  it('Lite: Hoy · Social · Ligas · Yo con ícono y nombre; sin crear ni avisos; Ligas marcada dentro de una liga', () => {
    const out = render(h(BottomNav), '/l/L1/ranking');
    const t = text(out);
    expect(t).toMatch(/Hoy .*Social .*Ligas .*Yo/);
    expect(t).not.toContain('Organizar');
    expect(t).not.toContain('Avisos');
    expect(t).not.toContain('CAMPANA');
    expect(out).not.toContain('Crear');
    expect(out.match(/<a /g)).toHaveLength(4);
    expect(out.match(/<svg/g)).toHaveLength(4);
    expect(currentHref(out)).toBe('/ligas');
    expect(out).toContain('href="/social"');
    expect(out).toContain('href="/perfil"');
  });

  it('Social marcada en el feed, una publicación, la lupa y el perfil de otra cuenta', () => {
    for (const p of ['/social', '/p/P1', '/buscar?q=ana', '/u/u2']) expect(currentHref(render(h(BottomNav), p))).toBe('/social');
    expect(currentHref(render(h(BottomNav), '/perfil'))).toBe('/perfil');
  });

  it('el destino elegido: la pastilla en acento suave detrás del ícono y el nombre en el color del texto', () => {
    const out = render(h(BottomNav), '/');
    const on = /<a[^>]*aria-current="page"[^>]*>(.*?)<\/a>/.exec(out)![0];
    expect(on).toMatch(/class="[^"]*text-fg[^"]*"/);
    expect(on).toMatch(/<span class="[^"]*h-8 w-15[^"]*bg-accent-soft text-accent[^"]*">/);
    expect(on).toContain('stroke-width="2.2"');
    const off = /<a(?![^>]*aria-current)[^>]*href="\/ligas"[^>]*>(.*?)<\/a>/.exec(out)![0];
    expect(off).toMatch(/class="[^"]*text-muted/);
    expect(off).not.toContain('bg-accent-soft');
  });

  it('Pro: Organizar con el número de lo pendiente (globo y etiqueta para el lector de pantalla)', () => {
    state.pro = true;
    state.organize = { href: '/l/L1/admin', total: 3 };
    const out = render(h(BottomNav), '/l/L1/admin');
    const t = text(out);
    expect(t).toMatch(/Hoy .*Social .*Ligas .*Organizar .*Yo/);
    expect(out.match(/<a /g)).toHaveLength(5);
    expect(out.match(/<svg/g)).toHaveLength(5);
    expect(currentHref(out)).toBe('/l/L1/admin');
    expect(out).toContain('aria-label="Organizar: 3 pendientes"');
    expect(out).toMatch(/<span aria-hidden="true" class="[^"]*bg-accent[^"]*text-accent-fg[^"]*">3<\/span>/);
  });

  it('Pro sin nada pendiente: Organizar sin globo; más de 99 dice 99+', () => {
    state.pro = true;
    let out = render(h(BottomNav), '/');
    expect(out).not.toContain('pendiente');
    expect(out).toContain('href="/organizar"');
    state.organize = { href: '/organizar', total: 120 };
    out = render(h(BottomNav), '/');
    expect(out).toContain('>99+<');
    expect(out).toContain('aria-label="Organizar: 120 pendientes"');
  });

  it('los cinco de Pro caben en 360 px: cada destino se reparte el ancho y la pastilla se achica si hace falta', () => {
    state.pro = true;
    const out = render(h(BottomNav), '/');
    const links = out.match(/<a [^>]*class="[^"]*"/g)!;
    expect(links).toHaveLength(5);
    for (const a of links) expect(a).toMatch(/min-w-0 flex-1/);
    expect(out.match(/h-8 w-15 max-w-full shrink-0/g)).toHaveLength(5);
    expect(out.match(/max-w-full truncate/g)).toHaveLength(5);
  });

  it('sin cuenta: Inicio, Contáctanos, Acerca de y Entrar (vuelve aquí)', () => {
    state.auth = { user: null, loading: false };
    state.pro = true;
    const out = render(h(BottomNav), '/acerca');
    const t = text(out);
    expect(t).toMatch(/Inicio .*Contáctanos .*Acerca de .*Entrar/);
    expect(t).not.toContain('Ligas');
    expect(t).not.toContain('Organizar');
    expect(out).toContain('href="/login?next=%2Facerca"');
    expect(currentHref(out)).toBe('/acerca');
  });

  it('mientras se lee la sesión se quedan las de con cuenta (no parpadea)', () => {
    state.auth = { user: null, loading: true };
    const t = text(render(h(BottomNav)));
    expect(t).toContain('Ligas');
    expect(t).not.toContain('Contáctanos');
  });

  it('arriba en la computadora: las mismas secciones, sin «Crear»', () => {
    let out = render(h(DesktopNav));
    let t = text(out);
    expect(t).toMatch(/Hoy .*Social .*Ligas .*Yo/);
    expect(t).not.toContain('Crear');
    // Con cuatro, siempre con su nombre; con cinco (Pro), de 640 a 767 px solo los íconos (el nombre, para el lector).
    expect(out).not.toContain('max-md:sr-only');
    state.pro = true;
    out = render(h(DesktopNav));
    expect(text(out)).toMatch(/Hoy .*Social .*Ligas .*Organizar .*Yo/);
    expect(out.match(/<span class="max-md:sr-only">/g)).toHaveLength(5);
    expect(out).toContain('title="Social"');
    state.pro = false;
    state.auth = { user: null, loading: false };
    out = render(h(DesktopNav), '/contacto');
    t = text(out);
    expect(t).toMatch(/Inicio .*Contáctanos .*Acerca de .*Entrar/);
    expect(currentHref(out)).toBe('/contacto');
  });
});

describe('la barra de arriba y el selector de deporte', () => {
  it('el selector solo para quien juega más de un deporte (o quedó en uno que no es el suyo)', () => {
    expect(showSportSwitcher(['bowling'], null)).toBe(false);
    expect(showSportSwitcher(['bowling'], 'bowling')).toBe(false);
    expect(showSportSwitcher([], null)).toBe(false);
    expect(showSportSwitcher(['bowling', 'padel'], null)).toBe(true);
    expect(showSportSwitcher(['bowling'], 'padel')).toBe(true);
  });

  it('la lupa arriba en la computadora, antes de las secciones (con cuenta y sin ella)', () => {
    const headerOf = (html: string) => /<header[^>]*>(.*?)<\/header>/.exec(html)![1];
    let header = headerOf(render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/ligas'));
    expect(header).toContain('aria-label="Buscar personas y ligas"');
    expect(header).toContain('href="/buscar"');
    expect(header.indexOf('href="/buscar"')).toBeLessThan(header.indexOf('aria-label="Secciones"'));
    state.auth = { user: null, loading: false };
    header = headerOf(render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/acerca'));
    expect(header).toContain('aria-label="Buscar personas y ligas"');
  });

  it('una cuenta de un solo deporte: sin selector y sin barra arriba en el teléfono (cada pantalla trae su título)', () => {
    const out = render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/ligas');
    expect(out).not.toContain('SELECTOR');
    expect(out).toMatch(/class="[^"]*sticky top-0[^"]*max-sm:hidden/);
    expect(out).not.toContain('Configuración de la cuenta');
    expect(out).toContain('CONTENIDO');
    // El lugar del aviso para las pantallas que no ponen el suyo, antes del contenido.
    expect(out.indexOf('data-slot')).toBeLessThan(out.indexOf('CONTENIDO'));
  });

  it('con varios deportes, el selector arriba solo en la computadora: en el teléfono no hay barra (chips en Ligas)', () => {
    state.leagues = [
      { id: 'L1', sport: 'bowling' },
      { id: 'L2', sport: 'padel' },
    ];
    const out = render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/');
    expect(out).toMatch(/<div class="contents max-sm:hidden">(?:(?!<\/header>).)*SELECTOR/);
    expect(out).toMatch(/class="[^"]*sticky top-0[^"]*max-sm:hidden/);
  });

  it('dentro de una liga la barra de arriba sigue (su nombre y sus pestañas), sin selector si juega uno', () => {
    const out = render(h(AppFrame, { middle: h('b', null, 'LIGA'), subnav: h('i', null, 'PESTAÑAS'), children: h('p', null, 'CONTENIDO') }), '/l/L1');
    expect(out).toContain('LIGA');
    expect(out).toContain('PESTAÑAS');
    expect(out).not.toContain('SELECTOR');
    expect(out).not.toMatch(/class="[^"]*sticky top-0[^"]*max-sm:hidden/);
    // Con la barra, la lupa también en el teléfono (no se esconde).
    const lupa = /<a[^>]*aria-label="Buscar personas y ligas"[^>]*>/.exec(out)![0];
    expect(lupa).not.toContain('hidden');
  });
});

describe('un solo acento fuera de las ligas aunque la app quedó en otro deporte', () => {
  it('el color de tu deporte (el boliche si lo juegas), también si juegas el otro (entraste a tu liga de pádel)', () => {
    expect(ownSportTint(['bowling'], 'padel')).toBe('bowling');
    expect(ownSportTint(['padel', 'bowling'], 'tennis')).toBe('bowling');
    expect(ownSportTint(['bowling', 'padel'], 'padel')).toBe('bowling');
    expect(ownSportTint(['padel'], 'tennis')).toBe('padel');
    // Juegas solo pádel y la app no tiene deporte (el morado de siempre): el del pádel.
    expect(ownSportTint(['padel'], null)).toBe('padel');
    expect(ownSportTint(['bowling'], 'bowling')).toBeNull();
    expect(ownSportTint(['bowling'], null)).toBeNull();
    expect(ownSportTint(['padel'], 'padel')).toBeNull();
    expect(ownSportTint([], 'padel')).toBeNull();
  });

  it('fuera de una liga (Hoy, Ligas, Yo, Organizar); adentro, el de la liga; en /d/:sport, ese deporte', () => {
    for (const p of ['/', '/ligas', '/perfil', '/organizar', '/avisos']) expect(usesOwnTint(p)).toBe(true);
    for (const p of ['/l/L1', '/l/L1/e/E1', '/d/padel']) expect(usesOwnTint(p)).toBe(false);
  });

  it('Hoy y Ligas (y su barra) van en el color del boliche aunque la app quedó en pádel; «Pádel ▾» arriba sigue en el suyo', () => {
    state.active = 'padel';
    const hoy = render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/');
    expect(hoy).toMatch(/<div class="mm-tint-bowling [^"]*min-h-dvh/);
    expect(hoy).toMatch(/class="mm-tint-padel contents"[^>]*>(<style[^>]*>[^<]*<\/style>)?<span>SELECTOR/);
    const ligas = render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/ligas');
    expect(ligas).toMatch(/<div class="mm-tint-bowling [^"]*min-h-dvh/);
    // Dentro de una liga (la de pádel), el color de la app (el de la liga).
    expect(render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/l/L2')).not.toContain('mm-tint-bowling');
  });
});

describe('«Modo Pro activado · Deshacer»', () => {
  it('sale abajo al cambiar de modo (en cualquier pantalla) y se quita', () => {
    announceMode('lite', 'pro');
    const out = text(render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/perfil'));
    expect(out).toContain('Modo Pro activado Ahora ves Organizar y todos tus números Deshacer');
    hideModeToast();
    expect(text(render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/perfil'))).not.toContain('Modo Pro activado');
    // Al mismo modo no se anuncia nada.
    announceMode('pro', 'pro');
    expect(text(render(h(AppFrame, null, h('p', null, 'CONTENIDO')), '/'))).not.toContain('Deshacer');
  });
});
