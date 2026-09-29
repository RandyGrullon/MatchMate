import { useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Flag, Trash2, UserRound, UserX } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { ReportItem, ResolveButtons } from '../../components/report/ReportItem';
import { Button, Card, Empty } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { REPORT_KINDS, REPORT_KIND_LABEL, deleteReportedComment, useReports, type Report, type ReportFilter, type ReportKind } from '../../lib/data/reports';
import { ErrorRetry, FilterChips, Pager, SectionHeader, TableSkeleton } from './bits';
import { PAGE_SIZES, intParam, useRun, useSearchState } from './hooks';
import { DeleteLeagueModal } from './LeagueActions';
import { sectionMeta } from './sections';
import { BlockModal } from './UserDetail';

type KindFilter = 'all' | ReportKind;
const isKind = (v: string): v is ReportKind => (REPORT_KINDS as readonly string[]).includes(v);
const isFilter = (v: string): v is ReportFilter => v === 'open' || v === 'closed' || v === 'all';

/**
 * Reportes: lo que la gente reportó (comentarios, avisos, juegos, ligas y cuentas), lo más nuevo primero. Cada uno con
 * lo reportado a la vista y su link, quién lo reportó, la nota y cuántos hay de lo mismo. Acciones: descartar, marcar
 * como atendido (con nota) y las herramientas de siempre: borrar el comentario, bloquear la cuenta (admin_block_user)
 * o borrar la liga (delete_league). Descartar o atender cierra todos los abiertos de lo mismo y queda en la auditoría.
 * Los admins de cada liga ven y atienden los comentarios, avisos y juegos de su liga (Admin › Reportes).
 */
export default function ReportsSection() {
  const s = useSearchState();
  const statusRaw = s.get('e');
  const status: ReportFilter = isFilter(statusRaw) ? statusRaw : 'open';
  const kindRaw = s.get('t');
  const kind: KindFilter = isKind(kindRaw) ? kindRaw : 'all';
  const page = Math.max(0, intParam(s.get('p'), 1) - 1);
  const pageSize = intParam(s.get('n'), 25, PAGE_SIZES);
  const list = useReports(true, { status, kind: kind === 'all' ? null : kind, page, pageSize });
  const { rows, total, open, all } = list.data;
  const [blocking, setBlocking] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string; kind: 'liga' | 'torneo'; members: number; events: number } | null>(null);

  return (
    <>
      <SectionHeader title="Reportes" hint={sectionMeta('reportes').hint} />

      <div className="flex flex-col gap-3">
        <FilterChips
          label="Estado"
          items={[
            { key: 'open' as ReportFilter, label: 'Abiertos', count: open },
            { key: 'closed' as ReportFilter, label: 'Cerrados', count: Math.max(0, all - open) },
            { key: 'all' as ReportFilter, label: 'Todos', count: all },
          ]}
          value={status}
          onChange={(v) => s.patch({ e: v === 'open' ? null : v, p: null })}
        />
        <FilterChips
          label="Qué se reportó"
          items={[{ key: 'all' as KindFilter, label: 'Todo' }, ...REPORT_KINDS.map((k) => ({ key: k as KindFilter, label: REPORT_KIND_LABEL[k] }))]}
          value={kind}
          onChange={(k) => s.patch({ t: k === 'all' ? null : k, p: null })}
        />
      </div>

      {list.error && !rows.length ? (
        <ErrorRetry error={list.error} />
      ) : list.loading && !rows.length ? (
        <TableSkeleton rows={4} cols={3} />
      ) : !rows.length ? (
        <Empty icon={status === 'open' ? <CheckCircle2 className="size-8" /> : <Flag className="size-8" />} title={status === 'open' ? 'Nada por revisar' : 'Todavía no hay reportes aquí'}>
          {status === 'open'
            ? 'Cuando alguien reporte un comentario, un aviso, un juego, una liga o una cuenta, sale aquí y te llega un aviso al teléfono.'
            : 'Los reportes que se descarten o se atiendan quedan aquí.'}
        </Empty>
      ) : (
        <Card className={list.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ol className="divide-y divide-line">
            {rows.map((r) => (
              <ReportItem
                key={r.id}
                report={r}
                showReporter
                actions={<ReportTools report={r} onBlock={setBlocking} onDeleteLeague={setDeleting} />}
              />
            ))}
          </ol>
        </Card>
      )}

      {(total > 0 || page > 0) && (
        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          noun="reportes"
          onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })}
          onPageSize={(n) => s.patch({ n: n === 25 ? null : n, p: null })}
        />
      )}

      <BlockModal user={blocking} onClose={() => setBlocking(null)} />
      <DeleteLeagueModal league={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

/** Lo que se puede hacer con un reporte: ver la cuenta, las herramientas y (si está abierto) descartar o atender. */
function ReportTools({
  report: r,
  onBlock,
  onDeleteLeague,
}: {
  report: Report;
  onBlock: (u: { id: string; name: string }) => void;
  onDeleteLeague: (l: { id: string; name: string; kind: 'liga' | 'torneo'; members: number; events: number }) => void;
}) {
  const { user } = useAuth();
  const { confirm } = useFeedback();
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const t = r.target;
  const owner = t?.userId && t.userId !== user?.uid ? { id: t.userId, name: t.userName ?? 'esta cuenta' } : null;

  async function removeComment() {
    const ok = await confirm({
      title: '¿Borrar el comentario?',
      message: t?.text ? `“${t.text}” — se borra para todos y el reporte queda atendido.` : 'Se borra para todos y el reporte queda atendido.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    await run(() => deleteReportedComment(r), 'Comentario borrado');
    setBusy(false);
  }

  return (
    <>
      {owner && (
        <Link
          to={`/superadmin/cuentas?u=${encodeURIComponent(owner.id)}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft max-sm:h-11"
        >
          <UserRound className="size-3.5" aria-hidden="true" /> Ver la cuenta
        </Link>
      )}
      {r.status === 'open' && r.kind === 'comment' && t && (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} loading={busy} onClick={removeComment} className="text-danger max-sm:h-11">
          Borrar comentario
        </Button>
      )}
      {r.status === 'open' && owner && t?.blocked !== true && (
        <Button size="sm" variant="ghost" icon={<UserX className="size-3.5" />} onClick={() => onBlock(owner)} className="text-danger max-sm:h-11">
          Bloquear cuenta
        </Button>
      )}
      {r.status === 'open' && r.kind === 'league' && t?.leagueId && (
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-3.5" />}
          onClick={() => onDeleteLeague({ id: t.leagueId!, name: t.title, kind: t.leagueKind ?? 'liga', members: t.members ?? 0, events: t.events ?? 0 })}
          className="text-danger max-sm:h-11"
        >
          Borrar {t.leagueKind === 'torneo' ? 'torneo' : 'liga'}
        </Button>
      )}
      {r.status === 'open' && <ResolveButtons report={r} />}
    </>
  );
}
