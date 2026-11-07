/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): las ligas de esports ficticias para probar todo lo
 * de esports sin el Supabase real. Todos los datos son ficticios.
 *
 * Donde la cuenta de prueba juega (no organiza): «Esports de Ejemplo», con su equipo «Equipo de Ejemplo» [EJE] de
 * VALORANT, del que es capitán:
 * - «Torneo de Ejemplo» (eliminación simple, en curso): su semifinal está por anotar y la otra ya se jugó.
 * - «Copa de Ejemplo» (todos contra todos, en curso): el rival anotó una serie que le toca confirmar; hay otra por jugar.
 * - «Abierto de Ejemplo» (inscripción abierta): todavía no está inscrito (para «Inscribir mi equipo»).
 * Su ID es `Ejemplo#1234`. El código `UNIR2345` lleva a otro equipo («Equipo Cinco») para probar «Unirme al equipo».
 *
 * Donde la cuenta organiza (es la dueña): «Torneos de Ejemplo» (liga de VALORANT, con las transmisiones activadas) y
 * «Battle Royale de Ejemplo» (un torneo suelto de Free Fire):
 * - «Clásico de Ejemplo» (inscripción abierta, «Libre», con check-in): 4 equipos aprobados (2 con check-in y uno con
 *   lugar), uno por aprobar y 6 agentes libres → revisar, sembrar, agentes libres, armar el cuadro, editar, cancelar.
 * - «Grupos de Ejemplo» (grupos y playoffs, en curso): los dos grupos terminados → «Pasar a playoffs».
 * - «Liga Interna de Ejemplo» (todos contra todos, en curso): una serie confirmada, una en disputa, una por confirmar y
 *   tres por jugar → corregir, decidir el reclamo, W.O., cambiar la hora, anular y transmitir.
 * - «Battle Royale de Ejemplo» (en curso): 6 escuadras y 2 partidas anotadas → «Anotar partida», editarla, anularla.
 * Crear un torneo o una liga de esports, el logo de un equipo y las transmisiones también quedan aquí.
 *
 * Lo que cambia se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoEsports). Se junta con
 * las demás tablas de la demostración: `esportsTables(uid)` da las filas por tabla (las de `leagues`, `memberships`,
 * `players`, `events`, `matches`, `match_sides`, `teams` y `team_players` se suman a las que ya hay) y
 * `esportsRpc(uid, fn, args)` contesta las RPC de esports, de las series y de las transmisiones de estas ligas
 * (undefined si no son de aquí).
 */
import { buildSeriesScore, defaultSettings, groupsPlan, roundRobinPlan, singleEliminationPlan, type GameId, type GameRecord, type StagePlan } from '@mm/sports/esports';
import { stageMatchesArg } from '@mm/lib/data/esports';
import { streamPlatform, normalizeStreamUrl } from '@mm/lib/streams';
import { uuidv7 } from '@mm/lib/db/ids';
import { photoPath } from '@mm/lib/photos';
import { toIsoDate } from '@mm/lib/format';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-esports-2';
/** La clave de antes (sin lo del organizador): se borra también al salir. */
const OLD_KEY = 'mm-demo-esports';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const GAME = 'valorant';
const MODE = '5v5';
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/** Ids fijos: `00000000-0000-7000-8000-0000e5<tipo><número>`. */
const id = (kind: string, n: number) => `00000000-0000-7000-8000-0000e5${kind}${String(n).padStart(5, '0')}`;

export const DEMO_ESPORTS = id('0', 1);
/** La liga de esports que organiza la cuenta de prueba (VALORANT) y su torneo suelto de battle royale (Free Fire). */
export const DEMO_ESPORTS_ORG = id('0', 2);
export const DEMO_ESPORTS_BR = id('0', 3);
const OWNER = id('6', 99);
const ME_PLAYER = id('8', 1);
const MY_TEAM = id('7', 1);
const OTHER_TEAM = id('7', 5);
const TEAM_CODE = 'EJEM2345';
const JOIN_CODE = 'UNIR2345';

const T1 = id('2', 1);
const T2 = id('2', 2);
const T3 = id('2', 3);
const T4 = id('2', 4);
const T5 = id('2', 5);
const T6 = id('2', 6);
const T7 = id('2', 7);

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
  leagues: Row[];
  memberships: Row[];
  events: Row[];
  tournaments: Row[];
  matches: Row[];
  sides: Row[];
  links: Row[];
  entries: Row[];
  members: Row[];
  gameIds: Row[];
  teams: Row[];
  teamMembers: Row[];
  photos: Row[];
  brGames: Row[];
  brResults: Row[];
  streams: Row[];
  code: string;
  /** Los equipos de temporada (el lado de cada inscrito en sus series). */
  seasonTeams: Row[];
  teamPlayers: Row[];
  /** «Tu ID pasó a otra cuenta» (esports_my_id_moves): uno sin ver. */
  moves?: Row[];
}

/** Las series de las fases (se arman al sembrar la demostración y al crear una fase). */
let seq = 0;
const nextId = (kind: string) => id(kind, 50_000 + ++seq);

