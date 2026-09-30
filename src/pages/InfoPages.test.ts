/**
 * Acerca de (/acerca) y Contáctanos (/contacto) dibujadas sin navegador (renderToString), con y sin cuenta, y el
 * correo que arma el formulario de contacto.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: null as { uid: string; email: string | null } | null, profile: null as { name: string } | null, loading: false },
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => state.auth,
  displayName: (a: { profile: { name: string } | null }) => a.profile?.name ?? 'Jugador',
}));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: AboutPage, ABOUT_FEATURES, ABOUT_STEPS, ABOUT_TAGLINE, sportGridCols } = await import('./AboutPage');
const { default: ContactPage, CONTACT_EMAIL, CONTACT_MAX, CONTACT_REASONS, contactMailto } = await import('./ContactPage');

const render = (page: () => ReactNode, url: string) => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(page))));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: null, profile: null, loading: false };
});

describe('Acerca de', () => {
  it('sin cuenta: el logo, la frase, los 9 deportes, qué puedes hacer, cómo empezar, entrar y crear cuenta', () => {
    const out = render(AboutPage, '/acerca');
    const t = text(out);
    expect(out).toContain('aria-label="MatchMate"');
    expect(t).toContain(ABOUT_TAGLINE);
    expect(ABOUT_TAGLINE).toBe('Tus ligas, tus juegos y tus estadísticas en un solo lugar');
    for (const name of ['Boliche', 'Pádel', 'Tenis', 'Pickleball', 'Baloncesto', 'Fútbol', 'Golf', 'Natación', 'Ping pong']) expect(t).toContain(name);
    // Un cuadro por deporte (el fútbol de campo y el de sala, uno solo), que lleva a su Home.
    expect(out.match(/href="\/d\/[a-z_]+"/g)).toHaveLength(9);
    // 9 cuadros en 3 columnas: 3 filas llenas (con 4 columnas el ping pong quedaba solo en la tercera).
    expect(out).toContain('class="grid grid-cols-3 gap-2"');
    expect([8, 9, 10, 12].map(sportGridCols)).toEqual(['grid-cols-4', 'grid-cols-3', 'grid-cols-4', 'grid-cols-4']);
    // El ping pong lleva su otro nombre en el nombre accesible del cuadro.
    expect(out).toContain('href="/d/table_tennis"');
    expect(out).toContain('aria-label="Ping pong (tenis de mesa)"');
    expect(out).toContain('href="/d/bowling"');
    expect(t).toContain('Qué puedes hacer');
    expect(ABOUT_FEATURES).toHaveLength(6);
    for (const f of ABOUT_FEATURES) expect(t).toContain(f.title);
    expect(t).toContain('Leer la foto del marcador');
    expect(t).toContain('Cómo empezar');
    expect(ABOUT_STEPS).toHaveLength(3);
    for (const s of ABOUT_STEPS) expect(t).toContain(s.title);
    expect(out).toContain('href="/login?modo=registro"');
    expect(out).toContain('href="/login"');
    expect(t).toContain('Crear cuenta');
    expect(out).toContain('href="/privacidad"');
    expect(out).toContain('href="/terminos"');
    expect(out).toContain('href="/contacto"');
    // La versión de la app (en las pruebas, la de desarrollo).
    expect(t).toMatch(/Versión \S+/);
  });

  it('con cuenta: sin entrar ni crear cuenta, con un link al Home', () => {
    state.auth = { user: { uid: 'u1', email: 'ana@correo.com' }, profile: { name: 'Ana' }, loading: false };
    const out = render(AboutPage, '/acerca');
    expect(out).not.toContain('href="/login');
    expect(text(out)).toContain('Ir al Home');
  });
});

describe('Contáctanos', () => {
  it('el correo (link y copiar), el formulario con sus motivos y las preguntas', () => {
    const out = render(ContactPage, '/contacto');
    const t = text(out);
    expect(CONTACT_EMAIL).toBe('matchmate.oficial@gmail.com');
    expect(out).toContain('href="mailto:matchmate.oficial@gmail.com"');
    // Toda la fila del correo es el link, de al menos 44 px de alto.
    expect(out).toMatch(/<a href="mailto:matchmate\.oficial@gmail\.com" class="[^"]*min-h-11[^"]*">.*Nuestro correo/);
    expect(t).toContain('Copiar correo');
    expect(t).toContain('Nombre');
    expect(t).toContain('Tu correo (opcional)');
    expect(t).toContain('Motivo');
    for (const r of CONTACT_REASONS) expect(out).toContain(`<option value="${r}"`);
    expect(t).toContain('Mensaje');
    expect(t).toContain('Escribir el correo');
    expect(t).toContain('Se abre tu app de correo con el mensaje listo.');
    // Sin mensaje todavía: el botón espera.
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    for (const q of ['¿Cuánto cuesta?', '¿Cómo creo una liga?', '¿Cómo me uno a una liga?', '¿Qué pasa con mis datos?']) expect(t).toContain(q);
    expect(t).toContain('gratis');
    expect(out).toContain('href="/privacidad"');
  });

  it('con cuenta: el nombre y el correo ya puestos', () => {
    state.auth = { user: { uid: 'u1', email: 'ana@correo.com' }, profile: { name: 'Ana Pérez' }, loading: false };
    const out = render(ContactPage, '/contacto');
    expect(out).toContain('value="Ana Pérez"');
    expect(out).toContain('value="ana@correo.com"');
  });

  it('arma el correo: asunto con el motivo y en el cuerpo el mensaje, el nombre y el correo para responder', () => {
    const url = contactMailto({ name: ' Ana ', email: ' ana@correo.com ', reason: 'Algo no funciona', message: ' No me deja anotar.\nAyuda ' });
    expect(url.startsWith('mailto:matchmate.oficial@gmail.com?subject=')).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('subject')).toBe('MatchMate · Algo no funciona');
    const body = params.get('body')!;
    expect(body).toContain('No me deja anotar.\nAyuda');
    expect(body).toContain('Nombre: Ana');
    expect(body).toContain('Correo para responder: ana@correo.com');
    // Espacios como %20 (no «+»): las apps de correo no traducen el «+».
    expect(url).not.toContain('+');
  });

  it('sin correo no pone esa línea; un motivo raro sale como «Otro»; el mensaje se corta', () => {
    const url = contactMailto({ name: '', email: '', reason: 'hackeo', message: 'x'.repeat(CONTACT_MAX + 50) });
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('subject')).toBe('MatchMate · Otro');
    const body = params.get('body')!;
    expect(body).not.toContain('Correo para responder');
    expect(body).toContain('Nombre: Sin nombre');
    expect(body.split('\r\n')[0]).toHaveLength(CONTACT_MAX);
  });
});
