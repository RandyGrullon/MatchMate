import { useState } from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Button, Field, Input, ListSkeleton, Modal, cx } from '../../components/ui';
import { useLeagueMembers } from '../../lib/data';
import { adminDeleteLeague, transferLeague, type AdminLeague } from '../../lib/data/admin';
import { ErrorRetry } from './bits';
import { fmtNum } from './format';
import { useRun } from './hooks';
import { ROLE_LABEL } from './model';

type LeagueRef = Pick<AdminLeague, 'id' | 'name' | 'ownerId' | 'ownerName' | 'kind'>;

/** Pasar la liga a otro miembro: el dueño anterior queda de admin. */
export function TransferLeagueModal({ league, onClose }: { league: LeagueRef | null; onClose: () => void }) {
  const members = useLeagueMembers(league?.id);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const candidates = members.data.filter((m) => m.uid !== league?.ownerId);
  const chosen = candidates.find((m) => m.uid === choice) ?? null;
  const what = league?.kind === 'torneo' ? 'el torneo' : 'la liga';
  const close = () => {
    setChoice(null);
    onClose();
  };
  async function submit() {
    if (!league || !chosen) return;
    setBusy(true);
    const ok = await run(() => transferLeague(league.id, chosen.uid), `«${league.name}» ahora es de ${chosen.name}`);
    setBusy(false);
    // La capa de datos ya vuelve a pedir la consola (ligas, cuentas, auditoría).
    if (ok) close();
  }
  return (
    <Modal
      open={league != null}
      onClose={close}
      title={league ? `Pasar «${league.name}» a otro dueño` : 'Pasar a otro dueño'}
      footer={
        <>
          <Button onClick={close} className="max-sm:min-h-11">
            Cancelar
          </Button>
          <Button variant="primary" icon={<ArrowRightLeft className="size-4" />} disabled={!chosen} loading={busy} onClick={submit} className="max-sm:min-h-11">
            {chosen ? `Pasar a ${chosen.name}` : 'Pasar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Hoy es de <span className="font-medium text-fg">{league?.ownerName}</span>, que queda de admin. Elige quién será el nuevo dueño de {what} (tiene que ser
          miembro).
        </p>
        {members.error && !members.data.length ? (
          <ErrorRetry error={members.error} compact />
        ) : members.loading && !members.data.length ? (
          <ListSkeleton rows={3} />
        ) : !candidates.length ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            No hay otros miembros. Primero alguien tiene que unirse con el código de invitación.
          </p>
        ) : (
          <fieldset className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            <legend className="sr-only">Nuevo dueño</legend>
            {candidates.map((m) => (
              <label
                key={m.uid}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition',
                  choice === m.uid ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                )}
              >
                <input type="radio" name="mm-new-owner" value={m.uid} checked={choice === m.uid} onChange={() => setChoice(m.uid)} className="size-4 accent-[var(--accent)]" />
                <Avatar name={m.name} className="size-8 text-xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                <span className="text-xs text-muted">{ROLE_LABEL[m.role]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {candidates.length > 0 && <p className="text-xs text-muted">{fmtNum(candidates.length)} miembros para elegir.</p>}
      </div>
    </Modal>
  );
}

/** Borrar una liga de cualquiera: hay que escribir el nombre para confirmar. Queda en la auditoría. */
export function DeleteLeagueModal({ league, onClose }: { league: Pick<AdminLeague, 'id' | 'name' | 'kind' | 'members' | 'events'> | null; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const matches = !!league && typed.trim() === league.name.trim();
  const what = league?.kind === 'torneo' ? 'el torneo' : 'la liga';
  const close = () => {
    setTyped('');
    onClose();
  };
  async function submit() {
    if (!league || !matches) return;
    setBusy(true);
    const ok = await run(() => adminDeleteLeague(league.id), `Se borró «${league.name}»`);
    setBusy(false);
    // La capa de datos ya vuelve a pedir la consola (ligas, cuentas, auditoría).
    if (ok) close();
  }
  return (
    <Modal
      open={league != null}
      onClose={close}
      title={league ? `Borrar «${league.name}»` : 'Borrar'}
      footer={
        <>
          <Button onClick={close} className="max-sm:min-h-11">
            Cancelar
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} disabled={!matches} loading={busy} onClick={submit} className="max-sm:min-h-11">
            Borrar para siempre
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm">
          <p className="font-semibold text-danger">Esto no se puede deshacer.</p>
          <p className="text-muted">
            Se borra {what} con sus {fmtNum(league?.events ?? 0)} eventos, jugadores, juegos, partidos y fotos. {fmtNum(league?.members ?? 0)} miembros dejan de verla.
            Si hace falta, baja antes un respaldo desde Sistema.
          </p>
        </div>
        <Field label={`Escribe «${league?.name ?? ''}» para confirmar`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={typed.length > 0 && !matches} className="max-sm:h-11" />
        </Field>
      </form>
    </Modal>
  );
}
