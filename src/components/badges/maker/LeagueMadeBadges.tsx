import { lazy, Suspense } from 'react';
import { canMakeBadges, useLeagueBadges } from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';

/**
 * Las insignias del creador dentro de la liga, livianas: leen los diseños y los otorgamientos, y solo cargan el dibujo y
 * los modales (MakerPanels.tsx) cuando hay algo que mostrar. En una liga con menores las ven solo los miembros.
 */

const Shelf = lazy(() => import('./MakerPanels').then((m) => ({ default: m.MakerShelf })));
const PlayerPanel = lazy(() => import('./MakerPanels').then((m) => ({ default: m.PlayerMadeBadges })));

/** «Insignias de la liga» en la portada: si la liga tiene diseños activos, o para quien los diseña. */
export function LeagueMadeBadges() {
  const ctx = useLeagueCtx();
  const hide = !!ctx.league.hasMinors && !ctx.member;
  const data = useLeagueBadges(hide ? null : ctx.lid);
  const can = canMakeBadges(ctx);
  if (hide || (data.loading && !data.data.designs.length)) return null;
  // Sin diseños activos sale solo para los miembros elegidos que no son admins (su única puerta al creador; los
  // admins lo tienen en Admin › Insignias).
  if (!data.data.designs.some((d) => d.status === 'activa') && !(can && !ctx.isAdmin)) return null;
  return (
    <Suspense fallback={null}>
      <Shelf data={data.data} />
    </Suspense>
  );
}

/** Las del creador en la página del jugador (`/l/:lid/j/:playerId`). */
export function LeaguePlayerMadeBadges({ playerId }: { playerId: string }) {
  const ctx = useLeagueCtx();
  const hide = !!ctx.league.hasMinors && !ctx.member;
  const data = useLeagueBadges(hide ? null : ctx.lid);
  if (hide || !data.data.awards.some((a) => a.playerId === playerId && !a.revokedAt && !a.hidden)) return null;
  return (
    <Suspense fallback={null}>
      <PlayerPanel playerId={playerId} data={data.data} />
    </Suspense>
  );
}
