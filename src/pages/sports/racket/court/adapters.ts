/**
 * Motores de raqueta enchufados al modo cancha (src/court): partido a sets (tenis, pádel, pickleball) y partido
 * a puntos (americano / mexicano). Puro: sin React.
 */
import type { CourtAdapter } from '../../../../court';
import type { MatchScore } from '../../../../lib/data/matches';
import { pointsEngine, serveInfo, type PointsConfig, type PointsEvent, type PointsState } from '../../../../sports/formats';
import {
  applyRacket,
  completeMatch,
  createRacketEngine,
  initRacket,
  matchTotals,
  racketResult,
  resolveRules,
  toLive,
  type MatchSetup,
  type RacketEvent,
  type RacketRules,
  type RacketSport,
  type RacketState,
} from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Reglas del motor desde matches.rules (o leagues.rules): `{ match: {...} }`. Si no sirven, las de por defecto. */
export function engineRules(sport: RacketSport, rules: unknown): RacketRules {
  const m = isObj(rules) && isObj(rules.match) ? (rules.match as Partial<RacketRules>) : {};
  try {
    return resolveRules(sport, { ...m, sport } as Partial<RacketRules>);
  } catch {
    return resolveRules(sport, {});
  }
}

/** matches.score de un estado de raqueta: texto, sets (o juegos) de cada lado, totales para las tablas y foto «en vivo». */
export function racketScore(state: RacketState): MatchScore {
  const t = matchTotals(state);
  return {
    text: racketResult(state).summary,
    sides: [t.sets[0], t.sets[1]],
    totals: { sets: t.sets, games: t.games, points: t.points },
    live: toLive(state) as unknown as Record<string, unknown>,
  };
}

/** Partido a sets en la cancha. Publica al terminar cada juego o set (o cada minuto): nunca por punto. */
export function racketAdapter(sport: RacketSport, rules: unknown): CourtAdapter<MatchSetup, RacketState, RacketEvent> {
  const engine = createRacketEngine(sport, engineRules(sport, rules));
  return {
    engine,
    score: racketScore,
    milestone: (prev, next) => {
      const a = toLive(prev);
      const b = toLive(next);
      return a.done.length !== b.done.length || a.now.join() !== b.now.join() || b.over;
    },
  };
}

/** Marcador de un W.O. con el motor: el que vino gana todo (6-0 6-0 en pádel y tenis; 11-0 en pickleball). */
export function walkoverScore(sport: RacketSport, rules: unknown, absent: Side): MatchScore {
  const s = applyRacket(initRacket(engineRules(sport, rules)), { type: 'walkover', side: absent });
  const full = completeMatch(s);
  const t = matchTotals(s);
  return { text: racketResult(full).summary, sides: [t.sets[0], t.sets[1]], totals: { sets: t.sets, games: t.games, points: t.points } };
}

/** matches.score de un partido a puntos. */
export const pointsScore = (s: PointsState): MatchScore => ({ text: `${s.score[0]}-${s.score[1]}`, sides: [s.score[0], s.score[1]] });

/** Partido a puntos (americano / mexicano). Publica cuando cambia el saque (cada 4 puntos) y al terminar. */
export function pointsAdapter(): CourtAdapter<PointsConfig, PointsState, PointsEvent> {
  return {
    engine: pointsEngine,
    score: pointsScore,
    milestone: (prev, next) => serveInfo(prev).turn !== serveInfo(next).turn || pointsEngine.isOver(next),
  };
}
