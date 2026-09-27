import { DEFAULT_ALLOWANCE, type GolfCourse, type GolfHole, type GolfTee, type Nine } from '../../sports/golf/course';
import { DEFAULT_MERIT_POINTS } from '../../sports/golf/leaderboard';
import type { GolfBasis, GolfCompetition, GolfFormat, MaxScoreRule } from '../../sports/golf/scoring';
import { uuidv7 } from '../db/ids';
import { enqueue, invalidate, rpc, select, sentOrQueued, useLive, type Live } from './client';
import { tags } from './keys';
import { chunks } from './rows';
import { useTopic } from './topics';

/**
 * Golf (fase 6): campos, rondas, torneos de varias rondas y tarjetas por grupo (supabase/migrations/…_golf.sql).
 *
 * - Lecturas con la caché de consultas (se ven sin señal con lo último que llegó). Las tarjetas del evento se
 *   ponen al día por el tiempo real del evento (`event:<id>`, aviso 'entries') o consultando cada 15–20 s.
 * - La tarjeta en el campo se anota en el teléfono (src/pages/sports/golf/courtLog.ts) y se publica por la cola
 *   sin conexión cada 3 hoyos (`queueGolfScores`): nunca golpe por golpe. Firmar también va por la cola.
 * - El resto (campos, rondas, inscripciones, grupos, cerrar) necesita señal: RPC directa.
 */

// ---------- Tipos de la app ----------

export type GolfCourseDoc = GolfCourse;

/** Lo del golf de una ronda (sin la copia del campo: para listas). */
export interface GolfRoundDoc {
  eventId: string;
  /** Campo del que salió la copia (null si se borró). */
  courseId: string | null;
  courseName: string;
  /** Hoyos que se juegan (9 o 18). */
  holes: 9 | 18;
  nine: Nine;
  competition: GolfCompetition;
  /** Salida simultánea (cada grupo por su hoyo). */
  shotgun: boolean;
  tournamentId: string | null;
  roundNo: number | null;
  /** Ronda cerrada por el admin: resultados finales. */
  closed: boolean;
  closedAt: string | null;
}

/** La ronda con la copia del campo que se juega (no cambia aunque editen el campo). */
export interface GolfRoundFull extends GolfRoundDoc {
  course: GolfCourse;
}

export interface GolfCardDoc {
  id: string;
  eventId: string;
  playerId: string;
  teeId: string;
  /** Index congelado al inscribirse (null = sin Index). */
  hcpIndex: number | null;
  /** Handicap de campo sin redondear y de juego (los calcula la base con el WHS). */
  courseHcp: number;
  playingHcp: number;
  groupNo: number | null;
  /** Hoyo real por el que sale (1–18). */
  startHole: number;
  /** Por hoyo de la ronda: golpes (null = sin jugar o recogió), putts y si recogió. */
  strokes: (number | null)[];
  putts: (number | null)[];
  pickedUp: boolean[];
  signed: boolean;
  signedAt: string | null;
  dq: boolean;
}

export interface GolfTournamentDoc {
  id: string;
  name: string;
}

/** Reglas de la liga de golf (leagues.rules): competencia por defecto y puntos del orden de mérito. */
export interface GolfRules {
  competition: GolfCompetition;
  meritPoints: number[];
}

/** Index del perfil de cada jugador en la liga (players.attrs.golf). */
export interface GolfIndex {
  index: number;
  /** Cuándo lo escribió (YYYY-MM-DD). */
  at: string | null;
}

export interface GolfEventData {
  /** null = evento de golf sin campo todavía (creado con el botón general o como torneo sin liga). */
  round: GolfRoundFull | null;
  cards: GolfCardDoc[];
}

export interface GolfSeasonData {
  /** Rondas cerradas (con su campo) de la liga. */
  rounds: GolfRoundFull[];
  /** Tarjetas de esas rondas. */
  cards: GolfCardDoc[];
}

