/**
 * Esports (20261008000100_esports.sql, docs/esports.md §9): el deporte y su familia, los torneos por juego (sueltos o en
 * una liga de esports), los ajustes, los equipos de esports (código, unirse, capitanía, logo), las inscripciones (solo
 * equipos o libre, agentes libres), aprobar y materializar en la liga, el check-in, las fases del cuadro y cómo avanza
 * solo, el marcador de cada juego (private.esp_series_ok con las mismas filas que series.ts), el battle royale, la página
 * del juego y la RLS. Cada prueba en su transacción.
 *
 * Mundo: el de fixture.ts más ocho cuentas p1…p8 sin liga.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { makeWorld, member, type World } from './fixture';

let db: TestDb;
let w: World;
let p: string[];

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  p = [];
  for (let i = 1; i <= 8; i++) p.push(await db.createUser(`p${i}@x.com`, `Jugador ${i}`));
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;
type G = { w?: 1 | 2 | null; a?: number; b?: number; pa?: number; pb?: number; ot?: boolean; map?: string };

const DAY = 864e5;
const future = (days = 7) => new Date(Date.now() + days * DAY).toISOString();

/** Guarda el ID de juego de una cuenta (declarado: basta para equipos e inscripciones) y, si viene, su rango declarado. */
const setId = async (uid: string, game: string, id: string, platform?: string, ranks?: Json) => {
  const r = await db.rpc<Json>(uid, 'esports_save_game_id', { p_game: game, p_id: id, p_platform: platform ?? '' });
  if (ranks) await db.rpc(uid, 'esports_set_ranks', { p_game: game, p_platform: platform ?? '', p_ranks: ranks });
  return r;
};

/** Un ID de Rocket League (Epic ID) para cada cuenta. */
const rlId = (uid: string) => setId(uid, 'rocket_league', `RL ${uid.slice(0, 8)}`);

/** «Conectar con Epic» (la vuelta de esports-auth, solo service_role): su ID de Rocket League queda comprobado (login). */
const rlLink = (uid: string, account = `epic-${uid.slice(0, 8)}`) =>
  db.rpc(SERVICE, 'esports_link_account', { p_user: uid, p_game: 'rocket_league', p_provider: 'epic', p_external_id: account, p_display: `RL ${uid.slice(0, 8)}` });

interface TOpts {
  game?: string;
  mode?: string;
  entry?: 'teams' | 'open';
  format?: string;
  max?: number;
  settings?: Json;
  visibility?: 'public' | 'private';
  league?: string;
  name?: string;
  startsAt?: string;
  closesAt?: string | null;
  opensAt?: string | null;
  checkin?: number | null;
}

const createT = (who: string, o: TOpts = {}) =>
  db.rpc<{ leagueId: string; eventId: string; inviteCode: string | null }>(who, 'esports_create_tournament', {
    p_game: o.game ?? 'rocket_league',
    p_name: o.name ?? 'Copa Esports',
    p_mode: o.mode ?? '2v2',
    p_entry_type: o.entry ?? 'teams',
    p_format: o.format ?? 'single_elim',
    p_starts_at: o.startsAt ?? future(),
    p_max_entries: o.max ?? 8,
    p_settings: o.settings ?? {},
    p_visibility: o.visibility ?? 'public',
    p_league: o.league ?? null,
    p_registration_opens_at: o.opensAt ?? null,
    p_registration_closes_at: o.closesAt ?? null,
    p_checkin_minutes: o.checkin ?? null,
  });

const tRow = async (eventId: string) => (await db.admin<Json>('select * from public.esports_tournaments where event_id = $1', [eventId]))[0];
const entryRow = async (id: string) => (await db.admin<Json>('select * from public.esports_entries where id = $1', [id]))[0];
const matchRow = async (id: string) => (await db.admin<Json>('select * from public.matches where id = $1', [id]))[0];
const sides = (id: string) =>
  db.admin<{ side: number; team_id: string | null; label: string }>('select side, team_id, label from public.match_sides where match_id = $1 order by side', [id]);

/** Un equipo de Rocket League: el capitán lo crea y los demás entran con el código (todos con su ID puesto). */
async function rlTeam(captain: string, members: string[], name: string, tag = 'RLT') {
  await rlId(captain);
  const t = await db.rpc<{ teamId: string; inviteCode: string }>(captain, 'esports_create_team', { p_game: 'rocket_league', p_name: name, p_tag: tag });
  for (const m of members) {
    await rlId(m);
    await db.rpc(m, 'esports_join_team', { p_code: t.inviteCode });
  }
  return t;
}

/** Marcador de una serie como lo arma buildSeriesScore (ganador de cada juego: w, o el de más a, o los penales). */
function score(games: G[], bestOf: number, extra: Json = {}) {
  const win = (g: G) =>
    g.w ?? (g.a !== undefined && g.b !== undefined && g.a !== g.b ? (g.a > g.b ? 1 : 2) : g.pa !== undefined && g.pb !== undefined ? (g.pa > g.pb ? 1 : 2) : 0);
  const s: [number, number] = [0, 0];
  const pts: [number, number] = [0, 0];
  for (const g of games) {
    const x = win(g);
    if (x === 1) s[0]++;
    if (x === 2) s[1]++;
    pts[0] += g.a ?? 0;
    pts[1] += g.b ?? 0;
  }
  return { text: `${s[0]}-${s[1]}`, sides: s, totals: { maps: s, points: pts }, games, bestOf, ...extra };
}
const wo = (absent: 0 | 1 | 2, bestOf: number) => {
  const need = (bestOf + 1) / 2;
  const s = absent === 2 ? [need, 0] : absent === 1 ? [0, need] : [0, 0];
  return { text: 'W.O.', wo: true, sides: s, totals: { maps: s, points: [0, 0] }, games: [], bestOf };
};
const seriesOk = async (sc: unknown, rules: Json, final: boolean, winner: number | null, walkover: number | null = null) =>
  (
    await db.admin<{ ok: boolean }>('select private.esp_series_ok($1::jsonb, $2::jsonb, $3, $4::smallint, $5::smallint) as ok', [
      JSON.stringify(sc),
      JSON.stringify(rules),
      final,
      winner,
      walkover,
    ])
  )[0].ok;

describe('el deporte', () => {
  it('esports: familia propia, abierto para todos, orden 11 (al final)', async () => {
    expect(await db.admin(`select id, family, status, sort_order from public.sport_status where id = 'esports'`)).toEqual([
      { id: 'esports', family: 'esports', status: 'open', sort_order: 11 },
    ]);
    const all = await db.asAnon<{ id: string }>('select id from public.sport_status order by sort_order');
    expect(all.at(-1)).toEqual({ id: 'esports' });
    expect((await db.admin<{ f: string }>(`select pg_get_constraintdef(oid) as f from pg_constraint where conname = 'sport_status_family_check'`))[0].f).toContain(
      "'esports'",
    );
    await fails(db.admin(`insert into public.sport_status (id, family) values ('curling', 'hielo')`), '23514');
  });

  it('las insignias aceptan esports en sus checks de deporte y push_category lo pone en «Tus ligas»', async () => {
    for (const c of ['badge_awards_sport_check', 'badge_progress_sport_check', 'badge_stats_sport_check']) {
      const def = (await db.admin<{ f: string }>('select pg_get_constraintdef(oid) as f from pg_constraint where conname = $1', [c]))[0].f;
      expect(def, c).toContain("'esports'");
      expect(def, c).toContain("'table_tennis'");
    }
    await db.admin(`insert into public.badge_stats (badge_key, sport, level, holders, base, pct, rarity, computed_at) values ('debut', 'esports', 0, 0, 0, 0, 'nueva', now())`);
    const cat = await db.admin<Json>(
      `select private.push_category('esports:entry:x') as a, private.push_category('esports:pend:x') as b,
              private.push_category('esports-id:login:x') as c, private.push_category('anotador:x') as d`,
    );
    expect(cat).toEqual([{ a: 'liga', b: 'liga', c: 'liga', d: 'liga' }]);
  });
});

