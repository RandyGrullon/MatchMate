import { useMemo } from 'react';
import { useSocialNotices as useSocialFeed } from '../../lib/data/follows';
import { useInviteNotices } from '../../lib/data/invites';
import type { GenericNotice } from '../../lib/notifications';
import { useActiveSport } from '../../lib/sportContext';
import { useClaimNotices } from '../claims/notices';

/**
 * Puntos de enganche de los avisos con otras partes de la app (tienen que seguir siendo hooks: se llaman siempre,
 * en orden).
 */

const NONE: readonly GenericNotice[] = [];

/**
 * Avisos genéricos (`GenericNotice`) de la cuenta:
 * - del perfil social («X te empezó a seguir», «A X y 2 más les gustó tu partido»): salen de la RPC `social_notices`
 *   (src/lib/data/follows.ts: caché con copia en el teléfono, se vuelve a leer cada minuto y al llegar un
 *   «follow»/«like» por el tema `user:<id>`);
 * - de los reclamos de jugadores (src/components/claims/notices.ts): «Ana dice que es Ana P.» al dueño o admin
 *   (filtro Admin, lleva a Admin › Reclamos) y el aprobado o rechazado a quien pidió;
 * - de las invitaciones a una liga (src/lib/data/invites.ts): «Ana te invitó a Liga de los martes» (filtro Mis
 *   ligas, lleva a /invitacion/<id>) mientras esté pendiente.
 * La lista es la misma entre renders mientras no cambie. Sin cuenta, nada.
 */
export function useSocialNotices(uid: string | undefined): readonly GenericNotice[] {
  const { data } = useSocialFeed();
  const claims = useClaimNotices(uid);
  const invites = useInviteNotices(uid);
  return useMemo(() => {
    if (!uid) return NONE;
    if (!claims.length && !invites.length) return data;
    return [...data, ...claims, ...invites];
  }, [uid, data, claims, invites]);
}

/**
 * Deporte en el que está la app (el selector de deporte, src/lib/sportContext.ts): la página de avisos arranca
 * filtrada por él. null = todos los deportes (el Home general).
 */
export function useCurrentSport(): string | null {
  return useActiveSport();
}
