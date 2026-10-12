import type { SquadLite } from '../../lib/data/squads';
import { Badge } from '../ui';
import { squadResultLine } from './logic';
import { SquadRow } from './SquadBits';
import { SquadFollowButton } from './SquadFollowButton';

/**
 * Un equipo encontrado (Equipos y la lupa): su logo, «Nombre [TAG]», «Equipo · Fútbol · Santo Domingo · 12 miembros ·
 * Busca jugadores» y, a la derecha, «Tu equipo» si es tuyo o Seguir / Siguiendo. Toda la fila abre el equipo.
 */
export function SquadResultRow({ squad, mine, following, dense }: { squad: SquadLite; mine: boolean; following: boolean; dense?: boolean }) {
  return (
    <SquadRow
      squad={squad}
      dense={dense}
      subtitle={squadResultLine(squad)}
      trailing={mine ? <Badge tone="accent">Tu equipo</Badge> : <SquadFollowButton squadId={squad.id} name={squad.name} following={following} size="sm" className="rounded-full!" />}
    />
  );
}
