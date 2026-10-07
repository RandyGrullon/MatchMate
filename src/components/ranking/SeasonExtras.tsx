import type { Improvement } from '../../lib/bowlingSeason';
import type { Season } from '../../lib/seasons';
import { MIN_RANK_GAMES, rank } from '../../lib/stats';
import { Card, ListRow, SectionHeader, cx } from '../ui';
import type { SeasonRecords } from './logic';
import { Initials, PosNum } from './parts';

/** «Récords de la temporada» (Pro): mejor juego, mejor serie y asistencia, con quién los tiene. */
export function SeasonRecordsCard({ records, className }: { records: SeasonRecords; className?: string }) {
  const items = [
    { label: 'Mejor juego', rec: records.game },
    { label: 'Mejor serie', rec: records.series },
    { label: 'Asistencia', rec: records.attendance },
  ];
  if (!items.some((i) => i.rec)) return null;
  return (
    <section className={className} aria-labelledby="tabla-records">
      <SectionHeader id="tabla-records" title="Récords de la temporada" />
      <Card className="grid grid-cols-3 py-3.5">
        {items.map(({ label, rec }, i) => (
          <div key={label} className={cx('min-w-0 px-3.5', i > 0 && 'border-l border-line')}>
            <span className="block text-xs leading-[1.4] font-[550] text-muted">{label}</span>
            <b className="num mt-1 block text-2xl leading-[1.15] font-[650]">{rec?.value ?? '–'}</b>
            <span className="block truncate text-[13px] leading-[1.4] text-fg-2">{rec?.who ?? ''}</span>
          </div>
        ))}
      </Card>
    </section>
  );
}

/** Cuántos se ven en «Más mejorado». */
const IMPROVED_SHOWN = 5;

/** Más mejorado (Pro): promedio de esta temporada contra el de la anterior (con el mínimo de juegos en las dos). */
export function MostImprovedCard({
  list,
  season,
  previous,
  base,
  myPlayerId,
  className,
}: {
  list: readonly (Improvement & { name: string })[];
  season: Pick<Season, 'name'>;
  previous: Pick<Season, 'name'>;
  base: string;
  myPlayerId?: string | null;
  className?: string;
}) {
  const ranked = rank(list.slice(0, IMPROVED_SHOWN), (r) => r.delta);
  return (
    <section className={className} aria-labelledby="tabla-mejorado">
      <SectionHeader id="tabla-mejorado" title="Más mejorado" />
      <Card className="overflow-hidden">
        {ranked.map(({ row, pos }) => {
          const isMe = !!myPlayerId && row.playerId === myPlayerId;
          return (
            <ListRow
              key={row.playerId}
              dense
              to={`${base}/j/${row.playerId}`}
              chevron={false}
              me={isMe}
              leading={
                <>
                  <PosNum pos={pos} />
                  <Initials name={row.name} me={isMe} />
                </>
              }
              title={row.name}
              subtitle={<span className="tabular-nums">{`${row.previous} → ${row.current}`}</span>}
              value={<span className="text-ok">{`+${row.delta}`}</span>}
            />
          );
        })}
      </Card>
      <p className="mx-1 mt-2.5 text-[12.5px] leading-[1.4] text-muted">{`Promedio de ${season.name} contra ${previous.name}, con al menos ${MIN_RANK_GAMES} juegos aprobados en las dos.`}</p>
    </section>
  );
}
