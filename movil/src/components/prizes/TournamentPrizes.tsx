/**
 * La sección «Premios del torneo» de una competencia (TournamentPrizes de la web, docs/premios-torneo.md §6.1): lee
 * la premiación y solo dibuja la tarjeta cuando hay algo que mostrar (premios elegidos, o alguien que puede elegirlos).
 * Cada deporte la monta con su competencia (SportPrizes.tsx). Necesita el contexto de la liga (LeagueScope).
 */
import { canPickPrizes, useTournamentPrize } from '@mm/lib/data/prizes';
import { useLeagueCtx } from '@mm/lib/league';
import { noPrizes, prizesHidden } from '@mm/components/prizes/gate';
import type { PrizeComp } from '@mm/prizes/catalog';
import type { PodiumProvider } from '@mm/prizes/providers';
import { PrizesCard } from './PrizesCard';

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
  /** La página de la web de esta competencia: el detalle de una insignia (DesignSheet) todavía se abre allí. */
  webPath: string;
}

export function TournamentPrizes(props: TournamentPrizesProps) {
  const ctx = useLeagueCtx();
  // En una liga con menores lo ven solo los miembros (como las demás insignias de la liga).
  const hide = prizesHidden(ctx);
  const prize = useTournamentPrize(hide ? null : ctx.lid, props.comp.scope, props.comp.refId);
  if (hide || prize.loading) return null;
  if (noPrizes(prize, canPickPrizes(ctx))) return null;
  return <PrizesCard {...props} prize={prize.data} />;
}