export interface GolfPlayerData {
  cards: GolfCardDoc[];
  /** Las rondas de esas tarjetas (con su campo). */
  rounds: GolfRoundFull[];
}

// ---------- Filas de la base ----------

interface CourseRow {
  id: string;
  name: string;
  holes: GolfHole[];
  tees: GolfTee[];
}

interface RoundRow {
  event_id: string;
  course_id: string | null;
  course?: GolfCourse;
  course_name: string;
  holes: number;
  nine: Nine;
  competition: GolfCompetition;
  shotgun: boolean;
  tournament_id: string | null;
  round_no: number | null;
  status: string;
  closed_at: string | null;
}

interface CardRow {
  id: string;
  event_id: string;
  player_id: string;
  tee_id: string;
  hcp_index: number | null;
  course_hcp: number;
  playing_hcp: number;
  group_no: number | null;
  start_hole: number;
  strokes: (number | null)[] | null;
  putts: (number | null)[] | null;
  picked_up: boolean[] | null;
  status: string;
  signed_at: string | null;
  dq: boolean;
}

const ROUND_COLUMNS = 'event_id,course_id,course_name,holes,nine,competition,shotgun,tournament_id,round_no,status,closed_at';

const toCourse = (r: CourseRow): GolfCourseDoc => ({ id: r.id, name: r.name, holes: r.holes ?? [], tees: r.tees ?? [] });

export function toRound(r: RoundRow): GolfRoundDoc {
  return {
    eventId: r.event_id,
    courseId: r.course_id,
    courseName: r.course_name,
    holes: r.holes === 9 ? 9 : 18,
    nine: r.nine ?? 'all',
    competition: r.competition ?? { format: 'stroke', basis: 'net', allowance: DEFAULT_ALLOWANCE },
    shotgun: !!r.shotgun,
    tournamentId: r.tournament_id,
    roundNo: r.round_no,
    closed: r.status === 'cerrada',
    closedAt: r.closed_at,
  };
}

const toRoundFull = (r: RoundRow): GolfRoundFull => ({ ...toRound(r), course: r.course as GolfCourse });

export function toCard(r: CardRow): GolfCardDoc {
  const n = r.strokes?.length ?? 0;
  return {
    id: r.id,
    eventId: r.event_id,
    playerId: r.player_id,
    teeId: r.tee_id,
    hcpIndex: r.hcp_index,
    courseHcp: r.course_hcp ?? 0,
    playingHcp: r.playing_hcp ?? 0,
    groupNo: r.group_no,
    startHole: r.start_hole ?? 1,
    strokes: r.strokes ?? [],
    putts: r.putts ?? Array(n).fill(null),
    pickedUp: r.picked_up ?? Array(n).fill(false),
    signed: r.status === 'firmada',
    signedAt: r.signed_at,
    dq: !!r.dq,
  };
}

// ---------- Reglas ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const FORMATS: readonly GolfFormat[] = ['stroke', 'stableford', 'maxScore'];

export const DEFAULT_COMPETITION: GolfCompetition = { format: 'stroke', basis: 'net', allowance: DEFAULT_ALLOWANCE };

/** Competencia tal como la guarda la base, con valores por defecto si falta algo. */
export function golfCompetition(raw: unknown): GolfCompetition {
  if (!isObj(raw) || !FORMATS.includes(raw.format as GolfFormat)) return { ...DEFAULT_COMPETITION };
  const basis: GolfBasis = raw.basis === 'gross' ? 'gross' : 'net';
  const allowance = typeof raw.allowance === 'number' && raw.allowance >= 0 && raw.allowance <= 100 ? raw.allowance : DEFAULT_ALLOWANCE;
  const out: GolfCompetition = { format: raw.format as GolfFormat, basis, allowance };
  if (out.format === 'maxScore' && isObj(raw.maxScore)) out.maxScore = raw.maxScore as unknown as MaxScoreRule;
  return out;
}

