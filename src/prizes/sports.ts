/**
 * Premios del torneo en los otros deportes (docs/premios-torneo.md §5): la competencia que arma cada pantalla
 * (`PrizeComp` de src/prizes/catalog.ts) y los podios que arma el teléfono donde el servidor no los calcula, con la
 * forma de src/prizes/providers.ts (`PodiumProvider`).
 *
 * - Relámpago, playoffs y torneos de raqueta por categorías: el podio lo calcula y lo comprueba el servidor
 *   (`tournament_podium`). Sus proveedores de aquí son la misma cuenta con lo que ya tiene la pantalla, solo para
 *   la tarjeta («Por ahora: …» y el aviso «El podio cambió», que compara las refs): nunca se entregan.
 * - Golf, natación y noches de raqueta: el servidor responde 'telefono' y el teléfono arma el podio con lo mismo que
 *   se ve en pantalla (`roundBoard`/`tournamentBoard`, `teamPoints`/`swimmerPoints`, `nightTable`/`socialTable`). El
 *   servidor solo revisa que quien recibe haya jugado (`private.prize_unit_players`).
 *
 * Todo es puro (sin React ni backend).
 */
import type { GolfCardDoc, GolfRoundFull } from '../lib/data/golf';
import { isFinal, type Match } from '../lib/data/matchCore';
import type { Playoff } from '../lib/data/playoffs';
import type { PodiumUnit } from '../lib/data/prizes';
import { todayIn } from '../badges/rules/periods';
import type { GolfCompetition } from '../sports/golf/scoring';
import { swimmerPoints, teamPoints, type Placed, type SwimmerScore, type TeamScore } from '../sports/swimming/results';
import type { StandingRow } from '../sports/types';
import { modeCompetition, roundBoard, tournamentBoard } from '../pages/sports/golf/logic';
import { unnamedComp, type PrizeComp } from './catalog';
import { placeOf, type PodiumProvider, type PodiumResult } from './providers';

type Named = { id: string; name: string; date: string };

// ---------- Las competencias ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * ¿Los premios del torneo de raqueta son por pareja? (`private.prize_racket_doubles`; lo mismo que
 * `useRacket().doubles` con reglas válidas): el pádel siempre; si no, `leagues.rules.match.doubles`, y sin eso el
 * pickleball en dobles y el tenis individual.
 */
export function racketPrizeDoubles(sport: string, leagueRules: unknown): boolean {
  if (sport === 'padel') return true;
  const d = isObj(leagueRules) && isObj(leagueRules.match) ? leagueRules.match.doubles : undefined;
  return typeof d === 'boolean' ? d : sport === 'pickleball';
}

/** Un torneo de raqueta por categorías (evento 'torneo' con `TourneyConfig`): una categoría premiada por categoría. */
export function racketTourneyComp(
  lid: string,
  event: Named,
  o: { sport: string; leagueRules: unknown; categories: readonly { id: string; name: string }[] },
): PrizeComp {
  return {
    lid,
    scope: 'evento',
    refId: event.id,
    kind: 'racket_tourney',
    sport: o.sport,
    name: event.name.trim() || unnamedComp('Torneo', event.date),
    date: event.date,
    racket: { doubles: racketPrizeDoubles(o.sport, o.leagueRules), categories: o.categories.map((c) => ({ id: c.id, name: c.name })) },
  };
}

/** Deportes con noches de puntos (americano y mexicano del pádel, round robin social del pickleball). */
const NIGHT_SPORTS: readonly string[] = ['padel', 'pickleball'];

/** Una noche de americano o mexicano, o el social del pickleball (solo individual). null = el deporte no tiene noches. */
export function racketNightComp(lid: string, event: Named, sport: string): PrizeComp | null {
  if (!NIGHT_SPORTS.includes(sport)) return null;
  return { lid, scope: 'evento', refId: event.id, kind: 'racket_night', sport, name: event.name.trim() || unnamedComp('Noche', event.date), date: event.date };
}

/**
 * El evento del torneo relámpago de una liga (como `private.prize_comp`): el primero de tipo torneo, por creación y
 * luego id (el que crea `create_tournament`). Otro evento de la liga no tiene premio propio: el podio sale de los
 * partidos de toda la liga y premiaría al mismo campeón otra vez. null si no hay.
 */
