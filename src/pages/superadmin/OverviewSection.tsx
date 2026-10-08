import { useMemo, useState } from 'react';
import { Activity, CalendarDays, CircleCheck, CircleAlert, Gamepad2, Image, Info, Swords, Table2, TriangleAlert, Trophy, UserPlus, Users, ChartLine } from 'lucide-react';
import { ListRow, Skeleton } from '../../components/ui';
import { useAdminOverview, useAdminSeries, type AdminOverview, type AdminSeriesPoint } from '../../lib/data/admin';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../sports/SportBits';
import { healthAlerts, LIMITS, type HealthAlert } from './alerts';
import { BarList, ChartTable, LineChart, Meter, Sparkline, type ChartPoint } from './charts';
import { lastValues, sortSeries, weekOverWeek, type SeriesMetric } from './chart';
import { ErrorRetry, KpiCard, KpiGrid, KpiSkeleton, Panel, PillSelect, SectionHeader, Segmented, ToneIcon } from './bits';
import { SectionList, useConsoleBack } from './ConsoleShell';
import { fmtBytes, fmtCompact, fmtDay, fmtNum, fmtPct, ratio, relativeTime } from './format';
import { intParam, useSearchState } from './hooks';
import { sectionMeta } from './sections';

type Range = 30 | 90 | 365;
const RANGES: readonly { value: `${Range}`; label: string }[] = [
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
];

/** Qué se puede ver en la gráfica de actividad. */
export const METRICS: readonly { key: SeriesMetric; label: string }[] = [
  { key: 'activeUsers', label: 'Cuentas activas' },
  { key: 'signups', label: 'Cuentas nuevas' },
  { key: 'events', label: 'Eventos' },
  { key: 'matches', label: 'Partidos' },
  { key: 'entries', label: 'Juegos anotados' },
  { key: 'scans', label: 'Lecturas de fotos' },
];

const isMetric = (v: string): v is SeriesMetric => METRICS.some((m) => m.key === v);

/** Serie → puntos de la gráfica (con el año en la etiqueta larga). */
export const seriesPoints = (series: readonly AdminSeriesPoint[], metric: SeriesMetric): ChartPoint[] =>
  sortSeries(series).map((p) => ({ key: p.day, label: fmtDay(p.day), longLabel: fmtDay(p.day, true), value: p[metric] ?? 0 }));

/** Ver la actividad como gráfica o como tabla. */
const VIEW_OPTIONS = [
  { value: 'grafica', label: 'Gráfica', icon: <ChartLine className="size-4" aria-hidden="true" /> },
  { value: 'tabla', label: 'Tabla', icon: <Table2 className="size-4" aria-hidden="true" /> },
] as const;

/**
 * La consola (Resumen): en el teléfono primero lo que hay que revisar, los números clave, la lista de las secciones y
 * después la actividad, las ligas por deporte y el uso del plan gratis. En la computadora los números arriba, la
 * actividad con los avisos al lado y el menú de secciones a la izquierda.
 */
