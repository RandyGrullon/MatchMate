import { useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';

/** Espera (hasta 8 s) a que termine de instalarse la versión nueva que encontró `update()`. */
function whenInstalled(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  const sw = reg.installing;
  if (!sw) return Promise.resolve(reg.waiting);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(reg.waiting);
    };
    const timer = setTimeout(done, 8000);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' || sw.state === 'redundant') done();
    });
  });
}

/**
 * Busca la versión nueva de la app (service worker) y recarga con ella. Sin service worker (o si no hay
 * nada nuevo todavía), solo recarga: lo nuevo llega igual la próxima vez que abra.
 */
export async function updateApp(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update().catch(() => undefined);
      const waiting = reg.waiting ?? (await whenInstalled(reg));
      if (waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        // El service worker de vite-plugin-pwa (registerType 'prompt') espera este mensaje para activarse.
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => location.reload(), 4000);
        return;
      }
    }
  } catch {
    // sin service worker: recargar basta
  }
  location.reload();
}

/**
 * La liga es de un deporte que esta versión no conoce (la base ya tiene uno nuevo y el teléfono tiene la app
 * vieja guardada). En vez de mostrarla como si fuera de boliche, se pide actualizar.
 */
export default function UpdateAppScreen({ sport, leagueName }: { sport: string; leagueName?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="animate-fade-up mx-auto flex w-full max-w-md flex-col items-center gap-3 py-10 text-center" data-sport={sport}>
      <div className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <RefreshCw className="size-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Actualiza la app</h1>
      <p className="text-muted">
        {leagueName ? <>«{leagueName}» es</> : 'Esta liga es'} de un deporte que esta versión de MatchMate todavía no conoce. Actualiza para verla.
      </p>
      <Button
        variant="primary"
        loading={busy}
        icon={<RefreshCw className="size-4" />}
        onClick={() => {
          setBusy(true);
          void updateApp();
        }}
      >
        Actualizar
      </Button>
      <Link to="/ligas" className="mt-2 text-sm font-medium text-accent">
        Ver mis ligas
      </Link>
    </div>
  );
}