describe('torneos', () => {
  it('una cuenta crea un torneo suelto: liga torneo de esports, su evento y la fila del torneo', async () => {
    const r = await createT(w.u.nuevo, { name: 'Copa RL', visibility: 'private' });
    expect(r.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await db.admin('select sport, kind, rules, visibility from public.leagues where id = $1', [r.leagueId])).toEqual([
      { sport: 'esports', kind: 'torneo', rules: { game: 'rocket_league' }, visibility: 'private' },
    ]);
    expect(await db.admin('select type, name from public.events where id = $1', [r.eventId])).toEqual([{ type: 'torneo', name: 'Copa RL' }]);
    expect(await tRow(r.eventId)).toMatchObject({ league_id: r.leagueId, game: 'rocket_league', mode: '2v2', entry_type: 'teams', status: 'registration', max_entries: 8 });
    // Pública: sin código.
    expect((await createT(w.u.nuevo, { name: 'Abierto' })).inviteCode).toBeNull();
    // El dueño es miembro y jugador de su liga (como create_league).
    expect(await db.count('public.players', 'league_id = $1 and user_id = $2', [r.leagueId, w.u.nuevo])).toBe(1);
  });

  it('una liga de esports del juego y un torneo adentro (solo admin; otro juego no)', async () => {
    const l = await db.rpc<{ league_id: string }>(w.u.org, 'create_league', { p_name: 'Liga VAL', p_sport: 'esports', p_rules: { game: 'valorant' }, p_visibility: 'public' });
    const t = await createT(w.u.org, { league: l.league_id, game: 'valorant', mode: '5v5', name: 'Fecha 1' });
    expect(t.leagueId).toBe(l.league_id);
    expect(await tRow(t.eventId)).toMatchObject({ game: 'valorant', league_id: l.league_id });
    await fails(createT(w.u.org, { league: l.league_id, game: 'cs2', mode: '5v5' }), INVALID);
    await fails(createT(w.u.luis, { league: l.league_id, game: 'valorant', mode: '5v5' }), DENIED);
    // La liga sin juego, con un juego que no existe o con otra clave: no.
    await fails(db.rpc(w.u.org, 'create_league', { p_name: 'Sin juego', p_sport: 'esports' }), INVALID);
    await fails(db.rpc(w.u.org, 'create_league', { p_name: 'Otro', p_sport: 'esports', p_rules: { game: 'tetris' } }), INVALID);
    await fails(db.rpc(w.u.org, 'create_league', { p_name: 'Otro', p_sport: 'esports', p_rules: { game: 'valorant', x: 1 } }), INVALID);
    // El juego no cambia con torneos adentro.
    await fails(db.rpc(w.u.org, 'update_league', { p_league: l.league_id, p_patch: { rules: { game: 'cs2' } } }), INVALID);
    // Un evento de otro tipo no.
    await fails(db.rpc(w.u.org, 'create_event', { p_league: l.league_id, p_type: 'practica', p_date: '2026-11-01' }), INVALID);
    await fails(db.admin(`update public.events set type = 'liga' where id = $1`, [t.eventId]), INVALID);
  });

  it('los ajustes: cada clave fuera de su rango, un modo de otro juego, BR con formato de partidos y «Solo equipos» en 1v1', async () => {
    const bad: [TOpts, string][] = [
      [{ settings: { subs: 3 } }, 'subs'],
      [{ settings: { subs: 2 } }, 'subs > subsMax del 2v2'],
      [{ settings: { autoApprove: 'si' } }, 'autoApprove'],
      [{ settings: { seeding: 'elo' } }, 'seeding'],
      [{ settings: { bestOf: { groups: 2, playoffs: 3, final: 5 } } }, 'bestOf par'],
      [{ settings: { bestOf: { groups: 1, playoffs: 3 } } }, 'bestOf sin final'],
      [{ game: 'ea_fc', mode: '1v1', entry: 'open', settings: { bestOf: { groups: 1, playoffs: 1, final: 5 } } }, 'FC al mejor de 5'],
      [{ settings: { groups: 9 } }, 'groups'],
      [{ settings: { perGroup: 0 } }, 'perGroup'],
      [{ settings: { playoffs: 'triple' } }, 'playoffs'],
      [{ settings: { platform: 'psn' } }, 'platform fuera de NBA 2K'],
      [{ game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: '' } }, 'NBA 2K sin plataforma'],
      [{ settings: { roundsToWin: 2 } }, 'roundsToWin fuera de pelea'],
      [{ game: 'sf6', mode: '1v1', entry: 'open', settings: { roundsToWin: 3 } }, 'SF6 a 3'],
      [{ game: 'smash', mode: '1v1', entry: 'open', settings: { stocks: 6 } }, 'stocks'],
      [{ settings: { br: { placementPoints: [1], killPoints: 1, rounds: 1, gamesPerRound: 1 } } }, 'br fuera de BR'],
      [{ game: 'fortnite', mode: 'solo', entry: 'open', format: 'br', max: 10, settings: { br: { placementPoints: [], killPoints: 1, rounds: 1, gamesPerRound: 4 } } }, 'br sin puntos'],
      [{ game: 'fortnite', mode: 'solo', entry: 'open', format: 'br', max: 10, settings: { br: { placementPoints: [10], killPoints: 11, rounds: 1, gamesPerRound: 4 } } }, 'killPoints'],
      [{ settings: { otra: true } }, 'clave desconocida'],
      [{ mode: '5v5' }, 'modo de otro juego'],
      [{ game: 'free_fire', mode: 'squad', format: 'single_elim' }, 'BR con formato de partidos'],
      [{ game: 'valorant', mode: '5v5', format: 'br' }, 'partidos con formato BR'],
      [{ mode: '1v1', entry: 'teams' }, '«Solo equipos» en 1v1'],
      [{ game: 'free_fire', mode: 'squad', entry: 'teams', format: 'br', max: 13 }, 'más que el lobby'],
      [{ max: 1 }, 'cupo'],
      [{ closesAt: future(8) }, 'cierra después de empezar'],
    ];
    for (const [o, why] of bad) await fails(createT(w.u.org, o), INVALID).catch((e) => Promise.reject(new Error(`${why}: ${e.message}`)));
    // Lo que sí: todas las claves del juego, con sus valores.
    const ok = await createT(w.u.org, {
      settings: {
        subs: 1, autoApprove: true, requireConfirmedId: true, requireVerifiedRank: false, seeding: 'rank',
        bestOf: { groups: 3, playoffs: 5, final: 7 }, thirdPlace: false, bracketReset: true, groups: 2, perGroup: 2,
        playoffs: 'double', doubleRoundRobin: false, draws: false, platform: '',
      },
    });
    expect((await tRow(ok.eventId)).settings.bestOf).toEqual({ groups: 3, playoffs: 5, final: 7 });
    await createT(w.u.org, { game: 'fortnite', mode: 'squad', entry: 'open', format: 'br', max: 25, settings: { bestOf: { groups: 1, playoffs: 1, final: 1 }, br: { placementPoints: [15, 12, 10], killPoints: 1, rounds: 2, gamesPerRound: 6 } } });
    await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'psn' } });
  });

  it('update y estado: lo del formato solo antes de empezar; los pasos de estado que valen', async () => {
    const t = await createT(w.u.org, { name: 'Copa' });
    await db.rpc(w.u.org, 'esports_update_tournament', { p_event: t.eventId, p_patch: { name: 'Copa Grande', max_entries: 16, prize_text: 'Trofeo', mode: '3v3' } });
    expect(await tRow(t.eventId)).toMatchObject({ max_entries: 16, prize_text: 'Trofeo', mode: '3v3' });
    expect(await db.admin('select e.name, l.name as league from public.events e join public.leagues l on l.id = e.league_id where e.id = $1', [t.eventId])).toEqual([
      { name: 'Copa Grande', league: 'Copa Grande' },
    ]);
    await fails(db.rpc(w.u.org, 'esports_update_tournament', { p_event: t.eventId, p_patch: { color: 'rojo' } }), INVALID);
    await fails(db.rpc(w.u.org, 'esports_update_tournament', { p_event: t.eventId, p_patch: { starts_at: 'mañana' } }), INVALID);
    await fails(db.rpc(w.u.luis, 'esports_update_tournament', { p_event: t.eventId, p_patch: { prize_text: 'x' } }), DENIED);
    await fails(db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'finished' }), INVALID);
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'live' });
    await fails(db.rpc(w.u.org, 'esports_update_tournament', { p_event: t.eventId, p_patch: { format: 'double_elim' } }), 'cerrado');
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'registration' });
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'cancelled' });
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'registration' });
    expect((await tRow(t.eventId)).status).toBe('registration');
  });
});

