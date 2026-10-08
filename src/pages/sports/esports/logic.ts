/**
 * Lo puro de las pantallas del torneo de esports (docs/esports.md §12.8): qué vistas lleva cada formato, la única acción
 * principal, el plan del cuadro con los ajustes del torneo, el cuadro guardado (partidos + enlaces) vuelto plan para el
 * motor, de partidos a `KeyResult`, las tablas de grupos y liga, la plantilla al inscribirse, los agentes libres y las
 * partidas de battle royale. Sin React ni llamadas al backend: lo prueban `logic.test.ts` y las pantallas.
 */
import { awaitingConfirmation, isFinal, isOpen, type Match } from '../../../lib/data/matchCore';
import type { BrGame, EntryMember, EsportsEntry, EsportsTournament, StageLink } from '../../../lib/data/esports';
// Los pasos de partidos a resultados son de la capa de datos (funciones puras: no llaman al backend), para que el cuadro,
// las tablas y sus pruebas usen una sola regla.
import { entriesBySideTeam, keyResultOf, keyResults, seriesInput } from '../../../lib/data/esports';
import type { Side, StandingRow } from '../../../sports/types';
import {
  GAMES,
  brStandings,
  canVerifyId,
  canVerifyRank,
  doubleEliminationPlan,
  esportsStandings,
  gameWinner,
  groupOf,
  groupsPlan,
  isGameId,
  isIndividualMode,
  minEntries,
  modeSize,
  needed,
  parseSeriesScore,
  playoffSeeds,
  rankKeyFor,
  rankOrdinal,
  roundRobinPlan,
  seedEntries,
  seriesMatchResult,
  seriesWinner,
  singleEliminationPlan,
  tournamentPhase,
  type BestOf,
  type BrGameInput,
  type BrRow,
  type EntryType,
  type Format,
  type GameId,
  type GameRecord,
  type KeyResult,
  type Mode,
  type Phase,
  type PlannedMatch,
  type RankSource,
  type RankValue,
  type SeedEntry,
  type SeriesResultInput,
  type SeriesRules,
  type SlotSource,
  type StageKind,
  type StagePlan,
  type TournamentSettings,
} from '../../../sports/esports';

// ---------- Vistas ----------

export type View = 'cuadro' | 'grupos' | 'playoffs' | 'tabla' | 'partidos' | 'partidas' | 'equipos' | 'info';

/**
 * Las vistas del torneo (un Segmented de 3): simple/doble → Cuadro · Equipos · Info; grupos + playoffs → Grupos ·
 * Playoffs · Equipos; todos contra todos → Tabla · Partidos · Equipos; battle royale → Tabla · Partidas · Equipos
 * («Jugadores» en modo individual). Donde no cabe «Info», va al final de «Equipos» (`infoInTeams`).
 */
export function viewsFor(format: Format, mode: Mode): { key: View; label: string }[] {
  const teams = { key: 'equipos' as const, label: isIndividualMode(mode) ? 'Jugadores' : 'Equipos' };
  switch (format) {
    case 'single_elim':
    case 'double_elim':
      return [{ key: 'cuadro', label: 'Cuadro' }, teams, { key: 'info', label: 'Info' }];
    case 'groups_playoffs':
      return [{ key: 'grupos', label: 'Grupos' }, { key: 'playoffs', label: 'Playoffs' }, teams];
    case 'round_robin':
      return [{ key: 'tabla', label: 'Tabla' }, { key: 'partidos', label: 'Partidos' }, teams];
    case 'br':
      return [{ key: 'tabla', label: 'Tabla' }, { key: 'partidas', label: 'Partidas' }, teams];
  }
}

/** «Info» va dentro de «Equipos» (no tiene su propia vista). */
export const infoInTeams = (format: Format) => !viewsFor(format, '5v5').some((v) => v.key === 'info');

/** La vista pedida (`?ver=`) si el formato la tiene; si no, la primera. */
export function pickView(format: Format, mode: Mode, wanted: string | null | undefined): View {
  const views = viewsFor(format, mode);
  return views.find((v) => v.key === wanted)?.key ?? views[0].key;
}

// ---------- Inscritos ----------

/** Inscripción viva (cuenta para el cupo o espera respuesta). */
export const isLiveEntry = (e: Pick<EsportsEntry, 'status'>) => e.status === 'pending' || e.status === 'approved';

/** Los que compiten: equipos e individuales aprobados (los agentes libres no), por siembra y después por nombre. */
export function competitors<E extends Pick<EsportsEntry, 'kind' | 'status' | 'seed' | 'name'>>(entries: readonly E[]): E[] {
  return entries
    .filter((e) => e.status === 'approved' && e.kind !== 'free_agent')
    .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.name.localeCompare(b.name, 'es'));
}

/** Por aprobar (todas las clases). */
export const pendingEntries = <E extends Pick<EsportsEntry, 'status'>>(entries: readonly E[]): E[] => entries.filter((e) => e.status === 'pending');

