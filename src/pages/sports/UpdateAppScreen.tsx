import { useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';
import { updateApp } from '../../lib/appUpdate';

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
