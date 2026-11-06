/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): una liga de esports ficticia para probar el inicio
 * de la liga, la página del torneo (cuadro, tabla, equipos, info), anotar y confirmar una serie, inscribir un equipo,
 * Partidos, Tabla y Lo mío, y lo global de esports (/esports, Mi ID de juego, el equipo, entrar con un código y la
 * página del juego) sin el Supabase real. La cuenta de prueba juega (no organiza) en «Esports de Ejemplo» con su equipo
 * «Equipo de Ejemplo» [EJE] de VALORANT, del que es capitán:
 * - «Torneo de Ejemplo» (eliminación simple, en curso): su semifinal está por anotar y la otra ya se jugó.
 * - «Copa de Ejemplo» (todos contra todos, en curso): el rival anotó una serie que le toca confirmar; hay otra por jugar.
 * - «Abierto de Ejemplo» (inscripción abierta): todavía no está inscrito (para «Inscribir mi equipo»).
 * Su ID es `Ejemplo#1234`. El código `UNIR2345` lleva a otro equipo («Equipo Cinco») para probar «Unirme al equipo».
 * Lo que cambia (resultados, inscripciones, IDs, equipos) se guarda en sessionStorage y se borra al salir de la
 * demostración (forgetDemoEsports). Todos los datos son ficticios.
 *
 * Se junta con las demás tablas de la demostración: `esportsTables(uid)` da las filas por tabla (las de `leagues`,
 * `memberships`, `players`, `events`, `matches`, `match_sides`, `teams` y `team_players` se suman a las que ya hay) y
 * `esportsRpc(uid, fn, args)` contesta las RPC de esports y de las series que usa la app (undefined si no es de esta
 * liga).
 */
import { buildSeriesScore, defaultSettings, roundRobinPlan, singleEliminationPlan, type GameRecord, type StagePlan } from '@mm/sports/esports';
import { uuidv7 } from '@mm/lib/db/ids';
import { photoPath } from '@mm/lib/photos';
import { toIsoDate } from '@mm/lib/format';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-esports';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const GAME = 'valorant';
const MODE = '5v5';
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/** Ids fijos: `00000000-0000-7000-8000-0000e5<tipo><número>`. */
const id = (kind: string, n: number) => `00000000-0000-7000-8000-0000e5${kind}${String(n).padStart(5, '0')}`;

export const DEMO_ESPORTS = id('0', 1);
const OWNER = id('6', 99);
const ME_PLAYER = id('8', 1);
const MY_TEAM = id('7', 1);
const OTHER_TEAM = id('7', 5);
const TEAM_CODE = 'EJEM2345';
const JOIN_CODE = 'UNIR2345';

const T1 = id('2', 1);
const T2 = id('2', 2);
const T3 = id('2', 3);

/** Los compañeros del equipo de la cuenta (el quinto es suplente y todavía no pone su ID). */
const MATES = [
  { user: id('6', 1), name: 'Jugador Uno', tag: 'Uno#1234' },
  { user: id('6', 2), name: 'Jugador Dos', tag: 'Dos#1234' },
  { user: id('6', 3), name: 'Jugador Tres', tag: 'Tres#1234' },
  { user: id('6', 4), name: 'Jugador Cuatro', tag: 'Cuatro#1234' },
];
const SUB = { user: id('6', 5), name: 'Jugador Cinco' };

/** Los otros equipos (ficticios): nombre, tag y su capitán. */
const OTHERS = [
  { n: 1, name: 'Equipo Uno', tag: 'UNO' },
  { n: 2, name: 'Equipo Dos', tag: 'DOS' },
  { n: 3, name: 'Equipo Tres', tag: 'TRES' },
  { n: 4, name: 'Equipo Cuatro', tag: 'CUA' },
  { n: 5, name: 'Equipo Cinco', tag: 'CIN' },
];
const otherTeamId = (n: number) => id('7', n + 1);
const otherCaptain = (n: number) => id('6', 10 + n);

