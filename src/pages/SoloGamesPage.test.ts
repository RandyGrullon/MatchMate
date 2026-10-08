/**
 * Juegos sueltos (/juegos-sueltos) dibujada sin navegador (renderToString) con juegos de mentira: sin cuenta, vacía,
 * cargando, la lista por mes (con el candado de los que no salen en el perfil), «‹ Yo», Lite (promedio y más alto) y
 * Pro (los 6 números y «Por día | Estadísticas»), y la hoja abierta con ?juego= y ?nuevo=1.
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
  pro: false,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
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
  state.pro = false;
});

describe('juegos sueltos', () => {
  it('sin cuenta: Entrar y Crear cuenta vuelven aquí (con lo que iba a hacer)', () => {
    state.auth = { user: null, loading: false };
    const out = render('/juegos-sueltos?nuevo=1');
    expect(text(out)).toContain('Entra para anotar tus juegos sueltos');
    // «‹ Yo» arriba, también sin cuenta.
    expect(text(out)).toContain('Yo');
    expect(out).toContain('href="/login?next=%2Fjuegos-sueltos%3Fnuevo%3D1"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fjuegos-sueltos%3Fnuevo%3D1"');
  });

  it('vacía: qué es y el botón para anotar', () => {
    const out = render();
    const t = text(out);
    expect(out).toContain('class="text-title');
    expect(t).toContain('Juegos sueltos');
    expect(t).toContain('Boliche sin liga ni torneo');
    expect(t).toContain('Todavía no tienes juegos sueltos');
    expect(t).toContain('Anotar juego suelto');
    expect(t).not.toContain('Promedio');
  });

  it('cargando: sin «vacía»', () => {
    state.solo = { data: [], loading: true, error: null };
    const out = render();
    expect(text(out)).not.toContain('Todavía no tienes');
    expect(out).toContain('aria-busy');
  });

  it('con juegos (Lite): promedio y más alto, «Anotar juego suelto» una vez y la lista por mes, sin «Estadísticas»', () => {
    state.solo = { data: LIST, loading: false, error: null };
    const out = render();
    const t = text(out).replace(/<!-- -->/g, '');
    for (const label of ['Promedio', 'Más alto', '6 juegos en 3 días', 'mejor serie 580']) expect(t).toContain(label);
    expect(t.match(/Anotar juego suelto/g)).toHaveLength(1);
    expect(out).not.toContain('role="radiogroup"');
    expect(t).not.toContain('Estadísticas');
    expect(t.toLowerCase()).toContain('septiembre de 2026');
    expect(t.toLowerCase()).toContain('agosto de 2026');
    expect(t).toContain('Bolera Norte');
    expect(t).toContain('Club Sur');
    // Cada día con su fecha (OCT / 13 → aquí SEP / 27), los juegos en una línea y la serie (o los pinos de uno solo).
    expect(t).toContain('SEP 27');
    expect(t).toMatch(/210 · 180 · 190 \s*2 580/);
    expect(t).toContain('150 150');
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

  it('Pro: los 6 números y «Por día» es la lista; «Estadísticas» (?ver=estadisticas) la cambia por la tendencia y tus tiros', () => {
    state.pro = true;
    const perfect = { rolls: Array.from({ length: 12 }, () => 10) };
    state.solo = {
      data: [...LIST, session('s4', '2026-08-01', [300, 290], { frames: { '0': perfect, '1': perfect } })],
      loading: false,
      error: null,
    };
    const list = render();
    const lt = text(list).replace(/<!-- -->/g, '');
    for (const label of ['Promedio', 'Más alto', 'Mejor serie', 'Juegos', 'Días', 'Por cuadros']) expect(lt).toContain(label);
    expect(list).toContain('class="text-title-pro');
    expect(list).toMatch(/role="radio" aria-checked="true"[^>]*>(?:(?!<\/button>).)*Por día/);
    expect(lt).toContain('Bolera Norte');
    expect(lt).not.toContain('Tus tiros');

    const out = render('/juegos-sueltos?ver=estadisticas');
    const t = text(out).replace(/<!-- -->/g, '');
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>(?:(?!<\/button>).)*Estadísticas/);
    expect(t).not.toContain('Bolera Norte');
    expect(t).toContain('Tendencia');
    expect(t).toContain('Por juego');
    expect(t).toContain('Tus tiros');
    expect(t).toContain('Ver todo por cuadros');
  });

  it('Lite con un link a ?ver=estadisticas: se ve y se puede volver a «Por día»', () => {
    state.solo = { data: LIST, loading: false, error: null };
    const out = render('/juegos-sueltos?ver=estadisticas');
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>(?:(?!<\/button>).)*Estadísticas/);
    expect(text(out)).toContain('Por día');
  });
});