/** Agentes libres vivos (todavía sin equipo). */
export const freeAgents = <E extends Pick<EsportsEntry, 'kind' | 'status'>>(entries: readonly E[]): E[] =>
  entries.filter((e) => e.kind === 'free_agent' && isLiveEntry(e));

/** Mi inscripción viva en el torneo: donde está mi foto o soy el capitán. */
export function myEntryOf<E extends Pick<EsportsEntry, 'status' | 'captainId' | 'members'>>(entries: readonly E[], uid: string | null | undefined): E | null {
  if (!uid) return null;
  return entries.find((e) => isLiveEntry(e) && (e.captainId === uid || e.members.some((m) => m.userId === uid))) ?? null;
}

/** Quien habla por la inscripción: el capitán (o el individual). */
export const speaksFor = (e: Pick<EsportsEntry, 'captainId'> | null, uid: string | null | undefined) => !!e && !!uid && e.captainId === uid;

/** Equipo de temporada → inscrito (los partidos van por el equipo de temporada, §5.3): el de la capa de datos. */
export const entryBySideTeam = entriesBySideTeam;

/** Titulares (capitán + miembros) y suplentes de una plantilla. */
export function rosterCount(members: readonly Pick<EntryMember, 'role'>[]): { starters: number; subs: number } {
  const subs = members.filter((m) => m.role === 'sub').length;
  return { starters: members.length - subs, subs };
}

/** «5 titulares · 1 suplente». */
export function rosterText(starters: number, subs: number): string {
  const a = `${starters} ${starters === 1 ? 'titular' : 'titulares'}`;
  return subs ? `${a} · ${subs} ${subs === 1 ? 'suplente' : 'suplentes'}` : a;
}

/** Lugares que le quedan a un inscrito de equipo (titulares + suplentes del torneo). */
export const teamRoom = (e: Pick<EsportsEntry, 'members'>, mode: Mode, subs: number) => Math.max(0, modeSize(mode) + subs - e.members.length);

/** El ordinal del rango de un miembro para la clave del modo (Rocket League: el del modo). */
export function memberOrdinal(game: GameId, mode: Mode, ranks: Partial<Record<string, RankValue>> | null | undefined): number | null {
  return rankOrdinal(game, ranks?.[rankKeyFor(game, mode)] ?? null);
}

/** El rango que se muestra de un miembro (la clave del modo). */
export const memberRank = (game: GameId, mode: Mode, ranks: Partial<Record<string, RankValue>> | null | undefined): RankValue | null =>
  ranks?.[rankKeyFor(game, mode)] ?? null;

/** Para sembrar por rango: el ordinal de cada titular. */
export function seedEntryList(entries: readonly Pick<EsportsEntry, 'id' | 'members'>[], game: GameId, mode: Mode): SeedEntry[] {
  return entries.map((e) => ({ id: e.id, ordinals: e.members.filter((m) => m.role !== 'sub').map((m) => memberOrdinal(game, mode, m.ranks)) }));
}

/**
 * La siembra para armar el cuadro: si todos los aprobados ya tienen número, ese orden; si no, los que tienen número
 * primero (manual) y los demás con el método del torneo (al azar con la semilla del evento, o por rango).
 */
export function seedsFor(
  entries: readonly EsportsEntry[],
  t: Pick<EsportsTournament, 'eventId' | 'game' | 'mode' | 'settings'>,
): string[] {
  const list = competitors(entries);
  if (list.length && list.every((e) => e.seed != null)) return list.map((e) => e.id);
  const seeded = list.filter((e) => e.seed != null).map((e) => e.id);
  const method = seeded.length ? 'manual' : t.settings.seeding;
  const order = seedEntries(seedEntryList(list, t.game, t.mode), method === 'manual' ? 'manual' : method, {
    seed: t.eventId,
    teamSize: modeSize(t.mode),
    manual: seeded,
  });
  if (method !== 'manual' || seeded.length === list.length) return order;
  // Los que no tienen número van después, con el método del torneo entre ellos.
  const rest = list.filter((e) => e.seed == null);
  const tail = seedEntries(seedEntryList(rest, t.game, t.mode), t.settings.seeding === 'manual' ? 'random' : t.settings.seeding, {
    seed: t.eventId,
    teamSize: modeSize(t.mode),
  });
  return [...seeded, ...tail];
}

// ---------- El plan (antes de crear la fase) ----------

/** La primera fase del formato (BR no tiene: se juega por partidas). */
export function firstStage(format: Format): StageKind | null {
  switch (format) {
    case 'single_elim':
    case 'double_elim':
      return 'bracket';
    case 'groups_playoffs':
      return 'groups';
    case 'round_robin':
      return 'league';
    case 'br':
      return null;
  }
}