/** Reglas de la liga (leagues.rules) normalizadas: la competencia por defecto y los puntos del orden de mérito. */
export function golfRules(raw: unknown): GolfRules {
  const r = isObj(raw) ? raw : {};
  const points = Array.isArray(r.meritPoints) && r.meritPoints.length && r.meritPoints.every((x) => typeof x === 'number' && x >= 0) ? (r.meritPoints as number[]) : [...DEFAULT_MERIT_POINTS];
  return { competition: golfCompetition(r.competition), meritPoints: points };
}

// ---------- Claves de la caché ----------

export const golfKeys = {
  courses: (lid: string) => `golf:courses:${lid}`,
  rounds: (lid: string) => `golf:rounds:${lid}`,
  tournaments: (lid: string) => `golf:tournaments:${lid}`,
  tournament: (tournamentId: string) => `golf:tournament:${tournamentId}`,
  event: (eventId: string) => `golf:event:${eventId}`,
  season: (lid: string) => `golf:season:${lid}`,
  player: (lid: string, playerId: string) => `golf:player:${lid}:${playerId}`,
  rules: (lid: string) => `golf:rules:${lid}`,
  indexes: (lid: string) => `golf:indexes:${lid}`,
};

const coursesTag = (lid: string) => `golf:courses:${lid}`;
const byLeague = (lid: string) => ({ col: 'league_id', op: 'eq' as const, value: lid });

// ---------- Lecturas ----------

export async function fetchGolfCourses(lid: string): Promise<GolfCourseDoc[]> {
  const rows = await select<CourseRow>({ table: 'golf_courses', columns: 'id,name,holes,tees', filters: [byLeague(lid)], order: [{ col: 'name' }] });
  return rows.map(toCourse);
}

/** Campos del club. */
export const useGolfCourses = (lid: string | undefined): Live<GolfCourseDoc[]> =>
  useLive<GolfCourseDoc[]>(lid ? golfKeys.courses(lid) : null, lid ? { kind: 'golf-courses', lid } : null, () => fetchGolfCourses(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), coursesTag(lid)] : [],
  });

export async function fetchGolfRounds(lid: string): Promise<GolfRoundDoc[]> {
  const rows = await select<RoundRow>({ table: 'golf_rounds', columns: ROUND_COLUMNS, filters: [byLeague(lid)] });
  return rows.map(toRound);
}

/** Lo del golf de todas las rondas de la liga (sin la copia del campo). */
export const useGolfRounds = (lid: string | undefined): Live<GolfRoundDoc[]> =>
  useLive<GolfRoundDoc[]>(lid ? golfKeys.rounds(lid) : null, lid ? { kind: 'golf-rounds', lid } : null, () => fetchGolfRounds(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.events(lid)] : [],
  });

export async function fetchGolfTournaments(lid: string): Promise<GolfTournamentDoc[]> {
  return select<GolfTournamentDoc>({ table: 'golf_tournaments', columns: 'id,name', filters: [byLeague(lid)], order: [{ col: 'name' }] });
}

export const useGolfTournaments = (lid: string | undefined): Live<GolfTournamentDoc[]> =>
  useLive<GolfTournamentDoc[]>(lid ? golfKeys.tournaments(lid) : null, lid ? { kind: 'golf-tournaments', lid } : null, () => fetchGolfTournaments(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.events(lid)] : [],
  });

/** La ronda (con su campo) y sus tarjetas. */
export async function fetchGolfEvent(lid: string, eventId: string): Promise<GolfEventData> {
  const byEvent = { col: 'event_id', op: 'eq' as const, value: eventId };
  const [rounds, cards] = await Promise.all([
    select<RoundRow>({ table: 'golf_rounds', columns: `${ROUND_COLUMNS},course`, filters: [byEvent, byLeague(lid)] }),
    select<CardRow>({ table: 'golf_cards', filters: [byEvent, byLeague(lid)] }),
  ]);
  return { round: rounds[0] ? toRoundFull(rounds[0]) : null, cards: cards.map(toCard) };
}

