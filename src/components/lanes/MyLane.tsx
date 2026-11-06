import { Rows3 } from 'lucide-react';
import { usePlayers } from '../../lib/data';
import { useEventLanes } from '../../lib/data/lanes';
import { myLaneText } from '../../lib/lanes';
import { cx } from '../ui';

export { myLaneText } from '../../lib/lanes';

/**
 * La pista del jugador en ese evento de boliche, cuando el admin ya publicó las pistas: en el evento, en las
 * tarjetas de la liga (en vivo y próxima práctica) y en las del Home (en juego y tu próximo evento). No sale nada
 * si no tiene pista. Sirve fuera de una liga (el Home): la liga va en `lid`.
 */
export function MyLane({ lid, eventId, playerId, className }: { lid: string; eventId: string; playerId: string | null | undefined; className?: string }) {
  const lanes = useEventLanes(playerId ? lid : null, eventId);
  const players = usePlayers(lanes.data.length ? lid : undefined);
  const info = myLaneText(lanes.data, playerId, (id) => players.data.find((p) => p.id === id)?.name);
  if (!info) return null;
  return (
    <div className={cx('flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-accent', className)} role="status">
      <Rows3 className="size-4 shrink-0" />
      <span className="shrink-0 text-sm font-bold">Tu pista: {info.lane}</span>
      {info.mates && <span className="min-w-0 truncate text-xs text-muted">· {info.mates}</span>}
    </div>
  );
}
