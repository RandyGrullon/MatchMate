import type { BowlingNumbersState } from '../components/bowlingNumbers';
import { atUsername, plural } from '../components/social/socialFormat';
import type { PublicProfile } from '../lib/data/follows';
import type { League } from '../lib/types';

/**
 * Yo (`/perfil`) sin React ni el navegador: las partes que se abren aparte, las líneas de las filas y la de tu nombre.
 * La usan ProfilePage.tsx (la web) y la pestaña Yo de la app del teléfono (movil/src/app/(tabs)/yo.tsx y
 * movil/src/app/yo/[parte].tsx).
 */

/**
 * Las partes de Yo que se abren aparte (`?tab=`): Mis juegos, Mis publicaciones, la vitrina de insignias y «Por liga y
 * temporada».
 */
export type YoPart = 'juegos' | 'publicaciones' | 'insignias' | 'estadisticas';

export const YO_PARTS: Record<YoPart, string> = {
  juegos: 'Mis juegos',
  publicaciones: 'Mis publicaciones',
  insignias: 'Insignias',
  estadisticas: 'Por liga y temporada',
};

export const yoPart = (raw: string | null | undefined): YoPart | null =>
  raw === 'juegos' || raw === 'publicaciones' || raw === 'insignias' || raw === 'estadisticas' ? raw : null;

/** Debajo de «Mis publicaciones»: cuántas llevas, o una invitación a la primera. */
export const postsLine = (posts: number | null | undefined): string => (posts ? plural(posts, 'publicación', 'publicaciones') : 'Comparte cómo te fue');

/**
 * «@anaperez · Liga de los martes»: tu usuario y tu liga (la de más juegos; «y 1 más» si tienes otras). Sin usuario ni
 * ligas, null.
 */
export function identityLine(username: string | null | undefined, leagues: readonly Pick<League, 'id' | 'name'>[], main?: string | null): string | null {
  const first = (main && leagues.find((l) => l.id === main)) || leagues[0];
  const where = first ? (leagues.length > 1 ? `${first.name} y ${leagues.length - 1} más` : first.name) : null;
  return [atUsername(username), where].filter(Boolean).join(' · ') || null;
}

/** Debajo de «Amigos y seguidores»: «3 seguidores · 1 siguiendo · 5 me gusta», o «Buscar personas» si todo está en cero. */
export function socialLine(p: Pick<PublicProfile, 'followers' | 'following' | 'likesReceived'> | null | undefined): string {
  if (!p || (!p.followers && !p.following && !p.likesReceived)) return 'Buscar personas';
  return [`${p.followers} ${p.followers === 1 ? 'seguidor' : 'seguidores'}`, `${p.following} siguiendo`, p.likesReceived > 0 && `${p.likesReceived} me gusta`]
    .filter(Boolean)
    .join(' · ');
}

/** ¿«Amigos y seguidores» lleva a buscar personas? (sin seguidores, seguidos ni me gusta; si no, abre tus seguidores). */
export const socialIsEmpty = (p: Pick<PublicProfile, 'followers' | 'following' | 'likesReceived'> | null | undefined): boolean =>
  !p || (!p.followers && !p.following && !p.likesReceived);

/**
 * ¿Salen los números del boliche (y Mis bolas y «Anotar un juego suelto»)? Si juega boliche, tiene juegos sueltos o
 * (todavía) ninguna liga de otro deporte.
 */
export const showsBowling = (bowlingLeagues: number, otherLeagues: number, soloGames: number): boolean =>
  bowlingLeagues > 0 || otherLeagues === 0 || soloGames > 0;

/** La liga de tu línea (identityLine): la primera con juegos de «Por liga» (la de más juegos); null si no hay. */
export const mainLeagueId = (state: BowlingNumbersState): string | null =>
  state.status === 'ready' ? (state.data.perLeague.find((l) => l.stats.games > 0)?.lid ?? null) : null;

/**
 * La insignia que abre un link de la tarjeta «Insignias» de Yo (`?tab=insignias&insignia=<id>`, previewBadges); null si
 * abre la vitrina entera.
 */
export function badgeLinkId(to: string): string | null {
  const raw = /[?&]insignia=([^&#]+)/.exec(to)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
