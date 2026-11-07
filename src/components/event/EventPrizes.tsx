import { useMemo } from 'react';
import { todayIn } from '../../badges/rules/periods';
import { useLeagueCtx } from '../../lib/league';
import { bowlingStandings } from '../../lib/stats';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { bowlingComp } from '../../prizes/catalog';
import { bowlingPodium } from '../../prizes/providers';
import { bowlingReady } from '../../prizes/ready';
import { bowlingNameOf, bowlingWarnings } from '../prizes/screens';
import { TournamentPrizes } from '../prizes/TournamentPrizes';

// La lógica vive en src/components/prizes/screens.ts (la comparte la app); el reporte la sigue leyendo de aquí.
export { pendingWarning } from '../prizes/screens';

/**
 * Los premios de un torneo del boliche (docs/premios-torneo.md §5.1 y §6.4): dos podios, «Equipos (scratch)» e
 * «Individual (handicap)», cada uno con la regla del torneo. El podio de la tarjeta es la clasificación oficial del
 * teléfono (solo juegos verificados); la entrega usa la del servidor, que es la misma cuenta.
 */
export function EventPrizes({ event, entries, players, now }: { event: BowlingEvent; entries: readonly Entry[]; players: readonly Player[]; now: Date }) {
  const { lid, league } = useLeagueCtx();
  const today = todayIn(now.getTime(), league.tz);
  const comp = useMemo(() => bowlingComp(lid, event), [lid, event]);
  const readiness = bowlingReady(event, entries, today);
  const standings = useMemo(() => bowlingStandings(event, entries), [event, entries]);
  const podium = useMemo(() => bowlingPodium(event, entries, bowlingNameOf(players), { ready: readiness.ready, standings }), [event, entries, players, readiness.ready, standings]);
  const warnings = useMemo(() => bowlingWarnings(standings.pending), [standings.pending]);
  if (event.type !== 'torneo') return null;
  return <TournamentPrizes comp={comp} ready={readiness.ready} waitText={readiness.waitText} podium={podium} warnings={warnings} />;
}
