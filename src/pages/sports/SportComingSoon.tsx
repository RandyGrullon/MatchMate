import { SportSplash } from '../../components/splash/SportSplash';
import { ActionLink } from '../../components/home/TodayCard';
import { Card } from '../../components/ui';
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
 * están en beta). Cada fase lo reemplaza por las pantallas de su deporte en LeagueShell y EventPage. Rediseño «Calma y
 * foco»: el nombre como título, el deporte en su color y una tarjeta con la escena del deporte y qué pasa, en una frase.
 */
export default function SportComingSoon({ sport, leagueName, kind = 'liga' }: SportComingSoonProps) {
  const meta = getSport(sport);
  const Icon = meta.icon;
  return (
    <div className="animate-fade-up mx-auto flex w-full max-w-md flex-col px-2">
      {leagueName && <h1 className="mt-1 text-title break-words">{leagueName}</h1>}
      <p className="mt-1.5 flex items-center gap-1.5 text-meta font-semibold text-accent">
        <Icon aria-hidden="true" className="size-4" /> {meta.label}
      </p>
      <Card className="mt-5 flex flex-col items-center gap-4 px-5 pt-6 pb-5 text-center">
        {/* La escena del deporte aunque todavía no salga al abrir la app. */}
        <SportSplash scene={meta.scene} word={false} width={200} label={`Animación de ${meta.lower}`} />
        <div>
          <p className="text-[19px] leading-[1.3] font-[650]">Sus pantallas llegan pronto</p>
          <p className="mt-1 text-meta text-muted">
            {kind === 'torneo' ? 'Este torneo' : 'Esta liga'} es de {meta.lower} y ya {kind === 'torneo' ? 'quedó creado' : 'quedó creada'}: cuando lleguen, aparecen aquí
            solas.
          </p>
        </div>
        <ActionLink to="/ligas" variant="quiet" size="lg" className="w-full">
          Ver mis ligas
        </ActionLink>
      </Card>
    </div>
  );
}
