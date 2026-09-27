/**
 * Resultados de raqueta para tablas y estadísticas: de un partido de la base (Match) al MatchResult de los
 * motores, tablas de parejas (desempates de src/sports/formats), ranking individual de la temporada, noches de
 * puntos de la temporada y el récord de un jugador (con cada compañero y contra cada rival). Puro.
 */
import { finalMatches, sideKey, type Match, type MatchSide } from '../../../../lib/data/matches';
import {
  PICKLEBALL_POINTS,
  RACKET_POINTS,
  pickleballMatchResult,
  pickleballStandings,
  racketMatchResult,
  racketStandings,
  resolveTies,
  tiebreak,
  type PointsRule,
} from '../../../../sports/formats';
import { matchTotals, resolveRules, stateFromScore, type RacketRules, type RacketSport } from '../../../../sports/racket';
import type { MatchResult, Side, StandingRow } from '../../../../sports/types';
import { localParts } from './time';

/** Partidos a sets (liga, torneo, sueltos): formato '' o 'sets'. Los de puntos son del americano/mexicano. */
export const isSetsMatch = (m: Pick<Match, 'format'>) => m.format === '' || m.format === 'sets';
export const isPointsMatch = (m: Pick<Match, 'format'>) => m.format === 'americano' || m.format === 'mexicano';

/**
 * Id del lado para las tablas y el cuadro: la pareja (equipo de temporada); en individual, el jugador; si no,
 * `p:<id>+<id>` (lado armado solo con jugadores, como en `sideKey`).
 */
export function entrantKey(s: Pick<MatchSide, 'teamId' | 'players'>): string {
  if (s.teamId) return s.teamId;
  if (s.players.length === 1) return s.players[0].playerId;
  return sideKey(s);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1]] : null;

/** Reglas del partido (rules.match del partido o de la liga) completas; null si no sirven. */
export function matchRules(sport: RacketSport, rules: unknown): RacketRules | null {
  const m = isObj(rules) && isObj(rules.match) ? rules.match : {};
  try {
    return resolveRules(sport, { ...(m as Partial<RacketRules>), sport } as Partial<RacketRules>);
  } catch {
    try {
      return resolveRules(sport, {});
    } catch {
      return null;
    }
  }
}

const PAIRS = /(\d{1,2})\s*-\s*(\d{1,2})/g;

/**
 * MatchResult de un partido a sets que ya cuenta (confirmado, W.O. o con las 48 h). Totales: tenis y pádel
 * `sets` y `games` (y `points` si se sabe); pickleball `games` y `points`. null si no se puede usar (W.O. doble,
 * sin ganador, sin marcador legible).
 */
export function racketResultOf(m: Match, sport: RacketSport, rules?: unknown): MatchResult | null {
  const meta = { id: m.id, side1: entrantKey(m.sides[0]), side2: entrantKey(m.sides[1]) };
  const r = matchRules(sport, rules ?? m.rules);
  if (m.status === 'walkover') {
    if (m.walkoverSide !== 1 && m.walkoverSide !== 2) return null;
    const winner: Side = m.walkoverSide === 1 ? 2 : 1;
    if (sport === 'pickleball') return pickleballMatchResult({ ...meta, games: [], walkover: m.walkoverSide });
    const sets = r && r.sport !== 'pickleball' ? Math.ceil(r.bestOf / 2) : 2;
    const gps = r && r.sport !== 'pickleball' ? r.gamesPerSet : 6;
    return racketMatchResult({ ...meta, sets: [], winner, status: 'walkover', walkoverSets: Array.from({ length: sets }, () => [gps, 0] as const) });
  }
  if (m.winner !== 1 && m.winner !== 2) return null;
  const score = m.score ?? {};
  const totals = isObj(score.totals) ? score.totals : null;
  const tSets = pair(totals?.sets);
  const tGames = pair(totals?.games);
  const tPoints = pair(totals?.points);
  if (tSets && tGames) {
    if (sport === 'pickleball') return { ...meta, winner: m.winner, totals: { games: tSets, points: tPoints ?? [0, 0] } };
    return { ...meta, winner: m.winner, totals: { sets: tSets, games: tGames, ...(tPoints ? { points: tPoints } : {}) } };
  }
  const text = typeof score.text === 'string' ? score.text : '';
  if (r && text) {
    try {
      const t = matchTotals(stateFromScore(r, text));
      if (sport === 'pickleball') return { ...meta, winner: m.winner, totals: { games: t.sets, points: t.points } };
      return { ...meta, winner: m.winner, totals: { sets: t.sets, games: t.games } };
    } catch {
      // «6-4 3-2 ret.» y marcadores a medias: se completan abajo.
    }
  }
  const sets = [...text.matchAll(PAIRS)].map((x) => [Number(x[1]), Number(x[2])] as const);
  if (sport === 'pickleball') return { ...pickleballMatchResult({ ...meta, games: sets }), winner: m.winner };
  const tennis = r && r.sport !== 'pickleball' ? r : null;
  return racketMatchResult({
    ...meta,
    sets,
    winner: m.winner,
    status: /ret/i.test(text) ? 'retired' : 'normal',
    gamesPerSet: tennis?.gamesPerSet ?? 6,
    setsToWin: tennis ? Math.ceil(tennis.bestOf / 2) : 2,
    superTiebreak: tennis ? tennis.finalSet === 'tiebreak' : sport === 'padel',
  });
}

