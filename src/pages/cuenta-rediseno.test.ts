/**
 * Rediseño «Calma y foco» de las pantallas de la cuenta, dibujadas sin navegador (renderToString): Entrar (y crear
 * cuenta, y olvidé mi contraseña), la portada sin cuenta, Configuración (Lite y Pro) y las piezas comunes (campo grande,
 * «‹ Inicio», el link con forma de botón).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../components/feedback';

type Auth = {
  user: { uid: string; email: string | null } | null;
  profile: { name: string; username?: string; pushPrefs?: Record<string, boolean> } | null;
  loading: boolean;
  isSuper: boolean;
  recovering: boolean;
};

const state = vi.hoisted(() => ({
  auth: { user: null, profile: null, loading: false, isSuper: false, recovering: false } as Auth,
  pro: false,
  publics: [] as unknown[],
  leagues: [] as unknown[],
  memberships: [] as unknown[],
}));

vi.mock('../lib/auth', async (orig) => {
  const real = await orig<typeof import('../lib/auth')>();
  return {
    ...real,
    useAuth: () => state.auth,
    displayName: (a: Auth) => a.profile?.name ?? 'Jugador',
    syncAfterLogin: () => undefined,
  };
});
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'local', suggestedPro: false }),
}));
vi.mock('../lib/data', async (orig) => {
  const real = await orig<typeof import('../lib/data')>();
  const live = <T,>(data: T) => ({ data, loading: false, error: null });
  return {
    ...real,
    usePublicLeagues: () => live(state.publics),
    useMyMemberships: () => live(state.memberships),
    useLeaguesByIds: () => live(state.leagues),
  };
});
vi.mock('../lib/db/outbox', () => ({ pendingByUser: async () => ({}) }));
vi.mock('../components/home/useHomeData', () => ({ useJoin: () => ({ joining: null, join: () => undefined, modal: null }) }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: LoginPage } = await import('./LoginPage');
const { default: AccountPage } = await import('./AccountPage');
const { Landing, sportsLine, LANDING_PUBLIC } = await import('../components/cuenta/Landing');
const { BackBar, BigInput, CheckRow, linkButton } = await import('../components/cuenta/kit');

const render = (el: ReactNode, url = '/') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, el)));
/** Solo la pantalla (sin el <dialog> de los avisos de la app que va al final). */
const page = (html: string) => html.split('<dialog')[0];
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
/** Cuántos botones o links fuertes (el color del deporte de fondo) hay: el rediseño pone uno solo por pantalla. */
const primaries = (html: string) => (page(html).match(/bg-accent text-accent-fg/g) ?? []).length;

const SIGNED_IN: Auth = {
  user: { uid: 'u1', email: 'ana@correo.com' },
  profile: { name: 'Ana Pérez', username: 'anaperez', pushPrefs: { resultados: true, social: true, recordatorios: true, liga: true } },
  loading: false,
  isSuper: false,
  recovering: false,
};

beforeEach(() => {
  state.auth = { user: null, profile: null, loading: false, isSuper: false, recovering: false };
  state.pro = false;
  state.publics = [];
  state.leagues = [];
  state.memberships = [];
});