describe('equipos de esports', () => {
  it('crear: con su ID puesto (declarado basta), de un juego de equipos, nombre único en el juego, tope de equipos y 5 por día', async () => {
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Sin ID', p_tag: 'SID' }), 'sin_id');
    await db.rpc(p[0], 'esports_save_game_id', { p_game: 'rocket_league', p_id: 'Declarado' });
    const t = await db.rpc<{ teamId: string; inviteCode: string }>(p[0], 'esports_create_team', {
      p_game: 'rocket_league', p_name: '  Los Cohetes ', p_tag: 'lcx', p_description: 'Del barrio',
    });
    expect(t.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await db.admin('select name, tag, captain_id, member_count from public.esports_teams where id = $1', [t.teamId])).toEqual([
      { name: 'Los Cohetes', tag: 'LCX', captain_id: p[0], member_count: 1 },
    ]);
    expect(await db.admin('select role, display_name from public.esports_team_members where team_id = $1', [t.teamId])).toEqual([{ role: 'captain', display_name: 'Jugador 1' }]);
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'los cohetes', p_tag: 'LC2' }), 'duplicado');
    await setId(p[0], 'ea_fc', 'Jugador_1');
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'ea_fc', p_name: 'Duelo', p_tag: 'DU' }), INVALID);
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Tag malo', p_tag: 'A' }), INVALID);
    // Tres por juego.
    await db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Segundo', p_tag: 'SEG' });
    await db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Tercero', p_tag: 'TER' });
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Cuarto', p_tag: 'CUA' }), 'limite: equipos');
    // Cinco por día: el 6.º (en otro juego) ya no.
    await setId(p[0], 'fortnite', 'Jugador Uno FN');
    await db.rpc(p[0], 'esports_create_team', { p_game: 'fortnite', p_name: 'Cuarto', p_tag: 'CUA' });
    await db.rpc(p[0], 'esports_create_team', { p_game: 'fortnite', p_name: 'Quinto', p_tag: 'QUI' });
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'fortnite', p_name: 'Sexto', p_tag: 'SEX' }), 'rate_limited');
  });

  it('el código: solo el capitán lo lee; sin cuenta se ve a qué equipo lleva; unirse (código malo: null, y a los 10 rate_limited)', async () => {
    const t = await rlTeam(p[0], [], 'Turbo');
    expect(await db.rpc(p[0], 'esports_team_code', { p_team: t.teamId })).toBe(t.inviteCode);
    await fails(db.rpc(p[1], 'esports_team_code', { p_team: t.teamId }), DENIED);
    expect(await db.asUser(p[0], 'select invite_code from public.esports_team_secrets')).toEqual([{ invite_code: t.inviteCode }]);
    expect(await db.asUser(p[1], 'select invite_code from public.esports_team_secrets')).toEqual([]);
    const pre = await db.rpcRows(ANON, 'esports_team_preview', { p_code: ` ${t.inviteCode.toLowerCase().slice(0, 4)} ${t.inviteCode.slice(4)}` });
    expect(pre).toEqual([{ team_id: t.teamId, game: 'rocket_league', name: 'Turbo', tag: 'RLT', logo_path: null, member_count: 1 }]);
    expect(await db.rpcRows(ANON, 'esports_team_preview', { p_code: 'ZZZZZZZZ' })).toEqual([]);
    // Unirse: sin su ID, no.
    await fails(db.rpc(p[1], 'esports_join_team', { p_code: t.inviteCode }), 'sin_id');
    await rlId(p[1]);
    expect(await db.rpc(p[1], 'esports_join_team', { p_code: t.inviteCode })).toEqual({ teamId: t.teamId });
    // Otra vez: lo mismo (ya es miembro).
    expect(await db.rpc(p[1], 'esports_join_team', { p_code: t.inviteCode })).toEqual({ teamId: t.teamId });
    expect((await db.admin<Json>('select member_count from public.esports_teams where id = $1', [t.teamId]))[0].member_count).toBe(2);
    // Código nuevo: el anterior ya no sirve.
    const code = await db.rpc<string>(p[0], 'esports_renew_team_code', { p_team: t.teamId });
    expect(code).not.toBe(t.inviteCode);
    await rlId(p[2]);
    for (let i = 0; i < 10; i++) expect(await db.rpc(p[2], 'esports_join_team', { p_code: 'ABCDEFGH' })).toBeNull();
    await fails(db.rpc(p[2], 'esports_join_team', { p_code: code }), 'rate_limited');
  });

  it('lleno: cupo_lleno (Rocket League: 5 = 3v3 con 2 suplentes)', async () => {
    const t = await rlTeam(p[0], [p[1], p[2], p[3], p[4]], 'Lleno');
    expect((await db.admin<Json>('select member_count from public.esports_teams where id = $1', [t.teamId]))[0].member_count).toBe(5);
    await rlId(p[5]);
    await fails(db.rpc(p[5], 'esports_join_team', { p_code: t.inviteCode }), 'cupo_lleno');
  });

  it('salir, sacar, roles y pasar la capitanía; el capitán no sale con otros adentro; el último se lleva el equipo', async () => {
    const t = await rlTeam(p[0], [p[1], p[2]], 'Roles');
    await fails(db.rpc(p[0], 'esports_leave_team', { p_team: t.teamId }), INVALID);
    await fails(db.rpc(p[1], 'esports_remove_member', { p_team: t.teamId, p_user: p[2] }), DENIED);
    await fails(db.rpc(p[0], 'esports_remove_member', { p_team: t.teamId, p_user: p[0] }), INVALID);
    await db.rpc(p[0], 'esports_set_member_role', { p_team: t.teamId, p_user: p[2], p_role: 'sub' });
    await fails(db.rpc(p[0], 'esports_set_member_role', { p_team: t.teamId, p_user: p[2], p_role: 'jefe' }), INVALID);
    await db.rpc(p[0], 'esports_set_member_role', { p_team: t.teamId, p_user: p[1], p_role: 'captain' });
    expect(await db.admin('select user_id, role from public.esports_team_members where team_id = $1 order by role, user_id', [t.teamId])).toEqual(
      [
        { user_id: p[1], role: 'captain' },
        { user_id: p[0], role: 'member' },
        { user_id: p[2], role: 'sub' },
      ].sort((a, b) => (a.role === b.role ? (a.user_id < b.user_id ? -1 : 1) : a.role < b.role ? -1 : 1)),
    );
    expect((await db.admin<Json>('select captain_id from public.esports_teams where id = $1', [t.teamId]))[0].captain_id).toBe(p[1]);
    // El código ahora lo ve el nuevo capitán.
    await fails(db.rpc(p[0], 'esports_team_code', { p_team: t.teamId }), DENIED);
    await db.rpc(p[1], 'esports_remove_member', { p_team: t.teamId, p_user: p[2] });
    await db.rpc(p[0], 'esports_leave_team', { p_team: t.teamId });
    expect((await db.admin<Json>('select member_count from public.esports_teams where id = $1', [t.teamId]))[0].member_count).toBe(1);
    await fails(db.rpc(p[0], 'esports_leave_team', { p_team: t.teamId }), 'no_existe');
    await db.rpc(p[1], 'esports_leave_team', { p_team: t.teamId });
    expect(await db.count('public.esports_teams', 'id = $1', [t.teamId])).toBe(0);
  });

  it('borrar la cuenta del capitán: la capitanía pasa al titular más antiguo; member_count al día', async () => {
    const t = await rlTeam(p[0], [p[1], p[2]], 'Herencia');
    await db.rpc(p[0], 'esports_set_member_role', { p_team: t.teamId, p_user: p[1], p_role: 'sub' });
    await db.admin(`update public.esports_team_members set joined_at = now() - interval '2 days' where team_id = $1 and user_id = $2`, [t.teamId, p[1]]);
    await db.admin(`update public.esports_team_members set joined_at = now() - interval '1 day' where team_id = $1 and user_id = $2`, [t.teamId, p[2]]);
    await db.admin('delete from auth.users where id = $1', [p[0]]);
    // p[1] es más antiguo pero suplente: gana el titular p[2].
    expect(await db.admin('select captain_id, member_count from public.esports_teams where id = $1', [t.teamId])).toEqual([{ captain_id: p[2], member_count: 2 }]);
    expect(await db.admin(`select user_id from public.esports_team_members where team_id = $1 and role = 'captain'`, [t.teamId])).toEqual([{ user_id: p[2] }]);
  });

  it('el logo del equipo: lo reserva y lo pone el capitán; el anterior va a la cola; purge_queue_take no toma uno en uso', async () => {
    const t = await rlTeam(p[0], [p[1]], 'Con Logo');
    const path1 = `${t.teamId}/${randomUUID()}.webp`;
    const path2 = `${t.teamId}/${randomUUID()}.png`;
    const canUpload = async (who: string, path: string) => (await db.as<{ ok: boolean }>(who, 'select private.can_upload_logo_path($1) as ok', [path]))[0].ok;
    const canRemove = async (who: string, path: string) => (await db.as<{ ok: boolean }>(who, 'select private.can_remove_logo_path($1) as ok', [path]))[0].ok;
    expect(await canUpload(p[0], path1)).toBe(false);
    await db.rpc(p[0], 'esports_begin_team_logo', { p_team: t.teamId, p_path: path1 });
    expect(await canUpload(p[0], path1)).toBe(true);
    expect(await canUpload(p[1], path1)).toBe(false);
    await fails(db.rpc(p[1], 'esports_begin_team_logo', { p_team: t.teamId, p_path: path2 }), DENIED);
    await fails(db.rpc(p[0], 'esports_begin_team_logo', { p_team: t.teamId, p_path: `${randomUUID()}/${randomUUID()}.webp` }), INVALID);
    expect(await db.rpc(p[0], 'esports_set_team_logo', { p_team: t.teamId, p_path: path1 })).toBeNull();
    // La reserva se usa una vez.
    expect(await canUpload(p[0], path1)).toBe(false);
    expect(await canRemove(p[0], path1)).toBe(true);
    expect(await canRemove(p[1], path1)).toBe(false);
    await db.rpc(p[0], 'esports_begin_team_logo', { p_team: t.teamId, p_path: path2 });
    expect(await db.rpc(p[0], 'esports_set_team_logo', { p_team: t.teamId, p_path: path2 })).toBe(path1);
    expect(await db.admin(`select path from private.storage_purge_queue where bucket = 'logos'`)).toEqual([{ path: path1 }]);
    // Uno en uso que quedó en la cola no se toma (y sale de la cola).
    await db.admin(`insert into private.storage_purge_queue (path, bucket) values ($1, 'logos')`, [path2]);
    expect(await db.as(SERVICE, `select * from public.purge_queue_take(p_bucket => 'logos')`)).toEqual([{ path: path1 }]);
    expect(await db.count('private.storage_purge_queue', 'path = $1', [path2])).toBe(0);
    // Las ligas siguen igual.
    expect(await canUpload(w.u.org, `${w.priv}/${randomUUID()}.webp`)).toBe(false);
  });
});

