/**
 * Perfiles, equipos como perfil, compartir partidos y plataformas de esports (20261012000100_perfiles_equipos_esports.sql;
 * contrato en docs/perfiles-equipos-esports.md): player_places (lo que ve cada quien, menores, bloqueos, el resumen por
 * familia, equipos y equipos de esports), create_post con cada tipo de juego y post_json.game / hasGame, squad_page
 * (posts y likes), squad_posts sin sesión, squad_followers, squad_games y squad_stats, invitar a un equipo de punta a
 * punta (search_people con p_squad, aceptar, rechazar, cancelar, join_squad, bloqueos, tope de 40, límite por día), las
 * plataformas de esports (ajustes por juego, NBA 2K viejo, guardar y cambiar plataformas, otra_plataforma y
 * sin_plataforma al inscribir, crossplay), esports_refresh_entry_ids, esports_link_account con esp_id_locked y el
 * volver de esports-auth.
 *
 * Mundo: el de fixture.ts (liga privada del Banco y liga pública Abierta) más seis cuentas p1…p6 sin liga
 * ('Jugador 1'…'Jugador 6').
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, withCopa, type World } from './fixture';
import { DEMO_COURSE } from '../../src/sports/golf/demo';

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
  for (let i = 1; i <= 6; i++) p.push(await db.createUser(`p${i}@x.com`, `Jugador ${i}`));
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;
interface Created {
  squadId: string;
  inviteCode: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const uuid = () => randomUUID();
const ZERO = { played: 0, won: 0, drawn: 0, lost: 0 };
const DAY = 864e5;
const future = (days = 7) => new Date(Date.now() + days * DAY).toISOString();

const NEW_RPC = [
  'cancel_squad_invite', 'esports_refresh_entry_ids', 'esports_set_game_platforms', 'invite_to_squad', 'my_squad_invites',
  'player_places', 'respond_squad_invite', 'squad_followers', 'squad_games', 'squad_pending_invites', 'squad_stats',
  // Redefinidas o creadas de nuevo.
  'create_post', 'esports_save_game_id', 'search_people', 'squad_page', 'squad_posts',
].sort();
const ANON_RPC = ['player_places', 'squad_followers', 'squad_page', 'squad_posts'];
const HELPERS = [
  'social_game_json', 'social_game_one', 'social_game_league', 'social_game_done', 'squad_post_ok', 'squad_league_ok',
  'emit_squad_invites', 'squad_invites_on_join', 'squad_person_flags', 'esp_game_platforms', 'esp_nba_platform',
  'esp_nba_id_platform', 'esp_platforms_clean', 'esp_platforms_ok', 'esp_tournament_platform', 'esp_tournament_game_id',
  'esp_settings_compat', 'esp_game_id_platforms', 'esp_safe_path', 'social_games', 'post_json', 'esp_settings_ok',
  'esp_member_ok', 'esp_snapshot', 'esp_game_id_json',
];

// ---------- Ayudas ----------

/** Crea un equipo (sin el límite de 5 por día). */
async function mkSquad(who: string, name: string, o: Json = {}): Promise<Created> {
  await db.admin(`delete from private.rate_limits where key = $1`, [`squad:${who}`]);
  return db.rpc<Created>(who, 'create_squad', { p_sport: o.sport ?? 'football', p_name: name, p_tag: o.tag ?? 'TST' });
}
async function squadWith(captain: string, others: string[], name = 'Tigres', o: Json = {}): Promise<Created> {
  const s = await mkSquad(captain, name, o);
  for (const u of others) await db.rpc(u, 'join_squad', { p_code: s.inviteCode });
  return s;
}
const page = (who: string, id: string) => db.rpc<Json | null>(who, 'squad_page', { p_squad: id });
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const pushes = (uid: string) => db.admin<Json>('select title, body, url, tag from public.push_outbox where user_id = $1 order by id', [uid]);
const fillLimit = (key: string, hits: number) =>
  db.admin(
    `insert into private.rate_limits (key, window_start, hits) values ($1, now(), $2)
     on conflict (key) do update set window_start = now(), hits = excluded.hits`,
    [key, hits],
  );
const manyUsers = async (prefix: string, n: number) =>
  (
    await db.admin<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       select $1 || i || '@x.com', jsonb_build_object('name', $1 || ' ' || i) from generate_series(1, $2::integer) i returning id`,
      [prefix, n],
    )
  ).map((r) => r.id);
async function captureRealtime() {
  await db.admin('create schema if not exists realtime');
  await db.admin('create table realtime.sent (n serial, payload jsonb, event text, topic text, private boolean)');
  await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                  language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$`);
  return (event: string) => db.admin<{ topic: string; payload: Json }>(`select topic, payload from realtime.sent where event = $1 order by n`, [event]);
}
const block = (who: string, target: string) => db.rpc(who, 'block_user', { p_user: target });
const post = (who: string, args: Json) => db.rpc<Json>(who, 'create_post', { p_id: uuid(), ...args });
const places = (who: string, target: string) => db.rpc<Json | null>(who, 'player_places', { p_user: target });

/** Liga de fútbol (pública por defecto): org dueño, sofi admin. */
async function futbol(name = 'Liga de Fútbol', o: { visibility?: 'public' | 'private'; kind?: 'liga' | 'torneo' } = {}) {
  const lid = await league(db, w.u.org, { name, visibility: o.visibility ?? 'public', kind: o.kind ?? 'liga', sport: 'football', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  return lid;
}
const request = (who: string, squad: string, lid: string) => db.rpc<string>(who, 'request_squad_league', { p_squad: squad, p_league: lid });
const decide = (who: string, req: string, approve: boolean) => db.rpc<Json>(who, 'decide_squad_request', { p_request: req, p_approve: approve, p_note: null });
/** Un partido con dos lados (labels y equipos), su estado y su hora. */
async function match(lid: string, a: { team?: string | null; label: string }, b: { team?: string | null; label: string }, o: Json = {}) {
  const id = (
    await db.admin<{ id: string }>(
      `insert into public.matches (league_id, status, winner_side, walkover_side, scheduled_at, event_id, score, round, stage)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, '')) returning id`,
      [lid, o.status ?? 'scheduled', o.winner ?? null, o.walkover ?? null, o.at ?? null, o.event ?? null, o.score ?? null, o.round ?? null, o.stage ?? null],
    )
  )[0].id;
  await db.admin(
    `insert into public.match_sides (match_id, side, league_id, team_id, label) values ($1, 1, $2, $3, $4), ($1, 2, $2, $5, $6)`,
    [id, lid, a.team ?? null, a.label, b.team ?? null, b.label],
  );
  return id;
}
const activeSeason = async (lid: string) =>
  (await db.admin<{ id: string; name: string }>(`select id, name from public.seasons where league_id = $1 and status = 'active'`, [lid]))[0];

/**
 * Juegos de luis: en la Abierta (pública) un torneo con 190 y 210 verificados (20 sept); en el Banco (privada) e1 con
 * 150 sin verificar (22 sept, de fixture.ts); en Pádel Abierto (pública) luis + ana contra otra + nuevo, confirmado y
 * ganado por el lado 1 (25 sept).
 */
async function gamesWorld() {
  await member(db, w.pub, w.u.luis, 'member', 'luis');
  const pubLuis = await player(db, w.pub, 'Luis', w.u.luis);
  const t1 = await event(db, w.pub, 'torneo', '2026-09-20', 3, 'Copa Abierta');
  const t1Luis = await entry(db, w.pub, t1, pubLuis, [190, 210, null], ['sin-foto', 'sin-foto', null]);
  const padel = await league(db, w.u.otro, { name: 'Pádel Abierto', visibility: 'public', sport: 'padel', requirePhoto: false });
  await db.admin(`update public.leagues set rules = '{"match": {"sport": "padel", "deuce": "golden"}}' where id = $1`, [padel]);
  await member(db, padel, w.u.otro, 'owner', 'otro');
  for (const [uid, name] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
  ] as const) {
    await member(db, padel, uid, 'member', name);
  }
  const pp = {
    luis: await player(db, padel, 'Luis', w.u.luis),
    ana: await player(db, padel, 'Ana', w.u.ana),
    otra: await player(db, padel, 'Otra', w.u.otra),
    nuevo: await player(db, padel, 'Nuevo', w.u.nuevo),
  };
  const mk = async (at: string) =>
    (
      await db.rpc<string[]>(w.u.otro, 'create_matches', {
        p_league: padel,
        p_matches: [
          {
            scheduled_at: at,
            sides: [
              { side: 1, label: 'Luis / Ana', players: [{ player_id: pp.luis }, { player_id: pp.ana }] },
              { side: 2, label: 'Otra / Nuevo', players: [{ player_id: pp.otra }, { player_id: pp.nuevo }] },
            ],
          },
        ],
      })
    )[0];
  const pm = await mk('2026-09-25T23:00:00Z');
  await db.admin(
    `update public.matches set status = 'confirmed', winner_side = 1, score = '{"text": "6-4 6-3"}', proposed_at = now(), confirmed_at = now()
      where id = $1`,
    [pm],
  );
  const pending = await mk('2026-10-30T23:00:00Z');
  return { pubLuis, t1, t1Luis, padel, pp, pm, pending };
}

// =====================================================================

describe('permisos', () => {
  it('las RPC: security definer, search_path vacío; player_places, squad_followers, squad_page y squad_posts también sin cuenta; las ayudas, nadie de la app', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean; path: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(
      NEW_RPC.map((fn) => ({ fn, definer: true, anon: ANON_RPC.includes(fn), auth: true, uid: !ANON_RPC.includes(fn), path: true })),
    );
    // Las que se crearon de nuevo: una sola de cada una, con su firma nueva.
    expect(
      await db.admin(
        `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('create_post', 'search_people', 'esports_save_game_id', 'esports_link_begin') order by 1`,
      ),
    ).toEqual([
      { sig: 'create_post(uuid,text,text,integer,integer,uuid,text,text,uuid,text,uuid,uuid)' },
      { sig: 'esports_link_begin(uuid,text,text,text)' },
      { sig: 'esports_save_game_id(text,text,text,text,text[])' },
      { sig: 'search_people(text,uuid,integer,uuid)' },
    ]);
    // esports_link_begin / take / account: solo service_role.
    const svc = await db.admin<{ fn: string; anon: boolean; auth: boolean; service: boolean }>(
      `select p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('esports_link_begin', 'esports_link_take', 'esports_link_account') order by 1`,
    );
    for (const s of svc) expect(s, s.fn).toMatchObject({ anon: false, auth: false, service: true });
    const helpers = await db.admin<{ fn: string; auth: boolean; anon: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [HELPERS],
    );
    expect(new Set(helpers.map((h) => h.fn))).toEqual(new Set(HELPERS));
    for (const h of helpers) expect(h, h.fn).toMatchObject({ auth: false, anon: false });
    // La tabla nueva: sin lectura directa ni escritura.
    await fails(db.asUser(p[0], 'select * from public.squad_invites'), '42501');
    await fails(db.asAnon('select * from public.squad_invites'), '42501');
    await fails(db.asUser(p[0], `insert into public.squad_invites (squad_id, user_id) values ($1, $2)`, [uuid(), p[0]]), '42501');
    // Sin cuenta, nada de lo demás.
    await fails(db.rpc(ANON, 'invite_to_squad', { p_squad: uuid(), p_users: [p[0]] }), '42501');
    await fails(db.rpc(ANON, 'squad_games', { p_squad: uuid() }), '42501');
    await fails(db.rpc(ANON, 'squad_stats', { p_squad: uuid() }), '42501');
    await fails(db.rpc(ANON, 'esports_set_game_platforms', { p_game: 'fortnite', p_platforms: ['pc'] }), '42501');
  });
});

