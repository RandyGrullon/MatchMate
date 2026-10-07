import { rankGap, type RankingRow } from '../../lib/bowlingSeason';
import type { Season } from '../../lib/seasons';
import { calcHandicap, MIN_RANK_GAMES, rank } from '../../lib/stats';
import type { BowlingEvent, Entry } from '../../lib/types';

/**
 * La Tabla de la liga (rediseño «Calma y foco»), sin React:
 * - Lite: «Promedio ▾» (Mejor juego, Mejor serie y Asistencia en el menú), la tarjeta «Vas 2.º de 6 · Pedro te lleva 24»
 *   y la lista.
 * - Pro: columnas J · Prom · Hcp · Alto · Serie · Asist. que se ordenan tocándolas, Scratch | Con hcp y los récords.
 * Solo cuentan los juegos aprobados (stats.ts); el promedio pide el mínimo de juegos de la temporada.
 */

// ---------- Métricas (Lite) ----------

/** Por qué se ordena la lista de Lite (y el parámetro `?ver=` de la dirección). */
export type Metric = 'promedio' | 'juego' | 'serie' | 'asistencia';

export interface MetricDef {
  key: Metric;
  /** En el menú «Promedio ▾». */
  label: string;
  /** Encabezado corto (la imagen para compartir). */
  short: string;
  value: (r: RankingRow) => number;
  /** Unidad de la diferencia: «te lleva 24 pinos», «te lleva 1 fecha». */
  unit: (n: number) => string;
}

const pins = (n: number) => (n === 1 ? 'pino' : 'pinos');

export const METRICS: readonly MetricDef[] = [
  { key: 'promedio', label: 'Promedio', short: 'Prom.', value: (r) => r.average, unit: pins },
  { key: 'juego', label: 'Mejor juego', short: 'Juego', value: (r) => r.high, unit: pins },
  { key: 'serie', label: 'Mejor serie', short: 'Serie', value: (r) => r.series, unit: pins },
  { key: 'asistencia', label: 'Asistencia', short: 'Fechas', value: (r) => r.events, unit: (n) => (n === 1 ? 'fecha' : 'fechas') },
];

export const metricDef = (key: Metric): MetricDef => METRICS.find((m) => m.key === key)!;

/** La métrica de Lite según `?ver=`: lo que no es una de las 4 (p. ej. «hcp», que es de Pro), Promedio. */
export function metricOf(param: string | null | undefined): Metric {
  return METRICS.find((m) => m.key === param)?.key ?? 'promedio';
}

/** Quién sale: por promedio, los que tienen el mínimo de juegos; por lo demás, los que tienen algo. */
export function eligibleFor(rows: readonly RankingRow[], metric: Metric, minGames = MIN_RANK_GAMES): RankingRow[] {
  const def = metricDef(metric);
  return rows.filter((r) => (metric === 'promedio' ? r.games >= minGames : def.value(r) > 0));
}

/** El nombre de pila («Pedro» de «Pedro Gómez»). */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

// ---------- Tu lugar (la tarjeta de Lite) ----------

/** Alguien de la tabla en la tarjeta: «1.º · Pedro 219». */
export interface PlaceRef {
  name: string;
  pos: number;
  value: number;
}

export type MyPlace =
  | {
      kind: 'ranked';
      pos: number;
      /** Cuántos salen en la tabla. */
      of: number;
      value: number;
      /** El de referencia: el 1.º si no lo eres; si lo eres, el que te sigue (null si estás solo). */
      other: PlaceRef | null;
      /** Pinos (o fechas) entre los dos; 0 = empate. */
      gap: number;
    }
  | {
      kind: 'missing';
      /** Juegos aprobados que tienes y el mínimo para salir. */
      games: number;
      min: number;
      missing: number;
      /** Dónde irías con tu promedio (null sin juegos). */
      pos: number | null;
      average: number | null;
    };

/**
 * Tu lugar en la tabla que se ve: puesto, de cuántos y contra quién (el 1.º, o el que te sigue si vas primero). Si
 * todavía no tienes el mínimo para el promedio (y la temporada sigue), cuántos juegos te faltan. null si no juegas en
 * esta liga o no sales (en Mejor juego, Mejor serie o Asistencia sin nada todavía).
 */
