import { getBackend } from './backend';
import { PUSH_ENDPOINT, pushConfigured, vapidPublicKey } from './pushKey';

/**
 * Notificaciones del teléfono. Con la app instalada se pide permiso; con permiso:
 * - mientras la app está abierta o en segundo plano, los avisos nuevos (felicitaciones, comentarios,
 *   aprobaciones…) salen como notificación del teléfono;
 * - el teléfono queda suscrito (push) para los recordatorios de las prácticas, que llegan aunque la
 *   app esté cerrada (los manda la Edge Function send-push con el cron de Supabase).
 *
 * La suscripción se guarda con la RPC upsert_push_subscription (la cuenta es la de la sesión) y se quita con
 * delete_push_subscription al cerrar sesión. Sin clave VAPID (desarrollo o demo local) no hay push.
 */

/** App instalada (abierta desde el ícono). */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export type NotifyState = NotificationPermission | 'unsupported';

export const notifyState = (): NotifyState => (notificationsSupported() ? Notification.permission : 'unsupported');

/** La suscripción se vuelve a guardar a lo sumo cada 12 horas (así la base sabe qué teléfonos se siguen usando). */
const RESYNC_MS = 12 * 3600_000;

const syncKey = (uid: string) => `mm:push:${uid}`;

/** Último guardado de la suscripción de esta cuenta en este teléfono. */
function lastSync(uid: string): { endpoint: string; at: number } | null {
  try {
    const raw = localStorage.getItem(syncKey(uid));
    return raw ? (JSON.parse(raw) as { endpoint: string; at: number }) : null;
  } catch {
    return null;
  }
}

function saveSync(uid: string, endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(syncKey(uid), JSON.stringify({ endpoint, at: Date.now() }));
    else localStorage.removeItem(syncKey(uid));
  } catch {
    // sin almacenamiento: se guarda cada vez
  }
}

/** El service worker (en desarrollo no hay: no se espera para siempre). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** ¿La suscripción es de esta clave? (si el navegador no lo dice, se da por buena). */
function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return true;
  const got = new Uint8Array(current);
  return got.length === wanted.length && got.every((b, i) => b === wanted[i]);
}

/** Suscribe este teléfono a los recordatorios (push) de la cuenta. Sin soporte de push o sin clave, no hace nada. */
export async function subscribePush(uid: string): Promise<boolean> {
  if (!uid || !pushConfigured()) return false;
  const reg = await registration();
  if (!reg || !('pushManager' in reg)) return false;
  const key = keyBytes(vapidPublicKey());
  let sub = await reg.pushManager.getSubscription();
  // Suscrito con otra clave (la de antes de cambiarla): el servicio de push rechazaría los envíos. Se renueva.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth || !PUSH_ENDPOINT.test(json.endpoint)) return false;
  const last = lastSync(uid);
  if (last?.endpoint === json.endpoint && Date.now() - last.at < RESYNC_MS) return true;
  await getBackend().rpc('upsert_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_ua: navigator.userAgent.slice(0, 200),
  });
  saveSync(uid, json.endpoint);
  return true;
}

/**
 * Al cerrar sesión: este teléfono deja de recibir los recordatorios de esa cuenta. Se borra en la base (con la
 * sesión todavía abierta) y se da de baja en el servicio de push (aunque el borrado no llegue, el envío ve que
 * ya no existe y lo borra). No se espera más de 2 s: sin señal, cerrar sesión no se traba.
 */
export async function unsubscribePush(uid: string) {
  saveSync(uid, null);
  try {
    // Sin esperar al service worker: si no hay registro, no hay suscripción que quitar (cerrar sesión es al instante).
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    const removed = getBackend()
      .rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
      .catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
    await Promise.race([removed, new Promise((r) => setTimeout(r, 2000))]);
  } catch {
    // sin soporte de push: no hay nada que borrar
  }
}

/**
 * Pide permiso (tiene que ser al tocar un botón) y suscribe el teléfono. `subscribed`: si quedó listo
 * para los recordatorios con la app cerrada (sin señal no se puede; se reintenta solo al abrir la app).
 */
export async function enableNotifications(uid: string): Promise<{ state: NotifyState; subscribed: boolean }> {
  if (!notificationsSupported()) return { state: 'unsupported', subscribed: false };
  const state = await Notification.requestPermission();
  if (state !== 'granted') return { state, subscribed: false };
  const subscribed = await subscribePush(uid).catch((e) => {
    console.error(e);
    return false;
  });
  return { state, subscribed };
}

/** Notificación del teléfono (mientras la app está abierta o en segundo plano). */
export async function showSystemNotification(title: string, body: string, url: string, tag: string) {
  if (notifyState() !== 'granted') return;
  const reg = await registration();
  await reg?.showNotification(title, { body, tag, data: { url }, icon: '/icon-192.png', badge: '/badge-96.png' });
}
