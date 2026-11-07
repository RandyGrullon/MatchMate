/**
 * Si se ve «Premios del torneo» (docs/premios-torneo.md §6.1), antes de cargar la tarjeta: liviano a propósito (lo
 * importa TournamentPrizes.tsx, que carga la tarjeta aparte). Lo usan la web y la app.
 */
import type { TournamentPrize } from '../../lib/data/prizes';

/** En una liga con menores, los premios (como las demás insignias de la liga) los ven solo los miembros. */
export const prizesHidden = (ctx: { league: { hasMinors?: boolean | null }; member: unknown }): boolean => !!ctx.league.hasMinors && !ctx.member;

/** Sin premios elegidos no hay tarjeta si no se pudieron leer o si quien mira no los puede elegir. */
export const noPrizes = (prize: { data: TournamentPrize | null; error: Error | null }, canPick: boolean): boolean => !prize.data && (!!prize.error || !canPick);
