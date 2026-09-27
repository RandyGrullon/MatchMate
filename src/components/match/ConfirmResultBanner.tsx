import { useState } from 'react';
import { CheckCircle2, Hourglass, MessageSquareWarning } from 'lucide-react';
import { canConfirm, canDispute, confirmResult, disputeResult, type Match } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { useAction } from '../feedback';
import { Button, Card, Field, Modal, cx } from '../ui';
import { autoConfirmText, flipScoreText, sideName } from './format';

/**
 * Resultado por confirmar. Al rival (o al admin): «Ana / Luis anotó 6-4 6-3. ¿Está bien?» con Confirmar y
 * «No es así» (reclamo con nota, dentro de las 48 h). A quien lo propuso: «Esperando que el rival confirme».
 * A las 48 h cuenta solo (se calcula al leer). Funciona sin señal (va por la cola).
 */
export function ConfirmResultBanner({
  lid,
  match: m,
  mySide,
  isAdmin,
  now = Date.now(),
  className,
}: {
  lid: string;
  match: Match;
  mySide: Side | null;
  isAdmin?: boolean;
  now?: number;
  className?: string;
}) {
  const run = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (m.status !== 'finished') return null;
  const confirmable = canConfirm(m, mySide, !!isAdmin);
  const disputable = canDispute(m, mySide, now);
  const mine = mySide !== null && mySide === m.proposedSide;
  if (!confirmable && !mine) return null;

  const proposer = m.proposedSide ? sideName(m.sides[m.proposedSide - 1]) : 'El anotador';
  // El marcador visto desde quien lo lee: su lado primero.
  const text = typeof m.score?.text === 'string' ? (mySide === 2 ? flipScoreText(m.score.text) : m.score.text) : '';
  const left = autoConfirmText(m, now);

  const confirm = async () => {
    setBusy(true);
    await run(() => confirmResult(lid, m.id), 'Resultado confirmado');
    setBusy(false);
  };
  const dispute = async () => {
    setBusy(true);
    const ok = await run(async () => {
      await disputeResult(lid, m.id, note);
      return true;
    }, 'Reclamo enviado: decide el admin');
    setBusy(false);
    if (ok !== undefined) setOpen(false);
  };

  return (
    <Card className={cx('flex flex-col gap-3 border-warn/50 bg-warn-soft/40 p-4', className)}>
      {mine && !confirmable ? (
        <div className="flex items-start gap-3">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-warn" />
          <div className="text-sm">
            <p className="font-medium">Esperando que el rival confirme {text && <span className="tabular-nums">({text})</span>}</p>
            {left && <p className="text-muted">{left}.</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-warn" />
            <div className="text-sm">
              <p className="font-medium">
                {proposer} anotó <span className="tabular-nums">{text || 'el resultado'}</span>. ¿Está bien?
              </p>
              {left && <p className="text-muted">{left} si nadie reclama.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" className="h-11 flex-1" loading={busy} onClick={() => void confirm()} icon={<CheckCircle2 className="size-5" />}>
              Confirmar
            </Button>
            {disputable && (
              <Button className="h-11 flex-1" disabled={busy} onClick={() => setOpen(true)}>
                No es así
              </Button>
            )}
          </div>
        </>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Qué pasó?"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="danger" loading={busy} onClick={() => void dispute()}>
              Enviar reclamo
            </Button>
          </>
        }
      >
        <Field label="Cuéntale al admin (opcional)" hint="Ejemplo: fue 6-4 4-6 10-8.">
          <textarea
            className="min-h-24 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </Modal>
    </Card>
  );
}
