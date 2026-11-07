/**
 * Las partes del perfil público de una cuenta (`/u/:userId`): «Publicaciones | Juegos | Estadísticas | Insignias» y qué
 * parte abre el link (`?tab=`). Sin React: lo usan UserProfilePage.tsx de la web y el perfil de la app del teléfono
 * (movil/src/app/u/[userId]/index.tsx).
 */

export type ProfileTab = 'publicaciones' | 'juegos' | 'estadisticas' | 'insignias';

/** Las pestañas, en su orden y con su nombre. */
export const PROFILE_TABS: readonly { key: ProfileTab; label: string }[] = [
  { key: 'publicaciones', label: 'Publicaciones' },
  { key: 'juegos', label: 'Juegos' },
  { key: 'estadisticas', label: 'Estadísticas' },
  { key: 'insignias', label: 'Insignias' },
];

/** `?tab=` → la parte que se ve (Publicaciones si no dice otra). */
export const profileTab = (raw: string | null | undefined): ProfileTab =>
  raw === 'juegos' || raw === 'estadisticas' || raw === 'insignias' ? raw : 'publicaciones';