describe('inscripciones', () => {
  it('cerrada, privada sin ser de la liga, plantilla corta o larga, sin ID, ID sin comprobar, duplicado, autoApprove y cupo', async () => {
    const a = await rlTeam(p[0], [p[1], p[2]], 'Alfa', 'ALF');
    const b = await rlTeam(p[3], [p[4], p[2]], 'Beta', 'BET');
    const c = await rlTeam(p[5], [p[6]], 'Gamma', 'GAM');
    // Cerrada (ya cerró la inscripción).
    const t0 = await createT(w.u.org, { name: 'Cerrada' });
    await db.admin(`update public.esports_tournaments set registration_closes_at = now() - interval '1 hour' where event_id = $1`, [t0.eventId]);
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: t0.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] }), 'cerrado');
    // Privada: hay que ser de la liga.
    const tp = await createT(w.u.org, { name: 'Privada', visibility: 'private' });
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: tp.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] }), DENIED);
    await db.rpc(p[0], 'join_league', { p_code: tp.inviteCode });
    await db.rpc(p[0], 'esports_register_team', { p_event: tp.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] });

    const t = await createT(w.u.org, { name: 'Abierta', max: 2, settings: { subs: 1 } });
    // Plantilla corta (solo el capitán), larga (2 titulares y 2 suplentes) y alguien que no es del equipo.
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [] }), INVALID);
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }, { user_id: p[2], role: 'sub' }, { user_id: p[4], role: 'sub' }] }), INVALID);
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[4] }] }), INVALID);
    // Solo el capitán inscribe.
    await fails(db.rpc(p[1], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[0] }] }), INVALID);
    // Un miembro que se quedó sin ID: lo tenía conectado con Epic y otra cuenta entró con esa cuenta de Epic.
    await rlLink(p[1], 'epic-compartida');
    await rlLink(p[7], 'epic-compartida');
    const e1 = await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] }), 'sin_id');
    expect((e1 as Json).detail).toBe('Jugador 2');
    // Con su ID declarado otra vez basta (el torneo no pide el ID comprobado: requireConfirmedId es false por defecto).
    await rlId(p[1]);
    const ea = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }, { user_id: p[2], role: 'sub' }] });
    expect(await entryRow(ea)).toMatchObject({ kind: 'team', status: 'pending', name: 'Alfa', tag: 'ALF', captain_id: p[0], team_id: a.teamId, side_team_id: null });
    expect(await db.admin('select user_id, role, gamer_tag from public.esports_entry_members where entry_id = $1 order by role, user_id', [ea])).toHaveLength(3);
    // El equipo otra vez, y la misma persona (p[2]) en otro inscrito: duplicado.
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] }), 'duplicado');
    await fails(db.rpc(p[3], 'esports_register_team', { p_event: t.eventId, p_team: b.teamId, p_members: [{ user_id: p[2] }] }), 'duplicado');
    await db.rpc(p[3], 'esports_register_team', { p_event: t.eventId, p_team: b.teamId, p_members: [{ user_id: p[4] }] });
    // Cupo de 2 con los dos aprobados: el tercero no entra.
    await db.admin(`update public.esports_entries set status = 'approved' where event_id = $1`, [t.eventId]);
    await fails(db.rpc(p[5], 'esports_register_team', { p_event: t.eventId, p_team: c.teamId, p_members: [{ user_id: p[6] }] }), 'cupo_lleno');

    // ID comprobado: Rocket League se comprueba conectando Epic, así que el declarado no sirve (id_sin_comprobar, con el
    // nombre del primero que falta). El rango verificado no cuenta en Rocket League (solo en LoL).
    const tr = await createT(w.u.org, { name: 'Con ID', settings: { requireConfirmedId: true, requireVerifiedRank: true } });
    const e2 = await fails(db.rpc(p[5], 'esports_register_team', { p_event: tr.eventId, p_team: c.teamId, p_members: [{ user_id: p[6] }] }), 'id_sin_comprobar');
    expect((e2 as Json).detail).toBe('Jugador 6');
    for (const u of [p[5], p[6]]) await rlLink(u);
    // Con autoApprove queda aprobado y materializado.
    await db.rpc(w.u.org, 'esports_update_tournament', { p_event: tr.eventId, p_patch: { settings: { requireConfirmedId: true, requireVerifiedRank: true, autoApprove: true } } });
    const ec = await db.rpc<string>(p[5], 'esports_register_team', { p_event: tr.eventId, p_team: c.teamId, p_members: [{ user_id: p[6] }] });
    const row = await entryRow(ec);
    expect(row.status).toBe('approved');
    expect(row.side_team_id).not.toBeNull();
    expect(await db.count('public.team_players', 'team_id = $1', [row.side_team_id])).toBe(2);
  });

  it('aprobar materializa (miembro, jugador, equipo de temporada, capitán) y match_side_of da el lado solo al capitán; rechazar desmaterializa; en curso no', async () => {
    const a = await rlTeam(p[0], [p[1], p[2]], 'Alfa', 'ALF');
    const t = await createT(w.u.org, { name: 'Copa', settings: { subs: 1 } });
    await db.rpc(w.u.dios, 'upsert_push_subscription', { p_endpoint: 'https://fcm.googleapis.com/fcm/send/dios', p_p256dh: 'k', p_auth: 'a' }).catch(() => undefined);
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/org', 'k', 'a'), ($2, 'https://fcm.googleapis.com/fcm/send/p0', 'k', 'a')`, [w.u.org, p[0]]);
    const ea = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }, { user_id: p[2], role: 'sub' }] });
    expect(await db.admin<Json>(`select title, tag from public.push_outbox where user_id = $1`, [w.u.org])).toEqual([{ title: 'Alfa se inscribió en Copa', tag: `esports:pend:${t.eventId}` }]);
    await fails(db.rpc(p[0], 'esports_decide_entry', { p_entry: ea, p_approve: true }), DENIED);
    await db.rpc(w.u.org, 'esports_decide_entry', { p_entry: ea, p_approve: true, p_note: 'Bienvenidos' });
    expect(await db.admin<Json>(`select title, tag from public.push_outbox where user_id = $1`, [p[0]])).toEqual([{ title: 'Te aprobaron en Copa', tag: `esports:entry:${ea}` }]);
    const e = await entryRow(ea);
    expect(e.status).toBe('approved');
    expect(await db.admin('select name, event_id, sort_order from public.teams where id = $1', [e.side_team_id])).toEqual([{ name: 'Alfa', event_id: null, sort_order: 999 }]);
    expect(
      await db.admin(
        `select p.user_id, tp.role, tp.position from public.team_players tp join public.players p on p.id = tp.player_id where tp.team_id = $1 order by tp.role, tp.position nulls first`,
        [e.side_team_id],
      ),
    ).toEqual(
      expect.arrayContaining([
        { user_id: p[0], role: 'captain', position: null },
        { user_id: p[1], role: 'player', position: null },
        { user_id: p[2], role: 'player', position: 'suplente' },
      ]),
    );
    expect(await db.count('public.league_members', `league_id = $1 and user_id = any ($2) and role = 'member'`, [t.leagueId, [p[0], p[1], p[2]]])).toBe(3);
    expect(await db.count('public.esports_entry_members', 'entry_id = $1 and player_id is not null', [ea])).toBe(3);
    // Un partido con ese lado: su lado es del capitán; el titular no tiene lado.
    const [m] = await db.rpc<string[]>(w.u.org, 'create_matches', {
      p_league: t.leagueId,
      p_matches: [{ format: 'rocket_league', rules: { game: 'rocket_league', bestOf: 1, draws: false }, sides: [{ side: 1, team_id: e.side_team_id }, { side: 2, label: 'Otro' }] }],
    });
    expect(await db.admin<Json>('select private.match_side_of($1, $2) as c, private.match_side_of($1, $3) as m', [m, p[0], p[1]])).toEqual([{ c: 1, m: null }]);
    await db.admin('delete from public.matches where id = $1', [m]);
    // Rechazar en inscripción: se va el equipo de temporada y la foto; la membresía y el jugador se quedan.
    await db.rpc(w.u.org, 'esports_decide_entry', { p_entry: ea, p_approve: false, p_note: 'Falta un jugador' });
    expect(await entryRow(ea)).toMatchObject({ status: 'rejected', side_team_id: null, note: 'Falta un jugador' });
    expect(await db.count('public.teams', 'id = $1', [e.side_team_id])).toBe(0);
    expect(await db.count('public.esports_entry_members', 'entry_id = $1', [ea])).toBe(0);
    expect(await db.count('public.players', 'league_id = $1 and user_id = $2', [t.leagueId, p[1]])).toBe(1);
    // Se inscribe otra vez y lo aprueban; en curso ya no se rechaza ni se retira.
    const eb = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] });
    await db.rpc(w.u.org, 'esports_decide_entry', { p_entry: eb, p_approve: true });
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'live' });
    await fails(db.rpc(w.u.org, 'esports_decide_entry', { p_entry: eb, p_approve: false }), 'cerrado');
    await fails(db.rpc(p[0], 'esports_withdraw', { p_entry: eb }), 'cerrado');
  });

  it('retirarse en inscripción; cambiar la plantilla (el capitán en inscripción, el admin siempre)', async () => {
    const a = await rlTeam(p[0], [p[1], p[2]], 'Alfa', 'ALF');
    const t = await createT(w.u.org, { name: 'Copa', settings: { subs: 1, autoApprove: true } });
    const ea = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] });
    const team = (await entryRow(ea)).side_team_id;
    await db.rpc(p[0], 'esports_set_entry_roster', { p_entry: ea, p_members: [{ user_id: p[2], role: 'member' }, { user_id: p[1], role: 'sub' }] });
    expect(await db.admin('select user_id, role from public.esports_entry_members where entry_id = $1 order by user_id', [ea])).toEqual(
      [
        { user_id: p[0], role: 'captain' },
        { user_id: p[1], role: 'sub' },
        { user_id: p[2], role: 'member' },
      ].sort((x, y) => (x.user_id < y.user_id ? -1 : 1)),
    );
    expect(await db.count('public.team_players', `team_id = $1 and position = 'suplente'`, [team])).toBe(1);
    await fails(db.rpc(p[1], 'esports_set_entry_roster', { p_entry: ea, p_members: [{ user_id: p[2] }] }), DENIED);
    await fails(db.rpc(p[0], 'esports_set_entry_roster', { p_entry: ea, p_members: [{ user_id: p[5] }] }), INVALID);
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'live' });
    await fails(db.rpc(p[0], 'esports_set_entry_roster', { p_entry: ea, p_members: [{ user_id: p[1] }] }), 'cerrado');
    // El admin sí (y puede pasar la capitanía).
    await db.rpc(w.u.org, 'esports_set_entry_roster', { p_entry: ea, p_members: [{ user_id: p[1], role: 'captain' }, { user_id: p[0] }] });
    expect((await entryRow(ea)).captain_id).toBe(p[1]);
    expect(await db.count('public.team_players', 'team_id = $1', [team])).toBe(2);
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'cancelled' });
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'registration' });
    await db.rpc(p[1], 'esports_withdraw', { p_entry: ea });
    expect(await entryRow(ea)).toMatchObject({ status: 'withdrawn', side_team_id: null });
    expect(await db.count('public.esports_entry_members', 'entry_id = $1', [ea])).toBe(0);
  });

  it('check-in: el capitán solo en la ventana (cerrado fuera); el admin siempre', async () => {
    await rlId(p[0]);
    const t = await createT(w.u.org, { mode: '1v1', entry: 'open', checkin: 30, settings: { autoApprove: true } });
    const e = await db.rpc<string>(p[0], 'esports_register_solo', { p_event: t.eventId });
    expect(await entryRow(e)).toMatchObject({ kind: 'player', status: 'approved' });
    await fails(db.rpc(p[0], 'esports_check_in', { p_entry: e }), 'cerrado');
    await db.rpc(w.u.org, 'esports_check_in', { p_entry: e });
    expect((await entryRow(e)).checked_in_at).not.toBeNull();
    await db.rpc(w.u.org, 'esports_check_in', { p_entry: e, p_undo: true });
    expect((await entryRow(e)).checked_in_at).toBeNull();
    // Empieza en 10 minutos: la ventana (30 min antes) ya abrió.
    await db.admin(
      `update public.esports_tournaments set registration_closes_at = now() + interval '5 minutes', starts_at = now() + interval '10 minutes' where event_id = $1`,
      [t.eventId],
    );
    await db.rpc(p[0], 'esports_check_in', { p_entry: e });
    expect((await entryRow(e)).checked_in_at).not.toBeNull();
    await fails(db.rpc(p[1], 'esports_check_in', { p_entry: e }), DENIED);
  });

  it('agentes libres: esports_form_teams arma equipos aprobados (los agentes quedan assigned) y assign_free_agent mueve la foto', async () => {
    for (const u of p.slice(0, 6)) await rlId(u);
    const t = await createT(w.u.org, { mode: '2v2', entry: 'open', settings: { autoApprove: true, subs: 1 } });
    const fa: string[] = [];
    for (const u of p.slice(0, 6)) fa.push(await db.rpc<string>(u, 'esports_register_solo', { p_event: t.eventId }));
    expect(await db.admin(`select distinct kind, status from public.esports_entries where event_id = $1`, [t.eventId])).toEqual([{ kind: 'free_agent', status: 'approved' }]);
    // Un agente libre no tiene equipo de temporada.
    expect((await entryRow(fa[0])).side_team_id).toBeNull();
    await fails(db.rpc(p[0], 'esports_form_teams', { p_event: t.eventId, p_teams: [] }), DENIED);
    const ids = await db.rpc<string[]>(w.u.org, 'esports_form_teams', {
      p_event: t.eventId,
      p_teams: [
        { name: 'Equipo 1', members: [{ user_id: p[0], role: 'captain' }, { user_id: p[1], role: 'member' }] },
        { name: '', tag: 'e2', members: [{ user_id: p[2] }, { user_id: p[3] }] },
      ],
    });
    expect(ids).toHaveLength(2);
    expect(await entryRow(ids[1])).toMatchObject({ kind: 'team', status: 'approved', name: 'Equipo 2', tag: 'E2', captain_id: p[2], team_id: null });
    expect((await entryRow(ids[0])).side_team_id).not.toBeNull();
    expect(await entryRow(fa[0])).toMatchObject({ status: 'assigned', assigned_entry: ids[0] });
    expect(await db.admin('select entry_id, role from public.esports_entry_members where user_id = $1', [p[0]])).toEqual([{ entry_id: ids[0], role: 'captain' }]);
    // Alguien que ya no es agente libre: invalido.
    await fails(db.rpc(w.u.org, 'esports_form_teams', { p_event: t.eventId, p_teams: [{ name: 'X', members: [{ user_id: p[0] }, { user_id: p[4] }] }] }), INVALID);
    // Asignar uno de suplente a Equipo 1 (2v2 con 1 suplente); el siguiente ya no cabe.
    await db.rpc(w.u.org, 'esports_assign_free_agent', { p_free_agent: fa[4], p_entry: ids[0], p_role: 'sub' });
    expect(await entryRow(fa[4])).toMatchObject({ status: 'assigned', assigned_entry: ids[0] });
    expect(await db.count('public.esports_entry_members', 'entry_id = $1', [ids[0]])).toBe(3);
    const team = (await entryRow(ids[0])).side_team_id;
    expect(await db.count('public.team_players', `team_id = $1 and position = 'suplente'`, [team])).toBe(1);
    await fails(db.rpc(w.u.org, 'esports_assign_free_agent', { p_free_agent: fa[5], p_entry: ids[0] }), 'cupo_lleno');
  });
});

