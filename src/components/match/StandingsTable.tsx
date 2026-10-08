import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { StandingRow } from '../../sports/types';
import { Card, Empty, cx } from '../ui';

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
 * Tabla de posiciones (StandingRow[] de src/sports/formats o src/sports/team), tranquila como la Tabla del boliche: el
 * puesto en gris (sin medallas), el nombre (se corta con «…» para que la tabla quepa en un teléfono de 360 px), los
 * números en gris y la columna Pts al final, más grande. Tu fila (`highlight`), en acento suave. Si un puesto lo decidió
 * un desempate («dif. de sets», «enfrentamiento directo»), sale una «i»: en la computadora se ve al pasar el ratón y en
 * el teléfono al tocarla.
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
    <Card className={cx('overflow-hidden', className)}>
      <div className="no-scrollbar overflow-x-auto overscroll-x-contain">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
              <th scope="col" className="w-10 py-3 pr-2.5 pl-4 text-left font-bold">
                #
              </th>
              <th scope="col" className="py-3 pr-2 text-left font-bold">
                Nombre
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.title} className={cx('px-1.5 py-3 text-right font-bold whitespace-nowrap', c.wide && 'hidden sm:table-cell')}>
                  {c.label ? <abbr title={c.title} className="no-underline">{c.label}</abbr> : <span className="sr-only">{c.title}</span>}
                </th>
              ))}
              <th scope="col" className="py-3 pr-4 pl-2 text-right font-bold" title="Puntos de la tabla">
                {pointsLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const why = r.decidedBy && !primary.includes(r.decidedBy) ? r.decidedBy : null;
              const me = highlight.includes(r.id);
              const prevMe = i > 0 && highlight.includes(rows[i - 1].id);
              return (
                <tr
                  key={r.id}
                  onClick={onRow ? () => onRow(r.id) : undefined}
                  className={cx('align-middle', i > 0 && !me && !prevMe && 'border-t border-line', me && 'bg-accent-soft', onRow && 'cursor-pointer transition active:bg-surface-2')}
                >
                  <td className="py-3 pr-2.5 pl-4 text-[15px] font-semibold whitespace-nowrap text-muted tabular-nums">{r.rank}</td>
                  <td className="w-full max-w-0 py-2.5 pr-2">
                    <div className="flex min-w-0 items-center gap-0.5">
                      {onRow ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRow(r.id);
                          }}
                          className="min-w-0 truncate text-left text-[15px] font-semibold outline-none focus-visible:underline"
                        >
                          {nameOf(r.id)}
                        </button>
                      ) : (
                        <span className="min-w-0 truncate text-[15px] font-semibold">{nameOf(r.id)}</span>
                      )}
                      {why && (
                        <button
                          type="button"
                          title={`Desempate: ${why}`}
                          aria-label={`Desempate: ${why}`}
                          aria-expanded={shown === r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShown(shown === r.id ? null : r.id);
                          }}
                          className="relative -my-2 inline-grid size-7 shrink-0 place-items-center rounded-full text-faint after:absolute after:-inset-1.5 after:content-[''] hover:text-accent"
                        >
                          <Info className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {why && shown === r.id && <div className="text-xs text-muted">Desempate: {why}</div>}
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={cx('px-1.5 text-right text-[15px] whitespace-nowrap text-fg-2 tabular-nums', c.wide && 'hidden sm:table-cell')}>
                      {c.value(r)}
                    </td>
                  ))}
                  <td className="num pr-4 pl-2 text-right text-lg font-bold">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
