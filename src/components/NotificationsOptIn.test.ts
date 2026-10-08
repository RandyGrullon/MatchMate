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

const { NotificationsCard, NotificationsPrompt, PUSH_SHORT_HINTS, pushPageState } = await import('./NotificationsOptIn');
const { FeedbackProvider } = await import('./feedback');

const render = () => renderToString(h(FeedbackProvider, null, h(NotificationsCard)));
const switches = (html: string) => [...html.matchAll(/role="switch" aria-checked="(true|false)"/g)].map((m) => m[1] === 'true');

beforeEach(() => {
  state.user = { uid: 'u1', email: 'ana@x.com', displayName: 'Ana' };
  state.pushPrefs = undefined;
});

describe('qué te avisamos', () => {
  it('un interruptor por categoría, con cómo está cada una, como filas de la tarjeta', () => {
    state.pushPrefs = { resultados: true, social: false, recordatorios: true, liga: false };
    const html = render();
    // El título de sección del rediseño y una sola pista abajo.
    expect(html).toContain('<h2 id="cfg-avisos" class="text-section">Notificaciones</h2>');
    expect(html).toContain('Qué te avisamos, en todos tus teléfonos.');
    for (const label of ['Resultados', 'Social', 'Recordatorios', 'Tus ligas']) expect(html).toContain(label);
    // Cada una en una línea corta (las de la base son de dos o tres en el teléfono).
    expect(html).toContain(PUSH_SHORT_HINTS.social);
    expect(html).not.toContain('Me gusta, felicitaciones, comentarios, quién empieza a seguirte y las insignias que te ganas.');
    for (const hint of Object.values(PUSH_SHORT_HINTS)) expect(hint!.length).toBeLessThanOrEqual(34);
    expect(switches(html)).toEqual([true, false, true, false]);
    // Las filas, con la línea entre ellas (mm-row) y de 64 px como ListRow (Lite).
    expect(html.match(/role="switch"[^>]*class="mm-row [^"]*min-h-row /g)).toHaveLength(4);
  });

  it('arriba, cómo están en este teléfono: sin instalar la app lo dice, sin botón de activar', () => {
    const html = render();
    expect(html).toContain('En este teléfono');
    expect(html).toContain('Instala la app para activarlas');
    expect(html).not.toContain('Activar');
  });

  it('sin las preferencias en el perfil o sin cuenta no se muestran (la tarjeta sí)', () => {
    let html = render();
    expect(html).toContain('Notificaciones');
    expect(html).not.toContain('Qué te avisamos');
    expect(html).toContain('En este teléfono');
    expect(switches(html)).toEqual([]);
    state.user = null;
    state.pushPrefs = { resultados: true, social: true, recordatorios: true, liga: true };
    html = render();
    expect(html).not.toContain('Qué te avisamos');
  });
});

describe('pedir los avisos (ahora en el NoticeSlot, no como tarjeta)', () => {
  it('la página de avisos: activar si se puede, bloqueadas, o falta instalar; nada si ya están activas', () => {
    expect(pushPageState('default', true, true)).toBe('ask');
    expect(pushPageState('default', true, false)).toBe('install');
    expect(pushPageState('default', false, true)).toBe('install');
    expect(pushPageState('denied', true, true)).toBe('denied');
    expect(pushPageState('granted', true, true)).toBeNull();
  });

  it('la tarjeta del Home ya no se dibuja (el aviso lo propone PushNotice para toda la app)', () => {
    expect(renderToString(h(NotificationsPrompt))).toBe('');
  });
});