/** Puntos de tabla: 'standard' = ganar 3, perder 1, W.O. 0; '2-0' = ganar 2, perder 0. Pickleball: 1 por partido ganado. */
export type PointsScheme = 'standard' | '2-0';
export function pointsRule(sport: RacketSport, scheme: PointsScheme = 'standard'): PointsRule {
  if (sport === 'pickleball') return PICKLEBALL_POINTS;
  return scheme === '2-0' ? { win: 2, draw: 0, loss: 0, walkoverLoss: 0 } : RACKET_POINTS;
}

/** Tabla de parejas (o jugadores en individual) de una competencia cerrada: liga, grupo. */
export function pairStandings(
  sport: RacketSport,
  ids: readonly string[],
  matches: readonly Match[],
  opts: { scheme?: PointsScheme; lotSeed?: string; rules?: unknown; now?: number } = {},
): StandingRow[] {
  const results = finalMatches(matches.filter(isSetsMatch), opts.now)
    .map((m) => racketResultOf(m, sport, opts.rules))
    .filter((x): x is MatchResult => !!x);
  const o = { points: pointsRule(sport, opts.scheme), lotSeed: opts.lotSeed };
  return sport === 'pickleball' ? pickleballStandings(ids, results, o) : racketStandings(ids, results, o);
}

/** Qué tan grande es cada columna de la tabla (sets o juegos) según el deporte. */
export const forLabel = (sport: RacketSport) => (sport === 'pickleball' ? 'Puntos' : 'Juegos');
/** Lo que se cuenta como «set» en las tablas: en pickleball son juegos. */
export const setsLabel = (sport: RacketSport) => (sport === 'pickleball' ? 'Juegos' : 'Sets');

// ---------------------------------------------------------------------------------------------------------
// Jugadores

/** Jugadores de un lado: los del partido; si no hay, la plantilla de la pareja. */
export function sidePlayers(s: MatchSide, rosterOf?: (teamId: string) => readonly string[]): string[] {
  if (s.players.length) return s.players.map((p) => p.playerId);
  return s.teamId && rosterOf ? [...rosterOf(s.teamId)] : [];
}

/** Lado del jugador en el partido (null si no jugó). */
export function playerSide(m: Match, playerId: string, rosterOf?: (teamId: string) => readonly string[]): Side | null {
  if (sidePlayers(m.sides[0], rosterOf).includes(playerId)) return 1;
  if (sidePlayers(m.sides[1], rosterOf).includes(playerId)) return 2;
  return null;
}

/** Cuándo fue el partido (para ordenar y para la temporada): la hora programada o cuando se anotó. */
export function matchTime(m: Match): number {
  const t = Date.parse(m.scheduledAt ?? m.proposedAt ?? m.confirmedAt ?? '');
  if (Number.isFinite(t)) return t;
  return m.createdAt?.toMillis?.() ?? 0;
}

