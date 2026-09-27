import { useState, type ReactNode } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { usePhoto } from '../lib/data';
import { useLeagueCtx } from '../lib/league';
import { IMPORTED, NO_PHOTO } from '../lib/types';
import { Button, Loading, Modal, cx } from './ui';

export function PhotoView({ src, className }: { src: string; className?: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className={cx('relative overflow-auto rounded-xl bg-black/80', zoom ? 'max-h-[70dvh]' : '', className)}>
      <img
        src={src}
        alt="Foto del marcador"
        onClick={() => setZoom((z) => !z)}
        className={cx('mx-auto cursor-zoom-in', zoom ? 'max-w-none w-[220%] cursor-zoom-out' : 'max-h-[60dvh] w-full object-contain')}
      />
      <button
        type="button"
        onClick={() => setZoom((z) => !z)}
        className="sticky bottom-2 left-2 m-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs text-white"
      >
        {zoom ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />}
        {zoom ? 'Alejar' : 'Acercar'}
      </button>
    </div>
  );
}

/** Muestra la foto que verificó un juego. */
export function PhotoModal({
  photoId,
  onClose,
  title = 'Foto del juego',
  actions,
}: {
  photoId: string | null;
  onClose: () => void;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  const { lid } = useLeagueCtx();
  const imported = photoId === IMPORTED;
  const noPhoto = photoId === NO_PHOTO;
  const photo = usePhoto(lid, imported || noPhoto ? null : photoId);
  return (
    <Modal
      open={photoId != null}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          {actions}
          <Button onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      {imported ? (
        <p className="text-sm text-muted">Resultado cargado del Excel del torneo (auditado). No tiene foto.</p>
      ) : noPhoto ? (
        <p className="text-sm text-muted">Cuenta sin foto del marcador (la liga no la exige o un admin lo aceptó así).</p>
      ) : photo.loading ? (
        <Loading />
      ) : photo.data ? (
        <PhotoView src={photo.data.data} />
      ) : (
        <p className="text-sm text-muted">La foto ya no existe.</p>
      )}
    </Modal>
  );
}
