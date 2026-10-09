/**
 * «Perfil público» de Configuración dibujado sin navegador (renderToString): las filas (foto, biografía y personas
 * bloqueadas), la hoja de la foto que abre `/cuenta?foto=1`, la biografía con su cuenta de 160, la lista de bloqueadas
 * con «Desbloquear» y los errores en palabras simples.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import type { PublicProfile } from '../../lib/data/follows';
import type { BlockedPerson } from '../../lib/data/profileSocial';
import { AVATAR_BUCKET, primePublicUrl } from '../../lib/publicImages';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({ blocks: { data: [] as BlockedPerson[], loading: false, error: null as Error | null } }));

vi.mock('../../lib/data/profileSocial', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/profileSocial')>()),
  useMyBlocks: () => state.blocks,
}));

const { AvatarEditor, BioForm, BlockedPeople, PublicProfileSection, avatarErrorText, bioErrorText, blockedLine } = await import('./PublicProfile');

const render = (el: ReactElement, url = '/cuenta') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const me = (extra: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u1',
  name: 'Ana Pérez',
  username: 'anaperez',
  since: null,
  sports: [],
  followers: 0,
  following: 0,
  likesReceived: 0,
  gamesCount: 0,
  isFollowing: false,
  followsYou: false,
  isMe: true,
  ...extra,
});

const blocked = (id: string, name: string, extra: Partial<BlockedPerson> = {}): BlockedPerson => ({
  id,
  name,
  username: name.toLowerCase().replace(/\s+/g, ''),
  avatar: null,
  at: '2026-10-08T12:00:00Z',
  ...extra,
});

const section = (profile: PublicProfile | null, url = '/cuenta') =>
  render(h(PublicProfileSection, { name: 'Ana Pérez', profile, dense: false, icon: 'size-5' }), url);

beforeEach(() => {
  state.blocks = { data: [], loading: false, error: null };
});

describe('las filas de «Perfil público»', () => {
  it('foto, biografía y bloqueadas, cada una en su hoja (cerradas al entrar)', () => {
    const out = section(me());
    const t = text(out);
    expect(out).toContain('class="text-section">Perfil público</h2>');
    expect(t).toContain('Foto de perfil Que te reconozcan en tus publicaciones');
    expect(t).toContain('Tu biografía Cuéntales algo de ti');
    expect(t).toContain('Personas bloqueadas No has bloqueado a nadie');
    // Nada abierto ni botones fuertes en la pantalla: los «Guardar» van en sus hojas.
    expect(t).not.toContain('Elegir foto');
    expect(out).not.toMatch(/bg-accent text-accent-fg/);
  });

  it('con foto, biografía y bloqueadas: lo dicen las filas', () => {
    primePublicUrl(AVATAR_BUCKET, 'u1/yo.webp', 'https://img.test/u1/yo.webp');
    state.blocks = { data: [blocked('u7', 'Beto Ruiz'), blocked('u8', 'Caro Díaz')], loading: false, error: null };
    const out = section(me({ avatar: 'u1/yo.webp', bio: 'Zurda. Voy por mi primer 300.' }));
    const t = text(out);
    expect(out).toContain('src="https://img.test/u1/yo.webp"');
    expect(t).toContain('Foto de perfil Cámbiala o quítala');
    expect(t).toContain('Tu biografía Zurda. Voy por mi primer 300.');
    expect(t).toContain('Personas bloqueadas 2 personas');
  });

  it('/cuenta?foto=1 (tocar tu foto en Yo) abre la hoja de la foto', () => {
    const t = text(section(me(), '/cuenta?foto=1'));
    expect(t).toContain('Sale en tu perfil y en lo que publicas');
    expect(t).toContain('Elegir foto');
  });
});

describe('la foto', () => {
  it('sin foto: tus iniciales y «Elegir foto» (sin «Quitar foto»)', () => {
    const out = render(h(AvatarEditor, { name: 'Ana Pérez', photo: null, onDone: () => undefined }));
    const t = text(out);
    expect(t).toContain('AP');
    expect(t).toContain('Elegir foto');
    expect(t).toContain('Se recorta al cuadrado del centro.');
    expect(t).not.toContain('Quitar foto');
    expect(out).toContain('accept="image/*"');
  });

  it('con foto: la tuya, «Cambiar foto» y «Quitar foto»', () => {
    primePublicUrl(AVATAR_BUCKET, 'u1/otra.webp', 'https://img.test/u1/otra.webp');
    const out = render(h(AvatarEditor, { name: 'Ana Pérez', photo: 'u1/otra.webp', onDone: () => undefined }));
    expect(out).toContain('src="https://img.test/u1/otra.webp"');
    expect(text(out)).toContain('Cambiar foto');
    expect(text(out)).toContain('Quitar foto');
  });

  it('los errores en palabras simples', () => {
    expect(avatarErrorText(new BackendError('La foto es muy grande.', 'validation', 'imagen'))).toContain('No se pudo usar esa imagen');
    expect(avatarErrorText(new BackendError('rate_limited', 'rate_limited'))).toBe('Cambiaste tu foto muchas veces hoy. Prueba mañana.');
    expect(avatarErrorText(new BackendError('sin red', 'network'))).toContain('Sin conexión');
  });
});

describe('la biografía', () => {
  it('lo de ahora escrito, la cuenta de 160 y Guardar | Cancelar', () => {
    const out = render(h(BioForm, { current: 'Zurda', onDone: () => undefined }));
    const t = text(out);
    expect(out).toContain('maxLength="160"');
    expect(out).toContain('>Zurda</textarea>');
    expect(t).toContain('5/160');
    expect(t).toContain('Guardar');
    expect(t).toContain('Cancelar');
  });

  it('vacía: 0/160', () => {
    expect(text(render(h(BioForm, { current: null, onDone: () => undefined })))).toContain('0/160');
  });

  it('palabras prohibidas y los demás errores', () => {
    expect(bioErrorText(new BackendError('palabras', 'validation', 'palabras'))).toBe('Tu texto tiene palabras que no se permiten');
    expect(bioErrorText(new Error('palabras: prohibidas'))).toBe('Tu texto tiene palabras que no se permiten');
    expect(bioErrorText(new BackendError('sin red', 'network'))).toContain('Sin conexión');
  });
});

describe('personas bloqueadas', () => {
  it('sin nadie: «No has bloqueado a nadie»', () => {
    const t = text(render(h(BlockedPeople, { list: { data: [], loading: false, error: null } })));
    expect(t).toContain('No has bloqueado a nadie');
    expect(blockedLine(0)).toBe('No has bloqueado a nadie');
    expect(blockedLine(1)).toBe('1 persona');
  });

  it('cada una con su foto (o iniciales), su @usuario y «Desbloquear»', () => {
    primePublicUrl(AVATAR_BUCKET, 'u7/b.webp', 'https://img.test/u7/b.webp');
    const list = { data: [blocked('u7', 'Beto Ruiz', { avatar: 'u7/b.webp' }), blocked('u8', 'Caro Díaz')], loading: false, error: null };
    const out = render(h(BlockedPeople, { list }));
    const t = text(out);
    expect(t).toContain('Beto Ruiz @betoruiz');
    expect(t).toContain('CD Caro Díaz @carodíaz');
    expect(out).toContain('src="https://img.test/u7/b.webp"');
    expect(out).toContain('aria-label="Desbloquear a Beto Ruiz"');
    expect(out).toContain('aria-label="Desbloquear a Caro Díaz"');
  });

  it('cargando: el esqueleto', () => {
    const out = render(h(BlockedPeople, { list: { data: [], loading: true, error: null } }));
    expect(out).toContain('skeleton');
    expect(text(out)).not.toContain('No has bloqueado a nadie');
  });
});
