import { Link } from 'react-router';
import { SportSplash } from '../../components/splash/SportSplash';
import { Badge } from '../../components/ui';
import { getSport } from '../../sports/registry';
import type { SportId } from '../../sports/types';

export interface SportComingSoonProps {
  sport: SportId;
  /** Nombre de la liga o del torneo. */
  leagueName?: string;
  kind?: 'liga' | 'torneo';
}

/**
 * Lo que se ve dentro de una liga de un deporte cuyas pantallas todavía no están en esta versión (los que
 * están en beta). Cada fase lo reemplaza por las pantallas de su deporte en LeagueShell y EventPage.
 */
export default function SportComingSoon({ sport, leagueName, kind = 'liga' }: SportComingSoonProps) {
  const meta = getSport(sport);
  const Icon = meta.icon;
  return (
    <div className="animate-fade-up mx-auto flex w-full max-w-md flex-col items-center gap-4 py-4 text-center">
      <div className="w-full rounded-2xl border border-line bg-surface py-6">
        {/* La escena del deporte aunque todavía no salga al abrir la app. */}
        <SportSplash scene={meta.scene} word={false} width={200} label={`Animación de ${meta.lower}`} />
      </div>
      <Badge tone="accent">
        <Icon className="size-3" /> {meta.label}
      </Badge>
      {leagueName && <h1 className="text-xl font-bold tracking-tight">{leagueName}</h1>}
      <p className="text-muted">
        {kind === 'torneo' ? 'Este torneo' : 'Esta liga'} es de {meta.lower}. Sus pantallas llegan en la próxima fase.
      </p>
      <p className="text-sm text-muted">
        Ya {kind === 'torneo' ? 'quedó creado' : 'quedó creada'}: cuando lleguen, aparecen aquí sin que tengas que hacer nada.
      </p>
      <Link to="/ligas" className="text-sm font-medium text-accent">
        Ver mis ligas
      </Link>
    </div>
  );
}