// =====================================================================

describe('player_places: dónde juega cada persona', () => {
  it('las ligas que ve quien mira (ligas primero, luego torneos; la de actividad más reciente primero) con el resumen de cada una', async () => {
    const g = await gamesWorld();
    const copa = await withCopa(db, w); // torneo público donde luis es jugador (JL) sin juegos
    const pl = await places(w.u.ana, w.u.luis);
    expect(pl!.leagues.map((l: Json) => l.name)).toEqual(['Pádel Abierto', 'Liga del Banco', 'Liga Abierta', 'Copa']);
    const byName = Object.fromEntries(pl!.leagues.map((l: Json) => [l.name, l]));
    expect(byName['Liga Abierta']).toEqual({
      leagueId: w.pub,
      name: 'Liga Abierta',
      kind: 'liga',
      sport: 'bowling',
      game: null,
      logo: null,
      visibility: 'public',
      playerId: g.pubLuis,
      summary: { kind: 'bowling', games: 2, average: 200, high: 210 },
    });
    // En el Banco el juego no está verificado (sin foto): no cuenta, como en profile_stats.
    expect(byName['Liga del Banco']).toMatchObject({ visibility: 'private', playerId: w.p.luis, summary: { kind: 'bowling', games: 0, average: null, high: null } });
    expect(byName['Pádel Abierto'].summary).toEqual({ kind: 'matches', played: 1, won: 1, drawn: 0, lost: 0 });
    expect(byName.Copa).toMatchObject({ leagueId: copa.copa, kind: 'torneo', playerId: copa.jl, summary: { kind: 'bowling', games: 0 } });
    // Alguien de fuera del Banco no lo ve; sin sesión, igual (solo lo público).
    expect((await places(w.u.extra, w.u.luis))!.leagues.map((l: Json) => l.name)).toEqual(['Pádel Abierto', 'Liga Abierta', 'Copa']);
    expect((await places(ANON, w.u.luis))!.leagues.map((l: Json) => l.name)).toEqual(['Pádel Abierto', 'Liga Abierta', 'Copa']);
    // Su propio perfil, todo.
    expect((await places(w.u.luis, w.u.luis))!.leagues).toHaveLength(4);
  });

  it('golf y natación: rondas y el mejor bruto; resultados', async () => {
    const lid = await league(db, w.u.org, { name: 'Golf del Club', visibility: 'public', sport: 'golf', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const gp = await player(db, lid, 'Luis', w.u.luis);
    const course = await db.rpc<string>(w.u.org, 'golf_save_course', {
      p_league: lid,
      p_name: 'Campo',
      p_holes: DEMO_COURSE.holes.map((h) => ({ par: h.par, si: h.si })),
      p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
    });
    const round = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: lid, p_date: '2026-10-10', p_course: course });
    await db.rpc(w.u.luis, 'golf_register', { p_event: round });
    const [{ id: card }] = await db.admin<{ id: string }>('select id from public.golf_cards where event_id = $1 and player_id = $2', [round, gp]);
    await db.rpc(w.u.org, 'golf_save_hole_scores', {
      p_op_id: uuid(),
      p_event: round,
      p_cards: [{ card_id: card, holes: DEMO_COURSE.holes.map((h, i) => ({ i, s: h.par + 1, p: 2 })) }],
    });
    const gross = DEMO_COURSE.holes.reduce((a, h) => a + h.par + 1, 0);
    const swim = await league(db, w.u.org, { name: 'Natación', visibility: 'public', sport: 'swimming', requirePhoto: false });
    await member(db, swim, w.u.org, 'owner', 'org');
    await member(db, swim, w.u.luis, 'member', 'luis');
    const sp = await player(db, swim, 'Luis', w.u.luis);
    const meet = (await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'encuentro', 'Copa Delfín', '2026-10-05') returning id`, [swim]))[0].id;
    const race = (
      await db.admin<{ id: string }>(
        `insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, 1, 50, 'libre', 25, 'X') returning id`,
        [swim, meet],
      )
    )[0].id;
    await db.admin(`insert into public.swim_entries (league_id, event_id, swim_event_id, player_id, time_cs, status, result_at) values ($1, $2, $3, $4, 3000, 'ok', now())`, [
      swim,
      meet,
      race,
      sp,
    ]);
    const pl = await places(w.u.extra, w.u.luis);
    const byName = Object.fromEntries(pl!.leagues.map((l: Json) => [l.name, l]));
    expect(byName['Golf del Club'].summary).toEqual({ kind: 'golf', rounds: 1, best: gross });
    expect(byName['Natación'].summary).toEqual({ kind: 'swim', results: 1 });
  });

  it('sin menores; equipos (capitán primero) y equipos de esports; null si no existe, no se ve o esa cuenta bloqueó a la que mira', async () => {
    // org juega en una liga con menores: no sale ni para quien es miembro.
    const minors = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, minors, w.u.org, 'owner', 'org');
    await member(db, minors, w.u.sofi, 'member', 'sofi');
    await player(db, minors, 'Org', w.u.org);
    expect((await places(w.u.sofi, w.u.org))!.leagues).toEqual([]);
    // Equipos: de los que es capitán primero.
    const tig = await mkSquad(p[0], 'Tigres');
    await db.rpc(w.u.luis, 'join_squad', { p_code: tig.inviteCode });
    const bra = await mkSquad(w.u.luis, 'Bravos', { tag: 'BRA' });
    await db.rpc(w.u.luis, 'esports_save_game_id', { p_game: 'rocket_league', p_id: 'Luis RL' });
    const team = await db.rpc<Json>(w.u.luis, 'esports_create_team', { p_game: 'rocket_league', p_name: 'Cohete', p_tag: 'COH' });
    const pl = await places(w.u.extra, w.u.luis);
    expect(pl!.squads).toEqual([
      { id: bra.squadId, sport: 'football', name: 'Bravos', tag: 'BRA', logo: null, color: null, city: null, recruiting: false, members: 1, followers: 0, role: 'captain' },
      { id: tig.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 2, followers: 0, role: 'member' },
    ]);
    expect(pl!.esportsTeams).toEqual([{ id: team.teamId, game: 'rocket_league', name: 'Cohete', tag: 'COH', logo: null, role: 'captain' }]);
    // Sin sesión se ve a quien juega en una liga pública (luis solo está en la del Banco, privada).
    expect(await places(ANON, w.u.luis)).toBeNull();
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    expect(await places(ANON, w.u.luis)).toMatchObject({ leagues: [], squads: [{ id: bra.squadId }, { id: tig.squadId }] });
    // No existe; sin sesión, alguien que solo está en ligas privadas no se ve; con sesión, sí (sin esas ligas).
    expect(await places(w.u.extra, uuid())).toBeNull();
    expect(await places(ANON, w.u.org)).toBeNull();
    expect(await places(w.u.extra, w.u.org)).toEqual({ leagues: [], squads: [], esportsTeams: [] });
    // Bloqueos: si luis bloqueó a extra, extra no lo ve; el superadmin sí. Quien bloqueó sí ve al bloqueado.
    await block(w.u.luis, w.u.extra);
    expect(await places(w.u.extra, w.u.luis)).toBeNull();
    expect(await places(w.u.dios, w.u.luis)).not.toBeNull();
    expect(await places(w.u.luis, w.u.extra)).not.toBeNull();
    // Bloqueada por el superadmin: con sesión ya no se ve.
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: p[0], p_reason: 'x' });
    expect(await places(w.u.extra, p[0])).toBeNull();
  });
});

// =====================================================================

describe('compartir un juego como publicación', () => {
  it('boliche: de su liga, sin texto; el game es el mismo de profile_games; hasGame', async () => {
    const g = await gamesWorld();
    const id = uuid();
    const res = await db.rpc<Json>(w.u.luis, 'create_post', {
      p_id: id,
      p_league: w.pub,
      p_game_kind: 'bowling',
      p_game_id: g.t1Luis,
      p_game_player: g.pubLuis,
    });
    expect(res).toMatchObject({ id, text: '', photo: null, league: { id: w.pub }, sport: 'bowling', visibility: 'public', hasGame: true });
    const fromProfile = (await db.rpc<Json[]>(w.u.luis, 'profile_games', { p_user: w.u.luis })).find((x) => x.id === g.t1Luis);
    expect(res.game).toEqual(fromProfile);
    expect(res.game).toMatchObject({
      key: `b:${g.t1Luis}`,
      kind: 'bowling',
      playerId: g.pubLuis,
      userId: w.u.luis,
      leagueId: w.pub,
      eventName: 'Copa Abierta',
      detail: { scores: [190, 210], verified: [true, true], series: 400, high: 210 },
    });
    expect(await db.admin('select game_kind, game_id, game_player from public.posts where id = $1', [id])).toEqual([
      { game_kind: 'bowling', game_id: g.t1Luis, game_player: g.pubLuis },
    ]);
    // Reintento: la misma.
    expect((await db.rpc<Json>(w.u.luis, 'create_post', { p_id: id, p_league: w.pub, p_game_kind: 'bowling', p_game_id: g.t1Luis, p_game_player: g.pubLuis })).id).toBe(id);
    // Sin juego sigue haciendo falta texto o foto.
    await fails(post(w.u.luis, { p_text: '' }), INVALID);
    // Otra liga (de la que también es miembro) o sin liga: invalido.
    await fails(post(w.u.luis, { p_league: w.priv, p_visibility: 'league', p_game_kind: 'bowling', p_game_id: g.t1Luis, p_game_player: g.pubLuis }), INVALID);
    await fails(post(w.u.luis, { p_game_kind: 'bowling', p_game_id: g.t1Luis, p_game_player: g.pubLuis }), INVALID);
    // Un juego de liga en el muro de un equipo: el muro no lleva liga.
    const s = await mkSquad(w.u.luis, 'Bolos', { sport: 'bowling', tag: 'BOL' });
    await fails(post(w.u.luis, { p_squad: s.squadId, p_league: w.pub, p_game_kind: 'bowling', p_game_id: g.t1Luis, p_game_player: g.pubLuis }), INVALID);
    // El juego de la liga privada, en la liga privada (solo para sus miembros).
    const priv = await post(w.u.luis, { p_league: w.priv, p_visibility: 'league', p_game_kind: 'bowling', p_game_id: w.e1Luis, p_game_player: w.p.luis });
    expect(priv.game).toMatchObject({ kind: 'bowling', id: w.e1Luis, leagueId: w.priv, detail: { scores: [150], verified: [false] } });
    expect(await db.rpc(w.u.extra, 'post_detail', { p_post: priv.id })).toBeNull();
  });

  it('partido: también el de otro; terminado y con el jugador del partido; lo que no sirve', async () => {
    const g = await gamesWorld();
    // ana comparte el partido desde el lado de luis.
    const res = await post(w.u.ana, { p_text: '¡Qué partido!', p_league: g.padel, p_game_kind: 'match', p_game_id: g.pm, p_game_player: g.pp.luis });
    expect(res.game).toMatchObject({
      key: `m:${g.pm}:${g.pp.luis}`,
      kind: 'match',
      userId: w.u.luis,
      leagueName: 'Pádel Abierto',
      url: `/l/${g.padel}/juegos?partido=${g.pm}`,
      detail: { side: 1, mine: 'Luis / Ana', opponent: 'Otra / Nuevo', score: '6-4 6-3', result: 'win', walkover: false, final: true },
    });
    // Sin terminar, un jugador que no está en el partido, sin jugador, juego a medias, otro tipo.
    const extraPl = await player(db, g.padel, 'Extra');
    await fails(post(w.u.ana, { p_league: g.padel, p_game_kind: 'match', p_game_id: g.pending, p_game_player: g.pp.luis }), INVALID);
    await fails(post(w.u.ana, { p_league: g.padel, p_game_kind: 'match', p_game_id: g.pm, p_game_player: extraPl }), INVALID);
    await fails(post(w.u.ana, { p_league: g.padel, p_game_kind: 'match', p_game_id: g.pm }), INVALID);
    await fails(post(w.u.ana, { p_text: 'x', p_league: g.padel, p_game_id: g.pm, p_game_player: g.pp.luis }), INVALID);
    await fails(post(w.u.ana, { p_league: g.padel, p_game_kind: 'partido', p_game_id: g.pm, p_game_player: g.pp.luis }), INVALID);
    await fails(post(w.u.ana, { p_league: g.padel, p_game_kind: 'match', p_game_id: uuid(), p_game_player: g.pp.luis }), 'no_existe');
    // Quien no es de la liga no publica en ella (las reglas de siempre).
    await fails(post(w.u.extra, { p_league: g.padel, p_game_kind: 'match', p_game_id: g.pm, p_game_player: g.pp.luis }), DENIED);
    // Con un bloqueo con la cuenta del juego, no lo ve: no_existe.
    await block(w.u.ana, w.u.otra);
    await fails(post(w.u.otra, { p_league: g.padel, p_game_kind: 'match', p_game_id: g.pm, p_game_player: g.pp.ana }), 'no_existe');
  });

  it('golf y natación', async () => {
    const lid = await league(db, w.u.org, { name: 'Golf', visibility: 'private', sport: 'golf', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const gp = await player(db, lid, 'Luis', w.u.luis);
    const course = await db.rpc<string>(w.u.org, 'golf_save_course', {
      p_league: lid,
      p_name: 'Campo',
      p_holes: DEMO_COURSE.holes.map((h) => ({ par: h.par, si: h.si })),
      p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
    });
    const round = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: lid, p_date: '2026-10-10', p_course: course });
    await db.rpc(w.u.luis, 'golf_register', { p_event: round });
    const [{ id: card }] = await db.admin<{ id: string }>('select id from public.golf_cards where event_id = $1', [round]);
    // Sin golpes todavía: no terminó.
    await fails(post(w.u.luis, { p_league: lid, p_visibility: 'league', p_game_kind: 'golf', p_game_id: card, p_game_player: gp }), INVALID);
    await db.rpc(w.u.org, 'golf_save_hole_scores', { p_op_id: uuid(), p_event: round, p_cards: [{ card_id: card, holes: [{ i: 0, s: 4 }, { i: 1, s: 5 }] }] });
    const gpost = await post(w.u.luis, { p_league: lid, p_visibility: 'league', p_game_kind: 'golf', p_game_id: card, p_game_player: gp });
    expect(gpost.game).toMatchObject({ key: `g:${card}`, kind: 'golf', id: card, detail: { played: 2, gross: 9, holes: 18 } });

    const swim = await league(db, w.u.org, { name: 'Natación', visibility: 'public', sport: 'swimming', requirePhoto: false });
    await member(db, swim, w.u.org, 'owner', 'org');
    await member(db, swim, w.u.luis, 'member', 'luis');
    const sp = await player(db, swim, 'Luis', w.u.luis);
    const meet = (await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'encuentro', 'Copa', '2026-10-05') returning id`, [swim]))[0].id;
    const race = (
      await db.admin<{ id: string }>(
        `insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, 1, 50, 'libre', 25, 'X') returning id`,
        [swim, meet],
      )
    )[0].id;
    const se = (
      await db.admin<{ id: string }>(
        `insert into public.swim_entries (league_id, event_id, swim_event_id, player_id, time_cs, status, result_at) values ($1, $2, $3, $4, 3000, 'ok', now()) returning id`,
        [swim, meet, race, sp],
      )
    )[0].id;
    const spost = await post(w.u.luis, { p_league: swim, p_game_kind: 'swim', p_game_id: se, p_game_player: sp });
    expect(spost.game).toMatchObject({ key: `s:${se}`, kind: 'swim', detail: { distance: 50, stroke: 'libre', timeCs: 3000, place: 1 } });
  });

  it('juego suelto: solo su dueño, sin liga y compartido', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    const [{ id: solo }] = await db.admin<{ id: string }>(
      `insert into public.solo_sessions (user_id, played_on, scores, venue) values ($1, '2026-09-21', '{200,180}', 'Bolera Sur') returning id`,
      [w.u.luis],
    );
    const [{ id: hidden }] = await db.admin<{ id: string }>(
      `insert into public.solo_sessions (user_id, played_on, scores, shared) values ($1, '2026-09-23', '{100}', false) returning id`,
      [w.u.luis],
    );
    const res = await post(w.u.luis, { p_game_kind: 'solo', p_game_id: solo });
    expect(res).toMatchObject({ league: null, sport: 'bowling', hasGame: true });
    expect(res.game).toMatchObject({
      key: `j:${solo}`,
      kind: 'solo',
      playerId: null,
      leagueId: null,
      url: `/juegos-sueltos?juego=${solo}`,
      detail: { title: 'Juego suelto', venue: 'Bolera Sur', scores: [200, 180], series: 380, high: 200 },
    });
    // Otra cuenta lo ve sin la ruta (como en profile_games).
    expect((await db.rpc<Json>(w.u.extra, 'post_detail', { p_post: res.id })).game).toMatchObject({ kind: 'solo', url: null });
    await fails(post(w.u.ana, { p_game_kind: 'solo', p_game_id: solo }), DENIED);
    await fails(post(w.u.luis, { p_game_kind: 'solo', p_game_id: hidden }), INVALID);
    await fails(post(w.u.luis, { p_league: w.pub, p_game_kind: 'solo', p_game_id: solo }), INVALID);
    await fails(post(w.u.luis, { p_game_kind: 'solo', p_game_id: solo, p_game_player: w.p.luis }), INVALID);
    await fails(post(w.u.luis, { p_game_kind: 'solo', p_game_id: uuid() }), 'no_existe');
    // Deja de estar compartido: la publicación sigue, sin el juego.
    await db.admin('update public.solo_sessions set shared = false where id = $1', [solo]);
    expect(await db.rpc(w.u.extra, 'post_detail', { p_post: res.id })).toMatchObject({ game: null, hasGame: true });
  });

  it('post_json: game null (y hasGame) para quien no ve el juego o si el juego ya no existe', async () => {
    const g = await gamesWorld();
    const res = await post(w.u.ana, { p_text: 'Mira', p_league: g.padel, p_game_kind: 'match', p_game_id: g.pm, p_game_player: g.pp.luis });
    // otra bloqueó a luis (la cuenta del juego), no a ana: ve la publicación, no el juego.
    await block(w.u.otra, w.u.luis);
    expect(await db.rpc(w.u.otra, 'post_detail', { p_post: res.id })).toMatchObject({ id: res.id, game: null, hasGame: true });
    expect((await db.rpc<Json>(w.u.nuevo, 'post_detail', { p_post: res.id })).game).toMatchObject({ id: g.pm });
    // En el feed igual.
    const feed = await db.rpc<Json[]>(w.u.nuevo, 'social_feed', { p_scope: 'following' });
    expect(feed.find((x) => x.id === res.id)).toMatchObject({ hasGame: true, game: { kind: 'match' } });
    // El partido se borró: la publicación queda, sin el juego.
    await db.admin('delete from public.matches where id = $1', [g.pm]);
    expect(await db.rpc(w.u.nuevo, 'post_detail', { p_post: res.id })).toMatchObject({ game: null, hasGame: true });
    // Los tres o ninguno, también en la tabla.
    await fails(db.admin(`update public.posts set game_player = null where id = $1`, [res.id]), '23514');
  });
});