export function myPlace(
  rows: readonly RankingRow[],
  me: string | null | undefined,
  metric: Metric,
  { closed = false, minGames = MIN_RANK_GAMES }: { closed?: boolean; minGames?: number } = {},
): MyPlace | null {
  if (!me) return null;
  const def = metricDef(metric);
  const ranked = rank(eligibleFor(rows, metric, minGames), def.value);
  const at = ranked.find((x) => x.row.playerId === me);
  if (at) {
    const value = def.value(at.row);
    const ref = (x: (typeof ranked)[number] | undefined): PlaceRef | null => (x ? { name: x.row.name, pos: x.pos, value: def.value(x.row) } : null);
    const other = at.pos === 1 ? ref(ranked.find((x) => x.row.playerId !== me)) : ref(ranked[0]);
    return { kind: 'ranked', pos: at.pos, of: ranked.length, value, other, gap: other ? Math.abs(other.value - value) : 0 };
  }
  if (metric !== 'promedio' || closed) return null;
  const gap = rankGap(rows, me, minGames);
  if (!gap) return null;
  const mine = rows.find((r) => r.playerId === me);
  const games = mine?.games ?? 0;
  return { kind: 'missing', games, min: minGames, missing: gap.missing, pos: gap.pos, average: games > 0 ? (mine?.average ?? null) : null };
}

/** Lo que dice la tarjeta: el número grande, las dos líneas y la barra (de 0 a 1) con sus dos puntas. */
export interface PlaceCopy {
  big: string;
  title: string;
  subtitle: string;
  bar: number;
  left: string;
  right: string | null;
}

/** Con unidad solo la asistencia («con 3 fechas»); los pinos se entienden solos («con 195»). */
const amount = (metric: Metric, n: number) => (metric === 'asistencia' ? `${n} ${metricDef(metric).unit(n)}` : `${n}`);

export function placeCopy(p: MyPlace, metric: Metric, closed = false): PlaceCopy {
  if (p.kind === 'missing') {
    return {
      big: `${p.games}/${p.min}`,
      title: p.missing === 1 ? 'Te falta 1 juego para salir' : `Te faltan ${p.missing} juegos para salir`,
      subtitle: p.pos != null && p.average != null ? `Con ${p.average} de promedio irías ${p.pos}.º` : 'Cuentan los juegos aprobados de la temporada',
      bar: p.min > 0 ? Math.min(1, p.games / p.min) : 0,
      left: `Tú · ${p.games} ${p.games === 1 ? 'juego' : 'juegos'}`,
      right: `${p.min} para salir`,
    };
  }
  const unit = metricDef(metric).unit(p.gap);
  const o = p.other;
  const who = o ? firstName(o.name) : '';
  let subtitle: string;
  if (!o) subtitle = 'Nadie más en la tabla todavía';
  else if (p.gap === 0) subtitle = closed ? `Empataste con ${who}` : `Empatas con ${who}`;
  else if (p.pos === 1) subtitle = closed ? `Le ganaste a ${who} por ${p.gap} ${unit}` : `Le llevas ${p.gap} ${unit} a ${who}`;
  else subtitle = closed ? `${who} quedó ${p.gap} ${unit} arriba` : `${who} te lleva ${p.gap} ${unit}`;
  return {
    big: `${p.pos}.º`,
    title: `${closed ? 'Quedaste' : 'Vas'} ${p.pos}.º de ${p.of}, con ${amount(metric, p.value)}`,
    subtitle,
    // Vas detrás: lo tuyo contra lo del 1.º. Vas primero: la barra llena.
    bar: p.pos === 1 || !o || o.value <= 0 ? 1 : Math.min(1, p.value / o.value),
    left: `Tú · ${p.value}`,
    right: o ? `${o.pos}.º · ${who} ${o.value}` : null,
  };
}

// ---------- La tabla completa (Pro) ----------

/** Columna por la que se ordena la tabla de Pro (y `?ver=`: las 4 de Lite valen igual). */
export type SortKey = 'nombre' | 'juegos' | 'promedio' | 'hcp' | 'juego' | 'serie' | 'asistencia';

const SORT_KEYS: readonly SortKey[] = ['nombre', 'juegos', 'promedio', 'hcp', 'juego', 'serie', 'asistencia'];

export function sortOf(param: string | null | undefined): SortKey {
  return SORT_KEYS.find((k) => k === param) ?? 'promedio';
}

/** Handicap = percent % de (base − promedio). */
export interface Hcp {
  base: number;
  percent: number;
}

/** El de un torneo nuevo (EventFormModal): 80 % de 230. */
export const DEFAULT_HCP: Hcp = { base: 230, percent: 80 };