export function koEventOf<T extends { id: string; type: string; createdAt?: { toMillis(): number } | null }>(events: readonly T[]): T | null {
  const at = (e: T) => e.createdAt?.toMillis() ?? Number.POSITIVE_INFINITY;
  const list = events.filter((e) => e.type === 'torneo').sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return list[0] ?? null;
}

/**
 * El torneo relámpago de un «torneo sin liga» de equipos: el premio cuelga de su evento (el que crea
 * `create_tournament`, `koEventOf`), y el podio sale de los partidos de la liga. null = no es un torneo suelto o no
 * hay evento.
 */
export function teamKoComp(lid: string, o: { kind: string; sport: string; event: Named | null; leagueName: string }): PrizeComp | null {
  if (o.kind !== 'torneo' || !o.event) return null;
  return {
    lid,
    scope: 'evento',
    refId: o.event.id,
    kind: 'team_ko',
    sport: o.sport,
    name: o.event.name.trim() || o.leagueName.trim() || unnamedComp('Torneo', o.event.date),
    date: o.event.date,
  };
}

/**
 * El día de un playoff para la cinta por defecto (como `private.prize_default_period`): el de su último juego con hora,
 * en la zona de la liga; sin juegos con hora, hoy.
 */
export function playoffDate(
  playoff: Pick<Playoff, 'series'>,
  matches: readonly { seriesId?: string | null; scheduledAt: string | null; status: string }[],
  tz: string | null | undefined,
  now: number,
): string {
  const ids = new Set(playoff.series.map((s) => s.id));
  const last = matches
    .filter((m) => m.seriesId && ids.has(m.seriesId) && m.status !== 'void' && m.scheduledAt)
    .map((m) => Date.parse(m.scheduledAt!))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), -Infinity);
  return todayIn(Number.isFinite(last) ? last : now, tz);
}

/** Un playoff de baloncesto, fútbol o sala. `date` = el último juego (para la cinta por defecto). */
export function playoffComp(lid: string, playoff: { id: string; name: string }, sport: string, date: string | null): PrizeComp {
  return { lid, scope: 'playoff', refId: playoff.id, kind: 'playoff', sport, name: playoff.name.trim() || 'Playoffs', date };
}

/**
 * Golf: una ronda suelta (su evento) o, si la ronda es de un torneo de varias rondas, el torneo entero
 * (`golf_torneo`): no hay premio de una ronda dentro de un torneo. `date` = el día de la ronda (en un torneo, su
 * última ronda).
 */
export function golfComp(lid: string, o: { eventId: string; tournamentId: string | null; name: string; date: string | null }): PrizeComp {
  const name = o.name.trim() || unnamedComp(o.tournamentId ? 'Torneo' : 'Ronda', o.date);
  return o.tournamentId
    ? { lid, scope: 'golf_torneo', refId: o.tournamentId, kind: 'golf', sport: 'golf', name, date: o.date }
    : { lid, scope: 'evento', refId: o.eventId, kind: 'golf', sport: 'golf', name, date: o.date };
}

/** Un encuentro (o torneo) de natación. El control de marcas no tiene premios (null). */
export function swimComp(lid: string, meet: { id: string; type: string; name: string; date: string }): PrizeComp | null {
  if (meet.type === 'control') return null;
  return { lid, scope: 'evento', refId: meet.id, kind: 'swim', sport: 'swimming', name: meet.name.trim() || unnamedComp('Encuentro', meet.date), date: meet.date };
}

// ---------- Podios del teléfono ----------

/** Un jugador como unidad (`p:<id>`). */
export const playerUnit = (id: string, name: string) => ({ ref: `p:${id}`, name, teamId: null, players: [{ id, name }] });

/** Filas con puesto (`rank` null = sin puesto: no entra) en la forma de `placeOf`. */
const ranked = <T extends { rank: number | null }>(rows: readonly T[]) => rows.filter((r) => r.rank != null).map((row) => ({ row, pos: row.rank! }));

// Golf

/** Lo que se premia en golf: una ronda suelta, o todas las rondas de un torneo (con sus tarjetas). */
export interface GolfPrizeSource {
  rounds: readonly GolfRoundFull[];
  cards: readonly GolfCardDoc[];
}