// =====================================================================

describe('equipos como perfil', () => {
  it('squad_page: posts y likes (publicaciones del muro y partidos de sus jugadores); squad_posts sin sesión', async () => {
    const s = await squadWith(p[0], [p[1]]);
    const a = await post(p[1], { p_text: 'Uno', p_squad: s.squadId });
    const b = await post(p[1], { p_text: 'Dos', p_squad: s.squadId });
    const c = await post(p[0], { p_text: 'Tres', p_squad: s.squadId });
    // Horas distintas (en la misma transacción serían iguales): a, b, c.
    for (const [x, h] of [
      [a, 3],
      [b, 2],
      [c, 1],
    ] as const) {
      await db.admin(`update public.posts set created_at = date_trunc('milliseconds', now()) - make_interval(hours => $2) where id = $1`, [x.id, h]);
    }
    for (const x of [a, b]) await db.rpc(p[2], 'set_post_like', { p_post: x.id, p_liked: true });
    await db.rpc(p[3], 'set_post_like', { p_post: c.id, p_liked: true });
    expect(await page(ANON, s.squadId)).toMatchObject({ posts: 3, likes: 3 });
    expect((await db.rpc<Json[]>(ANON, 'squad_posts', { p_squad: s.squadId })).map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    // Sin sesión el Post no es de nadie.
    expect((await db.rpc<Json[]>(ANON, 'squad_posts', { p_squad: s.squadId }))[0]).toMatchObject({ isMine: false, canDelete: false, likedByMe: false });
    // Los me gusta de los partidos de sus jugadores en el equipo de la liga.
    const lid = await futbol();
    const res = await decide(w.u.org, await request(p[0], s.squadId, lid), true);
    const rival = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones' });
    const m = await match(lid, { team: res.teamId, label: 'Tigres' }, { team: rival, label: 'Leones' }, { status: 'confirmed', winner: 1 });
    const [{ id: pl1 }] = await db.admin<{ id: string }>('select id from public.players where league_id = $1 and user_id = $2', [lid, p[1]]);
    await db.rpc(p[3], 'set_game_like', { p_kind: 'match', p_id: m, p_liked: true, p_player: pl1 });
    await db.rpc(p[4], 'set_game_like', { p_kind: 'match', p_id: m, p_liked: true, p_player: pl1 });
    expect(await page(p[5], s.squadId)).toMatchObject({ posts: 3, likes: 5 });
    // La liga pasa a privada: quien no es miembro ya no cuenta sus me gusta; un miembro (p[1]) sí.
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [lid]);
    expect(await page(p[5], s.squadId)).toMatchObject({ likes: 3 });
    expect(await page(p[1], s.squadId)).toMatchObject({ likes: 5 });
    // Con menores, para nadie.
    await db.admin(`update public.leagues set has_minors = true, require_photo = false where id = $1`, [lid]);
    expect(await page(p[1], s.squadId)).toMatchObject({ likes: 3 });
    // El autor bloqueado por el superadmin: su publicación ya no cuenta (ni sus me gusta).
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: p[0], p_reason: 'x' });
    expect(await page(ANON, s.squadId)).toMatchObject({ posts: 2, likes: 2 });
    expect((await db.rpc<Json[]>(ANON, 'squad_posts', { p_squad: s.squadId })).map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('squad_followers: la forma de follow_list, por páginas, sin sesión, sin bloqueados', async () => {
    const s = await mkSquad(p[0], 'Tigres');
    for (const u of [w.u.extra, w.u.otra, w.u.nuevo]) await db.rpc(u, 'follow_squad', { p_squad: s.squadId });
    // Horas distintas: extra el más viejo, nuevo el más nuevo.
    await db.admin(`update public.squad_follows set created_at = now() - interval '3 hours' where user_id = $1`, [w.u.extra]);
    await db.admin(`update public.squad_follows set created_at = now() - interval '2 hours' where user_id = $1`, [w.u.otra]);
    await db.admin(`update public.squad_follows set created_at = now() - interval '1 hours' where user_id = $1`, [w.u.nuevo]);
    await db.rpc(w.u.luis, 'follow_user', { p_user: w.u.otra });
    await db.rpc(w.u.otra, 'follow_user', { p_user: w.u.luis });
    const list = await db.rpc<Json[]>(w.u.luis, 'squad_followers', { p_squad: s.squadId });
    expect(list.map((x) => x.name)).toEqual(['new', 'otra', 'extra']);
    expect(list[1]).toEqual({
      id: w.u.otra,
      name: 'otra',
      username: 'otra',
      avatar: null,
      at: expect.stringMatching(ISO),
      isFollowing: true,
      followsYou: true,
      isMe: false,
    });
    expect((await db.rpc<Json[]>(w.u.otra, 'squad_followers', { p_squad: s.squadId }))[1]).toMatchObject({ isMe: true });
    // Páginas.
    const p1 = await db.rpc<Json[]>(w.u.luis, 'squad_followers', { p_squad: s.squadId, p_limit: 2 });
    expect(p1.map((x) => x.name)).toEqual(['new', 'otra']);
    const p2 = await db.rpc<Json[]>(w.u.luis, 'squad_followers', { p_squad: s.squadId, p_limit: 2, p_before: p1[1].at, p_before_id: p1[1].id });
    expect(p2.map((x) => x.name)).toEqual(['extra']);
    // Sin sesión: todo en false.
    const anon = await db.rpc<Json[]>(ANON, 'squad_followers', { p_squad: s.squadId });
    expect(anon.map((x) => [x.name, x.isFollowing, x.followsYou, x.isMe])).toEqual([
      ['new', false, false, false],
      ['otra', false, false, false],
      ['extra', false, false, false],
    ]);
    // Bloqueos: con quien mira (en cualquier dirección) y por el superadmin.
    await block(w.u.otra, w.u.luis);
    expect((await db.rpc<Json[]>(w.u.luis, 'squad_followers', { p_squad: s.squadId })).map((x) => x.name)).toEqual(['new', 'extra']);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.nuevo, p_reason: 'x' });
    expect((await db.rpc<Json[]>(ANON, 'squad_followers', { p_squad: s.squadId })).map((x) => x.name)).toEqual(['otra', 'extra']);
    expect(await db.rpc<Json[]>(w.u.dios, 'squad_followers', { p_squad: s.squadId })).toHaveLength(3);
    expect(await db.rpc(ANON, 'squad_followers', { p_squad: uuid() })).toEqual([]);
  });

  it('squad_games y squad_stats: los partidos de sus equipos de liga (como el récord), las ligas que ve quien mira, temporadas y torneos', async () => {
    const lid = await futbol();
    const s = await squadWith(p[0], [p[1]]);
    const res = await decide(w.u.org, await request(p[0], s.squadId, lid), true);
    const rival = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones' });
    const T = { team: res.teamId as string, label: 'Tigres' };
    const L = { team: rival, label: 'Leones' };
    const copa = await event(db, lid, 'torneo', '2026-10-01', 3, 'Copa de la Liga');
    const m1 = await match(lid, T, L, { status: 'confirmed', winner: 1, at: '2026-09-01T20:00:00Z', score: { text: '2-1' }, round: 1 });
    const m2 = await match(lid, L, T, { status: 'confirmed', winner: 1, at: '2026-09-08T20:00:00Z', round: 2 });
    const m3 = await match(lid, T, L, { status: 'finished', at: '2026-09-15T20:00:00Z' });
    const m4 = await match(lid, L, T, { status: 'walkover', walkover: 2, winner: 1, at: '2026-09-22T20:00:00Z' });
    await match(lid, T, L, { status: 'walkover', walkover: 0, at: '2026-09-23T20:00:00Z' });
    await match(lid, T, L, { status: 'scheduled', at: '2026-10-20T20:00:00Z' });
    await match(lid, T, L, { status: 'void', at: '2026-09-24T20:00:00Z' });
    const m5 = await match(lid, T, L, { status: 'confirmed', winner: 1, at: '2026-10-01T20:00:00Z', event: copa, stage: 'Final' });

    const games = await db.rpc<Json[]>(w.u.extra, 'squad_games', { p_squad: s.squadId });
    expect(games.map((x) => x.matchId)).toEqual([m5, m4, m3, m2, m1]);
    expect(games[4]).toEqual({
      key: `m:${m1}:1`,
      matchId: m1,
      leagueId: lid,
      leagueName: 'Liga de Fútbol',
      sport: 'football',
      at: '2026-09-01T20:00:00.000Z',
      side: 1,
      mine: 'Tigres',
      opponent: 'Leones',
      score: '2-1',
      result: 'win',
      walkover: false,
      stage: null,
      round: '1',
      url: `/l/${lid}/juegos?partido=${m1}`,
    });
    expect(games.map((x) => [x.side, x.result, x.walkover])).toEqual([
      [1, 'win', false],
      [2, 'loss', true],
      [1, 'draw', false],
      [2, 'loss', false],
      [1, 'win', false],
    ]);
    expect(games[0].stage).toBe('Final');
    // Páginas.
    const first = await db.rpc<Json[]>(w.u.extra, 'squad_games', { p_squad: s.squadId, p_limit: 2 });
    const next = await db.rpc<Json[]>(w.u.extra, 'squad_games', { p_squad: s.squadId, p_limit: 2, p_before: first[1].at, p_before_key: first[1].key });
    expect(next.map((x) => x.matchId)).toEqual([m3, m2]);

    // Una liga privada (p[0] ya es miembro) y un torneo suelto público.
    const priv = await futbol('Liga Privada', { visibility: 'private' });
    await member(db, priv, p[0], 'member', 'Jugador 1');
    const resP = await decide(w.u.org, await request(p[0], s.squadId, priv), true);
    const rivalP = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: priv, p_name: 'Toros' });
    const mp = await match(priv, { team: resP.teamId, label: 'Tigres' }, { team: rivalP, label: 'Toros' }, { status: 'confirmed', winner: 2, at: '2026-10-05T20:00:00Z' });
    const tor = await futbol('Torneo Relámpago', { kind: 'torneo' });
    const resT = await decide(w.u.org, await request(p[0], s.squadId, tor), true);
    const rivalT = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: tor, p_name: 'Pumas' });
    await match(tor, { team: resT.teamId, label: 'Tigres' }, { team: rivalT, label: 'Pumas' }, { status: 'confirmed', winner: 1, at: '2026-10-06T20:00:00Z' });
    expect((await db.rpc<Json[]>(w.u.extra, 'squad_games', { p_squad: s.squadId })).map((x) => x.leagueName)).not.toContain('Liga Privada');
    expect((await db.rpc<Json[]>(p[1], 'squad_games', { p_squad: s.squadId })).map((x) => x.matchId)).toContain(mp);

    const season = await activeSeason(lid);
    const stats = await db.rpc<Json>(w.u.extra, 'squad_stats', { p_squad: s.squadId });
    expect(stats.record).toEqual({ played: 6, won: 3, drawn: 1, lost: 2 });
    expect(stats.leagues).toEqual([
      {
        leagueId: lid,
        name: 'Liga de Fútbol',
        kind: 'liga',
        sport: 'football',
        logo: null,
        record: { played: 5, won: 2, drawn: 1, lost: 2 },
        seasons: [{ seasonId: season.id, name: season.name, record: { played: 5, won: 2, drawn: 1, lost: 2 } }],
      },
    ]);
    // El más nuevo primero: el torneo suelto no tiene evento 'torneo' (date = el inicio de la liga).
    expect(stats.tournaments).toEqual([
      { leagueId: lid, eventId: copa, name: 'Copa de la Liga', sport: 'football', date: '2026-10-01', record: { played: 1, won: 1, drawn: 0, lost: 0 } },
      { leagueId: tor, eventId: null, name: 'Torneo Relámpago', sport: 'football', date: '2026-01-01', record: { played: 1, won: 1, drawn: 0, lost: 0 } },
    ]);
    // Un miembro de la privada la ve también.
    const mine = await db.rpc<Json>(p[1], 'squad_stats', { p_squad: s.squadId });
    expect(mine.record).toEqual({ played: 7, won: 3, drawn: 1, lost: 3 });
    expect(mine.leagues.map((l: Json) => l.name)).toEqual(['Liga de Fútbol', 'Liga Privada']);
    expect(await db.rpc(w.u.extra, 'squad_stats', { p_squad: uuid() })).toBeNull();
    expect(await db.rpc(w.u.extra, 'squad_games', { p_squad: uuid() })).toEqual([]);
  });
});