describe('Entrar', () => {
  it('«‹ Inicio», un título, Entrar | Crear cuenta como segmentado (no pestañas) y un solo botón fuerte', () => {
    const out = render(h(LoginPage), '/login');
    const t = text(out);
    expect(out).toMatch(/<a [^>]*href="\/"[^>]*>.*?Inicio.*?<\/a>/);
    expect(out).toContain('<h1 class="mt-5 text-title">Entra a tu cuenta</h1>');
    expect(out).toContain('role="radiogroup" aria-label="Entrar o crear cuenta"');
    expect(out).not.toContain('role="tablist"');
    expect(t).toContain('Entrar con Google');
    expect(t).toContain('o con tu correo');
    expect(t).toContain('Olvidé mi contraseña');
    // Los campos grandes de 56 px.
    expect(/<input [^>]*type="email"[^>]*>/.exec(out)?.[0]).toContain('h-14');
    expect(primaries(out)).toBe(1);
    // Al entrar, una línea con los términos (al crear la cuenta lo dicen las casillas).
    expect(t).toContain('Solo para mayores de 18 años.');
  });

  it('volviendo a una pantalla de la app (una invitación), el atrás dice «Volver» y lleva ahí', () => {
    const out = render(h(LoginPage), '/login?next=%2Finvitacion%2Fabc');
    expect(out).toMatch(/<a [^>]*href="\/invitacion\/abc"[^>]*>.*?Volver.*?<\/a>/);
  });

  it('crear cuenta: las dos casillas, el nombre y repetir la contraseña; Google y «Crear cuenta» esperan las casillas', () => {
    const out = render(h(LoginPage), '/login?modo=registro');
    const t = text(out);
    expect(out).toContain('<h1 class="mt-5 text-title">Crea tu cuenta</h1>');
    expect(t).toContain('Tengo 18 años o más.');
    expect(t).toContain('Acepto los Términos y la Política de privacidad');
    expect(t).toContain('Tu nombre');
    expect(t).toContain('Repite la contraseña');
    expect((out.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Registrarme con Google/);
    expect(out).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(t).not.toContain('Solo para mayores de 18 años.');
  });

  it('olvidé mi contraseña: su título, el correo, «Mandar el link» y volver a entrar (sin el segmentado)', () => {
    const out = render(h(LoginPage), '/login?modo=recuperar');
    const t = text(out);
    expect(out).toContain('<h1 class="mt-5 text-title">Olvidé mi contraseña</h1>');
    expect(t).toContain('Mandar el link');
    expect(t).toContain('Volver a entrar');
    expect(out).not.toContain('role="radiogroup"');
  });
});

describe('portada sin cuenta', () => {
  const pub = (id: string, sport = 'bowling') => ({ id, name: `Liga ${id}`, sport, kind: 'liga', logoPath: null, venue: 'Bolera', schedule: null, playerCount: 6 });

  it('«Boliche, pádel, tenis y 7 deportes más»: los abiertos en una línea corta', () => {
    expect(sportsLine([])).toBe('Tu deporte');
    expect(sportsLine(['bowling'])).toBe('Boliche');
    expect(sportsLine(['bowling', 'padel'])).toBe('Boliche y pádel');
    expect(sportsLine(['bowling', 'padel', 'tennis', 'golf'])).toBe('Boliche, pádel, tenis y 1 deporte más');
    expect(sportsLine(['bowling', 'padel', 'tennis', 'golf', 'swimming'])).toBe('Boliche, pádel, tenis y 2 deportes más');
  });

  it('un título, «Crear mi cuenta» (el único fuerte) y «Ya tengo cuenta», con la vuelta a la portada', () => {
    const out = render(h(Landing));
    const t = text(out);
    expect(out).toContain('<h1 class="mt-7 text-title">Tu liga, en el celular</h1>');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2F"');
    expect(out).toContain('href="/login?next=%2F"');
    expect(t).toContain('Crear mi cuenta');
    expect(t).toContain('Ya tengo cuenta');
    expect(primaries(out)).toBe(1);
    // Ya no está el carrusel de deportes ni el banner con degradado.
    expect(out).not.toContain('Elige tu deporte');
    expect(out).not.toContain('bg-gradient');
  });

  it('las ligas abiertas en filas (a lo más 5), con «Unirme», «Ver todas» y «¿Dónde juego esta semana?»', () => {
    state.publics = Array.from({ length: 7 }, (_, i) => pub(`p${i}`));
    const out = render(h(Landing));
    const t = text(out);
    expect(t).toContain('Ligas abiertas');
    expect(out).toContain('href="/ligas"');
    expect((out.match(/href="\/l\/p\d"/g) ?? []).length).toBe(LANDING_PUBLIC);
    expect((out.match(/aria-label="Unirme a Liga p\d"/g) ?? []).length).toBe(LANDING_PUBLIC);
    expect(out).toContain('href="/agenda"');
    expect(t).toContain('¿Dónde juego esta semana?');
    expect(t).toContain('Qué hace por ti');
  });

  it('sin ligas abiertas todavía: lo dice en una línea', () => {
    expect(text(render(h(Landing)))).toContain('Todavía no hay ligas abiertas.');
  });
});

describe('Configuración', () => {
  const league = { id: 'l1', name: 'Liga de los martes', sport: 'bowling', kind: 'liga', logoPath: null };

  it('«‹ Yo», el título, quién eres y todo en filas: cuenta, apariencia, notificaciones, mis ligas, tus datos y MatchMate', () => {
    state.auth = SIGNED_IN;
    state.leagues = [league];
    state.memberships = [{ leagueId: 'l1', role: 'owner' }];
    const out = render(h(AccountPage), '/cuenta');
    const t = text(out);
    expect(out).toMatch(/<a [^>]*href="\/perfil"[^>]*>.*?Yo<\/a>/);
    expect(out).toContain('<h1 class="text-title">Configuración</h1>');
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('@anaperez · ana@correo.com');
    for (const row of ['Tu nombre', 'Tu usuario', 'Contraseña', 'Foto de perfil', 'Tu biografía', 'Personas bloqueadas', 'Cómo ver la app', 'En este teléfono', 'Política de privacidad', 'Descargar mis datos', 'Borrar mi cuenta', 'Acerca de MatchMate', 'Contáctanos', 'Cerrar sesión'])
      expect(t).toContain(row);
    for (const section of ['Perfil público', 'Apariencia', 'Notificaciones', 'Mis ligas', 'Tus datos', 'MatchMate']) expect(out).toContain(`class="text-section">${section}</h2>`);
    // El perfil público va junto a tu cuenta (después de «Tu usuario» y antes de Apariencia).
    expect(t.indexOf('Tu usuario')).toBeLessThan(t.indexOf('Perfil público'));
    expect(t.indexOf('Perfil público')).toBeLessThan(t.indexOf('Apariencia'));
    // Mi liga, con mi papel, abre la liga.
    expect(out).toContain('href="/l/l1"');
    expect(t).toContain('Dueño');
    // Claro, oscuro o automático en un segmentado de 3.
    expect(out).toContain('role="radiogroup" aria-label="Tema"');
    expect((out.match(/role="radio"/g) ?? []).length).toBe(3);
    // Nada de botones sueltos en la pantalla: ninguno fuerte (los «Guardar» van en sus hojas).
    expect(primaries(out)).toBe(0);
    // Sin ser superadmin no sale su panel.
    expect(out).not.toContain('href="/superadmin"');
  });

  it('sin ligas: «Crear o unirme a una liga» como fila; el superadmin ve su panel', () => {
    state.auth = { ...SIGNED_IN, isSuper: true };
    const out = render(h(AccountPage), '/cuenta');
    expect(text(out)).toContain('Crear o unirme a una liga');
    expect(out).toContain('href="/superadmin"');
    expect(text(out)).toContain('Superadmin');
  });

  it('cuenta sin perfil: «¿cómo te llamas?» con su botón (el único fuerte), sin las filas de nombre y usuario', () => {
    state.auth = { ...SIGNED_IN, profile: null };
    const out = render(h(AccountPage), '/cuenta');
    const t = text(out);
    expect(t).toContain('Completa tu cuenta: ¿cómo te llamas?');
    expect(t).not.toContain('Tu usuario');
    expect(t).not.toContain('Perfil público');
    expect(primaries(out)).toBe(1);
  });

  it('en Pro: el título de Pro y las filas más densas', () => {
    state.auth = SIGNED_IN;
    state.pro = true;
    const out = render(h(AccountPage), '/cuenta');
    expect(out).toContain('<h1 class="text-title-pro">Configuración</h1>');
    expect(out).toContain('min-h-row-pro');
    expect(text(out)).toContain('Pro: con todo');
  });
});

describe('piezas de la cuenta', () => {
  it('el campo grande: gris sobre la tarjeta, blanco sobre un bloque gris, y rojo si está mal', () => {
    expect(renderToString(h(BigInput, {}))).toContain('bg-surface-2');
    const raised = renderToString(h(BigInput, { raised: true }));
    expect(raised).toContain('bg-surface ');
    expect(raised).not.toContain('bg-surface-2');
    expect(renderToString(h(BigInput, { 'aria-invalid': true }))).toContain('aria-[invalid=true]:outline-danger');
  });

  it('el link con forma de botón: solo el primario va en el color del deporte', () => {
    expect(linkButton('primary')).toContain('bg-accent text-accent-fg');
    expect(linkButton('quiet')).not.toContain('bg-accent');
    expect(linkButton('primary')).toContain('h-btn');
  });

  it('«‹ Inicio» dice a dónde vuelve y se toca en 44 px; la casilla se toca en toda la fila', () => {
    const back = render(h(BackBar, { to: '/', label: 'Inicio' }));
    expect(back).toMatch(/<a [^>]*class="[^"]*h-11[^"]*"[^>]*href="\/"[^>]*>.*Inicio/);
    const check = renderToString(h(CheckRow, { checked: false, onChange: () => undefined, children: 'Acepto' }));
    expect(check).toMatch(/^<label class="[^"]*min-h-11/);
  });
});