/**
 * El handicap de la liga para la tabla: el del último torneo con handicap de la temporada (`inSeason`); si no hay, el
 * del último de la liga; si tampoco, el de un torneo nuevo (80 % de 230).
 */
export function leagueHcp(events: readonly Pick<BowlingEvent, 'id' | 'type' | 'date' | 'hcpBase' | 'hcpPercent'>[], inSeason?: ReadonlySet<string>): Hcp {
  const withHcp = events.filter((e) => e.type === 'torneo' && e.hcpPercent > 0 && e.hcpBase > 0).sort((a, b) => b.date.localeCompare(a.date));
  const pick = (inSeason ? withHcp.find((e) => inSeason.has(e.id)) : undefined) ?? withHcp[0];
  return pick ? { base: pick.hcpBase, percent: pick.hcpPercent } : DEFAULT_HCP;
}

/** «Hcp = 80% de (230 − prom.) · mín. 6 juegos». */
export const hcpFormula = (h: Hcp, minGames = MIN_RANK_GAMES) => `Hcp = ${h.percent}% de (${h.base} − prom.) · mín. ${minGames} juegos`;

/** Una fila de la tabla de Pro: los números ya con o sin handicap. */
export interface TableRow {
  row: RankingRow;
  pos: number;
  /** «Pedro G.» (o el nombre entero si dos se llamarían igual). */
  short: string;
  games: number;
  average: number;
  hcp: number;
  high: number;
  series: number;
  events: number;
}

/** «Pedro G.» de «Pedro Gómez»; si dos quedarían igual, el nombre entero. */
export function shortNames(names: readonly string[]): Map<string, string> {
  const short = (n: string) => {
    const w = n.trim().split(/\s+/).filter(Boolean);
    return w.length > 1 ? `${w[0]} ${w[1][0]!.toUpperCase()}.` : (w[0] ?? n);
  };
  const count = new Map<string, number>();
  for (const n of new Set(names)) count.set(short(n), (count.get(short(n)) ?? 0) + 1);
  return new Map(names.map((n) => [n, (count.get(short(n)) ?? 0) > 1 ? n.trim() : short(n)]));
}

const SORT_VALUE: Record<Exclude<SortKey, 'nombre'>, (r: TableRow) => number> = {
  juegos: (r) => r.games,
  promedio: (r) => r.average,
  hcp: (r) => r.hcp,
  juego: (r) => r.high,
  serie: (r) => r.series,
  asistencia: (r) => r.events,
};

/**
 * La tabla de Pro ordenada por `sort` (de mayor a menor; Jugador, de la A a la Z). Salen los mismos que en Lite: por
 * promedio, handicap o nombre, los que tienen el mínimo de juegos; por lo demás, los que tienen algo. El # es el puesto
 * por esa columna (empates comparten puesto); ordenada por nombre, el puesto por promedio. `withHcp` («Con hcp») suma
 * el handicap al promedio y al juego más alto, y tres veces a la serie (son 3 juegos).
 */
export function standingsTable(
  rows: readonly RankingRow[],
  { sort, withHcp, hcp, minGames = MIN_RANK_GAMES }: { sort: SortKey; withHcp: boolean; hcp: Hcp; minGames?: number },
): TableRow[] {
  const byAverage = sort === 'nombre' || sort === 'promedio' || sort === 'hcp';
  const shown = byAverage ? rows.filter((r) => r.games >= minGames) : rows;
  const names = shortNames(shown.map((r) => r.name));
  const table = shown.map((r): TableRow => {
    const h = calcHandicap(r.average, hcp.base, hcp.percent);
    const plus = withHcp ? h : 0;
    return {
      row: r,
      pos: 0,
      short: names.get(r.name) ?? r.name,
      games: r.games,
      average: r.average + (r.average > 0 ? plus : 0),
      hcp: h,
      high: r.high + (r.high > 0 ? plus : 0),
      series: r.series + (r.series > 0 ? plus * 3 : 0),
      events: r.events,
    };
  });
  const value = SORT_VALUE[sort === 'nombre' ? 'promedio' : sort];
  const ranked = rank(
    table.filter((t) => byAverage || value(t) > 0),
    value,
  ).map(({ row, pos }) => ({ ...row, pos }));
  return sort === 'nombre' ? ranked.sort((a, b) => a.row.name.localeCompare(b.row.name, 'es')) : ranked;
}