/** Cuatro individuales de Rocket League 1v1 aprobados y sembrados (doble eliminación). */
async function fourPlayers(settings: Json = {}) {
  for (const u of p.slice(0, 4)) await rlId(u);
  const t = await createT(w.u.org, { mode: '1v1', entry: 'open', format: 'double_elim', settings: { autoApprove: true, ...settings } });
  const entries: string[] = [];
  for (const u of p.slice(0, 4)) entries.push(await db.rpc<string>(u, 'esports_register_solo', { p_event: t.eventId }));
  await db.rpc(w.u.org, 'esports_set_seeds', { p_event: t.eventId, p_order: entries });
  return { t, entries };
}

/** El plan de doble eliminación de 4 (W1-1 1v4, W1-2 2v3, W2-1, L1-1, L2-1, GF y GF2) con ids. */
function dePlan(e: string[], bestOf = 1) {
  const id = Object.fromEntries(['W1-1', 'W1-2', 'W2-1', 'L1-1', 'L2-1', 'GF', 'GF2'].map((k) => [k, randomUUID()]));
  const ent = (x: string) => ({ entry_id: x, label: '' });
  const src = (label: string) => ({ entry_id: null, label });
  const m = (key: string, part: string, round: number, stage: string, s: [Json, Json], winner: [string, number] | null, loser: [string, number] | null) => ({
    id: id[key], key, part, round, group_no: null, stage, best_of: bestOf, scheduled_at: null,
    sides: [{ side: 1, ...s[0] }, { side: 2, ...s[1] }],
    winner_to: winner ? { id: id[winner[0]], side: winner[1] } : null,
    loser_to: loser ? { id: id[loser[0]], side: loser[1] } : null,
  });
  const plan = [
    m('W1-1', 'W', 1, 'Ganadores · Semifinal', [ent(e[0]), ent(e[3])], ['W2-1', 1], ['L1-1', 1]),
    m('W1-2', 'W', 1, 'Ganadores · Semifinal', [ent(e[1]), ent(e[2])], ['W2-1', 2], ['L1-1', 2]),
    m('W2-1', 'W', 2, 'Final de ganadores', [src('Ganador W1-1'), src('Ganador W1-2')], ['GF', 1], ['L2-1', 2]),
    m('L1-1', 'L', 1, 'Perdedores · Ronda 1', [src('Perdedor W1-1'), src('Perdedor W1-2')], ['L2-1', 1], null),
    m('L2-1', 'L', 2, 'Final de perdedores', [src('Ganador L1-1'), src('Perdedor W2-1')], ['GF', 2], null),
    m('GF', 'GF', 1, 'Gran final', [src('Ganador W2-1'), src('Ganador L2-1')], null, null),
    m('GF2', 'GF2', 1, 'Gran final · reinicio', [src('Por definir'), src('Por definir')], null, null),
  ];
  return { id, plan };
}

const RL1 = (a: number, b: number) => score([{ a, b }], 1);

describe('fases y cuadro', () => {
  it('esports_create_stage: doble eliminación de 4 con sus enlaces, formato y reglas; el torneo pasa a live', async () => {
    const { t, entries } = await fourPlayers();
    const { id, plan } = dePlan(entries);
    await fails(db.rpc(p[0], 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: plan }), DENIED);
    await fails(db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'groups', p_matches: plan }), INVALID);
    // Un enlace a un partido que no es del lote.
    const bad = structuredClone(plan);
    bad[0].winner_to = { id: randomUUID(), side: 1 };
    await fails(db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: bad }), INVALID);
    // Un mejor de que el juego no tiene, y un inscrito que no es del torneo.
    const bo2 = structuredClone(plan);
    bo2[0].best_of = 2;
    await fails(db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: bo2 }), INVALID);
    const stranger = structuredClone(plan);
    (stranger[0].sides[0] as Json).entry_id = randomUUID();
    await fails(db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: stranger }), INVALID);

    const ids = await db.rpc<string[]>(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: plan });
    expect(ids).toEqual(plan.map((x) => x.id));
    expect((await tRow(t.eventId)).status).toBe('live');
    const w11 = await matchRow(id['W1-1']);
    expect(w11).toMatchObject({ format: 'rocket_league', rules: { game: 'rocket_league', bestOf: 1, draws: false }, bracket_key: 'W1-1', stage: 'Ganadores · Semifinal', event_id: t.eventId, status: 'scheduled' });
    const e0 = await entryRow(entries[0]);
    expect((await sides(id['W1-1']))[0]).toMatchObject({ team_id: e0.side_team_id, label: e0.name });
    expect((await sides(id['W2-1'])).map((s) => s.label)).toEqual(['Ganador W1-1', 'Ganador W1-2']);
    expect(await db.admin('select part, winner_to, winner_side, loser_to, loser_side from public.esports_matches where match_id = $1', [id['W1-1']])).toEqual([
      { part: 'W', winner_to: id['W2-1'], winner_side: 1, loser_to: id['L1-1'], loser_side: 1 },
    ]);
    // La fase otra vez: duplicado. Borrarla (sin resultados) vuelve el torneo a inscripción.
    await fails(db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: dePlan(entries).plan }), 'duplicado');
    await db.rpc(w.u.org, 'esports_delete_stage', { p_event: t.eventId, p_stage: 'bracket' });
    expect((await tRow(t.eventId)).status).toBe('registration');
    expect(await db.count('public.esports_matches', 'event_id = $1', [t.eventId])).toBe(0);
  });

  it('el cuadro avanza: ganador a W2-1 y perdedor a L1-1 al confirmar; corregir con W2-1 jugado: cerrado; gran final con y sin reinicio', async () => {
    const { t, entries } = await fourPlayers();
    const { id, plan } = dePlan(entries);
    await db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: plan });
    const team = async (i: number) => (await entryRow(entries[i])).side_team_id;
    // W1-1 (1 contra 4): anota el jugador 1 y lo confirma el 4.
    await db.rpc(p[0], 'finish_match', { p_match: id['W1-1'], p_score: RL1(3, 1), p_winner: 1 });
    expect((await sides(id['W2-1']))[0].team_id).toBeNull();
    const version = async (k: string) => (await matchRow(id[k])).version as number;
    const [v21, vl11] = [await version('W2-1'), await version('L1-1')];
    await db.rpc(p[3], 'confirm_result', { p_match: id['W1-1'] });
    // Los partidos destino suben de versión (quien baja solo lo que cambió ve llegar al ganador y al perdedor).
    expect(await version('W2-1')).toBeGreaterThan(v21);
    expect(await version('L1-1')).toBeGreaterThan(vl11);
    expect((await sides(id['W2-1']))[0]).toMatchObject({ team_id: await team(0), label: 'Jugador 1' });
    expect((await sides(id['L1-1']))[0]).toMatchObject({ team_id: await team(3), label: 'Jugador 4' });
    // W1-2 (2 contra 3) lo anota el admin: queda confirmado y avanza.
    await db.rpc(w.u.org, 'finish_match', { p_match: id['W1-2'], p_score: RL1(0, 2), p_winner: 2 });
    expect((await sides(id['W2-1']))[1].team_id).toBe(await team(2));
    expect((await sides(id['L1-1']))[1].team_id).toBe(await team(1));
    // W2-1 se juega; corregir W1-1 (que ganara el 4) ya no se puede.
    await db.rpc(w.u.org, 'finish_match', { p_match: id['W2-1'], p_score: RL1(2, 1), p_winner: 1 });
    await fails(db.rpc(w.u.org, 'admin_correct_result', { p_match: id['W1-1'], p_score: RL1(1, 3), p_winner: 2 }), 'cerrado: cuadro');
    expect((await matchRow(id['W1-1'])).winner_side).toBe(1);
    // L1-1 y L2-1.
    await db.rpc(w.u.org, 'finish_match', { p_match: id['L1-1'], p_score: RL1(4, 2), p_winner: 1 });
    expect((await sides(id['L2-1'])).map((s) => s.team_id)).toEqual([await team(3), await team(2)]);
    await db.rpc(w.u.org, 'finish_match', { p_match: id['L2-1'], p_score: RL1(1, 0), p_winner: 1 });
    expect((await sides(id['GF'])).map((s) => s.team_id)).toEqual([await team(0), await team(3)]);
    // Gana el que viene de perdedores (lado 2): el reinicio se juega con los dos (y sube de versión).
    const vgf2 = await version('GF2');
    await db.rpc(w.u.org, 'finish_match', { p_match: id['GF'], p_score: RL1(1, 2), p_winner: 2 });
    expect(await version('GF2')).toBeGreaterThan(vgf2);
    expect((await sides(id['GF2'])).map((s) => s.team_id)).toEqual([await team(0), await team(3)]);
    expect((await matchRow(id['GF2'])).status).toBe('scheduled');
    // Corregido: gana el invicto (lado 1) → el reinicio no hizo falta.
    await db.rpc(w.u.org, 'admin_correct_result', { p_match: id['GF'], p_score: RL1(3, 0), p_winner: 1 });
    expect(await matchRow(id['GF2'])).toMatchObject({ status: 'void', note: 'No hizo falta: ganó el invicto.' });
    // Y si vuelve a ganar el de perdedores, el reinicio vuelve.
    await db.rpc(w.u.org, 'admin_correct_result', { p_match: id['GF'], p_score: RL1(0, 3), p_winner: 2 });
    expect((await matchRow(id['GF2'])).status).toBe('scheduled');
  });

  it('W.O.: su forma, y el que vino pasa; esports_sync aplica uno propuesto hace 49 h', async () => {
    const { t, entries } = await fourPlayers();
    const { id, plan } = dePlan(entries);
    await db.rpc(w.u.org, 'esports_create_stage', { p_event: t.eventId, p_stage: 'bracket', p_matches: plan });
    await fails(db.rpc(w.u.org, 'set_walkover', { p_match: id['W1-1'], p_absent: 2, p_score: wo(1, 1) }), INVALID);
    await fails(db.rpc(w.u.org, 'set_walkover', { p_match: id['W1-1'], p_absent: 2, p_score: RL1(3, 0) }), INVALID);
    await db.rpc(w.u.org, 'set_walkover', { p_match: id['W1-1'], p_absent: 2, p_score: wo(2, 1) });
    expect((await sides(id['W2-1']))[0].team_id).toBe((await entryRow(entries[0])).side_team_id);
    // W1-2 lo propone el jugador 2 y nadie confirma: a las 48 h cuenta solo; esports_sync lo aplica.
    await db.rpc(p[1], 'finish_match', { p_match: id['W1-2'], p_score: RL1(3, 2), p_winner: 1 });
    expect(await db.rpc(p[1], 'esports_sync', { p_event: t.eventId })).toBe(0);
    await db.admin(`update public.matches set proposed_at = now() - interval '49 hours' where id = $1`, [id['W1-2']]);
    await fails(db.rpc(w.u.extra, 'esports_sync', { p_event: t.eventId }), DENIED);
    expect(await db.rpc(p[1], 'esports_sync', { p_event: t.eventId })).toBe(2);
    expect((await sides(id['W2-1']))[1].team_id).toBe((await entryRow(entries[1])).side_team_id);
    expect(await db.rpc(w.u.org, 'esports_sync', { p_event: t.eventId })).toBe(0);
    // Una fase con resultados no se borra.
    await fails(db.rpc(w.u.org, 'esports_delete_stage', { p_event: t.eventId, p_stage: 'bracket' }), 'cerrado');
  });
});

