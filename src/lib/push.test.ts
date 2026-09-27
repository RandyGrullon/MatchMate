import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateVapidKeys } from '../../supabase/functions/send-push/webpush';
import { setBackendForTests } from './backend';
import { createFakeBackend, type FakeBackend } from './db/fakeBackend';
import { enableNotifications, showSystemNotification, subscribePush, unsubscribePush } from './push';
import { pushConfigured, vapidPublicKey } from './pushKey';

const UID = '11111111-1111-4111-8111-111111111111';

function keyBytes(key: string): ArrayBuffer {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

/** Navegador de mentira: service worker, pushManager y localStorage en memoria. */
function fakeBrowser(options: { endpoint?: (n: number) => string } = {}) {
  const endpoint = options.endpoint ?? ((n: number) => `https://fcm.googleapis.com/fcm/send/telefono-${n}`);
  const state = { sub: null as FakeSub | null, subscribed: 0, unsubscribed: 0 };
  class FakeSub {
    readonly options: { applicationServerKey: ArrayBuffer | null };
    constructor(
      readonly endpoint: string,
      key: ArrayBuffer | null,
    ) {
      this.options = { applicationServerKey: key };
    }
    toJSON() {
      return { endpoint: this.endpoint, keys: { p256dh: 'BPclave', auth: 'secreto' } };
    }
    async unsubscribe() {
      state.unsubscribed++;
      state.sub = null;
      return true;
    }
  }
  const reg = {
    pushManager: {
      getSubscription: async () => state.sub,
      subscribe: async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => {
        state.subscribed++;
        state.sub = new FakeSub(endpoint(state.subscribed), new Uint8Array(applicationServerKey).buffer);
        return state.sub;
      },
    },
    showNotification: vi.fn(async () => undefined),
  };
  const store = new Map<string, string>();
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg) }, userAgent: 'Prueba/1.0' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  const Notification = { permission: 'granted', requestPermission: async () => 'granted' };
  vi.stubGlobal('Notification', Notification);
  vi.stubGlobal('window', { Notification });
  return { state, reg, store, FakeSub };
}

let backend: FakeBackend;
let publicKey: string;

beforeEach(async () => {
  publicKey = (await generateVapidKeys()).publicKey;
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', publicKey);
  backend = createFakeBackend();
  backend.onRpc = () => 'uuid-de-la-suscripcion';
  setBackendForTests(backend);
});

