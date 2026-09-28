import { useSocialNotices as useSocialFeed } from '../../lib/data/follows';
import type { GenericNotice } from '../../lib/notifications';
import { useActiveSport } from '../../lib/sportContext';

/**
 * Puntos de enganche de los avisos con otras partes de la app (tienen que seguir siendo hooks: se llaman siempre,
 * en orden).
 */

const NONE: readonly GenericNotice[] = [];

/**
 * Avisos del perfil social de la cuenta («X te empezó a seguir», «A X y 2 más les gustó tu partido»), como avisos
 * genéricos (`GenericNotice`). Salen de la RPC `social_notices` (src/lib/data/follows.ts: caché con copia en el
 * teléfono, se vuelve a leer cada minuto y al llegar un «follow»/«like» por el tema `user:<id>`). La lista es la misma
 * entre renders mientras no cambie. Sin cuenta, nada.
 */
export function useSocialNotices(uid: string | undefined): readonly GenericNotice[] {
  const { data } = useSocialFeed();
  return uid ? data : NONE;
}

/**
 * Deporte en el que está la app (el selector de deporte, src/lib/sportContext.ts): la página de avisos arranca
 * filtrada por él. null = todos los deportes (el Home general).
 */
export function useCurrentSport(): string | null {
  return useActiveSport();
}