/** Arma la primera fase con los ajustes del torneo y la siembra. null en battle royale. */
export function planFor(t: Pick<EsportsTournament, 'format' | 'settings'>, seeds: readonly string[]): StagePlan | null {
  const s = t.settings;
  switch (t.format) {
    case 'single_elim':
      return singleEliminationPlan(seeds, { thirdPlace: s.thirdPlace, bestOf: s.bestOf.playoffs, finalBestOf: s.bestOf.final, kind: 'bracket' });
    case 'double_elim':
      return doubleEliminationPlan(seeds, { bracketReset: s.bracketReset, bestOf: s.bestOf.playoffs, finalBestOf: s.bestOf.final, kind: 'bracket' });
    case 'groups_playoffs':
      return groupsPlan(seeds, { groups: s.groups, double: s.doubleRoundRobin, bestOf: s.bestOf.groups });
    case 'round_robin':
      return roundRobinPlan(seeds, { double: s.doubleRoundRobin, bestOf: s.bestOf.groups });
    case 'br':
      return null;
  }
}

/** Los playoffs con las tablas finales de los grupos (1A–2B, 1B–2A…), simples o dobles según el torneo. */
export function playoffsPlanFor(t: Pick<EsportsTournament, 'settings'>, groupTables: readonly (readonly string[])[]): StagePlan {
  const s = t.settings;
  const seeds = playoffSeeds(groupTables, s.perGroup);
  return s.playoffs === 'double'
    ? doubleEliminationPlan(seeds, { bracketReset: s.bracketReset, bestOf: s.bestOf.playoffs, finalBestOf: s.bestOf.final, kind: 'playoffs' })
    : singleEliminationPlan(seeds, { thirdPlace: s.thirdPlace, bestOf: s.bestOf.playoffs, finalBestOf: s.bestOf.final, kind: 'playoffs' });
}

/** Cuántos hacen falta para armar: el mínimo del formato (doble y grupos 4; todos contra todos 3; simple y BR 2). */
export const enoughToStart = (format: Format, approved: number) => approved >= minEntries(format);

// ---------- El cuadro guardado (partidos + enlaces) vuelto plan ----------

/** 'W1-2' → 1 (posición desde 0); 'G1-R2-3' → 2; sin número → 0. */
export function keyIndex(key: string): number {
  const m = /-(\d+)$/.exec(key);
  return m ? Math.max(0, Number(m[1]) - 1) : 0;
}

/** Los partidos de una fase con su enlace (los de las otras fases no). */
export function stageMatches(stage: StageKind, matches: readonly Match[], links: readonly StageLink[]): { match: Match; link: StageLink }[] {
  const byId = new Map(links.filter((l) => l.stage === stage).map((l) => [l.matchId, l]));
  return matches.filter((m) => byId.has(m.id)).map((m) => ({ match: m, link: byId.get(m.id)! }));
}

/**
 * El plan de una fase ya creada, armado desde la base (`matches` + `esports_matches`): la llave es `bracket_key`, la
 * parte y el grupo vienen del enlace, y cada lado es el inscrito (por su equipo de temporada) o, si todavía no se sabe,
 * el ganador o el perdedor del partido que apunta ahí. Así `resolvePlan` y `champion` del motor sirven igual que con el
 * plan recién hecho.
 */
export function planFromStage(
  stage: StageKind,
  matches: readonly Match[],
  links: readonly StageLink[],
  entryOf: ReadonlyMap<string, string>,
): StagePlan {
  const rows = stageMatches(stage, matches, links);
  const keyOf = new Map(rows.map(({ match }) => [match.id, match.bracketKey ?? match.id]));
  const planned: PlannedMatch[] = rows.map(({ match: m, link: l }) => {
    const key = keyOf.get(m.id)!;
    const side = (n: Side): { slot: SlotSource; label: string } => {
      const s = m.sides[n - 1];
      const entryId = s.teamId ? entryOf.get(s.teamId) : undefined;
      if (entryId) return { slot: { kind: 'entry', entryId }, label: '' };
      if (l.part === 'GF2') return { slot: { kind: 'reset', side: n }, label: s.label };
      const fromWin = rows.find((r) => r.link.winnerTo === m.id && r.link.winnerSide === n);
      if (fromWin) return { slot: { kind: 'winner', key: keyOf.get(fromWin.match.id)! }, label: s.label };
      const fromLose = rows.find((r) => r.link.loserTo === m.id && r.link.loserSide === n);
      if (fromLose) return { slot: { kind: 'loser', key: keyOf.get(fromLose.match.id)! }, label: s.label };
      return { slot: { kind: 'group', group: l.groupNo ?? 0, place: 0 }, label: s.label };
    };
    const a = side(1);
    const b = side(2);
    return {
      key,
      part: l.part,
      round: m.round ?? 1,
      index: keyIndex(key),
      group: l.groupNo,
      stage: m.stage,
      bestOf: l.bestOf,
      sides: [a.slot, b.slot],
      labels: [a.label, b.label],
      winnerTo: l.winnerTo && keyOf.has(l.winnerTo) && l.winnerSide ? { key: keyOf.get(l.winnerTo)!, side: l.winnerSide } : null,
      loserTo: l.loserTo && keyOf.has(l.loserTo) && l.loserSide ? { key: keyOf.get(l.loserTo)!, side: l.loserSide } : null,
    };
  });
  return { kind: stage, matches: planned };
}