const leagueRow = (o: { id: string; name: string; kind: 'liga' | 'torneo'; owner: string; game: GameId; live?: boolean; venue?: string; visibility?: string; contact?: boolean }): Row => ({
  id: o.id,
  sport: 'esports',
  kind: o.kind,
  visibility: o.visibility ?? 'public',
  name: o.name,
  owner_id: o.owner,
  venue: o.venue ?? 'Online',
  schedule: '',
  season_start: null,
  season_end: null,
  contact_name: o.contact ? 'Persona de Prueba' : '',
  contact_phone: o.contact ? '809-000-0000' : '',
  require_photo: false,
  has_minors: false,
  tz: 'America/Santo_Domingo',
  logo_path: null,
  rules: { game: o.game },
  live_enabled: o.live === true,
  created_at: iso(-30 * DAY),
});

const membership = (league: string, uid: string, role: 'owner' | 'member', player: string | null = null): Row => ({
  league_id: league,
  user_id: uid,
  role,
  is_scorer: false,
  display_name: 'Juan Pérez',
  player_id: player,
  scorer_only: false,
});

function tournamentRow(
  eventId: string,
  o: { league?: string; game?: GameId; mode?: string; entry?: 'teams' | 'open'; format: string; status: string; startsAt: string; closesAt: string; max: number; prize?: string; checkin?: number | null; settings?: Row },
): Row {
  const game = o.game ?? GAME;
  const mode = o.mode ?? MODE;
  const base = defaultSettings(game, mode as '5v5', o.format as 'single_elim');
  const settings = { ...base, ...(game === GAME ? { bestOf: { groups: 1, playoffs: 3, final: 3 } } : {}), ...(o.settings ?? {}) };
  return {
    event_id: eventId,
    league_id: o.league ?? DEMO_ESPORTS,
    game,
    mode,
    entry_type: o.entry ?? 'teams',
    format: o.format,
    status: o.status,
    starts_at: o.startsAt,
    registration_opens_at: null,
    registration_closes_at: o.closesAt,
    checkin_minutes: o.checkin ?? null,
    max_entries: o.max,
    settings,
    prize_text: o.prize ?? '',
    updated_at: iso(-DAY),
  };
}

