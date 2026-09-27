import { useState } from 'react';
import { Copy, MessageCircle, Share2 } from 'lucide-react';
import type { Match } from '../../lib/data/matches';
import { useFeedback } from '../feedback';
import { Button, Card, cx } from '../ui';
import { matchShareText, whatsappShareUrl } from './format';

/**
 * Tarjeta para compartir el resultado por WhatsApp (o con el menú del teléfono, o copiado). El texto sale de
 * `matchShareText`: título, ronda y cancha, quién ganó y con qué marcador, y el link.
 */
export function ShareResultCard({
  match,
  title,
  roundWord,
  url,
  className,
}: {
  match: Match;
  /** Nombre de la liga o de la noche. */
  title?: string;
  roundWord?: string;
  url?: string;
  className?: string;
}) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const text = matchShareText({ match, title, roundWord, url });

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = async () => {
    setBusy(true);
    try {
      if (canShare && matchMedia('(pointer: coarse)').matches) {
        try {
          await navigator.share({ text });
          return;
        } catch {
          // cancelado: se copia
        }
      }
      await navigator.clipboard.writeText(text);
      toast('Copiado');
    } catch {
      toast('No se pudo copiar', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cx('flex flex-col gap-3 p-4', className)}>
      <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ok px-4 text-sm font-medium text-bg hover:brightness-110 active:scale-[0.97]"
        >
          <MessageCircle className="size-5" />
          WhatsApp
        </a>
        <Button className="h-11 flex-1" loading={busy} onClick={() => void share()} icon={canShare ? <Share2 className="size-5" /> : <Copy className="size-5" />}>
          {canShare ? 'Compartir' : 'Copiar'}
        </Button>
      </div>
    </Card>
  );
}