/** La ronda y sus tarjetas, en vivo mientras está en pantalla. */
export function useGolfEvent(lid: string | undefined, eventId: string | undefined): Live<GolfEventData> {
  useTopic(lid && eventId ? `event:${eventId}` : null, lid ?? null);
  return useLive<GolfEventData>(
    lid && eventId ? golfKeys.event(eventId) : null,
    lid ? { kind: 'golf-event', lid, eventId } : null,
    () => fetchGolfEvent(lid!, eventId!),
    {
      initial: { round: null, cards: [] },
      tags: lid && eventId ? [tags.league(lid), tags.events(lid), tags.event(eventId), tags.entries(lid), tags.eventEntries(eventId)] : [],
    },
  );
}

async function cardsOfEvents(lid: string, eventIds: string[]): Promise<GolfCardDoc[]> {
  // Pedazos chicos: el servidor devuelve como mucho 500 filas por consulta.
  const parts = await Promise.all(
    chunks([...new Set(eventIds)], 15).map((ids) => select<CardRow>({ table: 'golf_cards', filters: [byLeague(lid), { col: 'event_id', op: 'in', value: ids }] })),
  );
  return parts.flat().map(toCard);
}

/** Las rondas de un torneo (con su campo) y sus tarjetas: leaderboard del torneo. */
export async function fetchGolfTournament(lid: string, tournamentId: string): Promise<GolfSeasonData> {
  const rows = await select<RoundRow>({
    table: 'golf_rounds',
    columns: `${ROUND_COLUMNS},course`,
    filters: [byLeague(lid), { col: 'tournament_id', op: 'eq', value: tournamentId }],
  });
  const rounds = rows.map(toRoundFull).sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0));
  return { rounds, cards: rounds.length ? await cardsOfEvents(lid, rounds.map((r) => r.eventId)) : [] };
}

export const useGolfTournament = (lid: string | undefined, tournamentId: string | null | undefined): Live<GolfSeasonData> =>
  useLive<GolfSeasonData>(
    lid && tournamentId ? golfKeys.tournament(tournamentId) : null,
    lid ? { kind: 'golf-tournament', lid, id: tournamentId ?? undefined } : null,
    () => fetchGolfTournament(lid!, tournamentId!),
    { initial: { rounds: [], cards: [] }, tags: lid ? [tags.league(lid), tags.events(lid), tags.entries(lid)] : [] },
  );

/** Rondas cerradas de la liga (con su campo) y sus tarjetas: orden de mérito. */
export async function fetchGolfSeason(lid: string): Promise<GolfSeasonData> {
  const rows = await select<RoundRow>({
    table: 'golf_rounds',
    columns: `${ROUND_COLUMNS},course`,
    filters: [byLeague(lid), { col: 'status', op: 'eq', value: 'cerrada' }],
  });
  const rounds = rows.map(toRoundFull);
  return { rounds, cards: rounds.length ? await cardsOfEvents(lid, rounds.map((r) => r.eventId)) : [] };
}

export const useGolfSeason = (lid: string | undefined): Live<GolfSeasonData> =>
  useLive<GolfSeasonData>(lid ? golfKeys.season(lid) : null, lid ? { kind: 'golf-season', lid } : null, () => fetchGolfSeason(lid!), {
    initial: { rounds: [], cards: [] },
    tags: lid ? [tags.league(lid), tags.events(lid), tags.entries(lid)] : [],
  });

/** Las tarjetas de un jugador y sus rondas (perfil y estadísticas). */
export async function fetchGolfPlayer(lid: string, playerId: string): Promise<GolfPlayerData> {
  const cards = (await select<CardRow>({ table: 'golf_cards', filters: [byLeague(lid), { col: 'player_id', op: 'eq', value: playerId }] })).map(toCard);
  const ids = [...new Set(cards.map((c) => c.eventId))];
  const parts = await Promise.all(
    chunks(ids, 60).map((chunk) =>
      select<RoundRow>({ table: 'golf_rounds', columns: `${ROUND_COLUMNS},course`, filters: [byLeague(lid), { col: 'event_id', op: 'in', value: chunk }] }),
    ),
  );
  return { cards, rounds: parts.flat().map(toRoundFull) };
}

