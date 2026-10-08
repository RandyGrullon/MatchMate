import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { esportsErrorText, renewTeamCode, teamJoinUrl, teamShareText, useTeamInviteCode, type EsportsTeam } from '../../../lib/data/esports';
import { useBusy } from '../../../components/busy';
import { useFeedback } from '../../../components/feedback';
import { ShareRow } from '../../../components/invite/InviteSheet';
import type { InviteLink } from '../../../components/invite/logic';
import { QrCode } from '../../../components/QrCode';
import { Button, Sheet, Skeleton } from '../../../components/ui';

/** El origen de la app para el link (en pruebas sin ventana, el de producción). */
const appOrigin = () => (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://matchmate-oficial.vercel.app');

/**
 * «Invitar» al equipo (el capitán, §12.4): el código grande, el QR del link (`/esports/unirse/<código>`), copiarlo o
 * mandarlo por WhatsApp (ShareRow) y «Cambiar código» (el de ahora deja de servir). Se monta solo mientras está abierta.
 */
export function TeamInviteSheet({ open, onClose, team }: { open: boolean; onClose: () => void; team: EsportsTeam }) {
  return (
    <Sheet open={open} onClose={onClose} title="Invitar al equipo" subtitle={team.name}>
      {open && <InviteBody team={team} />}
    </Sheet>
  );
}

function InviteBody({ team }: { team: EsportsTeam }) {
  const { toast, confirm } = useFeedback();
  const code = useTeamInviteCode(team.id, true);
  const [renewed, setRenewed] = useState<string | null>(null);
  const act = useBusy<'renovar'>();
  const current = renewed ?? code.data;
  const link: InviteLink = current ? { kind: 'url', url: teamJoinUrl(appOrigin(), current) } : { kind: 'loading' };

  async function renew() {
    const ok = await confirm({
      title: '¿Cambiar el código?',
      message: 'El link y el código de ahora dejan de servir. Quien ya está en el equipo sigue igual.',
      confirmText: 'Cambiar código',
    });
    if (!ok) return;
    await act.run('renovar', async () => {
      try {
        setRenewed(await renewTeamCode(team.id));
        toast('Código nuevo listo');
      } catch (e) {
        console.error(e);
        toast(esportsErrorText(e, team.game, 'equipo'), 'error');
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-5 pb-1 text-center">
      <p className="max-w-sm text-meta text-muted">Quien entre con el link o el código se suma al equipo. Necesita su ID del juego.</p>
      {current ? (
        <>
          <div className="rounded-3xl bg-white p-2 shadow-sm">
            <QrCode value={teamJoinUrl(appOrigin(), current)} className="size-44" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Código del equipo</p>
            <p className="num mt-1 text-[28px] font-bold tracking-[0.18em]" aria-label={`Código ${current.split('').join(' ')}`}>
              {current}
            </p>
          </div>
        </>
      ) : code.loading ? (
        <div className="flex flex-col items-center gap-3" aria-busy="true" aria-label="Cargando el código">
          <Skeleton className="size-48 rounded-3xl" />
          <Skeleton className="h-7 w-40" />
        </div>
      ) : (
        <p className="text-meta text-muted">No se pudo leer el código. Cierra y vuelve a abrir.</p>
      )}
      <div className="w-full">
        <ShareRow link={link} leagueName={team.name} text={teamShareText(team)} hint="Manda el link por WhatsApp o donde quieras." />
      </div>
      <Button variant="quiet" className="h-11 w-full" loading={act.isBusy('renovar')} disabled={!current} onClick={() => void renew()} icon={<RefreshCw className="size-4" />}>
        Cambiar código
      </Button>
    </div>
  );
}
