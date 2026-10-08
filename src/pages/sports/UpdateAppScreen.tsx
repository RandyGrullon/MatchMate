import { useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { updateApp } from '../../lib/appUpdate';

/**
 * La liga es de un deporte que esta versión no conoce (la base ya tiene uno nuevo y el teléfono tiene la app
 * vieja guardada). En vez de mostrarla como si fuera de boliche, se pide actualizar. Rediseño «Calma y foco»: una
 * tarjeta con qué pasa en una frase y UN botón.
 */
export default function UpdateAppScreen({ sport, leagueName }: { sport: string; leagueName?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="animate-fade-up mx-auto flex w-full max-w-md flex-col px-2" data-sport={sport}>
      <h1 className="mt-1 text-title">Actualiza la app</h1>
      <Card className="mt-5 flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <RefreshCw className="size-5" />
          </span>
          <p className="text-meta text-fg-2">
            {leagueName ? <>«{leagueName}» es</> : 'Esta liga es'} de un deporte que esta versión de MatchMate todavía no conoce. Actualiza para verla.
          </p>
        </div>
        <Button
          variant="primary"
          size="xl"
          loading={busy}
          icon={<RefreshCw className="size-5" />}
          onClick={() => {
            setBusy(true);
            void updateApp();
          }}
        >
          Actualizar
        </Button>
      </Card>
      <Link to="/ligas" className="mx-auto mt-3 inline-flex min-h-11 items-center text-meta font-[550] text-accent">
        Ver mis ligas
      </Link>
    </div>
  );
}
