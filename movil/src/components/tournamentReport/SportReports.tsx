/**
 * «Reporte del torneo» en cada pantalla de torneo de la app, armado como en la web (las mismas entradas para el
 * adaptador de cada deporte de src/lib/report y la misma competencia de los premios):
 * - Boliche (EventPage): un torneo; quien organiza lo tiene en la tarjeta al terminar (bowlingFinished).
 * - Golf (GolfEvent): la ronda suelta o el torneo entero; la tarjeta, al cerrarse (todas las rondas del torneo).
 * - Raqueta (NightPage y TourneyPage): la noche de americano o mexicano y el torneo por categorías. Su tarjeta es de Pro
 *   en la web (la app es Lite): solo la fila.
 * - Natación (MeetPage): va en su «•••» (`swimReportSource`) y, finalizado, la tarjeta para el admin.
 * Donde la web lo tiene en «•••» y la pantalla de la app no tiene «•••», sale la misma fila en una tarjeta.
 */
import { todayIn } from '@mm/badges/rules/periods';
import { useEvents } from '@mm/lib/data/events';
import { useGolfTournament, useGolfTournaments, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import type { Match } from '@mm/lib/data/matches';
import type { RacketEvent } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { bowlingComp } from '@mm/prizes/catalog';
import { bowlingFinished } from '@mm/prizes/ready';
import { golfComp, racketNightComp, racketTourneyComp, swimComp } from '@mm/prizes/sports';
import type { StandingRow } from '@mm/sports/types';
import { golfCompName, golfLastDate, golfReady } from '@mm/components/prizes/screens';
import { bowlingReport } from '@mm/lib/report/bowling';
import { golfReport, golfReportDates } from '@mm/lib/report/golf';
import { racketNightReport, racketTourneyReport } from '@mm/lib/report/racket';
import { swimReport } from '@mm/lib/report/swimming';
import type { ReportLeague } from '@mm/lib/report/model';
import type { NightConfig, NightRound } from '@mm/pages/sports/racket/logic/night';
import type { TourneyConfig } from '@mm/pages/sports/racket/logic/tourney';
import type { Names } from '@mm/pages/sports/racket/names';
import { useRacket } from '@mm/pages/sports/racket/sport';
import type { MeetData } from '@mm/pages/sports/swimming/logic';
import { meetTitle } from '@mm/pages/sports/swimming/swim';
import { ReportButton } from './ReportButton';
import type { ReportSource } from './ReportSheet';

/** Boliche: el reporte de un torneo (las prácticas no tienen). */
export function BowlingReport({ event, entries, players, loading }: { event: BowlingEvent; entries: readonly Entry[]; players: readonly Player[]; loading: boolean }) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const today = todayIn(useNow().getTime(), league.tz);
  if (event.type !== 'torneo') return null;
  const source: ReportSource = {
    report: () =>
      Promise.resolve(bowlingReport({ lid, league, event, entries, players, today })),
    comp: bowlingComp(lid, event),
  };
  // Terminado el torneo, el admin tiene el reporte a la mano (para todos está en la fila).
  const finished = !loading && bowlingFinished(event, entries, today);
  return <ReportButton {...source} look={isAdmin && finished ? 'card' : 'row'} disabled={loading} />;
}