export default function OverviewSection() {
  const s = useSearchState();
  const back = useConsoleBack();
  const range = intParam(s.get('rango'), 30, [30, 90, 365]) as Range;
  const metricRaw = s.get('serie', 'activeUsers');
  const metric: SeriesMetric = isMetric(metricRaw) ? metricRaw : 'activeUsers';
  const [asTable, setAsTable] = useState(false);
  const ov = useAdminOverview(true);
  const series = useAdminSeries(true, range);
  // Las tarjetas comparan siempre con los últimos 30 días (con 30 elegido es la misma consulta).
  const month = useAdminSeries(true, 30);
  const o = ov.data;
  const alerts = useMemo(() => (o ? healthAlerts(o) : []), [o]);
  const points = useMemo(() => seriesPoints(series.data, metric), [series.data, metric]);
  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? '';

  return (
    <>
      <SectionHeader title="Consola" hint={o ? `${sectionMeta('resumen').hint} · actualizado ${relativeTime(o.generatedAt)}` : sectionMeta('resumen').hint} back={back} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Avisos" subtitle="Lo que hay que revisar" flush className="lg:order-2">
          {ov.error && !o ? (
            <div className="px-5 pb-4">
              <ErrorRetry error={ov.error} compact />
            </div>
          ) : !o ? (
            <div className="flex flex-col gap-2 px-5 pb-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <AlertList alerts={alerts} />
          )}
        </Panel>

        <div className="lg:order-first lg:col-span-3">
          {ov.error && !o ? <ErrorRetry error={ov.error} /> : ov.loading || !o ? <KpiSkeleton n={8} /> : <Kpis o={o} series={month.data} />}
        </div>

        <SectionList />

        <Panel
          className="lg:order-1 lg:col-span-2"
          title="Actividad"
          subtitle={`${metricLabel} por día`}
          actions={<PillSelect label="Qué mostrar" options={METRICS} value={metric} onChange={(v) => s.patch({ serie: v === 'activeUsers' ? null : v })} />}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Segmented size="sm" label="Periodo" options={RANGES} value={`${range}` as `${Range}`} onChange={(v) => s.patch({ rango: v === '30' ? null : v })} />
            <Segmented size="sm" label="Ver como" options={VIEW_OPTIONS} value={asTable ? 'tabla' : 'grafica'} onChange={(v) => setAsTable(v === 'tabla')} />
          </div>
          {series.error && !series.data.length ? (
            <ErrorRetry error={series.error} compact />
          ) : series.loading && !series.data.length ? (
            <Skeleton className="h-[244px] w-full" />
          ) : !points.length ? (
            <p className="py-16 text-center text-sm text-muted">Todavía no hay datos de este periodo.</p>
          ) : asTable ? (
            <ChartTable points={points} seriesName={metricLabel} />
          ) : (
            <LineChart points={points} seriesName={metricLabel} dim={series.loading} className="pt-6" />
          )}
        </Panel>

        <Panel className="lg:order-3 lg:col-span-2" title="Ligas por deporte" subtitle={o ? `${fmtNum(o.leagues.total)} en total · activas: algo nuevo en 7 días` : undefined}>
          {!o ? (
            ov.error ? (
              <ErrorRetry error={ov.error} compact />
            ) : (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-4" />
                ))}
              </div>
            )
          ) : o.leagues.bySport.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Todavía no hay ligas.</p>
          ) : (
            <BarList
              unit="ligas"
              items={[...o.leagues.bySport]
                .sort((a, b) => b.leagues - a.leagues)
                .map((r) => ({
                  key: r.sport,
                  name: sportMeta(r.sport)?.label ?? 'Otro deporte',
                  label: (
                    <>
                      <SportIcon sport={r.sport} className="size-4 shrink-0 text-muted" />
                      <span className="truncate">{sportMeta(r.sport)?.short ?? 'Otro deporte'}</span>
                    </>
                  ),
                  value: r.leagues,
                  extra: `${fmtNum(r.active7d)} activas`,
                }))}
            />
          )}
        </Panel>

        <Panel className="lg:order-4" title="Uso del plan gratis" subtitle="Topes de Supabase">
          {!o ? (
            ov.error ? (
              <ErrorRetry error={ov.error} compact />
            ) : (
              <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            )
          ) : (
            <PlanUsage o={o} />
          )}
        </Panel>
      </div>
    </>
  );
}

