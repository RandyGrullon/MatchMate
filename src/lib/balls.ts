/**
 * Mis bolas del boliche: las cuentas, sin React ni base (se prueban solas). Qué bola se elige al anotar (la última que
 * usaste), qué juego va con qué bola en una hoja de juegos sueltos (sin los huecos) y los números de cada bola: juegos,
 * promedio, el más alto, strikes y spares (de los juegos anotados por cuadros) y cuántos juegos lleva desde que se pulió.
 *
 * Los datos: src/lib/data/balls.ts (public.bowling_balls y public.ball_games, 20260930000100_bolas.sql).
 */
import type { BallDesign } from './ballDesign';
import { countedFrames, frameRates } from './bowlingStats';
import { isValidScore } from './stats';
import type { GameFrames } from './types';

// ---------- Tipos ----------

export type BallCover = 'solida' | 'perlada' | 'hibrida' | 'uretano' | 'poliester';

export interface Ball {
  id: string;
  name: string;
  /** Marca ('' si no la puso). */
  brand: string;
  /** Libras (6 a 16). */
  weight: number;
  /** '#rrggbb'. */
  color: string;
  cover: BallCover | null;
  /** YYYY-MM-DD o null. */
  drilledOn: string | null;
  /** La última vez que se pulió (YYYY-MM-DD) o null. */
  resurfacedOn: string | null;
  retired: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * Cómo se ve dibujada (src/lib/ballDesign.ts; set_ball_design, 20260930000300_diseno_bolas.sql); null o sin la
   * clave: lisa con su color (ballDesignOf).
   */
  design?: BallDesign | null;
}

/** Lo que se edita en la hoja de una bola (sin `id`: una nueva). */
export interface BallDraft {
  id?: string | null;
  name: string;
  brand: string;
  weight: number;
  color: string;
  cover: BallCover | null;
  drilledOn: string | null;
  resurfacedOn: string | null;
  retired: boolean;
}

/** Dónde está el juego: un juego suelto, un evento de la liga o un envío («Subir mis juegos»). */
export type BallGameKind = 'solo' | 'event' | 'sub';

/**
 * Lo que se manda por juego a set_game_balls: la bola, null (sin bola) o, en un juego suelto, el número de otro juego
 * (desde 0): «la bola que tiene ahora ese juego» (sin señal no se saben las bolas, pero sí cómo se movieron los juegos).
 */
export type GameBall = string | number | null;

/** Un juego con su bola (lo que devuelve my_ball_games). */
export interface BallGame {
  ball: string;
  kind: BallGameKind;
  /** Id del juego suelto, del evento o del envío. */
  ref: string;
  /** Juego desde 0 (en un envío, el del envío). */
  game: number;
  /** YYYY-MM-DD (null si no se sabe). */
  date: string | null;
  /** Pinos (null si todavía no tiene). */
  score: number | null;
  frames: GameFrames | null;
  /** Cuenta en los promedios (verificado en la liga, envío aprobado; los sueltos siempre). */
  counted: boolean;
}

// ---------- Límites (los mismos de la base) ----------

export const BALL_NAME_MAX = 40;
export const BALL_BRAND_MAX = 40;
export const BALL_MIN_WEIGHT = 6;
export const BALL_MAX_WEIGHT = 16;
/** Bolas por cuenta (las retiradas cuentan). */
export const BALL_MAX = 30;
/** Cada cuántos juegos se recomienda pulirla (las cubiertas reactivas pierden agarre con el aceite). */
export const RESURFACE_EVERY = 60;
/** Juegos que necesita una bola para compararla con las otras. */
export const BALL_MIN_GAMES = 3;

export const BALL_COVERS: readonly { key: BallCover; label: string }[] = [
  { key: 'solida', label: 'Reactiva sólida' },
  { key: 'perlada', label: 'Reactiva perlada' },
  { key: 'hibrida', label: 'Reactiva híbrida' },
  { key: 'uretano', label: 'Uretano' },
  { key: 'poliester', label: 'Poliéster (plástico)' },
];

/** Colores para elegir (el de la bola, para reconocerla en la lista y al anotar). */
export const BALL_COLORS: readonly { hex: string; label: string }[] = [
  { hex: '#1d4ed8', label: 'Azul' },
  { hex: '#0ea5e9', label: 'Celeste' },
  { hex: '#7c3aed', label: 'Morado' },
  { hex: '#db2777', label: 'Rosado' },
  { hex: '#dc2626', label: 'Rojo' },
  { hex: '#ea580c', label: 'Anaranjado' },
  { hex: '#facc15', label: 'Amarillo' },
  { hex: '#16a34a', label: 'Verde' },
  { hex: '#0d9488', label: 'Turquesa' },
  { hex: '#78350f', label: 'Marrón' },
  { hex: '#6b7280', label: 'Gris' },
  { hex: '#111827', label: 'Negro' },
  { hex: '#f8fafc', label: 'Blanco' },
];

