import { appRoute, ownPath } from '@/lib/links';

/**
 * Un link que abre la app desde fuera (enlace universal de matchmate.grullonb.com, matchmate://…, un aviso): la
 * pantalla de la app que le toca (p. ej. /l/<liga>/ranking va a la liga). Lo demás pasa tal cual (+not-found lo dice).
 * Nunca lanza: si algo sale mal, a Hoy.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const own = ownPath(path);
    if (!own) return path;
    return appRoute(own) ?? own;
  } catch {
    return '/';
  }
}
