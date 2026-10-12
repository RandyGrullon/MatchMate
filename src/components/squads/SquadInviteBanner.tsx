import { useState } from 'react';
import { MailOpen } from 'lucide-react';
import { respondSquadInvite, type MySquadInvite } from '../../lib/data/squads';
import { useFeedback } from '../feedback';
import { invitedByLine } from '../notifications/inviteText';
import { Button, Card } from '../ui';
import { squadInviteErrorText, squadRespondedText } from './logic';

/**
 * Quien abre el equipo con una invitación pendiente (el push «Te invitaron a …» lleva aquí): quién lo invitó y
 * Rechazar · Aceptar, en lugar de Seguir. Al aceptar entra al equipo (la página se vuelve a leer y ya es miembro).
 */
export function SquadInviteBanner({ invite: inv, squadName }: { invite: MySquadInvite; squadName: string }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<boolean | null>(null);

  async function respond(accept: boolean) {
    if (busy !== null) return;
    setBusy(accept);
    try {
      await respondSquadInvite(inv.id, accept);
      toast(squadRespondedText(accept, squadName));
    } catch (e) {
      console.error(e);
      toast(squadInviteErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-3.5 flex flex-col gap-3.5 px-5 py-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <MailOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug font-semibold">{invitedByLine({ ...inv.invitedBy, username: inv.invitedBy.username ?? '' })} a este equipo</p>
          <p className="mt-0.5 text-sm text-muted">Si aceptas, entras a la plantilla y puedes publicar en su muro.</p>
        </div>
      </div>
      <div className="flex gap-2.5">
        <Button variant="quiet" size="lg" className="flex-1" loading={busy === false} disabled={busy !== null} onClick={() => void respond(false)}>
          Rechazar
        </Button>
        <Button variant="primary" size="lg" className="flex-1" loading={busy === true} disabled={busy !== null} onClick={() => void respond(true)}>
          Aceptar
        </Button>
      </div>
    </Card>
  );
}