interface State {
  matches: Row[];
  sides: Row[];
  links: Row[];
  entries: Row[];
  members: Row[];
  gameIds: Row[];
  teams: Row[];
  teamMembers: Row[];
  photos: Row[];
  code: string;
  /** Los equipos de temporada (el lado de cada inscrito en sus series). */
  seasonTeams: Row[];
  teamPlayers: Row[];
}

/** Las series de las fases (se arman una vez, al sembrar la demostración). */
let seq = 0;
const nextId = (kind: string) => id(kind, 50_000 + ++seq);

function tournamentRow(eventId: string, o: { format: string; status: string; startsAt: string; closesAt: string; max: number; prize?: string }): Row {
  const settings = { ...defaultSettings(GAME, MODE, o.format as 'single_elim'), bestOf: { groups: 1, playoffs: 3, final: 3 } };
  return {
    event_id: eventId,
    league_id: DEMO_ESPORTS,
    game: GAME,
    mode: MODE,
    entry_type: 'teams',
    format: o.format,
    status: o.status,
    starts_at: o.startsAt,
    registration_opens_at: null,
    registration_closes_at: o.closesAt,
    checkin_minutes: null,
    max_entries: o.max,
    settings,
    prize_text: o.prize ?? '',
    updated_at: iso(-DAY),
  };
}

const TOURNAMENTS: Row[] = [
  tournamentRow(T1, { format: 'single_elim', status: 'live', startsAt: iso(-2 * HOUR), closesAt: iso(-3 * HOUR), max: 8, prize: 'Trofeo y camisetas (de ejemplo)' }),
  tournamentRow(T2, { format: 'round_robin', status: 'live', startsAt: iso(-DAY), closesAt: iso(-DAY - HOUR), max: 6 }),
  tournamentRow(T3, { format: 'single_elim', status: 'registration', startsAt: iso(5 * DAY), closesAt: iso(5 * DAY), max: 8 }),
];
const NAMES: Record<string, string> = { [T1]: 'Torneo de Ejemplo', [T2]: 'Copa de Ejemplo', [T3]: 'Abierto de Ejemplo' };
const ANNOUNCEMENTS: Record<string, string> = { [T1]: 'Las series se juegan en el servidor de Latinoamérica. Manden la foto de la pantalla final.', [T2]: '', [T3]: '' };

function eventRow(eventId: string): Row {
  const t = TOURNAMENTS.find((x) => x.event_id === eventId)!;
  return {
    id: eventId,
    league_id: DEMO_ESPORTS,
    type: 'torneo',
    name: NAMES[eventId],
    date: toIsoDate(new Date(String(t.starts_at))),
    start_time: null,
    games: 1,
    hcp_base: 0,
    hcp_percent: 0,
    individual_rank_by: null,
    team_rank_by: null,
    category_cuts: null,
    team_size: 5,
    announcement: ANNOUNCEMENTS[eventId],
    player_count: 0,
    created_at: iso(-10 * DAY),
  };
}

/** Un ID de juego (las columnas de esports_game_ids). */
const gameId = (userId: string, display: string, ranks: Row = {}): Row => ({
  user_id: userId,
  game: GAME,
  platform: '',
  platforms: [],
  region: 'latam',
  id_display: display,
  id_normalized: display.toLowerCase(),
  status: 'pendiente',
  ranks,
  rank_source: 'declarado',
  ownership: 'declarado',
  verified_at: null,
  confirmed_at: null,
  updated_at: iso(-5 * DAY),
});

