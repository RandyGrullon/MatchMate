import { useState } from 'react';
import { Info } from 'lucide-react';
import { BR_TIEBREAK_TEXT, type BrRow } from '../../../../sports/esports';
import { Card, Empty, cx } from '../../../../components/ui';
import { FinePrint } from '../../racket/bits';

/**
 * La tabla acumulada de battle royale (§12.8): puesto, inscrito, puntos, victorias (1.os puestos), kills y partidas.
 * Como la tabla de los otros deportes: el puesto en gris, el nombre se corta con «…» (cabe en 360 px), los puntos al
 * final más grandes y una «i» donde el puesto lo decidió un desempate. Mi fila, en acento suave.
 */
export function BrLeaderboard({
  rows,
  nameOf,
  highlight,
  onRow,
  className,
}: {
  rows: readonly BrRow[];
  nameOf: (entryId: string) => string;
  highlight?: ReadonlySet<string>;
  onRow?: (entryId: string) => void;
  className?: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  if (!rows.length) return <Empty title="Sin tabla todavía">Cuando se anote la primera partida, la tabla sale aquí.</Empty>;
  const anyPlayed = rows.some((r) => r.played > 0);
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <Card className="overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
              <th scope="col" className="w-10 py-3 pr-2 pl-4 text-left font-bold">
                #
              </th>
              <th scope="col" className="py-3 pr-2 text-left font-bold">
                Nombre
              </th>
              <th scope="col" className="px-1.5 py-3 text-right font-bold" title="Victorias (1.er puesto)">
                <abbr title="Victorias" className="no-underline">
                  V
                </abbr>
              </th>
              <th scope="col" className="px-1.5 py-3 text-right font-bold" title="Kills">
                <abbr title="Kills" className="no-underline">
                  K
                </abbr>
              </th>
              <th scope="col" className="hidden px-1.5 py-3 text-right font-bold min-[400px]:table-cell" title="Partidas jugadas">
                <abbr title="Partidas jugadas" className="no-underline">
                  PJ
                </abbr>
              </th>
              <th scope="col" className="py-3 pr-4 pl-2 text-right font-bold" title="Puntos">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const me = !!highlight?.has(r.entryId);
              const why = anyPlayed && r.decidedBy ? r.decidedBy : null;
              return (
                <tr
                  key={r.entryId}
                  onClick={onRow ? () => onRow(r.entryId) : undefined}
                  className={cx('align-middle', i > 0 && !me && 'border-t border-line', me && 'bg-accent-soft', onRow && 'cursor-pointer active:bg-surface-2')}
                >
                  <td className="py-3 pr-2 pl-4 text-[15px] font-semibold text-muted tabular-nums">{r.rank}</td>
                  <td className="w-full max-w-0 py-2.5 pr-2">
                    <div className="flex min-w-0 items-center gap-0.5">
                      <span className="min-w-0 truncate text-[15px] font-semibold">{nameOf(r.entryId)}</span>
                      {why && (
                        <button
                          type="button"
                          title={`Desempate: ${why}`}
                          aria-label={`Desempate: ${why}`}
                          aria-expanded={shown === r.entryId}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShown(shown === r.entryId ? null : r.entryId);
                          }}
                          className="relative -my-2 inline-grid size-7 shrink-0 place-items-center rounded-full text-faint after:absolute after:-inset-1.5 after:content-[''] hover:text-accent"
                        >
                          <Info className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {why && shown === r.entryId && <div className="text-xs text-muted">Desempate: {why}</div>}
                  </td>
                  <td className="px-1.5 text-right text-[15px] text-fg-2 tabular-nums">{r.wins}</td>
                  <td className="px-1.5 text-right text-[15px] text-fg-2 tabular-nums">{r.kills}</td>
                  <td className="hidden px-1.5 text-right text-[15px] text-fg-2 tabular-nums min-[400px]:table-cell">{r.played}</td>
                  <td className="num pr-4 pl-2 text-right text-lg font-bold">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <FinePrint>{BR_TIEBREAK_TEXT}</FinePrint>
    </div>
  );
}
