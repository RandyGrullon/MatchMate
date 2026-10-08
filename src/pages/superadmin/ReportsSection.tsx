import { useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Flag, MoreHorizontal, Trash2, UserRound, UserX } from 'lucide-react';
import { BusyIcon } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { ReportItem } from '../../components/report/ReportItem';
import { Button, Card, Modal, Sheet, Textarea } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import {
  REPORT_KINDS,
  REPORT_KIND_LABEL,
  REPORT_NOTE_MAX,
  deleteReportedComment,
  reportErrorText,
  resolveReport,
  useReports,
  type Report,
  type ReportFilter,
  type ReportKind,
} from '../../lib/data/reports';
import { EmptyCard, ErrorRetry, FilterChips, MenuList, Pager, RoundButton, SectionHeader, Segmented, TableSkeleton, type MenuItem } from './bits';
import { fmtNum } from './format';
import { PAGE_SIZES, intParam, useRun, useSearchState } from './hooks';
import { DeleteLeagueModal } from './LeagueActions';
import { sectionMeta, sectionPath } from './sections';
import { BlockModal } from './UserDetail';

type KindFilter = 'all' | ReportKind;
const isKind = (v: string): v is ReportKind => (REPORT_KINDS as readonly string[]).includes(v);
const isFilter = (v: string): v is ReportFilter => v === 'open' || v === 'closed' || v === 'all';

/**
 * Reportes: lo que la gente reportó (comentarios, avisos, juegos, ligas y cuentas), lo más nuevo primero. Cada uno con
 * lo reportado a la vista y su link, quién lo reportó, la nota y cuántos hay de lo mismo. Acciones: descartar, marcar
 * como atendido (con nota) a la vista, y en su «•••» las herramientas de siempre: ver la cuenta, borrar el comentario,
 * bloquear la cuenta (admin_block_user) o borrar la liga (delete_league). Descartar o atender cierra todos los abiertos
 * de lo mismo y queda en la auditoría.
 * Los admins de cada liga ven y atienden los comentarios, avisos y juegos de su liga (Admin › Reportes).
 * Los reportes de insignias (diseños del creador e insignias automáticas) son otra cola: Consola › Insignias.
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
  const { rows, total, open } = list.data;
  const [blocking, setBlocking] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<LeagueToDelete | null>(null);

  return (
    <>
      <SectionHeader
        title="Reportes"
        hint={
          <>
            {sectionMeta('reportes').hint}. Los de insignias van en{' '}
            <Link to={sectionPath('insignias')} className="font-semibold text-accent">
              Insignias
            </Link>
            .
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <Segmented
          label="Estado"
          options={[
            { value: 'open' as ReportFilter, label: open ? `Abiertos (${fmtNum(open)})` : 'Abiertos' },
            { value: 'closed' as ReportFilter, label: 'Cerrados' },
            { value: 'all' as ReportFilter, label: 'Todos' },
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
        <EmptyCard icon={status === 'open' ? <CheckCircle2 className="size-8" /> : <Flag className="size-8" />} title={status === 'open' ? 'Nada por revisar' : 'Todavía no hay reportes aquí'}>
          {status === 'open' ? 'Cuando alguien reporte algo, sale aquí y te llega un aviso.' : 'Los que se descarten o se atiendan quedan aquí.'}
        </EmptyCard>
      ) : (
        <Card className={list.loading ? 'overflow-hidden opacity-60 transition-opacity' : 'overflow-hidden transition-opacity'}>
          <ol className="divide-y divide-line [&>li]:px-5 [&>li]:py-4">
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

/**
 * Las herramientas de un reporte, para su «•••»: ver la cuenta de quien lo escribió y (si está abierto) borrar el
 * comentario, bloquear la cuenta o borrar la liga, en rojo. Vacío si no hay ninguna.
 */
export function reportToolItems(
  r: Report,
  me: string | undefined,
  on: { removeComment: () => void; block: (u: { id: string; name: string }) => void; deleteLeague: (l: LeagueToDelete) => void },
  busy = false,
): MenuItem[] {
  const t = r.target;
  const owner = t?.userId && t.userId !== me ? { id: t.userId, name: t.userName ?? 'esta cuenta' } : null;
  const open = r.status === 'open';
  const items: MenuItem[] = [];
  if (owner) items.push({ key: 'cuenta', icon: UserRound, label: 'Ver la cuenta', hint: owner.name, to: `/superadmin/cuentas?u=${encodeURIComponent(owner.id)}` });
  if (open && r.kind === 'comment' && t) items.push({ key: 'comentario', icon: Trash2, label: 'Borrar comentario', onClick: on.removeComment, busy, danger: true });
  if (open && owner && t?.blocked !== true) items.push({ key: 'bloquear', icon: UserX, label: 'Bloquear cuenta', onClick: () => on.block(owner), danger: true });
  if (open && r.kind === 'league' && t?.leagueId) {
    const kind = t.leagueKind ?? 'liga';
    items.push({
      key: 'liga',
      icon: Trash2,
      label: `Borrar ${kind === 'torneo' ? 'torneo' : 'liga'}`,
      onClick: () => on.deleteLeague({ id: t.leagueId!, name: t.title, kind, members: t.members ?? 0, events: t.events ?? 0 }),
      danger: true,
    });
  }
  return items;
}

