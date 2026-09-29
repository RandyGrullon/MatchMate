import { MIN_RANK_GAMES, playerStats } from './stats';
import { inSeason, previousSeason, seasonOfDay, sortSeasons, type Season } from './seasons';
import type { BowlingEvent, Entry, Player } from './types';

/**
 * Boliche por temporada: el ranking, el promedio del handicap, el más mejorado, «te faltan N juegos» y las marcas
 * de cada juego («Récord personal», «+15 sobre tu promedio»). Solo cuentan los juegos verificados (con foto o
 * marca), como en stats.ts. De qué temporada es un evento: la que contiene su fecha (src/lib/seasons.ts).
 */

type SeasonRef = Pick<Season, 'id' | 'startsOn' | 'endsOn' | 'status'>;

/** Juegos verificados y sus pinos. */
export interface GamesPins {
  games: number;
  pins: number;
}

/** Promedio sin decimales (como stats.ts); null sin juegos. */
export const averageOf = (g: GamesPins | null | undefined): number | null => (g && g.games > 0 ? Math.floor(g.pins / g.games) : null);

/** Suma de juegos verificados y pinos de unas participaciones. */
export function gamesPins(entries: readonly Entry[]): GamesPins {
  const s = playerStats([...entries]);
  return { games: s.games, pins: s.pins };
}

/** Los eventos de la temporada (sin temporada: todos). */
export function seasonEvents<E extends Pick<BowlingEvent, 'date'>>(events: readonly E[], season: SeasonRef | null | undefined): E[] {
  return season ? events.filter((e) => inSeason(season, e.date)) : [...events];
}

// ---------- Promedio del handicap ----------

/**
 * De dónde sale el promedio: la temporada (ya tiene el mínimo de juegos), la anterior (con el mínimo), el fijo del
 * admin, el de su última participación (congelado al inscribirse), los pocos juegos que tiene, o nada.
 */
export type AverageSource = 'temporada' | 'anterior' | 'fijo' | 'entrada' | 'pocos' | 'ninguno';

export interface SeasonAverage {
  average: number;
  source: AverageSource;
}

/**
 * Promedio para el handicap: el de la temporada cuando ya tiene el mínimo de juegos; mientras no, el de la
 * temporada anterior (si allí llegó al mínimo) o, si no, el fijo o el congelado de su última participación. Sin
 * nada de eso, el de los pocos juegos que tenga (las dos temporadas juntas).
 */
export function seasonAverage({
  season,
  previous,
  override,
  frozen,
  minGames = MIN_RANK_GAMES,
}: {
  season: GamesPins;
  previous?: GamesPins | null;
  override?: number | null;
  frozen?: number | null;
  minGames?: number;
}): SeasonAverage {
  if (season.games >= minGames) return { average: averageOf(season)!, source: 'temporada' };
  if (previous && previous.games >= minGames) return { average: averageOf(previous)!, source: 'anterior' };
  if (override != null) return { average: override, source: 'fijo' };
  if (frozen && frozen > 0) return { average: frozen, source: 'entrada' };
  const few = averageOf({ games: season.games + (previous?.games ?? 0), pins: season.pins + (previous?.pins ?? 0) });
  return few != null ? { average: few, source: 'pocos' } : { average: 0, source: 'ninguno' };
}

/** Marca de una palabra junto al número cuando el promedio no es el de la temporada (null = no hace falta). */
export function averageSourceShort(source: AverageSource): string | null {
  switch (source) {
    case 'anterior':
      return 'anterior';
    case 'fijo':
      return 'fijo';
    case 'entrada':
      return 'entrada';
    case 'pocos':
      return 'pocos';
    default:
      return null;
  }
}

/** Nota corta de dónde sale el promedio (debajo del número). */
export function averageSourceLabel(source: AverageSource, minGames = MIN_RANK_GAMES): string {
  switch (source) {
    case 'temporada':
      return 'Esta temporada';
    case 'anterior':
      return 'Temporada anterior';
    case 'fijo':
      return 'Fijo por el admin';
    case 'entrada':
      return 'Promedio de entrada';
    case 'pocos':
      return `Menos de ${minGames} juegos`;
    case 'ninguno':
      return 'Sin juegos';
  }
}

export interface DatedEntry {
  entry: Entry;
  /** Fecha del evento (YYYY-MM-DD). */
  date: string;
}

/**
 * Promedio para el handicap de un jugador en un evento de fecha `day`: cuenta sus juegos de la temporada de ese día
 * hasta ese día (sin los del mismo evento, `skipEvent`), la temporada anterior completa, su promedio fijo y el
 * congelado de su última participación antes de ese día.
 */
