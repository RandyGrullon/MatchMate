import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Crown, Download, Trash2 } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { BusyIcon } from '../../components/busy';
import { BigField, BigInput, BigSelect, ErrorNote } from '../../components/cuenta/kit';
import { LeagueTile } from '../../components/ligas/LigasRows';
import { Button, Sheet, Spinner } from '../../components/ui';
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
    // Hoja desde abajo (en la computadora, un cuadro en el centro), como las demás del rediseño. Mientras borra no se
    // cierra.
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Borrar mi cuenta"
      subtitle={ready ? 'Esto no se puede deshacer' : undefined}
      footer={
        ready ? (
          <Button variant="danger" size="xl" onClick={remove} loading={busy} disabled={!confirmed} icon={<Trash2 className="size-5" />} className="w-full">
            Borrar mi cuenta para siempre
          </Button>
        ) : (
          <Button variant="quiet" size="xl" onClick={onClose} className="w-full">
            Cerrar
          </Button>
        )
      }
    >
      {loading && !plan ? (
        <div className="flex items-center gap-2.5 py-8 text-meta text-muted" role="status">
          <Spinner /> Revisando tu cuenta…
        </div>
      ) : loadError && !plan ? (
        <div className="flex flex-col gap-4 py-2">
          <ErrorNote>{loadError}</ErrorNote>
          <Button variant="quiet" size="lg" onClick={() => void load()} className="w-full">
            Intentar de nuevo
          </Button>
        </div>
      ) : plan ? (
        <div className="flex flex-col gap-5 pt-1 text-meta">
          {plan.ownedLeagues.length > 0 && <OwnedLeagues plan={plan} onChanged={load} myUid={uid ?? ''} />}
          {plan.blockers.includes('last_superadmin') && (
            <div className="flex gap-3.5 rounded-2xl bg-warn-soft p-4">
              <Crown className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-semibold text-fg">Eres el único superadmin</p>
                <p className="text-fg-2">Si borras tu cuenta, nadie podría manejar la app. Primero nombra a otro superadmin.</p>
                <Link to="/superadmin/cuentas" onClick={onClose} className="inline-flex min-h-11 items-center font-semibold text-accent">
                  Ir a Cuentas en la consola
                </Link>
              </div>
            </div>
          )}

          {ready && (
            <>
              <div className="flex gap-3 rounded-2xl bg-danger-soft px-4 py-3.5 text-danger">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p>Si después quieres volver, tendrías que crear una cuenta nueva.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 font-semibold">Se borra</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-2 marker:text-faint">
                    <li>Tu cuenta, tu nombre y tu correo.</li>
                    <li>Tu lugar en {plan.summary.leagues === 1 ? '1 liga' : `${plan.summary.leagues} ligas`} (sales de todas).</li>
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
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-2 marker:text-faint">
                    <li>
                      Tus resultados, a nombre de tu jugador pero sin cuenta
                      {plan.summary.players ? ` (${plan.summary.players === 1 ? '1 jugador' : `${plan.summary.players} jugadores`})` : ''}: son parte de
                      las tablas.
                    </li>
                    <li>
                      Si quieres que los borren, pídeselo al admin de cada liga.{' '}
                      <Link to={`${PRIVACY_PATH}#tiempo`} onClick={onClose} className="font-semibold text-accent">
                        Más detalles
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
              {outbox.pendingCount + outbox.failed.length > 0 && (
                <p className="rounded-2xl bg-warn-soft px-4 py-3 text-warn">
                  Este teléfono tiene {outbox.pendingCount + outbox.failed.length}{' '}
                  {outbox.pendingCount + outbox.failed.length === 1 ? 'cambio sin enviar' : 'cambios sin enviar'}. Si borras la cuenta, se pierden.
                </p>
              )}
              <Button variant="quiet" size="lg" icon={<Download className="size-5" />} loading={exporting} onClick={exportFirst} className="w-full">
                Descargar mis datos antes
              </Button>
              <BigField label={`Para confirmar, escribe ${DELETE_WORD}`}>
                <BigInput
                  id={wordId}
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={DELETE_WORD}
                  disabled={busy}
                />
              </BigField>
            </>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : null}
    </Sheet>
  );
}

/** Las ligas a su nombre: pasarlas a otro miembro o borrarlas, una por una. */
function OwnedLeagues({ plan, onChanged, myUid }: { plan: DeletePlan; onChanged: () => Promise<void> | void; myUid: string }) {
  const n = plan.ownedLeagues.length;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-section">Primero, {n === 1 ? 'tu liga' : `tus ${n} ligas`}</p>
        <p className="mt-1 text-fg-2">{n === 1 ? 'Está' : 'Están'} a tu nombre: pásala a otro miembro (quedas de admin hasta borrar la cuenta) o bórrala.</p>
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
    // Dentro de la hoja (blanca): un bloque gris, sin sombra; los campos van en blanco encima.
    <div className="flex flex-col gap-4 rounded-2xl bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <LeagueTile league={{ id: league.id, sport: league.sport, kind: league.kind, logoPath: null }} dense />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{league.name}</p>
          <p className="text-sm text-muted">{league.kind === 'torneo' ? `Torneo · ${sport}` : sport}</p>
        </div>
      </div>
      {league.members.length ? (
        <div className="flex flex-col gap-3">
          <BigField label="Pasarla a">
            <BigSelect id={selectId} value={to} onChange={(e) => setTo(e.target.value)} disabled={!!busy} raised>
              {league.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.role === 'admin' ? ' (admin)' : ''}
                </option>
              ))}
            </BigSelect>
          </BigField>
          <Button variant="primary" size="lg" icon={<ArrowRightLeft className="size-5" />} onClick={transfer} loading={busy === 'pasar'} disabled={!!busy || !target} className="w-full">
            Pasar la liga
          </Button>
        </div>
      ) : (
        <p className="flex items-start gap-2 text-fg-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" /> Solo estás tú: puedes borrarla sin afectar a nadie.
        </p>
      )}
      {league.memberCount > league.members.length && (
        <p className="text-[13px] text-muted">
          Se ven {league.members.length} de {league.memberCount} miembros (los admins primero). Si no ves a la persona, hazla admin en la liga y vuelve aquí.
        </p>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={!!busy}
        aria-busy={busy === 'borrar' || undefined}
        className="-my-1 inline-flex min-h-11 items-center gap-2 self-start font-semibold text-danger transition active:opacity-70 disabled:opacity-60"
      >
        <BusyIcon busy={busy === 'borrar'} icon={<Trash2 className="size-[18px]" aria-hidden="true" />} className="size-[18px]" />
        Borrar la liga
      </button>
    </div>
  );
}
