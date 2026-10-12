import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { decideSquadRequest, squadPath, useLeagueSquadRequests, type SquadRequest } from '../../lib/data/squads';
import { useBusy } from '../busy';
import { useFeedback } from '../feedback';
import { Button, Card, Field, ListRow, SectionHeader, Sheet, Textarea } from '../ui';
import { adminErrorText, countWord, decisionText, squadLine, squadTitle } from './logic';
import { RowWithActions, SquadLogo } from './SquadBits';

/** El largo de la nota al rechazar (el mismo de la base). */
const NOTE_MAX = 200;

/**
 * Los equipos que piden entrar a la liga (Admin de una liga de fútbol, futsal o baloncesto): cada uno con su logo, su
 * nombre, cuántos son y quién lo pidió, con «Aceptar» (crea el equipo en la liga con su plantilla: el aviso dice con
 * cuántos entró y cuántos ya estaban en otro equipo) y «Rechazar» (con una nota opcional). Sin pendientes no se ve.
 */
export function SquadRequestsPanel({ lid, className }: { lid: string; className?: string }) {
  const req = useLeagueSquadRequests(lid);
  const pending = req.data.filter((r) => r.status === 'pending');
  const [rejecting, setRejecting] = useState<SquadRequest | null>(null);
  if (!pending.length) return null;
  return (
    <section aria-labelledby="equipos-por-aprobar" data-squad-requests="" className={className}>
      <SectionHeader
        id="equipos-por-aprobar"
        title="Equipos que quieren entrar"
        action={<span className="text-meta text-muted">{countWord(pending.length, 'pendiente', 'pendientes')}</span>}
      />
      <Card className="overflow-hidden">
        {pending.map((r) => (
          <RequestRow key={r.id} lid={lid} request={r} onReject={() => setRejecting(r)} />
        ))}
      </Card>
      <RejectSheet lid={lid} request={rejecting} onClose={() => setRejecting(null)} />
    </section>
  );
}

function RequestRow({ lid, request: r, onReject }: { lid: string; request: SquadRequest; onReject: () => void }) {
  const { toast, confirm } = useFeedback();
  const act = useBusy<'aceptar'>();

  async function accept() {
    const ok = await confirm({
      title: `¿Aceptar a ${r.squad.name}?`,
      message: `Se crea el equipo en la liga y sus ${countWord(r.squad.members, 'miembro entra', 'miembros entran')} como jugadores. Quien ya está en otro equipo de la temporada se queda donde está.`,
      confirmText: 'Aceptar equipo',
    });
    if (!ok) return;
    await act.run('aceptar', async () => {
      try {
        toast(decisionText(await decideSquadRequest(lid, r.id, true)));
      } catch (e) {
        console.error(e);
        toast(adminErrorText(e), 'error');
      }
    });
  }

  return (
    <RowWithActions
      row={
        <ListRow
          to={squadPath(r.squad.id)}
          leading={<SquadLogo squad={r.squad} />}
          title={squadTitle(r.squad)}
          subtitle={[squadLine(r.squad), r.requestedBy.name ? `Lo pidió ${r.requestedBy.name}` : null].filter(Boolean).join(' · ')}
        />
      }
      actions={
        <>
          <Button variant="primary" className="h-11 flex-1" loading={act.isBusy('aceptar')} icon={<Check className="size-4" />} onClick={() => void accept()}>
            Aceptar
          </Button>
          <Button variant="quiet" className="h-11 flex-1" disabled={act.isBusy()} icon={<X className="size-4" />} onClick={onReject}>
            Rechazar
          </Button>
        </>
      }
    />
  );
}

/** «Rechazar» con una nota opcional (le llega al capitán). */
function RejectSheet({ lid, request, onClose }: { lid: string; request: SquadRequest | null; onClose: () => void }) {
  return (
    <Sheet open={!!request} onClose={onClose} title="Rechazar equipo" subtitle={request?.squad.name}>
      {request && <RejectBody lid={lid} request={request} onDone={onClose} />}
    </Sheet>
  );
}

function RejectBody({ lid, request, onDone }: { lid: string; request: SquadRequest; onDone: () => void }) {
  const { toast } = useFeedback();
  const [note, setNote] = useState('');
  const act = useBusy<'rechazar'>();

  async function reject() {
    await act.run('rechazar', async () => {
      try {
        await decideSquadRequest(lid, request.id, false, note);
        toast(`Rechazaste a ${request.squad.name}`);
        onDone();
      } catch (e) {
        console.error(e);
        toast(adminErrorText(e), 'error');
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4 pb-1"
      onSubmit={(e) => {
        e.preventDefault();
        void reject();
      }}
    >
      <p className="text-meta text-muted">El capitán recibe un aviso. Puede volver a pedir más adelante.</p>
      <Field label="Nota para el capitán (opcional)">
        <Textarea rows={3} maxLength={NOTE_MAX} value={note} placeholder="Ya cerramos la inscripción de esta temporada…" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" variant="danger" size="xl" className="w-full" loading={act.isBusy('rechazar')} icon={<X className="size-5" />}>
        Rechazar
      </Button>
    </form>
  );
}