describe('el marcador de una serie (private.esp_series_ok, las filas de series.ts)', () => {
  const VAL1 = { game: 'valorant', bestOf: 1, draws: false };
  const VAL3 = { game: 'valorant', bestOf: 3, draws: false };
  const CS1 = { game: 'cs2', bestOf: 1, draws: false };
  const RL5 = { game: 'rocket_league', bestOf: 5, draws: false };
  const FC1L = { game: 'ea_fc', bestOf: 1, draws: true };
  const FC1K = { game: 'ea_fc', bestOf: 1, draws: false };
  // [caso, reglas, juegos, ¿final válido?, ganador]
  const ROWS: [string, Json, G[], boolean, 1 | 2 | null][] = [
    ['VALORANT Bo1 13-11', VAL1, [{ a: 13, b: 11 }], true, 1],
    ['VALORANT Bo1 13-12', VAL1, [{ a: 13, b: 12 }], false, 1],
    ['VALORANT Bo1 14-12', VAL1, [{ a: 14, b: 12 }], true, 1],
    ['VALORANT Bo1 15-13', VAL1, [{ a: 15, b: 13 }], true, 1],
    ['VALORANT Bo1 20-18', VAL1, [{ a: 20, b: 18 }], true, 1],
    ['VALORANT Bo1 14-11', VAL1, [{ a: 14, b: 11 }], false, 1],
    ['VALORANT Bo1 15-12', VAL1, [{ a: 15, b: 12 }], false, 1],
    ['CS2 Bo1 13-11', CS1, [{ a: 13, b: 11 }], true, 1],
    ['CS2 Bo1 16-14', CS1, [{ a: 16, b: 14 }], true, 1],
    ['CS2 Bo1 16-12', CS1, [{ a: 16, b: 12 }], true, 1],
    ['CS2 Bo1 19-17', CS1, [{ a: 19, b: 17 }], true, 1],
    ['CS2 Bo1 13-12', CS1, [{ a: 13, b: 12 }], false, 1],
    ['CS2 Bo1 16-11', CS1, [{ a: 16, b: 11 }], false, 1],
    ['CS2 Bo1 17-15', CS1, [{ a: 17, b: 15 }], false, 1],
    ['CS2 Bo1 15-13', CS1, [{ a: 15, b: 13 }], false, 1],
    ['VALORANT Bo3 13-9, 7-13, 13-11', VAL3, [{ a: 13, b: 9 }, { a: 7, b: 13 }, { a: 13, b: 11 }], true, 1],
    ['VALORANT Bo3 13-9, 13-7, 13-11 (sobra el 3.º)', VAL3, [{ a: 13, b: 9 }, { a: 13, b: 7 }, { a: 13, b: 11 }], false, 1],
    ['VALORANT Bo3 13-9 (final)', VAL3, [{ a: 13, b: 9 }], false, 1],
    ['LoL Bo3 w1 (kills 10-25), w2, w1', { game: 'lol', bestOf: 3, draws: false }, [{ w: 1, a: 10, b: 25 }, { w: 2 }, { w: 1 }], true, 1],
    ['Rocket League Bo5 3-2 ot, 1-4, 2-0, 0-1, 4-3 ot', RL5, [{ a: 3, b: 2, ot: true }, { a: 1, b: 4 }, { a: 2, b: 0 }, { a: 0, b: 1 }, { a: 4, b: 3, ot: true }], true, 1],
    ['Rocket League Bo5 3-1 ot', RL5, [{ a: 3, b: 1, ot: true }], false, 1],
    ['Rocket League Bo5 2-2', RL5, [{ a: 2, b: 2 }], false, null],
    ['FC Bo1 liga con empates 2-2', FC1L, [{ a: 2, b: 2 }], true, null],
    ['FC Bo1 eliminatoria 2-2', FC1K, [{ a: 2, b: 2 }], false, null],
    ['FC Bo1 eliminatoria 2-2 pen 4-3', FC1K, [{ a: 2, b: 2, pa: 4, pb: 3 }], true, 1],
    ['FC Bo1 3-1 pen 4-3', FC1K, [{ a: 3, b: 1, pa: 4, pb: 3 }], false, 1],
    ['NBA 2K Bo1 98-91', { game: 'nba_2k', bestOf: 1, draws: false }, [{ a: 98, b: 91 }], true, 1],
    ['SF6 Bo3 (rtw 2) w1 2-1, w2 0-2, w1 2-0', { game: 'sf6', bestOf: 3, draws: false, roundsToWin: 2 }, [{ w: 1, a: 2, b: 1 }, { w: 2, a: 0, b: 2 }, { w: 1, a: 2, b: 0 }], true, 1],
    ['SF6 Bo3 w1 3-1', { game: 'sf6', bestOf: 3, draws: false, roundsToWin: 2 }, [{ w: 1, a: 3, b: 1 }], false, 1],
    ['TEKKEN 8 Bo3 (rtw 3) w2 1-3, w2 2-3', { game: 'tekken8', bestOf: 3, draws: false, roundsToWin: 3 }, [{ w: 2, a: 1, b: 3 }, { w: 2, a: 2, b: 3 }], true, 2],
    ['Smash Bo3 (3 vidas) w1 2-0, w1 1-0', { game: 'smash', bestOf: 3, draws: false, stocks: 3 }, [{ w: 1, a: 2, b: 0 }, { w: 1, a: 1, b: 0 }], true, 1],
    ['Smash Bo3 w1 0-1', { game: 'smash', bestOf: 3, draws: false, stocks: 3 }, [{ w: 1, a: 0, b: 1 }], false, 1],
    ['Clash Royale Bo3 w1 3-1, w2 1-1, w1 2-0', { game: 'clash_royale', bestOf: 3, draws: false }, [{ w: 1, a: 3, b: 1 }, { w: 2, a: 1, b: 1 }, { w: 1, a: 2, b: 0 }], true, 1],
    ['Clash Royale Bo3 w2 2-1', { game: 'clash_royale', bestOf: 3, draws: false }, [{ w: 2, a: 2, b: 1 }], false, 2],
  ];

  it.each(ROWS)('%s', async (_case, rules, games, ok, winner) => {
    expect(await seriesOk(score(games, rules.bestOf), rules, true, winner)).toBe(ok);
  });

  it('en vivo se revisan los mapas, la serie, los totales y el mejor de (no el final); W.O. con su forma', async () => {
    expect(await seriesOk(score([{ a: 13, b: 9 }], 3), VAL3, false, null)).toBe(true);
    expect(await seriesOk(score([{ a: 13, b: 12 }], 3), VAL3, false, null)).toBe(false);
    // El ganador tiene que cuadrar; el mejor de, los lados y los totales también.
    expect(await seriesOk(score([{ a: 13, b: 9 }, { a: 7, b: 13 }, { a: 13, b: 11 }], 3), VAL3, true, 2)).toBe(false);
    expect(await seriesOk(score([{ a: 13, b: 9 }], 1), VAL3, false, null)).toBe(false);
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), sides: [0, 1] }, VAL1, true, 1)).toBe(false);
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), totals: { maps: [1, 0], points: [13, 8] } }, VAL1, true, 1)).toBe(false);
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), extra: 1 }, VAL1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 13, b: 9, map: 'ascent' }], 1), VAL1, true, 1)).toBe(true);
    expect(await seriesOk(score([{ a: 13, b: 9, map: 'Ascent!' }], 1), VAL1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 13, b: 9, ot: true }], 1), VAL1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 13, b: 9, w: 2 }], 1), VAL1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 13.5, b: 9 }], 1), VAL1, true, 1)).toBe(false);
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), proof: ['x'] }, VAL1, true, 1)).toBe(false);
    // W.O. del lado 2 al mejor de 3: [2, 0]; con el lado que no vino, tiene que cuadrar (como seriesScoreOk).
    expect(wo(2, 3)).toMatchObject({ sides: [2, 0], wo: true, text: 'W.O.' });
    expect(await seriesOk(wo(2, 3), VAL3, true, 1, 2)).toBe(true);
    expect(await seriesOk(wo(2, 3), VAL3, true, 1, 1)).toBe(false);
    expect(await seriesOk(wo(2, 3), VAL3, true, 1)).toBe(true);
    expect(await seriesOk(wo(0, 3), VAL3, true, null, 0)).toBe(true);
    expect(await seriesOk({ ...wo(2, 3), sides: [1, 0], totals: { maps: [1, 0], points: [0, 0] } }, VAL3, true, 1)).toBe(false);
    expect(await seriesOk({ ...wo(2, 3), text: '2-0' }, VAL3, true, 1, 2)).toBe(false);
    expect(await seriesOk({ ...wo(2, 3), wo: false }, VAL3, true, 1, 2)).toBe(false);
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), wo: false }, VAL1, true, 1)).toBe(false);
    // Cada mapa como inspect de series.ts: null = no vino; a y b juntos; ot (aunque sea false) solo en Rocket League;
    // el mapa libre de 1 a 24 sin quedar en blanco; números enteros de cualquier tamaño sin romper nada.
    const LOL3 = { game: 'lol', bestOf: 3, draws: false };
    const RL1R = { game: 'rocket_league', bestOf: 1, draws: false };
    const NBA1 = { game: 'nba_2k', bestOf: 1, draws: false };
    expect(await seriesOk(score([{ a: 13, b: 9, w: null }], 1), VAL1, true, 1)).toBe(true);
    expect(await seriesOk(score([{ a: 13, b: 9, ot: false }], 1), VAL1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 3, b: 2, ot: false }], 1), RL1R, true, 1)).toBe(true);
    expect(await seriesOk(score([{ w: 1, a: 10 } as G], 3), LOL3, false, null)).toBe(false);
    expect(await seriesOk(score([{ w: null, a: 10, b: 2 }], 3), LOL3, false, null)).toBe(false);
    expect(await seriesOk(score([{ a: 98, b: 91, map: 'Cancha 1' }], 1), NBA1, true, 1)).toBe(true);
    expect(await seriesOk(score([{ a: 98, b: 91, map: '   ' }], 1), NBA1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 98, b: 91, map: 'x'.repeat(25) }], 1), NBA1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 1e20, b: 91 }], 1), NBA1, true, 1)).toBe(false);
    expect(await seriesOk(score([{ a: 13, b: 9, pa: 1, pb: 0 }], 1), VAL1, true, 1)).toBe(false);
    // Sin juegos (y sin W.O.) nunca vale; las pruebas null tampoco.
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), games: [], sides: [0, 0], totals: { maps: [0, 0], points: [0, 0] } }, VAL1, false, null)).toBe(false);
    expect(await seriesOk({ ...score([{ a: 13, b: 9 }], 1), proof: null }, VAL1, true, 1)).toBe(false);
  });

  it('finish_match: VALORANT 13-12 no pasa; el FC empata solo en grupos o liga al mejor de 1; pruebas solo con fotos de la liga', async () => {
    for (const u of p.slice(0, 2)) await setId(u, 'valorant', `Jugador${u.slice(0, 4)}#LAN`);
    const l = await db.rpc<{ league_id: string }>(w.u.org, 'create_league', { p_name: 'Liga VAL', p_sport: 'esports', p_rules: { game: 'valorant' }, p_visibility: 'public' });
    const team = async (name: string) => (await db.rpc<string>(w.u.org, 'create_season_team', { p_league: l.league_id, p_name: name }));
    const [ta, tb] = [await team('A'), await team('B')];
    const mk = (rules: Json, format = 'valorant') =>
      db.rpc<string[]>(w.u.org, 'create_matches', { p_league: l.league_id, p_matches: [{ format, rules, sides: [{ side: 1, team_id: ta }, { side: 2, team_id: tb }] }] });
    // Las reglas: del juego de la liga, con un mejor de permitido.
    await fails(mk({ game: 'valorant' }), INVALID);
    await fails(mk({ game: 'cs2', bestOf: 1, draws: false }, 'cs2'), INVALID);
    await fails(mk({ game: 'valorant', bestOf: 7, draws: false }), INVALID);
    await fails(mk({ game: 'valorant', bestOf: 1, draws: true }), INVALID);
    const [m1] = await mk(VAL1);
    await fails(db.rpc(w.u.org, 'finish_match', { p_match: m1, p_score: score([{ a: 13, b: 12 }], 1), p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.org, 'finish_match', { p_match: m1, p_score: score([{ a: 13, b: 11 }], 1), p_winner: 2 }), INVALID);
    await fails(db.rpc(w.u.org, 'finish_match', { p_match: m1, p_score: score([{ a: 13, b: 11 }], 1), p_winner: null }), INVALID);
    // Pruebas: una foto de otra liga no; una de esta, sí.
    const other = randomUUID();
    await db.admin(`insert into public.photos (id, league_id, path) values ($1, $2, $3)`, [other, w.pub, `${w.pub}/${other}.webp`]);
    await fails(db.rpc(w.u.org, 'finish_match', { p_match: m1, p_score: score([{ a: 13, b: 11 }], 1, { proof: [other] }), p_winner: 1 }), INVALID);
    const mine = (await db.rpc<{ id: string }>(w.u.org, 'add_photo', { p_league: l.league_id })).id;
    await db.rpc(w.u.org, 'finish_match', { p_match: m1, p_score: score([{ a: 13, b: 11 }], 1, { proof: [mine] }), p_winner: 1 });
    expect(await matchRow(m1)).toMatchObject({ status: 'confirmed', winner_side: 1 });

    // EA SPORTS FC: el empate solo con draws (grupos o liga al mejor de 1).
    const fc = await db.rpc<{ league_id: string }>(w.u.org, 'create_league', { p_name: 'Liga FC', p_sport: 'esports', p_rules: { game: 'ea_fc' } });
    const [fa, fb] = [
      await db.rpc<string>(w.u.org, 'create_season_team', { p_league: fc.league_id, p_name: 'A' }),
      await db.rpc<string>(w.u.org, 'create_season_team', { p_league: fc.league_id, p_name: 'B' }),
    ];
    const fcm = async (rules: Json) =>
      (await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: fc.league_id, p_matches: [{ format: 'ea_fc', rules, sides: [{ side: 1, team_id: fa }, { side: 2, team_id: fb }] }] }))[0];
    const liga = await fcm(FC1L);
    await db.rpc(w.u.org, 'finish_match', { p_match: liga, p_score: score([{ a: 2, b: 2 }], 1), p_winner: null });
    expect(await matchRow(liga)).toMatchObject({ status: 'confirmed', winner_side: null });
    const ko = await fcm(FC1K);
    await fails(db.rpc(w.u.org, 'finish_match', { p_match: ko, p_score: score([{ a: 2, b: 2 }], 1), p_winner: null }), INVALID);
    await db.rpc(w.u.org, 'finish_match', { p_match: ko, p_score: score([{ a: 2, b: 2, pa: 4, pb: 3 }], 1), p_winner: 1 });
    // Al mejor de 3 no hay empates (las reglas no lo dejan).
    await fails(fcm({ game: 'ea_fc', bestOf: 3, draws: true }), INVALID);
    // Nadie escribe directo, ni con la clave secreta se salta la regla.
    await fails(db.asService(`update public.matches set score = $2 where id = $1`, [ko, score([{ a: 2, b: 2 }], 1)]), INVALID);
  });

  it('esports_create_stage arma las reglas: FC con empates solo en la liga al mejor de 1; pelea y vidas del torneo', async () => {
    for (const u of p.slice(0, 4)) await setId(u, 'ea_fc', `FCjugador${u.slice(0, 4)}`);
    const t = await createT(w.u.org, { game: 'ea_fc', mode: '1v1', entry: 'open', format: 'round_robin', settings: { autoApprove: true } });
    const e: string[] = [];
    for (const u of p.slice(0, 4)) e.push(await db.rpc<string>(u, 'esports_register_solo', { p_event: t.eventId }));
    const mid = randomUUID();
    await db.rpc(w.u.org, 'esports_create_stage', {
      p_event: t.eventId,
      p_stage: 'league',
      p_matches: [{ id: mid, key: 'RR-R1-1', part: 'G', round: 1, group_no: 0, stage: 'Jornada 1', best_of: 1, sides: [{ side: 1, entry_id: e[0] }, { side: 2, entry_id: e[1] }], winner_to: null, loser_to: null }],
    });
    expect((await matchRow(mid)).rules).toEqual({ game: 'ea_fc', bestOf: 1, draws: true });
    await db.rpc(p[0], 'finish_match', { p_match: mid, p_score: score([{ a: 1, b: 1 }], 1), p_winner: null });
    expect((await matchRow(mid)).status).toBe('finished');
    await db.rpc(p[1], 'confirm_result', { p_match: mid });
    expect(await matchRow(mid)).toMatchObject({ status: 'confirmed', winner_side: null });

    for (const u of p.slice(4, 6)) await setId(u, 'tekken8', `ABCD-EFGH-${u.slice(0, 4).replace(/[^a-z0-9]/gi, 'x')}`);
    const tk = await createT(w.u.org, { game: 'tekken8', mode: '1v1', entry: 'open', format: 'single_elim', settings: { autoApprove: true, roundsToWin: 2 } });
    const k: string[] = [];
    for (const u of p.slice(4, 6)) k.push(await db.rpc<string>(u, 'esports_register_solo', { p_event: tk.eventId }));
    const fid = randomUUID();
    await db.rpc(w.u.org, 'esports_create_stage', {
      p_event: tk.eventId,
      p_stage: 'bracket',
      p_matches: [{ id: fid, key: 'W1-1', part: 'W', round: 1, stage: 'Final', best_of: 3, sides: [{ side: 1, entry_id: k[0] }, { side: 2, entry_id: k[1] }] }],
    });
    expect((await matchRow(fid)).rules).toEqual({ game: 'tekken8', bestOf: 3, draws: false, roundsToWin: 2 });
    // A 2 rondas: 3-1 ya no vale.
    await fails(db.rpc(w.u.org, 'finish_match', { p_match: fid, p_score: score([{ w: 1, a: 3, b: 1 }, { w: 1, a: 3, b: 0 }], 3), p_winner: 1 }), INVALID);
    await db.rpc(w.u.org, 'finish_match', { p_match: fid, p_score: score([{ w: 1, a: 2, b: 1 }, { w: 1, a: 2, b: 0 }], 3), p_winner: 1 });
  });
});