/** Las fases que ya existen (por sus enlaces). */
export function stagesCreated(links: readonly StageLink[]): Set<StageKind> {
  return new Set(links.map((l) => l.stage));
}

// ---------- De partidos a resultados ----------

/** Mi lado en el partido por mis equipos de temporada (null si no juego o salgo en los dos). */
export function sideOfTeams(m: Pick<Match, 'sides'>, teamIds: ReadonlySet<string>): Side | null {
  const hits = m.sides.filter((s) => s.teamId && teamIds.has(s.teamId)).map((s) => s.side);
  return hits.length === 1 ? hits[0] : null;
}

/** El ganador y el perdedor de una serie final, como inscritos: el de la capa de datos (una sola regla). */
export { keyResultOf };

/** Resultados por llave de los partidos finales (confirmados, W.O. o propuestos hace 48 h): para resolvePlan/champion. */
export function resultsByKey(matches: readonly Match[], entryOf: ReadonlyMap<string, string>, now: number): Record<string, KeyResult> {
  return keyResults(matches, [], entryOf, now);
}

/** Una serie final para las tablas (lados como inscritos). null si no es final o le falta un lado. */
export function seriesInputOf(m: Match, entryOf: ReadonlyMap<string, string>, now: number): SeriesResultInput | null {
  return isFinal(m, now) ? seriesInput(m, entryOf) : null;
}

/** Todas las series de la fase terminadas (finales o anuladas). Sin partidos, no. */
export function stageDone(rows: readonly { match: Match }[], now: number): boolean {
  return rows.length > 0 && rows.every(({ match }) => match.status === 'void' || isFinal(match, now));
}

/** La tabla de unos inscritos con las series finales entre ellos (grupo o liga). */
export function tableOf(game: GameId, ids: readonly string[], matches: readonly Match[], entryOf: ReadonlyMap<string, string>, now: number, lotSeed?: string): StandingRow[] {
  const results = matches.flatMap((m) => {
    const s = seriesInputOf(m, entryOf, now);
    return s ? [seriesMatchResult(s)] : [];
  });
  return esportsStandings(game, ids, results, lotSeed);
}

/** Las tablas de cada grupo (en el orden de los grupos del plan) y quiénes están en cada uno. */
export function groupTablesOf(
  game: GameId,
  plan: StagePlan,
  matches: readonly Match[],
  entryOf: ReadonlyMap<string, string>,
  now: number,
  lotSeed?: string,
): { ids: string[]; rows: StandingRow[] }[] {
  return groupOf(plan).map((ids) => ({ ids, rows: tableOf(game, ids, matches, entryOf, now, lotSeed) }));
}

// ---------- Mis partidos y la acción principal ----------

/** Los partidos que me tocan (como capitán): el que tengo que confirmar y el siguiente por anotar (los dos lados sabidos). */
export function myActionMatches(matches: readonly Match[], myTeams: ReadonlySet<string>, now: number): { toConfirm: Match | null; toScore: Match | null } {
  const mine = matches.filter((m) => sideOfTeams(m, myTeams) !== null);
  const toConfirm = mine.find((m) => awaitingConfirmation(m, now) && m.proposedSide !== sideOfTeams(m, myTeams)) ?? null;
  const toScore =
    mine
      .filter((m) => isOpen(m) && m.sides.every((s) => !!s.teamId))
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))[0] ?? null;
  return { toConfirm, toScore };
}

export type PrimaryKind = 'confirm' | 'score' | 'checkin' | 'register' | 'signin' | 'review' | 'stage' | 'start' | 'playoffs' | 'brGame';

export interface Primary {
  kind: PrimaryKind;
  label: string;
  matchId?: string;
}

export interface PrimaryInput {
  format: Format;
  entryType: EntryType;
  mode: Mode;
  status: EsportsTournament['status'];
  signedIn: boolean;
  registrationOpen: boolean;
  checkinOpen: boolean;
  myEntry: Pick<EsportsEntry, 'status' | 'checkedInAt' | 'captainId' | 'kind'> | null;
  uid: string | null;
  toConfirm: Pick<Match, 'id'> | null;
  toScore: Pick<Match, 'id'> | null;
  /** Pro y admin de la liga (lo del organizador). */
  organizer: boolean;
  pending: number;
  approved: number;
  /** Ya hay alguna fase (cuadro, grupos o liga). */
  hasStage: boolean;
  groupsDone: boolean;
  hasPlayoffs: boolean;
}

/** «Inscribirme» o «Inscribir mi equipo». */
export const registerLabel = (entryType: EntryType, mode: Mode) => (entryType === 'teams' && !isIndividualMode(mode) ? 'Inscribir mi equipo' : 'Inscribirme');

