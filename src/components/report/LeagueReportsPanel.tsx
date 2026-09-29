import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { deleteReportedComment, reportErrorText, useReports, type Report, type ReportFilter } from '../../lib/data/reports';
import { useLeagueCtx } from '../../lib/league';
import { useFeedback } from '../feedback';
import { Button, Card, Empty, ListSkeleton, LoadError, Tabs } from '../ui';
import { ReportItem, ResolveButtons } from './ReportItem';

const PAGE = 50;

/**
 * Admin › Reportes (sale cuando la liga tiene alguno): los comentarios, avisos y juegos de la liga que alguien
 * reportó, sin saber quién. El admin lo descarta, lo marca como atendido (con lo que hizo) o borra el comentario.
 * Lo suyo (su aviso, su comentario, su juego) ni le sale (list_reports no lo manda): lo ve solo el equipo de
 * MatchMate. Ligas y cuentas reportadas las atiende solo el equipo de MatchMate (consola › Reportes).
 */
export function LeagueReportsPanel() {
  const { lid } = useLeagueCtx();
  const [filter, setFilter] = useState<Exclude<ReportFilter, 'all'>>('open');
  const list = useReports(true, { league: lid, status: filter, page: 0, pageSize: PAGE });
  const { rows, open, all } = list.data;
  const closed = Math.max(0, all - open);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Lo que alguien reportó en tu liga: comentarios, avisos y juegos. No sabes quién lo reportó, y la persona reportada tampoco. El equipo
        de MatchMate también lo ve. Si reportan algo tuyo, no sale aquí: lo revisa solo el equipo de MatchMate.
      </p>
      <Tabs<Exclude<ReportFilter, 'all'>>
        items={[
          { key: 'open', label: 'Abiertos', count: open },
          { key: 'closed', label: 'Cerrados', count: closed },
        ]}
        active={filter}
        onChange={setFilter}
      />
      {list.error && !rows.length ? (
        <LoadError error={list.error} />
      ) : list.loading && !rows.length ? (
        <ListSkeleton rows={3} />
      ) : !rows.length ? (
        <Empty icon={<CheckCircle2 className="size-8" />} title={filter === 'open' ? 'Nada por revisar' : 'Todavía no hay reportes cerrados'}>
          {filter === 'open' ? 'Cuando alguien reporte algo de tu liga, sale aquí.' : 'Los que descartes o atiendas quedan aquí.'}
        </Empty>
      ) : (
        <Card>
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
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} loading={busy} onClick={removeComment} className="text-danger max-sm:h-11">
          Borrar comentario
        </Button>
      )}
      <ResolveButtons report={report} />
    </>
  );
}
