/**
 * Lo que todavía no está en la app abre la web de MatchMate dentro de la app (pestaña del navegador del sistema): la
 * misma cuenta se pide allí una vez. Cada pantalla nueva que llega a la app deja de usarlo.
 */
import * as WebBrowser from 'expo-web-browser';
import { APP_ORIGIN } from '@mm/lib/origin';

export function openOnWeb(path: string) {
  const url = APP_ORIGIN + (path.startsWith('/') ? path : `/${path}`);
  return WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(() => undefined);
}
