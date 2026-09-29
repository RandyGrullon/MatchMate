/**
 * Configuración › Notificaciones dibujada sin navegador (renderToString): un interruptor por categoría con cómo está
 * cada una, y nada de eso sin cuenta o sin las preferencias en el perfil (copia vieja o base sin la migración).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushPrefs } from '../lib/data/pushPrefs';

const state = vi.hoisted(() => ({
  user: { uid: 'u1', email: 'ana@x.com', displayName: 'Ana' } as { uid: string; email: string; displayName: string } | null,
  pushPrefs: undefined as PushPrefs | undefined,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: state.user,
    profile: state.user ? { id: state.user.uid, email: state.user.email, name: 'Ana', pushPrefs: state.pushPrefs } : null,
    isSuper: false,
    loading: false,
    recovering: false,
  }),
}));
vi.mock('./Notifications', () => ({ useNotifications: () => ({ leagues: [] }) }));

const { NotificationsCard } = await import('./NotificationsOptIn');
const { FeedbackProvider } = await import('./feedback');

const render = () => renderToString(h(FeedbackProvider, null, h(NotificationsCard)));
const switches = (html: string) => [...html.matchAll(/role="switch" aria-checked="(true|false)"/g)].map((m) => m[1] === 'true');

beforeEach(() => {
  state.user = { uid: 'u1', email: 'ana@x.com', displayName: 'Ana' };
  state.pushPrefs = undefined;
});

describe('qué te avisamos', () => {
  it('un interruptor por categoría, con cómo está cada una', () => {
    state.pushPrefs = { resultados: true, social: false, recordatorios: true, liga: false };
    const html = render();
    expect(html).toContain('Qué te avisamos');
    expect(html).toContain('En todos tus teléfonos.');
    for (const label of ['Resultados', 'Social', 'Recordatorios', 'Tus ligas']) expect(html).toContain(label);
    expect(html).toContain('Me gusta, felicitaciones, comentarios y quién empieza a seguirte.');
    expect(switches(html)).toEqual([true, false, true, false]);
  });

  it('sin las preferencias en el perfil o sin cuenta no se muestran (la tarjeta sí)', () => {
    let html = render();
    expect(html).toContain('Notificaciones');
    expect(html).not.toContain('Qué te avisamos');
    expect(switches(html)).toEqual([]);
    state.user = null;
    state.pushPrefs = { resultados: true, social: true, recordatorios: true, liga: true };
    html = render();
    expect(html).not.toContain('Qué te avisamos');
  });
});
