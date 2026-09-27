import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { StandingRow } from '../../sports/types';
import { Card, Empty, Position, cx } from '../ui';

export interface StandingsColumn {
  key: string;
  /** Encabezado corto: «PJ», «Sets», «Dif.». */
  label: string;
  /** Texto completo (tooltip y lectores de pantalla). */
  title?: string;
  value: (row: StandingRow) => ReactNode;
  /** Se esconde en el teléfono. */
  wide?: boolean;
}

/** Columnas de siempre: PJ, G, E (si `draws`), P, a favor, en contra, diferencia. Los nombres de a favor/en contra los da el deporte. */
export function defaultColumns(opts: { draws?: boolean; forLabel?: string; againstLabel?: string; diffLabel?: string } = {}): StandingsColumn[] {
  const cols: StandingsColumn[] = [
    { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
    { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
  ];
  if (opts.draws) cols.push({ key: 'drawn', label: 'E', title: 'Empatados', value: (r) => r.drawn });
  cols.push({ key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost });
  cols.push(
    { key: 'for', label: opts.forLabel ?? 'F', title: 'A favor', value: (r) => r.for, wide: true },
    { key: 'against', label: opts.againstLabel ?? 'C', title: 'En contra', value: (r) => r.against, wide: true },
    { key: 'diff', label: opts.diffLabel ?? 'Dif.', title: 'Diferencia', value: (r) => (r.diff > 0 ? `+${r.diff}` : r.diff) },
  );
  return cols;
}

/**
 * Tabla de posiciones (StandingRow[] de src/sports/formats o src/sports/team). La columna Pts va al final. Si un
 * puesto lo decidió un desempate («dif. de sets», «enfrentamiento directo»), sale una «i»: en la computadora se
 * ve al pasar el ratón y en el teléfono al tocarla.
 */
export function StandingsTable({
  rows,
  nameOf,
  columns = defaultColumns(),
  highlight = [],
  pointsLabel = 'Pts',
  /** Lo que no es desempate (el orden normal): no se marca. */
  primary = ['puntos'],
  onRow,
  empty = 'Todavía no hay partidos confirmados.',
  className,
}: {
  rows: readonly StandingRow[];
  nameOf: (id: string) => ReactNode;
  columns?: StandingsColumn[];
  /** Ids resaltados (mi pareja, mi equipo). */
  highlight?: readonly string[];
  pointsLabel?: string;
  primary?: readonly string[];
  onRow?: (id: string) => void;
  empty?: ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  if (!rows.length) return <Empty title="Sin tabla todavía">{empty}</Empty>;
  return (
    <Card className={cx('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="w-10 px-3 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Nombre</th>
            {columns.map((c) => (
              <th key={c.key} title={c.title} className={cx('px-2 py-2 text-right font-medium', c.wide && 'hidden sm:table-cell')}>
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium" title="Puntos de la tabla">
              {pointsLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const why = r.decidedBy && !primary.includes(r.decidedBy) ? r.decidedBy : null;
            return (
              <tr
                key={r.id}
                onClick={onRow ? () => onRow(r.id) : undefined}
                className={cx(
                  'border-b border-line align-top last:border-0',
                  onRow && 'cursor-pointer transition hover:bg-surface-2/70',
                  highlight.includes(r.id) && 'bg-accent-soft/50',
                )}
              >
                <td className="px-3 py-2.5">
                  <Position pos={r.rank} />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{nameOf(r.id)}</span>
                    {why && (
                      <button
                        type="button"
                        title={`Desempate: ${why}`}
                        aria-label={`Desempate: ${why}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShown(shown === r.id ? null : r.id);
                        }}
                        className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-accent"
                      >
                        <Info className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {why && shown === r.id && <div className="text-xs text-muted">Desempate: {why}</div>}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-2 py-2.5 text-right text-muted tabular-nums', c.wide && 'hidden sm:table-cell')}>
                    {c.value(r)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
