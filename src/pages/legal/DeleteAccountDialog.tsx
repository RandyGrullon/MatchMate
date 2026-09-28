import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Crown, Download, Trash2, UserX } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { deleteLeague, useOutboxSnapshot } from '../../lib/data';
import { transferLeague } from '../../lib/data/admin';
import { sportMeta } from '../../sports/registry';
import { accountErrorMessage, DELETE_WORD, deleteMyAccount, downloadMyData, fetchDeletePlan, type DeletePlan, type DeletePlanLeague } from './account';
import { PRIVACY_PATH } from './legal';

/**
 * «Borrar mi cuenta», paso a paso:
 * 1. Revisa si se puede (prepare_delete_account). Si tiene ligas a su nombre, las pasa a otro miembro o las borra
 *    aquí mismo; si es el único superadmin, le dice que nombre a otro.
 * 2. Muestra qué se borra y qué se queda, ofrece bajar sus datos antes y pide escribir BORRAR.
 * 3. Borra (Edge Function delete-account) y limpia el teléfono. `onDeleting` avisa justo antes (la pantalla de
 *    atrás no manda al login al cerrarse la sesión) y `onDeleted` al terminar.
 */
export default function DeleteAccountDialog({
  open,
  onClose,
  onDeleting,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onDeleting?: (deleting: boolean) => void;
  onDeleted: () => void;
}) {
  const auth = useAuth();
  const { toast } = useFeedback();
  const outbox = useOutboxSnapshot();
  const [plan, setPlan] = useState<DeletePlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const wordId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPlan(await fetchDeletePlan());
    } catch (e) {
      setLoadError(accountErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setWord('');
    setError(null);
    setPlan(null);
    void load();
  }, [open, load]);

  const uid = auth.user?.uid;
  const ready = !!plan?.canDelete;
  const confirmed = word.trim().toUpperCase() === DELETE_WORD;

  async function remove() {
    if (!uid || !ready || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    onDeleting?.(true);
    try {
      await deleteMyAccount(uid);
      onDeleted();
    } catch (e) {
      onDeleting?.(false);
      setError(accountErrorMessage(e));
      // Algo cambió (p. ej. justo le pasaron una liga): se revisa otra vez.
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function exportFirst() {
    setExporting(true);
    try {
      const name = await downloadMyData();
      toast(`Listo: ${name}`);
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={
        <span className="flex items-center gap-2">
          <UserX className="size-5 text-danger" aria-hidden="true" /> Borrar mi cuenta
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy} className="max-sm:h-11">
            {ready ? 'Cancelar' : 'Cerrar'}
          </Button>
          {ready && (
            <Button variant="danger" onClick={remove} loading={busy} disabled={!confirmed} icon={<Trash2 className="size-4" />} className="max-sm:h-11">
              Borrar mi cuenta para siempre
            </Button>
          )}
        </>
      }
    >
      {loading && !plan ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <Spinner /> Revisando tu cuenta…
        </div>
      ) : loadError && !plan ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{loadError}</p>
          <Button onClick={() => void load()} className="max-sm:h-11">
            Intentar de nuevo
          </Button>
        </div>
      ) : plan ? (
        <div className="flex flex-col gap-4 text-sm">
          {plan.ownedLeagues.length > 0 && <OwnedLeagues plan={plan} onChanged={load} myUid={uid ?? ''} />}
          {plan.blockers.includes('last_superadmin') && (
            <Card className="flex gap-3 border-warn/40 p-4">
              <Crown className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
              <div className="flex flex-col gap-2">
                <p className="font-semibold">Eres el único superadmin</p>
                <p className="text-muted">Si borras tu cuenta, nadie podría manejar la app. Primero nombra a otro superadmin desde la consola.</p>
                <Link to="/superadmin/cuentas" onClick={onClose} className="inline-flex min-h-11 items-center font-medium text-accent">
                  Ir a Cuentas en la consola
                </Link>
              </div>
            </Card>
          )}

          {ready && (
            <>
              <div className="flex gap-3 rounded-xl bg-danger-soft px-3 py-3 text-danger">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p>Esto no se puede deshacer. Si después quieres volver, tendrías que crear una cuenta nueva.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 font-semibold">Se borra</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
                    <li>Tu cuenta, tu nombre y tu correo.</li>
                    <li>
                      Tu lugar en {plan.summary.leagues === 1 ? '1 liga' : `${plan.summary.leagues} ligas`} (sales de todas).
                    </li>
                    {plan.summary.comments + plan.summary.reactions > 0 && (
                      <li>
                        {plan.summary.comments} {plan.summary.comments === 1 ? 'comentario' : 'comentarios'} y {plan.summary.reactions}{' '}
                        {plan.summary.reactions === 1 ? 'reacción' : 'reacciones'}.
                      </li>
                    )}
                    <li>Los avisos en tus teléfonos{plan.summary.devices ? ` (${plan.summary.devices})` : ''}.</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 font-semibold">Se queda en las ligas</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
                    <li>
                      Tus resultados, a nombre de tu jugador pero sin cuenta
                      {plan.summary.players ? ` (${plan.summary.players === 1 ? '1 jugador' : `${plan.summary.players} jugadores`})` : ''}: son parte de
                      las tablas.
                    </li>
                    <li>
                      Si quieres que los borren, pídeselo al admin de cada liga.{' '}
                      <Link to={`${PRIVACY_PATH}#tiempo`} onClick={onClose} className="font-medium text-accent">
                        Más detalles
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
              {outbox.pendingCount + outbox.failed.length > 0 && (
                <p className="rounded-xl bg-warn-soft px-3 py-2.5 text-warn">
                  Este teléfono tiene {outbox.pendingCount + outbox.failed.length}{' '}
                  {outbox.pendingCount + outbox.failed.length === 1 ? 'cambio sin enviar' : 'cambios sin enviar'}. Si borras la cuenta, se pierden.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button icon={<Download className="size-4" />} loading={exporting} onClick={exportFirst} className="max-sm:h-11">
                  Descargar mis datos antes
                </Button>
              </div>
              <Field label={`Para confirmar, escribe ${DELETE_WORD}`}>
                <Input
                  id={wordId}
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={DELETE_WORD}
                  disabled={busy}
                  className="max-sm:h-11"
                />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

/** Las ligas a su nombre: pasarlas a otro miembro o borrarlas, una por una. */
function OwnedLeagues({ plan, onChanged, myUid }: { plan: DeletePlan; onChanged: () => Promise<void> | void; myUid: string }) {
  const n = plan.ownedLeagues.length;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">Primero, {n === 1 ? 'tu liga' : `tus ${n} ligas`}</p>
        <p className="text-muted">
          {n === 1 ? 'Esta liga está' : 'Estas ligas están'} a tu nombre. Pásala a otro miembro (tú quedas de admin hasta borrar la cuenta) o bórrala
          con todo lo que tiene.
        </p>
      </div>
      {plan.ownedLeagues.map((l) => (
        <OwnedLeague key={l.id} league={l} onChanged={onChanged} myUid={myUid} />
      ))}
    </div>
  );
}

function OwnedLeague({ league, onChanged, myUid }: { league: DeletePlanLeague; onChanged: () => Promise<void> | void; myUid: string }) {
  const { confirm, toast } = useFeedback();
  const [to, setTo] = useState(league.members[0]?.userId ?? '');
  const [busy, setBusy] = useState<'pasar' | 'borrar' | null>(null);
  const selectId = useId();
  const sport = sportMeta(league.sport)?.label ?? league.sport;
  const target = league.members.find((m) => m.userId === to);

  async function transfer() {
    if (!target) return;
    const ok = await confirm({
      title: `¿Pasar «${league.name}» a ${target.name}?`,
      message: `${target.name} queda como dueño o dueña de la liga. Tú quedas como admin hasta que borres tu cuenta.`,
      confirmText: 'Pasar la liga',
    });
    if (!ok) return;
    setBusy('pasar');
    try {
      await transferLeague(league.id, target.userId);
      toast(`«${league.name}» ahora es de ${target.name}`);
      await onChanged();
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Borrar «${league.name}» para siempre?`,
      message: 'Se borran sus eventos, juegos, partidos, jugadores y fotos, para todos sus miembros. No se puede deshacer.',
      confirmText: 'Borrar la liga',
      danger: true,
    });
    if (!ok) return;
    setBusy('borrar');
    try {
      await deleteLeague(league.id, myUid);
      toast(`Se borró «${league.name}»`);
      await onChanged();
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{league.name}</p>
        <Badge>{league.kind === 'torneo' ? `Torneo · ${sport}` : sport}</Badge>
      </div>
      {league.members.length ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Pasarla a" className="flex-1">
            <Select id={selectId} value={to} onChange={(e) => setTo(e.target.value)} disabled={!!busy} className="max-sm:h-11">
              {league.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.role === 'admin' ? ' (admin)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" icon={<ArrowRightLeft className="size-4" />} onClick={transfer} loading={busy === 'pasar'} disabled={!!busy || !target} className="max-sm:h-11">
            Pasar
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> Solo estás tú en esta liga: puedes borrarla sin afectar a nadie.
        </p>
      )}
      {league.memberCount > league.members.length && (
        <p className="text-xs text-muted">
          Se ven {league.members.length} de {league.memberCount} miembros (los admins primero). Si no ves a la persona, hazla admin en la liga y vuelve aquí.
        </p>
      )}
      <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={remove} loading={busy === 'borrar'} disabled={!!busy} className="self-start text-danger max-sm:h-11">
        Borrar la liga
      </Button>
    </Card>
  );
}
