/**
 * «Premios del torneo» de cada deporte en la app (docs/premios-torneo.md §5 y §6.4), como en la web: cada uno arma su
 * competencia y su podio con la lógica compartida (src/prizes/*, src/components/prizes/screens.ts) y monta la tarjeta.
 * - Boliche (EventPrizes de la web): dos podios, «Equipos (scratch)» e «Individual (handicap)», con la regla del torneo.
 * - Golf (GolfPrizes): la ronda suelta o el torneo entero; el podio lo arma el teléfono con el leaderboard.
 * - Raqueta: la noche de americano o mexicano (NightPrizes) y el torneo por categorías (TourneyPrizes y CategoryPrize).
 * - Natación (MeetPrizes): el club y el nadador del encuentro.
 * Los de equipos (relámpago y playoffs) van en pantallas que la app todavía no tiene: siguen en la web.
 */
import { View } from 'react-native';
import { todayIn } from '@mm/badges/rules/periods';
import { useEvents } from '@mm/lib/data/events';
import { useGolfTournament, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { useLeagueBadges } from '@mm/lib/data/leagueBadges';
import type { Match } from '@mm/lib/data/matches';
import { useTournamentPrize } from '@mm/lib/data/prizes';
import type { RacketEvent } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { bowlingStandings } from '@mm/lib/stats';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { bowlingComp } from '@mm/prizes/catalog';
import { bowlingPodium } from '@mm/prizes/providers';
import { bowlingReady } from '@mm/prizes/ready';
import { golfComp, golfProvider, nightProvider, racketNightComp, racketTourneyComp, racketTourneyProvider, swimComp, swimProvider, type GolfPrizeSource } from '@mm/prizes/sports';
import type { StandingRow } from '@mm/sports/types';
import { designLook } from '@mm/components/badges/maker/look';
import { prizesHidden } from '@mm/components/prizes/gate';
import {
  bowlingNameOf,
  bowlingWarnings,
  categoryPrizeOf,
  categoryPrizeVerb,
  golfCompName,
  golfLastDate,
  golfReady,
  golfWaitText,
  MEET_WAIT_TEXT,
  NIGHT_WAIT_TEXT,
  nightReady,
  nightWarnings,
  TOURNEY_WAIT_TEXT,
  tourneyReady,
} from '@mm/components/prizes/screens';
import type { TourneyConfig } from '@mm/pages/sports/racket/logic/tourney';
import type { Names } from '@mm/pages/sports/racket/names';
import { useRacket } from '@mm/pages/sports/racket/sport';
import { placedMeet, type MeetData } from '@mm/pages/sports/swimming/logic';
import { Insignia } from '@/components/badges/Insignia';
import { Txt } from '@/components/ui';
import { font } from '@/theme/tokens';
import { TournamentPrizes } from './TournamentPrizes';

/** La página de la web de un evento (el detalle de una insignia todavía se abre allí). */
const eventPath = (lid: string, eventId: string) => `/l/${lid}/e/${eventId}`;

/**
 * Los premios de un torneo del boliche. El podio de la tarjeta es la clasificación oficial del teléfono (solo juegos
 * verificados); la entrega usa la del servidor, que es la misma cuenta.
 */
export function EventPrizes({ event, entries, players }: { event: BowlingEvent; entries: readonly Entry[]; players: readonly Player[] }) {
  const { lid, league } = useLeagueCtx();
  const today = todayIn(useNow().getTime(), league.tz);
  const comp = bowlingComp(lid, event);
  const readiness = bowlingReady(event, entries, today);
  const standings = bowlingStandings(event, entries);
  const podium = bowlingPodium(event, entries, bowlingNameOf(players), { ready: readiness.ready, standings });
  if (event.type !== 'torneo') return null;
  return (
    <TournamentPrizes comp={comp} ready={readiness.ready} waitText={readiness.waitText} podium={podium} warnings={bowlingWarnings(standings.pending)} webPath={eventPath(lid, event.id)} />
  );
}

/**
 * Golf: individual con la competencia oficial, y si se quiere gross y neto. Una ronda suelta premia su ronda; una de
 * un torneo muestra los premios del torneo entero. Se entrega con la ronda (o todas las del torneo) cerrada.
 */
export function GolfPrizes({
  eventId,
  name,
  date,
  round,
  cards,
  tournamentName,
  nameOf,
}: {
  eventId: string;
  /** El nombre de la ronda (el del evento). */
  name: string;
  date: string;
  round: GolfRoundFull;
  /** Las tarjetas de la ronda como están en el servidor. */
  cards: readonly GolfCardDoc[];
  tournamentName?: string | null;
  nameOf: (playerId: string) => string;
}) {
  const { lid } = useLeagueCtx();
  const tid = round.tournamentId;
  const tournament = useGolfTournament(lid, tid);
  // El día de la última ronda del torneo (la cinta por defecto es su mes).
  const events = useEvents(tid ? lid : undefined);
  const rounds = tournament.data.rounds;
  const lastDate = golfLastDate(tid, rounds, events.data, date);
  const comp = golfComp(lid, { eventId, tournamentId: tid, name: golfCompName(tid, name, tournamentName), date: lastDate });
  const src: GolfPrizeSource = tid ? tournament.data : { rounds: [round], cards };
  const podium = golfProvider(src, nameOf);
  return <TournamentPrizes comp={comp} ready={golfReady(tid, rounds, round)} waitText={golfWaitText(!!tid)} podium={podium} webPath={eventPath(lid, eventId)} />;
}

/** Una noche de americano o mexicano: solo individual, con la tabla de la noche (los 3 primeros que jugaron). */
export function NightPrizes({ event, table, finished, nameOf }: { event: RacketEvent; table: readonly StandingRow[]; finished: boolean; nameOf: (playerId: string) => string }) {
  const { lid, league } = useLeagueCtx();
  const { sport } = useRacket();
  const now = useNow(60_000).getTime();
  const comp = racketNightComp(lid, event, sport);
  const podium = nightProvider(table, nameOf);
  if (!comp) return null;
  return (
    <TournamentPrizes
      comp={comp}
      ready={nightReady(event.date, todayIn(now, league.tz))}
      waitText={NIGHT_WAIT_TEXT}
      podium={podium}
      warnings={nightWarnings(finished)}
      webPath={eventPath(lid, event.id)}
    />
  );
}

/** El torneo de raqueta por categorías: una sección por categoría («Parejas · Categoría A»). */
export function TourneyPrizes({ event, cfg, matches, names, now }: { event: RacketEvent; cfg: TourneyConfig; matches: readonly Match[]; names: Names; now: number }) {
  const { lid } = useLeagueCtx();
  const { sport, leagueRules } = useRacket();
  const comp = racketTourneyComp(lid, event, { sport, leagueRules, categories: cfg.categories });
  const who = { nameOf: names.nameOf, rosterOf: names.rosterOf };
  const podium = racketTourneyProvider(cfg.categories, matches, who, now);
  return <TournamentPrizes comp={comp} ready={tourneyReady(cfg.categories, matches, who, now)} waitText={TOURNEY_WAIT_TEXT} podium={podium} webPath={eventPath(lid, event.id)} />;
}

/** «Se lleva: [insignia] Campeón» junto al cuadro de una categoría (si esa categoría tiene premio de 1.er lugar). */
export function CategoryPrize({ eventId, catId }: { eventId: string; catId: string }) {
  const ctx = useLeagueCtx();
  const { sport } = useRacket();
  // En una liga con menores, las insignias de la liga las ven solo sus miembros.
  const hide = prizesHidden(ctx);
  const prize = useTournamentPrize(hide ? null : ctx.lid, 'evento', eventId);
  const hasSlot = !!prize.data?.slots.some((s) => s.division === catId && s.place === 1);
  const made = useLeagueBadges(hasSlot ? ctx.lid : null);
  const found = categoryPrizeOf(prize.data, made.data.designs, catId);
  if (!found) return null;
  const { slot, design } = found;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
      <Insignia badge={designLook(design, sport, prize.data?.period)} size={40} />
      <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {`${categoryPrizeVerb(slot)}: `}
        <Txt variant="meta" style={{ fontFamily: font.semibold }}>
          {design.name}
        </Txt>
      </Txt>
    </View>
  );
}

/**
 * Natación: el club del encuentro (la insignia le llega a cada nadador del club que nadó) y el nadador del encuentro.
 * Se entrega con el encuentro finalizado. El control de marcas no tiene premios.
 */
export function MeetPrizes({ data }: { data: MeetData }) {
  const { lid, meet, events, entries, clubs, name } = data;
  const comp = swimComp(lid, meet);
  const placed = comp ? placedMeet(events, entries, meet.points) : [];
  const podium = swimProvider(placed, { swimmer: name, club: (id) => clubs.get(id)?.name ?? '(club borrado)' });
  if (!comp) return null;
  return <TournamentPrizes comp={comp} ready={!!meet.finalizedAt} waitText={MEET_WAIT_TEXT} podium={podium} webPath={eventPath(lid, meet.id)} />;
}
