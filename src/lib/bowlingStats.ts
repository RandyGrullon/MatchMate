/**
 * Números del boliche que salen de los cuadros (al estilo de las apps de boliche): porcentajes de strikes, spares y
 * cuadros abiertos, la primera bola, rachas y juegos limpios; la tendencia (promedio por mes, media móvil y si vas
 * subiendo o bajando); los spares según lo que quedó parado; y el análisis pino por pino con tus fuertes y débiles
 * en palabras.
 *
 * Todo es puro (sin React ni base): recibe los juegos y devuelve números. Reusa los helpers de src/lib/bowling.ts y
 * de las insignias (src/badges/rules/bowling.ts: framesMatch, rackLeaves, longestStrikeRun) para contar igual en todos
 * lados. Solo cuentan los cuadros que cuadran con el puntaje (un juego completo que suma lo anotado): si el admin
 * cambió el total después, esos cuadros ya no valen.
 */
import { ALL_PINS, bitCount, frameStats, isSplit, standingNow } from './bowling';
import { framesMatch, longestStrikeRun, rackLeaves } from '../badges/rules/bowling';
import type { GameFrames } from './types';

// ---------------------------------------------------------------------------------------------------------
// Juegos

/** Un juego para las estadísticas: el puntaje, el día y, si se anotó por cuadros, sus tiros. */
export interface StatGame {
  score: number;
  /** YYYY-MM-DD. */
  date: string;
  frames?: GameFrames | null;
  /** Texto del tooltip de la gráfica (evento, juego y fecha). */
  label?: string;
}

/**
 * Los juegos que cuentan de una participación (con puntaje y foto, importado o anotado sin foto que vale), con sus
 * cuadros. `label` arma el texto de cada juego (índice desde 0).
 */
export function entryStatGames(
  entry: { scores?: readonly (number | null)[] | null; photos?: readonly (string | null)[] | null; frames?: Record<string, GameFrames> | null },
  date: string,
  label?: (game: number) => string,
): StatGame[] {
  const out: StatGame[] = [];
  (entry.scores ?? []).forEach((score, i) => {
    if (score == null || !entry.photos?.[i]) return;
    out.push({ score, date, frames: entry.frames?.[String(i)] ?? null, ...(label ? { label: label(i) } : {}) });
  });
  return out;
}

/** Los juegos de un día de juegos sueltos (todos cuentan), con sus cuadros. */
export function soloStatGames(
  session: { playedOn: string; scores: readonly number[]; frames?: Record<string, GameFrames> | null },
  label?: (game: number) => string,
): StatGame[] {
  return session.scores.map((score, i) => ({
    score,
    date: session.playedOn,
    frames: session.frames?.[String(i)] ?? null,
    ...(label ? { label: label(i) } : {}),
  }));
}

/** Del más viejo al más nuevo (estable: los del mismo día quedan en el orden en que vienen). */
export const byDate = <T extends { date: string }>(games: readonly T[]): T[] => [...games].sort((a, b) => a.date.localeCompare(b.date));

/** Los cuadros que valen: el juego está completo y suma lo anotado. */
export function countedFrames(games: readonly Pick<StatGame, 'score' | 'frames'>[]): GameFrames[] {
  return games.flatMap((g) => (g.frames && framesMatch(g.frames, g.score) ? [g.frames] : []));
}

/** ¿El juego se anotó tocando los pines (al menos un tiro con pines)? */
export const hasPins = (f: GameFrames) => !!f.masks?.some((m) => m != null);

// ---------------------------------------------------------------------------------------------------------
// Racks: cada vez que se tira con los 10 pinos parados

/** Un «rack»: la primera bola con los 10 pinos parados y, si hubo, la segunda. */
export interface Rack {
  /** Índice del primer tiro en la lista de tiros. */
  roll: number;
  /** Cuadro (0 a 9). */
  frame: number;
  first: number;
  /** Pinos de la segunda bola; null si fue strike o no se tiró (la bola extra del 10). */
  second: number | null;
  strike: boolean;
  spare: boolean;
  /**
   * Pinos parados después de la primera bola (bit 0 = pin 1), si se anotaron los pines y cuadran con el tiro; 0 en un
   * strike con pines. null = no se sabe (anotado por teclado).
   */
  leave: number | null;
}

