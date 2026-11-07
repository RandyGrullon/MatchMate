import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Inbox, MessageSquareText, UserCheck, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { CLAIM_NOTE_MAX, decideClaim, fetchClaimConflicts, useLeagueClaims, type PlayerClaim } from '../../lib/data/claims';
import { useLeagueMembers, useUsers } from '../../lib/data/members';
import { useLeagueCtx } from '../../lib/league';
import { Avatar } from '../Avatar';
import { useFeedback } from '../feedback';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Modal, Textarea, cx } from '../ui';
import { usePlayerHistory } from './data';
import { ago, historyText, statusLabel } from './logic';
import { CLAIM_CONFLICT_HELP, claimAccounts, claimMeta, conflictsProblem, decideCopy, decideDoneText, decideProblem, ownPlayerOf, type ClaimAccount, type DecideProblem } from './panel';

/**
 * Admin › Reclamos (todas las ligas, todos los deportes): quien se hizo una cuenta y dice «ese soy yo» de un
 * jugador que el admin anotó sin cuenta. El dueño o un admin lo aprueba (los dos jugadores se juntan en uno: juegos,
 * partidos, tarjetas…) o lo rechaza (sigue con su propio jugador). Pendientes arriba, el más viejo primero.
 */
export function ClaimsPanel() {
  const { lid } = useLeagueCtx();
  const { isSuper } = useAuth();
  const claims = useLeagueClaims(lid);
  const members = useLeagueMembers(lid);
  // Los correos solo los puede leer el superadmin (profiles); los demás ven el nombre de la cuenta.
  const users = useUsers(isSuper);
  const [showDone, setShowDone] = useState(false);
  const pending = claims.data.filter((c) => c.status === 'pending');
  const done = claims.data.filter((c) => c.status !== 'pending');
  const account = useMemo(() => claimAccounts(members.data, users.data), [members.data, users.data]);

  if (claims.error) return <LoadError error={claims.error} />;
  if (claims.loading && !claims.data.length) return <ListSkeleton rows={3} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Cuando alguien se une y dice «ese soy yo» de un jugador que anotaste sin cuenta, sale aquí. Al aprobar, su cuenta queda con ese
        jugador y todo lo que jugó.
      </p>
      {pending.length === 0 ? (
        <Empty icon={<Inbox className="size-6" />} title="No hay reclamos por decidir">
          Si alguien pide ser uno de tus jugadores, te avisamos en la campana.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((c) => (
            <li key={c.id}>
              <PendingClaim lid={lid} claim={c} account={account.get(c.userId) ?? null} />
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex h-11 items-center gap-2 self-start rounded-xl px-2 text-sm font-medium text-muted transition hover:bg-surface-2"
          >
            <ChevronDown className={cx('size-4 transition', showDone && 'rotate-180')} /> Ya decididos ({done.length})
          </button>
          {showDone && (
            <Card className="divide-y divide-line">
              {done.map((c) => {
                const s = statusLabel(c);
                return (
                  <div key={c.id} className="flex items-start gap-3 p-3 text-sm">
                    <Avatar name={c.claimantName} className="size-8 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words">
                        <span className="font-medium">{c.claimantName}</span> <span className="text-muted">pidió ser</span>{' '}
                        <span className="font-medium">{c.playerName}</span>
                      </p>
                      {c.decisionNote && <p className="mt-0.5 break-words text-xs text-muted">«{c.decisionNote}»</p>}
                      <p className="text-xs text-muted">{ago(c.decidedAt ?? c.changedAt)}</p>
                    </div>
                    <Badge tone={s.tone}>{s.text}</Badge>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function PendingClaim({ lid, claim: c, account }: { lid: string; claim: PlayerClaim; account: ClaimAccount | null }) {
  const claimed = usePlayerHistory(lid, c.playerId);
  const ownPlayer = ownPlayerOf(c, account);
  const own = usePlayerHistory(lid, ownPlayer);
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Avatar name={c.claimantName} className="size-10 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="break-words">
            <span className="font-semibold">{c.claimantName}</span> <span className="text-muted">dice que es</span>{' '}
            <span className="font-semibold text-accent">{c.playerName}</span>
          </p>
          <p className="text-xs break-words text-muted">{claimMeta(c, account)}</p>
        </div>
        <Badge tone="warn">Por aprobar</Badge>
      </div>

      <dl className="grid gap-2 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">{c.playerName} (sin cuenta)</dt>
          <dd>{claimed.data ? historyText(claimed.data) : '…'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Lo que ya jugó con su cuenta</dt>
          <dd>{!ownPlayer ? 'Nada todavía' : own.data ? historyText(own.data) : '…'}</dd>
        </div>
      </dl>

      {c.note && (
        <p className="flex items-start gap-2 text-sm break-words">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <span>«{c.note}»</span>
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1 sm:flex-none" icon={<Check className="size-4" />} onClick={() => setDeciding('approve')}>
          Aprobar
        </Button>
        <Button className="flex-1 sm:flex-none" icon={<X className="size-4" />} onClick={() => setDeciding('reject')}>
          Rechazar
        </Button>
      </div>

      <DecideModal lid={lid} claim={c} mode={deciding} onClose={() => setDeciding(null)} />
    </Card>
  );
}

function DecideModal({ lid, claim: c, mode, onClose }: { lid: string; claim: PlayerClaim; mode: 'approve' | 'reject' | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<DecideProblem | null>(null);
  const approve = mode === 'approve';
  const copy = decideCopy(c, approve);

  const close = () => {
    if (busy) return;
    setProblem(null);
    setNote('');
    onClose();
  };

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setProblem(null);
    try {
      if (approve) {
        // Antes de aprobar: si los dos jugaron lo mismo, no se pueden juntar (se explica y no se toca nada).
        const conflicts = conflictsProblem(await fetchClaimConflicts(c.id));
        if (conflicts) {
          setProblem(conflicts);
          return;
        }
      }
      const status = await decideClaim(lid, c.id, approve, note);
      toast(decideDoneText(c, approve, status));
      setNote('');
      onClose();
    } catch (e) {
      console.error(e);
      setProblem(decideProblem(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!mode}
      onClose={close}
      title={copy.title}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={approve ? 'primary' : 'danger'}
            loading={busy}
            icon={approve ? <UserCheck className="size-4" /> : <X className="size-4" />}
            onClick={() => void submit()}
          >
            {copy.confirmText}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>{copy.message}</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{copy.noteLabel}</span>
          <Textarea
            value={note}
            maxLength={CLAIM_NOTE_MAX}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.placeholder}
          />
        </label>
        {problem && (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p>{problem.text}</p>
              {problem.list && (
                <>
                  <ul className="mt-1 list-disc pl-5">
                    {problem.list.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <p className="mt-1">{CLAIM_CONFLICT_HELP}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
