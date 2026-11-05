/**
 * La señal y la vuelta a la app en el teléfono. En React Native no existen `navigator.onLine` ni los eventos `online`
 * y `focus` del navegador, con los que la capa de datos compartida (src/lib/db/query.ts y outbox.ts) vuelve a pedir lo
 * que falló y manda la cola: aquí salen de NetInfo y AppState y se avisan por `window` (events.ts). Al irse la app a
 * segundo plano se manda lo que esperaba publicarse en vivo (flushLive, como el `pagehide` de la web).
 */
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';
import { flushLive } from '@mm/lib/draft';
import { emitWindowEvent } from './events';

let online = true;
const listeners = new Set<(online: boolean) => void>();

/** ¿Hay señal? (sin saberlo todavía, sí: como el navegador). */
export const isDeviceOnline = () => online;

/** Avisa cada vez que cambia la señal. Devuelve cómo dejar de escuchar. */
export function onNetwork(listener: (online: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let installed = false;

export function installNetwork() {
  if (installed) return;
  installed = true;
  if (Platform.OS !== 'web') {
    // Como en el navegador: la capa compartida mira `navigator.onLine === false` antes de pedir.
    try {
      Object.defineProperty(globalThis.navigator, 'onLine', { get: () => online, configurable: true });
    } catch {
      // Un navigator congelado: queda la señal que diga el backend.
    }
    AppState.addEventListener('change', (status) => {
      if (status === 'active') emitWindowEvent('focus');
      else if (status === 'background') {
        flushLive();
        // El modo cancha publica lo pendiente con el `pagehide` de la web (src/court/background.ts).
        emitWindowEvent('pagehide');
      }
    });
  }
  NetInfo.addEventListener((state) => {
    // isInternetReachable es null mientras no se sabe: se da por buena.
    const next = state.isConnected !== false && state.isInternetReachable !== false;
    const changed = next !== online;
    online = next;
    listeners.forEach((listener) => listener(online));
    if (changed && Platform.OS !== 'web') emitWindowEvent(next ? 'online' : 'offline');
  });
}
