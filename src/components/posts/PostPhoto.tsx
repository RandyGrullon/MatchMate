import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import type { Post } from '../../lib/data/posts';
import { POST_BUCKET, usePublicImage } from '../../lib/publicImages';
import { MODAL_OPENED, Skeleton, cx } from '../ui';
import { photoRatio } from './postFormat';

/**
 * La foto de una publicación: el hueco ya tiene su tamaño antes de que llegue (la pantalla no salta); mientras llega,
 * una forma gris; si no se pudo pedir, lo dice. Tocarla la abre entera en grande.
 */
export function PostPhoto({ photo, alt, className }: { photo: NonNullable<Post['photo']>; alt: string; className?: string }) {
  const { url, pending } = usePublicImage(POST_BUCKET, photo.path);
  const [open, setOpen] = useState(false);
  const ratio = photoRatio(photo.w, photo.h);
  const box = cx('relative block w-full overflow-hidden rounded-2xl bg-surface-2', className);

  if (!url) {
    return (
      <div className={box} style={{ aspectRatio: ratio }} data-photo={pending ? 'cargando' : 'error'}>
        {pending ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-sm text-muted">
            <ImageOff className="size-6" aria-hidden="true" />
            No se pudo cargar la foto
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Ver la foto en grande"
        className={cx(box, 'cursor-zoom-in transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-90')}
        style={{ aspectRatio: ratio }}
      >
        <img src={url} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      </button>
      {open && <PhotoViewer open onClose={() => setOpen(false)} url={url} alt={alt} />}
    </>
  );
}

/**
 * La foto entera, en grande, a pantalla completa sobre negro. Tocarla la acerca (y se desliza para verla); tocar fuera,
 * la X o Esc la cierran.
 */
export function PhotoViewer({ open, onClose, url, alt }: { open: boolean; onClose: () => void; url: string; alt: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    if (!open && d.open) d.close();
  }, [open]);
  const close = () => {
    setZoom(false);
    onClose();
  };
  // Si se desmonta abierta (la publicación se borró), que no quede el fondo oscuro.
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Foto"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/95 p-0 text-white"
    >
      {open && (
        <>
          <div className="absolute inset-0 overflow-auto overscroll-contain" style={{ touchAction: 'pan-x pan-y' }} onClick={close}>
            <img
              src={url}
              alt={alt}
              onClick={(e) => {
                e.stopPropagation();
                setZoom((z) => !z);
              }}
              className={cx(zoom ? 'w-[200%] max-w-none cursor-zoom-out' : 'absolute inset-0 m-auto max-h-full max-w-full cursor-zoom-in object-contain p-2')}
            />
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 inline-flex size-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-white active:scale-95"
          >
            <X className="size-6" aria-hidden="true" />
          </button>
        </>
      )}
    </dialog>
  );
}
