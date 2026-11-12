import { useState } from 'react';
import { Clock, UserCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { CLAIM_NOTE_MAX, cancelClaim, claimErrorText, requestClaim, useMyClaim } from '../../lib/data/claims';
import { useLeagueCtx } from '../../lib/league';
import type { Player } from '../../lib/types';
import { useFeedback } from '../feedback';
import { Badge, Button, Modal, Textarea, cx } from '../ui';
import { CLAIM_CANCELLED_TEXT, claimRequestCopy, claimRequestDoneText } from './banner';

type ClaimablePlayer = Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'uid' | 'isMinor'>>;

/** Se puede pedir: sin cuenta, no es menor y no es el jugador propio. */
export const isClaimable = (p: ClaimablePlayer, myPlayerId: string | null) => !p.uid && !p.isMinor && p.id !== myPlayerId;

/**
 * Pide ser ese jugador (y deja la nota). El dueño o un admin de la liga lo aprueba; si quien pide es admin, queda
 * aprobado al momento. Devuelve true si se pidió.
 */
export function ClaimRequestModal({
  open,
  onClose,
  player,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  player: Pick<Player, 'id' | 'name'>;
  onDone?: () => void;
}) {
  const { lid, isAdmin } = useLeagueCtx();
  const { toast } = useFeedback();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = claimRequestCopy(player.name, isAdmin);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await requestClaim(lid, player.id, note);
      toast(claimRequestDoneText(player.name, isAdmin));
      setNote('');
      onDone?.();
      onClose();
    } catch (e) {
      console.error(e);
      setError(claimErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={copy.title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} icon={<UserCheck className="size-4" />} onClick={() => void send()}>
            {copy.confirmText}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>{copy.message}</p>
        {!isAdmin && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{copy.noteLabel}</span>
            <Textarea
              value={note}
              maxLength={CLAIM_NOTE_MAX}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder={copy.notePlaceholder}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * «¿Eres tú? Reclamar» en un jugador sin cuenta (miembros con sesión). Si ya lo pidió: «Pendiente de aprobación»
 * y «Cancelar pedido». No sale para menores, jugadores con cuenta ni quien no es miembro de la liga.
 */
export function ClaimPlayerButton({ player, className }: { player: ClaimablePlayer; className?: string }) {
  const { lid, member, myPlayerId } = useLeagueCtx();
  const { user } = useAuth();
  const { toast } = useFeedback();
  const mine = useMyClaim(lid, user?.uid ?? null).data;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || !member || !isClaimable(player, myPlayerId)) return null;

  if (mine?.status === 'pending' && mine.playerId === player.id) {
    const cancel = async () => {
      setBusy(true);
      try {
        await cancelClaim(lid, mine.id);
        toast(CLAIM_CANCELLED_TEXT);
      } catch (e) {
        toast(claimErrorText(e), 'error');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className={cx('flex flex-wrap items-center justify-center gap-2 sm:justify-start', className)}>
        <Badge tone="warn">
          <Clock className="size-3.5" aria-hidden="true" /> Pendiente de aprobación
        </Badge>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void cancel()}>
          Cancelar pedido
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button icon={<UserCheck className="size-4" />} onClick={() => setOpen(true)} className={cx('w-full sm:w-auto', className)}>
        ¿Eres tú? Reclamar
      </Button>
      <ClaimRequestModal open={open} onClose={() => setOpen(false)} player={player} />
    </>
  );
}
