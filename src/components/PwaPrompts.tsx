import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'bowlinx:instalar-descartado';
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const recentlyDismissed = () => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < 14 * 86400_000;
  } catch {
    return false;
  }
};

function Banner({ icon, children, onClose }: { icon: React.ReactNode; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="animate-fade-up fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-2xl sm:bottom-6">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Avisos de la app instalable:
 * - hay una versión nueva → botón para actualizar (sin perder lo que se está haciendo hasta que el usuario toque);
 * - en Android, botón "Instalar"; en iPhone, cómo agregarla a la pantalla de inicio.
 */
export function PwaPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (standalone() || recentlyDismissed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    addEventListener('beforeinstallprompt', onPrompt);
    // iPhone no tiene aviso de instalación: se explica cómo hacerlo, después de unos segundos de uso.
    const t = isIos() ? setTimeout(() => setShowIos(true), 6000) : undefined;
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // sin almacenamiento: se vuelve a ofrecer en la próxima visita
    }
    setInstallEvent(null);
    setShowIos(false);
  }

  if (needRefresh) {
    return (
      <Banner icon={<RefreshCw className="size-5" />} onClose={() => setNeedRefresh(false)}>
        <p className="font-medium">Hay una versión nueva</p>
        <Button size="sm" variant="primary" className="mt-1.5" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </Button>
      </Banner>
    );
  }

  if (installEvent) {
    return (
      <Banner icon={<Download className="size-5" />} onClose={dismiss}>
        <p className="font-medium">Instala BowlingX en tu celular</p>
        <p className="text-xs text-muted">Se abre como una app, más rápido y sin conexión.</p>
        <Button
          size="sm"
          variant="primary"
          className="mt-1.5"
          onClick={async () => {
            await installEvent.prompt();
            await installEvent.userChoice;
            setInstallEvent(null);
          }}
        >
          Instalar
        </Button>
      </Banner>
    );
  }

  if (showIos) {
    return (
      <Banner icon={<Share className="size-5" />} onClose={dismiss}>
        <p className="font-medium">Instala BowlingX</p>
        <p className="text-xs text-muted">
          Toca <Share className="inline size-3.5 align-[-2px]" /> <b>Compartir</b> y luego <b>Agregar a inicio</b>.
        </p>
      </Banner>
    );
  }
  return null;
}
