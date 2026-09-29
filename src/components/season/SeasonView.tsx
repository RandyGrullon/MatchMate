import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { History, ListOrdered } from 'lucide-react';
import { useLeagueSeasons } from '../../lib/data/seasons';
import { useLeagueCtx } from '../../lib/league';
import type { Season } from '../../lib/seasons';
import { Card, Empty, Position, Tabs, cx } from '../ui';
import { parseSnapshot, seasonDates, type SeasonSnapshot, type SnapshotTable } from './logic';
import { SeasonAwardsCard, SeasonSelect, useSeasonParam } from './SeasonSelect';

/**
 * Piezas de la temporada en las tablas de cada deporte (baloncesto, fútbol, raqueta, golf y natación; el ranking del
 * boliche tiene las suyas): el selector «Temporada 2026 ▾» (en la dirección, ?temporada=), y para una temporada
 * cerrada, sus premios y la tabla que se guardó al cerrarla. La activa la calcula cada deporte con sus juegos, y
 * también una cerrada sin tabla guardada (las de años de antes de las temporadas, que la base armó sola por año).
 */

/** La temporada cerrada tiene una tabla guardada que mostrar. */
export const hasSavedTable = (s: Pick<Season, 'status' | 'standings'> | null | undefined): boolean =>
  !!s && s.status === 'closed' && parseSnapshot(s.standings) != null;

/**
 * Las temporadas de la liga abierta y la elegida en ?temporada= (o la de ahora). `closed` = la elegida, si está
 * cerrada y tiene tabla guardada (si no, la pantalla la calcula con sus juegos, como la activa). `loading`: todavía
 * no llegan; `error`: no se pudieron leer (y no hay nada guardado).
 */
export function useStandingsSeason() {
  const { lid } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const [selected, setSelected] = useSeasonParam(seasons.data);
  const saved = useMemo(() => hasSavedTable(selected), [selected]);
  const closed = saved ? selected : null;
  return {
    seasons: seasons.data,
    loading: seasons.loading && !seasons.data.length,
    error: seasons.data.length ? null : seasons.error,
    selected,
    setSelected,
    closed,
  };
}

/**
 * Arriba de la tabla: el selector de temporada con sus fechas y, a la derecha, lo que ponga la pantalla (compartir).
 * Sin temporadas (datos de antes) solo sale `action`. Una cerrada sin tabla guardada (la tabla de abajo se calcula
 * con sus juegos) muestra debajo sus premios, salvo con `awards={false}`.
 */
export function SeasonBar({
  seasons,
  selected,
  onChange,
  action,
  awards = true,
  className,
}: {
  seasons: readonly Season[];
  selected: Season | null;
  onChange: (id: string) => void;
  action?: ReactNode;
  awards?: boolean;
  className?: string;
}) {
  const unsaved = awards && selected?.status === 'closed' && !hasSavedTable(selected);
  if (!selected) return action ? <div className={cx('flex justify-end', className)}>{action}</div> : null;
  return (
    <>
      <div className={cx('flex items-center gap-2', className)}>
        <SeasonSelect seasons={seasons} value={selected} onChange={onChange} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {selected.status === 'closed' ? 'Cerrada · ' : ''}
          {seasonDates(selected)}
        </span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {unsaved && <SeasonAwardsCard season={selected} />}
    </>
  );
}

/** Una temporada cerrada: sus premios y la tabla que se guardó al cerrarla. */
export function ClosedSeasonView({ season, highlight = [], footer }: { season: Season; highlight?: readonly string[]; footer?: ReactNode }) {
  const { base } = useLeagueCtx();
  const snapshot = useMemo(() => parseSnapshot(season.standings), [season.standings]);
  return (
    <div className="flex flex-col gap-4">
      <SeasonAwardsCard season={season} />
      {snapshot ? (
        <SnapshotTables snapshot={snapshot} highlight={highlight} />
      ) : (
        <Empty icon={<ListOrdered className="size-8" />} title="Sin tabla guardada">
          Esta temporada se cerró sin tabla.
        </Empty>
      )}
      {footer}
      <Link to={`${base}/temporadas`} className="flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-accent">
        <History className="size-4" /> Todas las temporadas
      </Link>
    </div>
  );
}

/** Las tablas de la foto (con pestañas si son varias). `highlight`: ids de equipo o jugador resaltados. */
export function SnapshotTables({ snapshot, highlight = [] }: { snapshot: SeasonSnapshot; highlight?: readonly string[] }) {
  const [key, setKey] = useState(snapshot.tables[0]?.key ?? '');
  const table = snapshot.tables.find((t) => t.key === key) ?? snapshot.tables[0];
  if (!table) return null;
  return (
    <div className="flex flex-col gap-3">
      {snapshot.tables.length > 1 && <Tabs items={snapshot.tables.map((t) => ({ key: t.key, label: t.title }))} active={table.key} onChange={setKey} />}
      <SnapshotTableView table={table} highlight={highlight} />
    </div>
  );
}

/** Una tabla guardada: puesto, nombre y sus columnas (la última, la principal, en negrita). */
export function SnapshotTableView({ table, highlight = [], className }: { table: SnapshotTable; highlight?: readonly string[]; className?: string }) {
  const last = table.columns.length - 1;
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="w-10 px-3 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">{table.nameLabel}</th>
              {table.columns.map((c, i) => (
                <th key={i} title={c.title} className={cx('px-2 py-2 text-right font-medium', c.wide && 'hidden sm:table-cell', i === last && 'pr-3')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, k) => {
              const mine = (r.teamId && highlight.includes(r.teamId)) || (r.playerId && highlight.includes(r.playerId));
              return (
                <tr key={k} className={cx('border-b border-line last:border-0', mine && 'bg-accent-soft/50')}>
                  <td className="px-3 py-2.5">
                    <Position pos={r.rank} />
                  </td>
                  <td className="px-2 py-2.5 font-medium">{r.name}</td>
                  {r.values.map((v, i) => (
                    <td
                      key={i}
                      className={cx(
                        'px-2 py-2.5 text-right tabular-nums',
                        table.columns[i]?.wide && 'hidden sm:table-cell',
                        i === last ? 'pr-3 text-base font-bold' : 'text-muted',
                      )}
                    >
                      {typeof v === 'number' ? v.toLocaleString('es-DO') : v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {table.note && <p className="px-1 text-xs text-muted">{table.note}</p>}
    </div>
  );
}