/** La competencia de cada división: '' la oficial (la de la 1.ª ronda en un torneo), 'gross' y 'neto'. */
export function golfDivisionCompetition(comp: GolfCompetition, division: string): GolfCompetition {
  return division === 'gross' ? modeCompetition(comp, 'gross') : division === 'neto' ? modeCompetition(comp, 'net') : comp;
}

/**
 * El leaderboard con el que se premia: el de la ronda (`roundBoard`) o el del torneo (`tournamentBoard`, con la
 * competencia de su 1.ª ronda, como el orden de mérito). Descalificados y los que no terminaron no tienen puesto.
 */
export function golfPrizeBoard(src: GolfPrizeSource, division: string): { id: string; rank: number | null }[] {
  const ordered = [...src.rounds].sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0));
  if (!ordered.length) return [];
  const comp = golfDivisionCompetition(ordered[0].competition, division);
  if (ordered.length === 1 && !ordered[0].tournamentId) {
    return roundBoard(ordered[0], src.cards.filter((c) => c.eventId === ordered[0].eventId), comp);
  }
  const ids = new Set(ordered.map((r) => r.eventId));
  return tournamentBoard(ordered, src.cards.filter((c) => ids.has(c.eventId)), comp);
}

/** Un lugar del golf: los que tienen ese puesto en el leaderboard (1, 2, 2, 4; sin puesto no entra). */
export function golfPodium(rows: readonly { id: string; rank: number | null }[], place: number, nameOf: (playerId: string) => string): PodiumResult {
  return placeOf(ranked(rows), place, (r) => playerUnit(r.id, nameOf(r.id)));
}

/** El proveedor del golf: individual, con el leaderboard de cada división (se calcula una vez por división). */
export function golfProvider(src: GolfPrizeSource, nameOf: (playerId: string) => string): PodiumProvider {
  const boards = new Map<string, { id: string; rank: number | null }[]>();
  return (slot) => {
    if (slot.category !== 'individual' || !['', 'gross', 'neto'].includes(slot.division)) return null;
    let board = boards.get(slot.division);
    if (!board) boards.set(slot.division, (board = golfPrizeBoard(src, slot.division)));
    return golfPodium(board, slot.place, nameOf);
  };
}

// Natación

/** Nombres para el podio de la natación. */
export interface SwimNames {
  swimmer: (playerId: string) => string;
  club: (clubId: string) => string;
}