function Kpis({ o, series }: { o: AdminOverview; series: readonly AdminSeriesPoint[] }) {
  const enough = series.length >= 14;
  const wow = (m: SeriesMetric) => (enough ? weekOverWeek(series, m).change : undefined);
  const trend = (m: SeriesMetric) => (series.length >= 7 ? <Sparkline values={lastValues(series, m, 30)} /> : null);
  const icon = 'size-4';
  return (
    <KpiGrid>
      <KpiCard
        label="Cuentas"
        value={fmtCompact(o.users.total)}
        icon={<Users className={icon} />}
        change={wow('signups')}
        changeLabel="vs. semana anterior"
        note={`+${fmtNum(o.users.new7d)} en 7 días · +${fmtNum(o.users.new30d)} en 30`}
        trend={trend('signups')}
        to="/superadmin/cuentas"
      />
      <KpiCard
        label="Activas en 7 días"
        value={fmtCompact(o.users.active7d)}
        icon={<Activity className={icon} />}
        note={`${fmtPct(ratio(o.users.active7d, o.users.total))} · ${fmtNum(o.users.active30d)} en 30 días`}
        trend={trend('activeUsers')}
      />
      <KpiCard
        label="Ligas y torneos"
        value={fmtCompact(o.leagues.total)}
        icon={<Trophy className={icon} />}
        note={`+${fmtNum(o.leagues.new30d)} en 30 días · ${fmtNum(o.leagues.tournaments)} torneos`}
        to="/superadmin/ligas"
      />
      <KpiCard
        label="Ligas activas"
        value={fmtCompact(o.leagues.active7d)}
        icon={<CalendarDays className={icon} />}
        note={`en 7 días · ${fmtPct(ratio(o.leagues.active7d, o.leagues.total))}`}
        to="/superadmin/ligas?orden=activity"
      />
      <KpiCard
        label="Eventos en 7 días"
        value={fmtCompact(o.activity.events7d)}
        icon={<CalendarDays className={icon} />}
        change={wow('events')}
        changeLabel="vs. semana anterior"
        trend={trend('events')}
      />
      <KpiCard
        label="Partidos en 7 días"
        value={fmtCompact(o.activity.matches7d)}
        icon={<Swords className={icon} />}
        change={wow('matches')}
        changeLabel="vs. semana anterior"
        trend={trend('matches')}
      />
      <KpiCard
        label="Juegos en 7 días"
        value={fmtCompact(o.activity.entries7d)}
        icon={<Gamepad2 className={icon} />}
        change={wow('entries')}
        changeLabel="vs. semana anterior"
        trend={trend('entries')}
      />
      <KpiCard
        label="Fotos en 7 días"
        value={fmtCompact(o.activity.photos7d)}
        icon={<Image className={icon} />}
        note={`${fmtNum(o.activity.submissionsPending)} envíos sin aprobar`}
        to="/superadmin/fotos"
      />
    </KpiGrid>
  );
}

const ALERT_STYLE = {
  danger: { tone: 'danger', Icon: CircleAlert, label: 'Urgente' },
  warn: { tone: 'warn', Icon: TriangleAlert, label: 'Revisar' },
  info: { tone: 'neutral', Icon: Info, label: 'Para saber' },
} as const;

/** Los avisos de salud como filas (la que lleva a algún lado se toca entera); sin avisos, «Todo en orden». */
export function AlertList({ alerts }: { alerts: readonly HealthAlert[] }) {
  if (!alerts.length)
    return (
      <ListRow
        dense
        leading={
          <ToneIcon tone="ok">
            <CircleCheck className="size-5" />
          </ToneIcon>
        }
        title="Todo en orden"
        subtitle="Nada que revisar ahora."
      />
    );
  return (
    <>
      {alerts.map((a) => {
        const st = ALERT_STYLE[a.level];
        return (
          <ListRow
            key={a.id}
            dense
            leading={
              <ToneIcon tone={st.tone}>
                <st.Icon className="size-5" />
              </ToneIcon>
            }
            title={
              <>
                <span className="sr-only">{st.label}: </span>
                {a.title}
              </>
            }
            subtitle={a.detail}
            to={a.to ?? undefined}
          />
        );
      })}
    </>
  );
}

function UsageRow({ label, value, max, text }: { label: string; value: number | null; max: number; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="num text-[13px] text-muted">{text}</span>
      </div>
      {value == null ? <p className="text-[13px] text-muted">No se puede medir en este modo.</p> : <Meter value={value} max={max} label={label} />}
    </div>
  );
}

function PlanUsage({ o }: { o: AdminOverview }) {
  const { dbBytes, photosBytes } = o.storage;
  return (
    <div className="flex flex-col gap-4">
      <UsageRow
        label="Base de datos"
        value={dbBytes}
        max={LIMITS.dbBytes}
        text={dbBytes == null ? '—' : `${fmtBytes(dbBytes)} de ${fmtBytes(LIMITS.dbBytes)}`}
      />
      <UsageRow
        label="Fotos (Storage)"
        value={photosBytes}
        max={LIMITS.photosBytes}
        text={photosBytes == null ? `${fmtNum(o.storage.photos)} fotos` : `${fmtBytes(photosBytes)} de ${fmtBytes(LIMITS.photosBytes)}`}
      />
      <UsageRow
        label="Lecturas de fotos hoy"
        value={o.scan.dailyLimit > 0 ? o.scan.today : null}
        max={o.scan.dailyLimit}
        text={`${fmtNum(o.scan.today)} de ${fmtNum(o.scan.dailyLimit)}`}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px] text-muted">
        <span>
          <UserPlus className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
          {fmtNum(o.push.subscriptions)} teléfonos con avisos
        </span>
        <span>{fmtNum(o.push.sent24h)} avisos enviados en 24 h</span>
      </div>
    </div>
  );
}
