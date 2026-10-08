/**
 * Mis bolas (/bolas) dibujada sin navegador (renderToString): sin cuenta, vacía y con bolas (rediseño: «‹ Yo», el
 * título y una línea, cada bola en su tarjeta con «•••», un solo «Agregar bola» y las retiradas aparte).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ball } from '../lib/balls';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  balls: [] as Ball[],
}));

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock('../lib/data/balls', async (orig) => ({
  ...(await orig<typeof import('../lib/data/balls')>()),
  useMyBalls: () => ({ data: { balls: state.balls, lastUsed: null }, loading: false, error: null }),
  useMyBallGames: () => ({ data: [], loading: false, error: null }),
}));

const { default: BallsPage } = await import('./BallsPage');

const ball = (id: string, name: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name,
  brand: 'Storm',
  weight: 15,
  color: '#7c3aed',
  cover: null,
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const render = (url = '/bolas') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(BallsPage))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.balls = [];
});

describe('Mis bolas', () => {
  it('sin cuenta: «‹ Yo», el título y entrar o crear la cuenta (vuelven aquí)', () => {
    state.auth = { user: null, loading: false };
    const out = render('/bolas?nueva=1');
    expect(text(out)).toContain('Entra para registrar tus bolas');
    expect(out).toContain('href="/login?next=%2Fbolas%3Fnueva%3D1"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fbolas%3Fnueva%3D1"');
  });

  it('vacía: qué es y un solo «Agregar bola»', () => {
    const t = text(render());
    expect(t).toContain('Mis bolas');
    expect(t).toContain('Solo tú ves tus bolas');
    expect(t).toContain('Todavía no tienes bolas');
    expect(t.match(/Agregar bola/g)).toHaveLength(1);
  });

  it('con bolas: cada una con su «•••», un solo «Agregar bola» y las retiradas aparte', () => {
    state.balls = [ball('b1', 'Morada'), ball('b2', 'Vieja', { retired: true })];
    const out = render();
    const t = text(out);
    expect(out).toContain('aria-label="Más opciones de la Morada"');
    expect(out).toContain('aria-label="Más opciones de la Vieja"');
    expect(t.match(/Agregar bola/g)).toHaveLength(1);
    expect(out).toContain('class="text-section">Retiradas');
    expect(t).toContain('Volver a usarla');
    expect(t).toContain('La pulí hoy');
    // Sin el párrafo largo de antes.
    expect(t).not.toContain('Solo tú ves tus bolas. ');
  });
});
