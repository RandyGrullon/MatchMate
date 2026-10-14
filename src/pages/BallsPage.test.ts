/**
 * Mis bolas (/bolas) dibujada sin navegador (renderToString): sin cuenta, vacía y con bolas (rediseño: «‹ Yo», el
 * título y una línea, cada bola en su tarjeta con «•••», un solo «Agregar bola» y las retiradas aparte), y «Buscar
 * bolas» en el catálogo (las marcas, los modelos y «Agregar a mi arsenal», que abre la hoja ya llena).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BALL_BRANDS, BALL_CATALOG, searchBallCatalog } from '../lib/ballCatalog';
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

  it('cada tarjeta dice su perforación', () => {
    state.balls = [ball('b1', 'Morada', { layout: { drillingAngle: 45, pinToPap: 4.5, valAngle: 30 } })];
    expect(text(render())).toContain('Perforación 45° × 4½″ × 30°');
  });
});

describe('Buscar bolas en el catálogo', () => {
  const model = BALL_CATALOG[0];

  it('arriba, «Buscar bolas» (vacía o con bolas); el buscador no está abierto', () => {
    for (const balls of [[], [ball('b1', 'Morada')]]) {
      state.balls = balls;
      const out = render();
      expect(out).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?Buscar bolas/);
      expect(text(out)).toContain('Marca o modelo');
      expect(out).not.toContain('aria-label="Bolas del catálogo"');
    }
  });

  it('sin escribir nada: las marcas para tocar', () => {
    const out = render('/bolas?buscar=');
    const t = text(out);
    expect(t).toContain('Buscar bolas');
    expect(t).toContain('Marcas y modelos del catálogo');
    expect(out).toContain('role="group" aria-label="Marcas"');
    for (const b of BALL_BRANDS) expect(out).toMatch(new RegExp(`<button[^>]*>${b}</button>`));
  });

  it('por marca: sus modelos, cada uno con «Agregar a mi arsenal»', () => {
    const out = render(`/bolas?buscar=${encodeURIComponent(model.brand)}`);
    const t = text(out);
    const hits = searchBallCatalog(model.brand, 40);
    expect(out.match(/<li>/g)).toHaveLength(hits.length);
    for (const c of hits) expect(t).toContain(c.name);
    expect(t.match(/Agregar a mi arsenal/g)).toHaveLength(hits.length);
    expect(t).toContain('No está en el catálogo: agregarla a mano');
  });

  it('marca y modelo al revés también lo encuentra; si no está, lo dice', () => {
    expect(text(render(`/bolas?buscar=${encodeURIComponent(`${model.name} ${model.brand}`.toLowerCase())}`))).toContain(model.name);
    expect(text(render('/bolas?buscar=zzzz'))).toContain('Ninguna bola del catálogo con «zzzz».');
  });

  it('con el cupo lleno no se puede agregar', () => {
    state.balls = Array.from({ length: 30 }, (_, i) => ball(`b${i}`, `Bola ${i}`));
    const out = render(`/bolas?buscar=${encodeURIComponent(model.brand)}`);
    expect(text(out)).toContain('Ya tienes 30 bolas');
    expect(out).toMatch(/<button type="button" disabled=""[^>]*>/);
    expect(text(out)).not.toContain('agregarla a mano');
  });

  it('«Agregar a mi arsenal» abre la hoja de una nueva ya llena con ese modelo', () => {
    const out = render(`/bolas?nueva=1&catalogo=${encodeURIComponent(model.id)}`);
    const t = text(out);
    expect(t).toContain('Agregar bola');
    expect(out).toContain(`value="${model.name}"`);
    expect(out).toContain(`value="${model.brand}"`);
    expect(t).toContain('Del catálogo');
    // Una sola hoja (el buscador no).
    expect(out).not.toContain('Marcas y modelos del catálogo');
  });
});
