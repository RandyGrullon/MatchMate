/**
 * «Sugerencias de la app» al dar una insignia del creador (docs/insignias.md §5.5 y §5.6): los primeros de cada
 * plantilla con sus números («Promedio 187 · 24 juegos»), calculados en el teléfono con lo que la liga ya tiene. Usan
 * las mismas fuentes que las oficiales pero sin los mínimos de liga real: sirven justo en las ligas pequeñas. Solo
 * son una pista: «La app sugiere; la liga decide».
 *
 * Hoy sugieren el boliche (promedios de los juegos verificados), la raqueta (la tabla individual de la temporada, o
 * la de parejas si la insignia es por pareja) y los equipos (la tabla y los anotadores). El golf y la natación, y las
 * plantillas sin datos guardados (MVP fuera de equipos, juego limpio, mano amiga), las decide la liga.
 */
import { finalMatches, type Match } from '../../../lib/data/matchCore';
import type { BowlingEvent, Entry } from '../../../lib/types';
import { basketballSeason } from '../../../pages/sports/basketball/season';
import { footballSeason } from '../../../pages/sports/football/season';
import { isSetsMatch, seasonPlayerTable } from '../../../pages/sports/racket/logic/results';
import { localParts } from '../../../pages/sports/racket/logic/time';
import type { RacketSport } from '../../../sports/racket';
import type { StandingRow } from '../../../sports/types';
import { SPORT_FAMILY, type SportId } from '../../../sports/types';
import { MONTH_ABBR } from '../../../badges/visual';
import type { TemplateKey } from './templates';

export interface Suggestion {
  /** Jugador o equipo. */
  id: string;
  /** A quiénes se les da (el equipo completo con una insignia por equipo). */
  playerIds: string[];
  teamId: string | null;
  name: string;
  /** Los números: «Promedio 187 · 24 juegos». */
  detail: string;
  /** Puesto en la tabla (1, 2, 3…), si lo hay. */
  place: number | null;
}

export interface SuggestOutcome {
  list: Suggestion[];
  /** Por qué no hay sugerencias («Decide la liga»). */
  note: string | null;
}

/** Fechas que abarca el periodo de la insignia ('YYYY-MM-DD'; null = sin límite). */
export interface SuggestRange {
  from: string | null;
  to: string | null;
}

const none = (note: string): SuggestOutcome => ({ list: [], note });
export const DECIDE = 'Para esta insignia la app no sugiere: decide la liga.';

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Las fechas del periodo de la cinta: «OCT 2026» es ese mes, «2026» ese año, «TEMP …» la temporada de la liga (o el
 * año que dice). Sin periodo o con un texto libre, la temporada de la liga, o el año de hoy.
 */
export function rangeOfPeriod(text: string, season: { seasonStart?: string; seasonEnd?: string }, today: string): SuggestRange {
  const t = text.trim().toUpperCase();
  const month = /^([A-Z]{3}) (\d{4})$/.exec(t);
  const mi = month ? MONTH_ABBR.indexOf(month[1] as (typeof MONTH_ABBR)[number]) : -1;
  if (month && mi >= 0) {
    const y = Number(month[2]);
    return { from: `${y}-${pad(mi + 1)}-01`, to: `${y}-${pad(mi + 1)}-${pad(lastDay(y, mi + 1))}` };
  }
  if (/^\d{4}$/.test(t)) return { from: `${t}-01-01`, to: `${t}-12-31` };
  if (isDate(season.seasonStart) || isDate(season.seasonEnd)) return { from: isDate(season.seasonStart) ? season.seasonStart : null, to: isDate(season.seasonEnd) ? season.seasonEnd : null };
  const y = /^TEMP (\d{4})$/.exec(t)?.[1] ?? today.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const inRange = (r: SuggestRange, day: string | null | undefined) => !!day && (!r.from || day >= r.from) && (!r.to || day <= r.to);

const byName = (names: ReadonlyMap<string, string>) => (a: string, b: string) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'es');

/** Puestos con empates compartidos (1, 1, 3). */
function places<T>(rows: readonly T[], value: (r: T) => number): { row: T; place: number }[] {
  let last = NaN;
  let place = 0;
  return rows.map((row, i) => {
    const v = value(row);
    if (v !== last) place = i + 1;
    last = v;
    return { row, place };
  });
}

const ORDINAL = (n: number) => `${n}.º`;

// ---------------------------------------------------------------------------------------------------------
// Boliche