export const useGolfPlayer = (lid: string | undefined, playerId: string | null | undefined): Live<GolfPlayerData> =>
  useLive<GolfPlayerData>(
    lid && playerId ? golfKeys.player(lid, playerId) : null,
    lid ? { kind: 'golf-player', lid, playerId: playerId ?? undefined } : null,
    () => fetchGolfPlayer(lid!, playerId!),
    { initial: { cards: [], rounds: [] }, tags: lid ? [tags.league(lid), tags.events(lid), tags.entries(lid)] : [] },
  );

export async function fetchGolfRules(lid: string): Promise<GolfRules> {
  const rows = await select<{ rules: unknown }>({ table: 'leagues', columns: 'id,rules', filters: [{ col: 'id', op: 'eq', value: lid }] });
  return golfRules(rows[0]?.rules);
}

/** Competencia por defecto y puntos del orden de mérito de la liga. */
export const useGolfRules = (lid: string | undefined): Live<GolfRules> =>
  useLive<GolfRules>(lid ? golfKeys.rules(lid) : null, lid ? { kind: 'golf-rules', lid } : null, () => fetchGolfRules(lid!), {
    initial: golfRules(null),
    tags: lid ? [tags.league(lid), tags.leagues] : [],
  });

/** Index que cada jugador guardó en su perfil de la liga (players.attrs.golf). */
export async function fetchGolfIndexes(lid: string): Promise<Record<string, GolfIndex>> {
  const rows = await select<{ id: string; attrs: unknown }>({ table: 'players', columns: 'id,attrs', filters: [byLeague(lid)] });
  const out: Record<string, GolfIndex> = {};
  for (const r of rows) {
    const g = isObj(r.attrs) ? r.attrs.golf : null;
    if (isObj(g) && typeof g.index === 'number') out[r.id] = { index: g.index, at: typeof g.at === 'string' ? g.at : null };
  }
  return out;
}

export const useGolfIndexes = (lid: string | undefined): Live<Record<string, GolfIndex>> =>
  useLive<Record<string, GolfIndex>>(lid ? golfKeys.indexes(lid) : null, lid ? { kind: 'golf-indexes', lid } : null, () => fetchGolfIndexes(lid!), {
    initial: {},
    tags: lid ? [tags.league(lid), tags.players(lid)] : [],
  });

// ---------- Escrituras: campos, rondas y torneos (admin, con señal) ----------

const afterRounds = (lid: string, eventId?: string) =>
  invalidate(tags.events(lid), tags.entries(lid), tags.feeds, ...(eventId ? [tags.event(eventId), tags.eventEntries(eventId)] : []));
const afterCards = (lid: string, eventId: string) => invalidate(tags.entries(lid), tags.eventEntries(eventId), tags.event(eventId), tags.events(lid));

/** Crea o cambia un campo (las rondas ya creadas no cambian: guardan su copia). Devuelve el id. */
export async function saveGolfCourse(lid: string, course: Omit<GolfCourse, 'id'> & { id?: string }): Promise<string> {
  const id = await rpc<string>('golf_save_course', {
    p_league: lid,
    p_id: course.id || uuidv7(),
    p_name: course.name.trim(),
    p_holes: course.holes.map((h) => ({ par: h.par, si: h.si })),
    p_tees: course.tees,
  });
  invalidate(coursesTag(lid));
  return id;
}

export async function deleteGolfCourse(lid: string, id: string) {
  await rpc('golf_delete_course', { p_course: id });
  invalidate(coursesTag(lid), tags.events(lid));
}

export interface GolfRoundInput {
  date: string;
  courseId: string;
  name?: string;
  nine?: Nine;
  /** 'HH:MM' (opcional). */
  startTime?: string | null;
  /** null = la de la liga. */
  competition?: GolfCompetition | null;
  shotgun?: boolean;
}