const byName = (a: { id: string; name: string }, b: { id: string; name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'es') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Los nadadores de un club que nadaron el encuentro (con tiempo y sin DQ, DNS ni DNF): lo que revisa el servidor. */
export function clubSwimmers(placed: readonly Placed[], clubId: string): string[] {
  return [...new Set(placed.filter((r) => r.teamId === clubId && r.place != null && r.swimmerId).map((r) => r.swimmerId!))];
}

/** Clubes del encuentro (`teamPoints`), sin los que no tienen a nadie que haya nadado (no hay a quién darle). */
export function swimClubs(placed: readonly Placed[]): TeamScore[] {
  return teamPoints(placed).filter((c) => clubSwimmers(placed, c.teamId).length > 0);
}

/**
 * Un lugar de la natación con todas las filas con puesto del encuentro (`placedMeet`): clubes (`equipo`, la unidad
 * `c:<club>` lleva a los nadadores del club que nadaron) o nadador (`individual`, división '' todos, 'F' o 'M').
 */
export function swimPodium(placed: readonly Placed[], slot: { category: string; division: string; place: number }, names: SwimNames): PodiumResult | null {
  if (slot.category === 'equipo' && slot.division === '') return swimClubsPodium(placed, swimClubs(placed), slot.place, names);
  if (slot.category === 'individual' && ['', 'F', 'M'].includes(slot.division)) {
    return swimmersPodium(swimmerPoints(placed, slot.division === 'F' || slot.division === 'M' ? slot.division : undefined), slot.place, names);
  }
  return null;
}

const swimClubsPodium = (placed: readonly Placed[], clubs: readonly TeamScore[], place: number, names: SwimNames): PodiumResult =>
  placeOf(ranked(clubs), place, (c) => ({
    ref: `c:${c.teamId}`,
    name: names.club(c.teamId),
    teamId: null,
    players: clubSwimmers(placed, c.teamId)
      .map((id) => ({ id, name: names.swimmer(id) }))
      .sort(byName),
    detail: `${pointsText(c.points)} puntos`,
  }));

const swimmersPodium = (list: readonly SwimmerScore[], place: number, names: SwimNames): PodiumResult =>
  placeOf(ranked(list), place, (s) => ({ ...playerUnit(s.swimmerId, names.swimmer(s.swimmerId)), detail: `${pointsText(s.points)} puntos` }));

const pointsText = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-DO', { maximumFractionDigits: 2 }));

/** El proveedor de la natación (clubes y nadadores se calculan una vez). */
export function swimProvider(placed: readonly Placed[], names: SwimNames): PodiumProvider {
  let clubs: TeamScore[] | null = null;
  const swimmers = new Map<string, SwimmerScore[]>();
  return (slot) => {
    if (slot.category === 'equipo' && slot.division === '') return swimClubsPodium(placed, (clubs ??= swimClubs(placed)), slot.place, names);
    if (slot.category !== 'individual' || !['', 'F', 'M'].includes(slot.division)) return null;
    let list = swimmers.get(slot.division);
    if (!list) swimmers.set(slot.division, (list = swimmerPoints(placed, slot.division === '' ? undefined : (slot.division as 'F' | 'M'))));
    return swimmersPodium(list, slot.place, names);
  };
}

// Noches de raqueta

/**
 * Un lugar de la noche de americano o mexicano (`nightTable`) o del social del pickleball (`socialTable`): solo los
 * que jugaron al menos un partido que cuenta (lo que revisa el servidor), con el puesto recontado entre ellos. Así,
 * quien solo descansó (y sumó puntos de descanso) no deja vacío el 1.er lugar: sube el siguiente. Los empates de la
 * tabla se respetan (1, 2, 2, 4).
 */
export function nightPodium(table: readonly StandingRow[], place: number, nameOf: (playerId: string) => string): PodiumResult {
  const played = table.filter((r) => r.played > 0);
  return placeOf(
    played.map((row) => ({ row, pos: 1 + played.filter((o) => o.rank < row.rank).length })),
    place,
    (r) => ({ ...playerUnit(r.id, nameOf(r.id)), detail: `${pointsText(r.points)} pts` }),
  );
}

/** El proveedor de la noche (solo individual). */
export function nightProvider(table: readonly StandingRow[], nameOf: (playerId: string) => string): PodiumProvider {
  return (slot) => (slot.category === 'individual' && slot.division === '' ? nightPodium(table, slot.place, nameOf) : null);
}

// ---------- Cuadros: la misma cuenta del servidor, para la tarjeta ----------

type BracketMatch = Pick<Match, 'id' | 'bracketKey' | 'status' | 'winner' | 'walkoverSide' | 'proposedAt' | 'sides'> & { seriesId?: string | null };

/** El lado que ganó un partido cuyo resultado cuenta (`private.prize_match_winner`), o null. */
function sideWon(m: BracketMatch | undefined, now: number): 1 | 2 | null {
  if (!m || !isFinal(m, now)) return null;
  return m.winner ?? (m.walkoverSide === 1 ? 2 : m.walkoverSide === 2 ? 1 : null);
}

const uniq = <T>(xs: readonly T[]) => [...new Set(xs)];

/** Nombres para los podios de los cuadros. */
export interface BracketNames {
  nameOf: (playerId: string) => string;
  /** La plantilla de una pareja o un equipo de temporada. */
  rosterOf: (teamId: string) => readonly string[];
}

const playersOf = (ids: readonly string[], nameOf: (id: string) => string) => ids.map((id) => ({ id, name: nameOf(id) })).sort(byName);

/**
 * Un lado de raqueta como unidad (`private.prize_side_unit`): los jugadores del partido de ese lado (si no hay, la
 * plantilla de su pareja); ref `t:<pareja>`, `p:<jugador>` si es uno solo, o `s:<partido>:<lado>`.
 */
export function racketSideUnit(m: BracketMatch, side: 1 | 2, names: BracketNames): PodiumUnit {
  const s = m.sides[side - 1];
  const fromMatch = uniq(s.players.map((p) => p.playerId));
  const ids = fromMatch.length ? fromMatch : s.teamId ? [...names.rosterOf(s.teamId)] : [];
  const ref = s.teamId ? `t:${s.teamId}` : ids.length === 1 ? `p:${ids[0]}` : `s:${m.id}:${side}`;
  return { ref, name: s.label || (ids.length === 1 ? names.nameOf(ids[0]) : ''), teamId: s.teamId, players: playersOf(ids, names.nameOf) };
}

const byUnit = (a: PodiumUnit, b: PodiumUnit) => byName({ id: a.ref, name: a.name }, { id: b.ref, name: b.name });
const result = (units: PodiumUnit[]): PodiumResult => ({ status: units.length ? 'listo' : 'vacio', units: [...units].sort(byUnit) });
const NONE: PodiumResult = { status: 'sin_resultado', units: [] };

/** Una categoría del torneo de raqueta (lo que el lugar necesita de `TourneyCategory`). */
export interface RacketPrizeCategory {
  id: string;
  seeds?: readonly string[];
  thirdPlace?: boolean;
}

/**
 * Un lugar del torneo de raqueta por categorías (`private.prize_racket_place`): 1.º quien ganó la final
 * `<cat>-R<rondas>-1`, 2.º quien la perdió (por W.O.: vacío), 3.º el ganador de `<cat>-P3` (por W.O.: vacío;
 * configurado y sin crear: sin resultado) o, sin P3, los que perdieron las semifinales (no por W.O.).
 */
export function racketTourneyPlace(cat: RacketPrizeCategory, place: number, matches: readonly BracketMatch[], names: BracketNames, now: number): PodiumResult {
  const n = new Set((cat.seeds ?? []).filter((x) => x !== '')).size;
  if (n < 2) return NONE;
  const rounds = Math.ceil(Math.log2(n));
  const at = (key: string) => matches.find((m) => m.bracketKey === `${cat.id}-${key}` && m.status !== 'void');
  const final = at(`R${rounds}-1`);
  const w = sideWon(final, now);
  if (!final || !w) return NONE;
  if (place === 1) return result([racketSideUnit(final, w, names)]);
  if (place === 2) return result(final.status === 'walkover' ? [] : [racketSideUnit(final, w === 1 ? 2 : 1, names)]);
  const p3 = at('P3');
  if (p3) {
    const x = sideWon(p3, now);
    if (!x) return NONE;
    return result(p3.status === 'walkover' ? [] : [racketSideUnit(p3, x, names)]);
  }
  if (cat.thirdPlace && n >= 4) return NONE;
  const out: PodiumUnit[] = [];
  if (rounds >= 2) {
    for (const i of [1, 2]) {
      const semi = at(`R${rounds - 1}-${i}`);
      const x = sideWon(semi, now);
      if (semi && x && semi.status !== 'walkover') out.push(racketSideUnit(semi, x === 1 ? 2 : 1, names));
    }
  }
  return result(out);
}

/** El proveedor del torneo de raqueta: cada categoría (`division` = su id) con su cuadro. */
export function racketTourneyProvider(categories: readonly RacketPrizeCategory[], matches: readonly BracketMatch[], names: BracketNames, now: number): PodiumProvider {
  return (slot) => {
    const cat = categories.find((c) => c.id === slot.division);
    return cat && (slot.category === 'pareja' || slot.category === 'individual') ? racketTourneyPlace(cat, slot.place, matches, names, now) : null;
  };
}

/** Nombres para los podios de equipos. */
export interface TeamNames extends BracketNames {
  teamName: (teamId: string) => string;
}

/**
 * Un equipo de temporada como unidad (`private.prize_team_unit`): su plantilla más quienes jugaron de su lado. Es para
 * mostrar («Por ahora», «El podio cambió» compara refs): los jugadores que se entregan son los de la base, que además
 * deja fuera a quien entró a la plantilla después del resultado y marca a quien jugó (`played`).
 */
export function teamUnit(teamId: string, matches: readonly BracketMatch[], names: TeamNames): PodiumUnit {
  const played = matches.flatMap((m) => m.sides.filter((s) => s.teamId === teamId).flatMap((s) => s.players.map((p) => p.playerId)));
  return { ref: `t:${teamId}`, name: names.teamName(teamId), teamId, players: playersOf(uniq([...names.rosterOf(teamId), ...played]), names.nameOf) };
}

const KO_KEY = /^R(\d+)-\d+$/;

/**
 * Un lugar del torneo relámpago (`private.prize_team_ko_place`, lo mismo que `knockoutPodium`): los partidos de la
 * liga que no son de un playoff ni están anulados; la final es el único partido de la ronda más alta `R<n>-<k>` (1.º
 * quien ganó, 2.º quien perdió) y el 3.º el ganador de `P3` (sin P3: vacío).
 */
export function teamKoPlace(place: number, leagueMatches: readonly BracketMatch[], names: TeamNames, now: number): PodiumResult {
  const ms = leagueMatches.filter((m) => !m.seriesId && m.status !== 'void');
  const roundOf = (m: BracketMatch) => Number(KO_KEY.exec(m.bracketKey ?? '')?.[1] ?? 0);
  const top = Math.max(0, ...ms.map(roundOf));
  const finals = ms.filter((m) => top > 0 && roundOf(m) === top);
  const final = finals.length === 1 ? finals[0] : undefined;
  const w = sideWon(final, now);
  if (!final || !w) return NONE;
  let teamId: string | null = null;
  if (place === 1 || place === 2) teamId = final.sides[(place === 1 ? w : w === 1 ? 2 : 1) - 1].teamId;
  else {
    const p3 = ms.find((m) => m.bracketKey === 'P3');
    if (p3) {
      const x = sideWon(p3, now);
      if (!x) return NONE;
      teamId = p3.sides[x - 1].teamId;
    }
  }
  return result(teamId ? [teamUnit(teamId, ms, names)] : []);
}

/** El proveedor del torneo relámpago (solo equipos). */
export function teamKoProvider(leagueMatches: readonly BracketMatch[], names: TeamNames, now: number): PodiumProvider {
  return (slot) => (slot.category === 'equipo' && slot.division === '' ? teamKoPlace(slot.place, leagueMatches, names, now) : null);
}

/** ¿Ya cuenta la final del relámpago? (lo mismo que `knockoutPodium` distinto de null). */
export const teamKoFinished = (leagueMatches: readonly BracketMatch[], now: number): boolean =>
  teamKoPlace(1, leagueMatches, { nameOf: () => '', rosterOf: () => [], teamName: () => '' }, now).status !== 'sin_resultado';

/**
 * Un lugar de un playoff terminado (`private.prize_playoff_place`; si no terminó, sin resultado): 1.º el campeón, 2.º
 * el rival en la serie final y 3.º los que perdieron las series de la ronda anterior (sin pases directos, hasta 2).
 * Los jugadores: la plantilla más quienes jugaron de su lado en los juegos del playoff.
 */
export function playoffPlace(p: Pick<Playoff, 'status' | 'winner' | 'series'>, place: number, leagueMatches: readonly BracketMatch[], names: TeamNames): PodiumResult {
  if (p.status !== 'finished') return NONE;
  const final = [...p.series].filter((s) => !s.nextSeries).sort((a, b) => b.round - a.round)[0];
  if (!final) return result([]);
  const ids = new Set(p.series.map((s) => s.id));
  const games = leagueMatches.filter((m) => !!m.seriesId && ids.has(m.seriesId) && m.status !== 'void');
  const loser = (s: { teamA: string | null; teamB: string | null; winner: string | null }) =>
    s.winner === s.teamA ? s.teamB : s.winner === s.teamB ? s.teamA : null;
  let teams: (string | null)[];
  if (place === 1) teams = [p.winner ?? final.winner];
  else if (place === 2) teams = [loser(final)];
  else
    teams = p.series
      .filter((s) => s.round === final.round - 1 && s.winner && !s.bye && loser(s))
      .sort((a, b) => a.slot - b.slot)
      .map(loser)
      .slice(0, 2);
  // El 3.º (los dos semifinalistas) va en el orden de las series, como el servidor.
  const units = teams.filter((x): x is string => !!x).map((t) => teamUnit(t, games, names));
  return { status: units.length ? 'listo' : 'vacio', units };
}

/** El proveedor de un playoff (solo equipos). */
export function playoffProvider(p: Pick<Playoff, 'status' | 'winner' | 'series'>, leagueMatches: readonly BracketMatch[], names: TeamNames): PodiumProvider {
  return (slot) => (slot.category === 'equipo' && slot.division === '' ? playoffPlace(p, slot.place, leagueMatches, names) : null);
}
