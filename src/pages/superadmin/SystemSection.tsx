import { useState } from 'react';
import { Clock, DatabaseBackup, HeartPulse, Server } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { Badge, Button, ListRow, RowIcon, Skeleton, cx } from '../../components/ui';
import { backendMode } from '../../lib/backend';
import {
  STORAGE_ALERT_PCT,
  useAdminOverview,
  useAdminStorageUsage,
  useAdminSystem,
  type AdminStorageUsage,
  type AdminSystem,
} from '../../lib/data/admin';
import { Meter } from './charts';
import { ErrorRetry, Fact, Panel, SectionHeader, TH } from './bits';
import { fmtBytes, fmtDateTime, fmtNum, fmtPct, relativeTime } from './format';
import { planLimits } from './plan';
import { sectionMeta } from './sections';

/** Un «mantener despierto» de hace más de 3 días: Supabase pausa el proyecto gratis a los 7 sin uso. */
const STALE_HEARTBEAT_MS = 3 * 86_400_000;

function cronTone(status: string | null): 'ok' | 'danger' | 'warn' | 'neutral' {
  if (!status) return 'neutral';
  if (/succe|ok|complet/i.test(status)) return 'ok';
  if (/fail|error/i.test(status)) return 'danger';
  if (/run|start/i.test(status)) return 'warn';
  return 'neutral';
}

function cronLabel(status: string | null): string {
  if (!status) return 'Sin correr';
  if (/succe|complet/i.test(status)) return 'Bien';
  if (/fail|error/i.test(status)) return 'Falló';
  if (/run|start/i.test(status)) return 'Corriendo';
  return status;
}