// =====================================================================

describe('invitar a un equipo dentro de la app', () => {
  const invite = (who: string, squad: string, users: string[]) => db.rpc<Json>(who, 'invite_to_squad', { p_squad: squad, p_users: users });
  const inviteId = async (squad: string, user: string) =>
    (await db.admin<{ id: string }>(`select id from public.squad_invites where squad_id = $1 and user_id = $2 order by created_at desc limit 1`, [squad, user]))[0].id;
  const status = async (id: string) => (await db.admin<{ status: string }>('select status from public.squad_invites where id = $1', [id]))[0].status;

  it('invitar: el capitán; cada persona con su estado; aviso y tiempo real; search_people con p_squad; las pendientes', async () => {
    const sent = await captureRealtime();
    await phone(p[2]);
    const s = await squadWith(p[0], [p[1]]);
    await fails(invite(p[1], s.squadId, [p[2]]), DENIED);
    await fails(invite(p[0], uuid(), [p[2]]), 'no_existe');
    await fails(invite(p[0], s.squadId, []), INVALID);
    await fails(invite(p[0], s.squadId, Array.from({ length: 51 }, () => uuid())), INVALID);
    await block(p[4], p[0]);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: p[5], p_reason: 'x' });
    const ghost = uuid();
    const r = await invite(p[0], s.squadId, [p[2], p[1], p[0], p[4], p[5], ghost, p[2]]);
    expect(r).toEqual({
      sent: 1,
      results: [
        { userId: p[2], status: 'sent' },
        { userId: p[1], status: 'member' },
        { userId: p[0], status: 'unavailable' },
        { userId: p[4], status: 'unavailable' },
        { userId: p[5], status: 'unavailable' },
        { userId: ghost, status: 'unavailable' },
      ],
    });
    const id = await inviteId(s.squadId, p[2]);
    expect(await invite(p[0], s.squadId, [p[2]])).toEqual({ sent: 0, results: [{ userId: p[2], status: 'pending' }] });
    expect(await pushes(p[2])).toEqual([
      { title: 'Jugador 1 te invitó a Tigres', body: 'Toca para ver el equipo y unirte.', url: `/equipos/${s.squadId}`, tag: `equipo:invitacion:${id}` },
    ]);
    expect(await db.admin(`select private.push_category('equipo:invitacion:x') as c`)).toEqual([{ c: 'liga' }]);
    expect((await sent('invites')).filter((x) => x.topic === `user:${p[2]}`).map((x) => x.payload)).toEqual([
      { id, status: 'pending', squad_id: s.squadId },
    ]);
    // Lo que ve la invitada.
    expect(await db.rpc(p[2], 'my_squad_invites', {})).toEqual([
      {
        id,
        squad: { id: s.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 2, followers: 0 },
        invitedBy: { id: p[0], name: 'Jugador 1', username: expect.any(String) },
        createdAt: expect.stringMatching(ISO),
      },
    ]);
    expect(await db.rpc(p[3], 'my_squad_invites', {})).toEqual([]);
    // Lo que ve el capitán.
    expect(await db.rpc(p[0], 'squad_pending_invites', { p_squad: s.squadId })).toEqual([
      { id, user: { id: p[2], name: 'Jugador 3', username: expect.any(String), avatar: null }, createdAt: expect.stringMatching(ISO) },
    ]);
    await fails(db.rpc(p[1], 'squad_pending_invites', { p_squad: s.squadId }), DENIED);
    await fails(db.rpc(p[1], 'squad_pending_invites', { p_squad: uuid() }), 'no_existe');
    // Buscar personas para invitar: con inSquad e invited del equipo; solo el capitán.
    const found = await db.rpc<Json[]>(p[0], 'search_people', { p_query: 'jugador', p_squad: s.squadId });
    const flags = Object.fromEntries(found.map((x) => [x.id, [x.inSquad, x.invited]]));
    expect(flags[p[1]]).toEqual([true, false]);
    expect(flags[p[2]]).toEqual([false, true]);
    expect(flags[p[3]]).toEqual([false, false]);
    expect(found.map((x) => x.id)).not.toContain(p[4]); // bloqueó al capitán
    await fails(db.rpc(p[1], 'search_people', { p_query: 'jugador', p_squad: s.squadId }), DENIED);
    await fails(db.rpc(p[0], 'search_people', { p_query: 'jugador', p_squad: uuid() }), 'no_existe');
    await fails(db.rpc(p[0], 'search_people', { p_query: 'jugador', p_squad: s.squadId, p_league: w.pub }), INVALID);
    // Sin p_squad, igual que antes.
    expect((await db.rpc<Json[]>(p[0], 'search_people', { p_query: 'jugador' }))[0]).not.toHaveProperty('inSquad');
  });

  it('aceptar (miembro, aviso al capitán, deja de seguirlo), rechazar (7 días sin volver a invitar), cancelar; join_squad acepta la pendiente', async () => {
    await phone(p[0]);
    const s = await mkSquad(p[0], 'Tigres');
    await db.rpc(p[2], 'follow_squad', { p_squad: s.squadId });
    await invite(p[0], s.squadId, [p[1], p[2], p[3], p[4]]);
    const i1 = await inviteId(s.squadId, p[1]);
    const i2 = await inviteId(s.squadId, p[2]);
    const i3 = await inviteId(s.squadId, p[3]);
    const i4 = await inviteId(s.squadId, p[4]);
    await fails(db.rpc(p[1], 'respond_squad_invite', { p_invite: i2, p_accept: true }), 'no_existe');
    await fails(db.rpc(p[2], 'respond_squad_invite', { p_invite: i2, p_accept: null }), INVALID);
    expect(await db.rpc(p[2], 'respond_squad_invite', { p_invite: i2, p_accept: true })).toEqual({ squadId: s.squadId });
    expect(await status(i2)).toBe('accepted');
    expect(await db.count('public.squad_members', 'squad_id = $1 and user_id = $2 and role = $3', [s.squadId, p[2], 'member'])).toBe(1);
    expect(await db.count('public.squad_follows', 'squad_id = $1 and user_id = $2', [s.squadId, p[2]])).toBe(0);
    expect(await pushes(p[0])).toContainEqual({ title: 'Jugador 3 se unió a tu equipo', body: 'Tigres', url: `/equipos/${s.squadId}`, tag: `equipo:miembro:${s.squadId}` });
    // Otra vez: lo mismo.
    expect(await db.rpc(p[2], 'respond_squad_invite', { p_invite: i2, p_accept: true })).toEqual({ squadId: s.squadId });
    // Rechazar.
    expect(await db.rpc(p[1], 'respond_squad_invite', { p_invite: i1, p_accept: false })).toEqual({});
    expect(await status(i1)).toBe('declined');
    expect(await invite(p[0], s.squadId, [p[1]])).toEqual({ sent: 0, results: [{ userId: p[1], status: 'unavailable' }] });
    await db.admin(`update public.squad_invites set decided_at = now() - interval '8 days' where id = $1`, [i1]);
    expect((await invite(p[0], s.squadId, [p[1]])).results).toEqual([{ userId: p[1], status: 'sent' }]);
    // Cancelar: el capitán; después ya no sirve.
    await fails(db.rpc(p[2], 'cancel_squad_invite', { p_invite: i3 }), DENIED);
    await fails(db.rpc(p[0], 'cancel_squad_invite', { p_invite: uuid() }), 'no_existe');
    await db.rpc(p[0], 'cancel_squad_invite', { p_invite: i3 });
    expect(await status(i3)).toBe('cancelled');
    expect(await db.rpc(p[3], 'respond_squad_invite', { p_invite: i3, p_accept: true })).toEqual({});
    expect(await db.count('public.squad_members', 'squad_id = $1 and user_id = $2', [s.squadId, p[3]])).toBe(0);
    // Entrar con el código acepta la pendiente.
    await db.rpc(p[4], 'join_squad', { p_code: s.inviteCode });
    expect(await status(i4)).toBe('accepted');
    expect(await db.rpc(p[4], 'my_squad_invites', {})).toEqual([]);
  });

  it('bloqueos después de invitar, tope de 40, límite de 20 equipos y 50 invitaciones por día', async () => {
    const s = await mkSquad(p[0], 'Tigres');
    await invite(p[0], s.squadId, [p[1], p[2], p[3]]);
    const i1 = await inviteId(s.squadId, p[1]);
    // p[1] bloquea al capitán: no ve la invitación y no puede aceptarla.
    await block(p[1], p[0]);
    expect(await db.rpc(p[1], 'my_squad_invites', {})).toEqual([]);
    await fails(db.rpc(p[1], 'respond_squad_invite', { p_invite: i1, p_accept: true }), DENIED);
    // Tope de 40: con 40 miembros ya no se invita ni se acepta.
    const fill = await manyUsers('relleno', 39);
    await db.admin(`insert into public.squad_members (squad_id, user_id) select $1, unnest($2::uuid[])`, [s.squadId, fill]);
    expect((await invite(p[0], s.squadId, [p[4]])).results).toEqual([{ userId: p[4], status: 'full' }]);
    await fails(db.rpc(p[2], 'respond_squad_invite', { p_invite: await inviteId(s.squadId, p[2]), p_accept: true }), 'cupo_lleno');
    await db.admin(`delete from public.squad_members where squad_id = $1 and user_id = any ($2)`, [s.squadId, fill]);
    // Ya es de 20 equipos: limite.
    const others = await manyUsers('capi', 20);
    for (let i = 0; i < 20; i++) {
      const sq = (
        await db.admin<{ id: string }>(`insert into public.squads (sport, name, tag, captain_id) values ('football', $1, 'OTR', $2) returning id`, [`Otro ${i}`, others[i]])
      )[0].id;
      await db.admin(`insert into public.squad_members (squad_id, user_id, role) values ($1, $2, 'captain'), ($1, $3, 'member')`, [sq, others[i], p[3]]);
    }
    await fails(db.rpc(p[3], 'respond_squad_invite', { p_invite: await inviteId(s.squadId, p[3]), p_accept: true }), 'limite');
    // 50 por día: con 49, una sale y la otra no; con 50, toda la llamada.
    await fillLimit(`squad_invite:${p[0]}`, 49);
    expect((await invite(p[0], s.squadId, [p[4], p[5]])).results).toEqual([
      { userId: p[4], status: 'sent' },
      { userId: p[5], status: 'rate_limited' },
    ]);
    await fails(invite(p[0], s.squadId, [p[5]]), 'rate_limited');
  });
});