export interface BowlingSuggestInput {
  events: readonly Pick<BowlingEvent, 'id' | 'date'>[];
  entries: readonly Pick<Entry, 'eventId' | 'playerId' | 'scores' | 'photos'>[];
  names: ReadonlyMap<string, string>;
  range: SuggestRange;
}

interface BowlingRow {
  id: string;
  games: number;
  avg: number;
  /** Eventos con algún juego verificado. */
  events: Set<string>;
  /** Juegos verificados en orden de fecha. */
  scores: number[];
}

/** Los juegos verificados (con foto, «importado» o «sin foto» aprobados) de cada jugador dentro de las fechas. */
function bowlingRows(input: BowlingSuggestInput, range: SuggestRange): { rows: BowlingRow[]; held: Set<string> } {
  const dateOf = new Map(input.events.map((e) => [e.id, e.date] as const));
  const by = new Map<string, { id: string; games: { date: string; score: number }[]; events: Set<string> }>();
  const held = new Set<string>();
  for (const e of input.entries) {
    const date = dateOf.get(e.eventId);
    if (!date || !inRange(range, date) || !input.names.has(e.playerId)) continue;
    (e.scores ?? []).forEach((s, i) => {
      if (s == null || !e.photos?.[i]) return;
      const r = by.get(e.playerId) ?? { id: e.playerId, games: [], events: new Set<string>() };
      r.games.push({ date, score: s });
      r.events.add(e.eventId);
      held.add(e.eventId);
      by.set(e.playerId, r);
    });
  }
  const rows = [...by.values()].map((r) => {
    const sorted = [...r.games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const pins = sorted.reduce((s, g) => s + g.score, 0);
    return { id: r.id, games: sorted.length, avg: sorted.length ? Math.floor(pins / sorted.length) : 0, events: r.events, scores: sorted.map((g) => g.score) };
  });
  return { rows, held };
}

const bowlingDetail = (r: BowlingRow) => `Promedio ${r.avg} · ${r.games} ${r.games === 1 ? 'juego' : 'juegos'}`;
const MIN_GAMES = 6;

function rankedBowling(rows: readonly BowlingRow[], names: ReadonlyMap<string, string>): { row: BowlingRow; place: number }[] {
  const sorted = [...rows].sort((a, b) => b.avg - a.avg || b.games - a.games || byName(names)(a.id, b.id));
  return places(sorted, (r) => r.avg);
}

const one = (id: string, names: ReadonlyMap<string, string>, detail: string, place: number | null = null): Suggestion => ({
  id,
  playerIds: [id],
  teamId: null,
  name: names.get(id) ?? 'Jugador',
  detail,
  place,
});

export function bowlingSuggest(key: TemplateKey, input: BowlingSuggestInput): SuggestOutcome {
  const { names, range } = input;
  const podium = (start: number) => {
    const { rows } = bowlingRows(input, range);
    const ranked = rankedBowling(
      rows.filter((r) => r.games >= MIN_GAMES),
      names,
    );
    const list = ranked.filter((x) => x.place > start).slice(0, 3);
    return list.length
      ? { list: list.map((x) => one(x.row.id, names, `${ORDINAL(x.place)} · ${bowlingDetail(x.row)}`, x.place)), note: null }
      : none(`Todavía nadie tiene ${MIN_GAMES} juegos verificados en este periodo.`);
  };
  switch (key) {
    case 'champion':
      return podium(0);
    case 'runner_up':
      return podium(1);
    case 'third_place':
      return podium(2);
    case 'best_average': {
      const { rows, held } = bowlingRows(input, range);
      const ranked = rankedBowling(
        rows.filter((r) => r.games >= MIN_GAMES && r.events.size * 2 >= held.size),
        names,
      );
      return ranked.length
        ? { list: ranked.slice(0, 3).map((x) => one(x.row.id, names, bowlingDetail(x.row), x.place)), note: null }
        : none(`Todavía nadie tiene ${MIN_GAMES} juegos verificados y la mitad de las fechas.`);
    }
    case 'player_of_the_month': {
      const { rows } = bowlingRows(input, range);
      const ranked = rankedBowling(
        rows.filter((r) => r.games >= 4),
        names,
      );
      return ranked.length
        ? { list: ranked.slice(0, 3).map((x) => one(x.row.id, names, bowlingDetail(x.row), x.place)), note: null }
        : none('Todavía nadie tiene 4 juegos verificados en ese mes.');
    }
    case 'most_improved': {
      const { rows } = bowlingRows(input, range);
      const list = rows
        .filter((r) => r.games >= 12)
        .map((r) => {
          const half = Math.floor(r.games / 2);
          const a = Math.floor(r.scores.slice(0, half).reduce((s, x) => s + x, 0) / half);
          const b = Math.floor(r.scores.slice(half).reduce((s, x) => s + x, 0) / (r.games - half));
          return { r, a, b, delta: b - a };
        })
        .filter((x) => x.delta > 0)
        .sort((x, y) => y.delta - x.delta || byName(names)(x.r.id, y.r.id));
      return list.length
        ? { list: list.slice(0, 3).map((x) => one(x.r.id, names, `+${x.delta} pinos (${x.a} → ${x.b}) · ${x.r.games} juegos`)), note: null }
        : none('Nadie tiene 12 juegos verificados con mejora en este periodo.');
    }
    case 'perfect_attendance': {
      const { rows, held } = bowlingRows(input, range);
      if (held.size < 3) return none('Hace falta que haya al menos 3 fechas jugadas en este periodo.');
      const list = rows.filter((r) => r.events.size === held.size).sort((a, b) => byName(names)(a.id, b.id));
      return list.length
        ? { list: list.slice(0, 20).map((r) => one(r.id, names, `${held.size} de ${held.size} fechas`)), note: null }
        : none('Nadie fue a todas las fechas de este periodo.');
    }
    case 'rookie_of_the_year': {
      // Nuevo: su primer juego verificado en la liga cae dentro del periodo, y fue a la mitad de las fechas o más.
      const first = new Map<string, string>();
      const dateOf = new Map(input.events.map((e) => [e.id, e.date] as const));
      for (const e of input.entries) {
        const d = dateOf.get(e.eventId);
        if (!d || !(e.scores ?? []).some((s, i) => s != null && e.photos?.[i])) continue;
        const f = first.get(e.playerId);
        if (!f || d < f) first.set(e.playerId, d);
      }
      const { rows, held } = bowlingRows(input, range);
      const ranked = rankedBowling(
        rows.filter((r) => inRange(range, first.get(r.id)) && r.events.size * 2 >= held.size && r.games >= 3),
        names,
      );
      return ranked.length
        ? { list: ranked.slice(0, 3).map((x) => one(x.row.id, names, `${bowlingDetail(x.row)} · primera temporada`, x.place)), note: null }
        : none('No hay jugadores nuevos con la mitad de las fechas en este periodo.');
    }
    case 'mvp':
      return none('No hay un MVP guardado: decide la liga.');
    case 'fair_play':
      return none('La app no lleva la cuenta del juego limpio: decide la liga.');
    case 'helping_hand_league':
      return none('Decide la liga: piensa en quien ayuda en la mesa y a armar las fechas.');
  }
}

// ---------------------------------------------------------------------------------------------------------
// Raqueta

export interface RacketSuggestInput {
  sport: RacketSport;
  matches: readonly Match[];
  /** Equipos y parejas de temporada, con su plantilla. */
  teams: readonly { id: string; name: string; roster: readonly { playerId: string }[] }[];
  names: ReadonlyMap<string, string>;
  range: SuggestRange;
  /** Se da a la pareja completa. */
  byTeam: boolean;
  tz?: string | null;
  now: number;
}

const pct = (won: number, played: number) => (played ? Math.round((won / played) * 100) : 0);
const racketDetail = (won: number, played: number) => `${won} de ${played} ganados · ${pct(won, played)} %`;

function matchDay(m: Match, tz: string | null | undefined): string | null {
  return localParts(m.scheduledAt ?? m.proposedAt ?? m.confirmedAt, tz)?.date ?? null;
}

export function racketSuggest(key: TemplateKey, input: RacketSuggestInput): SuggestOutcome {
  const { names } = input;
  const rosters = new Map(input.teams.map((t) => [t.id, t.roster.map((r) => r.playerId)] as const));
  const rosterOf = (id: string) => rosters.get(id) ?? [];
  const within = (r: SuggestRange) => input.matches.filter((m) => isSetsMatch(m) && inRange(r, matchDay(m, input.tz)));
  const table = (list: readonly Match[]) => seasonPlayerTable(list, { sport: input.sport, rosterOf, now: input.now }).filter((r) => names.has(r.id) && r.played > 0);
  const player = (r: StandingRow, place: number | null) => one(r.id, names, `${place ? `${ORDINAL(place)} · ` : ''}${racketDetail(r.won, r.played)}`, place);

  // Por pareja: ganados y jugados de cada pareja de temporada (la insignia va a los dos).
  const pairs = (list: readonly Match[]): Suggestion[] => {
    const by = new Map<string, { won: number; played: number }>();
    for (const m of finalMatches(list, input.now)) {
      if (!m.winner) continue;
      m.sides.forEach((s, i) => {
        if (!s.teamId || !rosters.has(s.teamId)) return;
        const r = by.get(s.teamId) ?? { won: 0, played: 0 };
        r.played++;
        if (m.winner === i + 1) r.won++;
        by.set(s.teamId, r);
      });
    }
    const sorted = [...by.entries()].sort((a, b) => b[1].won - a[1].won || pct(b[1].won, b[1].played) - pct(a[1].won, a[1].played));
    return places(sorted, ([, r]) => r.won * 1000 + pct(r.won, r.played)).map(({ row: [id, r], place }) => ({
      id,
      playerIds: rosterOf(id),
      teamId: id,
      name: input.teams.find((t) => t.id === id)?.name ?? 'Pareja',
      detail: `${ORDINAL(place)} · ${racketDetail(r.won, r.played)}`,
      place,
    }));
  };

  const podium = (start: number) => {
    const list = within(input.range);
    if (input.byTeam) {
      const p = pairs(list).filter((x) => (x.place ?? 0) > start).slice(0, 3);
      return p.length ? { list: p, note: null } : none('Todavía no hay partidos de parejas que cuenten en este periodo.');
    }
    const rows = table(list).filter((r) => r.rank > start).slice(0, 3);
    return rows.length ? { list: rows.map((r) => player(r, r.rank)), note: null } : none('Todavía no hay partidos que cuenten en este periodo.');
  };

  switch (key) {
    case 'champion':
      return podium(0);
    case 'runner_up':
      return podium(1);
    case 'third_place':
      return podium(2);
    case 'best_average': {
      const rows = table(within(input.range))
        .filter((r) => r.played >= 8)
        .sort((a, b) => pct(b.won, b.played) - pct(a.won, a.played) || b.played - a.played);
      return rows.length ? { list: rows.slice(0, 3).map((r) => player(r, null)), note: null } : none('Nadie tiene 8 partidos que cuenten en este periodo.');
    }
    case 'player_of_the_month': {
      const rows = table(within(input.range)).filter((r) => r.played >= 4);
      return rows.length ? { list: rows.slice(0, 3).map((r) => player(r, r.rank)), note: null } : none('Nadie tiene 4 partidos que cuenten en ese mes.');
    }
    case 'most_improved': {
      const list = within(input.range)
        .map((m) => ({ m, d: matchDay(m, input.tz) ?? '' }))
        .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
      if (list.length < 4) return none('Todavía hay muy pocos partidos en este periodo.');
      const mid = list[Math.floor(list.length / 2)].d;
      const first = new Map(table(list.filter((x) => x.d < mid).map((x) => x.m)).map((r) => [r.id, r] as const));
      const second = table(list.filter((x) => x.d >= mid).map((x) => x.m));
      const rows = second
        .map((b) => ({ b, a: first.get(b.id) }))
        .filter((x): x is { b: StandingRow; a: StandingRow } => !!x.a && x.a.played >= 5 && x.b.played >= 5)
        .map((x) => ({ ...x, delta: pct(x.b.won, x.b.played) - pct(x.a.won, x.a.played) }))
        .filter((x) => x.delta > 0)
        .sort((x, y) => y.delta - x.delta);
      return rows.length
        ? { list: rows.slice(0, 3).map((x) => one(x.b.id, names, `De ${pct(x.a.won, x.a.played)} % a ${pct(x.b.won, x.b.played)} % de partidos ganados`)), note: null }
        : none('Nadie tiene 5 partidos en cada mitad con mejora en este periodo.');
    }
    case 'mvp':
      return none('No hay un MVP guardado: decide la liga.');
    case 'fair_play':
      return none('La app no lleva la cuenta del juego limpio: decide la liga.');
    case 'perfect_attendance':
    case 'rookie_of_the_year':
      return none(DECIDE);
    case 'helping_hand_league':
      return none('Decide la liga: piensa en quien ayuda a organizar.');
  }
}

// ---------------------------------------------------------------------------------------------------------
// Equipos: baloncesto, fútbol y sala

export interface TeamSuggestInput {
  sport: 'basketball' | 'football' | 'futsal';
  matches: readonly Match[];
  teams: readonly { id: string; name: string; roster: readonly { playerId: string }[] }[];
  rules: unknown;
  names: ReadonlyMap<string, string>;
  range: SuggestRange;
  tz?: string | null;
  now: number;
}

export function teamSuggest(key: TemplateKey, input: TeamSuggestInput): SuggestOutcome {
  const { names } = input;
  const teamIds = input.teams.map((t) => t.id);
  const teamName = (id: string) => input.teams.find((t) => t.id === id)?.name ?? 'Equipo';
  const rosterOf = (id: string) => input.teams.find((t) => t.id === id)?.roster.map((r) => r.playerId) ?? [];
  const list = input.matches.filter((m) => inRange(input.range, matchDay(m, input.tz)));
  const basket = input.sport === 'basketball';
  const season = basket ? basketballSeason(list, teamIds, input.rules, input.now) : footballSeason({ matches: list, teamIds, rules: input.rules, now: input.now });
  const standings = season.standings.filter((r) => r.played > 0);
  const gamesOf = new Map(season.standings.map((r) => [r.id, r.played] as const));

  const podium = (start: number): SuggestOutcome => {
    const rows = standings.filter((r) => r.rank > start).slice(0, 3);
    return rows.length
      ? {
          list: rows.map((r) => ({
            id: r.id,
            playerIds: rosterOf(r.id),
            teamId: r.id,
            name: teamName(r.id),
            detail: `${ORDINAL(r.rank)} · ${r.points} pts · ${r.won}-${r.drawn}-${r.lost}`,
            place: r.rank,
          })),
          note: null,
        }
      : none('Todavía no hay partidos que cuenten en este periodo.');
  };

  const scorers = (minShare: number): Suggestion[] => {
    if (basket && 'leaders' in season) {
      return season.leaders
        .filter((l) => names.has(l.player) && l.games * minShare >= (gamesOf.get(l.team) ?? 0) && l.games > 0)
        .sort((a, b) => b.avg - a.avg || b.games - a.games)
        .slice(0, 3)
        .map((l) => one(l.player, names, `${String(l.avg).replace('.', ',')} puntos por partido · ${l.games} ${l.games === 1 ? 'partido' : 'partidos'}`));
    }
    if ('scorers' in season) {
      return season.scorers
        .filter((s) => names.has(s.player) && s.goals > 0)
        .slice(0, 3)
        .map((s) => one(s.player, names, `${s.goals} ${s.goals === 1 ? 'gol' : 'goles'} · ${s.assists} ${s.assists === 1 ? 'asistencia' : 'asistencias'} · ${s.games} partidos`));
    }
    return [];
  };

  switch (key) {
    case 'champion':
      return podium(0);
    case 'runner_up':
      return podium(1);
    case 'third_place':
      return podium(2);
    case 'mvp': {
      if (!basket && 'scorers' in season) {
        const rows = season.scorers
          .filter((s) => names.has(s.player) && s.goals + s.assists > 0)
          .sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals)
          .slice(0, 3)
          .map((s) => one(s.player, names, `${s.goals} goles + ${s.assists} asistencias`));
        return rows.length ? { list: rows, note: null } : none('Todavía no hay goles anotados en este periodo.');
      }
      const rows = scorers(2);
      return rows.length ? { list: rows, note: null } : none('Todavía no hay puntos anotados en este periodo.');
    }
    case 'best_average':
    case 'player_of_the_month': {
      const rows = scorers(key === 'best_average' ? 2 : 1);
      return rows.length ? { list: rows, note: null } : none('Todavía no hay anotaciones en este periodo.');
    }
    case 'fair_play':
      return none('Decide la liga: mira las tarjetas y las faltas de la temporada.');
    case 'most_improved':
    case 'perfect_attendance':
    case 'rookie_of_the_year':
      return none(DECIDE);
    case 'helping_hand_league':
      return none('Decide la liga: piensa en quien ayuda en la mesa y con los equipos.');
  }
}

/** ¿La app sabe sugerir en ese deporte? (el golf y la natación, todavía no). */
export const suggestsFor = (sport: string | null | undefined): 'bowling' | 'racket' | 'team' | null => {
  if (sport === 'bowling') return 'bowling';
  const f = sport && Object.hasOwn(SPORT_FAMILY, sport) ? SPORT_FAMILY[sport as SportId] : null;
  return f === 'racket' ? 'racket' : f === 'team' ? 'team' : null;
};
