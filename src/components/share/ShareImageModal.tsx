import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Link2, Share2 } from 'lucide-react';
import { useBusy } from '../busy';
import { useFeedback } from '../feedback';
import { Button, Modal, Spinner } from '../ui';
import { canShareFiles, copyText, downloadFile, shareFile } from './actions';
import { shareCaption, type CardFrame, type ShareCard } from './cards';
import { renderCardPng } from './paint';

type Shot = { blob: Blob; href: string } | 'error' | null;

/**
 * Vista previa de la imagen y los botones: «Compartir» (menú del teléfono con la imagen y el link), «Descargar»
 * y «Copiar link». La imagen se hace al abrir, así el toque en «Compartir» llama al menú de una vez (Safari no
 * deja abrirlo después de esperar).
 */
export function ShareImageModal({
  open,
  onClose,
  card,
  frame,
  url,
  filename,
}: {
  open: boolean;
  onClose: () => void;
  card: ShareCard | null;
  frame: CardFrame;
  url?: string;
  filename: string;
}) {
  const { toast } = useFeedback();
  const [shot, setShot] = useState<Shot>(null);
  const busy = useBusy<'compartir' | 'copiar'>();

  useEffect(() => {
    if (!open || !card) return;
    let alive = true;
    let href: string | null = null;
    setShot(null);
    renderCardPng(card, frame)
      .then((blob) => {
        if (!alive) return;
        href = URL.createObjectURL(blob);
        setShot({ blob, href });
      })
      .catch(() => alive && setShot('error'));
    return () => {
      alive = false;
      if (href) URL.revokeObjectURL(href);
    };
  }, [open, card, frame]);

  const file = useMemo(() => (shot && shot !== 'error' ? new File([shot.blob], filename, { type: 'image/png' }) : null), [shot, filename]);
  const canShare = !!file && canShareFiles(file);
  const caption = card ? shareCaption(card, url) : '';

  const download = () => {
    if (!file) return;
    downloadFile(file, filename);
    toast('Imagen descargada');
  };

  const share = async () => {
    if (!file) return;
    const r = await busy.run('compartir', () => shareFile(file, caption, card?.title));
    if (r === undefined) return;
    if (r === 'shared') onClose();
    else if (r !== 'cancelled') {
      // Sin menú para archivos (o falló): se descarga para mandarla a mano.
      downloadFile(file, filename);
      toast('Se descargó la imagen para que la mandes');
    }
  };

  const copy = async () => {
    if (!url) return;
    await busy.run('copiar', async () => {
      if (await copyText(url)) toast('Link copiado');
      else toast('No se pudo copiar el link', 'error');
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Share2 className="size-5 text-accent" /> Compartir
        </span>
      }
      footer={
        <>
          {url && (
            <Button
              icon={<Link2 className="size-4" />}
              loading={busy.isBusy('copiar')}
              disabled={busy.isBusy('compartir')}
              aria-busy={busy.isBusy('copiar') || undefined}
              onClick={() => void copy()}
            >
              Copiar link
            </Button>
          )}
          {canShare && (
            <Button icon={<Download className="size-4" />} onClick={download} aria-label="Descargar la imagen">
              Descargar
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!file}
            loading={busy.isBusy('compartir')}
            aria-busy={busy.isBusy('compartir') || undefined}
            icon={canShare ? <Share2 className="size-4" /> : <Download className="size-4" />}
            onClick={canShare ? () => void share() : download}
          >
            {canShare ? 'Compartir imagen' : 'Descargar imagen'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {shot === 'error' ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 px-4 py-8 text-center">
            <AlertTriangle className="size-6 text-warn" />
            <p className="text-sm">No se pudo hacer la imagen en este teléfono.</p>
            {url && <p className="text-xs text-muted">Puedes mandar el link.</p>}
          </div>
        ) : shot ? (
          <img src={shot.href} alt={`Imagen para compartir: ${card?.title ?? ''}`} className="mx-auto max-h-[55dvh] w-auto max-w-full rounded-xl border border-line object-contain shadow-sm" />
        ) : (
          <div className="flex h-56 items-center justify-center rounded-xl bg-surface-2" role="status" aria-label="Haciendo la imagen">
            <Spinner />
          </div>
        )}
        <p className="text-xs text-muted">
          {canShare ? 'Elige WhatsApp (o donde quieras) en el menú del teléfono. El link va con la imagen.' : 'Descarga la imagen y mándala por WhatsApp junto con el link.'}
        </p>
      </div>
    </Modal>
  );
}
