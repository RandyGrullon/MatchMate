/**
 * Las familias de raqueta, equipos, periodos y cuenta para el motor (engine.ts `FAMILIES`): qué evaluador corre con
 * cada id del catálogo. Van en un archivo aparte para que ningún evaluador importe al motor en tiempo de ejecución.
 */
import type { EvaluatorSet } from '../engine';
import { accountActivity, community, racketDebut, teamDebut } from './account';
import { boxMonth, ladderMonth } from './boxes';
import { monthAccount, monthLeague, monthStreakEval } from './month';
import { racketCareer, racketMatch, racketNight, racketPodium } from './racket';
import { seasonLeague, seasonStaff } from './season';
import { basketballCareer, basketballMatch, footballCareer, footballMatch, teamCareer, teamMatch, teamPodium } from './team';
import { yearAccount, yearLeague } from './year';

/** Pádel, tenis y pickleball (§2.3), con su debut y su podio de torneo. */
export const RACKET_EVALUATORS: EvaluatorSet = {
  debut: racketDebut,
  racket_career: racketCareer,
  racket_match: racketMatch,
  racket_night: racketNight,
  event_podium: racketPodium,
};

/** Baloncesto, fútbol y sala (§2.4–§2.6), con su debut y el podio del torneo relámpago. */
export const TEAM_EVALUATORS: EvaluatorSet = {
  debut: teamDebut,
  team_career: teamCareer,
  team_match: teamMatch,
  basketball_career: basketballCareer,
  basketball_match: basketballMatch,
  football_career: footballCareer,
  football_match: footballMatch,
  event_podium: teamPodium,
};

/** Mes, cajas, escalera, año y temporada (§2.9–§2.11), para todos los deportes. */
export const PERIOD_EVALUATORS: EvaluatorSet = {
  month_league: monthLeague,
  month_account: monthAccount,
  month_streak: monthStreakEval,
  box_month: boxMonth,
  ladder_month: ladderMonth,
  year_account: yearAccount,
  year_league: yearLeague,
  season_league: seasonLeague,
  season_staff: seasonStaff,
};

/** De cuenta y comunidad (§2.1 y §2.12). */
export const ACCOUNT_EVALUATORS: EvaluatorSet = {
  account_activity: accountActivity,
  community,
};
