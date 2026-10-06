import { useState, type ReactNode } from 'react';
import { CloudOff, Lock, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import { Button, Modal, cx } from '../components/ui';
import type { MatchStatus } from '../lib/data/matches';
import type { LeaseState } from './machine';

const CLOSED: Record<MatchStatus, string> = {
  scheduled: 'El partido no ha empezado.',
  live: 'El partido está en vivo.',
  suspended: 'Partido suspendido. Se retoma pidiendo el turno otra vez.',
  finished: 'Resultado enviado. Falta que el rival lo confirme.',
  confirmed: 'Resultado confirmado.',
  disputed: 'El resultado está en disputa: decide el admin.',
  walkover: 'Partido por W.O.',
  void: 'Partido anulado.',
  postponed: 'Partido aplazado.',
};

/**
 * Quién anota este partido y qué pasa con lo de este teléfono: sin señal (se guarda y sale solo), otro anotador
 * tomó el control (la lista queda guardada), sin permiso o partido cerrado. El admin puede tomar el control
 * (con confirmación).
 */
export function LeaseBanner({
  lease,
  unsent,
  conflict,
  isAdmin,
  onClaim,
  className,
}: {
  lease: LeaseState;
  unsent: number;
  conflict?: boolean;
  isAdmin?: boolean;
  /** Pedir el turno otra vez (`force` = el admin se lo quita a otro). */
  onClaim?: (force: boolean) => Promise<unknown>;
  className?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const claim = async (force: boolean) => {
    if (!onClaim || busy) return;
    setBusy(true);
    try {
      await onClaim(force);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  let body: ReactNode = null;
  let tone: 'warn' | 'danger' | 'neutral' = 'neutral';
  if (lease.kind === 'offline') {
    tone = 'warn';
    body = (
      <>
        <CloudOff className="size-5 shrink-0" />
        <span className="flex-1">
          Sin señal: sigue anotando. Todo queda en el teléfono y se envía solo al volver
          {unsent > 0 ? ` (${unsent} sin enviar)` : ''}.
        </span>
        {onClaim && (
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={busy} onClick={() => void claim(false)} aria-label="Probar otra vez" />
        )}
      </>
    );
  } else if (lease.kind === 'other') {
    tone = 'danger';
    body = (
      <>
        <UserRound className="size-5 shrink-0" />
        <span className="flex-1">
          <b>Otro anotador tomó el control{lease.scorerName ? ` (${lease.scorerName})` : ''}.</b> Tu lista quedó guardada en este teléfono.
          {lease.expired ? ' Su teléfono no publica hace rato.' : ''} {isAdmin ? '' : 'Pídele al admin que te dé el control.'}
        </span>
        {isAdmin && onClaim && (
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
            Tomar el control
          </Button>
        )}
      </>
    );
  } else if (lease.kind === 'stale') {
    tone = 'danger';
    body = (
      <>
        <ShieldAlert className="size-5 shrink-0" />
        <span className="flex-1">Otro teléfono con tu cuenta va más adelante en este partido. Sigue anotando desde ese teléfono.</span>
      </>
    );
  } else if (lease.kind === 'denied') {
    tone = 'danger';
    body = (
      <>
        <Lock className="size-5 shrink-0" />
        <span className="flex-1">No puedes anotar este partido. Lo anota alguien de los equipos, el anotador o el admin.</span>
      </>
    );
  } else if (lease.kind === 'closed') {
    body = (
      <>
        <Lock className="size-5 shrink-0" />
        <span className="flex-1">{CLOSED[lease.status]}</span>
        {lease.status === 'suspended' && onClaim && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void claim(false)}>
            Retomar
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      {conflict && (
        <div role="status" className={cx('flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn', className)}>
          <ShieldAlert className="size-5 shrink-0" />
          Se siguió con el marcador del otro teléfono. Tu lista quedó guardada aparte en este teléfono.
        </div>
      )}
      {body && (
        <div
          role="status"
          className={cx(
            'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
            tone === 'warn' && 'bg-warn-soft text-warn',
            tone === 'danger' && 'bg-danger-soft text-danger',
            tone === 'neutral' && 'bg-surface-2 text-fg',
            className,
          )}
        >
          {body}
        </div>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Tomar el control?"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button variant="danger" loading={busy} onClick={() => void claim(true)}>
              Sí, anoto yo
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {lease.kind === 'other' && lease.scorerName ? `${lease.scorerName} deja de anotar.` : 'El otro teléfono deja de anotar.'} Su lista se queda
          guardada en su teléfono y el partido sigue desde lo último que publicó.
        </p>
      </Modal>
    </>
  );
}
