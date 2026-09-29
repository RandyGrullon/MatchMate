import { lazy, Suspense } from 'react';
import { canPickPrizes, useTournamentPrize } from '../../lib/data/prizes';
import { useLeagueCtx } from '../../lib/league';
import type { PrizeComp } from '../../prizes/catalog';
import type { PodiumProvider } from '../../prizes/providers';

/**
 * La tarjeta «Premios del torneo» de una competencia (docs/premios-torneo.md §6.1), liviana: lee la premiación y solo
 * carga la tarjeta (las insignias, «Elegir premios» y «Entregar premios») cuando hay algo que mostrar: premios
 * elegidos, o alguien que puede elegirlos. Cada deporte la monta con su competencia (§6.4); el boliche en
 * src/components/event/EventPrizes.tsx.
 */

const PrizesCard = lazy(() => import('./PrizesCard'));

export interface TournamentPrizesProps {
  comp: PrizeComp;
  /** El resultado ya permite entregar (la base lo vuelve a revisar lugar por lugar). */
  ready: boolean;
  /** Con el botón apagado: «Se entregan cuando termine el torneo». */
  waitText?: string;
  /**
   * El podio de hoy según el teléfono: quién va ganando en la tarjeta, el aviso «El podio cambió» y, donde el servidor
   * no calcula el orden (golf, natación, noches), lo que se entrega.
   */
  podium?: PodiumProvider | null;
  /** Avisos arriba de «Entregar premios» (boliche: juegos por verificar). */
  warnings?: readonly string[];
}

export function TournamentPrizes(props: TournamentPrizesProps) {
  const ctx = useLeagueCtx();
  // En una liga con menores lo ven solo los miembros (como las demás insignias de la liga).
  const hide = !!ctx.league.hasMinors && !ctx.member;
  const prize = useTournamentPrize(hide ? null : ctx.lid, props.comp.scope, props.comp.refId);
  if (hide || prize.loading) return null;
  if (!prize.data && (prize.error || !canPickPrizes(ctx))) return null;
  return (
    <Suspense fallback={null}>
      <PrizesCard {...props} prize={prize.data} />
    </Suspense>
  );
}