function eventRow(t: Row, name: string, announcement = ''): Row {
  return {
    id: t.event_id,
    league_id: t.league_id,
    type: 'torneo',
    name,
    date: toIsoDate(new Date(String(t.starts_at))),
    start_time: null,
    games: 1,
    hcp_base: 0,
    hcp_percent: 0,
    individual_rank_by: null,
    team_rank_by: null,
    category_cuts: null,
    team_size: 5,
    announcement,
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

/** El rango (VALORANT) de cada uno, para «Por rango» y «Balancear por rango». */
const TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
const rankOf = (n: number): Row => ({ main: { tier: TIERS[n % TIERS.length], div: (n % 3) + 1 } });

function seed(uid: string): State {
  const s: State = {
    leagues: [],
    memberships: [],
    events: [],
    tournaments: [],
    matches: [],
    sides: [],
    links: [],
    entries: [],
    members: [],
    gameIds: [],
    teams: [],
    teamMembers: [],
    photos: [],
    brGames: [],
    brResults: [],
    streams: [],
    code: TEAM_CODE,
    seasonTeams: [],
    teamPlayers: [],
  };
  // Las ligas: la que juega la cuenta, la que organiza y su torneo suelto de battle royale.
  s.leagues.push(leagueRow({ id: DEMO_ESPORTS, name: 'Esports de Ejemplo', kind: 'liga', owner: OWNER, game: GAME, contact: true }));
  s.leagues.push(leagueRow({ id: DEMO_ESPORTS_ORG, name: 'Torneos de Ejemplo', kind: 'liga', owner: uid, game: GAME, live: true }));
  s.leagues.push(leagueRow({ id: DEMO_ESPORTS_BR, name: 'Battle Royale de Ejemplo', kind: 'torneo', owner: uid, game: 'free_fire' }));
  s.memberships.push(membership(DEMO_ESPORTS, uid, 'member', ME_PLAYER), membership(DEMO_ESPORTS_ORG, uid, 'owner'), membership(DEMO_ESPORTS_BR, uid, 'owner'));

  // Los torneos y sus eventos.
  const tournament = (name: string, announcement: string, o: Parameters<typeof tournamentRow>[1], eventId: string) => {
    const t = tournamentRow(eventId, o);
    s.tournaments.push(t);
    s.events.push(eventRow(t, name, announcement));
  };
  tournament('Torneo de Ejemplo', 'Las series se juegan en el servidor de Latinoamérica. Manden la foto de la pantalla final.', { format: 'single_elim', status: 'live', startsAt: iso(-2 * HOUR), closesAt: iso(-3 * HOUR), max: 8, prize: 'Trofeo y camisetas (de ejemplo)' }, T1);
  tournament('Copa de Ejemplo', '', { format: 'round_robin', status: 'live', startsAt: iso(-DAY), closesAt: iso(-DAY - HOUR), max: 6 }, T2);
  tournament('Abierto de Ejemplo', '', { format: 'single_elim', status: 'registration', startsAt: iso(5 * DAY), closesAt: iso(5 * DAY), max: 8 }, T3);
  tournament('Clásico de Ejemplo', 'Reglas de ejemplo: lleguen 15 minutos antes.', { league: DEMO_ESPORTS_ORG, entry: 'open', format: 'single_elim', status: 'registration', startsAt: iso(3 * DAY), closesAt: iso(3 * DAY), max: 8, checkin: 30, settings: { subs: 1 } }, T4);
  tournament('Grupos de Ejemplo', '', { league: DEMO_ESPORTS_ORG, format: 'groups_playoffs', status: 'live', startsAt: iso(-DAY), closesAt: iso(-DAY - HOUR), max: 8, settings: { groups: 2, perGroup: 1, playoffs: 'single' } }, T5);
  tournament('Liga Interna de Ejemplo', '', { league: DEMO_ESPORTS_ORG, format: 'round_robin', status: 'live', startsAt: iso(-2 * DAY), closesAt: iso(-2 * DAY - HOUR), max: 6 }, T6);
  tournament('Battle Royale de Ejemplo', '', { league: DEMO_ESPORTS_BR, game: 'free_fire', mode: 'squad', format: 'br', status: 'live', startsAt: iso(-3 * HOUR), closesAt: iso(-4 * HOUR), max: 12 }, T7);

  // Un ID viejo tuyo con el que alguien entró por Riot en otra cuenta (el aviso de Hoy, Esports y Mi ID).
  s.moves = [{ id: id('9', 1), game: GAME, platform: '', idDisplay: 'Viejo#5678', provider: 'riot', createdAt: iso(-2 * 60 * 60_000) }];
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

  seedOrganizer(s);
  return s;
}

/** Lo de las ligas que organiza la cuenta (ver arriba). */
function seedOrganizer(s: State) {
  let n = 100;
  /** Un inscrito de una liga que organiza la cuenta, con su plantilla ficticia (y su lado si está aprobado). */
  const add = (eventId: string, o: { name: string; tag?: string; kind?: 'team' | 'free_agent'; status?: string; players?: number; seed?: number | null; checkedIn?: boolean; game?: GameId }): string => {
    n += 1;
    const t = s.tournaments.find((x) => x.event_id === eventId)!;
    const entryId = id('3', n);
    const kind = o.kind ?? 'team';
    const users = Array.from({ length: o.players ?? (kind === 'free_agent' ? 1 : 5) }, (_, i) => id('6', 1000 + n * 10 + i));
    s.entries.push({
      id: entryId,
      league_id: t.league_id,
      event_id: eventId,
      kind,
      team_id: null,
      name: o.name,
      tag: o.tag ?? '',
      captain_id: users[0],
      status: o.status ?? 'approved',
      seed: o.seed ?? null,
      checked_in_at: o.checkedIn ? iso(-HOUR) : null,
      note: null,
      side_team_id: null,
      assigned_entry: null,
      created_at: iso(-6 * DAY + n * 60_000),
    });
    users.forEach((u, i) => {
      const who = kind === 'free_agent' ? o.name : `Jugador ${n - 100}${i + 1}`;
      s.members.push({
        entry_id: entryId,
        event_id: eventId,
        user_id: u,
        role: kind === 'free_agent' ? 'member' : i === 0 ? 'captain' : i >= 5 ? 'sub' : 'member',
        display_name: who,
        gamer_tag: o.game === 'free_fire' ? `${1000000 + n * 10 + i}` : `${who.replace(/\s+/g, '')}#1234`,
        ranks: o.game === 'free_fire' ? {} : rankOf(n + i),
        rank_source: 'declarado',
        player_id: null,
      });
    });
    if ((o.status ?? 'approved') === 'approved' && kind !== 'free_agent') materialize(s, entryId);
    return entryId;
  };

  // Clásico de Ejemplo: por revisar, sembrar y armar el cuadro (con check-in y agentes libres).
  add(T4, { name: 'Equipo Uno', tag: 'UNO', checkedIn: true });
  add(T4, { name: 'Equipo Dos', tag: 'DOS', checkedIn: true });
  add(T4, { name: 'Equipo Tres', tag: 'TRES' });
  add(T4, { name: 'Equipo Cuatro', tag: 'CUA', players: 4 });
  add(T4, { name: 'Equipo Cinco', tag: 'CIN', status: 'pending' });
  for (const name of ['Agente Uno', 'Agente Dos', 'Agente Tres', 'Agente Cuatro', 'Agente Cinco', 'Agente Seis']) add(T4, { name, kind: 'free_agent' });

  // Grupos de Ejemplo: los dos grupos terminados (falta «Pasar a playoffs»).
  const g = ['Equipo Seis', 'Equipo Siete', 'Equipo Ocho', 'Equipo Nueve'].map((name, i) => add(T5, { name, seed: i + 1 }));
  addStage(s, T5, groupsPlan(g, { groups: 2, double: false, bestOf: 1 }), iso(-DAY));
  s.matches
    .filter((m) => m.event_id === T5)
    .forEach((m, i) => setResult(s, m, i % 2 ? 2 : 1, [i % 2 ? { a: 8, b: 13, map: 'lotus' } : { a: 13, b: 6, map: 'pearl' }], { status: 'confirmed', proposedSide: 1, at: iso(-20 * HOUR) }));

  // Liga Interna de Ejemplo: una confirmada, una en disputa, una por confirmar y tres por jugar.
  const l = ['Equipo Diez', 'Equipo Once', 'Equipo Doce', 'Equipo Trece'].map((name, i) => add(T6, { name, seed: i + 1 }));
  addStage(s, T6, roundRobinPlan(l, { double: false, bestOf: 1 }), iso(-2 * DAY));
  const t6 = s.matches.filter((m) => m.event_id === T6).sort((a, b) => Number(a.round) - Number(b.round));
  if (t6[0]) setResult(s, t6[0], 1, [{ a: 13, b: 10, map: 'ascent' }], { status: 'confirmed', proposedSide: 1, at: iso(-30 * HOUR) });
  if (t6[1]) {
    setResult(s, t6[1], 1, [{ a: 13, b: 11, map: 'bind' }], { status: 'finished', proposedSide: 1, at: iso(-26 * HOUR) });
    Object.assign(t6[1], { status: 'disputed', disputed_at: iso(-25 * HOUR), dispute_note: 'Ese mapa lo ganamos nosotros (nota de ejemplo).' });
  }
  if (t6[2]) setResult(s, t6[2], 2, [{ a: 9, b: 13, map: 'haven' }], { status: 'finished', proposedSide: 2, at: iso(-3 * HOUR) });

  // Battle Royale de Ejemplo: 6 escuadras y 2 partidas anotadas.
  const squads = ['Escuadra Uno', 'Escuadra Dos', 'Escuadra Tres', 'Escuadra Cuatro', 'Escuadra Cinco', 'Escuadra Seis'].map((name, i) =>
    add(T7, { name, tag: `ES${i + 1}`, players: 4, game: 'free_fire', seed: i + 1 }),
  );
  [0, 1].forEach((k) => {
    const gid = id('a', k + 1);
    s.brGames.push({ id: gid, event_id: T7, round: 1, game_no: k + 1, map: k ? 'Purgatorio' : 'Bermuda', status: 'finished', scheduled_at: null, proof: [] });
    squads.forEach((entryId, i) => s.brResults.push({ game_id: gid, entry_id: entryId, placement: ((i + k * 2) % squads.length) + 1, kills: (i * 3 + k) % 7 }));
  });
}

const sidesOf = (s: State, matchId: string) => s.sides.filter((x) => x.match_id === matchId);
const tournamentOf = (s: State, eventId: unknown) => s.tournaments.find((t) => t.event_id === eventId);
/** Las ligas que organiza la cuenta (ahí contesta lo del organizador). */
const ownLeague = (s: State, uid: string, lid: unknown) => s.leagues.some((l) => l.id === lid && l.owner_id === uid);

/** Aprobar: el equipo de temporada del inscrito (su lado en las series), como `private.esp_materialize`. */
function materialize(s: State, entryId: string) {
  const e = s.entries.find((x) => x.id === entryId);
  if (!e || e.side_team_id) return;
  const side = nextId('4');
  e.side_team_id = side;
  s.seasonTeams.push({ id: side, league_id: e.league_id, name: e.name, sort_order: Number(e.seed ?? 999), color: null, season_id: null, event_id: null, created_at: iso(), updated_at: iso() });
}

/** Quitar el lado de un inscrito que deja de estar (rechazado o retirado en la inscripción). */
function unmaterialize(s: State, entryId: string) {
  const e = s.entries.find((x) => x.id === entryId);
  if (!e?.side_team_id) return;
  s.seasonTeams = s.seasonTeams.filter((t) => t.id !== e.side_team_id);
  e.side_team_id = null;
}

/** Una fase desde el plan del motor (con el mismo lote que manda la app a `esports_create_stage`). */
function addStage(s: State, eventId: string, plan: StagePlan, start: string) {
  insertStage(s, eventId, plan.kind, stageMatchesArg(plan, { newId: () => nextId('5') }), start);
}

/** Las series de una fase como las guarda la base: el partido, sus dos lados y su enlace (a dónde va el ganador). */
function insertStage(s: State, eventId: string, stage: string, batch: Row[], start: string): string[] {
  const t = tournamentOf(s, eventId)!;
  const game = String(t.game);
  const draws = (t.settings as { draws?: boolean } | undefined)?.draws === true;
  const entryOf = (entryId: unknown) => s.entries.find((e) => e.id === entryId);
  for (const m of batch) {
    const matchId = String(m.id);
    const round = Number(m.round ?? 1);
    s.matches.push({
      id: matchId,
      league_id: t.league_id,
      event_id: eventId,
      round,
      stage: m.stage,
      bracket_key: m.key,
      court: '',
      scheduled_at: (m.scheduled_at as string | null) ?? new Date(Date.parse(start) + (round - 1) * 2 * HOUR).toISOString(),
      status: 'scheduled',
      format: game,
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
      created_at: iso(),
      updated_at: iso(),
      rules: { game, bestOf: Number(m.best_of ?? 1), draws: draws && stage !== 'bracket' && stage !== 'playoffs' },
    });
    for (const side of (m.sides as Row[]) ?? []) {
      const e = side.entry_id ? entryOf(side.entry_id) : null;
      s.sides.push({ match_id: matchId, side: side.side, team_id: e?.side_team_id ?? null, label: e ? e.name : (side.label ?? 'Por definir'), seed: e?.seed ?? null });
    }
    const to = (l: unknown) => (l && typeof l === 'object' ? (l as { id: string; side: number }) : null);
    s.links.push({
      match_id: matchId,
      event_id: eventId,
      stage,
      part: m.part,
      group_no: m.group_no ?? null,
      best_of: m.best_of,
      winner_to: to(m.winner_to)?.id ?? null,
      winner_side: to(m.winner_to)?.side ?? null,
      loser_to: to(m.loser_to)?.id ?? null,
      loser_side: to(m.loser_to)?.side ?? null,
    });
  }
  t.status = 'live';
  return batch.map((m) => String(m.id));
}

/** Deja la serie con ese marcador (el motor lo arma) y, si queda confirmada, pasa al ganador a la siguiente. */
function setResult(s: State, m: Row, winner: 1 | 2, games: GameRecord[], o: { status: 'finished' | 'confirmed'; proposedSide: 1 | 2; at: string; by?: string }) {
  const rules = m.rules as { game: GameId; bestOf: 1 | 3 | 5 | 7 };
  const score = buildSeriesScore({ game: rules.game ?? GAME, bestOf: rules.bestOf, draws: false }, games);
  Object.assign(m, {
    status: o.status,
    score,
    winner_side: winner,
    proposed_side: o.proposedSide,
    proposed_by: o.by ?? OWNER,
    proposed_at: o.at,
    confirmed_by: o.status === 'confirmed' ? OWNER : null,
    confirmed_at: o.status === 'confirmed' ? o.at : null,
    seq: Number(m.seq ?? 0) + 1,
    version: Number(m.version) + 1,
    updated_at: iso(),
  });
  if (o.status === 'confirmed') advance(s, m);
}

/** El ganador (y el perdedor) de una serie que cuenta pasa al lado que le toca de la serie siguiente (lo hace la base). */
function advance(s: State, m: Row) {
  const link = s.links.find((l) => l.match_id === m.id);
  if (!link) return;
  const move = (to: unknown, toSide: unknown, side: unknown) => {
    const from = sidesOf(s, m.id as string).find((x) => x.side === side);
    const target = s.sides.find((x) => x.match_id === to && x.side === toSide);
    if (!from || !target) return;
    Object.assign(target, { team_id: from.team_id, label: from.label, seed: from.seed });
    const next = s.matches.find((x) => x.id === to);
    if (next) next.version = Number(next.version) + 1;
  };
  const w = m.winner_side as 1 | 2 | null;
  if (!w) return;
  if (link.winner_to) move(link.winner_to, link.winner_side, w);
  if (link.loser_to) move(link.loser_to, link.loser_side, w === 1 ? 2 : 1);
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
    sessionStorage.removeItem(OLD_KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Las filas de las ligas de esports ficticias, por tabla (las de liga, jugadores, eventos y series se suman a las demás). */
export function esportsTables(uid: string): Record<string, Row[]> {
  const s = load(uid);
  return {
    leagues: s.leagues,
    memberships: s.memberships,
    players: [{ id: ME_PLAYER, league_id: DEMO_ESPORTS, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false }],
    events: s.events,
    matches: s.matches,
    match_sides: s.sides,
    teams: s.seasonTeams,
    team_players: s.teamPlayers,
    photos: s.photos,
    esports_tournaments: s.tournaments,
    esports_entries: s.entries,
    esports_entry_members: s.members,
    esports_matches: s.links,
    esports_br_games: s.brGames,
    esports_br_results: s.brResults,
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

/** Las RPC genéricas de las series y de las transmisiones que contesta este archivo (solo en sus ligas). */
const MATCH_RPCS = ['finish_match', 'confirm_result', 'dispute_result', 'add_photo', 'set_walkover', 'resolve_dispute', 'admin_correct_result', 'reschedule_match', 'void_match', 'create_league', 'league_streams', 'start_stream', 'end_stream'];

/** Las RPC de esports (y de las series y transmisiones de estas ligas) en la demostración. undefined si no son de aquí. */
export function esportsRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (!fn.startsWith('esports_') && !MATCH_RPCS.includes(fn)) return undefined;
  const s = load(uid);
  const done = <T,>(v: T): T => {
    save(s);
    return v;
  };
  const match = (mid: unknown) => s.matches.find((m) => m.id === mid);
  const teamOf = (tid: unknown) => s.teams.find((t) => t.id === tid);
  const entryOf = (eid: unknown) => s.entries.find((e) => e.id === eid);
  const eventName = (eventId: unknown) => String(s.events.find((e) => e.id === eventId)?.name ?? '');
  const leagueOf = (lid: unknown) => s.leagues.find((l) => l.id === lid);
  const myIdOf = (game: unknown, platform: unknown) => s.gameIds.find((r) => r.user_id === uid && r.game === game && r.platform === (platform ?? ''));
  const recount = (tid: unknown) => {
    const t = teamOf(tid);
    if (t) t.member_count = s.teamMembers.filter((m) => m.team_id === tid).length;
  };
  const bump = (m: Row, patch: Row) => Object.assign(m, patch, { version: Number(m.version) + 1, seq: Number(m.seq ?? 0) + 1, updated_at: iso() });

  switch (fn) {
    // ---------- Las series (finish_match va por la cola sin conexión) ----------
    case 'finish_match': {
      const m = match(a.p_match);
      if (!m) return undefined;
      // Lo que anota quien organiza queda confirmado (como en la base); lo del capitán, por confirmar.
      if (ownLeague(s, uid, m.league_id)) {
        bump(m, { status: 'confirmed', score: a.p_score, winner_side: a.p_winner ?? null, proposed_by: uid, proposed_side: null, proposed_at: iso(), confirmed_by: uid, confirmed_at: iso() });
        advance(s, m);
        return done({ ok: true, status: 'confirmed' });
      }
      const mine = sidesOf(s, m.id as string).find((x) => s.teamPlayers.some((p) => p.team_id === x.team_id && p.player_id === ME_PLAYER));
      bump(m, { status: 'finished', score: a.p_score, winner_side: a.p_winner ?? null, proposed_by: uid, proposed_side: mine?.side ?? null, proposed_at: iso() });
      return done({ ok: true, status: 'finished' });
    }
    case 'confirm_result': {
      const m = match(a.p_match);
      if (!m) return undefined;
      bump(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso() });
      advance(s, m);
      return done(true);
    }
    case 'dispute_result': {
      const m = match(a.p_match);
      if (!m) return undefined;
      bump(m, { status: 'disputed', disputed_by: uid, disputed_at: iso(), dispute_note: a.p_note ?? null });
      return done(true);
    }
    case 'resolve_dispute':
    case 'admin_correct_result': {
      const m = match(a.p_match);
      if (!m) return undefined;
      bump(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso(), ...(a.p_score ? { score: a.p_score, winner_side: a.p_winner ?? null } : {}), note: a.p_note ?? null });
      advance(s, m);
      return done(null);
    }
    case 'set_walkover': {
      const m = match(a.p_match);
      if (!m) return undefined;
      const absent = Number(a.p_absent);
      bump(m, { status: 'walkover', walkover_side: absent, winner_side: absent === 1 ? 2 : absent === 2 ? 1 : null, score: a.p_score ?? null });
      advance(s, m);
      return done(null);
    }
    case 'reschedule_match': {
      const m = match(a.p_match);
      if (!m) return undefined;
      bump(m, { scheduled_at: a.p_scheduled_at, ...(m.status === 'postponed' ? { status: 'scheduled' } : {}) });
      return done(null);
    }
    case 'void_match': {
      const m = match(a.p_match);
      if (!m) return undefined;
      bump(m, { status: 'void' });
      return done(null);
    }
    case 'add_photo': {
      if (!leagueOf(a.p_league)) return undefined;
      const contentType = a.p_content_type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      s.photos.push({ id: a.p_id, league_id: a.p_league, path: photoPath(String(a.p_league), String(a.p_id), contentType), width: a.p_width ?? null, height: a.p_height ?? null, purged_at: null });
      return done({ id: a.p_id });
    }

    // ---------- Las transmisiones en vivo de estas ligas ----------
    case 'league_streams':
      if (!leagueOf(a.p_league)) return undefined;
      return s.streams.filter((x) => x.leagueId === a.p_league);
    case 'start_stream': {
      const lg = leagueOf(a.p_league);
      if (!lg) return undefined;
      const url = normalizeStreamUrl(String(a.p_url ?? '')) ?? String(a.p_url ?? '');
      const m = match(a.p_match);
      const label = m ? sidesOf(s, m.id as string).map((x) => x.label).join(' vs. ') : a.p_event ? eventName(a.p_event) : null;
      const stream = {
        id: uuidv7(),
        leagueId: lg.id,
        leagueName: lg.name,
        sport: 'esports',
        matchId: a.p_match ?? null,
        eventId: a.p_event ?? null,
        url,
        platform: streamPlatform(url) ?? 'youtube',
        title: a.p_title ?? null,
        label,
        startedAt: iso(),
        startedBy: { id: uid, name: 'Juan Pérez' },
        canEnd: true,
      };
      s.streams.push(stream);
      return done(stream);
    }
    case 'end_stream': {
      const before = s.streams.length;
      s.streams = s.streams.filter((x) => x.id !== a.p_stream);
      return before === s.streams.length ? undefined : done(null);
    }

    // ---------- Crear un torneo o una liga de esports ----------
    case 'create_league': {
      if (a.p_sport !== 'esports') return undefined;
      const lid = String(a.p_id ?? uuidv7());
      const game = (a.p_rules as { game?: GameId } | undefined)?.game ?? GAME;
      s.leagues.push({ ...leagueRow({ id: lid, name: String(a.p_name ?? ''), kind: 'liga', owner: uid, game, venue: String(a.p_venue ?? ''), visibility: String(a.p_visibility ?? 'public') }), created_at: iso() });
      s.memberships.push(membership(lid, uid, 'owner'));
      return done(lid);
    }
    case 'esports_create_tournament': {
      const inLeague = a.p_league ? leagueOf(a.p_league) : null;
      if (a.p_league && !inLeague) return undefined;
      const eventId = String(a.p_event_id ?? uuidv7());
      const lid = inLeague ? String(inLeague.id) : String(a.p_id ?? uuidv7());
      const priv = a.p_visibility === 'private';
      if (!inLeague) {
        s.leagues.push({ ...leagueRow({ id: lid, name: String(a.p_name ?? ''), kind: 'torneo', owner: uid, game: a.p_game as GameId, venue: String(a.p_venue ?? ''), visibility: String(a.p_visibility ?? 'public') }), created_at: iso() });
        s.memberships.push(membership(lid, uid, 'owner'));
      }
      const t: Row = {
        event_id: eventId,
        league_id: lid,
        game: a.p_game,
        mode: a.p_mode,
        entry_type: a.p_entry_type,
        format: a.p_format,
        status: 'registration',
        starts_at: a.p_starts_at,
        registration_opens_at: a.p_registration_opens_at ?? null,
        registration_closes_at: a.p_registration_closes_at ?? a.p_starts_at,
        checkin_minutes: a.p_checkin_minutes ?? null,
        max_entries: a.p_max_entries,
        settings: a.p_settings,
        prize_text: a.p_prize_text ?? '',
        updated_at: iso(),
      };
      s.tournaments.push(t);
      s.events.push({ ...eventRow(t, String(a.p_name ?? ''), String(a.p_announcement ?? '')), created_at: iso() });
      return done({ leagueId: lid, eventId, inviteCode: priv ? 'TORN2345' : null });
    }
    case 'esports_update_tournament': {
      const t = tournamentOf(s, a.p_event);
      if (!t) return undefined;
      const patch = (a.p_patch ?? {}) as Row;
      const ev = s.events.find((e) => e.id === a.p_event);
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'name' || k === 'announcement') {
          if (ev) ev[k] = v;
        } else t[k] = v;
      }
      if (ev && typeof patch.starts_at === 'string') ev.date = toIsoDate(new Date(patch.starts_at));
      t.updated_at = iso();
      return done(null);
    }
    case 'esports_set_status': {
      const t = tournamentOf(s, a.p_event);
      if (!t) return undefined;
      t.status = a.p_status;
      t.updated_at = iso();
      return done(null);
    }

    // ---------- Lecturas ----------
    case 'esports_hub': {
      const game = a.p_game;
      const approved = (eventId: unknown) => s.entries.filter((e) => e.event_id === eventId && e.status === 'approved').length;
      const pending = (eventId: unknown) => s.entries.filter((e) => e.event_id === eventId && e.status === 'pending').length;
      return {
        tournaments: s.tournaments
          .filter((t) => t.game === game && leagueOf(t.league_id)?.visibility !== 'private')
          .map((t) => ({
            eventId: t.event_id,
            leagueId: t.league_id,
            name: eventName(t.event_id),
            game: t.game,
            mode: t.mode,
            entryType: t.entry_type,
            format: t.format,
            status: t.status,
            startsAt: t.starts_at,
            registrationOpensAt: t.registration_opens_at,
            registrationClosesAt: t.registration_closes_at,
            checkinMinutes: t.checkin_minutes,
            maxEntries: t.max_entries,
            prizeText: t.prize_text,
            leagueName: leagueOf(t.league_id)?.name ?? '',
            visibility: leagueOf(t.league_id)?.visibility ?? 'public',
            logoPath: null,
            approved: approved(t.event_id),
            pending: pending(t.event_id),
          })),
        teams: s.teams.filter((t) => t.game === game).map((t) => ({ id: t.id, name: t.name, tag: t.tag, logoPath: t.logo_path, memberCount: t.member_count })),
      };
    }
    case 'esports_my_entries':
      return s.entries
        .filter((e) => (e.status === 'pending' || e.status === 'approved') && (e.captain_id === uid || s.members.some((m) => m.entry_id === e.id && m.user_id === uid)))
        .map((e) => {
          const t = tournamentOf(s, e.event_id)!;
          const role = e.captain_id === uid ? 'captain' : (s.members.find((m) => m.entry_id === e.id && m.user_id === uid)?.role ?? 'member');
          return {
            entryId: e.id,
            eventId: e.event_id,
            leagueId: t.league_id,
            tournament: eventName(e.event_id),
            game: t.game,
            mode: t.mode,
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
      return s.moves ?? [];
    case 'esports_seen_id_move':
      s.moves = (s.moves ?? []).filter((m) => m.id !== a.p_id);
      return done(null);
    case 'esports_team_code':
      return a.p_team === MY_TEAM ? s.code : null;
    case 'esports_team_preview': {
      const code = String(a.p_code ?? '');
      const t = code === s.code ? teamOf(MY_TEAM) : code === JOIN_CODE ? teamOf(OTHER_TEAM) : null;
      return t ? [{ team_id: t.id, game: t.game, name: t.name, tag: t.tag, logo_path: t.logo_path, member_count: t.member_count }] : [];
    }
    case 'esports_sync':
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
    case 'esports_begin_team_logo':
      return teamOf(a.p_team) ? null : undefined;
    case 'esports_set_team_logo': {
      const t = teamOf(a.p_team);
      if (!t) return undefined;
      const old = (t.logo_path as string | null) ?? null;
      Object.assign(t, { logo_path: a.p_path ?? null, updated_at: iso() });
      return done(old);
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
      const tour = tournamentOf(s, a.p_event);
      if (!t || !tour) return null;
      const entryId = uuidv7();
      s.entries.push({ id: entryId, league_id: tour.league_id, event_id: a.p_event, kind: 'team', team_id: t.id, name: t.name, tag: t.tag, captain_id: uid, status: 'pending', seed: null, checked_in_at: null, note: null, side_team_id: null, assigned_entry: null, created_at: iso() });
      const picks = [{ user_id: uid, role: 'captain' }, ...((a.p_members as { user_id: string; role: string }[] | undefined) ?? [])];
      for (const p of picks) {
        const tm = s.teamMembers.find((x) => x.team_id === t.id && x.user_id === p.user_id);
        const gid = s.gameIds.find((r) => r.user_id === p.user_id && r.game === t.game);
        s.members.push({ entry_id: entryId, event_id: a.p_event, user_id: p.user_id, role: p.role, display_name: tm?.display_name ?? '', gamer_tag: gid?.id_display ?? '', ranks: gid?.ranks ?? {}, rank_source: gid?.rank_source ?? 'declarado', player_id: p.user_id === uid ? ME_PLAYER : null });
      }
      return done(entryId);
    }
    case 'esports_withdraw': {
      const e = entryOf(a.p_entry);
      if (e) {
        e.status = 'withdrawn';
        unmaterialize(s, String(e.id));
      }
      return done(null);
    }
    case 'esports_check_in': {
      const e = entryOf(a.p_entry);
      if (e) e.checked_in_at = a.p_undo ? null : iso();
      return done(null);
    }
    case 'esports_refresh_entry_ids':
      return { updated: 0 };

    // ---------- Lo del organizador ----------
    case 'esports_decide_entry': {
      const e = entryOf(a.p_entry);
      if (!e) return undefined;
      if (a.p_approve) {
        e.status = 'approved';
        e.note = null;
        materialize(s, String(e.id));
      } else {
        e.status = 'rejected';
        e.note = a.p_note ?? null;
        unmaterialize(s, String(e.id));
      }
      return done(null);
    }
    case 'esports_update_entry': {
      const e = entryOf(a.p_entry);
      if (!e) return undefined;
      Object.assign(e, a.p_patch as Row);
      const side = s.seasonTeams.find((t) => t.id === e.side_team_id);
      if (side) side.name = e.name;
      for (const x of s.sides) if (x.team_id && x.team_id === e.side_team_id) x.label = e.name;
      return done(null);
    }
    case 'esports_set_seeds': {
      const order = (a.p_order as string[] | undefined) ?? [];
      order.forEach((eid, i) => {
        const e = entryOf(eid);
        if (e) e.seed = i + 1;
      });
      return done(null);
    }
    case 'esports_create_stage': {
      const t = tournamentOf(s, a.p_event);
      if (!t) return undefined;
      return done(insertStage(s, String(a.p_event), String(a.p_stage), (a.p_matches as Row[]) ?? [], String(t.starts_at)));
    }
    case 'esports_delete_stage': {
      const t = tournamentOf(s, a.p_event);
      if (!t) return undefined;
      const gone = new Set(s.links.filter((l) => l.event_id === a.p_event && l.stage === a.p_stage).map((l) => l.match_id));
      s.links = s.links.filter((l) => !gone.has(l.match_id));
      s.matches = s.matches.filter((m) => !gone.has(m.id));
      s.sides = s.sides.filter((x) => !gone.has(x.match_id));
      if (!s.links.some((l) => l.event_id === a.p_event) && !s.brGames.some((g) => g.event_id === a.p_event)) t.status = 'registration';
      return done(null);
    }
    case 'esports_form_teams': {
      const t = tournamentOf(s, a.p_event);
      if (!t) return undefined;
      const ids: string[] = [];
      for (const team of (a.p_teams as { name: string; tag?: string; members: { user_id: string; role: string }[] }[]) ?? []) {
        const entryId = uuidv7();
        const captain = team.members.find((m) => m.role === 'captain')?.user_id ?? team.members[0]?.user_id ?? null;
        s.entries.push({ id: entryId, league_id: t.league_id, event_id: a.p_event, kind: 'team', team_id: null, name: team.name, tag: team.tag ?? '', captain_id: captain, status: 'approved', seed: null, checked_in_at: null, note: null, side_team_id: null, assigned_entry: null, created_at: iso() });
        for (const m of team.members) {
          const agent = s.entries.find((e) => e.event_id === a.p_event && e.kind === 'free_agent' && (e.status === 'pending' || e.status === 'approved') && e.captain_id === m.user_id);
          if (!agent) continue;
          for (const x of s.members) if (x.entry_id === agent.id && x.user_id === m.user_id) Object.assign(x, { entry_id: entryId, role: m.role });
          Object.assign(agent, { status: 'assigned', assigned_entry: entryId });
        }
        materialize(s, entryId);
        ids.push(entryId);
      }
      return done(ids);
    }
    case 'esports_assign_free_agent': {
      const agent = entryOf(a.p_free_agent);
      const team = entryOf(a.p_entry);
      if (!agent || !team) return undefined;
      for (const x of s.members) if (x.entry_id === agent.id) Object.assign(x, { entry_id: team.id, role: a.p_role ?? 'member' });
      Object.assign(agent, { status: 'assigned', assigned_entry: team.id });
      return done(null);
    }
    case 'esports_br_save_game': {
      const t = tournamentOf(s, a.p_event);
      if (!t) return undefined;
      const g = (a.p_game ?? {}) as Row;
      const gid = String(g.id ?? uuidv7());
      const row = s.brGames.find((x) => x.id === gid);
      const next = { id: gid, event_id: a.p_event, round: g.round, game_no: g.game_no, map: g.map ?? '', status: g.status ?? 'finished', scheduled_at: g.scheduled_at ?? null, proof: g.proof ?? [] };
      if (row) Object.assign(row, next);
      else s.brGames.push(next);
      if (Array.isArray(g.results)) {
        s.brResults = s.brResults.filter((r) => r.game_id !== gid);
        for (const r of g.results as Row[]) s.brResults.push({ game_id: gid, entry_id: r.entry_id, placement: r.placement ?? null, kills: r.kills ?? 0 });
      }
      if (t.status === 'registration') t.status = 'live';
      return done(gid);
    }
    case 'esports_br_delete_game': {
      if (!s.brGames.some((g) => g.id === a.p_game)) return undefined;
      s.brGames = s.brGames.filter((g) => g.id !== a.p_game);
      s.brResults = s.brResults.filter((r) => r.game_id !== a.p_game);
      return done(null);
    }
    default:
      return null;
  }
}
