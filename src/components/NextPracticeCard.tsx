import { toIsoDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import type { BowlingEvent } from '../lib/types';
import { RsvpButton, useRsvp } from './home/RsvpButton';
import { weekdayLabel } from './home/logic';
import { MyLane } from './lanes/MyLane';
import { Card, DateBlock, ListRow, cx } from './ui';

/**
 * La práctica que muestra la tarjeta: la próxima de hoy en adelante (undefined si no hay). `skip`: las que ya se están
 * jugando (la de hoy en juego no es «la próxima»: esa se anota).
 */
export const nextPractice = (events: readonly BowlingEvent[], today: string, skip: ReadonlySet<string> = new Set()): BowlingEvent | undefined =>
  events.filter((e) => e.type === 'practica' && e.date >= today && !skip.has(e.id)).sort((a, b) => a.date.localeCompare(b.date))[0];

/**
 * Próxima práctica (rediseño «Calma y foco»): una fila con la fecha («OCT / 13»), cuántos van y «Voy» en línea (el admin
 * sabe cuántas pistas pedir). Con `lane` (por defecto) dice «Tu pista: 7»; el inicio lo apaga si esa práctica ya está
 * en vivo arriba (el tablero en vivo ya la dice). `skip`: las que se están jugando ahora (no salen como «la próxima»).
 */
export function NextPracticeCard({
  events,
  playerId,
  lane = true,
  skip,
  className,
}: {
  events: BowlingEvent[];
  playerId: string;
  lane?: boolean;
  skip?: ReadonlySet<string>;
  className?: string;
}) {
  const { lid } = useLeagueCtx();
  const rsvp = useRsvp();
  const today = toIsoDate(new Date());
  const next = nextPractice(events, today, skip);
  if (!next) return null;

  const going = !!next.rsvp?.[playerId];
  const count = Object.keys(next.rsvp ?? {}).length;
  const line = [weekdayLabel(next.date, today), count === 0 ? 'nadie confirmó todavía' : `${count} ${count === 1 ? 'va' : 'van'}`].join(' · ');

  return (
    <Card tour="proxima-practica" className={cx('animate-fade-up overflow-hidden', className)}>
      <ListRow
        leading={<DateBlock date={next.date} />}
        title="Próxima práctica"
        subtitle={line}
        trailing={<RsvpButton going={going} onToggle={(value) => rsvp(lid, next.id, playerId, value)} />}
      />
      {lane && <MyLane lid={lid} eventId={next.id} playerId={playerId} className="mb-3.5 ml-5 w-fit empty:hidden" />}
    </Card>
  );
}