/** Crea una ronda (evento + copia del campo). Devuelve el id del evento. */
export async function createGolfRound(lid: string, input: GolfRoundInput & { tournamentId?: string | null }): Promise<string> {
  const id = await rpc<string>('golf_create_round', {
    p_id: uuidv7(),
    p_league: lid,
    p_date: input.date,
    p_course: input.courseId,
    p_name: (input.name ?? '').trim(),
    p_nine: input.nine ?? 'all',
    p_start_time: input.startTime || null,
    p_competition: input.competition ?? null,
    p_shotgun: !!input.shotgun,
    p_tournament: input.tournamentId ?? null,
  });
  afterRounds(lid);
  return id;
}

/** Torneo de varias rondas (una por fecha). */
export async function createGolfTournament(
  lid: string,
  input: Omit<GolfRoundInput, 'date' | 'startTime'> & { name: string; dates: string[] },
): Promise<{ tournamentId: string; eventIds: string[] }> {
  const eventIds = input.dates.map(() => uuidv7());
  const r = await rpc<{ tournament_id: string; event_ids: string[] }>('golf_create_tournament', {
    p_id: uuidv7(),
    p_league: lid,
    p_name: input.name.trim(),
    p_dates: input.dates,
    p_course: input.courseId,
    p_nine: input.nine ?? 'all',
    p_competition: input.competition ?? null,
    p_shotgun: !!input.shotgun,
    p_event_ids: eventIds,
  });
  afterRounds(lid);
  return { tournamentId: r.tournament_id, eventIds: r.event_ids };
}

export async function deleteGolfTournament(lid: string, id: string) {
  await rpc('golf_delete_tournament', { p_tournament: id });
  afterRounds(lid);
}

/** Cambia lo del golf de la ronda (o le pone campo a un evento que no tenía). Campo y hoyos, solo sin anotar. */
export async function updateGolfRound(lid: string, eventId: string, patch: { courseId?: string; nine?: Nine; competition?: GolfCompetition; shotgun?: boolean }) {
  const p: Record<string, unknown> = {};
  if (patch.courseId !== undefined) p.course = patch.courseId;
  if (patch.nine !== undefined) p.nine = patch.nine;
  if (patch.competition !== undefined) p.competition = patch.competition;
  if (patch.shotgun !== undefined) p.shotgun = patch.shotgun;
  if (!Object.keys(p).length) return;
  await rpc('golf_update_round', { p_event: eventId, p_patch: p });
  afterRounds(lid, eventId);
}

/** Cierra la ronda (resultados finales) o la vuelve a abrir. */
export async function closeGolfRound(lid: string, eventId: string, closed = true) {
  await rpc('golf_close_round', { p_event: eventId, p_closed: closed });
  afterRounds(lid, eventId);
}

// ---------- Inscripciones y grupos ----------

/**
 * Inscribe (o cambia salida e Index de) un jugador: sin `playerId`, el de la cuenta. El Index queda congelado
 * en la tarjeta; sin `index` se toma el del perfil. Devuelve el id de la tarjeta.
 */
export async function registerGolf(lid: string, eventId: string, opts: { playerId?: string | null; teeId?: string | null; index?: number | null } = {}): Promise<string> {
  const id = await rpc<string>('golf_register', {
    p_event: eventId,
    p_player: opts.playerId ?? null,
    p_tee: opts.teeId ?? null,
    p_index: opts.index ?? null,
  });
  afterCards(lid, eventId);
  return id;
}

/** Admin: inscribe varios (quien ya estaba no se toca). Devuelve cuántos entraron. */
export async function addGolfPlayers(lid: string, eventId: string, players: { playerId: string; teeId?: string | null; index?: number | null }[]): Promise<number> {
  if (!players.length) return 0;
  const n = await rpc<number>('golf_add_players', {
    p_event: eventId,
    p_players: players.map((p) => ({ player_id: p.playerId, ...(p.teeId ? { tee_id: p.teeId } : {}), ...(p.index != null ? { index: p.index } : {}) })),
  });
  afterCards(lid, eventId);
  return n;
}

