/**
 * Juegos sueltos (/juegos-sueltos) dibujada sin navegador (renderToString) con juegos de mentira: sin cuenta, vacía,
 * cargando, la lista por mes (con el candado de los que no salen en el perfil), y la hoja abierta con ?juego= y
 * ?nuevo=1.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Live } from '../lib/data/client';
import type { SoloSession } from '../lib/data/solo';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  solo: { data: [], loading: false, error: null } as Live<SoloSession[]>,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../lib/data/solo', async (orig) => ({
  ...(await orig<typeof import('../lib/data/solo')>()),
  useMySoloSessions: () => state.solo,
}));

const { default: SoloGamesPage } = await import('./SoloGamesPage');

const session = (id: string, playedOn: string, scores: number[], extra: Partial<SoloSession> = {}): SoloSession => ({
  id,
  userId: 'u1',
  playedOn,
  venue: '',
  note: '',
  scores,
  frames: null,
  shared: true,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  likes: 0,
  likedByMe: false,
  ...extra,
});

const render = (url = '/juegos-sueltos') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(SoloGamesPage))));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const LIST = [
  session('s1', '2026-09-27', [210, 180, 190], { venue: 'Bolera Norte', likes: 2 }),
  session('s2', '2026-09-05', [150], { venue: 'Club Sur', shared: false }),
  session('s3', '2026-08-30', [170, 160], { pending: true, local: true }),
];

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.solo = { data: [], loading: false, error: null };
});

describe('juegos sueltos', () => {
  it('sin cuenta: Entrar y Crear cuenta vuelven aquí (con lo que iba a hacer)', () => {
    state.auth = { user: null, loading: false };
    const out = render('/juegos-sueltos?nuevo=1');
    expect(text(out)).toContain('Entra para anotar tus juegos sueltos');
    expect(out).toContain('href="/login?next=%2Fjuegos-sueltos%3Fnuevo%3D1"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fjuegos-sueltos%3Fnuevo%3D1"');
  });

  it('vacía: qué es y el botón para anotar', () => {
    const t = text(render());
    expect(t).toContain('Juegos sueltos');
    expect(t).toContain('Tus juegos de boliche fuera de una liga o torneo');
    expect(t).toContain('Todavía no tienes juegos sueltos');
    expect(t).toContain('Anotar juego suelto');
    expect(t).not.toContain('Mejor serie');
  });

  it('cargando: sin «vacía»', () => {
    state.solo = { data: [], loading: true, error: null };
    const out = render();
    expect(text(out)).not.toContain('Todavía no tienes');
    expect(out).toContain('aria-busy');
  });

  it('con juegos: los números, «Anotar juego suelto» y la lista por mes', () => {
    state.solo = { data: LIST, loading: false, error: null };
    const out = render();
    const t = text(out);
    for (const label of ['Juegos', 'Promedio', 'Más alto', 'Mejor serie', '3 días', 'Anotar juego suelto']) expect(t).toContain(label);
    expect(t.toLowerCase()).toContain('septiembre de 2026');
    expect(t.toLowerCase()).toContain('agosto de 2026');
    expect(t).toContain('Bolera Norte');
    expect(t).toContain('Club Sur');
    // La serie del día y los pinos de un solo juego.
    expect(t).toContain('580 serie');
    expect(t).toContain('150 pinos');
    // Candado (no sale en el perfil) y por enviar, dichos también para el lector de pantalla.
    expect(out).toMatch(/aria-label="Club Sur[^"]*solo lo ves tú"/);
    expect(out).toMatch(/aria-label="Juego suelto[^"]*por enviar"/);
    // Sin hoja abierta.
    expect(t).not.toContain('Que salga en mi perfil');
  });

  it('?juego=<id> abre ese para cambiarlo o borrarlo', () => {
    state.solo = { data: LIST, loading: false, error: null };
    const out = render('/juegos-sueltos?juego=s2');
    const t = text(out);
    expect(t).toContain('Que salga en mi perfil');
    expect(t).toContain('Borrar');
    expect(out).toContain('value="Club Sur"');
    expect(out).toContain('value="2026-09-05"');
    expect(out).toMatch(/role="switch" aria-checked="false"/);
  });

  it('?nuevo=1 abre uno nuevo', () => {
    state.solo = { data: LIST, loading: false, error: null };
    const t = text(render('/juegos-sueltos?nuevo=1'));
    expect(t).toContain('Anotar juego suelto');
    expect(t).toContain('Que salga en mi perfil');
    expect(t).not.toContain('Borrar');
  });

  it('?juego= de uno que no está: no abre nada', () => {
    state.solo = { data: LIST, loading: false, error: null };
    expect(text(render('/juegos-sueltos?juego=otro'))).not.toContain('Que salga en mi perfil');
  });

  it('«Por día» es la lista; «Estadísticas» (?ver=estadisticas) la cambia por la tendencia y los cuadros', () => {
    const perfect = { rolls: Array.from({ length: 12 }, () => 10) };
    state.solo = {
      data: [...LIST, session('s4', '2026-08-01', [300, 290], { frames: { '0': perfect, '1': perfect } })],
      loading: false,
      error: null,
    };
    const list = render();
    expect(list).toMatch(/role="tab" aria-selected="true"[^>]*>(?:(?!<\/button>).)*Por día/);
    expect(text(list)).not.toContain('Por cuadros');

    const out = render('/juegos-sueltos?ver=estadisticas');
    const t = text(out).replace(/<!-- -->/g, '');
    expect(out).toMatch(/role="tab" aria-selected="true"[^>]*>(?:(?!<\/button>).)*Estadísticas/);
    expect(t).not.toContain('Bolera Norte');
    expect(t).toContain('Últimos 8 juegos');
    expect(t).toContain('Por mes');
    expect(t).toContain('Por cuadros');
    // El 290 con los cuadros de un 300 no cuenta (no cuadra con lo anotado).
    expect(out.replace(/<!-- -->/g, '')).toContain('Con 1 juego anotado por cuadros (de 8)');
    expect(t).toContain('Anota pino por pino (Pines)');
  });
});
