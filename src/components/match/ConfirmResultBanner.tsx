import { useState } from 'react';
import { Check } from 'lucide-react';
import { canConfirm, canDispute, confirmResult, disputeResult, type Match } from '../../lib/data/matches';
import type { Side } from '../../sports/types';
import { useAction } from '../feedback';
import { Button, Card, Field, Sheet, Textarea, cx } from '../ui';
import { autoConfirmText, flipScoreText, sideName } from './format';

/**
 * Resultado por confirmar (rediseño: una tarjeta con «● Por confirmar» en ámbar, como «Por aprobar» del boliche). Al
 * rival (o al admin): «Ana / Luis anotó 6-4 6-3. ¿Está bien?» con «No es así» (reclamo con nota, dentro de las 48 h) y
 * Confirmar. A quien lo propuso: «Esperando al rival». A las 48 h cuenta solo (se calcula al leer). Funciona sin señal
 * (va por la cola).
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
  const waiting = mine && !confirmable;

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
    <Card className={cx('px-[18px] pt-4 pb-[18px]', className)}>
      <p className="inline-flex items-center gap-2 text-sm font-[650] text-warn">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn" />
        {waiting ? 'Esperando al rival' : 'Por confirmar'}
      </p>
      {waiting ? (
        <p className="mt-2 text-body">
          Anotaste <b className="num font-[650]">{text || 'el resultado'}</b>. Falta que el rival lo confirme.
        </p>
      ) : (
        <p className="mt-2 text-body">
          {proposer} anotó <b className="num font-[650]">{text || 'el resultado'}</b>. ¿Está bien?
        </p>
      )}
      {left && <p className="mt-0.5 text-[13px] text-muted">{waiting ? `${left}.` : `${left} si nadie reclama.`}</p>}
      {!waiting && (
        <div className="mt-4 flex gap-2.5">
          {disputable && (
            <Button variant="quiet" size="lg" className="flex-1" disabled={busy} onClick={() => setOpen(true)}>
              No es así
            </Button>
          )}
          <Button variant="primary" size="lg" className="flex-1" loading={busy} onClick={() => void confirm()} icon={<Check className="size-5" strokeWidth={2.6} />}>
            Confirmar
          </Button>
        </div>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="¿Qué pasó?"
        subtitle="El admin decide con lo que le cuentes"
        footer={
          <div className="flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="lg" className="flex-1" loading={busy} onClick={() => void dispute()}>
              Enviar reclamo
            </Button>
          </div>
        }
      >
        <Field label="Cuéntale al admin (opcional)" hint="Ejemplo: fue 6-4 4-6 10-8.">
          <Textarea className="min-h-24" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Sheet>
    </Card>
  );
}
