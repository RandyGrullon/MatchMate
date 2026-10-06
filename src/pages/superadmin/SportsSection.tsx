import { useState, type ReactNode } from 'react';
import { CircleCheck, FlaskConical, Lock } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { Badge, Card, Skeleton } from '../../components/ui';
import { setSportStatus, useAdminOverview, useAdminSystem } from '../../lib/data/admin';
import { SPORT_LIST } from '../../sports/registry';
import { SPORT_STATUS_LABEL, useSportStatus, type SportStatus } from '../../sports/status';
import { ErrorRetry, SectionHeader, Segmented } from './bits';
import { fmtNum, plural } from './format';
import { useRun } from './hooks';
import { FAMILY_LABEL, SPORT_STATUS_HELP } from './model';
import { sectionMeta } from './sections';

const STATUS_OPTIONS: readonly { value: SportStatus; label: string; icon: ReactNode }[] = [
  { value: 'open', label: SPORT_STATUS_LABEL.open, icon: <CircleCheck className="size-3.5" aria-hidden="true" /> },
  { value: 'beta', label: SPORT_STATUS_LABEL.beta, icon: <FlaskConical className="size-3.5" aria-hidden="true" /> },
  { value: 'closed', label: SPORT_STATUS_LABEL.closed, icon: <Lock className="size-3.5" aria-hidden="true" /> },
];

const TONE: Record<SportStatus, 'ok' | 'warn' | 'neutral'> = { open: 'ok', beta: 'warn', closed: 'neutral' };

/** Deportes: abrir a todos, dejar en prueba (beta) o cerrar; con cuántas ligas tiene cada uno. */
export default function SportsSection() {
  const system = useAdminSystem(true);
  const overview = useAdminOverview(true).data;
  // Si la consola todavía no trae el estado, se usa el que lee toda la app (sport_status).
  const fallback = useSportStatus(true);
  const [pending, setPending] = useState<Record<string, SportStatus>>({});
  const run = useRun();
  const { confirm } = useFeedback();
  const sys = system.data;

  const statusOf = (sport: string): SportStatus | null =>
    pending[sport] ?? sys?.sportStatus.find((r) => r.sport === sport)?.status ?? (fallback.loading ? null : (fallback.status[sport as keyof typeof fallback.status] ?? null));
  const leaguesOf = (sport: string) => sys?.sportStatus.find((r) => r.sport === sport)?.leagues ?? overview?.leagues.bySport.find((r) => r.sport === sport)?.leagues ?? null;
  const statsOf = (sport: string) => overview?.leagues.bySport.find((r) => r.sport === sport) ?? null;

  async function change(sport: string, label: string, next: SportStatus) {
    const n = leaguesOf(sport) ?? 0;
    if (next === 'closed') {
      const ok = await confirm({
        title: `¿Cerrar ${label}?`,
        message: `Nadie podrá crear ligas ni torneos nuevos de ${label.toLowerCase()}. ${n ? `Las ${fmtNum(n)} que ya existen siguen igual.` : ''}`,
        confirmText: `Cerrar ${label.toLowerCase()}`,
        danger: true,
      });
      if (!ok) return;
    }
    if (next === 'open') {
      const ok = await confirm({
        title: `¿Abrir ${label} a todos?`,
        message: `Cualquier cuenta podrá crear ligas y torneos de ${label.toLowerCase()}.`,
        confirmText: 'Abrir a todos',
      });
      if (!ok) return;
    }
    setPending((p) => ({ ...p, [sport]: next }));
    await run(() => setSportStatus(sport, next), `${label}: ${SPORT_STATUS_LABEL[next].toLowerCase()}`);
    setPending((p) => {
      const rest = { ...p };
      delete rest[sport];
      return rest;
    });
  }

  return (
    <>
      <SectionHeader title="Deportes" hint={sectionMeta('deportes').hint} />

      <Card className="px-4 py-3 text-sm sm:px-5">
        <dl className="grid gap-2 sm:grid-cols-3">
          {STATUS_OPTIONS.map((o) => (
            <div key={o.value} className="flex gap-2">
              <dt>
                <Badge tone={TONE[o.value]}>
                  {o.icon}
                  {o.label}
                </Badge>
              </dt>
              <dd className="text-xs text-muted">{SPORT_STATUS_HELP[o.value]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {system.error && !sys && fallback.error && <ErrorRetry error={system.error} compact />}

      <ul className="grid gap-3 md:grid-cols-2">
        {SPORT_LIST.map((meta) => {
          const status = statusOf(meta.id);
          const leagues = leaguesOf(meta.id);
          const stats = statsOf(meta.id);
          const busy = pending[meta.id] != null;
          return (
            <li key={meta.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <meta.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{meta.label}</h2>
                      {status && (
                        <Badge tone={TONE[status]}>
                          {STATUS_OPTIONS.find((o) => o.value === status)?.icon}
                          {SPORT_STATUS_LABEL[status]}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">{FAMILY_LABEL[meta.family]}</p>
                  </div>
                </div>
                <p className="text-sm text-muted">
                  {leagues == null ? (
                    <Skeleton className="inline-block h-3.5 w-40 align-middle" />
                  ) : (
                    <>
                      <span className="font-medium text-fg">{plural(leagues, 'liga', 'ligas')}</span>
                      {stats && (
                        <>
                          {' '}
                          · {plural(stats.players, 'jugador', 'jugadores')} · {fmtNum(stats.active7d)} activas esta semana
                        </>
                      )}
                    </>
                  )}
                </p>
                <div className="mt-auto flex flex-col gap-1.5">
                  {status ? (
                    <Segmented
                      label={`Estado de ${meta.label}`}
                      options={STATUS_OPTIONS}
                      value={status}
                      busy={busy}
                      onChange={(v) => change(meta.id, meta.label, v)}
                    />
                  ) : (
                    <Skeleton className="h-10 w-full rounded-xl" />
                  )}
                  <p className="text-xs text-muted" aria-live="polite">
                    {busy ? 'Guardando…' : status ? SPORT_STATUS_HELP[status] : ''}
                  </p>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
