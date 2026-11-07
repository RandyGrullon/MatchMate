import { lazy, Suspense, useMemo } from 'react';
import { useEventAwards, useLeagueAwards, usePlayerAwards, useTitleAwards } from '../../lib/data/badges';
import { useLeagueCtx } from '../../lib/league';
import { badgesHiddenIn, currentTitle, hasEventAwards } from './league';

// El título vigente y la página del jugador están en league.ts (la comparte la app del teléfono).
export { currentTitle, playerPageId } from './league';

/**
 * Las insignias dentro de la liga (docs/insignias.md §6.2), livianas: leen la base y solo cargan el catálogo y el
 * dibujo (LeagueBadgePanels.tsx) cuando hay algo que mostrar. En una liga con menores las ven solo los miembros.
 */

const MonthPanel = lazy(() => import('./LeagueBadgePanels').then((m) => ({ default: m.LeagueAwardsPanel })));
const PlayerPanel = lazy(() => import('./LeagueBadgePanels').then((m) => ({ default: m.PlayerBadgesPanel })));
const EventPanel = lazy(() => import('./LeagueBadgePanels').then((m) => ({ default: m.EventAwardsPanel })));
const Shield = lazy(() => import('./LeagueBadgePanels').then((m) => ({ default: m.TitleShield })));

/** «Premios de {octubre}» (del día 3 al 9) y «Campeones» (14 días), en el inicio de la liga. */
export function LeagueBadgeAwards() {
  const { lid, league, member } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = useLeagueAwards(hide ? null : lid);
  if (hide || !awards.data.length) return null;
  return (
    <Suspense fallback={null}>
      <MonthPanel awards={awards.data} />
    </Suspense>
  );
}

/** Las insignias de un jugador en la página del jugador (`/l/:lid/j/:playerId`): es la vitrina de los que no tienen cuenta. */
export function LeaguePlayerBadges({ playerId }: { playerId: string }) {
  const { lid, league, member } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = usePlayerAwards(hide ? null : lid, playerId);
  if (hide || !awards.data.length) return null;
  return (
    <Suspense fallback={null}>
      <PlayerPanel playerId={playerId} awards={awards.data} />
    </Suspense>
  );
}

/** Las insignias de un evento en su página (podio, categorías y equipos), cuando ya se dieron. */
export function EventBadges({ eventId, date }: { eventId: string; date: string }) {
  const { lid, league, member } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = useEventAwards(hide ? null : lid, eventId, date);
  const has = hasEventAwards(awards.data, eventId);
  if (hide || !has) return null;
  return (
    <Suspense fallback={null}>
      <EventPanel eventId={eventId} awards={awards.data} />
    </Suspense>
  );
}

/** El título vigente de la liga de la pantalla (para la tabla de posiciones). */
export function useCurrentTitle(): ReturnType<typeof currentTitle> {
  const { lid, league, member } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = useTitleAwards(hide ? null : lid);
  return useMemo(() => (hide ? null : currentTitle(awards.data)), [hide, awards.data]);
}

/** El escudo de 24 px del título vigente al lado de un jugador («Título vigente»). Nada si no es el campeón. */
export function TitleMark({ title, playerId }: { title: ReturnType<typeof currentTitle>; playerId: string }) {
  if (!title || !title.players.has(playerId)) return null;
  return (
    <Suspense fallback={null}>
      <Shield award={title.award} />
    </Suspense>
  );
}
