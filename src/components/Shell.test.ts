/**
 * La barra de secciones dibujada sin navegador (renderToString): con cuenta Home · Eventos · Perfil (y la campana);
 * sin cuenta Home · Contáctanos · Acerca de (y «Entrar», que vuelve a la pantalla en que estaba).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../lib/backend', () => ({ backendMode: () => 'supabase' }));
vi.mock('./CreateMenu', () => ({ useCreateMenu: () => ({ openMenu: () => undefined, startCreate: () => undefined }) }));
vi.mock('./Notifications', () => ({ NotificationsBell: () => h('span', null, 'CAMPANA') }));
vi.mock('./SportSwitcher', () => ({ SportChip: () => null }));
vi.mock('./OutboxIndicator', () => ({ OutboxIndicator: () => null }));

const { BottomNav, DesktopNav, navSections } = await import('./Shell');

const render = (el: ReturnType<typeof h>, url = '/') => renderToString(h(MemoryRouter, { initialEntries: [url] }, el));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
});

describe('secciones de la barra', () => {
  it('con cuenta: Home, Eventos y Perfil; sin cuenta: Home, Contáctanos y Acerca de', () => {
    expect(navSections(true).map((s) => [s.label, s.to])).toEqual([
      ['Home', '/'],
      ['Eventos', '/ligas'],
      ['Perfil', '/perfil'],
    ]);
    expect(navSections(false).map((s) => [s.label, s.to])).toEqual([
      ['Home', '/'],
      ['Contáctanos', '/contacto'],
      ['Acerca de', '/acerca'],
    ]);
    const [, contact, about] = navSections(false);
    expect(contact.match('/contacto')).toBe(true);
    expect(about.match('/acerca')).toBe(true);
    expect(contact.match('/ligas')).toBe(false);
  });

  it('abajo en el teléfono con cuenta: Eventos, la campana y Perfil', () => {
    const out = render(h(BottomNav), '/ligas');
    const t = text(out);
    expect(t).toContain('Eventos');
    expect(t).toContain('Perfil');
    expect(t).toContain('CAMPANA');
    expect(t).not.toContain('Contáctanos');
    expect(t).not.toContain('Acerca de');
    expect(out).toContain('href="/perfil"');
    // Eventos marcada en /ligas.
    expect(out).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/ligas"|<a[^>]*href="\/ligas"[^>]*aria-current="page"/);
  });

  it('abajo en el teléfono sin cuenta: Contáctanos, Entrar (vuelve aquí) y Acerca de', () => {
    state.auth = { user: null, loading: false };
    const out = render(h(BottomNav), '/acerca');
    const t = text(out);
    expect(t).toContain('Contáctanos');
    expect(t).toContain('Acerca de');
    expect(t).toContain('Entrar');
    expect(t).not.toContain('Eventos');
    expect(t).not.toContain('Perfil');
    expect(t).not.toContain('CAMPANA');
    expect(out).toContain('href="/contacto"');
    expect(out).toContain('href="/login?next=%2Facerca"');
    expect(out).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/acerca"|<a[^>]*href="\/acerca"[^>]*aria-current="page"/);
  });

  it('mientras se lee la sesión se quedan las de con cuenta (no parpadea)', () => {
    state.auth = { user: null, loading: true };
    const t = text(render(h(BottomNav)));
    expect(t).toContain('Eventos');
    expect(t).not.toContain('Contáctanos');
  });

  it('arriba en la computadora: lo mismo, después de Crear', () => {
    let t = text(render(h(DesktopNav)));
    expect(t).toMatch(/Crear .*Home .*Eventos .*Perfil/);
    state.auth = { user: null, loading: false };
    const out = render(h(DesktopNav), '/contacto');
    t = text(out);
    expect(t).toMatch(/Crear .*Home .*Contáctanos .*Acerca de/);
    expect(t).not.toContain('Eventos');
    expect(out).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/contacto"|<a[^>]*href="\/contacto"[^>]*aria-current="page"/);
  });
});
