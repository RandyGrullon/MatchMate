import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { deleteReportedComment, reportErrorText, useReports, type Report, type ReportFilter } from '../../lib/data/reports';
import { useLeagueCtx } from '../../lib/league';
import { useFeedback } from '../feedback';
import { Button, Card, ListSkeleton, LoadError, Segmented } from '../ui';
import { ReportItem, ResolveButtons } from './ReportItem';

const PAGE = 50;

/**
 * Admin › Reportes (sale cuando la liga tiene alguno): los comentarios, avisos, juegos y publicaciones (y sus
 * comentarios) de la liga que alguien reportó, sin saber quién. El admin lo descarta, lo marca como atendido (con lo
 * que hizo) o borra el comentario (una publicación se abre con «Ver» y se borra desde su menú). Lo suyo (su aviso, su
 * comentario, su juego) ni le sale (list_reports no lo manda): lo ve solo el equipo de MatchMate. Ligas y cuentas
 * reportadas las atiende solo el equipo de MatchMate (consola › Reportes).
 */
export function LeagueReportsPanel() {
  const { lid } = useLeagueCtx();
  const [filter, setFilter] = useState<Exclude<ReportFilter, 'all'>>('open');
  const list = useReports(true, { league: lid, status: filter, page: 0, pageSize: PAGE });
  const { rows, open, all } = list.data;
  const closed = Math.max(0, all - open);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Una línea, no cuatro: quién lo ve y que nadie sabe quién reportó. */}
      <p className="mx-1 text-meta text-muted">Comentarios, avisos, juegos y publicaciones de tu liga. Nadie sabe quién los reportó.</p>
      <Segmented<Exclude<ReportFilter, 'all'>>
        label="Qué reportes ver"
        full
        options={[
          { key: 'open', label: open > 0 ? `Abiertos (${open})` : 'Abiertos' },
          { key: 'closed', label: closed > 0 ? `Cerrados (${closed})` : 'Cerrados' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {list.error && !rows.length ? (
        <LoadError error={list.error} />
      ) : list.loading && !rows.length ? (
        <ListSkeleton rows={3} />
      ) : !rows.length ? (
        <Card className="flex flex-col items-center px-5 py-8 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 className="mt-4 text-section">{filter === 'open' ? 'Nada por revisar' : 'Todavía no hay reportes cerrados'}</h2>
          <p className="mt-1.5 max-w-sm text-meta text-muted">
            {filter === 'open' ? 'Cuando alguien reporte algo de tu liga, sale aquí.' : 'Los que descartes o atiendas quedan aquí.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ol className="divide-y divide-line">
            {rows.map((r) => (
              <ReportItem key={r.id} report={r} actions={r.status === 'open' ? <LeagueActions report={r} /> : undefined} />
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function LeagueActions({ report }: { report: Report }) {
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function removeComment() {
    const ok = await confirm({
      title: '¿Borrar el comentario?',
      message: report.target?.text ? `“${report.target.text}”` : 'Se borra para todos.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteReportedComment(report);
      toast('Comentario borrado');
    } catch (e) {
      console.error(e);
      toast(reportErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {report.kind === 'comment' && report.target && (
        <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={busy} onClick={removeComment} className="h-11 rounded-full! text-danger!">
          Borrar comentario
        </Button>
      )}
      <ResolveButtons report={report} />
    </>
  );
}