/** Botón «Respaldo completo»: baja un JSON con todas las ligas y las cuentas. El único principal de Sistema. */
export function BackupButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  async function backup() {
    setBusy(true);
    try {
      const { downloadFullBackup } = await import('../../lib/backup');
      const c = await downloadFullBackup();
      toast(`Respaldo descargado: ${fmtNum(c.leagues)} ligas, ${fmtNum(c.users)} cuentas`);
    } catch (e) {
      console.error(e);
      toast('No se pudo hacer el respaldo.', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="primary" size="lg" icon={<DatabaseBackup className="size-[18px]" />} loading={busy} onClick={backup} className={className}>
      Respaldo completo
    </Button>
  );
}

/**
 * Sistema: backend, espacio y límites del plan gratis, «mantener despierto», tareas, cola de avisos, migraciones y
 * respaldo. El aviso de espacio al teléfono de los superadmins abre esta sección (/superadmin/sistema).
 */
export default function SystemSection() {
  const system = useAdminSystem(true);
  const overview = useAdminOverview(true);
  const storage = useAdminStorageUsage(true);
  const sys = system.data;
  const o = overview.data;
  const usage = storage.data;
  const mode = sys?.backend ?? backendMode();
  const limits = planLimits(o, usage);

  return (
    <>
      <SectionHeader title="Sistema" hint={sectionMeta('sistema').hint} />

      {system.error && !sys && <ErrorRetry error={system.error} compact />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Respaldo" subtitle="Todas las ligas y las cuentas, en un archivo JSON" className="lg:order-3">
          <p className="mb-4 text-[15px] text-fg-2">Guárdalo fuera de la app. Tarda más mientras más ligas haya.</p>
          <BackupButton className="w-full" />
        </Panel>

        <Panel title="Servidor" className="lg:order-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Fact label="Backend">
              {mode === 'supabase' ? (
                <Badge tone="ok">
                  <Server className="size-3" aria-hidden="true" />
                  Supabase
                </Badge>
              ) : (
                <Badge tone="warn">
                  <Server className="size-3" aria-hidden="true" />
                  Local (PGlite)
                </Badge>
              )}
            </Fact>
            <Fact label="Mantener despierto">
              {!sys ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <HeartbeatValue at={sys.lastHeartbeat} />
              )}
            </Fact>
            <Fact label="Datos al">{o ? <span title={fmtDateTime(o.generatedAt)}>{relativeTime(o.generatedAt)}</span> : '—'}</Fact>
            <Fact label="Migraciones">{sys ? (sys.migrations ? fmtNum(sys.migrations.length) : 'Del código') : '—'}</Fact>
          </dl>
          {mode === 'local' && (
            <p className="mt-4 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">Modo local: la base vive en este navegador. Sin pg_cron ni límites del plan.</p>
          )}
        </Panel>

        <Panel title="Cola de avisos push" subtitle="Avisos al teléfono esperando salir" className="lg:order-2">
          {!sys ? (
            system.error ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <Skeleton className="h-24" />
            )
          ) : (
            <PushQueue push={sys.push} subscriptions={o?.push.subscriptions ?? null} sent24h={o?.push.sent24h ?? null} />
          )}
        </Panel>

      </div>

      <Panel
        title="Espacio del plan gratis"
        subtitle={`Desde el ${STORAGE_ALERT_PCT} % llega un aviso a los superadmins (uno cada 3 días).`}
      >
        {!usage ? (
          storage.error ? (
            <ErrorRetry error={storage.error} compact />
          ) : (
            <Skeleton className="h-24" />
          )
        ) : (
          <StorageUsage usage={usage} local={mode === 'local'} />
        )}
      </Panel>

      <Panel title="Límites del plan gratis" subtitle="Si algo se llena, la app se pone lenta o deja de guardar">
        {overview.error && !o && <ErrorRetry error={overview.error} compact />}
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-line text-left">
            <tr>
              <th scope="col" className={`${TH} pl-0`}>
                Recurso
              </th>
              <th scope="col" className={TH}>
                Tope
              </th>
              <th scope="col" className={TH}>
                Uso ahora
              </th>
              <th scope="col" className={`${TH} w-48 pr-0`}>
                <span className="sr-only">Medidor</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {limits.map((l) => (
              <tr key={l.id}>
                <td className="py-2.5 pr-3">
                  <span className="font-semibold">{l.label}</span>
                  <span className="block text-[13px] text-muted">{l.note}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{l.limit}</td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                  {l.current ?? <span className="text-muted">—</span>}
                  {l.used != null && <span className="ml-1.5 text-xs text-muted">({fmtPct(l.used)})</span>}
                </td>
                <td className="py-2.5 pl-3">{l.used != null && <Meter value={l.used * 100} max={100} label={`${l.label}: uso`} valueText={fmtPct(l.used)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="flex flex-col divide-y divide-line md:hidden">
          {limits.map((l) => (
            <li key={l.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">{l.label}</span>
                <span className="num text-[13px] text-muted">
                  {l.current ?? '—'} de {l.limit}
                </span>
              </div>
              {l.used != null && <Meter value={l.used * 100} max={100} label={`${l.label}: uso`} valueText={fmtPct(l.used)} />}
              <span className="text-[13px] text-muted">{l.note}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tareas programadas" subtitle="pg_cron: fotos, avisos y recordatorios" flush>
          {!sys ? (
            system.error ? null : <Skeleton className="mx-5 mb-4 h-28" />
          ) : !sys.cron ? (
            <p className="px-5 pb-4 text-sm text-muted">No hay pg_cron en este modo (solo en Supabase).</p>
          ) : !sys.cron.length ? (
            <p className="px-5 pb-4 text-sm text-muted">No hay tareas programadas.</p>
          ) : (
            sys.cron.map((c) => (
              <ListRow
                key={c.job}
                dense
                leading={
                  <RowIcon>
                    <Clock className="size-5" />
                  </RowIcon>
                }
                title={<span className="font-mono text-sm">{c.job}</span>}
                subtitle={
                  <>
                    <span className="font-mono">{c.schedule}</span>
                    {c.lastRunAt ? (
                      <>
                        {' '}
                        · última:{' '}
                        <time dateTime={c.lastRunAt} title={fmtDateTime(c.lastRunAt)}>
                          {relativeTime(c.lastRunAt)}
                        </time>
                      </>
                    ) : (
                      ' · nunca ha corrido'
                    )}
                  </>
                }
                trailing={<Badge tone={cronTone(c.lastStatus)}>{cronLabel(c.lastStatus)}</Badge>}
              />
            ))
          )}
        </Panel>

        <Panel title="Migraciones aplicadas" subtitle="Cambios de la base, en orden">
          {!sys ? (
            system.error ? null : <Skeleton className="h-28" />
          ) : !sys.migrations ? (
            <p className="py-4 text-sm text-muted">En modo local las migraciones se cargan del código de la app cada vez que abre.</p>
          ) : !sys.migrations.length ? (
            <p className="py-4 text-sm text-muted">No hay migraciones registradas.</p>
          ) : (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-semibold select-none">
                {fmtNum(sys.migrations.length)} migraciones · última {latestMigration(sys.migrations)}
                <span className="text-xs text-muted group-open:hidden">(ver todas)</span>
              </summary>
              <ol className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-2xl bg-surface-2">
                {[...sys.migrations].sort((a, b) => (a.version < b.version ? 1 : -1)).map((m) => (
                  <li key={m.version} className="flex gap-3 px-3 py-1.5 text-xs">
                    <span className="font-mono text-muted">{m.version}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name ?? ''}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </Panel>
      </div>
    </>
  );
}

/** La versión más nueva (la base las manda en cualquier orden). */
const latestMigration = (list: readonly { version: string }[]) => list.reduce((max, m) => (m.version > max ? m.version : max), '');

function HeartbeatValue({ at }: { at: string | null }) {
  if (!at) return <Badge tone="warn">Nunca</Badge>;
  const old = Date.now() - Date.parse(at) > STALE_HEARTBEAT_MS;
  return (
    <span className="inline-flex items-center gap-1.5" title={fmtDateTime(at)}>
      <HeartPulse className={old ? 'size-4 text-warn' : 'size-4 text-ok'} aria-hidden="true" />
      {relativeTime(at)}
    </span>
  );
}

/**
 * Dos barras con el porcentaje del plan gratis (base y fotos) y una marca donde sale el aviso; abajo, la última alerta
 * y las fotos borradas que purge-photos todavía no quitó del bucket. Sin Storage (modo local) las fotos no se miden.
 */
function StorageUsage({ usage, local }: { usage: AdminStorageUsage; local: boolean }) {
  const rows = [
    { key: 'db', label: 'Base de datos', bytes: usage.dbBytes, limit: usage.dbLimit, pct: usage.dbPct, measured: true },
    { key: 'storage', label: 'Fotos (Storage)', bytes: usage.storageBytes, limit: usage.storageLimit, pct: usage.storagePct, measured: !local },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => {
          const pct = fmtPct(r.pct / 100);
          const of = `${fmtBytes(r.bytes)} de ${fmtBytes(r.limit)}`;
          return (
            <div key={r.key} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">{r.label}</span>
                <span className={cx('num text-row-num-pro', r.measured && r.pct >= STORAGE_ALERT_PCT && 'text-warn')}>{r.measured ? pct : '—'}</span>
              </div>
              <div className="relative">
                <Meter value={r.measured ? r.pct : 0} max={100} label={`${r.label}: uso del plan gratis`} valueText={r.measured ? `${pct} (${of})` : 'No se mide'} />
                <span aria-hidden="true" className="absolute -inset-y-0.5 w-0.5 rounded-full bg-fg/40" style={{ left: `${STORAGE_ALERT_PCT}%` }} />
              </div>
              <span className="num text-[13px] text-muted">{r.measured ? of : 'En modo local las fotos viven en este navegador.'}</span>
            </div>
          );
        })}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4">
        <Fact label="Último aviso de espacio">
          {usage.lastAlertAt ? (
            <time dateTime={usage.lastAlertAt} title={fmtDateTime(usage.lastAlertAt)}>
              {relativeTime(usage.lastAlertAt)}
            </time>
          ) : (
            'Ninguno'
          )}
        </Fact>
        <Fact label="Fotos y logos por quitar de Storage">{fmtNum(usage.purgePending)}</Fact>
      </dl>
    </div>
  );
}

function PushQueue({ push, subscriptions, sent24h }: { push: AdminSystem['push']; subscriptions: number | null; sent24h: number | null }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
      <Fact label="En cola">{fmtNum(push.queued)}</Fact>
      <Fact label="Saliendo ahora">{fmtNum(push.claimed)}</Fact>
      <Fact label="Fallaron (24 h)">
        {push.failed24h > 0 ? <span className="text-danger">{fmtNum(push.failed24h)}</span> : fmtNum(push.failed24h)}
      </Fact>
      <Fact label="El más viejo en cola">
        {push.oldestQueuedAt ? <span title={fmtDateTime(push.oldestQueuedAt)}>{relativeTime(push.oldestQueuedAt)}</span> : 'Ninguno'}
      </Fact>
      <Fact label="Teléfonos suscritos">{fmtNum(subscriptions)}</Fact>
      <Fact label="Enviados (24 h)">{fmtNum(sent24h)}</Fact>
    </dl>
  );
}
