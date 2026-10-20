import { getBackend } from './backend';
import { currentNotifyState, expoPushToken, phonePlatform, requestNotifyPermission, showLocalNotification } from '@movil/platform/notifications';

/**
 * Notificaciones en la app del teléfono: las mismas funciones que push.ts (la web), con expo-notifications
 * (movil/src/platform/notifications.ts). El teléfono da un token de Expo que se guarda con la RPC upsert_app_push
 * (20261020000100_push_app_telefono.sql) y se quita con delete_push_subscription al salir; los avisos los manda
 * send-push por el servicio de push de Expo.
 */

/** La app siempre está «instalada». */
export const isStandalone = () => true;

export const notificationsSupported = () => phonePlatform() !== null;

export type NotifyState = 'granted' | 'denied' | 'default' | 'unsupported';

export const notifyState = (): NotifyState => currentNotifyState();

/** El token se vuelve a guardar a lo sumo cada 12 horas (así la base sabe qué teléfonos se siguen usando). */
const RESYNC_MS = 12 * 3600_000;

const syncKey = (uid: string) => `mm:push:${uid}`;

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

const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** Guarda este teléfono para los avisos de la cuenta. Sin permiso o sin proyecto de EAS, no hace nada. */
export async function subscribePush(uid: string): Promise<boolean> {
  if (!uid || notifyState() !== 'granted') return false;
  const platform = phonePlatform();
  const token = await expoPushToken();
  if (!token || !platform) return false;
  const last = lastSync(uid);
  if (last?.endpoint === token && Date.now() - last.at < RESYNC_MS) return true;
  await getBackend().rpc('upsert_app_push', { p_token: token, p_platform: platform });
  saveSync(uid, token);
  return true;
}

/**
 * Al salir de la cuenta: este teléfono deja de recibir sus avisos. No se espera más de 2 s: sin señal, salir no se
 * traba (si el borrado no llega, el teléfono sigue en la base hasta que otra cuenta entre en él).
 */
export async function unsubscribePush(uid: string) {
  const last = lastSync(uid);
  saveSync(uid, null);
  try {
    const token = last?.endpoint ?? (await within(expoPushToken().catch(() => null), 2000, null));
    if (!token) return;
    const removed = getBackend()
      .rpc('delete_push_subscription', { p_endpoint: token })
      .catch(() => undefined);
    await within(removed, 2000, undefined);
  } catch {
    // sin push: no hay nada que borrar
  }
}

/** Pide permiso (al tocar «Activar») y guarda el teléfono. `subscribed`: si quedó listo para los avisos. */
export async function enableNotifications(uid: string): Promise<{ state: NotifyState; subscribed: boolean }> {
  if (!notificationsSupported()) return { state: 'unsupported', subscribed: false };
  const state = await requestNotifyPermission();
  if (state !== 'granted') return { state, subscribed: false };
  const subscribed = await subscribePush(uid).catch((e) => {
    console.error(e);
    return false;
  });
  return { state, subscribed };
}

/** Aviso del teléfono al momento (con la app abierta). */
export async function showSystemNotification(title: string, body: string, url: string, tag: string) {
  await showLocalNotification(title, body, url, tag);
}