export interface PeopleLine {
  id: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

export interface PlayerRecord {
  playerId: string;
  /** Partidos a sets (liga, torneo). */
  sets: {
    played: number;
    won: number;
    lost: number;
    setsFor: number;
    setsAgainst: number;
    gamesFor: number;
    gamesAgainst: number;
    walkovers: number;
    /** Racha actual: 'G' ganando, 'P' perdiendo. */
    streak: { kind: 'G' | 'P'; n: number } | null;
    /** Últimos 5, el más nuevo primero. */
    last: ('G' | 'P')[];
  };
  /** Americano y mexicano. */
  nights: { nights: number; played: number; won: number; drawn: number; lost: number; pointsFor: number; pointsAgainst: number };
  partners: PeopleLine[];
  rivals: PeopleLine[];
  /** Los partidos que cuentan del jugador, el más nuevo primero. */
  matches: Match[];
}

function bump(map: Map<string, PeopleLine>, id: string, result: 'G' | 'P' | 'E') {
  const line = map.get(id) ?? { id, played: 0, won: 0, lost: 0, drawn: 0 };
  line.played++;
  if (result === 'G') line.won++;
  else if (result === 'P') line.lost++;
  else line.drawn++;
  map.set(id, line);
}

/** El récord del jugador en la liga con los partidos que ya cuentan. */
export function playerRecord(
  playerId: string,
  matches: readonly Match[],
  opts: { sport: RacketSport; rules?: unknown; rosterOf?: (teamId: string) => readonly string[]; now?: number },
): PlayerRecord {
  const mine = finalMatches(matches, opts.now)
    .filter((m) => playerSide(m, playerId, opts.rosterOf) !== null)
    .sort((a, b) => matchTime(b) - matchTime(a));
  const rec: PlayerRecord = {
    playerId,
    sets: { played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0, walkovers: 0, streak: null, last: [] },
    nights: { nights: 0, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 },
    partners: [],
    rivals: [],
    matches: mine,
  };
  const partners = new Map<string, PeopleLine>();
  const rivals = new Map<string, PeopleLine>();
  const nightIds = new Set<string>();
  const seq: ('G' | 'P')[] = [];
  for (const m of mine) {
    const side = playerSide(m, playerId, opts.rosterOf)!;
    const i = side - 1;
    const other = sidePlayers(m.sides[1 - i], opts.rosterOf);
    const team = sidePlayers(m.sides[i], opts.rosterOf).filter((p) => p !== playerId);
    let result: 'G' | 'P' | 'E';
    if (isPointsMatch(m)) {
      const s = pair(m.score?.sides);
      if (!s) continue;
      const [me, them] = side === 1 ? s : [s[1], s[0]];
      result = me > them ? 'G' : me < them ? 'P' : 'E';
      rec.nights.played++;
      rec.nights.pointsFor += me;
      rec.nights.pointsAgainst += them;
      if (result === 'G') rec.nights.won++;
      else if (result === 'P') rec.nights.lost++;
      else rec.nights.drawn++;
      if (m.eventId) nightIds.add(m.eventId);
    } else {
      const res = racketResultOf(m, opts.sport, opts.rules);
      if (!res) continue;
      const won = res.walkover ? res.walkover !== side : res.winner === side;
      result = won ? 'G' : 'P';
      rec.sets.played++;
      if (won) rec.sets.won++;
      else rec.sets.lost++;
      if (res.walkover === side) rec.sets.walkovers++;
      const sets = res.totals.sets ?? res.totals.games ?? [0, 0];
      const games = opts.sport === 'pickleball' ? (res.totals.points ?? [0, 0]) : (res.totals.games ?? [0, 0]);
      rec.sets.setsFor += sets[i];
      rec.sets.setsAgainst += sets[1 - i];
      rec.sets.gamesFor += games[i];
      rec.sets.gamesAgainst += games[1 - i];
      seq.push(won ? 'G' : 'P');
    }
    for (const p of team) bump(partners, p, result);
    for (const p of other) bump(rivals, p, result);
  }
  rec.nights.nights = nightIds.size;
  rec.sets.last = seq.slice(0, 5);
  if (seq.length) {
    let n = 0;
    while (n < seq.length && seq[n] === seq[0]) n++;
    rec.sets.streak = { kind: seq[0], n };
  }
  const order = (a: PeopleLine, b: PeopleLine) => b.played - a.played || b.won - a.won || (a.id < b.id ? -1 : 1);
  rec.partners = [...partners.values()].sort(order);
  rec.rivals = [...rivals.values()].sort(order);
  return rec;
}

/** % de victorias (0–100) o null sin partidos. */
export const winPct = (won: number, played: number) => (played ? Math.round((won / played) * 100) : null);

// ---------------------------------------------------------------------------------------------------------
// Temporada

/** Dentro de la temporada de la liga (sin fechas = todo). `day` = 'YYYY-MM-DD'. */
export const inSeason = (season: { seasonStart?: string; seasonEnd?: string }, day: string | null) =>
  !day || ((!season.seasonStart || day >= season.seasonStart) && (!season.seasonEnd || day <= season.seasonEnd));

/** Formatos que duran meses: cada partido cae en la temporada por su propia fecha. */
const LONG_EVENTS = new Set(['escalera', 'cajas']);

/**
 * Día del partido para la temporada ('YYYY-MM-DD' en la zona de la liga). Torneo, liga de parejas y noches: el
 * día del evento (su tabla no se parte entre dos temporadas). Escalera y liga por cajas, que duran meses: el del
 * partido (acordado, propuesto o confirmado); el del evento solo si el partido no tiene ninguno. Sin evento: el
 * del partido.
 */
export function seasonDay(
  m: Pick<Match, 'eventId' | 'scheduledAt' | 'proposedAt' | 'confirmedAt'>,
  events: ReadonlyMap<string, { date: string; type: string }>,
  tz?: string | null,
): string | null {
  const e = m.eventId ? events.get(m.eventId) : undefined;
  if (e && !LONG_EVENTS.has(e.type)) return e.date;
  return localParts(m.scheduledAt ?? m.proposedAt ?? m.confirmedAt, tz)?.date ?? e?.date ?? null;
}

/**
 * Ranking individual de la temporada con los partidos a sets que cuentan: cada jugador suma lo de su lado
 * (puntos de tabla 3/1/0, sets y juegos). Orden: puntos → ganados → dif. de sets → dif. de juegos → sorteo.
 */
export function seasonPlayerTable(
  matches: readonly Match[],
  opts: { sport: RacketSport; scheme?: PointsScheme; rules?: unknown; rosterOf?: (teamId: string) => readonly string[]; now?: number; lotSeed?: string },
): StandingRow[] {
  const pts = pointsRule(opts.sport, opts.scheme);
  const rows = new Map<string, StandingRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, for: 0, against: 0, diff: 0, extra: { setsFor: 0, setsAgainst: 0, setsDiff: 0, walkovers: 0 }, rank: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const m of finalMatches(matches.filter(isSetsMatch), opts.now)) {
    const res = racketResultOf(m, opts.sport, opts.rules);
    if (!res) continue;
    ([1, 2] as const).forEach((side) => {
      const i = side - 1;
      const sets = res.totals.sets ?? res.totals.games ?? [0, 0];
      const games = opts.sport === 'pickleball' ? (res.totals.points ?? [0, 0]) : (res.totals.games ?? [0, 0]);
      for (const p of sidePlayers(m.sides[i], opts.rosterOf)) {
        const r = row(p);
        r.played++;
        if (res.walkover === side) {
          r.lost++;
          r.points += pts.walkoverLoss;
          r.extra.walkovers++;
        } else if (res.walkover ? res.walkover !== side : res.winner === side) {
          r.won++;
          r.points += res.walkover ? (pts.walkoverWin ?? pts.win) : pts.win;
        } else {
          r.lost++;
          r.points += pts.loss;
        }
        r.for += games[i];
        r.against += games[1 - i];
        r.extra.setsFor += sets[i];
        r.extra.setsAgainst += sets[1 - i];
      }
    });
  }
  for (const r of rows.values()) {
    r.diff = r.for - r.against;
    r.extra.setsDiff = r.extra.setsFor - r.extra.setsAgainst;
    // En pickleball los «sets» son juegos: la columna «Jue.» (racketColumns) lee gamesDiff.
    if (opts.sport === 'pickleball') r.extra.gamesDiff = r.extra.setsDiff;
  }
  return resolveTies(
    [...rows.values()],
    [],
    [
      tiebreak.points(),
      tiebreak.wins(),
      tiebreak.stat('setsDiff', opts.sport === 'pickleball' ? 'dif. de juegos' : 'dif. de sets'),
      tiebreak.diff(opts.sport === 'pickleball' ? 'dif. de puntos' : 'dif. de juegos'),
      tiebreak.lot(opts.lotSeed ?? ''),
    ],
  );
}