function seed(uid: string): State {
  const s: State = { matches: [], sides: [], links: [], entries: [], members: [], gameIds: [], teams: [], teamMembers: [], photos: [], code: TEAM_CODE, seasonTeams: [], teamPlayers: [] };
  // Los equipos de esports (globales) y los de la cuenta.
  s.teams.push({ id: MY_TEAM, game: GAME, name: 'Equipo de Ejemplo', tag: 'EJE', description: 'Un equipo de ejemplo para probar la app.', logo_path: null, captain_id: uid, member_count: 6, created_at: iso(-20 * DAY), updated_at: iso(-2 * DAY) });
  for (const o of OTHERS) {
    s.teams.push({ id: otherTeamId(o.n), game: GAME, name: o.name, tag: o.tag, description: '', logo_path: null, captain_id: otherCaptain(o.n), member_count: 5, created_at: iso(-15 * DAY), updated_at: iso(-3 * DAY) });
  }
  s.teamMembers.push({ team_id: MY_TEAM, user_id: uid, role: 'captain', display_name: 'Juan Pérez', joined_at: iso(-20 * DAY) });
  for (const m of MATES) s.teamMembers.push({ team_id: MY_TEAM, user_id: m.user, role: 'member', display_name: m.name, joined_at: iso(-19 * DAY) });
  s.teamMembers.push({ team_id: MY_TEAM, user_id: SUB.user, role: 'sub', display_name: SUB.name, joined_at: iso(-18 * DAY) });
  s.teamMembers.push({ team_id: OTHER_TEAM, user_id: otherCaptain(5), role: 'captain', display_name: 'Capitán de Prueba', joined_at: iso(-15 * DAY) });
  // Los IDs de juego: el de la cuenta (con su rango) y los de sus compañeros (el suplente todavía no pone el suyo).
  s.gameIds.push(gameId(uid, 'Ejemplo#1234', { main: { tier: 'gold', div: 2 } }));
  MATES.forEach((m, i) => s.gameIds.push(gameId(m.user, m.tag, i % 2 ? { main: { tier: 'silver', div: 3 } } : {})));

  // Los inscritos: el equipo de la cuenta y los otros, cada uno con su equipo de temporada (su lado en las series).
  const entry = (eventId: string, n: number, o: { mine?: boolean; other?: (typeof OTHERS)[number]; seed: number }): string => {
    const entryId = id('3', n);
    const side = id('4', n);
    const name = o.mine ? 'Equipo de Ejemplo' : o.other!.name;
    const tag = o.mine ? 'EJE' : o.other!.tag;
    const captain = o.mine ? uid : otherCaptain(o.other!.n);
    s.entries.push({
      id: entryId,
      league_id: DEMO_ESPORTS,
      event_id: eventId,
      kind: 'team',
      team_id: o.mine ? MY_TEAM : otherTeamId(o.other!.n),
      name,
      tag,
      captain_id: captain,
      status: 'approved',
      seed: o.seed,
      checked_in_at: null,
      note: null,
      side_team_id: side,
      assigned_entry: null,
      created_at: iso(-8 * DAY + n * 60_000),
    });
    const roster = o.mine
      ? [{ user: uid, name: 'Juan Pérez', tag: 'Ejemplo#1234', role: 'captain', player: ME_PLAYER }, ...MATES.map((m) => ({ user: m.user, name: m.name, tag: m.tag, role: 'member', player: null }))]
      : Array.from({ length: 5 }, (_, i) => ({ user: i ? id('6', 100 + o.other!.n * 10 + i) : captain, name: `Jugador ${o.other!.n * 10 + i}`, tag: `Rival${o.other!.n * 10 + i}#1234`, role: i ? 'member' : 'captain', player: null }));
    for (const r of roster) {
      s.members.push({ entry_id: entryId, event_id: eventId, user_id: r.user, role: r.role, display_name: r.name, gamer_tag: r.tag, ranks: {}, rank_source: 'declarado', player_id: r.player });
    }
    s.seasonTeams.push({ id: side, league_id: DEMO_ESPORTS, name, sort_order: n, color: null, season_id: null, event_id: null, created_at: iso(-8 * DAY), updated_at: iso(-8 * DAY) });
    if (o.mine) s.teamPlayers.push({ team_id: side, league_id: DEMO_ESPORTS, player_id: ME_PLAYER, jersey: null, position: null, role: 'captain' });
    return entryId;
  };
  const t1 = [entry(T1, 1, { mine: true, seed: 1 }), entry(T1, 2, { other: OTHERS[0], seed: 4 }), entry(T1, 3, { other: OTHERS[1], seed: 2 }), entry(T1, 4, { other: OTHERS[2], seed: 3 })];
  const t2 = [entry(T2, 5, { mine: true, seed: 1 }), entry(T2, 6, { other: OTHERS[3], seed: 2 }), entry(T2, 7, { other: OTHERS[4], seed: 3 })];
  entry(T3, 8, { other: OTHERS[0], seed: 1 });
  entry(T3, 9, { other: OTHERS[1], seed: 2 });

  // Las fases (con el motor de la web) y sus series.
  addStage(s, T1, singleEliminationPlan(t1, { thirdPlace: false, bestOf: 3, finalBestOf: 3, kind: 'bracket' }), iso(-2 * HOUR));
  addStage(s, T2, roundRobinPlan(t2, { double: false, bestOf: 1 }), iso(-DAY));

  // Torneo de Ejemplo: la semifinal que no es de la cuenta ya se jugó (y su ganador pasó a la final).
  const sideOf = (entryId: string) => s.entries.find((e) => e.id === entryId)!.side_team_id as string;
  const myT1 = sideOf(t1[0]);
  const t1Matches = s.matches.filter((m) => m.event_id === T1 && m.round === 1);
  const other = t1Matches.find((m) => !sidesOf(s, m.id as string).some((x) => x.team_id === myT1));
  if (other) {
    setResult(s, other, 1, [
      { a: 13, b: 9, map: 'ascent' },
      { a: 11, b: 13, map: 'bind' },
      { a: 13, b: 7, map: 'haven' },
    ], { status: 'confirmed', proposedSide: 1, at: iso(-HOUR) });
  }
  // Copa de Ejemplo: la serie entre los otros dos, confirmada; la primera de la cuenta, anotada por el rival (le toca
  // confirmarla); la otra, por jugar.
  const myT2 = sideOf(t2[0]);
  const t2Matches = s.matches.filter((m) => m.event_id === T2);
  const theirs = t2Matches.find((m) => !sidesOf(s, m.id as string).some((x) => x.team_id === myT2));
  if (theirs) setResult(s, theirs, 2, [{ a: 5, b: 13, map: 'split' }], { status: 'confirmed', proposedSide: 2, at: iso(-20 * HOUR) });
  const mineT2 = t2Matches.filter((m) => m !== theirs);
  if (mineT2[0]) {
    const mySide = sidesOf(s, mineT2[0].id as string).find((x) => x.team_id === myT2)!.side as 1 | 2;
    const rival = mySide === 1 ? 2 : 1;
    setResult(s, mineT2[0], rival, rival === 1 ? [{ a: 13, b: 11, map: 'ascent' }] : [{ a: 11, b: 13, map: 'ascent' }], { status: 'finished', proposedSide: rival, at: iso(-2 * HOUR) });
  }
  return s;
}

