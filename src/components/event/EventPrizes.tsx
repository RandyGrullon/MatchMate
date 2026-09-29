import { useMemo } from 'react';
import { todayIn } from '../../badges/rules/periods';
import { useLeagueCtx } from '../../lib/league';
import { bowlingStandings } from '../../lib/stats';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { bowlingComp } from '../../prizes/catalog';
import { bowlingPodium } from '../../prizes/providers';
import { bowlingReady } from '../../prizes/ready';
import { TournamentPrizes } from '../prizes/TournamentPrizes';

/** «Hay 3 juegos por verificar: pueden cambiar el podio.» (null si no hay). */
export function pendingWarning(pending: number): string | null {
  if (pending <= 0) return null;
  return `Hay ${pending} ${pending === 1 ? 'juego' : 'juegos'} por verificar: ${pending === 1 ? 'puede' : 'pueden'} cambiar el podio.`;
}

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
  const podium = useMemo(() => {
    const names = new Map(players.map((p) => [p.id, p.name] as const));
    return bowlingPodium(event, entries, (id) => names.get(id) ?? '(jugador borrado)', { ready: readiness.ready, standings });
  }, [event, entries, players, readiness.ready, standings]);
  const warning = pendingWarning(standings.pending);
  const warnings = useMemo(() => (warning ? [warning] : []), [warning]);
  if (event.type !== 'torneo') return null;
  return <TournamentPrizes comp={comp} ready={readiness.ready} waitText={readiness.waitText} podium={podium} warnings={warnings} />;
}
