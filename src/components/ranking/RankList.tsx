import type { ReactNode } from 'react';
import type { RankingRow } from '../../lib/bowlingSeason';
import { Card, ListRow, cx } from '../ui';
import { Initials, PosNum, TuTag } from './parts';

/**
 * La lista de Lite: puesto, iniciales, nombre (y «Tú» en tu fila, con fondo de acento) y el número grande. Cada fila
 * abre la página del jugador. `mark`: lo que va junto al nombre (el escudo del título vigente).
 */
export function RankList({
  ranked,
  value,
  me,
  base,
  mark,
  className,
}: {
  ranked: readonly { row: RankingRow; pos: number }[];
  value: (r: RankingRow) => number;
  me: string | null | undefined;
  base: string;
  mark?: (playerId: string) => ReactNode;
  className?: string;
}) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      {ranked.map(({ row, pos }) => {
        const isMe = !!me && row.playerId === me;
        return (
          <ListRow
            key={row.playerId || row.name}
            to={row.playerId ? `${base}/j/${row.playerId}` : undefined}
            chevron={false}
            me={isMe}
            className="min-h-[60px]!"
            leading={
              <>
                <PosNum pos={pos} />
                <Initials name={row.name} me={isMe} />
              </>
            }
            title={
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{row.name}</span>
                {isMe && <TuTag />}
                {mark?.(row.playerId)}
              </span>
            }
            value={value(row)}
          />
        );
      })}
    </Card>
  );
}
