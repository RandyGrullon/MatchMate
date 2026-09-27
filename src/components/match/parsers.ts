import type { MatchScore } from '../../lib/data/matches';
import { validatePointsScore, type PointsConfig } from '../../sports/formats/social';
import { matchTotals, racketResult, stateFromScore, type MatchSetup, type RacketRules } from '../../sports/racket';
import type { Side } from '../../sports/types';

/**
 * Modo «solo resultado»: de lo que se escribe («6-4 3-6 10-7», «78-72», «2-1») al resultado del partido.
 * Cada deporte enchufa su lector en ResultEntryModal. Un lector lanza un Error con el mensaje en español
 * (se muestra debajo del campo) o devuelve el resultado.
 */

export interface ParsedResult {
  /** Lo que se guarda en matches.score. */
  score: MatchScore;
  /** null = empate. */
  winner: Side | null;
  /** Estado final para guardar con el resultado (opcional). */
  state?: Record<string, unknown>;
  /** Frase para confirmar («Gana el lado 1, 2 sets a 1»). */
  summary?: string;
}

export type ResultParser = (text: string) => ParsedResult;

const TWO = /^\s*(\d{1,4})\s*(?:[-–—:/x]|\s)\s*(\d{1,4})\s*$/i;

/**
 * Dos números (deportes de equipo y marcadores simples): «78-72», «2 - 1», «2:1», «78 72». Lado 1 primero.
 * `allowDraw` (fútbol) acepta empates; `max` limita cada número.
 */
export function twoNumbersParser(opts: { allowDraw?: boolean; max?: number; unit?: string } = {}): ResultParser {
  const max = opts.max ?? 999;
  return (text) => {
    const m = TWO.exec(text ?? '');
    if (!m) throw new Error('Escribe los dos números, el de tu izquierda primero: 78-72.');
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > max || b > max) throw new Error(`Cada número va de 0 a ${max}.`);
    if (a === b && !opts.allowDraw) throw new Error('Aquí no hay empates: revisa el marcador.');
    const winner: Side | null = a === b ? null : a > b ? 1 : 2;
    const unit = opts.unit ? ` ${opts.unit}` : '';
    return {
      score: { text: `${a}-${b}`, sides: [a, b] },
      winner,
      summary: winner ? `Gana el lado ${winner}, ${Math.max(a, b)} a ${Math.min(a, b)}${unit}` : `Empate ${a} a ${b}${unit}`,
    };
  };
}

/**
 * Raqueta (tenis, pádel, pickleball) con las reglas de la liga: «6-4 3-6 10-7», «7-6(5) 6-4», «11-7 9-11 11-5».
 * Usa el motor de src/sports/racket: el marcador tiene que terminar el partido con esas reglas. `score.totals`
 * lleva sets, juegos y puntos (para las tablas sin volver a leer el estado).
 */
export function racketResultParser(rules: RacketRules, setup?: MatchSetup): ResultParser {
  return (text) => {
    const state = stateFromScore(rules, text, setup);
    const r = racketResult(state);
    const t = matchTotals(state);
    const unit = rules.sport === 'pickleball' ? 'juegos' : 'sets';
    return {
      score: { text: r.summary, sides: [t.sets[0], t.sets[1]], totals: { sets: t.sets, games: t.games, points: t.points } },
      winner: r.winner,
      summary: `Gana el lado ${r.winner}, ${Math.max(...t.sets)} ${unit} a ${Math.min(...t.sets)}`,
    };
  };
}

/** Americano o mexicano: los puntos de cada lado («15-9»), que suman el total de la noche si es por total. */
export function pointsResultParser(config: PointsConfig): ResultParser {
  const two = twoNumbersParser({ allowDraw: true, max: 99, unit: 'puntos' });
  return (text) => {
    const r = two(text);
    const [a, b] = r.score.sides!;
    const err = validatePointsScore(config, a, b);
    if (err) throw new Error(err);
    return r;
  };
}

/** Prueba un lector sin lanzar: el resultado o el mensaje de error. */
export function tryParse(parser: ResultParser, text: string): { ok: true; value: ParsedResult } | { ok: false; error: string } {
  try {
    return { ok: true, value: parser(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No entiendo ese marcador.' };
  }
}
