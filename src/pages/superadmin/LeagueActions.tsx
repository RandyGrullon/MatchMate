import { useState } from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { useBusy } from '../../components/busy';
import { Button, Field, Input, ListSkeleton, Modal, cx } from '../../components/ui';
import { useLeagueMembers } from '../../lib/data';
import { adminDeleteLeague, transferLeague, type AdminLeague } from '../../lib/data/admin';
import { ErrorRetry } from './bits';
import { fmtNum, plural } from './format';
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
          <Button variant="quiet" size="lg" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" icon={<ArrowRightLeft className="size-[18px]" />} disabled={!chosen} loading={busy} onClick={submit} className="max-w-full">
            {chosen ? `Pasar a ${chosen.name}` : 'Pasar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-fg-2">
          Hoy es de <span className="font-semibold text-fg">{league?.ownerName}</span>, que queda de admin. Elige al nuevo dueño de {what}:
        </p>
        {members.error && !members.data.length ? (
          <ErrorRetry error={members.error} compact />
        ) : members.loading && !members.data.length ? (
          <ListSkeleton rows={3} />
        ) : !candidates.length ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">No hay otros miembros. Primero alguien se tiene que unir con el código.</p>
        ) : (
          <fieldset className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            <legend className="sr-only">Nuevo dueño</legend>
            {candidates.map((m) => (
              <label
                key={m.uid}
                className={cx(
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent',
                  choice === m.uid ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-surface-2 hover:brightness-95',
                )}
              >
                <input type="radio" name="mm-new-owner" value={m.uid} checked={choice === m.uid} onChange={() => setChoice(m.uid)} className="size-[18px] shrink-0 accent-[var(--accent)]" />
                <Avatar name={m.name} className="size-9 text-xs" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.name}</span>
                <span className="text-[13px] text-muted">{ROLE_LABEL[m.role]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {candidates.length > 0 && <p className="text-[13px] text-muted">{fmtNum(candidates.length)} miembros para elegir.</p>}
      </div>
    </Modal>
  );
}

/** Borrar una liga de cualquiera: hay que escribir el nombre para confirmar. Queda en la auditoría. */
export function DeleteLeagueModal({ league, onClose }: { league: Pick<AdminLeague, 'id' | 'name' | 'kind' | 'members' | 'events'> | null; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  // Con Enter en el campo también se manda: así no se borra dos veces.
  const busy = useBusy();
  const run = useRun();
  const matches = !!league && typed.trim() === league.name.trim();
  const what = league?.kind === 'torneo' ? 'el torneo' : 'la liga';
  const close = () => {
    setTyped('');
    onClose();
  };
  async function submit() {
    if (!league || !matches) return;
    const ok = await busy.run('delete', () => run(() => adminDeleteLeague(league.id), `Se borró «${league.name}»`));
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
          <Button variant="quiet" size="lg" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" size="lg" icon={<Trash2 className="size-[18px]" />} disabled={!matches} loading={busy.isBusy()} onClick={submit}>
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
        <div className="rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <p className="font-semibold text-danger">Esto no se puede deshacer.</p>
          <p className="mt-0.5 text-fg-2">
            Se borra {what} con {plural(league?.events ?? 0, 'evento', 'eventos')}, juegos y fotos; {plural(league?.members ?? 0, 'miembro deja', 'miembros dejan')} de
            verla. Antes puedes bajar un respaldo en Sistema.
          </p>
        </div>
        <Field label={`Escribe «${league?.name ?? ''}» para confirmar`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={typed.length > 0 && !matches} className="max-sm:h-11" />
        </Field>
      </form>
    </Modal>
  );
}
