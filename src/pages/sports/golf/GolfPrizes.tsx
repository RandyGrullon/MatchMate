import { useMemo } from 'react';
import { useEvents } from '../../../lib/data';
import { useGolfTournament, type GolfCardDoc, type GolfRoundFull } from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import { golfComp, golfProvider, type GolfPrizeSource } from '../../../prizes/sports';
import { TournamentPrizes } from '../../../components/prizes/TournamentPrizes';

/**
 * «Premios del torneo» del golf (docs/premios-torneo.md §5.4): individual con la competencia oficial, y si se quiere
 * gross y neto. Una ronda suelta premia su ronda; una ronda de un torneo muestra los premios del torneo entero (no hay
 * premio de una ronda dentro de un torneo). El podio lo arma el teléfono con el leaderboard (`roundBoard` o
 * `tournamentBoard`); el servidor revisa que cada uno haya jugado y que nadie se lo entregue a sí mismo. Se entrega con
 * la ronda (o todas las del torneo) cerrada.
 */
export function GolfPrizes({
  eventId,
  name,
  date,
  round,
  cards,
  tournamentName,
  nameOf,
}: {
  eventId: string;
  /** El nombre de la ronda (el del evento). */
  name: string;
  date: string;
  round: GolfRoundFull;
  /** Las tarjetas de la ronda como están en el servidor. */
  cards: readonly GolfCardDoc[];
  tournamentName?: string | null;
  nameOf: (playerId: string) => string;
}) {
  const { lid } = useLeagueCtx();
  const tid = round.tournamentId;
  const tournament = useGolfTournament(lid, tid);
  // El día de la última ronda del torneo (la cinta por defecto es su mes).
  const events = useEvents(tid ? lid : undefined);
  const rounds = tournament.data.rounds;
  const lastDate = useMemo(() => {
    if (!tid) return date;
    const ids = new Set(rounds.map((r) => r.eventId));
    return events.data.filter((e) => ids.has(e.id)).reduce((d, e) => (e.date > d ? e.date : d), date);
  }, [tid, rounds, events.data, date]);
  const comp = useMemo(
    () => golfComp(lid, { eventId, tournamentId: tid, name: tid ? (tournamentName ?? '') : name, date: lastDate }),
    [lid, eventId, tid, tournamentName, name, lastDate],
  );
  const src: GolfPrizeSource = useMemo(() => (tid ? tournament.data : { rounds: [round], cards }), [tid, tournament.data, round, cards]);
  const podium = useMemo(() => golfProvider(src, nameOf), [src, nameOf]);
  // La ronda en pantalla va con lo último (recién cerrada, por ejemplo).
  const ready = tid ? rounds.length > 0 && rounds.every((r) => (r.eventId === round.eventId ? round.closed : r.closed)) : round.closed;
  return (
    <TournamentPrizes
      comp={comp}
      ready={ready}
      waitText={tid ? 'Se entregan cuando se cierren todas las rondas del torneo' : 'Se entregan cuando se cierre la ronda'}
      podium={podium}
    />
  );
}