export const DEFAULT_BALL_COLOR = BALL_COLORS[0].hex;

export const coverLabel = (c: BallCover | null | undefined) => BALL_COVERS.find((x) => x.key === c)?.label ?? null;

export const colorLabel = (hex: string) => BALL_COLORS.find((c) => c.hex === hex.toLowerCase())?.label ?? 'Otro color';

/** «15 lb · Storm · Reactiva sólida» (lo que se conoce). */
export function ballDetail(b: Pick<Ball, 'weight' | 'brand' | 'cover'>): string {
  return [`${b.weight} lb`, b.brand.trim(), coverLabel(b.cover)].filter(Boolean).join(' · ');
}

/** «Phaze II (15 lb)»: para las listas donde se elige. */
export const ballLabel = (b: Pick<Ball, 'name' | 'weight'>) => `${b.name} (${b.weight} lb)`;

// ---------- La hoja de una bola ----------

export type BallProblem = 'name' | 'brand' | 'weight' | 'color' | 'dates';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lo que no deja guardar (null = todo bien). La base revisa lo mismo (fechas: hasta mañana y de hace 30 años). */
export function ballDraftProblem(d: Pick<BallDraft, 'name' | 'brand' | 'weight' | 'color' | 'drilledOn' | 'resurfacedOn'>, today: string): BallProblem | null {
  const name = d.name.trim();
  if (!name || name.length > BALL_NAME_MAX) return 'name';
  if (d.brand.trim().length > BALL_BRAND_MAX) return 'brand';
  if (!Number.isInteger(d.weight) || d.weight < BALL_MIN_WEIGHT || d.weight > BALL_MAX_WEIGHT) return 'weight';
  if (!/^#[0-9a-f]{6}$/i.test(d.color.trim())) return 'color';
  const oldest = `${Number(today.slice(0, 4)) - 30}${today.slice(4)}`;
  const tomorrow = addDays(today, 1);
  for (const day of [d.drilledOn, d.resurfacedOn]) {
    if (day != null && (!ISO_DATE.test(day) || day < oldest || day > tomorrow)) return 'dates';
  }
  if (d.drilledOn && d.resurfacedOn && d.resurfacedOn < d.drilledOn) return 'dates';
  return null;
}

const PROBLEM_TEXT: Record<BallProblem, string> = {
  name: `Ponle un nombre (hasta ${BALL_NAME_MAX} letras).`,
  brand: `La marca puede tener hasta ${BALL_BRAND_MAX} letras.`,
  weight: `El peso va de ${BALL_MIN_WEIGHT} a ${BALL_MAX_WEIGHT} libras.`,
  color: 'Elige un color.',
  dates: 'Revisa las fechas: no pueden ser del futuro y la pulida va después de perforarla.',
};

export const ballProblemText = (p: BallProblem) => PROBLEM_TEXT[p];

// ---------- Qué bola se elige al anotar ----------

/** Las que salen para elegir: las que no están retiradas (y la que ya tenía el juego, aunque se haya retirado). */
export function pickableBalls(balls: readonly Ball[], keep?: string | null): Ball[] {
  return balls.filter((b) => !b.retired || b.id === keep);
}

/**
 * La bola que se pone sola en un juego nuevo: la última que eligió en este teléfono o, si no, la del último juego que
 * marcó (la del servidor). Una retirada o borrada no; sin ninguna, null (la bola es opcional).
 */
export function defaultBall(balls: readonly Ball[], stored: string | null | undefined, lastUsed: string | null | undefined): string | null {
  for (const id of [stored, lastUsed]) {
    if (id && balls.some((b) => b.id === id && !b.retired)) return id;
  }
  return null;
}

/**
 * La bola de un juego del borrador: la que ya se eligió para ese juego (null = sin bola), si no la del juego anterior
 * que tenga una (se sigue con la misma) y, si no, `auto` (la última que usó).
 */
export function ballForGame(balls: Readonly<Record<string, string | null | undefined>> | null | undefined, game: number, auto: string | null): string | null {
  const own = balls?.[String(game)];
  if (own !== undefined) return own;
  for (let j = game - 1; j >= 0; j--) {
    const before = balls?.[String(j)];
    if (before) return before;
  }
  return auto;
}

/** La bola que más se repite en esos juegos (la de la hoja completa); empate: la del primer juego. null sin ninguna. */
export function commonBall(balls: readonly (string | null | undefined)[]): string | null {
  const count = new Map<string, number>();
  for (const b of balls) if (b) count.set(b, (count.get(b) ?? 0) + 1);
  let best: string | null = null;
  for (const b of balls) if (b && (best == null || count.get(b)! > count.get(best)!)) best = b;
  return best;
}

/**
 * La bola con que se abre un juego propio en la hoja del evento (GamesTab): la que ya tenía ahí (también la de un envío
 * aprobado, que pasa a ese juego) y, en uno sin jugar, `auto` (la última que usó). Uno que ya tiene puntaje pero no
 * bola ahí (lo anotó el admin, o vino de un envío sin bola) sale sin bola: guardarlo no le pone una que no eligió.
 */
export function eventGameBall(had: Readonly<Record<number, string>>, game: number, scored: boolean, auto: string | null): string | null {
  if (game in had) return had[game];
  return scored ? null : auto;
}

/** ¿Todos los juegos tienen la misma bola? Esa (o null si ninguno tiene); `undefined` si hay varias. */
export function sameBall(balls: readonly (string | null | undefined)[]): string | null | undefined {
  const set = new Set(balls.map((b) => b ?? null));
  if (set.size > 1) return undefined;
  return set.size ? [...set][0] : null;
}

/**
 * Las bolas de una hoja de juegos sueltos como quedan al guardar: las casillas vacías (o que no valen) se saltan, igual
 * que los juegos (ver slotsToGames). Devuelve {"<juego desde 0>": bola | null} con todos los juegos.
 */
export function compactBalls(values: readonly string[], balls: Readonly<Record<number, string | null | undefined>>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let n = 0;
  values.forEach((v, i) => {
    if (!v.trim() || !isValidScore(Number(v))) return;
    out[String(n++)] = balls[i] ?? null;
  });
  return out;
}

/** Las bolas de los juegos que tienen puntaje (el envío de «Subir mis juegos»): {"<juego>": bola}; ninguno = null. */
export function ballsOfScored(scores: readonly (number | null)[], balls: Readonly<Record<string, string | null | undefined>>): Record<string, string> | null {
  const out: Record<string, string> = {};
  scores.forEach((s, i) => {
    const b = balls[String(i)];
    if (s != null && b) out[String(i)] = b;
  });
  return Object.keys(out).length ? out : null;
}

/** Las bolas de un lugar por juego (para abrir la hoja con las que tenía). */
export function ballsByGame(games: readonly Pick<BallGame, 'kind' | 'ref' | 'game' | 'ball'>[], kind: BallGameKind, ref: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const g of games) if (g.kind === kind && g.ref === ref) out[g.game] = g.ball;
  return out;
}

