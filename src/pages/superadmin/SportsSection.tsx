import { useState, type ReactNode } from 'react';
import { CircleCheck, FlaskConical, Lock } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { Card, RowIcon, Skeleton } from '../../components/ui';
import { setSportStatus, useAdminOverview, useAdminSystem } from '../../lib/data/admin';
import { SPORT_LIST } from '../../sports/registry';
import { SPORT_STATUS_LABEL, useSportStatus, type SportStatus } from '../../sports/status';
import { ErrorRetry, SectionHeader, Segmented } from './bits';
import { fmtNum, plural } from './format';
import { useRun } from './hooks';
import { FAMILY_LABEL, SPORT_STATUS_HELP } from './model';
import { sectionMeta } from './sections';

const STATUS_OPTIONS: readonly { value: SportStatus; label: string; icon: ReactNode }[] = [
  { value: 'open', label: SPORT_STATUS_LABEL.open, icon: <CircleCheck className="size-4" aria-hidden="true" /> },
  { value: 'beta', label: SPORT_STATUS_LABEL.beta, icon: <FlaskConical className="size-4" aria-hidden="true" /> },
  { value: 'closed', label: SPORT_STATUS_LABEL.closed, icon: <Lock className="size-4" aria-hidden="true" /> },
];

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
  // Ya leído y sin fila: ese deporte no tiene ligas (0), no «cargando».
  const leaguesOf = (sport: string) =>
    sys?.sportStatus.find((r) => r.sport === sport)?.leagues ?? overview?.leagues.bySport.find((r) => r.sport === sport)?.leagues ?? (sys || overview ? 0 : null);
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

      {system.error && !sys && fallback.error && <ErrorRetry error={system.error} compact />}

      {/* Una sola tarjeta: cada deporte con sus números y el segmentado Abierto · Beta · Cerrado. */}
      <Card className="overflow-hidden">
        <ul>
          {SPORT_LIST.map((meta) => {
            const status = statusOf(meta.id);
            const leagues = leaguesOf(meta.id);
            const stats = statsOf(meta.id);
            const busy = pending[meta.id] != null;
            return (
              <li key={meta.id} className="mm-row relative flex flex-col gap-3 py-4 pr-[18px] pl-5 md:flex-row md:items-center md:gap-6">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <RowIcon tone={status === 'open' ? 'accent' : 'neutral'}>
                    <meta.icon className="size-5" />
                  </RowIcon>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{meta.label}</h2>
                    <p className="text-[13px] text-muted">
                      {leagues == null ? (
                        <Skeleton className="inline-block h-3 w-36 align-middle" />
                      ) : (
                        <>
                          <span className="font-semibold text-fg-2">{plural(leagues, 'liga', 'ligas')}</span>
                          {stats && ` · ${plural(stats.players, 'jugador', 'jugadores')} · ${plural(stats.active7d, 'activa', 'activas')}`}
                          {` · ${FAMILY_LABEL[meta.family]}`}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-[300px] md:shrink-0">
                  {status ? (
                    <Segmented full label={`Estado de ${meta.label}`} options={STATUS_OPTIONS} value={status} busy={busy} onChange={(v) => change(meta.id, meta.label, v)} />
                  ) : (
                    <Skeleton className="h-11 w-full rounded-[14px]" />
                  )}
                  <p className="px-1 text-[13px] text-muted" aria-live="polite">
                    {busy ? 'Guardando…' : status ? SPORT_STATUS_HELP[status] : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