/** Lo del organizador que espera (sin lo propio de jugar). null si no hay nada. */
export function organizerAction(i: PrimaryInput): Primary | null {
  if (!i.organizer) return null;
  if (i.status === 'registration' && i.pending > 0) return { kind: 'review', label: `Revisar inscripciones (${i.pending})` };
  if (i.format === 'br') {
    if (i.status === 'registration' && enoughToStart('br', i.approved)) return { kind: 'start', label: 'Empezar' };
    if (i.status === 'live') return { kind: 'brGame', label: 'Anotar partida' };
    return null;
  }
  if (i.status === 'registration' && !i.hasStage && enoughToStart(i.format, i.approved)) return { kind: 'stage', label: 'Armar el cuadro' };
  if (i.format === 'groups_playoffs' && i.status === 'live' && i.groupsDone && !i.hasPlayoffs) return { kind: 'playoffs', label: 'Pasar a playoffs' };
  return null;
}

/**
 * La única acción principal del torneo, la primera que aplique (§12.8): 1) confirmar o anotar mi partido, 2) hacer
 * check-in, 3) inscribirme, 4) en Pro, lo del organizador (revisar, armar el cuadro o empezar, pasar a playoffs, anotar
 * una partida de BR). null si no hay ninguna.
 */
export function primaryAction(i: PrimaryInput): Primary | null {
  if (i.toConfirm) return { kind: 'confirm', label: 'Confirmar resultado', matchId: i.toConfirm.id };
  if (i.toScore) return { kind: 'score', label: 'Anotar resultado', matchId: i.toScore.id };
  const e = i.myEntry;
  if (i.checkinOpen && e && e.status === 'approved' && !e.checkedInAt && speaksFor(e, i.uid)) return { kind: 'checkin', label: 'Hacer check-in' };
  if (i.registrationOpen && !e) return i.signedIn ? { kind: 'register', label: registerLabel(i.entryType, i.mode) } : { kind: 'signin', label: 'Entra para inscribirte' };
  return organizerAction(i);
}

// ---------- Battle royale ----------

/** Las partidas para la tabla del motor. */
export const brInputs = (games: readonly BrGame[]): BrGameInput[] =>
  games.map((g) => ({ id: g.id, round: g.round, gameNo: g.gameNo, status: g.status, results: g.results }));

/** La tabla acumulada de los aprobados con los puntos del torneo. */
export function brTable(entryIds: readonly string[], games: readonly BrGame[], settings: TournamentSettings, game: GameId, lotSeed?: string): BrRow[] {
  const br = settings.br ?? { placementPoints: [...(GAMES[game].br?.placementPoints ?? [])], killPoints: GAMES[game].br?.killPoints ?? 1, rounds: 1, gamesPerRound: 4 };
  return brStandings(entryIds, brInputs(games), { placementPoints: br.placementPoints, killPoints: br.killPoints }, lotSeed);
}

/** La partida que sigue: después de la última (jornada y partida), sin pasar de lo que dice el torneo. */
export function nextBrSlot(games: readonly Pick<BrGame, 'round' | 'gameNo'>[], settings: Pick<TournamentSettings, 'br'>): { round: number; gameNo: number } {
  const per = settings.br?.gamesPerRound ?? 4;
  const rounds = settings.br?.rounds ?? 1;
  if (!games.length) return { round: 1, gameNo: 1 };
  const last = [...games].sort((a, b) => b.round - a.round || b.gameNo - a.gameNo)[0];
  if (last.gameNo < per) return { round: last.round, gameNo: last.gameNo + 1 };
  return last.round < rounds ? { round: last.round + 1, gameNo: 1 } : { round: last.round, gameNo: Math.min(12, last.gameNo + 1) };
}

/** Las partidas por jornada, en orden. */
export function brByRound<G extends Pick<BrGame, 'round' | 'gameNo'>>(games: readonly G[]): { round: number; games: G[] }[] {
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
  return rounds.map((round) => ({ round, games: games.filter((g) => g.round === round).sort((a, b) => a.gameNo - b.gameNo) }));
}

/** Los puestos de una partida: cada inscrito con el suyo, sin repetir (los tomados por otro no se pueden elegir). */
export function placementError(results: readonly { entryId: string; placement: number | null }[], total: number): string | null {
  const seen = new Set<number>();
  for (const r of results) {
    if (r.placement == null) continue;
    if (!Number.isInteger(r.placement) || r.placement < 1 || r.placement > total) return `Los puestos van del 1 al ${total}.`;
    if (seen.has(r.placement)) return `El puesto ${r.placement} está repetido.`;
    seen.add(r.placement);
  }
  return seen.size ? null : 'Pon el puesto de al menos uno.';
}

// ---------- Inscribirse ----------

/** Lo que el teléfono sabe de un ID de juego (lo público de esports_game_ids). */
export interface IdInfo {
  /** 'confirmado' = comprobado (con la cuenta conectada o con la búsqueda de Riot). */
  status: 'pendiente' | 'confirmado';
  ranks: Partial<Record<string, RankValue>>;
  rankSource: RankSource;
}