/** Lo que dice una celda de la tabla de Pro (sin juego alto o serie todavía, «–»; la asistencia, «3/3»). */
export function cellText(t: TableRow, key: SortKey, totalEvents: number): string | number {
  switch (key) {
    case 'nombre':
      return t.row.name;
    case 'juegos':
      return t.games;
    case 'promedio':
      return t.average;
    case 'hcp':
      return t.hcp;
    case 'juego':
      return t.high || '–';
    case 'serie':
      return t.series || '–';
    case 'asistencia':
      return `${t.events}/${Math.max(t.events, totalEvents)}`;
  }
}

/** Fechas de la temporada que ya tienen algún juego aprobado (el «/3» de la asistencia). */
export function playedEvents(entries: readonly Pick<Entry, 'eventId' | 'scores' | 'photos'>[]): number {
  return new Set(entries.filter((e) => e.scores?.some((s, i) => s != null && e.photos?.[i])).map((e) => e.eventId)).size;
}

// ---------- Récords de la temporada (Pro) ----------

export interface SeasonRecord {
  value: string;
  /** Quiénes lo tienen («Pedro G.», «Ana y 4 más»). */
  who: string;
}

export interface SeasonRecords {
  game: SeasonRecord | null;
  series: SeasonRecord | null;
  attendance: SeasonRecord | null;
}

/** «Pedro G.» si es uno; si son varios, sus nombres de pila: «Ana y Luis», «Ana y 4 más». */
function holders(list: readonly RankingRow[], me: string | null | undefined, short: ReadonlyMap<string, string>): string {
  if (list.length === 1) return short.get(list[0].name) ?? list[0].name;
  const mineFirst = [...list].sort((a, b) => Number(b.playerId === me) - Number(a.playerId === me));
  const firsts = [...new Set(mineFirst.map((r) => firstName(r.name)))];
  return firsts.length === 2 ? `${firsts[0]} y ${firsts[1]}` : `${firsts[0]} y ${firsts.length - 1} más`;
}

/** Mejor juego, mejor serie y la mejor asistencia (fechas a las que fue / fechas jugadas) de la temporada. */
export function seasonRecords(rows: readonly RankingRow[], totalEvents: number, me?: string | null): SeasonRecords {
  const short = shortNames(rows.map((r) => r.name));
  const best = (value: (r: RankingRow) => number, show: (v: number) => string): SeasonRecord | null => {
    const top = Math.max(0, ...rows.map(value));
    if (top <= 0) return null;
    return { value: show(top), who: holders(rows.filter((r) => value(r) === top), me, short) };
  };
  return {
    game: best((r) => r.high, String),
    series: best((r) => r.series, String),
    attendance: best((r) => r.events, (v) => `${v}/${Math.max(v, totalEvents)}`),
  };
}

// ---------- Temporada cerrada ----------

/**
 * Pro en una temporada cerrada con su tabla guardada: el promedio, los juegos y el mejor juego como quedaron al cerrarla
 * (lo que la tabla guardada trae); la serie y la asistencia, de los juegos.
 */
export function withSnapshot(live: readonly RankingRow[], snapshot: { rows: readonly RankingRow[]; covers: readonly string[] } | null): RankingRow[] {
  if (!snapshot || !snapshot.covers.includes('promedio')) return [...live];
  const byId = new Map(live.map((r) => [r.playerId, r]));
  return snapshot.rows.map((s) => {
    const l = s.playerId ? byId.get(s.playerId) : undefined;
    return {
      ...s,
      high: snapshot.covers.includes('juego') ? s.high : (l?.high ?? s.high),
      pins: l?.pins ?? s.pins,
      series: l?.series ?? s.series,
      events: l?.events ?? s.events,
    };
  });
}

// ---------- Fechas ----------

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «1 sep» de '2026-09-01' (con el año si `year`). */
function day(iso: string, year: boolean): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''}${year ? ` ${y}` : ''}`;
}

/**
 * Las fechas de la temporada, cortas: «1 sep – 15 dic»; con el año si cruza de un año a otro («1 sep 2025 – 15 ene
 * 2026»). Sin fin: «desde el 1 sep».
 */
export function seasonRangeLabel(season: Pick<Season, 'startsOn' | 'endsOn' | 'status'>): string {
  if (!season.endsOn) return `desde el ${day(season.startsOn, false)}`;
  const years = season.startsOn.slice(0, 4) !== season.endsOn.slice(0, 4);
  return `${day(season.startsOn, years)} – ${day(season.endsOn, years)}`;
}
