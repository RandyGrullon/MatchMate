import { useState, type ReactNode } from 'react';
import { Radio } from 'lucide-react';
import { streamFor, useLeagueStreams, type LiveStream } from '../../lib/data/streams';
import { useLeagueCtx } from '../../lib/league';
import type { MenuItem } from '../event/EventHeader';
import { canStartStream } from './LiveParts';
import { StartStreamSheet } from './StartStreamSheet';

/**
 * «Transmitir en vivo» en el «•••» de un partido o un evento: para los admins y anotadores (en el boliche, los admins)
 * con la liga en vivo activada, y solo si ese partido o evento no tiene ya una transmisión (entonces sale la píldora
 * «Ver en vivo», LiveWatchPill). Devuelve la opción del menú (o nada) y la hoja, que la pantalla pone donde quiera; la
 * hoja sigue abierta aunque la opción se vaya al empezar (para «Ya estás en vivo»). `onPick`: cerrar el menú.
 */
export function useStartLive(target: { matchId?: string | null; eventId?: string | null; title?: string | null; onPick?: () => void }): {
  stream: LiveStream | null;
  item: MenuItem | null;
  sheet: ReactNode;
} {
  const ctx = useLeagueCtx();
  const streams = useLeagueStreams(ctx.lid).data;
  const [open, setOpen] = useState(false);
  const stream = streamFor(streams, { matchId: target.matchId, eventId: target.eventId });
  const can = canStartStream(ctx);
  const item: MenuItem | null =
    can && !stream
      ? {
          key: 'en-vivo',
          icon: Radio,
          label: 'Transmitir en vivo',
          hint: 'Pon el link de YouTube, Twitch, Facebook…',
          onClick: () => {
            target.onPick?.();
            setOpen(true);
          },
        }
      : null;
  const sheet =
    can || open ? (
      <StartStreamSheet
        lid={ctx.lid}
        matchId={target.matchId ?? null}
        eventId={target.eventId ?? null}
        defaultTitle={target.title ?? null}
        open={open}
        onClose={() => setOpen(false)}
      />
    ) : null;
  return { stream, item, sheet };
}
