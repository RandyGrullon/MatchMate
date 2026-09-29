import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Ban, BadgeCheck, EyeOff, Eye, Flag, FlaskConical, Play, RefreshCw, Trash2, X } from 'lucide-react';
import { Insignia } from '../../badges/visual';
import { ReviewList } from '../../components/badges/ReviewsPanel';
import { Badge, Button, Input, Loading, Modal, Textarea, cx } from '../../components/ui';
import { useFeedback } from '../../components/feedback';
import { useBadgeNotices, useBadgeStats } from '../../lib/data/badges';
import {
  badgeJobs,
  dismissBadgeReports,
  editBlockedTerms,
  startBackfill,
  superRevokeBadge,
  useBadgeEngine,
  useBadgeReports,
  useBlockedTerms,
  type BadgeEngine,
  type BadgeReport,
  type EngineJob,
} from '../../lib/data/badgeAdmin';
import { hideLeagueBadge } from '../../lib/data/leagueBadges';
import { ErrorRetry, KpiCard, KpiSkeleton, Panel, SectionHeader, Segmented } from './bits';
import { RARITY_NAME, VERDICT_LABEL, jobKindLabel, rarityRows, raritySummary, reportedView, shortError, sportLabel, type RarityRow } from './badgesModel';
import { fmtDateTime, fmtDay, fmtNum, relativeTime } from './format';
import { refreshAll, useRun, useSearchState } from './hooks';
import { sectionMeta } from './sections';

// La galería (todo el catálogo dibujado) se descarga solo al abrirla.
const BadgesGallery = lazy(() => import('./BadgesGallery'));

type View = 'revisar' | 'motor' | 'galeria';
const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'revisar', label: 'Por revisar' },
  { value: 'motor', label: 'Motor' },
  { value: 'galeria', label: 'Galería' },
];

/**
 * Consola › Insignias (docs/insignias.md §6.6): «Por revisar» (hazañas vencidas, reportes y palabras bloqueadas del
 * creador), «Motor» (cola, trabajos que ya no se toman, la primera corrida del historial en seco y de verdad, y la
 * rareza contra la meta del catálogo) y la «Galería» de todo el catálogo. La vista va en el link (?vista=motor).
 */
