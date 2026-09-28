import { useContext, useState } from 'react';
import { Copy, MessageCircle, Share2 } from 'lucide-react';
import type { Match } from '../../lib/data/matches';
import { LeagueContext } from '../../lib/league';
import type { Side } from '../../sports/types';
import { useFeedback } from '../feedback';
import { ShareButton } from '../share/ShareButton';
import type { ShareResultSide } from '../share/cards';
import { resultShare } from '../share/match';
import { Button, Card, cx } from '../ui';
import { matchShareText, whatsappShareUrl } from './format';

/**
 * Tarjeta para compartir el resultado: como imagen (con la marca y el color del deporte, lista para WhatsApp)
 * o como texto por WhatsApp, con el menú del teléfono o copiado. El texto sale de `matchShareText`: título,
 * ronda y cancha, quién ganó y con qué marcador, y el link.
 */
export function ShareResultCard({
  match,
  title,
  roundWord,
  url,
  sideExtra,
  className,
}: {
  match: Match;
  /** Nombre de la liga o de la noche. */
  title?: string;
  roundWord?: string;
  url?: string;
  /** Color y línea chica de cada lado en la imagen (el color del equipo). */
  sideExtra?: (side: Side) => Pick<ShareResultSide, 'dot' | 'sub'> | undefined;
  className?: string;
}) {
  const { toast } = useFeedback();
  const ctx = useContext(LeagueContext);
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

  const card = () => resultShare(match, { title: title || ctx?.league.name || 'Resultado', roundWord, tz: ctx?.league.tz, url, sideExtra });

  return (
    <Card className={cx('flex flex-col gap-3 p-4', className)}>
      <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
      <div className="grid grid-cols-2 gap-2">
        <ShareButton card={card} url={url} variant="primary" size="md" label="Compartir imagen" className="col-span-2 h-11" />
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ok px-4 text-sm font-medium text-bg hover:brightness-110 active:scale-[0.97]"
        >
          <MessageCircle className="size-5" />
          WhatsApp
        </a>
        <Button
          className="h-11"
          loading={busy}
          onClick={() => void share()}
          icon={canShare ? <Share2 className="size-5" /> : <Copy className="size-5" />}
          aria-label={canShare ? 'Compartir como texto' : 'Copiar el texto'}
        >
          {canShare ? 'Texto' : 'Copiar'}
        </Button>
      </div>
    </Card>
  );
}
