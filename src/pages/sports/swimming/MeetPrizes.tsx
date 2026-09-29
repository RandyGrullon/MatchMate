import { useMemo } from 'react';
import { swimComp, swimProvider } from '../../../prizes/sports';
import { TournamentPrizes } from '../../../components/prizes/TournamentPrizes';
import { placedMeet } from './logic';
import type { MeetData } from './MeetPage';

/**
 * «Premios del torneo» de un encuentro de natación (docs/premios-torneo.md §5.5): el club del encuentro (por los
 * puntos de `teamPoints`: la insignia le llega a cada nadador del club que nadó) y el nadador del encuentro (todos,
 * femenino y masculino, por `swimmerPoints`). El podio lo arma el teléfono con los resultados; el servidor revisa que
 * cada uno haya nadado (y con ese club). Se entrega con el encuentro finalizado. El control de marcas no tiene premios.
 */
export function MeetPrizes({ data }: { data: MeetData }) {
  const { lid, meet, events, entries, clubs, name } = data;
  const comp = useMemo(() => swimComp(lid, meet), [lid, meet]);
  const placed = useMemo(() => (comp ? placedMeet(events, entries, meet.points) : []), [comp, events, entries, meet.points]);
  const podium = useMemo(() => swimProvider(placed, { swimmer: name, club: (id) => clubs.get(id)?.name ?? '(club borrado)' }), [placed, name, clubs]);
  if (!comp) return null;
  return <TournamentPrizes comp={comp} ready={!!meet.finalizedAt} waitText="Se entregan cuando se finalice el encuentro" podium={podium} />;
}
