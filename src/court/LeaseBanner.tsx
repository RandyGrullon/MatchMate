import { useEffect, useState, type ReactNode } from 'react';
import { CloudOff, Loader2, Lock, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import { Button, Sheet, cx } from '../components/ui';
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
  // Pidiendo el turno: si tarda (señal lenta), una línea lo dice; los botones esperan apagados mientras tanto.
  const [slow, setSlow] = useState(false);
  const checking = lease.kind === 'checking';
  useEffect(() => {
    if (!checking) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
  }, [checking]);
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
  let tone: 'danger' | 'neutral' = 'neutral';
  if (checking && slow) {
    body = (
      <>
        <Loader2 className="size-5 shrink-0 animate-spin text-muted" />
        <span className="flex-1">Preparando la cancha…</span>
      </>
    );
  } else if (lease.kind === 'offline') {
    // Sin señal se sigue anotando: es un aviso tranquilo (el ámbar queda para «por confirmar»).
    body = (
      <>
        <CloudOff className="size-5 shrink-0 text-muted" />
        <span className="flex-1">
          Sin señal: sigue anotando. Todo queda en el teléfono y se envía solo al volver
          {unsent > 0 ? ` (${unsent} sin enviar)` : ''}.
        </span>
        {onClaim && (
          <Button size="md" variant="ghost" className="size-11 rounded-full" icon={<RefreshCw className="size-4" />} loading={busy} onClick={() => void claim(false)} aria-label="Probar otra vez" />
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
          <Button size="md" variant="danger" className="shrink-0 rounded-full" onClick={() => setConfirm(true)}>
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
          <Button size="md" variant="soft" className="shrink-0 rounded-full" loading={busy} onClick={() => void claim(false)}>
            Retomar
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      {conflict && (
        <div role="status" className={cx('flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-fg', className)}>
          <ShieldAlert className="size-5 shrink-0" />
          Se siguió con el marcador del otro teléfono. Tu lista quedó guardada aparte en este teléfono.
        </div>
      )}
      {body && (
        <div
          role="status"
          className={cx(
            'flex min-h-11 items-center gap-2.5 rounded-2xl py-1.5 pr-1.5 pl-4 text-sm',
            tone === 'danger' && 'bg-danger-soft text-danger',
            tone === 'neutral' && 'bg-surface-2 text-fg',
            className,
          )}
        >
          {body}
        </div>
      )}
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Tomar el control?"
        footer={
          <div className="flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="lg" className="flex-1" loading={busy} onClick={() => void claim(true)}>
              Sí, anoto yo
            </Button>
          </div>
        }
      >
        <p className="text-[15px]">
          {lease.kind === 'other' && lease.scorerName ? `${lease.scorerName} deja de anotar.` : 'El otro teléfono deja de anotar.'} Su lista se queda
          guardada en su teléfono y el partido sigue desde lo último que publicó.
        </p>
      </Sheet>
    </>
  );
}
