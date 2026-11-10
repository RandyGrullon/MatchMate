/**
 * Los links de MatchMate (los de la web, los de los avisos y los que abren la app desde fuera) → la pantalla de la app
 * que les toca. Lo que la app todavía no tiene se abre en la web (openOnWeb).
 *
 * Al agregar una pantalla que se abre por link, sumarla aquí y, si se comparte afuera, en APP_LINK_PATHS
 * (appLinkPaths.ts: los enlaces universales).
 */
import { router } from 'expo-router';
import { APP_ORIGIN } from '@mm/lib/origin';
import { parseActiveSport, setActiveSport, sportHomeTarget } from '@mm/lib/sportContext';
import { openOnWeb } from './web';

const TABS = ['/', '/ligas', '/social', '/yo', '/empresa', '/login', '/buscar'];

/** Las pantallas de Organizar que la app tiene: la pestaña `?tab=` de la web → la pantalla en `/l/<liga>/…`. */
const ADMIN_SCREENS: Record<string, string> = {
  avisar: 'avisar',
  jugadores: 'jugadores',
  miembros: 'miembros',
  reclamos: 'reclamos',
  equipos: 'equipos',
  temporada: 'temporada',
  aprobar: 'aprobar',
  buzon: 'buzon',
  liga: 'ajustes',
  insignias: 'insignias',
  confirmar: 'confirmar',
  reportes: 'reportes',
  nadadores: 'nadadores',
  clubes: 'clubes',
  parejas: 'parejas',
  campos: 'campos',
};

