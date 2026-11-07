/**
 * Lo que cada deporte decide al montar «Premios del torneo» (docs/premios-torneo.md §5 y §6.4), sin React: cuándo se
 * prende «Entregar premios», el texto con el botón apagado, los avisos y los nombres. Lo usan las piezas de la web
 * (EventPrizes, GolfPrizes, NightPrizes, TourneyPrizes, MeetPrizes y TeamPrizes) y las de la app
 * (movil/src/components/prizes/SportPrizes.tsx).
 */
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import type { PrizeSlot, TournamentPrize } from '../../lib/data/prizes';
import type { TeamReportNames } from '../../lib/report/team';
import { racketTourneyPlace, type BracketNames, type RacketPrizeCategory, type TeamNames } from '../../prizes/sports';

// ---------- Boliche ----------

/** «Hay 3 juegos por verificar: pueden cambiar el podio.» (null si no hay). */
export function pendingWarning(pending: number): string | null {
  if (pending <= 0) return null;
  return `Hay ${pending} ${pending === 1 ? 'juego' : 'juegos'} por verificar: ${pending === 1 ? 'puede' : 'pueden'} cambiar el podio.`;
}

/** Los avisos de «Entregar premios» del boliche (los juegos por verificar). */
export function bowlingWarnings(pending: number): string[] {
  const warning = pendingWarning(pending);
  return warning ? [warning] : [];
}

/** El nombre de cada jugador del podio del boliche (uno borrado: «(jugador borrado)»). */
export function bowlingNameOf(players: readonly { id: string; name: string }[]): (id: string) => string {
  const names = new Map(players.map((p) => [p.id, p.name] as const));
  return (id) => names.get(id) ?? '(jugador borrado)';
}

// ---------- Raqueta: noches ----------

/** Mientras la noche no termina, la tabla todavía se mueve. */
export const NIGHT_OPEN_WARNING: readonly string[] = ['Todavía no termina: la tabla puede cambiar.'];
const NO_WARNINGS: readonly string[] = [];

export const nightWarnings = (finished: boolean): readonly string[] => (finished ? NO_WARNINGS : NIGHT_OPEN_WARNING);

/** Una noche se entrega desde su día (en la zona de la liga). */
export const nightReady = (eventDate: string, today: string): boolean => eventDate <= today;

export const NIGHT_WAIT_TEXT = 'Se entregan desde el día del evento';

// ---------- Raqueta: torneo por categorías ----------

export const TOURNEY_WAIT_TEXT = 'Se entregan cuando cuente la final de la categoría';

/** Se prende con la primera final que cuenta: cada categoría se entrega cuando cuenta la suya (la base lo revisa). */
export function tourneyReady(categories: readonly RacketPrizeCategory[], matches: Parameters<typeof racketTourneyPlace>[2], who: BracketNames, now: number): boolean {
  return categories.some((c) => racketTourneyPlace(c, 1, matches, who, now).status !== 'sin_resultado');
}

/**
 * «Se lleva: [insignia] Campeón» junto al podio de una categoría: el lugar del 1.º de esa categoría y su diseño (si el
 * superadmin no lo escondió). null si esa categoría no tiene premio.
 */
export function categoryPrizeOf(prize: Pick<TournamentPrize, 'slots'> | null, designs: readonly LeagueBadge[], catId: string): { slot: PrizeSlot; design: LeagueBadge } | null {
  const slot = prize?.slots.find((s) => s.division === catId && s.place === 1) ?? null;
  const design = slot ? designs.find((d) => d.id === slot.badgeId && d.status !== 'oculta') : undefined;
  return slot && design ? { slot, design } : null;
}

/** «Se llevó» ya entregado; «Se lleva» todavía no. */
export const categoryPrizeVerb = (slot: Pick<PrizeSlot, 'deliveredAt'>): string => (slot.deliveredAt ? 'Se llevó' : 'Se lleva');

// ---------- Golf ----------

/** Una ronda suelta se entrega al cerrarla; la de un torneo, cuando se cierran todas. */
export const golfWaitText = (inTournament: boolean): string =>
  inTournament ? 'Se entregan cuando se cierren todas las rondas del torneo' : 'Se entregan cuando se cierre la ronda';

/** El día de la última ronda del torneo (la cinta por defecto es su mes); una ronda suelta, el suyo. */
export function golfLastDate(tournamentId: string | null, rounds: readonly { eventId: string }[], events: readonly { id: string; date: string }[], date: string): string {
  if (!tournamentId) return date;
  const ids = new Set(rounds.map((r) => r.eventId));
  return events.filter((e) => ids.has(e.id)).reduce((d, e) => (e.date > d ? e.date : d), date);
}

/** Listo para entregar: la ronda cerrada o, en un torneo, todas (la de la pantalla va con lo último). */
export function golfReady(tournamentId: string | null, rounds: readonly { eventId: string; closed: boolean }[], round: { eventId: string; closed: boolean }): boolean {
  if (!tournamentId) return round.closed;
  return rounds.length > 0 && rounds.every((r) => (r.eventId === round.eventId ? round.closed : r.closed));
}

/** El nombre de la competencia: el del torneo de golf, o el de la ronda suelta. */
export const golfCompName = (tournamentId: string | null, roundName: string, tournamentName?: string | null): string => (tournamentId ? (tournamentName ?? '') : roundName);

// ---------- Natación ----------

export const MEET_WAIT_TEXT = 'Se entregan cuando se finalice el encuentro';

// ---------- Equipos ----------

export const KO_WAIT_TEXT = 'Se entregan cuando cuente la final';
export const PLAYOFF_WAIT_TEXT = 'Se entregan cuando termine el playoff';

type TeamLookup = { nameOf: (playerId: string) => string; teamOf: (teamId: string) => { name: string; roster: readonly { playerId: string }[] } | null | undefined };

/** Nombres de jugadores y equipos (con su plantilla) para los podios de equipos. */
export function teamNamesOf({ nameOf, teamOf }: TeamLookup): TeamNames {
  return {
    nameOf,
    rosterOf: (teamId) => teamOf(teamId)?.roster.map((r) => r.playerId) ?? [],
    teamName: (teamId) => teamOf(teamId)?.name ?? '(equipo borrado)',
  };
}

/** Los nombres para el reporte del torneo (el equipo borrado: null, y el reporte usa el nombre copiado). */
export function teamReportNames(tl: TeamLookup): TeamReportNames {
  return {
    nameOf: tl.nameOf,
    teamName: (teamId) => tl.teamOf(teamId)?.name ?? null,
    rosterOf: (teamId) => tl.teamOf(teamId)?.roster.map((r) => r.playerId) ?? [],
  };
}