/**
 * Las bolas que tiene cada uno de los `games` juegos de un juego suelto: las del servidor (`server`; null = no se
 * pudieron leer) con lo que está en la cola encima (`queued`, el último set_game_balls que no ha llegado: trae todos los
 * juegos). null si no se sabe (sin señal y lo de la cola apunta a bolas que solo tiene el servidor).
 */
export function knownBalls(
  games: number,
  server: Readonly<Record<number, string>> | null,
  queued: Readonly<Record<string, GameBall>> | null,
): Record<number, string> | null {
  const out: Record<number, string> = {};
  for (let i = 0; i < games; i++) {
    const q = queued && String(i) in queued ? queued[String(i)] : undefined;
    if (q === null) continue;
    if (typeof q === 'string') {
      out[i] = q;
      continue;
    }
    // Lo que tiene el servidor en ese juego (o en el otro juego al que apunta el número).
    if (!server) return null;
    const b = server[q ?? i];
    if (b) out[i] = b;
  }
  return out;
}

/**
 * Juntar lo nuevo con lo que reemplaza en la cola (que no salió): un número de lo nuevo apunta a un juego de cómo
 * quedaba con lo de la cola, así que pasa a ser lo que la cola le ponía a ese juego (si no le ponía nada, el número
 * sigue apuntando al servidor).
 */
export function composeBalls(next: Readonly<Record<string, GameBall>>, prev: Readonly<Record<string, GameBall>> | null | undefined): Record<string, GameBall> {
  const out: Record<string, GameBall> = {};
  for (const [k, v] of Object.entries(next)) out[k] = typeof v === 'number' && prev && String(v) in prev ? prev[String(v)] : v;
  return out;
}

