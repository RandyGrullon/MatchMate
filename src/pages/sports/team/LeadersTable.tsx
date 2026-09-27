import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown } from 'lucide-react';
import { Card, Empty, Position, cx } from '../../../components/ui';

/**
 * Tabla de líderes de la temporada (anotadores del baloncesto, goleadores del fútbol): una fila por jugador, con
 * columnas del deporte; tocar un encabezado ordena por esa columna (de mayor a menor). La primera columna de
 * `columns` es la de siempre.
 */

export interface LeaderColumn<R> {
  key: string;
  /** Encabezado corto: «PTS», «Prom», «3P». */
  label: string;
  title: string;
  value: (row: R) => number;
  /** Cómo se muestra (por defecto el número). */
  show?: (row: R) => ReactNode;
  /** Se esconde en el teléfono. */
  wide?: boolean;
}

export function LeadersTable<R extends { player: string; team: string }>({
  rows,
  columns,
  nameOf,
  teamOf,
  linkOf,
  highlight,
  empty = 'Todavía no hay partidos con la lista de presentes.',
  limit,
}: {
  rows: readonly R[];
  columns: LeaderColumn<R>[];
  nameOf: (playerId: string) => string;
  teamOf?: (teamKey: string) => ReactNode;
  linkOf?: (playerId: string) => string;
  highlight?: string | null;
  empty?: ReactNode;
  limit?: number;
}) {
  const [by, setBy] = useState(columns[0]?.key ?? '');
  const col = columns.find((c) => c.key === by) ?? columns[0];
  const sorted = useMemo(() => {
    const list = [...rows].sort((a, b) => col.value(b) - col.value(a) || columns[0].value(b) - columns[0].value(a) || nameOf(a.player).localeCompare(nameOf(b.player), 'es'));
    // Puesto compartido cuando empatan en la columna elegida.
    let rank = 0;
    return list.slice(0, limit ?? list.length).map((r, i) => {
      if (i === 0 || col.value(r) !== col.value(list[i - 1])) rank = i + 1;
      return { r, rank };
    });
  }, [rows, col, columns, nameOf, limit]);
  if (!rows.length) return <Empty title="Sin estadísticas todavía">{empty}</Empty>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="w-10 px-3 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Jugador</th>
            {columns.map((c) => (
              <th key={c.key} title={c.title} className={cx('px-2 py-2 text-right font-medium', c.wide && 'hidden sm:table-cell')}>
                <button type="button" onClick={() => setBy(c.key)} className={cx('inline-flex items-center gap-0.5', c.key === col.key && 'font-bold text-fg')} aria-label={`Ordenar por ${c.title}`}>
                  {c.label}
                  {c.key === col.key && <ArrowDown className="size-3" />}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ r, rank }) => (
            <tr key={r.player} className={cx('border-b border-line last:border-0', highlight === r.player && 'bg-accent-soft/60')}>
              <td className="px-3 py-2">
                <Position pos={rank} />
              </td>
              <td className="max-w-40 px-2 py-2">
                {linkOf ? (
                  <Link to={linkOf(r.player)} className="block truncate font-medium hover:text-accent">
                    {nameOf(r.player)}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">{nameOf(r.player)}</span>
                )}
                {teamOf && <span className="block truncate text-xs text-muted">{teamOf(r.team)}</span>}
              </td>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-2 py-2 text-right tabular-nums', c.key === col.key && 'font-bold', c.wide && 'hidden sm:table-cell')}>
                  {c.show ? c.show(r) : c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