/** Lo que le puede faltar a alguien para inscribirse (así sale en su fila de la plantilla). */
export const MEMBER_PROBLEM = { noId: 'Sin ID', unchecked: 'ID sin comprobar', noRank: 'Sin rango verificado' } as const;
export type MemberProblem = (typeof MEMBER_PROBLEM)[keyof typeof MEMBER_PROBLEM];

/**
 * Lo que le falta a una persona según el torneo, o null si cumple: sin ID; «ID sin comprobar» si el torneo pide ID
 * confirmado y el juego lo puede comprobar (`canVerifyId`); sin rango verificado solo en LoL (`canVerifyRank`). En los
 * juegos sin verificación, tener el ID puesto basta.
 */
export function memberProblem(
  id: IdInfo | null | undefined,
  settings: Pick<TournamentSettings, 'requireConfirmedId' | 'requireVerifiedRank'>,
  rankKey: string,
  game: GameId,
): MemberProblem | null {
  if (!id) return MEMBER_PROBLEM.noId;
  if (settings.requireConfirmedId && canVerifyId(game) && id.status !== 'confirmado') return MEMBER_PROBLEM.unchecked;
  if (settings.requireVerifiedRank && canVerifyRank(game) && (id.rankSource !== 'verificado' || !id.ranks[rankKey])) return MEMBER_PROBLEM.noRank;
  return null;
}

/** La frase de lo que te falta a ti para inscribirte (las mismas de la base: `sin_id`, `id_sin_comprobar`, `sin_rango`). */
export function myProblemText(problem: MemberProblem, game: GameId): string {
  const name = GAMES[game]?.name ?? 'ese juego';
  if (problem === MEMBER_PROBLEM.noId) return `Primero pon tu ID de ${name}.`;
  if (problem === MEMBER_PROBLEM.unchecked) return `Este torneo pide tu ID de ${name} comprobado.`;
  return `Este torneo pide tu rango verificado de ${name}.`;
}

export interface RosterPick {
  userId: string;
  role: 'captain' | 'member' | 'sub';
}

/**
 * La plantilla que arma el capitán (§5.2 paso 5): entre `modeSize` y `modeSize + subs` personas, el capitán adentro, al
 * menos `modeSize` titulares y como mucho `subs` suplentes; y cada uno con lo que pide el torneo.
 */
export function rosterCheck(
  picks: readonly RosterPick[],
  o: { mode: Mode; subs: number; captainId: string; problems: ReadonlyMap<string, string | null> },
): { starters: number; subs: number; ok: boolean; error: string | null } {
  const size = modeSize(o.mode);
  const subs = picks.filter((p) => p.role === 'sub').length;
  const starters = picks.length - subs;
  let error: string | null = null;
  if (!picks.some((p) => p.userId === o.captainId && p.role !== 'sub')) error = 'El capitán va de titular.';
  else if (starters < size) error = `Faltan titulares: son ${size}.`;
  else if (subs > o.subs) error = o.subs ? `Como mucho ${o.subs} ${o.subs === 1 ? 'suplente' : 'suplentes'}.` : 'Este torneo no lleva suplentes.';
  else if (picks.length > size + o.subs) error = `Como mucho ${size + o.subs} en la plantilla.`;
  else if (picks.some((p) => o.problems.get(p.userId))) error = 'Alguien no cumple lo que pide el torneo.';
  return { starters, subs, ok: error === null, error };
}

// ---------- Textos ----------

/** El link del torneo: el inicio de un torneo suelto (`kind 'torneo'`) o su página dentro de la liga. */
export const tournamentPathFor = (lid: string, eventId: string, kind: string | null | undefined) => (kind === 'torneo' ? `/l/${lid}` : `/l/${lid}/e/${eventId}`);

/** «8/16» (aprobados y cupo). */
export const countLine = (approved: number, max: number) => `${approved}/${max}`;

/** La fase del torneo ahora. */
export function phaseOf(t: Pick<EsportsTournament, 'status' | 'startsAt' | 'registrationOpensAt' | 'registrationClosesAt' | 'checkinMinutes'>, now: number): Phase {
  return tournamentPhase(
    { status: t.status, startsAt: t.startsAt, registrationOpensAt: t.registrationOpensAt, registrationClosesAt: t.registrationClosesAt, checkinMinutes: t.checkinMinutes },
    now,
  );
}

/** El mejor de por fase, en una línea: «Al mejor de 1 en grupos, 3 en playoffs y 5 en la final». */
export function bestOfLine(format: Format, bo: { groups: BestOf; playoffs: BestOf; final: BestOf }): string | null {
  switch (format) {
    case 'br':
      return null;
    case 'round_robin':
      return `Al mejor de ${bo.groups}`;
    case 'groups_playoffs':
      return `Al mejor de ${bo.groups} en grupos, ${bo.playoffs} en playoffs y ${bo.final} en la final`;
    default:
      return bo.playoffs === bo.final ? `Al mejor de ${bo.final}` : `Al mejor de ${bo.playoffs} y ${bo.final} en la final`;
  }
}

