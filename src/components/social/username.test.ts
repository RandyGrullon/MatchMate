/**
 * El @usuario en las piezas sociales, dibujadas sin navegador (renderToString): el link a un perfil, la cabecera
 * del perfil (también mientras el tuyo no llega) y el campo «Tu usuario» de /cuenta.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfile } from '../../lib/data/follows';
import { USERNAME_RULES } from '../../lib/data/people';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({ profile: { data: null as unknown, loading: false, error: null as Error | null } }));

vi.mock('../../lib/data/follows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data/follows')>()),
  usePublicProfile: () => state.profile,
}));

const { ProfileView } = await import('./ProfileView');
const { UserLink } = await import('./UserLink');
const { UsernameForm } = await import('./UsernameForm');

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const profile = (extra: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u2',
  name: 'Ana Pérez',
  username: 'ana.perez',
  since: '2026-09-01T00:00:00Z',
  sports: ['bowling'],
  followers: 3,
  following: 1,
  likesReceived: 0,
  gamesCount: 0,
  isFollowing: false,
  followsYou: false,
  isMe: false,
  ...extra,
});

beforeEach(() => {
  state.profile = { data: null, loading: false, error: null };
});

describe('@usuario en el link a un perfil', () => {
  it('debajo del nombre, dentro del link', () => {
    const out = render(h(UserLink, { userId: 'u2', name: 'Ana Pérez', username: 'ana.perez' }));
    expect(text(out)).toContain('Ana Pérez @ana.perez');
    expect(out).toMatch(/<a [^>]*href="\/u\/u2"[^>]*>.*@ana\.perez.*<\/a>/);
  });
  it('sin @usuario (copia vieja del teléfono) solo el nombre', () => {
    expect(render(h(UserLink, { userId: 'u2', name: 'Ana Pérez', username: '' }))).not.toContain('@');
    expect(render(h(UserLink, { userId: 'u2', name: 'Ana Pérez' }))).not.toContain('@');
  });
});

describe('@usuario en la cabecera del perfil', () => {
  it('el de otra cuenta, debajo del nombre', () => {
    state.profile = { data: profile(), loading: false, error: null };
    const t = text(render(h(ProfileView, { userId: 'u2' })));
    expect(t).toContain('Ana Pérez @ana.perez');
    expect(t).toContain('Seguir');
  });
  it('tu perfil mientras no llega: tu nombre y tu @usuario', () => {
    const t = text(render(h(ProfileView, { userId: 'u1', fallbackName: 'Beto Ruiz', fallbackUsername: 'beto' })));
    expect(t).toContain('Beto Ruiz @beto');
  });
  it('sin @usuario no sale la @', () => {
    state.profile = { data: profile({ username: '' }), loading: false, error: null };
    expect(text(render(h(ProfileView, { userId: 'u2' })))).not.toMatch(/@\w/);
  });
});

describe('«Tu usuario» en /cuenta', () => {
  it('con la @ delante, el de ahora escrito y «Guardar» listo', () => {
    const out = render(h(UsernameForm, { uid: 'u1', current: 'beto', onDone: () => {} }));
    const t = text(out);
    expect(t).toContain('Tu usuario');
    expect(out).toContain('value="beto"');
    expect(out).toContain('maxLength="20"');
    expect(t).toContain('@');
    expect(t).toContain('Es tu usuario de ahora.');
    expect(out).toMatch(/<button type="submit"(?![^>]*disabled="")[^>]*>.*Guardar/);
    expect(t).toContain('Cancelar');
  });
  it('sin @usuario todavía: las reglas y «Guardar» apagado', () => {
    const out = render(h(UsernameForm, { uid: 'u1', current: '', onDone: () => {} }));
    expect(text(out)).toContain(USERNAME_RULES);
    expect(out).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>.*Guardar/);
  });
});
