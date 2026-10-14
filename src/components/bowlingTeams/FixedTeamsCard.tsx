import { Shield } from 'lucide-react';
import { applyLeagueTeams, useBowlingTeams } from '../../lib/data/bowlingTeams';
import { useLeagueCtx } from '../../lib/league';
import type { BowlingEvent } from '../../lib/types';
import { useBusy } from '../busy';
import { useAction, useFeedback } from '../feedback';
import { Button, Card } from '../ui';
import { playersWord } from './parts';

/**
 * Torneo › Equipos (quien organiza), si la liga tiene equipos fijos: «Usar los equipos fijos de la liga» (cada
 * inscrito que está en uno pasa a su equipo en este torneo) y que los que se inscriban después entran solos al suyo.
 */
export function FixedTeamsCard({ event, entries }: { event: Pick<BowlingEvent, 'id' | 'teams'>; entries: readonly { teamId: string | null }[] }) {
  const { lid, league } = useLeagueCtx();
  const teams = useBowlingTeams(league.kind === 'torneo' ? null : lid);
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const busy = useBusy();
  const n = teams.data.length;
  if (!n) return null;

  const apply = async () => {
    // Ya hay equipos armados aquí: se avisa antes de cambiar a alguien.
    if (Object.keys(event.teams ?? {}).length || entries.some((e) => e.teamId)) {
      const yes = await confirm({
        title: '¿Usar los equipos fijos?',
        message: 'Cada inscrito que está en un equipo fijo pasa a su equipo en este torneo. Los demás se quedan como están.',
        confirmText: 'Usar',
      });
      if (!yes) return;
    }
    await busy.run('fijos', async () => {
      // La base dice cuántos inscritos quedaron con su equipo.
      const done = await run(() => applyLeagueTeams(lid, event.id));
      if (done != null) toast(done ? `${playersWord(done)} con su equipo` : 'Ningún inscrito está en un equipo fijo');
    });
  };

  return (
    <Card className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Shield aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="font-semibold">
            La liga tiene {n} {n === 1 ? 'equipo fijo' : 'equipos fijos'}
          </p>
          <p className="text-sm text-muted">Quien se inscribe en este torneo entra solo a su equipo.</p>
        </div>
      </div>
      <Button variant="soft" loading={busy.isBusy('fijos')} disabled={!entries.length || busy.isBusy()} onClick={() => void apply()} className="shrink-0">
        Usar los equipos fijos de la liga
      </Button>
    </Card>
  );
}
