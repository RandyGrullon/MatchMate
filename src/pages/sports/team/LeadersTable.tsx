import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Card, Empty, ListRow, cx } from '../../../components/ui';
import { Initials, TuTag } from '../../../components/ranking/parts';

/**
 * Tabla de líderes de la temporada (anotadores del baloncesto, goleadores del fútbol), rediseño «Calma y foco»:
 * - Lite: una lista tranquila (puesto, iniciales, nombre con su equipo y lo de cada uno en una línea, `line`) con el
 *   número de la primera columna grande al final; tú resaltado con «Tú».
 * - Pro (`full`): la tabla con todas las columnas; tocar un encabezado ordena por esa columna (de mayor a menor) y la
 *   ordenada va subrayada en el color del deporte.
 * La primera columna de `columns` es la de siempre.
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

const TH = 'py-3 text-[11px] font-bold tracking-[0.05em] text-muted uppercase';

export function LeadersTable<R extends { player: string; team: string }>({
  rows,
  columns,
  nameOf,
  teamOf,
  linkOf,
  highlight,
  empty = 'Todavía no hay partidos con la lista de presentes.',
  limit,
  full = true,
  line,
}: {
  rows: readonly R[];
  columns: LeaderColumn<R>[];
  nameOf: (playerId: string) => string;
  teamOf?: (teamKey: string) => ReactNode;
  linkOf?: (playerId: string) => string;
  highlight?: string | null;
  empty?: ReactNode;
  limit?: number;
  /** Pro: la tabla con todas las columnas. Lite (false): la lista. */
  full?: boolean;
  /** Lite: lo de cada uno debajo del nombre («25,5 por partido»), además del equipo. */
  line?: (row: R) => string | null;
}) {
  const [by, setBy] = useState(columns[0]?.key ?? '');
  const col = (full && columns.find((c) => c.key === by)) || columns[0];
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

  if (!full) {
    return (
      <Card className="overflow-hidden">
        {sorted.map(({ r, rank }) => {
          const me = highlight === r.player;
          const team = teamOf?.(r.team);
          const extra = line?.(r);
          return (
            <ListRow
              key={r.player}
              me={me}
              leading={
                <>
                  <span className="num w-[18px] shrink-0 text-center text-[15px] font-semibold tracking-normal text-muted">{rank}</span>
                  <Initials name={nameOf(r.player)} me={me} />
                </>
              }
              title={
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate">{nameOf(r.player)}</span>
                  {me && <TuTag />}
                </span>
              }
              subtitle={[typeof team === 'string' ? team : null, extra].filter(Boolean).join(' · ') || undefined}
              value={col.show ? col.show(r) : col.value(r)}
              to={linkOf?.(r.player)}
              ariaLabel={`${rank}.º ${nameOf(r.player)}: ${col.value(r)} ${col.title.toLowerCase()}`}
              chevron={false}
            />
          );
        })}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="no-scrollbar overflow-x-auto overscroll-x-contain">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={cx(TH, 'w-10 pl-4 text-left')}>
                #
              </th>
              <th scope="col" className={cx(TH, 'pr-2 text-left')}>
                Jugador
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.title} className={cx(TH, 'px-1.5 text-right last:pr-4', c.wide && 'hidden sm:table-cell')}>
                  <button
                    type="button"
                    onClick={() => setBy(c.key)}
                    aria-label={`Ordenar por ${c.title}`}
                    aria-pressed={c.key === col.key}
                    className={cx(
                      "relative inline-flex min-h-6 items-center uppercase after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']",
                      c.key === col.key && 'text-accent shadow-[inset_0_-2px_0_var(--accent)]',
                    )}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ r, rank }, i) => {
              const me = highlight === r.player;
              const prevMe = i > 0 && highlight === sorted[i - 1].r.player;
              return (
                <tr key={r.player} className={cx('align-middle', i > 0 && !me && !prevMe && 'border-t border-line', me && 'bg-accent-soft')}>
                  <td className="w-10 py-3 pr-2 pl-4 align-middle text-[15px] font-semibold whitespace-nowrap text-muted tabular-nums">{rank}</td>
                  <td className="w-full max-w-0 py-2.5 pr-2 align-middle">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {linkOf ? (
                        <Link to={linkOf(r.player)} className="min-w-0 truncate text-[15px] font-semibold outline-none focus-visible:underline">
                          {nameOf(r.player)}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate text-[15px] font-semibold">{nameOf(r.player)}</span>
                      )}
                      {me && <TuTag small />}
                    </span>
                    {teamOf && <span className="block truncate text-[13px] text-muted">{teamOf(r.team)}</span>}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cx(
                        'num px-1.5 py-3 text-right align-middle last:pr-4',
                        c.key === col.key ? 'text-[17px] font-bold text-fg' : 'text-[15px] text-muted',
                        c.wide && 'hidden sm:table-cell',
                      )}
                    >
                      {c.show ? c.show(r) : c.value(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