type LeagueToDelete = { id: string; name: string; kind: 'liga' | 'torneo'; members: number; events: number };

/** Lo que se puede hacer con un reporte: descartar o atender (si está abierto) y «•••» con las herramientas. */
function ReportTools({ report: r, onBlock, onDeleteLeague }: { report: Report; onBlock: (u: { id: string; name: string }) => void; onDeleteLeague: (l: LeagueToDelete) => void }) {
  const { user } = useAuth();
  const { confirm } = useFeedback();
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const t = r.target;

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

  const items = reportToolItems(r, user?.uid, { removeComment: () => void removeComment(), block: onBlock, deleteLeague: onDeleteLeague }, busy);
  return (
    <>
      {r.status === 'open' && <ResolveActions report={r} />}
      {items.length > 0 && (
        <>
          <span className="ml-auto">
            <RoundButton label="Más herramientas" onClick={() => setOpen(true)} busy={busy} popup>
              <BusyIcon busy={busy} icon={<MoreHorizontal aria-hidden="true" strokeWidth={2.4} className="size-5" />} className="size-5" />
            </RoundButton>
          </span>
          <Sheet open={open} onClose={() => setOpen(false)} title="Herramientas" subtitle={t?.title ?? REPORT_KIND_LABEL[r.kind]}>
            <MenuList items={items} onPick={() => setOpen(false)} />
          </Sheet>
        </>
      )}
    </>
  );
}

/**
 * «Descartar» (con confirmación) y «Atender» (con una nota de lo que se hizo): lo mismo que ResolveButtons
 * (report/ReportItem), con nombres cortos para que quepan con «•••» en el teléfono. Cierran también los demás abiertos
 * de lo mismo.
 */
function ResolveActions({ report }: { report: Report }) {
  const { confirm, toast } = useFeedback();
  // Cuál se está guardando: la ruedita va en ese botón.
  const [busy, setBusy] = useState<'dismissed' | 'actioned' | null>(null);
  const [attending, setAttending] = useState(false);
  const [note, setNote] = useState('');
  const others = report.sameTarget > 1 ? ` y los otros ${report.sameTarget - 1} de lo mismo` : '';

  async function run(status: 'dismissed' | 'actioned', text: string | null) {
    if (busy) return false;
    setBusy(status);
    try {
      await resolveReport(report.id, status, text);
      toast(status === 'actioned' ? 'Reporte atendido' : 'Reporte descartado');
      return true;
    } catch (e) {
      console.error(e);
      toast(reportErrorText(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    const ok = await confirm({
      title: '¿Descartar el reporte?',
      message: `Queda cerrado sin hacer nada${others}. Si vuelve a pasar, lo pueden reportar otra vez.`,
      confirmText: 'Descartar',
    });
    if (ok) await run('dismissed', null);
  }

  async function attend() {
    if (await run('actioned', note)) {
      setAttending(false);
      setNote('');
    }
  }

  return (
    <>
      <Button variant="quiet" onClick={dismiss} loading={busy === 'dismissed'} disabled={!!busy} className="max-sm:h-11">
        Descartar
      </Button>
      <Button variant="soft" icon={<CheckCircle2 className="size-4" />} onClick={() => setAttending(true)} disabled={!!busy} className="max-sm:h-11">
        Atender
      </Button>
      <Modal
        open={attending}
        onClose={() => setAttending(false)}
        title="Marcar como atendido"
        footer={
          <>
            <Button variant="quiet" size="lg" onClick={() => setAttending(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" icon={<CheckCircle2 className="size-[18px]" />} loading={busy === 'actioned'} onClick={attend}>
              Listo
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[15px]">
            ¿Qué se hizo?<span className="text-muted"> Queda anotado en el reporte{others}.</span>
          </span>
          <Textarea
            rows={3}
            maxLength={REPORT_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, REPORT_NOTE_MAX))}
            placeholder="Hablé con el admin y borró el comentario."
          />
        </label>
      </Modal>
    </>
  );
}
