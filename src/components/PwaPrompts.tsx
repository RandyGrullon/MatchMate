import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { NEEDS_UPDATE_MESSAGE, reloadOnTakeover, startUpdateChecks, updateApp, updatePrompt, updateRequested } from '../lib/appUpdate';
import { useOutboxSnapshot } from '../lib/data';
import { currentOutbox } from '../lib/data/client';
import { installNotice } from '../lib/prompts';
import { useNotice } from './NoticeSlot';
import { Button } from './ui';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'mm:instalar-descartado';
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
 * - algo de la cola espera la versión nueva (el servidor ya no tiene esa función) → actualizar para enviarlo;
 * - hay una versión nueva → botón para actualizar (sin perder lo que se está haciendo hasta que el usuario toque).
 *   Se pregunta por ella al volver a la app, al volver la señal y cada 30 minutos (src/lib/appUpdate.ts). Si otra
 *   pestaña la activó y aquí hay algo por enviar, no se recarga sola: se muestra el aviso. Estos dos siguen flotando
 *   sobre la barra (cuidan lo que falta por enviar);
 * - en Android, «Instalar»; en iPhone, cómo agregarla a la pantalla de inicio. Este ya no flota: es el aviso de
 *   instalar del NoticeSlot de la pantalla (uno solo por pantalla, se cierra con la X y vuelve en 14 días).
 */
export function PwaPrompts() {
  const outbox = useOutboxSnapshot();
  const [takenOver, setTakenOver] = useState(false);
  // Otra versión nueva que quedó esperando después de la primera (workbox ya no la avisa: ver appUpdate.ts).
  const [waitingFound, setWaitingFound] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      if (reg) startUpdateChecks(reg, () => setWaitingFound(true));
    },
    // La versión nueva tomó el control (la activó esta pestaña u otra): sin nada por enviar se recarga como siempre.
    onNeedReload: () => {
      const pending = currentOutbox()?.getSnapshot().pendingCount ?? 0;
      if (reloadOnTakeover({ requested: updateRequested(), pending })) location.reload();
      else setTakenOver(true);
    },
  });
  const [updating, setUpdating] = useState(false);
  const [hideNeedsUpdate, setHideNeedsUpdate] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  // Si se cerró el aviso y la cola vuelve a quedar esperando otra vez, se muestra de nuevo.
  useEffect(() => {
    if (!outbox.needsUpdate) setHideNeedsUpdate(false);
  }, [outbox.needsUpdate]);

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

  function update() {
    setUpdating(true);
    void updateApp();
  }

  // Instalar: el aviso de la pantalla (NoticeSlot). La ruedita del botón la pone el aviso mientras se responde.
  useNotice(
    installEvent
      ? installNotice('prompt', {
          install: async () => {
            await installEvent.prompt();
            await installEvent.userChoice;
            setInstallEvent(null);
          },
          onDismiss: dismiss,
        })
      : showIos && installNotice('ios', { onDismiss: dismiss }),
  );

  const prompt = updatePrompt({ needsUpdate: outbox.needsUpdate && !hideNeedsUpdate, newVersion: needRefresh || takenOver || waitingFound });

  if (prompt === 'needs_update') {
    return (
      <Banner icon={<RefreshCw className="size-5" />} onClose={() => setHideNeedsUpdate(true)}>
        <p className="font-medium">{NEEDS_UPDATE_MESSAGE}</p>
        <Button size="sm" variant="primary" className="mt-1.5" loading={updating} onClick={update}>
          Actualizar
        </Button>
      </Banner>
    );
  }

  if (prompt === 'new_version') {
    return (
      <Banner
        icon={<RefreshCw className="size-5" />}
        onClose={() => {
          setNeedRefresh(false);
          setTakenOver(false);
          setWaitingFound(false);
        }}
      >
        <p className="font-medium">Hay una versión nueva</p>
        {outbox.pendingCount > 0 && <p className="text-xs text-muted">Lo que tienes por enviar queda guardado y sale después de actualizar.</p>}
        <Button size="sm" variant="primary" className="mt-1.5" loading={updating} onClick={update}>
          Actualizar
        </Button>
      </Banner>
    );
  }

  return null;
}