export default function BadgesSection() {
  const s = useSearchState();
  const raw = s.get('vista');
  const view: View = raw === 'motor' || raw === 'galeria' ? raw : 'revisar';
  const tabs = <Segmented label="Vista de insignias" options={VIEWS} value={view} onChange={(v) => s.patch({ vista: v === 'revisar' ? null : v, corrida: null })} />;
  if (view === 'galeria')
    return (
      <Suspense fallback={<Loading />}>
        <BadgesGallery tabs={tabs} />
      </Suspense>
    );
  return (
    <>
      <SectionHeader title="Insignias" hint={sectionMeta('insignias').hint} actions={tabs} />
      {view === 'revisar' ? <ReviewView /> : <EngineView />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Por revisar

function ReviewView() {
  const notices = useBadgeNotices();
  return (
    <>
      <Panel title="Hazañas por confirmar" subtitle="Las que llevan 14 días o más sin que su liga las confirme, o que nadie de su liga puede confirmar">
        <ReviewList
          reviews={notices.data.reviews}
          loading={notices.loading}
          error={notices.error}
          empty={<p className="py-2 text-sm text-muted">No hay hazañas esperando. Cuando una lleve 14 días sin que su liga la confirme, sale aquí.</p>}
        />
      </Panel>
      <ReportsPanel />
      <TermsPanel />
    </>
  );
}

const RESOLUTION_LABEL = { oculta: 'Diseño escondido', retirada: 'Insignia retirada', descartado: 'Se dejó como estaba' } as const;

type Pending = { kind: 'hide' | 'revoke' | 'dismiss'; report: BadgeReport } | null;

function ReportsPanel() {
  const [open, setOpen] = useState(true);
  const reports = useBadgeReports(true, open);
  const run = useRun();
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const d = reports.data;

  const act = async () => {
    if (!pending) return;
    const r = pending.report;
    setBusy(true);
    const ok = await run(
      async () => {
        if (pending.kind === 'hide' && r.design) await hideLeagueBadge(r.design, true, note);
        else if (pending.kind === 'revoke' && r.award) await superRevokeBadge(r.award.id, note);
        else await dismissBadgeReports([r.id], note);
      },
      pending.kind === 'hide' ? 'Diseño escondido' : pending.kind === 'revoke' ? 'Insignia retirada' : 'Reporte cerrado',
    );
    setBusy(false);
    if (ok) {
      setPending(null);
      refreshAll();
    }
  };

  return (
    <Panel
      title="Reportes"
      subtitle="Diseños del creador y insignias automáticas que alguien reportó"
      actions={
        <Segmented
          label="Reportes"
          options={[
            { value: 'abiertos', label: open && d.open ? `Abiertos (${fmtNum(d.open)})` : 'Abiertos' },
            { value: 'cerrados', label: 'Cerrados' },
          ]}
          value={open ? 'abiertos' : 'cerrados'}
          onChange={(v) => setOpen(v === 'abiertos')}
        />
      }
    >
      {reports.error && !d.rows.length ? (
        <ErrorRetry error={reports.error} compact />
      ) : reports.loading && !d.rows.length ? (
        <p className="py-2 text-sm text-muted">Cargando…</p>
      ) : !d.rows.length ? (
        <p className="py-2 text-sm text-muted">{open ? 'No hay reportes abiertos.' : 'Todavía no se ha cerrado ningún reporte.'}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {d.rows.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              onAct={(kind) => {
                setNote('');
                setPending({ kind, report: r });
              }}
            />
          ))}
        </ul>
      )}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending?.kind === 'hide' ? 'Esconder el diseño' : pending?.kind === 'revoke' ? 'Retirar por fraude' : 'Dejarla como está'}
        footer={
          <>
            <Button className="h-11" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button className="h-11" variant={pending?.kind === 'dismiss' ? 'primary' : 'danger'} loading={busy} onClick={() => void act()}>
              {pending?.kind === 'hide' ? 'Esconder' : pending?.kind === 'revoke' ? 'Retirar' : 'Cerrar el reporte'}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              {pending.kind === 'hide'
                ? 'Nadie fuera de los admins de esa liga lo vuelve a ver, tampoco en los perfiles. Sus reportes se cierran.'
                : pending.kind === 'revoke'
                  ? 'La insignia se retira (fraude): sale del perfil y de las destacadas, sin aviso. Queda en la auditoría.'
                  : 'No se toca nada: el reporte se cierra.'}
            </p>
            <label className="flex flex-col gap-1.5 font-medium">
              Nota privada (opcional)
              <Textarea value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
              <span className="self-end text-xs text-muted">{`${note.length}/200`}</span>
            </label>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

function ReportRow({ report: r, onAct }: { report: BadgeReport; onAct: (kind: 'hide' | 'revoke' | 'dismiss') => void }) {
  const v = useMemo(() => reportedView(r), [r]);
  const { confirm } = useFeedback();
  const run = useRun();
  const unhide = async () => {
    if (!r.design) return;
    const yes = await confirm({ title: `¿Dejar de esconder «${r.design.name}»?`, message: 'Vuelve archivado: la liga decide si lo activa otra vez.', confirmText: 'Dejar de esconder' });
    if (yes && (await run(() => hideLeagueBadge(r.design!, false), 'Ya no está escondido'))) refreshAll();
  };
  return (
    <li className="flex items-start gap-3 py-3">
      {v ? <Insignia badge={v.look} size={40} label={v.name} /> : <Flag className="mt-2 size-5 text-muted" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-semibold break-words">
          {v?.name ?? 'Insignia que esta versión no conoce'}
          {r.sameTarget > 1 && (
            <Badge tone="warn" className="ml-2 align-middle">
              {`${fmtNum(r.sameTarget)} reportes`}
            </Badge>
          )}
        </p>
        <p className="text-sm text-muted">{[v?.detail, r.leagueName].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 text-sm break-words">{r.reason ? `«${r.reason}»` : <span className="text-muted">Sin motivo</span>}</p>
        <p className="text-xs text-muted">{`${r.reporterName ?? 'Una cuenta'} · ${relativeTime(r.createdAt)}`}</p>
        {r.resolvedAt && <p className="mt-1 text-xs text-muted">{`${r.resolution ? RESOLUTION_LABEL[r.resolution] : 'Cerrado'} · ${relativeTime(r.resolvedAt)}`}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {!r.resolvedAt && (
            <>
              {r.design && r.design.status !== 'oculta' && (
                <Button className="h-11" variant="danger" icon={<EyeOff className="size-4" />} onClick={() => onAct('hide')}>
                  Esconder diseño
                </Button>
              )}
              {r.design?.status === 'oculta' && (
                <Button className="h-11" icon={<Eye className="size-4" />} onClick={() => void unhide()}>
                  Dejar de esconder
                </Button>
              )}
              {r.award && r.award.status !== 'revocada' && (
                <Button className="h-11" variant="danger" icon={<Ban className="size-4" />} onClick={() => onAct('revoke')}>
                  Retirar por fraude
                </Button>
              )}
              <Button className="h-11" icon={<X className="size-4" />} onClick={() => onAct('dismiss')}>
                Dejarla
              </Button>
            </>
          )}
          {r.leagueId && (
            <Link to={`/l/${r.leagueId}`} className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-accent-soft">
              Ver la liga
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function TermsPanel() {
  const terms = useBlockedTerms(true);
  const run = useRun();
  const [text, setText] = useState('');
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState(false);
  const words = text
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
  const add = async () => {
    if (!words.length) return;
    setBusy(true);
    if (await run(() => editBlockedTerms({ add: words, whole }), words.length === 1 ? 'Palabra bloqueada' : 'Palabras bloqueadas')) setText('');
    setBusy(false);
  };
  return (
    <Panel title="Palabras bloqueadas" subtitle="El creador de insignias rechaza nombres y textos que las tengan. Se comparan sin acentos ni mayúsculas, y con 0→o, 1→i, 3→e, 4→a, 5→s y @→a">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Una o varias, separadas por coma" aria-label="Palabras para bloquear" className="h-11 sm:flex-1" maxLength={400} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
          Solo la palabra entera
        </label>
        <Button type="submit" variant="primary" className="h-11" loading={busy} disabled={!words.length}>
          Bloquear
        </Button>
      </form>
      {terms.error && !terms.data.length ? (
        <div className="mt-3">
          <ErrorRetry error={terms.error} compact />
        </div>
      ) : terms.data.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Palabras bloqueadas">
          {terms.data.map((t) => (
            <li key={t.term} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-0.5 pl-3 text-sm">
              <span className="font-medium">{t.term}</span>
              {t.whole && <span className="text-xs text-muted">(entera)</span>}
              <button
                type="button"
                aria-label={`Quitar ${t.term}`}
                className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => void run(() => editBlockedTerms({ remove: [t.term] }), 'Quitada')}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{terms.loading ? 'Cargando…' : 'La lista está vacía: el filtro solo revisa enlaces, teléfonos y letras repetidas.'}</p>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Motor

function EngineView() {
  const s = useSearchState();
  const runId = s.get('corrida') || null;
  const engine = useBadgeEngine(true, runId);
  const stats = useBadgeStats(true);
  const e = engine.data;
  if (engine.error && !e) return <ErrorRetry error={engine.error} />;
  if (!e) return <KpiSkeleton n={4} />;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="En cola" value={fmtNum(e.queue.pending)} note={e.queue.locked ? `${fmtNum(e.queue.locked)} corriendo ahora` : 'trabajos del motor'} />
        <KpiCard label="Ya tocan" value={fmtNum(e.queue.due)} note={e.queue.oldestDue ? `el más viejo, ${relativeTime(e.queue.oldestDue)}` : 'nada atrasado'} />
        <KpiCard label="Ya no se toman" value={fmtNum(e.queue.dead)} note="5 intentos fallidos" />
        <KpiCard label="Avisos por salir" value={fmtNum(e.queue.notices)} note="push agrupados" />
      </div>
      {e.byKind.length > 0 && (
        <Panel title="En cola por tipo">
          <ul className="flex flex-wrap gap-2">
            {e.byKind.map((k) => (
              <li key={k.kind}>
                <Badge tone={k.dead ? 'danger' : 'neutral'}>{`${jobKindLabel(k.kind)}: ${fmtNum(k.pending)}${k.dead ? ` · ${fmtNum(k.dead)} sin tomar` : ''}`}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <DeadJobs jobs={e.dead} />
      <BackfillPanel engine={e} />
      <DryRunPanel engine={e} selected={runId} onSelect={(id) => s.patch({ corrida: id })} />
      <RarityPanel
        title="Rareza real"
        subtitle="La de cada noche (badge_stats) contra la estimada en el catálogo. Con menos de 50 cuentas en la base no se juzga"
        rows={stats.data}
        loading={stats.loading}
        empty="Todavía no se ha medido: la rareza se calcula cada noche."
      />
      {e.periods.length > 0 && (
        <Panel title="Últimos periodos que corrieron" subtitle="Meses, años, eventos e historial: cada uno corre una sola vez">
          <ul className="flex flex-col divide-y divide-line text-sm">
            {e.periods.map((p) => (
              <li key={`${p.kind}|${p.scope}|${p.periodKey}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                <span className="min-w-0 break-all">
                  <span className="font-medium">{jobKindLabel(p.kind)}</span> <span className="text-muted">{p.periodKey}</span>
                </span>
                <span className="text-xs text-muted">{`${fmtNum(p.awarded)} dadas · ${relativeTime(p.doneAt)}`}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function DeadJobs({ jobs }: { jobs: readonly EngineJob[] }) {
  const run = useRun();
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (ids: number[], action: 'retry' | 'drop', key: string) => {
    if (action === 'drop') {
      const yes = await confirm({ title: ids.length === 1 ? '¿Borrar este trabajo?' : `¿Borrar ${ids.length} trabajos?`, message: 'No se vuelve a evaluar lo que tocaban hasta que cambie otro resultado.', confirmText: 'Borrar', danger: true });
      if (!yes) return;
    }
    setBusy(key);
    await run(() => badgeJobs(ids, action), action === 'retry' ? 'De vuelta en la cola' : 'Borrado');
    setBusy(null);
  };
  return (
    <Panel
      title="Trabajos que ya no se toman"
      subtitle="Fallaron 5 veces (el motor, la foto de datos o la base). Sin error guardado: la función se quedó sin tiempo o sin CPU; un historial grande conviene partirlo por liga"
      actions={
        jobs.length > 1 ? (
          <Button size="sm" className="max-sm:h-11" icon={<RefreshCw className="size-3.5" />} loading={busy === 'all'} onClick={() => void act(jobs.map((j) => j.id), 'retry', 'all')}>
            Reintentar todos
          </Button>
        ) : undefined
      }
    >
      {!jobs.length ? (
        <p className="py-1 text-sm text-muted">Ninguno. Todo lo que entra a la cola se está aplicando.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-col gap-1 py-3 text-sm">
              <p className="font-semibold">
                {jobKindLabel(j.kind)} <span className="font-normal text-muted">{`#${j.id} · ${j.attempts} intentos`}</span>
              </p>
              <p className="break-all text-muted">{[j.leagueName, j.userName, j.ref].filter(Boolean).join(' · ')}</p>
              <p className="rounded-lg bg-danger-soft px-2 py-1 font-mono text-xs break-words text-danger">{shortError(j.lastError)}</p>
              <p className="text-xs text-muted">{`Entró ${fmtDateTime(j.createdAt)}`}</p>
              <div className="flex flex-wrap gap-2">
                <Button className="h-11" icon={<RefreshCw className="size-4" />} loading={busy === `r${j.id}`} onClick={() => void act([j.id], 'retry', `r${j.id}`)}>
                  Reintentar
                </Button>
                <Button className="h-11" variant="ghost" icon={<Trash2 className="size-4" />} loading={busy === `d${j.id}`} onClick={() => void act([j.id], 'drop', `d${j.id}`)}>
                  Borrar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function BackfillPanel({ engine: e }: { engine: BadgeEngine }) {
  const run = useRun();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState<'dry' | 'real' | null>(null);
  const running = e.backfill.filter((b) => b.pending > 0);
  const hadDryRun = e.runs.length > 0;
  const start = async (dryRun: boolean) => {
    if (!dryRun) {
      const yes = await confirm({
        title: '¿Dar de verdad las insignias del historial?',
        message: 'Se dan a todas las cuentas y jugadores según lo que ya jugaron (firmes si pasó hace 7 días o más). Cada cuenta recibe un solo aviso con la lista. No se puede deshacer de una vez.',
        confirmText: 'Dar de verdad',
        danger: true,
      });
      if (!yes) return;
    }
    setBusy(dryRun ? 'dry' : 'real');
    let jobs = 0;
    const ok = await run(async () => {
      jobs = (await startBackfill(null, dryRun)).jobs;
    });
    setBusy(null);
    if (ok) toast(`${fmtNum(jobs)} trabajos en la cola: el motor los va corriendo de 25 en 25`);
  };
  return (
    <Panel title="Historial (la primera corrida)" subtitle="Da lo que ya se ganó con lo que se jugó antes de las insignias: un trabajo por liga y uno por cuenta">
      <ol className="mb-3 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
        <li>Corre en seco: no da nada, solo cuenta cuántas cuentas tendrían cada insignia.</li>
        <li>Compara abajo con la rareza estimada y ajusta los umbrales del catálogo si algo sale muy fácil o muy poco.</li>
        <li>Corre de verdad: cada cuenta recibe un solo aviso, «Te dimos 12 insignias por tu historial».</li>
      </ol>
      {running.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {running.map((b) => (
            <li key={b.runId} className="flex flex-wrap items-center gap-2">
              <Badge tone={b.dryRun ? 'accent' : 'warn'}>{b.dryRun ? 'En seco' : 'De verdad'}</Badge>
              {`Quedan ${fmtNum(b.pending)} trabajos${b.dead ? ` · ${fmtNum(b.dead)} fallaron` : ''}`}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" variant="primary" icon={<FlaskConical className="size-4" />} loading={busy === 'dry'} disabled={!!busy || running.length > 0} onClick={() => void start(true)}>
          Correr en seco
        </Button>
        <Button className="h-11" variant="danger" icon={<Play className="size-4" />} loading={busy === 'real'} disabled={!!busy || running.length > 0 || !hadDryRun} onClick={() => void start(false)}>
          Correr de verdad
        </Button>
      </div>
      {!hadDryRun && <p className="mt-2 text-xs text-muted">«Correr de verdad» se habilita después de una corrida en seco.</p>}
    </Panel>
  );
}

function DryRunPanel({ engine: e, selected, onSelect }: { engine: BadgeEngine; selected: string | null; onSelect: (id: string | null) => void }) {
  if (!e.runs.length && !e.dryRun) return null;
  const current = e.dryRun?.runId ?? selected;
  return (
    <RarityPanel
      title="Corrida en seco"
      subtitle="Cuántas cuentas la tendrían, sobre las activas del deporte en los últimos 365 días, contra la rareza estimada"
      rows={e.dryRun?.rows ?? []}
      loading={false}
      empty="Esta corrida todavía no tiene resultados: el motor la está corriendo."
      actions={
        e.runs.length > 1 ? (
          <Segmented
            label="Corrida"
            options={e.runs.slice(0, 3).map((r, i) => ({ value: r.runId, label: i === 0 ? 'Última' : fmtDay(r.at.slice(0, 10)) }))}
            value={current && e.runs.some((r) => r.runId === current) ? current : e.runs[0].runId}
            onChange={(id) => onSelect(id === e.runs[0].runId ? null : id)}
          />
        ) : undefined
      }
    />
  );
}

const VERDICT_TONE = { ok: 'ok', facil: 'warn', dificil: 'accent', poca_base: 'neutral', sin_meta: 'neutral' } as const;

function RarityPanel({ title, subtitle, rows, loading, empty, actions }: { title: string; subtitle: string; rows: Parameters<typeof rarityRows>[0]; loading: boolean; empty: string; actions?: ReactNode }) {
  const [all, setAll] = useState(false);
  const model = useMemo(() => rarityRows(rows), [rows]);
  const sum = useMemo(() => raritySummary(model), [model]);
  const shown = all ? model : model.slice(0, 40);
  return (
    <Panel title={title} subtitle={subtitle} actions={actions}>
      {!model.length ? (
        <p className="py-1 text-sm text-muted">{loading ? 'Cargando…' : empty}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="ok">{`${fmtNum(sum.ok)} en su rango`}</Badge>
            <Badge tone="warn">{`${fmtNum(sum.easy)} ${sum.easy === 1 ? 'sale' : 'salen'} muy fácil`}</Badge>
            <Badge tone="accent">{`${fmtNum(sum.hard)} ${sum.hard === 1 ? 'sale' : 'salen'} muy poco`}</Badge>
            {sum.unjudged > 0 && <Badge>{`${fmtNum(sum.unjudged)} sin juzgar`}</Badge>}
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {shown.map((r) => (
              <RarityLine key={`${r.key}|${r.sport}|${r.level}`} row={r} />
            ))}
          </ul>
          {model.length > shown.length && (
            <Button className="mt-2 h-11 w-full" variant="ghost" onClick={() => setAll(true)}>
              {`Ver las ${fmtNum(model.length)}`}
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}

function RarityLine({ row: r }: { row: RarityRow }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium break-words">
          {r.name} <span className="font-normal text-muted">{`${r.levelName} · ${sportLabel(r.sport)}`}</span>
        </p>
        <p className="text-xs text-muted">
          {`${fmtNum(r.holders)} de ${fmtNum(r.base)}${r.pct === null ? '' : ` · ${r.pct.toLocaleString('es-DO')} %`}`}
          {r.target && ` · meta ${RARITY_NAME[r.target]}`}
          {r.measured && r.target && r.measured !== r.target && ` · sale ${RARITY_NAME[r.measured]}`}
        </p>
      </div>
      <Badge tone={VERDICT_TONE[r.verdict]} className={cx(r.verdict === 'ok' && 'max-sm:hidden')}>
        {r.verdict === 'ok' ? <BadgeCheck className="size-3" aria-hidden="true" /> : null}
        {VERDICT_LABEL[r.verdict]}
      </Badge>
    </li>
  );
}