/** Los racks de un juego, con las bolas extra del cuadro 10 (tras un strike o un spare se vuelve a parar todo). */
export function racksOf(rolls: readonly number[], masks?: readonly (number | null)[] | null): Rack[] {
  const out: Rack[] = [];
  for (let i = 0; i < rolls.length; i++) {
    const before = standingNow(rolls.slice(0, i));
    if (!before?.fresh) continue;
    const first = rolls[i];
    const strike = first === 10;
    const second = !strike && i + 1 < rolls.length ? rolls[i + 1] : null;
    const knocked = masks?.[i];
    let leave: number | null = null;
    if (knocked != null) {
      const left = ALL_PINS & ~knocked;
      if (bitCount(left) === 10 - first) leave = left;
    }
    out.push({ roll: i, frame: before.frame, first, second, strike, spare: second != null && first + second === 10, leave });
  }
  return out;
}

/** Índices de los tiros que dejaron un split (para marcarlos con un círculo en la hoja). */
export function splitRolls(rolls: readonly number[], masks?: readonly (number | null)[] | null): number[] {
  if (!masks?.some((m) => m != null)) return [];
  return racksOf(rolls, masks)
    .filter((r) => !r.strike && r.leave != null && isSplit(r.leave))
    .map((r) => r.roll);
}

// ---------------------------------------------------------------------------------------------------------
// Porcentajes

/** Porcentaje entero (hacia el más cercano); null sin intentos. */
export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part * 100) / total) : null;
}

export interface FrameRates {
  /** Juegos anotados por cuadros que cuentan. */
  games: number;
  strikes: number;
  /** Tiros con los 10 pinos parados (incluye las bolas extra del 10). */
  strikeChances: number;
  /** Cuadros sin strike que se cerraron con la segunda bola (en el 10, solo si su primera bola no fue strike). */
  spares: number;
  /** Cuadros sin strike (en el 10, el que empezó sin strike; sus bolas extra no cuentan). */
  spareChances: number;
  opens: number;
  /** Cuadros jugados (10 por juego). */
  frames: number;
  strikePct: number | null;
  sparePct: number | null;
  openPct: number | null;
  /** Promedio de pinos de la primera bola de cada cuadro, con un decimal. */
  firstBall: number | null;
  /** Racha más larga de strikes seguidos en un juego. */
  bestStrikeRun: number;
  /** Juegos sin cuadros abiertos. */
  cleanGames: number;
}

/**
 * Porcentajes de los juegos anotados por cuadros: strikes sobre los tiros con los 10 parados (con las bolas extra del
 * 10, como frameStats), spares sobre los cuadros sin strike (el 10 solo si empezó sin strike: un spare en sus bolas
 * extra no cuenta), abiertos sobre los cuadros y la primera bola por cuadro.
 */
