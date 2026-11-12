import { useMemo, useState } from 'react';
import { Clock, Search, UserX, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { cancelClaim, claimErrorText, useMyClaim } from '../../lib/data/claims';
import { usePlayers } from '../../lib/data/players';
import { useLeagueCtx } from '../../lib/league';
import { leagueSport } from '../../sports/registry';
import { useFeedback } from '../feedback';
import { peopleWord } from '../league/logic';
import { WhoAreYouList, type WhoChoice } from '../league/WhoAreYou';
import { Button, Card, Modal } from '../ui';
import {
  CLAIM_CANCELLED_TEXT,
  claimableFree,
  loadDismissed,
  pendingCopy,
  pickConfirmText,
  rejectedCopy,
  saveDismissed,
  searchCopy,
  withDismissed,
} from './banner';
import { ClaimRequestModal } from './ClaimPlayerButton';
import { usePlayerHistory, useRefreshWhilePending } from './data';
import { bannerState } from './logic';

/**
 * En el inicio de la liga, para los miembros: «Mi reclamo» (pendiente, con «Cancelar pedido»; o rechazado, con la
 * nota del admin) o, si su jugador todavía no tiene nada y hay jugadores sin cuenta, «¿Ya jugabas en esta liga?
 * Busca tu nombre» (elige uno de la lista y lo pide; el admin lo aprueba).
 */
export function ClaimBanner() {
  const { lid, member, myPlayerId, league } = useLeagueCtx();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { toast } = useFeedback();
  const claim = useMyClaim(member ? lid : null, uid);
  const players = usePlayers(member ? lid : undefined);
  const own = usePlayerHistory(member ? lid : null, myPlayerId);
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<WhoChoice>(null);
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const people = peopleWord(leagueSport(league));
  const free = useMemo(() => claimableFree(players.data, myPlayerId), [players.data, myPlayerId]);
  const state = bannerState({
    claim: claim.data,
    ownHistory: own.data,
    freeCount: free.length,
    dismissed: (k) => dismissed.has(`${lid}:${k}`),
  });
  useRefreshWhilePending(state.kind === 'pending');

  if (!member || !uid) return null;

  const dismiss = (k: string) => {
    const next = withDismissed(dismissed, lid, k);
    saveDismissed(next);
    setDismissed(next);
  };

  const picked = free.find((p) => p.id === choice) ?? null;
  const picker = (
    <>
      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Busca tu nombre"
        footer={
          <>
            <Button onClick={() => setPicking(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                setPicking(false);
                if (picked) setAsking({ id: picked.id, name: picked.name });
                else dismiss('buscar');
              }}
            >
              {pickConfirmText(picked)}
            </Button>
          </>
        }
      >
        <WhoAreYouList players={free} value={choice} onChange={setChoice} people={people} />
      </Modal>
      {asking && <ClaimRequestModal open onClose={() => setAsking(null)} player={asking} />}
    </>
  );

  if (state.kind === 'pending') {
    const cancel = async () => {
      setBusy(true);
      try {
        await cancelClaim(lid, state.claim.id);
        toast(CLAIM_CANCELLED_TEXT);
      } catch (e) {
        toast(claimErrorText(e), 'error');
      } finally {
        setBusy(false);
      }
    };
    const copy = pendingCopy(state.claim);
    return (
      <Card className="flex flex-col gap-3 border-warn/40 p-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn" aria-hidden="true">
          <Clock className="size-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{copy.title}</p>
          <p className="break-words text-muted">{copy.text}</p>
        </div>
        <Button size="sm" loading={busy} onClick={() => void cancel()} className="self-start sm:self-center">
          Cancelar pedido
        </Button>
      </Card>
    );
  }

  if (state.kind === 'rejected') {
    const c = state.claim;
    const copy = rejectedCopy(c);
    return (
      <Card className="relative flex flex-col gap-3 p-4 pr-12 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden="true">
          <UserX className="size-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{copy.title}</p>
          <p className="break-words text-muted">{copy.text}</p>
        </div>
        {free.length > 0 && (
          <Button size="sm" icon={<Search className="size-4" />} onClick={() => setPicking(true)} className="self-start sm:self-center">
            Buscar otra vez
          </Button>
        )}
        <DismissButton onClick={() => dismiss(`rechazo:${c.id}`)} />
        {picker}
      </Card>
    );
  }

  if (state.kind !== 'search') return null;

  const copy = searchCopy(people);
  return (
    <Card className="relative flex flex-col gap-3 p-4 pr-12 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
        <Search className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{copy.title}</p>
        <p className="text-muted">{copy.text}</p>
      </div>
      <Button size="sm" variant="primary" icon={<Search className="size-4" />} onClick={() => setPicking(true)} className="self-start sm:self-center">
        Buscar mi nombre
      </Button>
      <DismissButton onClick={() => dismiss('buscar')} />
      {picker}
    </Card>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      title="Cerrar"
      className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2"
    >
      <X className="size-4" />
    </button>
  );
}
