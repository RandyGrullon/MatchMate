import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { renewSquadCode, squadErrorText, squadJoinUrl, useSquadCode, type SquadLite } from '../../lib/data/squads';
import { useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { ShareRow } from '../../components/invite/InviteSheet';
import type { InviteLink } from '../../components/invite/logic';
import { QrCode } from '../../components/QrCode';
import { squadShareText } from '../../components/squads/logic';
import { Button, Sheet, Skeleton } from '../../components/ui';
import { shareOrigin } from '../../lib/origin';

/** El origen de la app para el link (en pruebas sin ventana, el de producción). */
const appOrigin = () => shareOrigin();

/**
 * «Invitar al equipo» (el capitán): el QR del link (`/equipos/unirse/<código>`), el código grande, copiarlo o mandarlo
 * por WhatsApp (ShareRow) y «Código nuevo» (el de ahora deja de servir). `code`: el que llegó al crear el equipo (así
 * no espera a leerlo). Se monta solo mientras está abierta.
 */
export function SquadInviteSheet({ open, onClose, squad, code }: { open: boolean; onClose: () => void; squad: SquadLite; code?: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Invitar al equipo" subtitle={squad.name}>
      {open && <InviteBody squad={squad} known={code ?? null} />}
    </Sheet>
  );
}

function InviteBody({ squad, known }: { squad: SquadLite; known: string | null }) {
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
    <div className="flex flex-col items-center gap-5 pb-1 text-center">
      <p className="max-w-sm text-meta text-muted">Quien entre con el link, el QR o el código se suma al equipo.</p>
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
    </div>
  );
}