describe('battle royale', () => {
  async function brT() {
    for (const u of p.slice(0, 3)) await setId(u, 'fortnite', `Fortnite ${u.slice(0, 6)}`);
    const t = await createT(w.u.org, { game: 'fortnite', mode: 'solo', entry: 'open', format: 'br', max: 10, settings: { autoApprove: true } });
    const e: string[] = [];
    for (const u of p.slice(0, 3)) e.push(await db.rpc<string>(u, 'esports_register_solo', { p_event: t.eventId }));
    return { t, e };
  }

  it('esports_br_save_game: puestos sin repetir, el anotador puede y un jugador no; reemplaza los resultados', async () => {
    const { t, e } = await brT();
    const game = (results: Json[], extra: Json = {}) => ({ round: 1, game_no: 1, map: 'Isla', results, ...extra });
    await fails(db.rpc(p[0], 'esports_br_save_game', { p_event: t.eventId, p_game: game([]) }), DENIED);
    await fails(db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: game([{ entry_id: e[0], placement: 1, kills: 3 }, { entry_id: e[1], placement: 1, kills: 0 }]) }), INVALID);
    await fails(db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: game([{ entry_id: e[0], placement: 4, kills: 0 }]) }), INVALID);
    await fails(db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: game([{ entry_id: e[0], placement: 1, kills: 201 }]) }), INVALID);
    await fails(db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: game([{ entry_id: randomUUID(), placement: 1, kills: 0 }]) }), INVALID);
    const gid = await db.rpc<string>(w.u.org, 'esports_br_save_game', {
      p_event: t.eventId,
      p_game: game([{ entry_id: e[0], placement: 1, kills: 3 }, { entry_id: e[1], placement: 2, kills: 1 }, { entry_id: e[2], placement: null, kills: 0 }]),
    });
    expect(await db.admin('select status, round, game_no, map from public.esports_br_games where id = $1', [gid])).toEqual([{ status: 'finished', round: 1, game_no: 1, map: 'Isla' }]);
    expect((await tRow(t.eventId)).status).toBe('live');
    // Un anotador de la liga también; reemplaza lo de esa partida.
    await member(db, t.leagueId, w.u.ana, 'member', 'ana', true);
    await db.rpc(w.u.ana, 'esports_br_save_game', { p_event: t.eventId, p_game: game([{ entry_id: e[2], placement: 1, kills: 5 }], { id: gid }) });
    expect(await db.admin('select entry_id, placement, kills from public.esports_br_results where game_id = $1', [gid])).toEqual([{ entry_id: e[2], placement: 1, kills: 5 }]);
    // La misma ronda y partida con otro id: duplicado.
    await fails(db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: game([], { id: randomUUID() }) }), 'duplicado');
    // Anular y borrar (solo el admin).
    await db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: { id: gid, round: 1, game_no: 1, status: 'void' } });
    expect((await db.admin<Json>('select status from public.esports_br_games where id = $1', [gid]))[0].status).toBe('void');
    await fails(db.rpc(w.u.ana, 'esports_br_delete_game', { p_game: gid }), DENIED);
    await db.rpc(w.u.org, 'esports_br_delete_game', { p_game: gid });
    expect(await db.count('public.esports_br_results', 'game_id = $1', [gid])).toBe(0);
  });

  it('un torneo que no es BR no tiene partidas', async () => {
    const t = await createT(w.u.org);
    await fails(db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: { round: 1, game_no: 1 } }), INVALID);
  });
});