/** Las reglas de la fase en líneas cortas para «Info». */
export function formatDetails(t: Pick<EsportsTournament, 'game' | 'format' | 'settings' | 'mode' | 'checkinMinutes'>): string[] {
  const s = t.settings;
  const out: string[] = [];
  const bo = bestOfLine(t.format, s.bestOf);
  if (bo) out.push(bo);
  if (t.format === 'single_elim' && s.thirdPlace) out.push('Con partido por el 3.er lugar');
  if (t.format === 'double_elim') out.push(s.bracketReset ? 'Gran final con reinicio si gana el que viene de perdedores' : 'Gran final a una serie');
  if (t.format === 'groups_playoffs') {
    out.push(`${s.groups} ${s.groups === 1 ? 'grupo' : 'grupos'}; pasan ${s.perGroup} de cada uno`);
    out.push(s.playoffs === 'double' ? 'Playoffs a doble eliminación' : 'Playoffs a eliminación simple');
  }
  if ((t.format === 'round_robin' || t.format === 'groups_playoffs') && s.doubleRoundRobin) out.push('Ida y vuelta');
  if (t.format === 'br' && s.br) {
    out.push(`${s.br.rounds} ${s.br.rounds === 1 ? 'jornada' : 'jornadas'} de ${s.br.gamesPerRound} ${s.br.gamesPerRound === 1 ? 'partida' : 'partidas'}`);
    out.push(`Puntos por puesto: ${s.br.placementPoints.join(', ')} · ${s.br.killPoints} por kill`);
  }
  if (s.subs > 0 && !isIndividualMode(t.mode)) out.push(`Hasta ${s.subs} ${s.subs === 1 ? 'suplente' : 'suplentes'}`);
  if (t.checkinMinutes) out.push(`Check-in desde ${t.checkinMinutes} min antes`);
  if (s.requireConfirmedId && canVerifyId(t.game)) out.push('Piden ID de juego confirmado');
  if (s.requireVerifiedRank && canVerifyRank(t.game)) out.push('Piden rango verificado');
  return out;
}

/**
 * El marcador de la tarjeta de un partido (MatchCard lee los pares del texto): al mejor de 1 con números, el del juego
 * («13-9»); si no, los mapas o juegos ganados («2-1»). El texto completo sigue en el detalle.
 */
export function cardScoreText(score: unknown): string | null {
  const s = parseSeriesScore(score);
  if (!s) return null;
  if (s.wo) return 'W.O.';
  const g = s.games[0];
  if (s.bestOf === 1 && s.games.length === 1 && typeof g.a === 'number' && typeof g.b === 'number') return `${g.a}-${g.b}`;
  return `${s.sides[0]}-${s.sides[1]}`;
}

/** Los números de cada lado en el cuadro: al mejor de 1, los del juego (13 y 9); si no, mapas o juegos ganados. W.O.: nada. */
export function cellScores(score: unknown): [number, number] | null {
  const s = parseSeriesScore(score);
  if (!s || s.wo) return null;
  const g = s.games[0];
  if (s.bestOf === 1 && s.games.length === 1 && typeof g.a === 'number' && typeof g.b === 'number') return [g.a, g.b];
  return s.sides;
}

/** El partido como lo dibuja MatchCard (con el marcador corto). */
export function cardMatch<M extends Pick<Match, 'score'>>(m: M): M {
  const text = cardScoreText(m.score);
  if (!text || !m.score) return m;
  return { ...m, score: { ...m.score, text } };
}

// ---------- La hoja del partido ----------

const BEST_OF: readonly BestOf[] = [1, 3, 5, 7];

/**
 * Las reglas de la serie como las guardó la base en `matches.rules` (`{game, bestOf, draws, roundsToWin?, stocks?}`);
 * el juego también puede venir de `format`. null si no es una serie de esports.
 */
export function rulesFromMatch(rules: Record<string, unknown> | null | undefined, format: string, fallbackBestOf: BestOf = 1): SeriesRules | null {
  const r = rules ?? {};
  const game = isGameId(r.game) ? r.game : isGameId(format) ? format : null;
  if (!game) return null;
  const bestOf = BEST_OF.includes(r.bestOf as BestOf) ? (r.bestOf as BestOf) : fallbackBestOf;
  const out: SeriesRules = { game, bestOf, draws: r.draws === true };
  if (r.roundsToWin === 2 || r.roundsToWin === 3) out.roundsToWin = r.roundsToWin;
  if (typeof r.stocks === 'number' && Number.isInteger(r.stocks)) out.stocks = r.stocks;
  return out;
}