const sidesOf = (s: State, matchId: string) => s.sides.filter((x) => x.match_id === matchId);

/** Las series de una fase como las guarda la base: el partido, sus dos lados y su enlace (a dónde va el ganador). */
function addStage(s: State, eventId: string, plan: StagePlan, start: string) {
  const idOf = new Map(plan.matches.map((p) => [p.key, nextId('5')]));
  const entryName = (entryId: string) => s.entries.find((e) => e.id === entryId)?.name as string;
  const sideTeam = (entryId: string) => s.entries.find((e) => e.id === entryId)?.side_team_id as string;
  for (const p of plan.matches) {
    const matchId = idOf.get(p.key)!;
    s.matches.push({
      id: matchId,
      league_id: DEMO_ESPORTS,
      event_id: eventId,
      round: p.round,
      stage: p.stage,
      bracket_key: p.key,
      court: '',
      scheduled_at: new Date(Date.parse(start) + (p.round - 1) * 2 * HOUR).toISOString(),
      status: 'scheduled',
      format: GAME,
      require_confirm: true,
      score: null,
      seq: 0,
      version: 1,
      winner_side: null,
      walkover_side: null,
      scorer_id: null,
      lease_until: null,
      proposed_by: null,
      proposed_at: null,
      proposed_side: null,
      confirmed_by: null,
      confirmed_at: null,
      disputed_by: null,
      disputed_at: null,
      dispute_note: null,
      note: null,
      created_by: OWNER,
      series_id: null,
      created_at: iso(-3 * DAY),
      updated_at: iso(-3 * DAY),
      rules: { game: GAME, bestOf: p.bestOf, draws: false },
    });
    p.sides.forEach((src, i) => {
      const known = src.kind === 'entry';
      s.sides.push({ match_id: matchId, side: i + 1, team_id: known ? sideTeam(src.entryId) : null, label: known ? entryName(src.entryId) : p.labels[i], seed: known ? (s.entries.find((e) => e.id === src.entryId)?.seed ?? null) : null });
    });
    s.links.push({
      match_id: matchId,
      event_id: eventId,
      stage: plan.kind,
      part: p.part,
      group_no: p.group,
      best_of: p.bestOf,
      winner_to: p.winnerTo ? idOf.get(p.winnerTo.key) : null,
      winner_side: p.winnerTo?.side ?? null,
      loser_to: p.loserTo ? idOf.get(p.loserTo.key) : null,
      loser_side: p.loserTo?.side ?? null,
    });
  }
}

