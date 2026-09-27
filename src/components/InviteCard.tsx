import { useEffect, useState } from 'react';
import { Copy, QrCode as QrIcon, RefreshCw, Share2, Ticket } from 'lucide-react';
import { getInviteCode, renewInviteCode } from '../lib/data';
import type { League } from '../lib/types';
import { useAction, useFeedback } from './feedback';
import { QrCode } from './QrCode';
import { shareLink } from './share';
import { Button, Card, Skeleton } from './ui';

export const inviteUrl = (code: string) => `${location.origin}/unirse/${code}`;

/** Invitación a la liga: código, link y QR. Cambiar el código invalida el anterior. */
export function InviteCard({ league }: { league: League }) {
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let alive = true;
    getInviteCode(league.id)
      .then((c) => alive && setCode(c))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [league.id]);

  async function renew() {
    if (code) {
      const ok = await confirm({
        title: 'Cambiar el código',
        message: 'El link, el QR y el código actuales dejan de servir. Quienes ya están en la liga siguen en ella.',
        confirmText: 'Cambiar',
      });
      if (!ok) return;
    }
    setBusy(true);
    const next = await run(() => renewInviteCode(league), code ? 'Código nuevo listo' : 'Invitación creada');
    if (next) setCode(next);
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Ticket className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Invitar a la liga</h3>
          <p className="text-sm text-muted">
            {league.visibility === 'private'
              ? 'Es privada: solo entra quien tenga el link, el QR o el código.'
              : 'Es pública: cualquiera puede unirse; el link los lleva directo.'}
          </p>
        </div>
      </div>

      {code === undefined ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : !code ? (
        <Button variant="primary" loading={busy} onClick={renew} icon={<Ticket className="size-4" />}>
          Crear invitación
        </Button>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-3">
            <span className="text-xs text-muted">Código</span>
            <span className="font-mono text-2xl font-bold tracking-[0.25em]">{code}</span>
          </div>
          {showQr && (
            <div className="animate-fade-up flex justify-center rounded-xl bg-white p-3">
              <QrCode value={inviteUrl(code)} className="size-52" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button
              variant="primary"
              icon={<Share2 className="size-4" />}
              onClick={async () => {
                if (await shareLink(inviteUrl(code), `Únete a ${league.name} en BowlingX`)) toast('Link copiado');
              }}
            >
              Compartir
            </Button>
            <Button
              icon={<Copy className="size-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(code);
                toast('Código copiado');
              }}
            >
              Código
            </Button>
            <Button icon={<QrIcon className="size-4" />} onClick={() => setShowQr((s) => !s)}>
              {showQr ? 'Ocultar QR' : 'QR'}
            </Button>
            <Button icon={<RefreshCw className="size-4" />} loading={busy} onClick={renew}>
              Cambiar
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
