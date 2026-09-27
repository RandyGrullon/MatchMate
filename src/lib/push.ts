import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PUSH_ENDPOINT, VAPID_PUBLIC_KEY } from './pushKey';

/**
 * Notificaciones del teléfono. Con la app instalada se pide permiso; con permiso:
 * - mientras la app está abierta o en segundo plano, los avisos nuevos (felicitaciones, comentarios,
 *   aprobaciones…) salen como notificación del teléfono;
 * - el teléfono queda suscrito (push) para los recordatorios de las prácticas, que llegan aunque la
 *   app esté cerrada (los manda el envío programado).
 */

/** App instalada (abierta desde el ícono). */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export type NotifyState = NotificationPermission | 'unsupported';

export const notifyState = (): NotifyState => (notificationsSupported() ? Notification.permission : 'unsupported');

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

/** Id del documento de la suscripción (el mismo teléfono siempre da el mismo). */
async function subId(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

/** Suscribe este teléfono a los recordatorios (push) de la cuenta. Sin soporte de push, no hace nada. */
export async function subscribePush(uid: string): Promise<boolean> {
  const reg = await registration();
  if (!reg || !('pushManager' in reg)) return false;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth || !PUSH_ENDPOINT.test(json.endpoint)) return false;
  await setDoc(doc(db, 'users', uid, 'push', await subId(json.endpoint)), {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    ua: navigator.userAgent.slice(0, 200),
    updatedAt: serverTimestamp(),
  });
  return true;
}

/**
 * Al cerrar sesión: este teléfono deja de recibir los recordatorios de esa cuenta. Se da de baja en el
 * servicio de push (aunque el borrado no llegue, el envío ve que ya no existe y lo borra) y el borrado
 * no se espera más de 2 s (sin señal queda en cola: cerrar sesión no se traba).
 */
export async function unsubscribePush(uid: string) {
  try {
    // Sin esperar al service worker: si no hay registro, no hay suscripción que quitar (cerrar sesión es al instante).
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    const id = await subId(sub.endpoint);
    await sub.unsubscribe().catch(() => false);
    const removed = deleteDoc(doc(db, 'users', uid, 'push', id)).catch(() => undefined);
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
  await reg?.showNotification(title, { body, tag, data: { url }, icon: '/icon-192.png', badge: '/icon-192.png' });
}