/** Deja la serie con ese marcador (el motor lo arma) y, si queda confirmada, pasa al ganador a la siguiente. */
function setResult(s: State, m: Row, winner: 1 | 2, games: GameRecord[], o: { status: 'finished' | 'confirmed'; proposedSide: 1 | 2; at: string; by?: string }) {
  const rules = m.rules as { bestOf: 1 | 3 | 5 | 7 };
  const score = buildSeriesScore({ game: GAME, bestOf: rules.bestOf, draws: false }, games);
  Object.assign(m, {
    status: o.status,
    score,
    winner_side: winner,
    proposed_side: o.proposedSide,
    proposed_by: o.by ?? OWNER,
    proposed_at: o.at,
    confirmed_by: o.status === 'confirmed' ? OWNER : null,
    confirmed_at: o.status === 'confirmed' ? o.at : null,
    version: Number(m.version) + 1,
    updated_at: iso(),
  });
  if (o.status === 'confirmed') advance(s, m);
}

/** El ganador de una serie confirmada pasa al lado que le toca de la serie siguiente (lo hace la base). */
function advance(s: State, m: Row) {
  const link = s.links.find((l) => l.match_id === m.id);
  const won = sidesOf(s, m.id as string).find((x) => x.side === m.winner_side);
  if (!link?.winner_to || !won) return;
  const target = s.sides.find((x) => x.match_id === link.winner_to && x.side === link.winner_side);
  if (target) Object.assign(target, { team_id: won.team_id, label: won.label, seed: won.seed });
  const next = s.matches.find((x) => x.id === link.winner_to);
  if (next) next.version = Number(next.version) + 1;
}

function load(uid: string): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  const s = seed(uid);
  save(s);
  return s;
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: queda en memoria esta vez
  }
}

export function forgetDemoEsports() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Las filas de la liga de esports ficticia, por tabla (las de liga, jugadores, eventos y series se suman a las demás). */
export function esportsTables(uid: string): Record<string, Row[]> {
  const s = load(uid);
  return {
    leagues: [
      {
        id: DEMO_ESPORTS,
        sport: 'esports',
        kind: 'liga',
        visibility: 'public',
        name: 'Esports de Ejemplo',
        owner_id: OWNER,
        venue: 'Online',
        schedule: 'Sábados 7:00 p. m.',
        season_start: null,
        season_end: null,
        contact_name: 'Persona de Prueba',
        contact_phone: '809-000-0000',
        require_photo: false,
        has_minors: false,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        created_at: iso(-30 * DAY),
      },
    ],
    memberships: [{ league_id: DEMO_ESPORTS, user_id: uid, role: 'member', is_scorer: false, display_name: 'Juan Pérez', player_id: ME_PLAYER, scorer_only: false }],
    players: [{ id: ME_PLAYER, league_id: DEMO_ESPORTS, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false }],
    events: [eventRow(T1), eventRow(T2), eventRow(T3)],
    matches: s.matches,
    match_sides: s.sides,
    teams: s.seasonTeams,
    team_players: s.teamPlayers,
    photos: s.photos,
    esports_tournaments: TOURNAMENTS,
    esports_entries: s.entries,
    esports_entry_members: s.members,
    esports_matches: s.links,
    esports_br_games: [],
    esports_br_results: [],
    esports_teams: s.teams,
    esports_team_members: s.teamMembers,
    esports_game_ids: s.gameIds,
  };
}