describe('lo que se lee', () => {
  it('esports_hub sin cuenta ve los públicos (no los privados ni los cancelados); el miembro de uno privado lo ve', async () => {
    const pub = await createT(w.u.org, { name: 'Pública' });
    const priv = await createT(w.u.org, { name: 'Privada', visibility: 'private' });
    const canc = await createT(w.u.org, { name: 'Cancelada' });
    await db.rpc(w.u.org, 'esports_set_status', { p_event: canc.eventId, p_status: 'cancelled' });
    await rlTeam(p[0], [p[1]], 'Hub Team');
    const anon = await db.rpc<Json>(ANON, 'esports_hub', { p_game: 'rocket_league' });
    expect(anon.tournaments.map((x: Json) => x.eventId)).toEqual([pub.eventId]);
    expect(anon.tournaments[0]).toMatchObject({ name: 'Pública', leagueName: 'Pública', visibility: 'public', mode: '2v2', entryType: 'teams', status: 'registration', maxEntries: 8, approved: 0, pending: 0 });
    expect(anon.teams).toEqual([{ id: expect.any(String), name: 'Hub Team', tag: 'RLT', logoPath: null, memberCount: 2 }]);
    expect((await db.rpc<Json>(ANON, 'esports_hub', { p_game: 'valorant' })).tournaments).toEqual([]);
    await fails(db.rpc(ANON, 'esports_hub', { p_game: 'tetris' }), INVALID);
    await db.rpc(p[2], 'join_league', { p_code: priv.inviteCode });
    expect((await db.rpc<Json>(p[2], 'esports_hub', { p_game: 'rocket_league' })).tournaments.map((x: Json) => x.name).sort()).toEqual(['Privada', 'Pública']);
  });

  it('esports_my_entries: las suyas por la foto o como capitán', async () => {
    const a = await rlTeam(p[0], [p[1]], 'Mías', 'MIA');
    const t = await createT(w.u.org, { name: 'Copa' });
    const e = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: a.teamId, p_members: [{ user_id: p[1] }] });
    expect(await db.rpc(p[1], 'esports_my_entries')).toEqual([
      expect.objectContaining({ entryId: e, eventId: t.eventId, tournament: 'Copa', game: 'rocket_league', entryStatus: 'pending', tournamentStatus: 'registration', entryName: 'Mías', role: 'member', kind: 'team' }),
    ]);
    expect((await db.rpc<Json[]>(p[0], 'esports_my_entries'))[0].role).toBe('captain');
    expect(await db.rpc(p[2], 'esports_my_entries')).toEqual([]);
  });

  it('RLS: un visitante lee torneos, inscritos, enlaces y partidas de uno público; no los miembros de equipos ni los IDs; nadie escribe directo', async () => {
    const { t, e } = await (async () => {
      for (const u of p.slice(0, 2)) await setId(u, 'fortnite', `Fortnite ${u.slice(0, 6)}`);
      const t = await createT(w.u.org, { game: 'fortnite', mode: 'solo', entry: 'open', format: 'br', max: 10, settings: { autoApprove: true } });
      const e: string[] = [];
      for (const u of p.slice(0, 2)) e.push(await db.rpc<string>(u, 'esports_register_solo', { p_event: t.eventId }));
      return { t, e };
    })();
    await db.rpc(w.u.org, 'esports_br_save_game', { p_event: t.eventId, p_game: { round: 1, game_no: 1, results: [{ entry_id: e[0], placement: 1, kills: 2 }] } });
    expect(await db.asAnon('select event_id from public.esports_tournaments')).toEqual([{ event_id: t.eventId }]);
    expect(await db.asAnon('select id from public.esports_entries where event_id = $1', [t.eventId])).toHaveLength(2);
    expect(await db.asAnon('select user_id from public.esports_entry_members where event_id = $1', [t.eventId])).toHaveLength(2);
    expect(await db.asAnon('select game_id from public.esports_br_results')).toHaveLength(1);
    expect(await db.asAnon('select id from public.esports_br_games')).toHaveLength(1);
    expect(await db.asAnon('select match_id from public.esports_matches')).toEqual([]);
    await fails(db.asAnon('select user_id from public.esports_team_members'), '42501');
    await fails(db.asAnon('select user_id from public.esports_game_ids'), '42501');
    // Privado: alguien de fuera no lo ve.
    const priv = await createT(w.u.org, { name: 'Privado', visibility: 'private' });
    expect(await db.asUser(w.u.extra, 'select event_id from public.esports_tournaments where event_id = $1', [priv.eventId])).toEqual([]);
    expect(await db.asUser(w.u.org, 'select event_id from public.esports_tournaments where event_id = $1', [priv.eventId])).toHaveLength(1);
    for (const sql of [
      `update public.esports_tournaments set max_entries = 99`,
      `delete from public.esports_entries`,
      `update public.esports_teams set name = 'x'`,
      `insert into public.esports_game_ids (user_id, game, id_display, id_normalized) values ('${p[0]}', 'lol', 'Abc#LAN', 'abc#lan')`,
    ]) {
      await fails(db.asUser(w.u.org, sql), '42501');
    }
    // El tiempo real avisa 'esports' en la liga y el evento.
    const sent = await db.admin<{ n: number }>(`select count(*)::int as n from pg_catalog.pg_proc where proname = 'esp_emit'`);
    expect(sent[0].n).toBe(1);
  });
});
