import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePeople, type PersonHit } from '../../lib/data/people';
import {
  cancelSquadInvite,
  inviteToSquad,
  renewSquadCode,
  squadErrorText,
  squadJoinUrl,
  useSquadCode,
  useSquadPendingInvites,
  type SquadLite,
  type SquadPendingInvite,
} from '../../lib/data/squads';
import { relativeTime } from '../../lib/notifications';
import { useNow } from '../../lib/useNow';
import { Avatar } from '../../components/Avatar';
import { useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { PeopleList, PeopleSearch, SendBar, ShareRow } from '../../components/invite/InviteSheet';
import { handleOf, peopleView, personState, selectionAfterSend, sendTone, toggleSelected, type InviteLink } from '../../components/invite/logic';
import { QrCode } from '../../components/QrCode';
import { squadInviteErrorText, squadInviteSummary, squadRoom, squadShareText } from '../../components/squads/logic';
import { Badge, Button, Sheet, Skeleton } from '../../components/ui';
import { shareOrigin } from '../../lib/origin';

/** El origen de la app para el link (en pruebas sin ventana, el de producción). */
const appOrigin = () => shareOrigin();

const NO_SELECTION: ReadonlyMap<string, PersonHit> = new Map();

/**
 * «Invitar al equipo» (el capitán), como la de una liga: arriba el buscador (nombre o @usuario; sin buscar, las
 * personas que sigues) con «Ya está» para los miembros e «Invitado» para quien ya tiene invitación; se tocan las
 * tarjetas y «Enviar invitación» les manda la invitación con un push (`inviteToSquad`; el aviso dice cómo le fue a cada
 * uno: «Enviamos 3 invitaciones · 1 ya estaba»). Debajo, las invitaciones que esperan respuesta con «Retirar», y el
 * link de siempre: el QR (`/equipos/unirse/<código>`), el código grande, copiarlo o mandarlo (ShareRow) y «Código
 * nuevo». `code`: el que llegó al crear el equipo (así no espera a leerlo). Se monta solo mientras está abierta.
 */
export function SquadInviteSheet({ open, onClose, squad, code }: { open: boolean; onClose: () => void; squad: SquadLite; code?: string | null }) {
  if (!open) return null;
  return <InviteSheetOpen squad={squad} known={code ?? null} onClose={onClose} />;
}

function InviteSheetOpen({ squad, known, onClose }: { squad: SquadLite; known: string | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [input, setInput] = useState('');
  const people = usePeople(input, null, squad.id);
  const [selected, setSelected] = useState<ReadonlyMap<string, PersonHit>>(NO_SELECTION);
  const [sending, setSending] = useState(false);
  const room = squadRoom(squad.members);
  const view = peopleView(input, people);

  function toggle(hit: PersonHit) {
    // Mientras se envía, lo elegido no cambia (al terminar salen los que quedaron invitados).
    if (sending) return;
    const next = toggleSelected(selected, hit, room);
    if (next === selected && !personState(hit)) toast(room === 1 ? 'Al equipo le cabe 1 persona más.' : `Al equipo le caben ${room} personas más.`, 'error');
    setSelected(next);
  }

  async function send() {
    setSending(true);
    try {
      const res = await inviteToSquad(squad.id, [...selected.keys()]);
      // Si no salió ninguna, el aviso es de error; quedan elegidos los que no se pudieron invitar.
      toast(squadInviteSummary(res.results), sendTone(res.results));
      setSelected((s) => selectionAfterSend(s, res.results));
    } catch (e) {
      console.warn('[equipo] invitar', e);
      toast(squadErrorText(e), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Invitar al equipo"
      subtitle={squad.name}
      footer={
        selected.size > 0 ? <SendBar people={[...selected.values()]} sending={sending} onSend={() => void send()} onClear={() => setSelected(NO_SELECTION)} /> : undefined
      }
    >
      <div className="flex flex-col gap-7 pb-1">
        {room > 0 ? (
          <section aria-label="Buscar personas para invitar" className="min-h-[40dvh] sm:min-h-64">
            <PeopleSearch value={input} onChange={setInput} />
            <PeopleList
              view={view}
              query={input.trim()}
              people={people.data}
              settled={people.settled}
              error={people.error}
              selected={selected}
              onToggle={toggle}
              kind="squad"
            />
          </section>
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-center text-meta text-muted">
            El equipo ya tiene {squad.members} miembros. Para sumar a alguien, primero tiene que salir otro.
          </p>
        )}
        <PendingInvites squadId={squad.id} />
        <CodeAndLink squad={squad} known={known} />
      </div>
    </Sheet>
  );
}

/** Las invitaciones que esperan respuesta, con «Retirar» (sin ninguna, nada). */
export function PendingInvites({ squadId }: { squadId: string }) {
  const pending = useSquadPendingInvites(squadId, true);
  const now = useNow().getTime();
  const { toast } = useFeedback();
  const act = useBusy<string>();
  if (!pending.data.length) return null;

  async function cancel(inv: SquadPendingInvite) {
    await act.run(inv.id, async () => {
      try {
        await cancelSquadInvite(squadId, inv.id);
        toast('Invitación retirada');
      } catch (e) {
        console.error(e);
        toast(squadInviteErrorText(e), 'error');
      }
    });
  }

  return (
    <section aria-labelledby="invitar-pendientes">
      <h3 id="invitar-pendientes" className="mb-2 flex items-center gap-2 text-sm font-semibold">
        Esperan respuesta <Badge tone="accent">{pending.data.length}</Badge>
      </h3>
      <ul className="-mx-2 flex flex-col">
        {pending.data.map((inv) => {
          const at = Date.parse(inv.createdAt);
          const line = [handleOf(inv.user.username), Number.isFinite(at) ? `invitado ${relativeTime(at, now)}` : null].filter(Boolean).join(' · ');
          return (
            <li key={inv.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
              <Avatar name={inv.user.name} photo={inv.user.avatar} className="size-10 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">{inv.user.name || handleOf(inv.user.username) || 'Sin nombre'}</p>
                {line && <p className="truncate text-[13px] text-muted">{line}</p>}
              </div>
              <Button
                variant="quiet"
                size="sm"
                className="h-11 sm:h-9"
                aria-label={`Retirar la invitación a ${inv.user.name || 'esa persona'}`}
                loading={act.isBusy(inv.id)}
                disabled={act.isBusy()}
                onClick={() => void cancel(inv)}
              >
                Retirar
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** El link para quien no está en la app: el QR, el código grande, compartir y «Código nuevo». */
function CodeAndLink({ squad, known }: { squad: SquadLite; known: string | null }) {
  const { toast, confirm } = useFeedback();
  const read = useSquadCode(squad.id, true);
  const [renewed, setRenewed] = useState<string | null>(null);
  const act = useBusy<'renovar'>();
  const current = renewed ?? read.data ?? known;
  const url = current ? squadJoinUrl(appOrigin(), current) : null;
  const link: InviteLink = url ? { kind: 'url', url } : { kind: 'loading' };

  async function renew() {
    const ok = await confirm({
      title: '¿Cambiar el código?',
      message: 'El link y el código de ahora dejan de servir. Quien ya está en el equipo sigue igual.',
      confirmText: 'Código nuevo',
    });
    if (!ok) return;
    await act.run('renovar', async () => {
      try {
        setRenewed(await renewSquadCode(squad.id));
        toast('Código nuevo listo');
      } catch (e) {
        console.error(e);
        toast(squadErrorText(e), 'error');
      }
    });
  }

  return (
    <section aria-labelledby="invitar-link" className="flex flex-col items-center gap-5 border-t border-line pt-6 text-center">
      <div>
        <h3 id="invitar-link" className="text-sm font-semibold">
          O con el link
        </h3>
        <p className="mt-1 max-w-sm text-meta text-muted">Quien entre con el link, el QR o el código se suma al equipo.</p>
      </div>
      {current && url ? (
        <>
          <div className="rounded-3xl bg-white p-2 shadow-sm">
            <QrCode value={url} className="size-44" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Código del equipo</p>
            <p className="num mt-1 text-[28px] font-bold tracking-[0.18em]" aria-label={`Código ${current.split('').join(' ')}`}>
              {current}
            </p>
          </div>
        </>
      ) : read.loading ? (
        <div className="flex flex-col items-center gap-3" aria-busy="true" aria-label="Cargando el código">
          <Skeleton className="size-48 rounded-3xl" />
          <Skeleton className="h-7 w-40" />
        </div>
      ) : (
        <p className="text-meta text-muted">No se pudo leer el código. Cierra y vuelve a abrir.</p>
      )}
      <div className="w-full">
        <ShareRow link={link} leagueName={squad.name} text={squadShareText(squad)} hint="Manda el link por WhatsApp o donde quieras." />
      </div>
      <Button variant="quiet" className="h-11 w-full" loading={act.isBusy('renovar')} disabled={!current} onClick={() => void renew()} icon={<RefreshCw className="size-4" />}>
        Código nuevo
      </Button>
    </section>
  );
}
