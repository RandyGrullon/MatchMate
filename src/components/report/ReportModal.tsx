import { useState } from 'react';
import { Link } from 'react-router';
import { Flag } from 'lucide-react';
import { REPORT_KIND_THIS, REPORT_NOTE_MAX, REPORT_REASONS, reportContent, reportErrorText, type ReportKind, type ReportReason } from '../../lib/data/reports';
import { TERMS_PATH } from '../../pages/legal/legal';
import { useFeedback } from '../feedback';
import { Button, Modal, Textarea, cx } from '../ui';

/**
 * El modal de «Reportar»: el motivo (obligatorio), una nota opcional y a quién le llega. Lo revisa el equipo de
 * MatchMate y, si es un comentario, un aviso o un juego de una liga, sus admins (sin saber quién reportó; el admin del
 * que es lo reportado no lo ve). Reportar lo mismo otra vez no crea otro.
 */
export default function ReportModal({ kind, targetId, onClose }: { kind: ReportKind; targetId: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inLeague = kind === 'comment' || kind === 'game' || kind === 'announcement';

  async function send() {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reportContent({ kind, targetId, reason, note });
      toast('Gracias. Lo vamos a revisar.');
      onClose();
    } catch (e) {
      console.error(e);
      setError(reportErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reportar ${REPORT_KIND_THIS[kind]}`}
      footer={
        <>
          <Button onClick={onClose} className="max-sm:h-11">
            Cancelar
          </Button>
          <Button variant="primary" icon={<Flag className="size-4" />} loading={busy} disabled={!reason} onClick={send} className="max-sm:h-11">
            Enviar reporte
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">¿Qué pasa?</legend>
          {REPORT_REASONS.map((r) => (
            <label
              key={r.key}
              className={cx(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
                reason === r.key ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="mm-report-reason"
                value={r.key}
                checked={reason === r.key}
                onChange={() => setReason(r.key)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Nota <span className="font-normal text-muted">(opcional)</span>
          </span>
          <Textarea
            rows={3}
            maxLength={REPORT_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, REPORT_NOTE_MAX))}
            placeholder="Cuéntanos qué viste, si hace falta."
          />
          <span className={cx('self-end text-xs tabular-nums', note.length >= REPORT_NOTE_MAX ? 'text-warn' : 'text-muted')}>
            {note.length}/{REPORT_NOTE_MAX}
          </span>
        </label>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <p className="text-xs text-muted">
          Lo revisa el equipo de MatchMate{inLeague ? ' y los admins de la liga (sin saber quién lo reportó)' : ''}. La persona reportada no sabe
          que fuiste tú. Mira lo que no se permite en los{' '}
          <Link to={TERMS_PATH} className="font-medium text-accent underline underline-offset-2">
            Términos de uso
          </Link>
          .
        </p>
      </form>
    </Modal>
  );
}
