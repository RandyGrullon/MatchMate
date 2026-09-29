import { useMemo } from 'react';
import { asGenericNotice, claimNotices, useMyClaims } from '../../lib/data/claims';
import { useMyMemberships } from '../../lib/data/members';
import type { GenericNotice } from '../../lib/notifications';
import { usePendingClaimsOf, useRefreshWhilePending } from './data';

const NONE: readonly GenericNotice[] = [];

/**
 * Avisos de reclamos para la campana, como avisos genéricos:
 * - al dueño o admin: «Ana dice que es Ana P.» (pendiente, va en el filtro Admin) → Admin › Reclamos;
 * - a quien pidió: aprobado o rechazado (14 días) → la liga.
 * El nombre y el deporte de la liga los pone la campana (el aviso lleva `lid`). Sin cuenta, nada.
 */
export function useClaimNotices(uid: string | undefined): readonly GenericNotice[] {
  const memberships = useMyMemberships(uid);
  const adminOf = useMemo(
    () => (uid ? memberships.data.filter((m) => m.uid === uid && (m.role === 'owner' || m.role === 'admin')).map((m) => m.leagueId) : []),
    [memberships.data, uid],
  );
  const leagueClaims = usePendingClaimsOf(adminOf);
  const mine = useMyClaims(uid ?? null);
  useRefreshWhilePending(mine.data.some((c) => c.status === 'pending'));
  return useMemo(() => {
    if (!uid) return NONE;
    const list = claimNotices({ uid, leagueClaims: leagueClaims.data, myClaims: mine.data });
    if (!list.length) return NONE;
    return list.map((n) => ({ ...asGenericNotice(n), category: n.kind === 'claim-request' ? 'admin' : 'ligas' }) satisfies GenericNotice);
  }, [uid, leagueClaims.data, mine.data]);
}
