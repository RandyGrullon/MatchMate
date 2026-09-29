import { Link } from 'react-router';
import { Clock } from 'lucide-react';
import { useLeagueClaims } from '../../lib/data/claims';
import { useLeagueCtx } from '../../lib/league';
import { Badge } from '../ui';
import { pendingFor } from './logic';

/**
 * Marca «Reclamo pendiente» en la lista de jugadores del admin: alguien con cuenta dice que es este jugador. Lleva a
 * Admin › Reclamos. Nada si no hay pedido pendiente o quien mira no es admin (la RLS no le deja ver los pedidos).
 */
export function PlayerClaimBadge({ playerId, className }: { playerId: string; className?: string }) {
  const { lid, base, isAdmin } = useLeagueCtx();
  const claims = useLeagueClaims(isAdmin ? lid : null);
  const c = pendingFor(claims.data, playerId);
  if (!c) return null;
  return (
    <Link to={`${base}/admin?tab=reclamos`} title={`${c.claimantName} dice que es ${c.playerName}`} className={className}>
      <Badge tone="warn">
        <Clock className="size-3" aria-hidden="true" /> Reclamo pendiente
      </Badge>
    </Link>
  );
}