export function averageForDay({
  entries,
  seasons,
  day,
  skipEvent,
  override,
  minGames = MIN_RANK_GAMES,
}: {
  entries: readonly DatedEntry[];
  seasons: readonly SeasonRef[];
  day: string;
  skipEvent?: string | null;
  override: number | null;
  minGames?: number;
}): SeasonAverage {
  const season = seasonOfDay(seasons, day);
  // Entre temporadas (se cerró una y no ha empezado la otra): esta todavía no tiene juegos; la anterior es la última.
  const prev = season ? previousSeason(seasons, season) : (sortSeasons(seasons).find((s) => s.startsOn <= day) ?? null);
  const past = entries.filter((d) => d.date <= day && d.entry.eventId !== skipEvent);
  const current = season || !seasons.length ? gamesPins(past.filter((d) => !season || inSeason(season, d.date)).map((d) => d.entry)) : { games: 0, pins: 0 };
  const previous = prev ? gamesPins(entries.filter((d) => inSeason(prev, d.date)).map((d) => d.entry)) : null;
  const last = [...past].sort((a, b) => b.date.localeCompare(a.date)).find((d) => d.entry.average > 0);
  return seasonAverage({ season: current, previous, override, frozen: last?.entry.average ?? null, minGames });
}

/**
 * El promedio del handicap de cada jugador para un evento del día `day` (el que guardaría una inscripción nueva, como
 * fetchEffectiveAverages): averageForDay con sus participaciones fechadas por su evento (`dates`: evento → fecha).
 * Lo muestra la lista de jugadores del admin, con de dónde sale.
 */
export function handicapAverages(
  players: readonly Pick<Player, 'id' | 'averageOverride'>[],
  entries: readonly Entry[],
  dates: ReadonlyMap<string, string>,
  seasons: readonly SeasonRef[],
  day: string,
  minGames = MIN_RANK_GAMES,
): Map<string, SeasonAverage> {
  const byPlayer = new Map<string, DatedEntry[]>();
  for (const entry of entries) {
    const date = dates.get(entry.eventId);
    if (date) byPlayer.set(entry.playerId, [...(byPlayer.get(entry.playerId) ?? []), { entry, date }]);
  }
  return new Map(
    players.map((p) => [p.id, averageForDay({ entries: byPlayer.get(p.id) ?? [], seasons, day, override: p.averageOverride ?? null, minGames })] as const),
  );
}

// ---------- Ranking de la temporada ----------

export interface RankingRow {
  playerId: string;
  name: string;
  average: number;
  games: number;
  pins: number;
  high: number;
  series: number;
  /** Eventos a los que fue (con al menos un juego verificado). */
  events: number;
}

/** Una fila por jugador (que sigue en la liga y tiene juegos verificados) con sus números de esas participaciones. */
export function rankingRows(entries: readonly Entry[], players: readonly Pick<Player, 'id' | 'name'>[]): RankingRow[] {
  const byPlayer = new Map<string, Entry[]>();
  entries.forEach((e) => byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]));
  const names = new Map(players.map((p) => [p.id, p.name]));
  return [...byPlayer.entries()]
    .filter(([id]) => names.has(id))
    .map(([id, list]): RankingRow => {
      const s = playerStats(list);
      return {
        playerId: id,
        name: names.get(id)!,
        average: s.autoAverage ?? 0,
        games: s.games,
        pins: s.pins,
        high: s.high,
        series: s.highSeries,
        events: list.filter((e) => e.scores?.some((sc, i) => sc != null && e.photos?.[i])).length,
      };
    })
    .filter((r) => r.games > 0);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Qué número es cada columna de la tabla guardada del boliche (por su nombre corto). */
const SNAPSHOT_FIELDS: Record<string, 'games' | 'average' | 'high' | 'series'> = {
  Juegos: 'games',
  'Prom.': 'average',
  Máx: 'high',
  Juego: 'high',
  Serie: 'series',
};

/** Métricas del ranking que trae la tabla guardada. */
export type SnapshotMetric = 'promedio' | 'juego';

/**
 * El ranking de una temporada cerrada desde la tabla que se guardó al cerrarla (seasons.standings, en el formato de
 * src/components/season/logic.ts: {v: 1, sport: 'bowling', tables: [{key: 'promedio' | 'juego', columns: [{label}],
 * rows: [{name, playerId, values}]}]}): una fila por jugador juntando las tablas. `covers`: las métricas que tiene
 * (las demás se calculan con los juegos). null si no hay tabla o no es del boliche.
 */