export interface NightSeasonRow {
  id: string;
  rank: number;
  nights: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  against: number;
  /** Puntos por partido. */
  avg: number;
}

/** Americano y mexicano de la temporada por jugador: noches, partidos, puntos totales y por partido. */
export function seasonNightTable(matches: readonly Match[], opts: { now?: number } = {}): NightSeasonRow[] {
  const rows = new Map<string, NightSeasonRow & { events: Set<string> }>();
  for (const m of finalMatches(matches.filter(isPointsMatch), opts.now)) {
    const s = pair(m.score?.sides);
    if (!s) continue;
    ([0, 1] as const).forEach((i) => {
      const [me, them] = i === 0 ? s : [s[1], s[0]];
      for (const p of sidePlayers(m.sides[i])) {
        const r = rows.get(p) ?? { id: p, rank: 0, nights: 0, played: 0, won: 0, drawn: 0, lost: 0, points: 0, against: 0, avg: 0, events: new Set<string>() };
        r.played++;
        r.points += me;
        r.against += them;
        if (me > them) r.won++;
        else if (me < them) r.lost++;
        else r.drawn++;
        if (m.eventId) r.events.add(m.eventId);
        rows.set(p, r);
      }
    });
  }
  const list = [...rows.values()].map(({ events, ...r }) => ({ ...r, nights: events.size, avg: r.played ? Math.round((r.points / r.played) * 10) / 10 : 0 }));
  list.sort((a, b) => b.points - a.points || b.won - a.won || b.avg - a.avg || (a.id < b.id ? -1 : 1));
  list.forEach((r, i) => {
    const prev = list[i - 1];
    r.rank = prev && prev.points === r.points && prev.won === r.won && prev.avg === r.avg ? prev.rank : i + 1;
  });
  return list;
}