afterEach(() => {
  setBackendForTests(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('clave VAPID', () => {
  it('sale de VITE_VAPID_PUBLIC_KEY; sin ella (o mal escrita) no hay push', () => {
    expect(vapidPublicKey()).toBe(publicKey);
    expect(pushConfigured()).toBe(true);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(pushConfigured()).toBe(false);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'clave-corta');
    expect(pushConfigured()).toBe(false);
  });
});

describe('subscribePush', () => {
  it('suscribe el teléfono y lo guarda con upsert_push_subscription', async () => {
    const { state } = fakeBrowser();
    expect(await subscribePush(UID)).toBe(true);
    expect(state.subscribed).toBe(1);
    expect(new Uint8Array(state.sub!.options.applicationServerKey!)).toEqual(new Uint8Array(keyBytes(publicKey)));
    expect(backend.calls).toEqual([
      {
        fn: 'upsert_push_subscription',
        args: { p_endpoint: 'https://fcm.googleapis.com/fcm/send/telefono-1', p_p256dh: 'BPclave', p_auth: 'secreto', p_ua: 'Prueba/1.0' },
      },
    ]);
  });

  it('al abrir la app otra vez no la guarda de nuevo hasta 12 horas después (ni con otra cuenta)', async () => {
    const { state } = fakeBrowser();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 26, 12));
    await subscribePush(UID);
    await subscribePush(UID);
    expect(backend.calls).toHaveLength(1);
    now.mockReturnValue(Date.UTC(2026, 8, 27, 0, 1));
    await subscribePush(UID);
    expect(backend.calls).toHaveLength(2);
    // Otra cuenta en el mismo teléfono: se guarda para ella enseguida (la base la pasa a esa cuenta).
    await subscribePush('22222222-2222-4222-8222-222222222222');
    expect(backend.calls).toHaveLength(3);
    expect(state.subscribed).toBe(1);
  });

  it('suscrito con otra clave (la de antes): se da de baja y se suscribe con la nueva', async () => {
    const { state, FakeSub } = fakeBrowser();
    const old = (await generateVapidKeys()).publicKey;
    state.sub = new FakeSub('https://fcm.googleapis.com/fcm/send/vieja', keyBytes(old));
    expect(await subscribePush(UID)).toBe(true);
    expect(state.unsubscribed).toBe(1);
    expect(state.subscribed).toBe(1);
    expect(backend.calls[0].args.p_endpoint).toBe('https://fcm.googleapis.com/fcm/send/telefono-1');
    // Si el navegador no dice con qué clave, se deja como está.
    state.sub = new FakeSub('https://fcm.googleapis.com/fcm/send/sin-clave', null);
    expect(await subscribePush('33333333-3333-4333-8333-333333333333')).toBe(true);
    expect(state.subscribed).toBe(1);
    expect(backend.calls[1].args.p_endpoint).toBe('https://fcm.googleapis.com/fcm/send/sin-clave');
  });

  it('sin clave VAPID, sin cuenta o con un servicio de push desconocido: no guarda nada', async () => {
    const { state } = fakeBrowser({ endpoint: () => 'https://mi-servidor.com/push' });
    expect(await subscribePush('')).toBe(false);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(await subscribePush(UID)).toBe(false);
    expect(state.subscribed).toBe(0);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', publicKey);
    expect(await subscribePush(UID)).toBe(false);
    expect(backend.calls).toEqual([]);
  });

  it('sin señal: falla (se reintenta al abrir la app) y no marca como guardada', async () => {
    fakeBrowser();
    backend.onRpc = () => {
      throw new Error('sin señal');
    };
    await expect(subscribePush(UID)).rejects.toThrow('sin señal');
    backend.onRpc = () => 'ok';
    expect(await subscribePush(UID)).toBe(true);
    expect(backend.calls).toHaveLength(2);
  });
});

describe('unsubscribePush', () => {
  it('borra la suscripción de la cuenta y se da de baja del servicio de push', async () => {
    const { state } = fakeBrowser();
    await subscribePush(UID);
    await unsubscribePush(UID);
    expect(backend.calls[1]).toEqual({ fn: 'delete_push_subscription', args: { p_endpoint: 'https://fcm.googleapis.com/fcm/send/telefono-1' } });
    expect(state.unsubscribed).toBe(1);
    expect(state.sub).toBeNull();
    // Al volver a entrar se suscribe y se guarda de nuevo enseguida.
    await subscribePush(UID);
    expect(backend.calls.map((c) => c.fn)).toEqual(['upsert_push_subscription', 'delete_push_subscription', 'upsert_push_subscription']);
  });

  it('sin señal no espera más de 2 s; sin suscripción ni soporte no hace nada', async () => {
    const { state } = fakeBrowser();
    await subscribePush(UID);
    vi.useFakeTimers();
    backend.onRpc = () => new Promise(() => undefined);
    let done = false;
    const out = unsubscribePush(UID).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await out;
    expect(state.unsubscribed).toBe(1);
    vi.useRealTimers();
    await unsubscribePush(UID);
    expect(backend.calls).toHaveLength(2);
    vi.stubGlobal('navigator', {});
    await expect(unsubscribePush(UID)).resolves.toBeUndefined();
  });
});

describe('permiso y notificaciones', () => {
  it('enableNotifications pide permiso y suscribe', async () => {
    fakeBrowser();
    expect(await enableNotifications(UID)).toEqual({ state: 'granted', subscribed: true });
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(await enableNotifications(UID)).toEqual({ state: 'granted', subscribed: false });
  });

  it('la notificación del teléfono lleva el ícono y el badge de la marca', async () => {
    const { reg } = fakeBrowser();
    await showSystemNotification('¡Felicidades!', 'Liga · Ana te felicitó', '/l/x', 'aviso-1');
    expect(reg.showNotification).toHaveBeenCalledWith('¡Felicidades!', {
      body: 'Liga · Ana te felicitó',
      tag: 'aviso-1',
      data: { url: '/l/x' },
      icon: '/icon-192.png',
      badge: '/badge-96.png',
    });
  });
});