/**
 * Sin saber las bolas (sin señal): cómo se movieron los juegos de una hoja de juegos sueltos que ya tenía `before`
 * juegos. Cada juego que queda apunta al que era (un número) y uno nuevo va sin bola; null si no se movió ninguno
 * (mismos juegos en el mismo lugar: no hay nada que mandar).
 */
export function keepBalls(values: readonly string[], before: number): Record<string, number | null> | null {
  const out: Record<string, number | null> = {};
  let n = 0;
  let moved = false;
  values.forEach((v, i) => {
    if (!v.trim() || !isValidScore(Number(v))) return;
    const was = i < before ? i : null;
    if (was !== n) moved = true;
    out[String(n++)] = was;
  });
  return moved || n !== before ? out : null;
}

/** ¿Cambió alguna bola (o sobra alguna de un juego que ya no está)? `next` trae todos los juegos. */
export function ballsChanged(next: Readonly<Record<string, string | null>>, had: Readonly<Record<number, string>>): boolean {
  if (Object.entries(next).some(([k, b]) => (had[Number(k)] ?? null) !== (b ?? null))) return true;
  return Object.keys(had).some((k) => !(k in next));
}

/**
 * La bola de un juego propio guardado en la hoja del evento (GamesTab): {"<juego>": bola | null} para la cola, o null
 * si no hay nada que cambiar. Con puntaje: la elegida (`picked`; undefined = no se pudo elegir, la cuenta no tiene bolas),
 * si no es la que ya tenía y hay alguna (sin bola antes y ahora no se manda nada). Sin puntaje (se borró el juego): se
 * le quita la que tenía.
 */
export function eventBallUpdate(
  had: Readonly<Record<number, string>>,
  game: number,
  score: number | null,
  picked: string | null | undefined,
): Record<string, string | null> | null {
  const before = had[game] ?? null;
  if (score == null) return before ? { [String(game)]: null } : null;
  if (picked === undefined || picked === before) return null;
  return { [String(game)]: picked };
}

/**
 * Las bolas del borrador de «Mis juegos» después de guardar (`value`) o borrar (null) el juego `game`: con puntaje, la
 * elegida (`picked`; undefined = no se pudo elegir y se deja como estaba); sin juego, se quita la suya.
 */
export function draftBallsAfter(
  prev: Readonly<Record<string, string | null>> | null | undefined,
  game: number,
  value: { score: number | null } | null,
  picked: string | null | undefined,
): Record<string, string | null> {
  const out = { ...(prev ?? {}) };
  if (!value) delete out[String(game)];
  else if (value.score != null && picked !== undefined) out[String(game)] = picked;
  return out;
}

/**
 * Las bolas de un envío («Subir mis juegos»): la de cada juego con puntaje (la del borrador, la del juego anterior o
 * `auto`, como se ven: ballForGame). null si la cuenta no tiene bolas para elegir (`canPick`) o ningún juego lleva bola.
 */
export function submissionBalls(
  scores: readonly (number | null)[],
  draft: Readonly<Record<string, string | null | undefined>> | null | undefined,
  auto: string | null,
  canPick: boolean,
): Record<string, string> | null {
  if (!canPick) return null;
  return ballsOfScored(scores, Object.fromEntries(scores.map((_, i) => [String(i), ballForGame(draft, i, auto)])));
}

/** La última bola (no vacía) de una lista: la que se recuerda para el próximo juego. */
export const lastBall = (balls: readonly (GameBall | undefined)[]): string | null =>
  balls.filter((b): b is string => typeof b === 'string' && !!b).at(-1) ?? null;

// ---------- Los números de cada bola ----------

export interface BallStats {
  ball: Ball;
  /** Juegos que cuentan (con puntaje). */
  games: number;
  pins: number;
  /** Promedio (hacia abajo, como en las ligas); null sin juegos. */
  average: number | null;
  high: number;
  /** Juegos con esta bola que todavía no cuentan (por verificar o por aprobar). */
  pending: number;
  /** Juegos anotados por cuadros que cuentan (y cuadran con el puntaje). */
  framed: number;
  strikePct: number | null;
  sparePct: number | null;
  /**
   * Juegos desde la última pulida, contando los de ese mismo día (o todos, si nunca se pulió); los por aprobar también
   * gastan la bola.
   */
  sinceResurface: number;
  /** Ya lleva RESURFACE_EVERY juegos o más sin pulir. */
  needsResurface: boolean;
  /** El último día que se usó (YYYY-MM-DD) o null. */
  lastUsedOn: string | null;
}