// =====================================================================

describe('esports: plataformas', () => {
  interface TOpts {
    game?: string;
    mode?: string;
    entry?: 'teams' | 'open';
    format?: string;
    max?: number;
    settings?: Json;
  }
  // Sin el tope de ligas por día de quien crea (private.league_quota).
  const createT = async (who: string, o: TOpts = {}) => {
    await db.admin('delete from private.league_creations where user_id = $1', [who]);
    return createTournament(who, o);
  };
  const createTournament = (who: string, o: TOpts) =>
    db.rpc<{ leagueId: string; eventId: string }>(who, 'esports_create_tournament', {
      p_game: o.game ?? 'rocket_league',
      p_name: 'Copa Esports',
      p_mode: o.mode ?? '2v2',
      p_entry_type: o.entry ?? 'teams',
      p_format: o.format ?? 'single_elim',
      p_starts_at: future(),
      p_max_entries: o.max ?? 8,
      p_settings: o.settings ?? {},
      p_visibility: 'public',
    });
  const tSettings = async (eventId: string) => (await db.admin<{ settings: Json }>('select settings from public.esports_tournaments where event_id = $1', [eventId]))[0].settings;
  const save = (uid: string, game: string, id: string, o: { platform?: string; platforms?: string[] | null } = {}) =>
    db.rpc<Json>(uid, 'esports_save_game_id', { p_game: game, p_id: id, p_platform: o.platform ?? '', p_platforms: o.platforms ?? null });
  const platformsOf = async (uid: string, game: string, platform = '') =>
    (await db.admin<{ platforms: string[] }>('select platforms from public.esports_game_ids where user_id = $1 and game = $2 and platform = $3', [uid, game, platform]))[0]
      ?.platforms;
  const setPlatforms = (uid: string, game: string, platforms: string[] | null, platform = '') =>
    db.rpc(uid, 'esports_set_game_platforms', { p_game: game, p_platforms: platforms, p_platform: platform });
  const solo = (uid: string, eventId: string) => db.rpc<string>(uid, 'esports_register_solo', { p_event: eventId });
  const link = (uid: string, game: string, provider: string, external: string, display: string) =>
    db.rpc(SERVICE, 'esports_link_account', { p_user: uid, p_game: game, p_provider: provider, p_external_id: external, p_display: display });

  it('private.esp_game_platforms: la tabla del contrato', async () => {
    const TABLE: [string, string[]][] = [
      ['valorant', ['pc']], ['cs2', ['pc']], ['lol', ['pc']],
      ['mlbb', ['mobile']], ['clash_royale', ['mobile']], ['free_fire', ['mobile']], ['pubg_mobile', ['mobile']],
      ['smash', ['switch']],
      ['rocket_league', ['pc', 'playstation', 'xbox', 'switch']], ['ea_fc', ['pc', 'playstation', 'xbox', 'switch']],
      ['nba_2k', ['pc', 'playstation', 'xbox', 'switch']],
      ['sf6', ['pc', 'playstation', 'xbox']], ['tekken8', ['pc', 'playstation', 'xbox']], ['warzone', ['pc', 'playstation', 'xbox']],
      ['fortnite', ['pc', 'playstation', 'xbox', 'switch', 'mobile']],
      ['tetris', []],
    ];
    const rows = await db.admin<{ g: string; p: string[] }>(
      `select g, private.esp_game_platforms(g) as p from unnest($1::text[]) with ordinality as x (g, n) order by n`,
      [TABLE.map((t) => t[0])],
    );
    expect(rows.map((r) => [r.g, r.p])).toEqual(TABLE);
  });

  it('los ajustes: una plataforma del juego o crossplay (si tiene varias); sin la clave vale; NBA 2K viejo se convierte', async () => {
    const bad: [TOpts, string][] = [
      [{ game: 'valorant', mode: '5v5', settings: { platform: 'crossplay' } }, 'crossplay en un juego de una plataforma'],
      [{ game: 'valorant', mode: '5v5', settings: { platform: 'playstation' } }, 'plataforma de otro juego'],
      [{ settings: { platform: 'mobile' } }, 'Rocket League en el teléfono'],
      [{ settings: { platform: 'psn' } }, 'la plataforma de un ID'],
      [{ settings: { platform: 5 } }, 'no es texto'],
      [{ game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: '' } }, 'NBA 2K vacía'],
      [{ game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'ps5' } }, 'NBA 2K otra'],
    ];
    for (const [o, why] of bad) await fails(createT(w.u.org, o), INVALID).catch((e) => Promise.reject(new Error(`${why}: ${e.message}`)));
    expect(await tSettings((await createT(w.u.org, { game: 'valorant', mode: '5v5', settings: { platform: 'pc' } })).eventId)).toEqual({ platform: 'pc' });
    expect(await tSettings((await createT(w.u.org, { settings: { platform: 'crossplay' } })).eventId)).toEqual({ platform: 'crossplay' });
    expect(await tSettings((await createT(w.u.org, { game: 'fortnite', mode: 'solo', entry: 'open', format: 'br', settings: { platform: 'mobile' } })).eventId)).toEqual({ platform: 'mobile' });
    // NBA 2K ya no exige la clave; la vieja (psn, steam) se convierte; platform '' en los demás juegos se quita.
    const nba = await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open' });
    expect(await tSettings(nba.eventId)).toEqual({});
    expect(await tSettings((await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'psn' } })).eventId)).toEqual({ platform: 'playstation' });
    expect(await tSettings((await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'steam' } })).eventId)).toEqual({ platform: 'pc' });
    expect(await tSettings((await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'xbox' } })).eventId)).toEqual({ platform: 'xbox' });
    expect(await tSettings((await createT(w.u.org, { settings: { platform: '', autoApprove: true } })).eventId)).toEqual({ autoApprove: true });
    // Un torneo que ya existía con lo viejo (como lo convierte la migración).
    await db.admin(`update public.esports_tournaments set settings = '{"platform": "steam"}' where event_id = $1`, [nba.eventId]);
    expect(await tSettings(nba.eventId)).toEqual({ platform: 'pc' });
    await db.rpc(w.u.org, 'esports_update_tournament', { p_event: nba.eventId, p_patch: { settings: { platform: 'switch' } } });
    expect(await tSettings(nba.eventId)).toEqual({ platform: 'switch' });
    // La plataforma que vale (sin la clave: la única o crossplay).
    expect(
      await db.admin(
        `select private.esp_tournament_platform('valorant', '{}') as a, private.esp_tournament_platform('rocket_league', '{}') as b,
                private.esp_tournament_platform('nba_2k', '{"platform": "psn"}') as c, private.esp_tournament_platform('smash', '{"platform": "pc"}') as d`,
      ),
    ).toEqual([{ a: 'pc', b: 'crossplay', c: 'playstation', d: 'switch' }]);
  });

  it('el ID: plataformas solas en los de una plataforma y en NBA 2K; p_platforms; esports_set_game_platforms (también con login)', async () => {
    await save(p[0], 'valorant', 'Juan#LAN');
    expect(await platformsOf(p[0], 'valorant')).toEqual(['pc']);
    await fails(save(p[0], 'clash_royale', '#2PP', { platforms: ['pc'] }), INVALID);
    await save(p[0], 'clash_royale', '#2PP');
    expect(await platformsOf(p[0], 'clash_royale')).toEqual(['mobile']);
    await save(p[0], 'nba_2k', 'KingJames23', { platform: 'psn' });
    await save(p[0], 'nba_2k', 'KingJames23', { platform: 'steam' });
    expect(await platformsOf(p[0], 'nba_2k', 'psn')).toEqual(['playstation']);
    expect(await platformsOf(p[0], 'nba_2k', 'steam')).toEqual(['pc']);
    // Varias plataformas: las que dice (sin repetir, en orden); null deja las que tenía; [] las quita.
    await save(p[0], 'rocket_league', 'Juan RL', { platforms: ['xbox', 'pc', 'xbox'] });
    expect(await platformsOf(p[0], 'rocket_league')).toEqual(['pc', 'xbox']);
    await fails(save(p[0], 'rocket_league', 'Juan RL', { platforms: ['mobile'] }), INVALID);
    await fails(save(p[0], 'rocket_league', 'Juan RL', { platforms: ['ps5'] }), INVALID);
    await save(p[0], 'rocket_league', 'Juan RL 2');
    expect(await platformsOf(p[0], 'rocket_league')).toEqual(['pc', 'xbox']);
    await save(p[0], 'rocket_league', 'Juan RL 2', { platforms: ['switch'] });
    expect(await platformsOf(p[0], 'rocket_league')).toEqual(['switch']);
    await save(p[0], 'rocket_league', 'Juan RL 2', { platforms: [] });
    expect(await platformsOf(p[0], 'rocket_league')).toEqual([]);
    // Lo devuelve esports_my_game_ids.
    const mine = await db.rpc<Json[]>(p[0], 'esports_my_game_ids');
    expect(mine.find((g) => g.game === 'nba_2k' && g.platform === 'psn')).toMatchObject({ platforms: ['playstation'] });
    // Solo las plataformas.
    await setPlatforms(p[0], 'rocket_league', ['playstation', 'pc']);
    expect(await platformsOf(p[0], 'rocket_league')).toEqual(['pc', 'playstation']);
    await fails(setPlatforms(p[0], 'rocket_league', ['mobile']), INVALID);
    await fails(setPlatforms(p[0], 'rocket_league', null), INVALID);
    await fails(setPlatforms(p[0], 'fortnite', ['pc']), 'no_existe');
    await setPlatforms(p[0], 'nba_2k', ['xbox'], 'psn');
    expect(await platformsOf(p[0], 'nba_2k', 'psn')).toEqual(['playstation']);
    // Con login: se cambian igual y conectar otra vez las mantiene.
    await link(p[1], 'rocket_league', 'epic', 'epic-1', 'Ana RL');
    expect(await platformsOf(p[1], 'rocket_league')).toEqual([]);
    await setPlatforms(p[1], 'rocket_league', ['playstation']);
    await link(p[1], 'rocket_league', 'epic', 'epic-1', 'Ana RL Nuevo');
    expect(await platformsOf(p[1], 'rocket_league')).toEqual(['playstation']);
    await link(p[1], 'cs2', 'steam', '76561197960287930', 'Ana CS');
    expect(await platformsOf(p[1], 'cs2')).toEqual(['pc']);
    // La columna es pública (como platform).
    expect(await db.asUser(p[2], 'select platforms from public.esports_game_ids where user_id = $1 and game = $2', [p[1], 'cs2'])).toEqual([{ platforms: ['pc'] }]);
  });

  it('inscribirse solo: sin_plataforma y otra_plataforma (con el nombre); crossplay deja a todos; un juego de una plataforma', async () => {
    const t = await createT(w.u.org, { game: 'ea_fc', mode: '1v1', entry: 'open', settings: { platform: 'playstation' } });
    await fails(solo(p[0], t.eventId), 'sin_id');
    await save(p[1], 'ea_fc', 'Pro_Player.10');
    const e1 = await fails(solo(p[1], t.eventId), 'sin_plataforma');
    expect((e1 as Json).detail).toBe('Jugador 2');
    await save(p[2], 'ea_fc', 'Otro_Player.10', { platforms: ['pc'] });
    expect(((await fails(solo(p[2], t.eventId), 'otra_plataforma')) as Json).detail).toBe('Jugador 3');
    await save(p[3], 'ea_fc', 'Tercer_Player', { platforms: ['pc', 'playstation'] });
    const ok = await solo(p[3], t.eventId);
    expect(await db.admin('select gamer_tag from public.esports_entry_members where entry_id = $1', [ok])).toEqual([{ gamer_tag: 'Tercer_Player' }]);
    // Cambiar las plataformas arregla el suyo.
    await setPlatforms(p[1], 'ea_fc', ['playstation']);
    await solo(p[1], t.eventId);
    // Crossplay: cualquiera (también sin plataformas).
    const cross = await createT(w.u.org, { game: 'ea_fc', mode: '1v1', entry: 'open', settings: { platform: 'crossplay' } });
    await setPlatforms(p[1], 'ea_fc', []);
    await solo(p[1], cross.eventId);
    await solo(p[2], cross.eventId);
    // Sin la clave también es crossplay.
    const free = await createT(w.u.org, { game: 'ea_fc', mode: '1v1', entry: 'open' });
    await solo(p[1], free.eventId);
    // Un juego de una sola plataforma: el ID ya la tiene.
    const cr = await createT(w.u.org, { game: 'clash_royale', mode: '1v1', entry: 'open' });
    await save(p[4], 'clash_royale', '#2PP');
    await solo(p[4], cr.eventId);
  });

  it('NBA 2K: el ID de la plataforma del torneo (otra_plataforma si solo tiene otro); en crossplay, cualquiera', async () => {
    const t = await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'xbox' } });
    await fails(solo(p[0], t.eventId), 'sin_id');
    await save(p[1], 'nba_2k', 'KingJames23', { platform: 'psn' });
    expect(((await fails(solo(p[1], t.eventId), 'otra_plataforma')) as Json).detail).toBe('Jugador 2');
    await save(p[1], 'nba_2k', 'KingXbox23', { platform: 'xbox' });
    const e = await solo(p[1], t.eventId);
    expect(await db.admin('select gamer_tag from public.esports_entry_members where entry_id = $1', [e])).toEqual([{ gamer_tag: 'KingXbox23' }]);
    const old = await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'psn' } }); // → playstation
    await save(p[2], 'nba_2k', 'PlayStation23', { platform: 'psn' });
    await solo(p[2], old.eventId);
    const cross = await createT(w.u.org, { game: 'nba_2k', mode: '1v1', entry: 'open', settings: { platform: 'crossplay' } });
    await solo(p[2], cross.eventId);
  });

  it('equipos: la plantilla con la plataforma del torneo (inscribir y cambiar la plantilla)', async () => {
    // Rocket League en PC: el capitán y dos miembros.
    for (const u of [p[0], p[1], p[2]]) await save(u, 'rocket_league', `RL ${u.slice(0, 8)}`, { platforms: ['pc'] });
    const team = await db.rpc<Json>(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Alfa', p_tag: 'ALF' });
    for (const u of [p[1], p[2]]) await db.rpc(u, 'esports_join_team', { p_code: team.inviteCode });
    const t = await createT(w.u.org, { settings: { platform: 'pc', subs: 1 } });
    await setPlatforms(p[1], 'rocket_league', []);
    const e1 = await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: team.teamId, p_members: [{ user_id: p[1] }] }), 'sin_plataforma');
    expect((e1 as Json).detail).toBe('Jugador 2');
    await setPlatforms(p[1], 'rocket_league', ['xbox']);
    await fails(db.rpc(p[0], 'esports_register_team', { p_event: t.eventId, p_team: team.teamId, p_members: [{ user_id: p[1] }] }), 'otra_plataforma');
    const entryId = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: team.teamId, p_members: [{ user_id: p[2] }] });
    // Cambiar la plantilla pasa por lo mismo.
    await fails(
      db.rpc(p[0], 'esports_set_entry_roster', { p_entry: entryId, p_members: [{ user_id: p[2] }, { user_id: p[1], role: 'sub' }] }),
      'otra_plataforma',
    );
    await setPlatforms(p[1], 'rocket_league', ['pc', 'xbox']);
    await db.rpc(p[0], 'esports_set_entry_roster', { p_entry: entryId, p_members: [{ user_id: p[2] }, { user_id: p[1], role: 'sub' }] });
    // Crossplay: cualquiera.
    await setPlatforms(p[1], 'rocket_league', []);
    const cross = await createT(w.u.org, { settings: { platform: 'crossplay' } });
    await db.rpc(p[0], 'esports_register_team', { p_event: cross.eventId, p_team: team.teamId, p_members: [{ user_id: p[1] }] });
  });

  it('esports_refresh_entry_ids: el capitán todos, cada uno el suyo; con el ID nuevo; solo en inscripción', async () => {
    for (const u of [p[0], p[1], p[2]]) await save(u, 'rocket_league', `RL ${u.slice(0, 8)}`);
    const team = await db.rpc<Json>(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Alfa', p_tag: 'ALF' });
    for (const u of [p[1], p[2]]) await db.rpc(u, 'esports_join_team', { p_code: team.inviteCode });
    const t = await createT(w.u.org, { settings: { subs: 1 } });
    const e = await db.rpc<string>(p[0], 'esports_register_team', { p_event: t.eventId, p_team: team.teamId, p_members: [{ user_id: p[1] }] });
    const tags = async () =>
      Object.fromEntries((await db.admin<{ user_id: string; gamer_tag: string }>('select user_id, gamer_tag from public.esports_entry_members where entry_id = $1', [e])).map((r) => [r.user_id, r.gamer_tag]));
    expect(await db.rpc(p[0], 'esports_refresh_entry_ids', { p_entry: e })).toEqual({ updated: 0 });
    await save(p[0], 'rocket_league', 'Capi Nuevo');
    await save(p[1], 'rocket_league', 'Miembro Nuevo');
    // El miembro: solo el suyo.
    expect(await db.rpc(p[1], 'esports_refresh_entry_ids', { p_entry: e })).toEqual({ updated: 1 });
    expect(await tags()).toEqual({ [p[0]]: `RL ${p[0].slice(0, 8)}`, [p[1]]: 'Miembro Nuevo' });
    // El capitán: todos.
    expect(await db.rpc(p[0], 'esports_refresh_entry_ids', { p_entry: e })).toEqual({ updated: 1 });
    expect(await tags()).toEqual({ [p[0]]: 'Capi Nuevo', [p[1]]: 'Miembro Nuevo' });
    // Quien no está: no_permitido; no existe: no_existe.
    await fails(db.rpc(p[2], 'esports_refresh_entry_ids', { p_entry: e }), DENIED);
    await fails(db.rpc(p[2], 'esports_refresh_entry_ids', { p_entry: uuid() }), 'no_existe');
    // Con el ID nuevo pasa otra vez por esp_member_ok: el torneo ahora es de PS y el miembro no dice dónde juega.
    await db.rpc(w.u.org, 'esports_update_tournament', { p_event: t.eventId, p_patch: { settings: { subs: 1, platform: 'playstation' } } });
    const err = await fails(db.rpc(p[1], 'esports_refresh_entry_ids', { p_entry: e }), 'sin_plataforma');
    expect((err as Json).detail).toBe('Jugador 2');
    // En curso: cerrado.
    await db.rpc(w.u.org, 'esports_update_tournament', { p_event: t.eventId, p_patch: { settings: { subs: 1 } } });
    await db.admin(`update public.esports_tournaments set status = 'live' where event_id = $1`, [t.eventId]);
    await fails(db.rpc(p[0], 'esports_refresh_entry_ids', { p_entry: e }), 'cerrado');
    // Retirada: cerrado.
    await db.admin(`update public.esports_tournaments set status = 'registration' where event_id = $1`, [t.eventId]);
    await db.admin(`update public.esports_entries set status = 'withdrawn' where id = $1`, [e]);
    await fails(db.rpc(p[0], 'esports_refresh_entry_ids', { p_entry: e }), 'cerrado');
  });

  it('esports_link_account: cerrado si juega un torneo en curso y el ID sería otro (el mismo sí); el ID no cambia', async () => {
    await save(p[0], 'rocket_league', 'Mi RL', { platforms: ['pc'] });
    const t = await createT(w.u.org, { mode: '1v1', entry: 'open' });
    const e = await solo(p[0], t.eventId);
    await db.admin(`update public.esports_entries set status = 'approved' where id = $1`, [e]);
    await db.admin(`update public.esports_tournaments set status = 'live' where event_id = $1`, [t.eventId]);
    expect(await db.admin(`select private.esp_id_locked($1, 'rocket_league') as l`, [p[0]])).toEqual([{ l: true }]);
    expect(await link(p[0], 'rocket_league', 'epic', 'epic-otra', 'Otra Cuenta')).toBe('cerrado');
    expect(await db.admin(`select id_display, ownership, platforms from public.esports_game_ids where user_id = $1 and game = 'rocket_league'`, [p[0]])).toEqual([
      { id_display: 'Mi RL', ownership: 'declarado', platforms: ['pc'] },
    ]);
    // El mismo ID (mayúsculas y espacios no importan): se conecta.
    expect(await link(p[0], 'rocket_league', 'epic', 'epic-mia', 'mi  rl')).toBe('ok');
    expect(await db.admin(`select ownership, platforms from public.esports_game_ids where user_id = $1 and game = 'rocket_league'`, [p[0]])).toEqual([
      { ownership: 'login', platforms: ['pc'] },
    ]);
    // Terminado el torneo, se puede conectar otro.
    await db.admin(`update public.esports_tournaments set status = 'finished' where event_id = $1`, [t.eventId]);
    expect(await link(p[0], 'rocket_league', 'epic', 'epic-otra', 'Otra Cuenta')).toBe('ok');
  });

  it('esports-auth: volver se guarda con el state (solo una ruta de la app) y vuelve con esports_link_take', async () => {
    const begin = (volver?: string | null) =>
      db.rpc<string>(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'epic', p_game: 'fortnite', ...(volver === undefined ? {} : { p_volver: volver }) });
    const take = (state: string) => db.rpc<Json | null>(SERVICE, 'esports_link_take', { p_state: state });
    expect(await take(await begin('/esports/t/abc?tab=inscritos'))).toEqual({ userId: p[0], provider: 'epic', game: 'fortnite', volver: '/esports/t/abc?tab=inscritos' });
    // Sin volver (como antes), o uno que no es de la app: sin la clave.
    expect(await take(await begin())).toEqual({ userId: p[0], provider: 'epic', game: 'fortnite' });
    for (const bad of ['//evil.com/x', 'https://evil.com', 'esports', '/a b', '/\\evil', `/${'x'.repeat(200)}`]) {
      expect(await take(await begin(bad)), bad).toEqual({ userId: p[0], provider: 'epic', game: 'fortnite' });
      await db.admin(`delete from private.rate_limits where key = $1`, [`esp_link:${p[0]}`]);
    }
    // La tabla tampoco acepta otra cosa.
    await fails(db.admin(`insert into private.esports_link_states (user_id, provider, game, volver) values ($1, 'epic', 'fortnite', '//evil.com')`, [p[0]]), '23514');
    await fails(db.rpc(p[0], 'esports_link_begin', { p_user: p[0], p_provider: 'epic', p_game: 'fortnite', p_volver: '/x' }), '42501');
  });
});