export function readBowlingSnapshot(standings: unknown): { rows: RankingRow[]; covers: SnapshotMetric[] } | null {
  if (!isObj(standings) || standings.sport !== 'bowling' || !Array.isArray(standings.tables)) return null;
  const byKey = new Map<string, RankingRow>();
  const covers: SnapshotMetric[] = [];
  for (const t of standings.tables) {
    if (!isObj(t) || !Array.isArray(t.columns) || !Array.isArray(t.rows)) continue;
    if ((t.key === 'promedio' || t.key === 'juego') && !covers.includes(t.key)) covers.push(t.key);
    const fields = t.columns.map((c) => (isObj(c) && typeof c.label === 'string' ? SNAPSHOT_FIELDS[c.label] : undefined));
    for (const r of t.rows) {
      if (!isObj(r) || typeof r.name !== 'string' || !Array.isArray(r.values)) continue;
      const playerId = typeof r.playerId === 'string' ? r.playerId : '';
      const key = playerId || `nombre:${r.name}`;
      const row = byKey.get(key) ?? { playerId, name: r.name, average: 0, games: 0, pins: 0, high: 0, series: 0, events: 0 };
      fields.forEach((f, i) => {
        const v = (r.values as unknown[])[i];
        if (f && isNum(v)) row[f] = v;
      });
      byKey.set(key, row);
    }
  }
  return byKey.size ? { rows: [...byKey.values()], covers } : null;
}

/** Dónde quedaría quien todavía no tiene el mínimo: su puesto por promedio (null sin juegos) y cuántos le faltan. */
export interface RankGap {
  pos: number | null;
  missing: number;
}

/** null si ya entra al ranking (o no es jugador). */
export function rankGap(rows: readonly Pick<RankingRow, 'playerId' | 'average' | 'games'>[], me: string | null | undefined, minGames = MIN_RANK_GAMES): RankGap | null {
  if (!me) return null;
  const mine = rows.find((r) => r.playerId === me);
  if (mine && mine.games >= minGames) return null;
  if (!mine || mine.games === 0) return { pos: null, missing: minGames };
  const pos = 1 + rows.filter((r) => r.playerId !== me && r.games >= minGames && r.average > mine.average).length;
  return { pos, missing: minGames - mine.games };
}

/** «Tú: 14.º · te faltan 2 juegos para entrar». */
export function rankGapLabel(gap: RankGap): string {
  const missing = gap.missing === 1 ? 'te falta 1 juego' : `te faltan ${gap.missing} juegos`;
  return gap.pos != null ? `Tú: ${gap.pos}.º · ${missing} para entrar` : `Tú: ${missing} para entrar`;
}

// ---------- Más mejorado ----------

export interface Improvement {
  playerId: string;
  current: number;
  previous: number;
  /** current - previous (siempre > 0). */
  delta: number;
  games: number;
  previousGames: number;
}

/**
 * Más mejorado: promedio de esta temporada menos el de la anterior, solo con el mínimo de juegos en las dos. Los
 * que subieron, del que más subió al que menos (empate: el de mejor promedio).
 */
export function mostImproved(
  current: ReadonlyMap<string, GamesPins>,
  previous: ReadonlyMap<string, GamesPins>,
  minGames = MIN_RANK_GAMES,
): Improvement[] {
  const out: Improvement[] = [];
  for (const [playerId, now] of current) {
    const before = previous.get(playerId);
    if (!before || now.games < minGames || before.games < minGames) continue;
    const a = averageOf(now)!;
    const b = averageOf(before)!;
    if (a > b) out.push({ playerId, current: a, previous: b, delta: a - b, games: now.games, previousGames: before.games });
  }
  return out.sort((x, y) => y.delta - x.delta || y.current - x.current || x.playerId.localeCompare(y.playerId));
}

/** Juegos y pinos de cada jugador en esas participaciones. */
export function totalsByPlayer(entries: readonly Entry[]): Map<string, GamesPins> {
  const byPlayer = new Map<string, Entry[]>();
  entries.forEach((e) => byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]));
  return new Map([...byPlayer].map(([id, list]) => [id, gamesPins(list)]));
}

// ---------- Marcas de cada juego ----------

/** Desde cuántos juegos anteriores un juego puede ser «Récord personal» (con 1 o 2, cualquiera lo sería). */
export const RECORD_MIN_GAMES = 3;

/** Cuánto por encima del promedio se marca un juego. */
export const OVER_AVERAGE = 15;

/**
 * Lo que hace falta de antes de un evento para marcar sus juegos (lo mismo que devuelve bowling_game_context):
 * juegos anteriores en la liga (cuántos y el más alto), los de su temporada antes del evento y la temporada
 * anterior completa (null si no hay).
 */
export interface GameContext {
  before: { games: number; high: number };
  season: GamesPins;
  prevSeason: GamesPins | null;
  averageOverride: number | null;
}

export interface GameMark {
  /** El más alto que ha tenido en la liga hasta ese juego. */
  record: boolean;
  /** Pinos por encima de su promedio (desde OVER_AVERAGE); null si no. */
  over: number | null;
}

