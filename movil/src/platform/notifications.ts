/**
 * Avisos del teléfono con expo-notifications (lo que en la web hacen el service worker y Web Push). La lógica de la
 * cuenta (guardar o quitar el token, cuándo pedir permiso) está en src/lib/push.native.ts, con las mismas funciones que
 * la web; aquí va solo lo del sistema: el permiso, el canal de Android, el token de Expo y tocar un aviso.
 *
 * Los avisos los manda send-push por el servicio de push de Expo (supabase/functions/send-push/core.ts · sendExpo) con
 * `data.url` = la pantalla que abre. Para el token hace falta el proyecto de EAS (`eas init` pone
 * `extra.eas.projectId` en app.json) y, para que lleguen, las credenciales de APNs y FCM en EAS (docs/movil.md).
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';

/** El canal de Android (el mismo que manda send-push: EXPO_CHANNEL). */
export const CHANNEL = 'avisos';

export type PhoneNotifyState = 'granted' | 'denied' | 'default' | 'unsupported';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/** El sistema del teléfono (lo guarda upsert_app_push). null en la vista previa web: ahí no hay avisos. */
export const phonePlatform = (): 'ios' | 'android' | null => (Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null);

let state: PhoneNotifyState = supported ? 'default' : 'unsupported';

/** Cómo están los permisos (lo último que se supo; refreshNotifyState lo pone al día). */
export const currentNotifyState = (): PhoneNotifyState => state;

function toState(p: Notifications.NotificationPermissionsStatus): PhoneNotifyState {
  if (Platform.OS === 'ios' && p.ios) {
    const s = p.ios.status;
    const S = IosAuthorizationStatus;
    if (s === S.AUTHORIZED || s === S.PROVISIONAL || s === S.EPHEMERAL) return 'granted';
    return s === S.DENIED ? 'denied' : 'default';
  }
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'default' : 'denied';
}

export async function refreshNotifyState(): Promise<PhoneNotifyState> {
  if (!supported) return state;
  try {
    state = toState(await Notifications.getPermissionsAsync());
  } catch {
    // Se queda con lo último.
  }
  return state;
}

// En Android 13 o más, sin canal no aparece el permiso (y los avisos necesitan un canal).
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Avisos de MatchMate',
    description: 'Resultados, recordatorios, tus ligas y lo social.',
    importance: AndroidImportance.HIGH,
  });
}

/** Pide permiso (al tocar «Activar»). */
export async function requestNotifyPermission(): Promise<PhoneNotifyState> {
  if (!supported) return state;
  await ensureChannel();
  state = toState(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
  return state;
}

/** El proyecto de EAS (sin él no hay token de Expo). */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : null;
}

/** El token de Expo de este teléfono (pide red). null: sin permiso, sin proyecto de EAS o en la vista previa web. */
export async function expoPushToken(): Promise<string | null> {
  const projectId = easProjectId();
  if (!supported || !projectId || state !== 'granted') return null;
  await ensureChannel();
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Un aviso del teléfono al momento (con la app abierta). */
export async function showLocalNotification(title: string, body: string, url: string, tag: string) {
  if (!supported || state !== 'granted') return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data: { url, tag } }, trigger: null });
}

/**
 * Al abrir la app (_layout.tsx): los avisos que llegan con la app abierta se ven arriba, y tocar uno (también el que la
 * abrió) lleva a su pantalla con `open`. Devuelve cómo dejar de escuchar.
 */
export function installNotifications(open: (url: string) => void): () => void {
  if (!supported) return () => undefined;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  const handle = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string' && url) open(url);
  };
  void refreshNotifyState();
  // El aviso que abrió la app (se borra para no volver a abrirlo al volver a esta pantalla).
  void Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (!r) return;
      handle(r);
      return Notifications.clearLastNotificationResponseAsync();
    })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