/** La pantalla de la app para una dirección de la web (con su ?…), o null si la app no la tiene. */
export function appRoute(href: string): string | null {
  const cut = href.search(/[?#]/);
  const path = (cut < 0 ? href : href.slice(0, cut)).replace(/\/+$/, '') || '/';
  const query = cut < 0 || href[cut] === '#' ? '' : href.slice(cut).split('#')[0];
  if (TABS.includes(path) || path === '/auth') return path + query;
  // Términos y privacidad (el ancla de la web, `#fotos`, es `?seccion=fotos` en la app), Acerca de y Contáctanos.
  if (path === '/terminos' || path === '/privacidad') {
    const section = /#([^#]+)$/.exec(href)?.[1];
    return section ? `${path}?seccion=${encodeURIComponent(section)}` : path;
  }
  if (path === '/acerca' || path === '/contacto') return path;
  // El inicio de un deporte (`/d/<deporte>`, SportHomePage de la web): la app se queda en ese deporte (el filtro de
  // Ligas y el color) y va a Hoy; esports, a su índice.
  const sportHome = /^\/d\/([^/]+)$/.exec(path);
  if (sportHome) {
    const sport = parseActiveSport(decodeURIComponent(sportHome[1]));
    if (sport) setActiveSport(sport);
    return sportHomeTarget(sport);
  }
  if (/^\/unirse\/[^/]+$/.test(path)) return path + query;
  // Equipos: el índice (con su ?crear= y ?deporte=), unirse con el código y un equipo (?tab=, ?jugador=, ?invitar=).
  if (path === '/equipos') return path + query;
  if (/^\/equipos\/unirse\/[^/]+$/.test(path)) return path;
  if (/^\/equipos\/[^/]+$/.test(path)) return path + query;
  // El link para anotar (con su ?entrar=1 al volver de entrar).
  if (/^\/anotar\/[^/]+$/.test(path)) return path + query;
  // La campana (con sus ?ver= y ?deporte=) y una invitación a una liga.
  if (path === '/avisos') return path + query;
  if (/^\/invitacion\/[^/]+$/.test(path)) return path;
  // Un partido (`?partido=` en la liga, sus partidos o un evento; los avisos de resultados llegan así).
  const partido = /[?&]partido=([^&]+)/.exec(query)?.[1];
  const inLeague = /^\/l\/([^/]+)/.exec(path);
  if (partido && inLeague) return `/l/${inLeague[1]}/partido/${partido}`;
  // Los equipos de un torneo (?tab=equipos, también «Armar equipos» de Por hacer).
  const evTeams = /^\/l\/([^/]+)\/e\/([^/]+)$/.exec(path);
  if (evTeams && /[?&]tab=equipos(&|$)/.test(query)) return `/l/${evTeams[1]}/e/${evTeams[2]}/equipos`;
  // La Planilla (?tab=juegos, también el botón «planilla» de Hoy) y las Pistas del evento (a quien no anota, al evento).
  if (evTeams && /[?&]tab=juegos(&|$)/.test(query)) return `/l/${evTeams[1]}/e/${evTeams[2]}/planilla`;
  if (evTeams && /[?&]tab=pistas(&|$)/.test(query)) return `/l/${evTeams[1]}/e/${evTeams[2]}/pistas`;
  // Un evento, con su ?ver= o ?tab= (natación: «Cronometrar»; golf: la tarjeta o el leaderboard).
  if (/^\/l\/[^/]+\/e\/[^/]+$/.test(path)) return path + query;
  // La tabla y los partidos de la liga (las pestañas de la web; esports: la tabla de un torneo con ?torneo=). En
  // boliche, «Resultados anteriores» (con su ?juego=…&evento=…: el «Ver» de Social y los avisos abren ese juego).
  // La mesa anotadora de un partido de equipos (`/l/<liga>/juegos?partido=…&mesa=1`).
  const tbl = /^\/l\/([^/]+)\/juegos$/.exec(path);
  const tblMatch = /[?&]partido=([^&]+)/.exec(query)?.[1];
  if (tbl && tblMatch && /[?&]mesa=1(&|$)/.test(query)) return `/l/${tbl[1]}/mesa/${tblMatch}`;
  const tab = /^\/l\/([^/]+)\/(ranking|juegos)$/.exec(path);
  if (tab) return `/l/${tab[1]}/${tab[2] === 'ranking' ? 'tabla' : 'partidos'}${query}`;
  if (/^\/l\/[^/]+\/(muro|perfil|temporadas)$/.test(path)) return path;
  // Los playoffs de equipos y la página de un jugador.
  if (/^\/l\/[^/]+\/playoffs$/.test(path)) return path + query;
  if (/^\/l\/[^/]+\/j\/[^/]+$/.test(path)) return path;
  // En vivo de la liga (con su ?s=<transmisión>).
  if (/^\/l\/[^/]+\/vivo$/.test(path)) return path + query;
  if (/^\/p\/[^/]+$/.test(path)) return path;
  // Esports: el índice (con su ?crear=), Mi ID de juego, un equipo, unirse a un equipo, crear un torneo
  // (`/esports/<juego>/nuevo-torneo`, con su ?liga=) y la página de un juego (con su ?crear=liga).
  if (path === '/esports') return '/esports' + query;
  if (path === '/esports/mi-id') return path + query;
  if (/^\/esports\/(equipo|unirse)\/[^/]+$/.test(path)) return path;
  if (/^\/esports\/[^/]+\/nuevo-torneo$/.test(path)) return path + query;
  if (/^\/esports\/[^/]+$/.test(path)) return path + query;
  // Juegos sueltos (?juego= abre uno, ?nuevo=1 uno nuevo) y Mis bolas (?bola=, ?nueva=1, ?catalogo=, ?buscar=).
  if (path === '/juegos-sueltos' || path === '/bolas') return path + query;
  // El Calendario (con su ?ver=mias, ?deporte=, ?dia= y ?apuntar=).
  if (path === '/agenda') return path + query;
  // Dónde jugar (con su ?deporte=) y la ficha de un espacio.
  if (path === '/canchas') return path + query;
  if (/^\/canchas\/[^/]+$/.test(path)) return path;
  // El perfil (con su ?tab=: Publicaciones, Juegos o Insignias, y ?insignia= abre una).
  // Yo (`/perfil`) y sus partes (`?tab=juegos|publicaciones|insignias`; `&insignia=` abre una y `&quieta=1` sin
  // animarla) y «Por liga y temporada» (`?tab=estadisticas`): la pestaña Yo y `/yo/<parte>`.
  if (path === '/perfil') {
    const part = /[?&]tab=([^&]+)/.exec(query)?.[1];
    if (!part) return '/yo';
    if (part !== 'juegos' && part !== 'publicaciones' && part !== 'insignias' && part !== 'estadisticas') return null;
    const rest = query.slice(1).split('&').filter((kv) => kv && !kv.startsWith('tab=')).join('&');
    return `/yo/${part}${rest ? `?${rest}` : ''}`;
  }
  const user = /^\/u\/([^/]+)/.exec(path);
  if (user) return `/u/${user[1]}${query}`;
  // Organizar (`/organizar?liga=`) y cada pantalla suya (la pestaña ?tab= de la web). Sin pestaña, Organizar de esa liga
  // (como la web); una pestaña que la app todavía no tiene se abre en la web.
  if (path === '/organizar') return path + query;
  // Configuración de la cuenta (con su ?foto=1 o ?recuperar=1).
  if (path === '/cuenta') return path + query;
  const admin = /^\/l\/([^/]+)\/admin$/.exec(path);
  if (admin) {
    const adminTab = /[?&]tab=([^&]+)/.exec(query)?.[1];
    const screen = adminTab ? ADMIN_SCREENS[adminTab] : undefined;
    if (!adminTab || adminTab === 'pendientes') return `/organizar?liga=${admin[1]}`;
    // Con su ?parte= (Organizar › Equipos: Equipos · Partidos · Reglas · Comité).
    const parte = /[?&]parte=([^&]+)/.exec(query)?.[1];
    return screen ? `/l/${admin[1]}/${screen}${parte ? `?parte=${parte}` : ''}` : null;
  }
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