export async function unregisterGolf(lid: string, eventId: string, cardId: string) {
  await rpc('golf_unregister', { p_card: cardId });
  afterCards(lid, eventId);
}

/** Admin: grupos (1–99, hasta 4 por grupo) y hoyo de salida de cada tarjeta. `groupNo: null` = sin grupo. */
export async function setGolfGroups(lid: string, eventId: string, groups: { cardId: string; groupNo: number | null; startHole?: number | null }[]) {
  await rpc('golf_set_groups', {
    p_event: eventId,
    p_groups: groups.map((g) => ({ card_id: g.cardId, group_no: g.groupNo, ...(g.startHole !== undefined ? { start_hole: g.startHole } : {}) })),
  });
  afterCards(lid, eventId);
}

export async function setGolfDq(lid: string, eventId: string, cardId: string, dq: boolean) {
  await rpc('golf_set_dq', { p_card: cardId, p_dq: dq });
  afterCards(lid, eventId);
}

// ---------- La tarjeta en el campo (por la cola sin conexión) ----------

/** Un hoyo de la tarjeta tal como viaja: i = índice en la tarjeta, s = golpes, p = putts, u = recogió. */
export interface GolfHoleWire {
  i: number;
  s: number | null;
  p: number | null;
  u: boolean;
}

export interface GolfCardPatch {
  cardId: string;
  holes: GolfHoleWire[];
}

/**
 * Encola los hoyos anotados en el teléfono (solo los que cambian). Sin señal se guarda y sale solo; si hay
 * varios envíos pendientes del mismo evento, se manda solo el último (que ya trae todo lo pendiente).
 * `done` se cumple cuando el servidor lo tiene (o falla si lo rechaza).
 */
export function queueGolfScores(lid: string, eventId: string, cards: GolfCardPatch[]): { opId: string; done: Promise<number> } {
  const { opId, done } = enqueue<number>(
    'golf_save_hole_scores',
    { p_event: eventId, p_cards: cards.map((c) => ({ card_id: c.cardId, holes: c.holes })) },
    { group: lid, collapseKey: `golf:${eventId}`, label: 'Tarjeta de golf' },
  );
  return {
    opId,
    done: done.then((n) => {
      afterCards(lid, eventId);
      return n;
    }),
  };
}

/** Firma (o, el admin, vuelve a abrir) la tarjeta. Va por la cola: sirve sin señal, después de los hoyos. */
export async function signGolfCard(lid: string, eventId: string, cardId: string, signed = true): Promise<void> {
  const { done } = enqueue(
    'golf_sign_card',
    { p_card: cardId, p_signed: signed },
    { group: lid, collapseKey: `golf-firma:${cardId}`, label: signed ? 'Firmar tarjeta' : 'Abrir tarjeta' },
  );
  void done.then(() => afterCards(lid, eventId)).catch(() => undefined);
  await sentOrQueued(done);
}

// ---------- Index del perfil y reglas ----------

/** Guarda el Index (no oficial) del jugador en la liga; null lo quita. Las tarjetas ya creadas no cambian. */
export async function setGolfIndex(lid: string, playerId: string, index: number | null) {
  await rpc('golf_set_index', { p_player: playerId, p_index: index });
  invalidate(tags.players(lid));
}

/** Admin: competencia por defecto y puntos del orden de mérito (se guardan en leagues.rules). */
export async function saveGolfRules(lid: string, rules: GolfRules) {
  const rows = await select<{ rules: unknown }>({ table: 'leagues', columns: 'id,rules', filters: [{ col: 'id', op: 'eq', value: lid }] });
  const current = isObj(rows[0]?.rules) ? (rows[0].rules as Record<string, unknown>) : {};
  await rpc('update_league', { p_league: lid, p_patch: { rules: { ...current, competition: rules.competition, meritPoints: rules.meritPoints } } });
  invalidate(tags.league(lid), tags.leagues);
}