export function frameRates(games: readonly GameFrames[]): FrameRates {
  let strikes = 0;
  let spares = 0;
  let opens = 0;
  let strikeChances = 0;
  let spareChances = 0;
  let firstSum = 0;
  let firstCount = 0;
  let bestStrikeRun = 0;
  let cleanGames = 0;
  for (const g of games) {
    const s = frameStats(g.rolls);
    strikes += s.strikes;
    opens += s.opens;
    firstSum += s.firstBalls.reduce((a, b) => a + b, 0);
    firstCount += s.firstBalls.length;
    if (s.opens === 0) cleanGames++;
    bestStrikeRun = Math.max(bestStrikeRun, longestStrikeRun(g.rolls));
    // El primer rack de cada cuadro es su primera bola: sin strike, es una oportunidad de spare.
    const seen = new Set<number>();
    for (const r of racksOf(g.rolls)) {
      strikeChances++;
      if (seen.has(r.frame)) continue;
      seen.add(r.frame);
      if (r.strike || r.second == null) continue;
      spareChances++;
      if (r.spare) spares++;
    }
  }
  const frames = games.length * 10;
  return {
    games: games.length,
    strikes,
    strikeChances,
    spares,
    spareChances,
    opens,
    frames,
    strikePct: percent(strikes, strikeChances),
    sparePct: percent(spares, spareChances),
    openPct: percent(opens, frames),
    firstBall: firstCount ? Math.round((firstSum * 10) / firstCount) / 10 : null,
    bestStrikeRun,
    cleanGames,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Tendencia

export interface MonthAverage {
  /** YYYY-MM. */
  month: string;
  games: number;
  pins: number;
  /** Hacia abajo, como el promedio de las ligas. */
  average: number;
  high: number;
}

/** Promedio de cada mes con juegos, del más viejo al más nuevo. */
export function monthlyAverages(games: readonly Pick<StatGame, 'date' | 'score'>[]): MonthAverage[] {
  const by = new Map<string, MonthAverage>();
  for (const g of games) {
    const month = g.date.slice(0, 7);
    const m = by.get(month) ?? { month, games: 0, pins: 0, average: 0, high: 0 };
    m.games++;
    m.pins += g.score;
    m.high = Math.max(m.high, g.score);
    by.set(month, m);
  }
  return [...by.values()].map((m) => ({ ...m, average: Math.floor(m.pins / m.games) })).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Media móvil de los últimos `window` juegos en cada punto (con los que haya al principio), con un decimal. Se calcula
 * con toda la historia y se corta después, así el primer punto de la gráfica ya trae su media.
 */
export function movingAverage(scores: readonly number[], window = 5): number[] {
  const size = Math.max(1, Math.floor(window));
  let sum = 0;
  return scores.map((s, i) => {
    sum += s;
    if (i >= size) sum -= scores[i - size];
    return Math.round((sum * 10) / Math.min(i + 1, size)) / 10;
  });
}

export interface Trend {
  /** Juegos de cada tramo. */
  size: number;
  /** Promedio de los últimos `size` juegos. */
  recent: number;
  /** Promedio de los `size` de antes. */
  before: number;
  delta: number;
}

/** Los últimos juegos contra los de antes (hasta `size` cada tramo; al menos 3). null con muy pocos juegos. */
export function recentTrend(scores: readonly number[], size = 10): Trend | null {
  const n = Math.min(size, Math.floor(scores.length / 2));
  if (n < 3) return null;
  const avg = (xs: readonly number[]) => Math.floor(xs.reduce((a, b) => a + b, 0) / xs.length);
  const recent = avg(scores.slice(-n));
  const before = avg(scores.slice(-2 * n, -n));
  return { size: n, recent, before, delta: recent - before };
}

/** Diferencia que ya cuenta como subir o bajar (menos es ir parejo). */
export const TREND_STEP = 3;

/** La tendencia dicha en palabras: de quien mira (`mine`, «vas») o de otro jugador («va»). */
export function trendText(t: Trend, mine = true): string {
  const [va, tus] = mine ? ['Vas', 'tus'] : ['Va', 'sus'];
  if (t.delta >= TREND_STEP) return `${va} subiendo: ${tus} últimos ${t.size} juegos promedian ${t.recent}, ${t.delta} más que los ${t.size} anteriores.`;
  if (t.delta <= -TREND_STEP) return `${va} bajando: ${tus} últimos ${t.size} juegos promedian ${t.recent}, ${-t.delta} menos que los ${t.size} anteriores.`;
  return `${va} parejo: ${tus} últimos ${t.size} juegos promedian ${t.recent} (los ${t.size} anteriores, ${t.before}).`;
}

// ---------------------------------------------------------------------------------------------------------
// Spares según lo que quedó

/** Los pinos de una máscara (1 a 10), de menor a mayor. */
export function pinsOf(mask: number): number[] {
  const out: number[] = [];
  for (let p = 0; p < 10; p++) if (mask & (1 << p)) out.push(p + 1);
  return out;
}

/** «Pino 10» si queda uno; «3-6-10» si quedan varios; «Los 10 pinos» si la primera no tumbó ninguno. */
export function leaveName(leave: number): string {
  const pins = pinsOf(leave);
  if (pins.length === 10) return 'Los 10 pinos';
  return pins.length === 1 ? `Pino ${pins[0]}` : pins.join('-');
}

export interface LeaveStat {
  /** Pinos parados después de la primera bola (bit 0 = pin 1). */
  leave: number;
  faced: number;
  converted: number;
  split: boolean;
}

/**
 * Lo que te queda después de la primera bola en los juegos anotados pino por pino y cuántas veces haces el spare. Del
 * que más te queda al que menos (y a igual cantidad, por los pinos).
 */
export function leaveStats(games: readonly GameFrames[]): LeaveStat[] {
  const by = new Map<number, LeaveStat>();
  for (const g of games) {
    for (const r of rackLeaves(g.rolls, g.masks)) {
      const s = by.get(r.leave) ?? { leave: r.leave, faced: 0, converted: 0, split: isSplit(r.leave) };
      s.faced++;
      if (r.converted) s.converted++;
      by.set(r.leave, s);
    }
  }
  return [...by.values()].sort((a, b) => b.faced - a.faced || leaveOrder(a.leave, b.leave));
}

/** Por la cantidad de pinos y después por el número de cada uno («10» antes de «2-4»). */
function leaveOrder(a: number, b: number): number {
  const pa = pinsOf(a);
  const pb = pinsOf(b);
  if (pa.length !== pb.length) return pa.length - pb.length;
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export interface Tally {
  faced: number;
  converted: number;
  pct: number | null;
}

const tally = (list: readonly LeaveStat[]): Tally => {
  const faced = list.reduce((n, l) => n + l.faced, 0);
  const converted = list.reduce((n, l) => n + l.converted, 0);
  return { faced, converted, pct: percent(converted, faced) };
};

export interface SpareSummary {
  /** Todos los racks con segunda bola y pines anotados. */
  all: Tally;
  /** Queda un solo pino. */
  single: Tally;
  /** Varios pinos juntos (sin splits). */
  multi: Tally;
  /** Todo menos los splits. */
  noSplits: Tally;
  splits: Tally;
}

export function spareSummary(leaves: readonly LeaveStat[]): SpareSummary {
  const single = leaves.filter((l) => bitCount(l.leave) === 1);
  const noSplits = leaves.filter((l) => !l.split);
  return {
    all: tally(leaves),
    single: tally(single),
    multi: tally(noSplits.filter((l) => bitCount(l.leave) > 1)),
    noSplits: tally(noSplits),
    splits: tally(leaves.filter((l) => l.split)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Pino por pino

export interface PinStat {
  /** 1 a 10. */
  pin: number;
  /** Veces que se quedó parado después de la primera bola. */
  left: number;
  /** De `racks` (en PinReport), en porcentaje. */
  leftPct: number | null;
  /** Racks con segunda bola en los que era parte de lo que quedó. */
  inLeave: number;
  /** De esos, cuántas veces se hizo el spare. */
  converted: number;
  convertedPct: number | null;
}

export interface PinReport {
  /** Primeras bolas con los pines anotados (incluye strikes y la bola extra del 10). */
  racks: number;
  /** Juegos con pines anotados. */
  games: number;
  pins: PinStat[];
}

/** Cuántas veces te queda cada pino tras la primera bola y cuánto conviertes cuando es parte de lo que quedó. */
export function pinReport(games: readonly GameFrames[]): PinReport {
  const left = Array.from({ length: 10 }, () => 0);
  const inLeave = Array.from({ length: 10 }, () => 0);
  const converted = Array.from({ length: 10 }, () => 0);
  let racks = 0;
  let withPins = 0;
  for (const g of games) {
    if (!hasPins(g)) continue;
    withPins++;
    for (const r of racksOf(g.rolls, g.masks)) {
      if (r.leave == null) continue;
      racks++;
      for (let p = 0; p < 10; p++) {
        if (!(r.leave & (1 << p))) continue;
        left[p]++;
        if (r.second == null) continue;
        inLeave[p]++;
        if (r.spare) converted[p]++;
      }
    }
  }
  return {
    racks,
    games: withPins,
    pins: left.map((l, p) => ({
      pin: p + 1,
      left: l,
      leftPct: percent(l, racks),
      inLeave: inLeave[p],
      converted: converted[p],
      convertedPct: percent(converted[p], inLeave[p]),
    })),
  };
}

/** Primeras bolas con pines que hacen falta para decir algo de los pinos. */
export const MIN_PIN_RACKS = 10;
/** Veces que tiene que haber quedado un pino (o un tipo de spare) para decir algo de él. */
export const MIN_PIN_FACED = 3;

/** Nivel de color (0 a 4) de un porcentaje según los cortes (4 valores, de menor a mayor). */
export function heatLevel(pct: number | null, cuts: readonly [number, number, number, number]): number {
  if (pct == null) return 0;
  let level = 0;
  for (const c of cuts) if (pct >= c) level++;
  return level;
}

/** Cortes del mapa de calor: cuánto te queda cada pino y cuánto lo conviertes. */
export const LEFT_CUTS = [5, 15, 30, 50] as const;
export const CONVERT_CUTS = [40, 60, 75, 90] as const;

export interface PinInsights {
  strengths: string[];
  weaknesses: string[];
}

/**
 * Tus fuertes y débiles en palabras: el pino que más te queda, el que más te cuesta convertir, el que mejor conviertes,
 * los spares de un pino y los splits. Con pocos datos no dice nada (mejor callar que adivinar).
 */
export function pinInsights(report: PinReport, spares: SpareSummary): PinInsights {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (report.racks < MIN_PIN_RACKS) return { strengths, weaknesses };

  // El que más te queda (el 1 no cuenta: quedarse con el 1 es fallar el bolsillo, no un pino).
  const mostLeft = report.pins
    .filter((p) => p.pin !== 1 && (p.leftPct ?? 0) >= 20)
    .sort((a, b) => b.left - a.left || a.pin - b.pin)[0];
  if (mostLeft) weaknesses.push(`Te queda mucho el pino ${mostLeft.pin}: en el ${mostLeft.leftPct}% de tus primeras bolas.`);

  const rated = report.pins.filter((p) => p.inLeave >= MIN_PIN_FACED && p.convertedPct != null);
  const worst = [...rated].sort((a, b) => a.convertedPct! - b.convertedPct! || b.inLeave - a.inLeave || a.pin - b.pin)[0];
  if (worst && worst.convertedPct! < 50) {
    weaknesses.push(`Te cuesta el pino ${worst.pin}: cuando te queda, haces el spare ${worst.converted} de ${worst.inLeave} veces (${worst.convertedPct}%).`);
  }
  const best = [...rated]
    .filter((p) => p !== worst || worst.convertedPct! >= 50)
    .sort((a, b) => b.convertedPct! - a.convertedPct! || b.inLeave - a.inLeave || a.pin - b.pin)[0];
  if (best && best.convertedPct! >= 75) {
    strengths.push(`Fuerte con el pino ${best.pin}: cuando te queda, haces el spare ${best.converted} de ${best.inLeave} veces (${best.convertedPct}%).`);
  }

  const single = spares.single;
  if (single.faced >= 5 && single.pct != null) {
    if (single.pct >= 85) strengths.push(`Casi no fallas los spares de un pino: ${single.converted} de ${single.faced} (${single.pct}%).`);
    else if (single.pct < 70) weaknesses.push(`Se te escapan spares de un pino: haces ${single.converted} de ${single.faced} (${single.pct}%).`);
  }

  const splits = spares.splits;
  if (splits.converted > 0) {
    strengths.push(`Convertiste ${splits.converted} ${splits.converted === 1 ? 'split' : 'splits'} de ${splits.faced}.`);
  } else if (splits.faced >= MIN_PIN_FACED && splits.faced * 10 >= report.racks) {
    weaknesses.push(`Te quedan muchos splits: ${splits.faced} en ${report.racks} primeras bolas.`);
  }
  return { strengths, weaknesses };
}
