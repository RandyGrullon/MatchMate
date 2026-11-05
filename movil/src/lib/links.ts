/**
 * Los links de MatchMate (los de la web, los de los avisos y los que abren la app desde fuera) → la pantalla de la app
 * que les toca. Lo que la app todavía no tiene se abre en la web (openOnWeb).
 *
 * Al agregar una pantalla que se abre por link, sumarla aquí y, si se comparte afuera, en APP_LINK_PATHS
 * (appLinkPaths.ts: los enlaces universales).
 */
import { router } from 'expo-router';
import { APP_ORIGIN } from '@mm/lib/origin';
import { openOnWeb } from './web';

const TABS = ['/', '/ligas', '/social', '/yo', '/empresa', '/login', '/buscar'];

/** La pantalla de la app para una dirección de la web (con su ?…), o null si la app no la tiene. */
export function appRoute(href: string): string | null {
  const cut = href.search(/[?#]/);
  const path = (cut < 0 ? href : href.slice(0, cut)).replace(/\/+$/, '') || '/';
  const query = cut < 0 || href[cut] === '#' ? '' : href.slice(cut).split('#')[0];
  if (TABS.includes(path) || path === '/auth') return path + query;
  if (/^\/unirse\/[^/]+$/.test(path)) return path + query;
  // Un partido (`?partido=` en la liga, sus partidos o un evento; los avisos de resultados llegan así).
  const partido = /[?&]partido=([^&]+)/.exec(query)?.[1];
  const inLeague = /^\/l\/([^/]+)/.exec(path);
  if (partido && inLeague) return `/l/${inLeague[1]}/partido/${partido}`;
  if (/^\/l\/[^/]+\/e\/[^/]+$/.test(path)) return path;
  // La tabla y los partidos de la liga (las pestañas de la web).
  const tab = /^\/l\/([^/]+)\/(ranking|juegos)$/.exec(path);
  if (tab) return `/l/${tab[1]}/${tab[2] === 'ranking' ? 'tabla' : 'partidos'}`;
  if (/^\/l\/[^/]+\/muro$/.test(path)) return path;
  if (/^\/p\/[^/]+$/.test(path)) return path;
  // Dónde jugar (con su ?deporte=) y la ficha de un espacio.
  if (path === '/canchas') return path + query;
  if (/^\/canchas\/[^/]+$/.test(path)) return path;
  // El perfil (?tab= de la web: Publicaciones o Juegos se eligen ahí).
  const user = /^\/u\/([^/]+)/.exec(path);
  if (user) return `/u/${user[1]}`;
  // Las otras partes de la liga (perfil, admin…) todavía están en la liga misma.
  const league = /^\/l\/([^/]+)(\/.*)?$/.exec(path);
  if (league) return `/l/${league[1]}`;
  return null;
}

/** De un link completo de MatchMate (https://matchmate.grullonb.com/…) a su dirección; de otro sitio, null. */
export function ownPath(url: string): string | null {
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    return u.origin === APP_ORIGIN ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/** Abre un link de MatchMate (un aviso, un link dentro de un texto): en la app si la tiene, si no en la web. */
export function openLink(url: string) {
  const path = ownPath(url);
  if (!path) return;
  const route = appRoute(path);
  if (route) router.push(route as never);
  else void openOnWeb(path);
}
