import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChartLine, ScanLine, Table2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Button, Empty, Skeleton } from '../../components/ui';
import { useAdminScanStats } from '../../lib/data/admin';
import { ChartTable, LineChart, Meter, type ChartPoint } from './charts';
import { ErrorRetry, KpiCard, KpiSkeleton, Panel, SectionHeader, Segmented } from './bits';
import { fmtDay, fmtNum, fmtPct, ratio } from './format';
import { intParam, useSearchState } from './hooks';
import { sectionMeta } from './sections';

type Days = 30 | 90;

/** Lectura de fotos del marcador con IA: hoy contra el tope, por día, por modelo y quién más lee. */
export default function ScanSection() {
  const s = useSearchState();
  const days = intParam(s.get('dias'), 30, [30, 90]) as Days;
  const [asTable, setAsTable] = useState(false);
  const stats = useAdminScanStats(true, days);
  const d = stats.data;
  const points = useMemo<ChartPoint[]>(
    () =>
      (d?.days ?? [])
        .slice()
        .sort((a, b) => (a.day < b.day ? -1 : 1))
        .map((p) => ({ key: p.day, label: fmtDay(p.day), longLabel: fmtDay(p.day, true), value: p.scans })),
    [d],
  );
  const total = points.reduce((a, p) => a + p.value, 0);

  return (
    <>
      <SectionHeader
        title="Lectura de fotos"
        hint={sectionMeta('fotos').hint}
        actions={
          <Segmented
            label="Periodo"
            options={[
              { value: '30', label: '30 días' },
              { value: '90', label: '90 días' },
            ]}
            value={`${days}` as '30' | '90'}
            onChange={(v) => s.patch({ dias: v === '30' ? null : v })}
          />
        }
      />

      {stats.error && !d ? (
        <ErrorRetry error={stats.error} />
      ) : !d ? (
        <>
          <KpiSkeleton n={4} />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Hoy" value={fmtNum(d.today)} note={`${fmtPct(ratio(d.today, d.dailyLimit))} del tope diario`} />
            <KpiCard label="Tope diario (toda la app)" value={fmtNum(d.dailyLimit)} note={`Quedan ${fmtNum(Math.max(0, d.dailyLimit - d.today))} hoy`} />
            <KpiCard label="Tope por cuenta" value={fmtNum(d.perUserLimit)} note="lecturas por día" />
            <KpiCard label={`Total en ${days} días`} value={fmtNum(total)} note={`${fmtNum(Math.round(total / Math.max(1, points.length)))} por día en promedio`} />
          </div>

          <Panel title="Hoy contra el tope" subtitle="Al llegar al tope, la foto se guarda igual pero no se lee sola hasta mañana">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <span className="text-2xl font-semibold">{fmtNum(d.today)}</span> <span className="text-muted">de {fmtNum(d.dailyLimit)}</span>
                </span>
                <span className="text-muted tabular-nums">{fmtPct(ratio(d.today, d.dailyLimit))}</span>
              </div>
              <Meter value={d.today} max={d.dailyLimit} label="Lecturas de fotos de hoy" />
            </div>
          </Panel>

          <Panel
            title="Lecturas por día"
            subtitle={`Últimos ${days} días`}
            actions={
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={asTable}
                onClick={() => setAsTable((t) => !t)}
                icon={asTable ? <ChartLine className="size-4" /> : <Table2 className="size-4" />}
                aria-label={asTable ? 'Ver como gráfica' : 'Ver como tabla'}
                title={asTable ? 'Ver como gráfica' : 'Ver como tabla'}
                className="max-sm:size-11"
              />
            }
          >
            {!points.length ? (
              <p className="py-12 text-center text-sm text-muted">Sin lecturas en este periodo.</p>
            ) : asTable ? (
              <ChartTable points={points} seriesName="Lecturas" />
            ) : (
              <LineChart points={points} seriesName="Lecturas" dim={stats.loading} className="pt-8" />
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Por modelo" subtitle="Qué modelo de IA leyó las fotos">
              {!d.models.length ? (
                <p className="py-6 text-center text-sm text-muted">Sin lecturas todavía.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-line text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Modelo
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Hoy
                      </th>
                      <th scope="col" className="py-2 pl-3 text-right font-medium">
                        En {days} días
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...d.models]
                      .sort((a, b) => b.total - a.total)
                      .map((m) => (
                        <tr key={m.model}>
                          <td className="max-w-0 truncate py-2 pr-3 font-mono text-xs" title={m.model}>
                            {m.model}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(m.today)}</td>
                          <td className="py-2 pl-3 text-right tabular-nums">{fmtNum(m.total)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Cuentas que más leen" subtitle={`En los últimos ${days} días`}>
              {!d.topUsers.length ? (
                <Empty icon={<ScanLine className="size-8" />} title="Nadie ha leído fotos en este periodo" />
              ) : (
                <ol className="divide-y divide-line">
                  {d.topUsers.map((u, i) => (
                    <li key={u.userId}>
                      <Link to={`/superadmin/cuentas?u=${encodeURIComponent(u.userId)}`} className="flex min-h-11 items-center gap-3 py-2 transition hover:bg-surface-2/60">
                        <span className="w-5 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                        <Avatar name={u.name} className="size-8 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{u.name}</span>
                          <span className="block truncate text-xs text-muted">{u.email ?? ''}</span>
                        </span>
                        <span className="text-sm font-medium tabular-nums">{fmtNum(u.scans)}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
