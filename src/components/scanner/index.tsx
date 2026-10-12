import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { Button, Modal } from '../ui';

/**
 * Abrir el lector de QR desde cualquier pantalla: `useQrScanner()` da `open` y el `element` que hay que poner en la
 * pantalla (dentro de la hoja si se abre desde una hoja); `QrScannerButton` es el botón con todo junto. El lector se
 * baja aparte (y jsQR, solo donde no hay lector del sistema) la primera vez que se toca el botón.
 */

const load = () => import('./QrScanner');

/** Bajar el lector antes de tocarlo (al apoyar el dedo en el botón): abre al instante. */
export function preloadQrScanner() {
  void load().catch(() => undefined);
}

/** Sin conexión y sin el lector guardado: lo dice en vez de romper la pantalla de atrás. */
function ScannerUnavailable({ onClose }: { onClose: () => void; onNavigate?: (path: string) => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="No se pudo abrir el lector"
      footer={
        <Button variant="primary" onClick={onClose}>
          Entendido
        </Button>
      }
    >
      <p className="text-body text-fg-2">Revisa tu conexión e intenta de nuevo. Mientras, puedes escribir el código de la invitación.</p>
    </Modal>
  );
}

const QrScanner = lazy(() => load().catch(() => ({ default: ScannerUnavailable })));

export interface QrScannerHandle {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  /** Ponerlo en la pantalla (no se ve hasta abrirlo). */
  element: ReactNode;
}

/**
 * El lector listo para abrir. Al leer un QR de la app lleva a su pantalla con react-router (o llama a `onNavigate`
 * con la ruta, si se pasa) y se cierra solo.
 */
export function useQrScanner(opts?: { onNavigate?: (path: string) => void }): QrScannerHandle {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => {
    preloadQrScanner();
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const element = isOpen ? (
    <Suspense fallback={null}>
      <QrScanner onClose={close} onNavigate={opts?.onNavigate} />
    </Suspense>
  ) : null;
  return { open, close, isOpen, element };
}

/** Un botón que abre el lector (con el lector al lado). */
export function QrScannerButton({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  const scanner = useQrScanner();
  return (
    <>
      <button type="button" onClick={scanner.open} onPointerDown={preloadQrScanner} aria-label={label} className={className}>
        {children}
      </button>
      {scanner.element}
    </>
  );
}
