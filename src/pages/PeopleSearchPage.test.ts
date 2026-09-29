/**
 * Buscar personas (/buscar) dibujada sin navegador (renderToString) con resultados de mentira: sin cuenta, las
 * personas que sigues (y ninguna), una búsqueda con y sin resultados, una sola letra y cargando.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleLive, PersonHit } from '../lib/data/people';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  people: {} as Partial<PeopleLive>,
  asked: [] as string[],
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../lib/data/people', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/data/people')>()),
  usePeople: (query: string) => {
    state.asked.push(query);
    return { data: [], loading: false, error: null, settled: true, query, ...state.people };
  },
}));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: PeopleSearchPage } = await import('./PeopleSearchPage');

const hit = (id: string, extra: Partial<PersonHit> = {}): PersonHit => ({
  id,
  name: `Persona ${id}`,
  username: `persona_${id}`,
  isFollowing: false,
  followsYou: false,
  inLeague: false,
  invited: false,
  ...extra,
});

const render = (url = '/buscar') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(PeopleSearchPage))));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.people = {};
  state.asked = [];
});

describe('buscar personas', () => {
  it('sin cuenta: Entrar y Crear cuenta vuelven a /buscar', () => {
    state.auth = { user: null, loading: false };
    const out = render();
    expect(text(out)).toContain('Entra para buscar personas');
    expect(out).toContain('href="/login?next=%2Fbuscar"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fbuscar"');
  });

  it('sin escribir: las personas que sigues, con su @usuario y «Siguiendo»', () => {
    state.people = { data: [hit('a', { isFollowing: true, followsYou: true }), hit('b', { isFollowing: true })] };
    const out = render();
    const t = text(out);
    expect(out).toContain('placeholder="Busca por nombre o @usuario"');
    expect(out).toContain('autofocus=""');
    expect(t).toContain('Personas que sigues');
    expect(t).toContain('Persona a');
    expect(t).toContain('@persona_a');
    expect(t).toContain('Te sigue');
    expect(t).toContain('Siguiendo');
    expect(out).toContain('href="/u/a"');
    expect(state.asked).toContain('');
  });

  it('sin seguir a nadie todavía', () => {
    const t = text(render());
    expect(t).toContain('Aún no sigues a nadie');
    expect(t).toContain('Búscalos por su nombre o @usuario arriba.');
  });

  it('la búsqueda de la dirección (?q=): sus resultados con «Seguir»', () => {
    state.people = { data: [hit('c')] };
    const out = render('/buscar?q=%40pers');
    const t = text(out);
    expect(out).toContain('value="@pers"');
    expect(state.asked).toContain('@pers');
    expect(t).not.toContain('Personas que sigues');
    expect(t).toContain('@persona_c');
    expect(t).toContain('Seguir');
  });

  it('sin resultados, una sola letra o cargando', () => {
    expect(text(render('/buscar?q=zz'))).toContain('No encontramos a nadie con «zz»');
    expect(text(render('/buscar?q=z'))).toContain('Escribe al menos 2 letras para buscar.');
    state.people = { loading: true };
    expect(render('/buscar?q=zz')).toContain('class="skeleton');
  });
});
