import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ExternalLink, Flag } from 'lucide-react';
import { REPORT_KIND_LABEL, REPORT_NOTE_MAX, REPORT_REASON_LABEL, reportErrorText, reportTargetUrl, resolveReport, type Report } from '../../lib/data/reports';
import { relativeTime } from '../../lib/notifications';
import { useFeedback } from '../feedback';
import { Badge, Button, Sheet, Textarea, cx } from '../ui';
import { ATTEND_NOTE_LABEL, ATTEND_NOTE_PLACEHOLDER, attendNoteHint, dismissConfirm, reasonTone, resolvedText, resolvedToast } from './logic';

// El color del motivo y cómo quedó un reporte cerrado son lógica pura (logic.ts, también la usa la app del teléfono).
export { reasonTone, resolvedText } from './logic';

/**
 * Un reporte en una lista (consola y Admin de la liga): el motivo, qué es y de qué liga, lo reportado a la vista (con
 * link, `reportTargetUrl`: una publicación o el comentario de una lleva a `/p/<id>`; si se borró, lo dice), la nota,
 * quién reportó (solo `showReporter`: el superadmin), cuántos hay de lo mismo y cómo quedó. `actions`: los botones de
 * abajo (descartar, atender y las herramientas).
 */
export function ReportItem({ report: r, showReporter, actions, now = Date.now() }: { report: Report; showReporter?: boolean; actions?: ReactNode; now?: number }) {
  const t = r.target;
  const url = reportTargetUrl(r);
  const created = Date.parse(r.createdAt);
  const done = resolvedText(r, now);
  return (
    <li className="flex flex-col gap-2.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={reasonTone(r.reason)}>
          <Flag className="size-3" aria-hidden="true" />
          {REPORT_REASON_LABEL[r.reason]}
        </Badge>
        <span className="text-xs font-medium text-muted">
          {REPORT_KIND_LABEL[r.kind]}
          {r.leagueName && r.kind !== 'league' ? ` · ${r.leagueName}` : ''}
        </span>
        {Number.isFinite(created) && (
          <time dateTime={r.createdAt} className="ml-auto text-xs text-muted">
            {relativeTime(created, now)}
          </time>
        )}
      </div>

      <div className="rounded-2xl bg-surface-2 px-4 py-3">
        {t ? (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t.title}</p>
              {t.text && <p className="line-clamp-3 text-sm break-words whitespace-pre-line text-fg/90">{t.text}</p>}
              {r.kind === 'league' && t.userName && <p className="truncate text-xs text-muted">Dueño: {t.userName}</p>}
            </div>
            {url && (
              <Link
                to={url}
                className="-m-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-accent transition hover:bg-accent-soft"
                aria-label={`Ver ${REPORT_KIND_LABEL[r.kind].toLowerCase()}: ${t.title}`}
                title="Ver"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Ya no existe (se borró).</p>
        )}
      </div>

      {r.note && <p className="text-sm break-words whitespace-pre-line">«{r.note}»</p>}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {showReporter && (
          <span>
            Lo reportó{' '}
            {r.reporterId ? (
              <Link to={`/superadmin/cuentas?u=${encodeURIComponent(r.reporterId)}`} className="font-medium text-accent hover:underline">
                {r.reporterName ?? 'una cuenta'}
              </Link>
            ) : (
              'una cuenta borrada'
            )}
          </span>
        )}
        {r.status === 'open' && r.sameTarget > 1 && <span className="font-medium text-warn">{r.sameTarget} reportes abiertos de esto</span>}
      </p>
      {done && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <CheckCircle2 className={cx('mt-px size-3.5 shrink-0', r.status === 'actioned' ? 'text-ok' : 'text-muted')} aria-hidden="true" />
          <span>
            {done}
            {r.actionNote ? `: «${r.actionNote}»` : ''}
          </span>
        </p>
      )}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}

/**
 * Descartar (con confirmación) y «Marcar como atendido» (con una nota de lo que se hizo) de un reporte abierto.
 * Cierra también los demás reportes abiertos de lo mismo.
 */
export function ResolveButtons({ report }: { report: Report }) {
  const { confirm, toast } = useFeedback();
  // Cuál se está guardando: la ruedita va en ese botón.
  const [busy, setBusy] = useState<'dismissed' | 'actioned' | null>(null);
  const [attending, setAttending] = useState(false);
  const [note, setNote] = useState('');

  async function run(status: 'dismissed' | 'actioned', text: string | null) {
    if (busy) return false;
    setBusy(status);
    try {
      await resolveReport(report.id, status, text);
      toast(resolvedToast(status));
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
    const ok = await confirm(dismissConfirm(report));
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
      <Button variant="soft" icon={<CheckCircle2 className="size-4" />} onClick={() => setAttending(true)} disabled={!!busy} className="h-11 rounded-full!">
        Marcar como atendido
      </Button>
      <Button variant="quiet" onClick={dismiss} loading={busy === 'dismissed'} disabled={!!busy} className="h-11 rounded-full!">
        Descartar
      </Button>
      <Sheet
        open={attending}
        onClose={() => setAttending(false)}
        title="Marcar como atendido"
        footer={
          <Button variant="primary" size="xl" className="w-full" icon={<CheckCircle2 className="size-5" />} loading={busy === 'actioned'} onClick={attend}>
            Listo
          </Button>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm">
            {ATTEND_NOTE_LABEL}
            <span className="text-muted">{attendNoteHint(report)}</span>
          </span>
          <Textarea
            rows={3}
            maxLength={REPORT_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, REPORT_NOTE_MAX))}
            placeholder={ATTEND_NOTE_PLACEHOLDER}
          />
        </label>
      </Sheet>
    </>
  );
}
