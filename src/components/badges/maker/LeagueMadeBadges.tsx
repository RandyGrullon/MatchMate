import { lazy, Suspense } from 'react';
import { canMakeBadges, useLeagueBadges } from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { madeHidden, playerMadeShown, shelfShown } from './view';

/**
 * Las insignias del creador dentro de la liga, livianas: leen los diseños y los otorgamientos, y solo cargan el dibujo y
 * los modales (MakerPanels.tsx) cuando hay algo que mostrar. En una liga con menores las ven solo los miembros.
 */

const Shelf = lazy(() => import('./MakerPanels').then((m) => ({ default: m.MakerShelf })));
const PlayerPanel = lazy(() => import('./MakerPanels').then((m) => ({ default: m.PlayerMadeBadges })));

/** «Insignias de la liga» en la portada: si la liga tiene diseños activos, o para quien los diseña. */
export function LeagueMadeBadges() {
  const ctx = useLeagueCtx();
  const hide = madeHidden(ctx.league, ctx.member);
  const data = useLeagueBadges(hide ? null : ctx.lid);
  const can = canMakeBadges(ctx);
  // Sin diseños activos sale solo para los miembros elegidos que no son admins (su única puerta al creador; los
  // admins lo tienen en Admin › Insignias).
  if (!shelfShown({ hidden: hide, loading: data.loading, designs: data.data.designs, can, isAdmin: ctx.isAdmin })) return null;
  return (
    <Suspense fallback={null}>
      <Shelf data={data.data} />
    </Suspense>
  );
}

/** Las del creador en la página del jugador (`/l/:lid/j/:playerId`). */
export function LeaguePlayerMadeBadges({ playerId }: { playerId: string }) {
  const ctx = useLeagueCtx();
  const hide = madeHidden(ctx.league, ctx.member);
  const data = useLeagueBadges(hide ? null : ctx.lid);
  if (!playerMadeShown(hide, data.data.awards, playerId)) return null;
  return (
    <Suspense fallback={null}>
      <PlayerPanel playerId={playerId} data={data.data} />
    </Suspense>
  );
}
