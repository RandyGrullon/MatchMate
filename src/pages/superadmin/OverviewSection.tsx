import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  CalendarDays,
  CircleCheck,
  CircleAlert,
  Gamepad2,
  Image,
  Info,
  Megaphone,
  Palette,
  ScrollText,
  Server,
  Swords,
  Table2,
  TriangleAlert,
  Trophy,
  UserPlus,
  Users,
  ChartLine,
} from 'lucide-react';
import { Button, Select, Skeleton, cx } from '../../components/ui';
import { useAdminOverview, useAdminSeries, type AdminOverview, type AdminSeriesPoint } from '../../lib/data/admin';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../sports/SportBits';
import { healthAlerts, LIMITS, type HealthAlert } from './alerts';
import { BarList, ChartTable, LineChart, Meter, Sparkline, type ChartPoint } from './charts';
import { lastValues, sortSeries, weekOverWeek, type SeriesMetric } from './chart';
import { ErrorRetry, KpiCard, KpiSkeleton, Panel, QuickLink, SectionHeader, Segmented } from './bits';
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

/** Resumen: números clave, actividad, ligas por deporte, avisos de salud y accesos rápidos. */
export default function OverviewSection() {
  const s = useSearchState();
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
      <SectionHeader
        title="Resumen"
        hint={o ? `${sectionMeta('resumen').hint} Actualizado ${relativeTime(o.generatedAt)}.` : sectionMeta('resumen').hint}
      />

      {ov.error && !o ? (
        <ErrorRetry error={ov.error} />
      ) : ov.loading || !o ? (
        <KpiSkeleton n={8} />
      ) : (
        <Kpis o={o} series={month.data} />
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Actividad"
          subtitle={`${metricLabel} por día`}
          actions={
            <>
              <Select aria-label="Qué mostrar" value={metric} onChange={(e) => s.patch({ serie: e.target.value === 'activeUsers' ? null : e.target.value })} className="h-11 w-auto sm:h-8 sm:py-0 sm:text-xs">
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Segmented
                size="sm"
                label="Periodo"
                options={RANGES}
                value={`${range}` as `${Range}`}
                onChange={(v) => s.patch({ rango: v === '30' ? null : v })}
              />
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
            </>
          }
        >
          {series.error && !series.data.length ? (
            <ErrorRetry error={series.error} compact />
          ) : series.loading && !series.data.length ? (
            <Skeleton className="h-[244px] w-full" />
          ) : !points.length ? (
            <p className="py-16 text-center text-sm text-muted">Todavía no hay datos de este periodo.</p>
          ) : asTable ? (
            <ChartTable points={points} seriesName={metricLabel} />
          ) : (
            <LineChart points={points} seriesName={metricLabel} dim={series.loading} className="pt-8" />
          )}
        </Panel>

        <Panel title="Avisos" subtitle="Lo que hay que revisar">
          {ov.error && !o ? (
            <ErrorRetry error={ov.error} compact />
          ) : !o ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (
            <AlertList alerts={alerts} />
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Ligas por deporte" subtitle={o ? `${fmtNum(o.leagues.total)} en total · activas = con algo nuevo en 7 días` : undefined}>
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

        <Panel title="Uso del plan gratis" subtitle="Topes de Supabase">
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

        <Panel title="Accesos rápidos">
          <div className="flex flex-col gap-2">
            <QuickLink to="/superadmin/cuentas" icon={<Users className="size-4" />} title="Cuentas" hint="Buscar, bloquear, nombrar superadmins" />
            <QuickLink to="/superadmin/ligas" icon={<Trophy className="size-4" />} title="Ligas y torneos" hint="Abrir, pasar a otro dueño, borrar" />
            <QuickLink to="/superadmin/anuncios" icon={<Megaphone className="size-4" />} title="Mandar un anuncio" hint="Aviso al teléfono" />
            <QuickLink to="/superadmin/sistema" icon={<Server className="size-4" />} title="Sistema y respaldo" hint="Límites, tareas, respaldo completo" />
            <QuickLink to="/superadmin/auditoria" icon={<ScrollText className="size-4" />} title="Auditoría" hint="Lo que se hizo desde la consola" />
            <QuickLink to="/superadmin/marca" icon={<Palette className="size-4" />} title="Marca" hint="Logo y animaciones" />
          </div>
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="Cuentas"
        value={fmtCompact(o.users.total)}
        icon={<Users className={icon} />}
        change={wow('signups')}
        changeLabel="altas vs. semana anterior"
        note={`+${fmtNum(o.users.new7d)} en 7 días`}
        trend={trend('signups')}
        to="/superadmin/cuentas"
      />
      <KpiCard
        label="Activas en 7 días"
        value={fmtCompact(o.users.active7d)}
        icon={<Activity className={icon} />}
        note={`${fmtPct(ratio(o.users.active7d, o.users.total))} de las cuentas · ${fmtNum(o.users.active30d)} en 30 días`}
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
        label="Ligas activas (7 días)"
        value={fmtCompact(o.leagues.active7d)}
        icon={<CalendarDays className={icon} />}
        note={`${fmtPct(ratio(o.leagues.active7d, o.leagues.total))} del total`}
        to="/superadmin/ligas?orden=activity"
      />
      <KpiCard
        label="Eventos (7 días)"
        value={fmtCompact(o.activity.events7d)}
        icon={<CalendarDays className={icon} />}
        change={wow('events')}
        changeLabel="vs. semana anterior"
        trend={trend('events')}
      />
      <KpiCard
        label="Partidos (7 días)"
        value={fmtCompact(o.activity.matches7d)}
        icon={<Swords className={icon} />}
        change={wow('matches')}
        changeLabel="vs. semana anterior"
        trend={trend('matches')}
      />
      <KpiCard
        label="Juegos anotados (7 días)"
        value={fmtCompact(o.activity.entries7d)}
        icon={<Gamepad2 className={icon} />}
        change={wow('entries')}
        changeLabel="vs. semana anterior"
        trend={trend('entries')}
      />
      <KpiCard
        label="Fotos subidas (7 días)"
        value={fmtCompact(o.activity.photos7d)}
        icon={<Image className={icon} />}
        note={`${fmtNum(o.activity.submissionsPending)} envíos sin aprobar · ${fmtNum(o.users.new30d)} cuentas nuevas en 30 días`}
        to="/superadmin/fotos"
      />
    </div>
  );
}

const ALERT_STYLE = {
  danger: { box: 'border-danger/30 bg-danger-soft', icon: 'text-danger', Icon: CircleAlert, label: 'Urgente' },
  warn: { box: 'border-warn/30 bg-warn-soft', icon: 'text-warn', Icon: TriangleAlert, label: 'Revisar' },
  info: { box: 'border-line bg-surface-2', icon: 'text-muted', Icon: Info, label: 'Para saber' },
} as const;

export function AlertList({ alerts }: { alerts: readonly HealthAlert[] }) {
  if (!alerts.length)
    return (
      <div className="flex items-center gap-3 rounded-xl bg-ok-soft px-3 py-3 text-sm text-ok">
        <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Todo en orden.</span> Nada que revisar ahora.
        </span>
      </div>
    );
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => {
        const st = ALERT_STYLE[a.level];
        return (
          <li key={a.id} className={cx('flex gap-3 rounded-xl border px-3 py-2.5', st.box)}>
            <st.Icon className={cx('mt-0.5 size-4 shrink-0', st.icon)} aria-label={st.label} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{a.title}</p>
              <p className="text-xs text-muted">{a.detail}</p>
              {a.to && (
                <Link to={a.to} className="mt-1 inline-flex min-h-8 items-center text-xs font-medium text-accent hover:underline">
                  Ver más
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UsageRow({ label, value, max, text }: { label: string; value: number | null; max: number; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted tabular-nums">{text}</span>
      </div>
      {value == null ? <p className="text-xs text-muted">No se puede medir en este modo.</p> : <Meter value={value} max={max} label={label} />}
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        <span>
          <UserPlus className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
          {fmtNum(o.push.subscriptions)} teléfonos con avisos
        </span>
        <span>{fmtNum(o.push.sent24h)} avisos enviados en 24 h</span>
      </div>
    </div>
  );
}
