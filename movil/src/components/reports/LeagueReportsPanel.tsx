/**
 * Organizar › Reportes (LeagueReportsPanel de la web, con su misma lógica: src/components/report/logic.ts y los datos
 * de src/lib/data/reports.ts): los comentarios, avisos, juegos y publicaciones (y sus comentarios) de la liga que
 * alguien reportó, sin saber quién, en «Abiertos» y «Cerrados». El admin lo descarta, lo marca como atendido (con lo
 * que hizo) o borra el comentario (una publicación se abre con «Ver» y se borra desde su menú). Lo suyo no le sale
 * (list_reports no lo manda). Va dentro de LeagueScope.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { CheckCircle2, Trash2 } from 'lucide-react-native';
import { deleteReportedComment, reportErrorText, useReports, type Report, type ReportFilter } from '@mm/lib/data/reports';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { deleteCommentConfirm, LEAGUE_REPORTS_INTRO, reportFilterOptions, reportsEmptyText } from '@mm/components/report/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { PillButton } from '@/components/scorers/parts';
import { Card, Divider, LoadError, Loading, Segmented, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { ReportItem, ResolveButtons } from './ReportItem';

const PAGE = 50;

export function LeagueReportsPanel() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const now = useNow().getTime();
  const [filter, setFilter] = useState<Exclude<ReportFilter, 'all'>>('open');
  const list = useReports(true, { league: lid, status: filter, page: 0, pageSize: PAGE });
  const { rows, open, all } = list.data;
  const empty = reportsEmptyText(filter);

  return (
    <View style={{ gap: 14 }}>
      {/* Una línea, no cuatro: quién lo ve y que nadie sabe quién reportó. */}
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {LEAGUE_REPORTS_INTRO}
      </Txt>
      <Segmented<Exclude<ReportFilter, 'all'>> label="Qué reportes ver" options={reportFilterOptions(open, all)} value={filter} onChange={setFilter} />
      {list.error && !rows.length ? (
        <LoadError error={list.error} />
      ) : list.loading && !rows.length ? (
        <Loading />
      ) : !rows.length ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
            <CheckCircle2 size={28} color={c.accent} />
          </View>
          <Txt variant="section" style={{ marginTop: 16, textAlign: 'center' }}>
            {empty.title}
          </Txt>
          <Txt variant="meta" tone="muted" style={{ marginTop: 6, textAlign: 'center', maxWidth: 320 }}>
            {empty.text}
          </Txt>
        </Card>
      ) : (
        <Card padded={false}>
          {rows.map((r, i) => (
            <View key={r.id}>
              {i > 0 && <Divider />}
              <ReportItem report={r} now={now} actions={r.status === 'open' ? <LeagueActions report={r} /> : undefined} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

/** Lo que el admin hace con un reporte abierto: borrar el comentario (si es uno), atenderlo o descartarlo. */
function LeagueActions({ report }: { report: Report }) {
  const [busy, setBusy] = useState(false);

  async function removeComment() {
    if (!(await confirmAsync(deleteCommentConfirm(report)))) return;
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
        <PillButton variant="ghost" danger icon={(color) => <Trash2 size={16} color={color} />} loading={busy} onPress={() => void removeComment()}>
          Borrar comentario
        </PillButton>
      )}
      <ResolveButtons report={report} />
    </>
  );
}
