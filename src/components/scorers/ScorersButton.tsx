import { lazy, Suspense, useState } from 'react';
import { ClipboardPen } from 'lucide-react';
import type { ScorerTarget } from '../../lib/data/scorers';
import { useLeagueCtx } from '../../lib/league';
import { useBusy } from '../busy';
import { Button } from '../ui';

// La hoja se baja al tocar el botón: quien no abre «Anotadores» no la carga (el botón gira mientras llega).
const loadSheet = () => import('./ScorersSheet');
const ScorersSheet = lazy(loadSheet);

export interface ScorersButtonProps {
  /** El torneo de la pantalla: el texto de los avisos («anotar en Copa Aniversario») y a dónde llevan. */
  target: ScorerTarget;
  /** Los jugadores que juegan este torneo (marca «Juega»). Sin lista (no se sabe), nadie sale con «Juega». */
  participants?: readonly string[];
  /** Con el texto «Anotadores» (en las filas de botones del admin); sin él, solo el ícono (en la cabecera). */
  labeled?: boolean;
  className?: string;
}

/**
 * El botón «Anotadores» de cada pantalla de torneo (docs/anotadores.md §8.1): solo lo ve el dueño o un admin. Abre la
 * hoja para elegir anotadores de la liga, invitarlos por su @usuario o mandar el link para anotar.
 */
export function ScorersButton({ target, participants, labeled = false, className }: ScorersButtonProps) {
  const { isAdmin } = useLeagueCtx();
  const [open, setOpen] = useState(false);
  const loading = useBusy();
  if (!isAdmin) return null;
  const start = async () => {
    await loading.run('abrir', () => loadSheet().catch(() => undefined));
    setOpen(true);
  };
  return (
    <>
      {labeled ? (
        <Button size="sm" className={className} icon={<ClipboardPen className="size-4" />} loading={loading.isBusy()} onClick={() => void start()}>
          Anotadores
        </Button>
      ) : (
        <Button
          variant="ghost"
          className={className}
          loading={loading.isBusy()}
          onClick={() => void start()}
          aria-label="Anotadores"
          title="Anotadores"
          icon={<ClipboardPen className="size-5" />}
        />
      )}
      {open && (
        <Suspense fallback={null}>
          <ScorersSheet target={target} participants={participants} open onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