/** Golf: el leaderboard y las tarjetas de la ronda (o de todo el torneo, con sus días). */
export function GolfReport({
  eventId,
  name,
  date,
  title,
  round,
  cards,
  nameOf,
  loading,
}: {
  eventId: string;
  /** El nombre de la ronda (el del evento). */
  name: string;
  date: string;
  /** El nombre de la ronda en pantalla. */
  title: string;
  round: GolfRoundFull;
  /** Las tarjetas con lo anotado en este teléfono. */
  cards: readonly GolfCardDoc[];
  nameOf: (playerId: string) => string;
  /** Mientras se leen los jugadores. */
  loading: boolean;
}) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const tid = round.tournamentId;
  const tournaments = useGolfTournaments(lid);
  const tournamentData = useGolfTournament(lid, tid);
  const tournamentEvents = useEvents(tid ? lid : undefined);
  const tournament = tid ? tournaments.data.find((t) => t.id === tid) : null;
  const rounds = tournamentData.data.rounds;
  const dates = golfReportDates(tid, rounds, tournamentEvents.data, date);
  const source: ReportSource = {
    report: () =>
      Promise.resolve(
        golfReport({
          lid,
          league,
          event: { id: eventId, name, date },
          title,
          round,
          cards,
          tournament: tid ? { id: tid, name: tournament?.name ?? '', rounds, cards: tournamentData.data.cards, dates } : null,
          nameOf,
        }),
      ),
    comp: golfComp(lid, { eventId, tournamentId: tid, name: golfCompName(tid, name, tournament?.name), date: golfLastDate(tid, rounds, tournamentEvents.data, date) }),
  };
  // En un torneo espera también sus días y su nombre: si no, el reporte sale con la fecha de esta ronda sola.
  const disabled = loading || (!!tid && (tournamentData.loading || tournamentEvents.loading || tournaments.loading));
  const finished = golfReady(tid, rounds, round);
  return <ReportButton {...source} look={isAdmin && finished ? 'card' : 'row'} label={tid ? 'Reporte del torneo' : 'Reporte de la ronda'} disabled={disabled} />;
}

/** Raqueta, la noche de americano o mexicano: el podio, las rondas y la tabla que se ven en la pantalla. */
export function NightReport({
  event,
  title,
  cfg,
  rounds,
  table,
  finished,
  names,
  loading,
}: {
  event: RacketEvent;
  title: string;
  cfg: NightConfig;
  rounds: readonly NightRound[];
  table: readonly StandingRow[];
  finished: boolean;
  names: Names;
  loading: boolean;
}) {
  const { lid, league } = useLeagueCtx();
  const { sport } = useRacket();
  const now = useNow().getTime();
  const source: ReportSource = {
    report: () =>
      Promise.resolve(
        racketNightReport({ lid, league, event, title, cfg, rounds: [...rounds], table: [...table], nameOf: names.nameOf, finished, now }),
      ),
    comp: racketNightComp(lid, event, sport),
  };
  return <ReportButton {...source} look="row" label="Reporte de la noche" disabled={loading || names.loading} />;
}

/** Raqueta, el torneo por categorías: los cuadros y las tablas de la pantalla (con alguna categoría). */
export function TourneyReport({ event, title, cfg, matches, names, loading }: { event: RacketEvent; title: string; cfg: TourneyConfig; matches: readonly Match[]; names: Names; loading: boolean }) {
  const { lid, league } = useLeagueCtx();
  const { sport, leagueRules } = useRacket();
  const now = useNow().getTime();
  if (!cfg.categories.length) return null;
  const source: ReportSource = {
    report: () => Promise.resolve(racketTourneyReport({ lid, league, event, title, sport, leagueRules, matches: [...matches], names, now })),
    comp: racketTourneyComp(lid, event, { sport, leagueRules, categories: cfg.categories }),
  };
  return <ReportButton {...source} look="row" label="Reporte del torneo" disabled={loading || names.loading} />;
}

/** Natación: el reporte del encuentro (los resultados y los puntos de la app), para su «•••» y la tarjeta. */
export function swimReportSource(league: ReportLeague, data: MeetData): ReportSource {
  return {
    report: () => Promise.resolve(swimReport({ lid: data.lid, league, title: meetTitle(data.meet), data })),
    comp: swimComp(data.lid, data.meet),
  };
}

/** Natación, la tarjeta del admin al finalizar el encuentro (para todos está en «•••»). */
export function SwimReportCard({ data, loading }: { data: MeetData; loading: boolean }) {
  const { league, isAdmin } = useLeagueCtx();
  if (!isAdmin || !data.meet.finalizedAt) return null;
  return <ReportButton {...swimReportSource(league, data)} look="card" disabled={loading} />;
}
