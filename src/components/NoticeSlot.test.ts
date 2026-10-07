/**
 * El lugar del aviso de cada pantalla (NoticeSlot) dibujado sin navegador: solo el más importante que la cuenta no
 * cerró, una fila sin fondo con su botón y la X de 44 px; nunca dos lugares a la vez.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ auth: { user: { uid: 'u1' } as { uid: string } | null } }));
vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));

const { NoticeRow, NoticeSlot } = await import('./NoticeSlot');
const { claimSlot, dismissNotice, registerNotice, resetNoticesForTests } = await import('../lib/notices');

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  resetNoticesForTests();
  state.auth = { user: { uid: 'u1' } };
});

describe('NoticeSlot', () => {
  it('sin avisos no dibuja nada', () => {
    expect(render(h(NoticeSlot))).toBe('');
  });

  it('solo uno: el más importante (instalar le gana a sugerir Pro)', () => {
    registerNotice({ id: 'sugerir-pro', kind: 'pro', title: 'Organizas esta liga', text: 'Aprueba juegos en Pro', action: { label: 'Probar Pro' } });
    registerNotice({ id: 'instalar', kind: 'install', title: 'Instala MatchMate', action: { label: 'Instalar' } });
    const html = render(h(NoticeSlot));
    expect(text(html)).toBe('Instala MatchMate Instalar');
    expect(html.match(/data-notice=/g)).toHaveLength(1);
  });

  it('lo que la cuenta cerró no sale (las otras cuentas sí lo ven)', () => {
    registerNotice({ id: 'sugerir-pro', kind: 'pro', title: 'Organizas esta liga', action: { label: 'Probar Pro' } });
    registerNotice({ id: 'instalar', kind: 'install', title: 'Instala MatchMate' });
    dismissNotice('u1', { id: 'instalar' }, Date.now(), null);
    expect(text(render(h(NoticeSlot)))).toBe('Organizas esta liga Probar Pro');
    state.auth = { user: { uid: 'u2' } };
    expect(text(render(h(NoticeSlot)))).toBe('Instala MatchMate');
  });

  it('si otro lugar está montado, este no muestra nada (nunca dos avisos)', () => {
    registerNotice({ id: 'instalar', kind: 'install', title: 'Instala MatchMate' });
    const other = claimSlot();
    expect(render(h(NoticeSlot))).toBe('');
    other.release();
    expect(render(h(NoticeSlot))).toContain('Instala MatchMate');
  });
});

describe('la fila del aviso', () => {
  const pro = { id: 'sugerir-pro', kind: 'pro' as const, title: 'Organizas esta liga', text: 'Aprueba juegos en Pro', action: { label: 'Probar Pro' } };

  it('como el diseño: título, línea debajo, botón en el color del deporte y la X de 44 px; sin fondo, solo contorno', () => {
    const html = render(h(NoticeRow, { notice: pro, onDismiss: () => {} }));
    expect(html).toContain('data-notice="sugerir-pro"');
    expect(html).toMatch(/class="[^"]*rounded-\[20px\][^"]*shadow-\[inset_0_0_0_1px_var\(--line\)\]/);
    expect(html).not.toMatch(/data-notice[^>]*class="[^"]*\bbg-/);
    expect(html).toMatch(/<p class="text-meta font-semibold">Organizas esta liga<\/p>/);
    expect(html).toMatch(/<p class="[^"]*text-muted">Aprueba juegos en Pro<\/p>/);
    expect(html).toMatch(/<button type="button" class="[^"]*min-h-11[^"]*text-accent[^"]*">Probar Pro<\/button>/);
    expect(html).toMatch(/aria-label="Cerrar aviso" class="[^"]*size-11[^"]*text-faint/);
  });

  it('con `to`, el botón es un link de la app; sin X si no se puede cerrar', () => {
    const html = render(h(NoticeRow, { notice: { ...pro, action: { label: 'Ver', to: '/l/x/admin' }, dismissible: false }, onDismiss: () => {} }));
    expect(html).toMatch(/<a [^>]*href="\/l\/x\/admin"[^>]*>Ver<\/a>/);
    expect(html).not.toContain('Cerrar aviso');
  });
});