/**
 * Marcas de los juegos de una participación (en orden). null = juego sin pinos o sin verificar. El promedio de
 * referencia es el de la temporada antes del evento (o el que tomaría el handicap: la anterior, el fijo o el
 * congelado `frozen`); con pocos juegos no se marca.
 */
export function gameMarks(
  scores: readonly (number | null | undefined)[],
  verified: readonly boolean[],
  ctx: GameContext,
  { frozen = null, minGames = MIN_RANK_GAMES }: { frozen?: number | null; minGames?: number } = {},
): (GameMark | null)[] {
  const ref = seasonAverage({ season: ctx.season, previous: ctx.prevSeason, override: ctx.averageOverride, frozen, minGames });
  const solid = ref.average > 0 && ref.source !== 'pocos' && ref.source !== 'ninguno';
  let games = ctx.before.games;
  let high = ctx.before.high;
  return scores.map((s, i) => {
    if (s == null || !verified[i]) return null;
    const mark: GameMark = {
      record: games >= RECORD_MIN_GAMES && s > high,
      over: solid && s - ref.average >= OVER_AVERAGE ? s - ref.average : null,
    };
    games++;
    high = Math.max(high, s);
    return mark;
  });
}

/** El juego tiene alguna marca. */
export const hasMark = (m: GameMark | null | undefined): m is GameMark => !!m && (m.record || m.over != null);

/** «+18 sobre tu promedio» (o «su», si es de otro). */
export const overLabel = (over: number, mine = true) => `+${over} sobre ${mine ? 'tu' : 'su'} promedio`;

/** Las marcas en texto: «Récord personal en el juego 2», «+18 sobre tu promedio en el juego 3». */
export function marksSummary(marks: readonly (GameMark | null)[], mine = true): string[] {
  const out: string[] = [];
  const many = marks.filter((m) => m != null).length > 1;
  marks.forEach((m, i) => {
    if (!hasMark(m)) return;
    const where = many ? ` en el juego ${i + 1}` : '';
    if (m.record) out.push(`Récord personal${where}`);
    if (m.over != null) out.push(`${overLabel(m.over, mine)}${where}`);
  });
  return out;
}

const verifiedOf = (e: Entry) => (e.scores ?? []).map((s, i) => s != null && e.photos?.[i] != null);

/**
 * El contexto de cada participación de un jugador calculado con todas sus participaciones de la liga (su página,
 * donde ya están todas): mismo orden que la base (fecha del evento y su id).
 */
export function buildGameContexts(entries: readonly DatedEntry[], seasons: readonly SeasonRef[], override: number | null): Map<string, GameContext> {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.entry.eventId.localeCompare(b.entry.eventId));
  const seasonOf = new Map(sorted.map((d) => [d.entry.id, seasonOfDay(seasons, d.date)]));
  const full = new Map<string, GamesPins>();
  for (const d of sorted) {
    const s = seasonOf.get(d.entry.id);
    if (!s) continue;
    const g = gamesPins([d.entry]);
    const t = full.get(s.id) ?? { games: 0, pins: 0 };
    full.set(s.id, { games: t.games + g.games, pins: t.pins + g.pins });
  }
  const running = new Map<string, GamesPins>();
  const before = { games: 0, high: 0 };
  const out = new Map<string, GameContext>();
  for (const d of sorted) {
    const s = seasonOf.get(d.entry.id) ?? null;
    // Sin temporadas leídas, todo es una; con temporadas, un evento entre dos (sin ninguna) no tiene de temporada.
    const key = s?.id ?? (seasons.length ? null : '');
    const prev = s ? previousSeason(seasons, s) : null;
    out.set(d.entry.id, {
      before: { ...before },
      season: { ...((key != null && running.get(key)) || { games: 0, pins: 0 }) },
      prevSeason: prev ? (full.get(prev.id) ?? { games: 0, pins: 0 }) : null,
      averageOverride: override,
    });
    const verified = verifiedOf(d.entry);
    const counted = (d.entry.scores ?? []).filter((x, i): x is number => x != null && verified[i]);
    if (key != null) {
      const r = running.get(key) ?? { games: 0, pins: 0 };
      running.set(key, { games: r.games + counted.length, pins: r.pins + counted.reduce((a, b) => a + b, 0) });
    }
    before.games += counted.length;
    before.high = Math.max(before.high, ...counted, 0);
  }
  return out;
}

/** Marcas de una participación con su contexto (null sin contexto todavía). */
export function entryMarks(entry: Entry, ctx: GameContext | null | undefined, minGames = MIN_RANK_GAMES): (GameMark | null)[] | null {
  if (!ctx) return null;
  return gameMarks(entry.scores ?? [], verifiedOf(entry), ctx, { frozen: entry.average, minGames });
}