/** Los números de cada bola (en el orden en que vienen las bolas). */
export function ballStats(balls: readonly Ball[], games: readonly BallGame[]): BallStats[] {
  return balls.map((ball) => {
    const mine = games.filter((g) => g.ball === ball.id && g.score != null);
    const counted = mine.filter((g) => g.counted);
    const scores = counted.map((g) => g.score!);
    const pins = scores.reduce((a, b) => a + b, 0);
    const frames = countedFrames(counted.map((g) => ({ score: g.score!, frames: g.frames })));
    const rates = frameRates(frames);
    // Desde el día de la pulida (incluido): «La pulí hoy» cuenta los juegos que tire hoy.
    const sinceResurface = mine.filter((g) => !ball.resurfacedOn || (g.date != null && g.date >= ball.resurfacedOn)).length;
    const lastUsedOn = mine.reduce<string | null>((a, g) => (g.date && (!a || g.date > a) ? g.date : a), null);
    return {
      ball,
      games: scores.length,
      pins,
      average: scores.length ? Math.floor(pins / scores.length) : null,
      high: scores.length ? Math.max(...scores) : 0,
      pending: mine.length - counted.length,
      framed: frames.length,
      strikePct: rates.strikePct,
      sparePct: rates.sparePct,
      sinceResurface,
      needsResurface: sinceResurface >= RESURFACE_EVERY,
      lastUsedOn,
    };
  });
}

/** Con cuál tiras mejor: el mejor promedio entre las que tienen al menos BALL_MIN_GAMES juegos (si hay dos o más así). */
export function bestBall(stats: readonly BallStats[]): BallStats | null {
  const enough = stats.filter((s) => s.games >= BALL_MIN_GAMES && s.average != null);
  if (enough.length < 2) return null;
  return enough.reduce((a, b) => (b.average! > a.average! || (b.average === a.average && b.games > a.games) ? b : a));
}

/** «Tiras mejor con la Phaze II: 198 de promedio en 14 juegos (12 más que con la Hammer).» */
export function bestBallText(stats: readonly BallStats[]): string | null {
  const best = bestBall(stats);
  if (!best) return null;
  const next = stats
    .filter((s) => s !== best && s.games >= BALL_MIN_GAMES && s.average != null)
    .sort((a, b) => b.average! - a.average!)[0];
  const diff = next ? best.average! - next.average! : 0;
  const tail = next && diff > 0 ? ` (${diff} ${diff === 1 ? 'pino' : 'pinos'} más que con la ${next.ball.name})` : '';
  return `Tiras mejor con la ${best.ball.name}: ${best.average} de promedio en ${best.games} juegos${tail}.`;
}

/** Cuántos juegos lleva desde que se pulió (y si ya le toca), en palabras. */
export function resurfaceText(s: Pick<BallStats, 'sinceResurface' | 'needsResurface'> & { ball: Pick<Ball, 'resurfacedOn'> }): string {
  const n = s.sinceResurface;
  const games = `${n} ${n === 1 ? 'juego' : 'juegos'}`;
  if (s.needsResurface) {
    return s.ball.resurfacedOn
      ? `Lleva ${games} desde la última pulida: ya le toca pulirla (cada ${RESURFACE_EVERY} juegos, más o menos).`
      : `Lleva ${games} sin pulir: ya le toca (cada ${RESURFACE_EVERY} juegos, más o menos).`;
  }
  if (!s.ball.resurfacedOn) return n ? `${games} sin pulir.` : 'Todavía sin juegos.';
  return `${games} desde la última pulida.`;
}

/**
 * Lo que pregunta «La pulí hoy» antes de cambiar la fecha (la de antes se pierde y los juegos se vuelven a contar); null
 * si ya dice hoy (no hay nada que cambiar).
 */
export function resurfaceQuestion(b: Pick<Ball, 'name' | 'resurfacedOn'>, today: string, formatDay: (day: string) => string): { title: string; message: string } | null {
  if (b.resurfacedOn === today) return null;
  const before = b.resurfacedOn ? ` La última pulida (${formatDay(b.resurfacedOn)}) se reemplaza.` : '';
  return {
    title: `¿Puliste la ${b.name} hoy?`,
    message: `Sus juegos se vuelven a contar desde hoy (los de hoy también).${before}`,
  };
}

/** Porcentaje para mostrar ('—' sin datos). */
export const pctText = (p: number | null) => (p == null ? '—' : `${p}%`);