/** Un ID de juego como lo devuelve `esports_my_game_ids` (camelCase). */
const toMine = (r: Row): Row => ({
  userId: r.user_id,
  game: r.game,
  platform: r.platform,
  platforms: r.platforms,
  region: r.region,
  idDisplay: r.id_display,
  idNormalized: r.id_normalized,
  status: r.status,
  ownership: r.ownership,
  ranks: r.ranks,
  rankSource: r.rank_source,
  lookupName: null,
  externalId: null,
  verifiedAt: r.verified_at,
  confirmedAt: r.confirmed_at,
  updatedAt: r.updated_at,
});

/** Las RPC de esports (y de las series de esta liga) en la demostración. undefined si no son de aquí. */
export function esportsRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (!fn.startsWith('esports_') && !['finish_match', 'confirm_result', 'dispute_result', 'add_photo'].includes(fn)) return undefined;
  const s = load(uid);
  const done = <T,>(v: T): T => {
    save(s);
    return v;
  };
  const match = (mid: unknown) => s.matches.find((m) => m.id === mid);
  const teamOf = (tid: unknown) => s.teams.find((t) => t.id === tid);
  const myIdOf = (game: unknown, platform: unknown) => s.gameIds.find((r) => r.user_id === uid && r.game === game && r.platform === (platform ?? ''));
  const recount = (tid: unknown) => {
    const t = teamOf(tid);
    if (t) t.member_count = s.teamMembers.filter((m) => m.team_id === tid).length;
  };

  switch (fn) {
    // ---------- Las series (van por la cola sin conexión) ----------
    case 'finish_match': {
      const m = match(a.p_match);
      if (!m) return undefined;
      const mine = sidesOf(s, m.id as string).find((x) => s.teamPlayers.some((p) => p.team_id === x.team_id && p.player_id === ME_PLAYER));
      Object.assign(m, {
        status: 'finished',
        score: a.p_score,
        winner_side: a.p_winner ?? null,
        proposed_by: uid,
        proposed_side: mine?.side ?? null,
        proposed_at: iso(),
        version: Number(m.version) + 1,
        updated_at: iso(),
      });
      return done({ ok: true, status: 'finished' });
    }
    case 'confirm_result': {
      const m = match(a.p_match);
      if (!m) return undefined;
      Object.assign(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso(), version: Number(m.version) + 1, updated_at: iso() });
      advance(s, m);
      return done(true);
    }
    case 'dispute_result': {
      const m = match(a.p_match);
      if (!m) return undefined;
      Object.assign(m, { status: 'disputed', disputed_by: uid, disputed_at: iso(), dispute_note: a.p_note ?? null, version: Number(m.version) + 1, updated_at: iso() });
      return done(true);
    }
    case 'add_photo': {
      if (a.p_league !== DEMO_ESPORTS) return undefined;
      const contentType = a.p_content_type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      s.photos.push({ id: a.p_id, league_id: DEMO_ESPORTS, path: photoPath(DEMO_ESPORTS, String(a.p_id), contentType), width: a.p_width ?? null, height: a.p_height ?? null, purged_at: null });
      return done({ id: a.p_id });
    }

    // ---------- Lecturas ----------
    case 'esports_hub': {
      if (a.p_game !== GAME) return { tournaments: [], teams: [] };
      const approved = (eventId: unknown) => s.entries.filter((e) => e.event_id === eventId && e.status === 'approved').length;
      const pending = (eventId: unknown) => s.entries.filter((e) => e.event_id === eventId && e.status === 'pending').length;
      return {
        tournaments: TOURNAMENTS.map((t) => ({
          eventId: t.event_id,
          leagueId: DEMO_ESPORTS,
          name: NAMES[t.event_id as string],
          game: GAME,
          mode: MODE,
          entryType: t.entry_type,
          format: t.format,
          status: t.status,
          startsAt: t.starts_at,
          registrationOpensAt: t.registration_opens_at,
          registrationClosesAt: t.registration_closes_at,
          checkinMinutes: t.checkin_minutes,
          maxEntries: t.max_entries,
          prizeText: t.prize_text,
          leagueName: 'Esports de Ejemplo',
          visibility: 'public',
          logoPath: null,
          approved: approved(t.event_id),
          pending: pending(t.event_id),
        })),
        teams: s.teams.filter((t) => t.game === GAME).map((t) => ({ id: t.id, name: t.name, tag: t.tag, logoPath: t.logo_path, memberCount: t.member_count })),
      };
    }
    case 'esports_my_entries':
      return s.entries
        .filter((e) => (e.status === 'pending' || e.status === 'approved') && (e.captain_id === uid || s.members.some((m) => m.entry_id === e.id && m.user_id === uid)))
        .map((e) => {
          const t = TOURNAMENTS.find((x) => x.event_id === e.event_id)!;
          const role = e.captain_id === uid ? 'captain' : (s.members.find((m) => m.entry_id === e.id && m.user_id === uid)?.role ?? 'member');
          return {
            entryId: e.id,
            eventId: e.event_id,
            leagueId: DEMO_ESPORTS,
            tournament: NAMES[e.event_id as string],
            game: GAME,
            mode: MODE,
            entryStatus: e.status,
            tournamentStatus: t.status,
            startsAt: t.starts_at,
            entryName: e.name,
            role,
            kind: e.kind,
          };
        });
    case 'esports_my_game_ids':
      return s.gameIds.filter((r) => r.user_id === uid).map(toMine);
    case 'esports_my_id_moves':
      return [];
    case 'esports_seen_id_move':
      return null;
    case 'esports_team_code':
      return a.p_team === MY_TEAM ? s.code : null;
    case 'esports_team_preview': {
      const code = String(a.p_code ?? '');
      const t = code === s.code ? teamOf(MY_TEAM) : code === JOIN_CODE ? teamOf(OTHER_TEAM) : null;
      return t ? [{ team_id: t.id, game: t.game, name: t.name, tag: t.tag, logo_path: t.logo_path, member_count: t.member_count }] : [];
    }
    case 'esports_sync_bracket':
      return 0;

    // ---------- IDs de juego ----------
    case 'esports_save_game_id': {
      const display = String(a.p_id ?? '').trim();
      let r = myIdOf(a.p_game, a.p_platform);
      if (!r) {
        r = gameId(uid, display);
        Object.assign(r, { game: a.p_game, platform: a.p_platform ?? '', ranks: {} });
        s.gameIds.push(r);
      }
      Object.assign(r, { id_display: display, id_normalized: display.toLowerCase(), region: a.p_region ?? '', status: 'pendiente', ownership: 'declarado', updated_at: iso() });
      if (Array.isArray(a.p_platforms)) r.platforms = a.p_platforms;
      return done({ status: 'pendiente', idDisplay: display });
    }
    case 'esports_set_ranks': {
      const r = myIdOf(a.p_game, a.p_platform);
      if (r) Object.assign(r, { ranks: a.p_ranks ?? {}, rank_source: 'declarado', updated_at: iso() });
      return done(null);
    }
    case 'esports_set_game_platforms': {
      const r = myIdOf(a.p_game, a.p_platform);
      if (r) r.platforms = Array.isArray(a.p_platforms) ? a.p_platforms : [];
      return done(null);
    }
    case 'esports_delete_game_id':
      s.gameIds = s.gameIds.filter((r) => !(r.user_id === uid && r.game === a.p_game && r.platform === (a.p_platform ?? '')));
      return done(null);

    // ---------- Equipos ----------
    case 'esports_create_team': {
      const teamId = String(a.p_id ?? uuidv7());
      s.teams.push({ id: teamId, game: a.p_game, name: a.p_name, tag: a.p_tag, description: a.p_description ?? '', logo_path: null, captain_id: uid, member_count: 1, created_at: iso(), updated_at: iso() });
      s.teamMembers.push({ team_id: teamId, user_id: uid, role: 'captain', display_name: 'Juan Pérez', joined_at: iso() });
      return done({ teamId, inviteCode: 'NUEV2345' });
    }
    case 'esports_update_team': {
      const t = teamOf(a.p_team);
      if (t) Object.assign(t, a.p_patch as Row, { updated_at: iso() });
      return done(null);
    }
    case 'esports_delete_team':
      s.teams = s.teams.filter((t) => t.id !== a.p_team);
      s.teamMembers = s.teamMembers.filter((m) => m.team_id !== a.p_team);
      return done(null);
    case 'esports_renew_team_code':
      s.code = s.code === TEAM_CODE ? 'EJEM6789' : TEAM_CODE;
      return done(s.code);
    case 'esports_join_team': {
      const t = a.p_code === JOIN_CODE ? teamOf(OTHER_TEAM) : a.p_code === s.code ? teamOf(MY_TEAM) : null;
      if (!t) return null;
      if (!s.teamMembers.some((m) => m.team_id === t.id && m.user_id === uid)) s.teamMembers.push({ team_id: t.id, user_id: uid, role: 'member', display_name: 'Juan Pérez', joined_at: iso() });
      recount(t.id);
      return done({ teamId: t.id });
    }
    case 'esports_leave_team':
      s.teamMembers = s.teamMembers.filter((m) => !(m.team_id === a.p_team && m.user_id === uid));
      recount(a.p_team);
      return done(null);
    case 'esports_remove_member':
      s.teamMembers = s.teamMembers.filter((m) => !(m.team_id === a.p_team && m.user_id === a.p_user));
      recount(a.p_team);
      return done(null);
    case 'esports_set_member_role': {
      const m = s.teamMembers.find((x) => x.team_id === a.p_team && x.user_id === a.p_user);
      if (!m) return null;
      if (a.p_role === 'captain') {
        const cap = s.teamMembers.find((x) => x.team_id === a.p_team && x.role === 'captain');
        if (cap) cap.role = 'member';
        const t = teamOf(a.p_team);
        if (t) t.captain_id = a.p_user;
      }
      m.role = a.p_role;
      return done(null);
    }

    // ---------- Inscripciones ----------
    case 'esports_register_team': {
      const t = teamOf(a.p_team);
      if (!t) return null;
      const entryId = uuidv7();
      s.entries.push({ id: entryId, league_id: DEMO_ESPORTS, event_id: a.p_event, kind: 'team', team_id: t.id, name: t.name, tag: t.tag, captain_id: uid, status: 'pending', seed: null, checked_in_at: null, note: null, side_team_id: null, assigned_entry: null, created_at: iso() });
      const picks = [{ user_id: uid, role: 'captain' }, ...((a.p_members as { user_id: string; role: string }[] | undefined) ?? [])];
      for (const p of picks) {
        const tm = s.teamMembers.find((x) => x.team_id === t.id && x.user_id === p.user_id);
        const gid = s.gameIds.find((r) => r.user_id === p.user_id && r.game === t.game);
        s.members.push({ entry_id: entryId, event_id: a.p_event, user_id: p.user_id, role: p.role, display_name: tm?.display_name ?? '', gamer_tag: gid?.id_display ?? '', ranks: gid?.ranks ?? {}, rank_source: gid?.rank_source ?? 'declarado', player_id: p.user_id === uid ? ME_PLAYER : null });
      }
      return done(entryId);
    }
    case 'esports_withdraw': {
      const e = s.entries.find((x) => x.id === a.p_entry);
      if (e) e.status = 'withdrawn';
      return done(null);
    }
    case 'esports_check_in': {
      const e = s.entries.find((x) => x.id === a.p_entry);
      if (e) e.checked_in_at = a.p_undo ? null : iso();
      return done(null);
    }
    case 'esports_refresh_entry_ids':
      return { updated: 0 };
    default:
      // Lo del organizador (fases, siembra, aprobar…) no está en la demostración.
      return null;
  }
}
