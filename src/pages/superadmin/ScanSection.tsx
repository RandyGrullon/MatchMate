import { useMemo, useState } from 'react';
import { ChartLine, Cpu, ScanLine, Table2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Card, ListRow, RowIcon, Skeleton } from '../../components/ui';
import { useAdminScanStats } from '../../lib/data/admin';
import { ChartTable, LineChart, Meter, type ChartPoint } from './charts';
import { EmptyState, ErrorRetry, KpiCard, KpiGrid, KpiSkeleton, Panel, SectionHeader, Segmented } from './bits';
import { fmtDay, fmtNum, fmtPct, ratio } from './format';
import { intParam, useSearchState } from './hooks';
import { sectionMeta } from './sections';

type Days = 30 | 90;

/** Ver las lecturas por día como gráfica o como tabla. */
const VIEW_OPTIONS = [
  { value: 'grafica', label: 'Gráfica', icon: <ChartLine className="size-4" aria-hidden="true" /> },
  { value: 'tabla', label: 'Tabla', icon: <Table2 className="size-4" aria-hidden="true" /> },
] as const;

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
        below={
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
          <Skeleton className="h-36 w-full rounded-3xl" />
          <KpiSkeleton n={4} />
        </>
      ) : (
        <>
          <Card className="flex flex-col gap-3 px-5 pt-[18px] pb-5">
            <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.01em]">Hoy contra el tope</h2>
            <div className="flex items-end justify-between gap-3">
              <p>
                <b className="num text-stat">{fmtNum(d.today)}</b> <span className="text-meta text-muted">de {fmtNum(d.dailyLimit)}</span>
              </p>
              <span className="num text-row-num-pro text-fg-2">{fmtPct(ratio(d.today, d.dailyLimit))}</span>
            </div>
            <Meter value={d.today} max={d.dailyLimit} label="Lecturas de fotos de hoy" />
            <p className="text-[13px] text-muted">Al llegar al tope, la foto se guarda pero se lee mañana.</p>
          </Card>

          <KpiGrid>
            <KpiCard label="Quedan hoy" value={fmtNum(Math.max(0, d.dailyLimit - d.today))} note={`tope de ${fmtNum(d.dailyLimit)} en toda la app`} />
            <KpiCard label="Tope por cuenta" value={fmtNum(d.perUserLimit)} note="lecturas por día" />
            <KpiCard label={`Total en ${days} días`} value={fmtNum(total)} />
            <KpiCard label="Promedio por día" value={fmtNum(Math.round(total / Math.max(1, points.length)))} note={`en ${days} días`} />
          </KpiGrid>

          <Panel
            title="Lecturas por día"
            subtitle={`Últimos ${days} días`}
            actions={<Segmented size="sm" label="Ver como" options={VIEW_OPTIONS} value={asTable ? 'tabla' : 'grafica'} onChange={(v) => setAsTable(v === 'tabla')} />}
          >
            {!points.length ? (
              <p className="py-12 text-center text-sm text-muted">Sin lecturas en este periodo.</p>
            ) : asTable ? (
              <ChartTable points={points} seriesName="Lecturas" />
            ) : (
              <LineChart points={points} seriesName="Lecturas" dim={stats.loading} className="pt-6" />
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Por modelo" subtitle={`Qué modelo de IA las leyó: hoy y en ${days} días`} flush>
              {!d.models.length ? (
                <p className="px-5 pt-2 pb-5 text-center text-sm text-muted">Sin lecturas todavía.</p>
              ) : (
                [...d.models]
                  .sort((a, b) => b.total - a.total)
                  .map((m) => (
                    <ListRow
                      key={m.model}
                      dense
                      leading={
                        <RowIcon>
                          <Cpu className="size-5" />
                        </RowIcon>
                      }
                      title={<span className="font-mono text-sm">{m.model}</span>}
                      subtitle={`${fmtNum(m.today)} hoy`}
                      value={fmtNum(m.total)}
                    />
                  ))
              )}
            </Panel>

            <Panel title="Cuentas que más leen" subtitle={`En los últimos ${days} días`} flush>
              {!d.topUsers.length ? (
                <EmptyState icon={<ScanLine className="size-8" />} title="Nadie ha leído fotos en este periodo" className="pt-4" />
              ) : (
                d.topUsers.map((u, i) => (
                  <ListRow
                    key={u.userId}
                    dense
                    leading={
                      <span className="flex items-center gap-2.5">
                        <span className="num w-5 text-right text-[13px] text-muted">{i + 1}</span>
                        <Avatar name={u.name} className="size-9 text-xs" />
                      </span>
                    }
                    title={u.name}
                    subtitle={u.email ?? undefined}
                    value={fmtNum(u.scans)}
                    to={`/superadmin/cuentas?u=${encodeURIComponent(u.userId)}`}
                  />
                ))
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