/** «Gana Tigres 2-1», «Empate 2-2» o «Falta: nadie llegó a 2» (lo que dice el botón de enviar). */
export function resultSummary(rules: SeriesRules, games: readonly GameRecord[], names: readonly [string, string]): { text: string; done: boolean } {
  const winner = seriesWinner(rules, games);
  const wins: [number, number] = [0, 0];
  for (const g of games) {
    const w = gameWinner(rules, g);
    if (w) wins[w - 1]++;
  }
  if (winner === undefined) return { text: `Falta: nadie llegó a ${needed(rules.bestOf)}`, done: false };
  if (winner === null) {
    const g = games[0];
    return { text: `Empate${typeof g?.a === 'number' && typeof g?.b === 'number' ? ` ${g.a}-${g.b}` : ''}`, done: true };
  }
  const bo1 = rules.bestOf === 1 && games.length === 1 && typeof games[0].a === 'number' && typeof games[0].b === 'number' && GAMES[rules.game].scoring !== 'win';
  const [x, y] = bo1 ? [games[0].a!, games[0].b!] : wins;
  const mine = winner === 1 ? `${x}-${y}` : `${y}-${x}`;
  return { text: `Gana ${names[winner - 1]} ${mine}`, done: true };
}

/** Se puede agregar otro mapa o juego: nadie ganó la serie todavía y quedan por jugar. */
export const canAddGame = (rules: SeriesRules, games: readonly GameRecord[]) => games.length < rules.bestOf && seriesWinner(rules, games) === undefined;

// ---------- Columnas de las tablas ----------

/** Lo que necesita StandingsTable de cada columna (sin importar React aquí). */
export interface TableColumn {
  key: string;
  label: string;
  title?: string;
  value: (row: StandingRow) => string | number;
  wide?: boolean;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n);

/**
 * Las columnas de la tabla (§12.8): series «PJ G P {mapas} Dif.» (los mapas o juegos a favor y en contra: «5-2»); EA
 * SPORTS FC «PJ G E P GF GC Dif.» (como el fútbol). «Pts» la pone la tabla al final.
 */
export function standingsColumns(game: GameId): TableColumn[] {
  const played = { key: 'played', label: 'PJ', title: 'Series jugadas', value: (r: StandingRow) => r.played };
  const won = { key: 'won', label: 'G', title: 'Ganadas', value: (r: StandingRow) => r.won };
  const lost = { key: 'lost', label: 'P', title: 'Perdidas', value: (r: StandingRow) => r.lost };
  if (game === 'ea_fc') {
    return [
      played,
      won,
      { key: 'drawn', label: 'E', title: 'Empatadas', value: (r) => r.drawn },
      lost,
      { key: 'for', label: 'GF', title: 'Goles a favor', value: (r) => r.for, wide: true },
      { key: 'against', label: 'GC', title: 'Goles en contra', value: (r) => r.against, wide: true },
      { key: 'diff', label: 'Dif.', title: 'Diferencia de goles', value: (r) => signed(r.diff) },
    ];
  }
  const word = GAMES[game].mapsWord;
  const short = word === 'mapas' ? 'Mapas' : 'Juegos';
  return [
    played,
    won,
    lost,
    { key: 'maps', label: short, title: `${short} a favor y en contra`, value: (r) => `${r.for}-${r.against}`, wide: true },
    { key: 'diff', label: 'Dif.', title: `Diferencia de ${word}`, value: (r) => signed(r.diff) },
  ];
}

// ---------- El cuadro al abrir y al rehacer ----------

/**
 * Hay una serie final cuyo ganador (o perdedor) todavía no está en el partido siguiente: pasó a final por las 48 h sin
 * que nadie escribiera. La pantalla llama `syncBracket` una vez por visita.
 */
export function needsSync(matches: readonly Match[], links: readonly StageLink[], now: number): boolean {
  const byId = new Map(matches.map((m) => [m.id, m]));
  return links.some((l) => {
    const m = byId.get(l.matchId);
    if (!m || !isFinal(m, now) || m.status === 'confirmed' || m.status === 'walkover') return false;
    const empty = (to: string | null, side: Side | null) => {
      const target = to ? byId.get(to) : undefined;
      return !!target && !!side && !target.sides[side - 1].teamId && (target.status === 'scheduled' || target.status === 'postponed');
    };
    return empty(l.winnerTo, l.winnerSide) || empty(l.loserTo, l.loserSide);
  });
}

/** La fase se puede rehacer: ninguna serie tiene resultado ni empezó (§9.7 esports_delete_stage). */
export function stageUntouched(rows: readonly { match: Pick<Match, 'status' | 'seq'> }[]): boolean {
  return rows.every(({ match }) => (match.status === 'scheduled' || match.status === 'postponed' || match.status === 'void') && match.seq === 0);
}

/** La última fase creada (la que se rehace): playoffs antes que grupos. */
export function lastStage(created: ReadonlySet<StageKind>): StageKind | null {
  for (const k of ['playoffs', 'bracket', 'league', 'groups'] as const) if (created.has(k)) return k;
  return null;
}
