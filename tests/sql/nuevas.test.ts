/**
 * Casos nuevos de MatchMate (no existían en BowlingX): menores, deporte fijo y en beta, op_id que no
 * duplica, league_id que no se puede falsear, dueño y cuentas, límites de invitación, y lo que mantienen
 * los triggers (tombstones, updated_at, inscritos, cola de fotos).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
});
afterEach(async () => {
  await db.rollback();
});

const photo = () => ({ id: randomUUID(), width: 10, height: 10, bytes: 1000 });

describe('menores', () => {
  /** Liga privada con menores (sin foto obligatoria), dueño org, luis miembro con jugador. */
  async function minorsLeague() {
    const lid = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const luis = await player(db, lid, 'Luis', w.u.luis);
    const e = await event(db, lid, 'practica', '2026-09-22');
    const en = await entry(db, lid, e, luis, [150], ['sin-foto']);
    return { lid, luis, e, en };
  }

  it('un menor solo existe en una liga con menores, y queda el consentimiento del tutor', async () => {
    await fails(db.rpc(w.u.org, 'create_player', { p_league: w.priv, p_name: 'Nene', p_is_minor: true }), INVALID);
    await fails(db.rpc(w.u.org, 'update_player', { p_player: w.p.pedro, p_patch: { is_minor: true } }), INVALID);
    const { lid } = await minorsLeague();
    const kid = await db.rpc<string>(w.u.org, 'create_player', { p_league: lid, p_name: 'Nene', p_is_minor: true, p_guardian_name: 'Mamá', p_consent: true });
    expect(await db.admin('select guardian_name, consent_by, consent_at is not null as consent from public.player_private where player_id = $1', [kid])).toEqual([
      { guardian_name: 'Mamá', consent_by: w.u.org, consent: true },
    ]);
    // Los datos privados solo los ven los admins.
    expect(await db.asUser(w.u.luis, 'select player_id from public.player_private')).toHaveLength(0);
    expect(await db.asUser(w.u.org, 'select player_id from public.player_private')).toHaveLength(1);
  });

  it('una liga con menores es privada y sin foto obligatoria', async () => {
    await fails(db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { has_minors: true } }), INVALID);
    await db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { has_minors: true, require_photo: false } });
    await fails(db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { visibility: 'public' } }), INVALID);
    await fails(db.rpc(w.u.org, 'create_league', { p_name: 'Pública con menores', p_visibility: 'public', p_has_minors: true }), INVALID);
  });

  it('has_minors solo sube: bajarlo es del superadmin y sin menores adentro', async () => {
    const { lid } = await minorsLeague();
    const kid = await db.rpc<string>(w.u.org, 'create_player', { p_league: lid, p_name: 'Nene', p_is_minor: true, p_guardian_name: 'Mamá', p_consent: true });
    await fails(db.rpc(w.u.org, 'update_league', { p_league: lid, p_patch: { has_minors: false } }), DENIED);
    await fails(db.rpc(w.u.dios, 'update_league', { p_league: lid, p_patch: { has_minors: false } }), INVALID);
    await db.rpc(w.u.org, 'delete_player', { p_player: kid });
    await db.rpc(w.u.dios, 'update_league', { p_league: lid, p_patch: { has_minors: false } });
    expect(await db.admin('select has_minors from public.leagues where id = $1', [lid])).toEqual([{ has_minors: false }]);
  });

  it('los menores no tienen cuenta, y en su liga no hay fotos ni social', async () => {
    const { lid, e, en } = await minorsLeague();
    const kid = await db.rpc<string>(w.u.org, 'create_player', { p_league: lid, p_name: 'Ana', p_is_minor: true, p_guardian_name: 'Papá', p_consent: true });
    await member(db, lid, w.u.ana, 'member', 'ana');
    // Ni reclamarlo, ni vincularlo, ni el enlace automático por nombre.
    await fails(db.rpc(w.u.ana, 'claim_player', { p_player: kid }), INVALID);
    await fails(db.rpc(w.u.org, 'link_account_to_player', { p_player: kid, p_user: w.u.ana }), INVALID);
    const own = await db.rpc<string>(w.u.ana, 'ensure_my_player', { p_league: lid });
    expect(own).not.toBe(kid);
    await fails(db.admin('update public.players set user_id = $1 where id = $2', [w.u.org, kid]), '23514');
    // Sin social ni fotos.
    await fails(db.rpc(w.u.ana, 'set_reaction', { p_entry: en, p_type: 'like' }), DENIED);
    await fails(db.rpc(w.u.ana, 'add_comment', { p_entry: en, p_text: 'Hola' }), DENIED);
    await fails(db.rpc(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: lid, p_event: e, p_scores: [150], p_photo: photo() }), DENIED);
    await fails(db.rpc(w.u.org, 'add_photo', { p_league: lid }), DENIED);
    // Enviar sin foto sí.
    await db.rpc(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: lid, p_event: e, p_scores: [150] });
  });
});

describe('deporte', () => {
  it('el deporte de una liga es fijo', async () => {
    await fails(db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { sport: 'padel' } }), INVALID);
    // Ni con service_role (lo impide un trigger).
    await fails(db.asService(`update public.leagues set sport = 'padel' where id = $1`, [w.priv]), 'invalido');
    expect(await db.admin('select sport from public.leagues where id = $1', [w.priv])).toEqual([{ sport: 'bowling' }]);
  });

  it('un deporte en beta solo lo crea el superadmin; cerrado, nadie', async () => {
    // Todos están abiertos (20260929001000_sueltos_logos.sql): el superadmin pone el pádel en beta.
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'padel', p_status: 'beta' });
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'Pádel', p_sport: 'padel' }), DENIED);
    const r = await db.rpc<{ league_id: string }>(w.u.dios, 'create_league', { p_name: 'Pádel', p_sport: 'padel' });
    expect(await db.admin('select sport from public.leagues where id = $1', [r.league_id])).toEqual([{ sport: 'padel' }]);
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'Curling', p_sport: 'curling' }), INVALID);
    // Abrir o cerrar un deporte es del superadmin.
    await fails(db.rpc(w.u.nuevo, 'set_sport_status', { p_sport: 'padel', p_status: 'open' }), DENIED);
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'padel', p_status: 'open' });
    await db.rpc(w.u.nuevo, 'create_league', { p_name: 'Pádel abierto', p_sport: 'padel' });
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'golf', p_status: 'closed' });
    await fails(db.rpc(w.u.dios, 'create_league', { p_name: 'Golf', p_sport: 'golf' }), 'cerrado');
    // Todos ven qué deportes hay.
    expect((await db.asAnon('select id from public.sport_status')).length).toBe(11);
  });

  it('el tipo de evento y los números siguen las reglas del deporte', async () => {
    await fails(db.rpc(w.u.org, 'create_event', { p_league: w.priv, p_type: 'americano', p_date: '2026-10-01' }), INVALID);
    await fails(db.rpc(w.u.org, 'create_event', { p_league: w.priv, p_type: 'torneo', p_date: '2026-10-01', p_games: 11 }), INVALID);
    await fails(db.rpc(w.u.org, 'create_event', { p_league: w.priv, p_type: 'torneo', p_date: '2026-10-01', p_category_cuts: [200, 175, 400] }), INVALID);
    // Aunque escriba service_role, los pinos del boliche van de 0 a 300 y hasta 10 juegos.
    await fails(db.asService('update public.entries set scores = $1 where id = $2', [[301], w.e1Luis]), 'invalido');
    await fails(db.asService('update public.entries set scores = $1 where id = $2', [Array(11).fill(1), w.e1Luis]), 'invalido');
  });
});

describe('op_id: reintentar no duplica', () => {
  it('submit_games con el mismo op_id devuelve el mismo envío (y la misma foto)', async () => {
    const op = randomUUID();
    const args = { p_op_id: op, p_league: w.priv, p_event: w.e.e1, p_scores: [150, 160], p_photo: photo() };
    const a = await db.rpc<string>(w.u.luis, 'submit_games', args);
    const b = await db.rpc<string>(w.u.luis, 'submit_games', args);
    expect(b).toBe(a);
    expect(await db.count('public.submissions')).toBe(1);
    expect(await db.count('public.photos')).toBe(1);
    // El op_id de otra cuenta no sirve para ver ni repetir lo ajeno.
    await member(db, w.priv, w.u.nuevo, 'member', 'new');
    await player(db, w.priv, 'New', w.u.nuevo);
    await fails(db.rpc(w.u.nuevo, 'submit_games', { ...args, p_photo: null }), 'duplicado');
    // Sin op_id no se acepta (la cola siempre lo manda).
    await fails(db.rpc(w.u.luis, 'submit_games', { ...args, p_op_id: null }), INVALID);
  });

  it('+1 juego y «voy» con op_id: el reintento no suma otra vez', async () => {
    const op = randomUUID();
    expect(await db.rpc(w.u.luis, 'add_practice_game', { p_event: w.e.e1, p_op_id: op })).toBe(4);
    expect(await db.rpc(w.u.luis, 'add_practice_game', { p_event: w.e.e1, p_op_id: op })).toBe(4);
    expect(await db.admin('select games from public.events where id = $1', [w.e.e1])).toEqual([{ games: 4 }]);
    const rsvp = randomUUID();
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: true, p_op_id: rsvp });
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: true, p_op_id: rsvp });
    expect(await db.count('public.event_rsvps')).toBe(1);
    // El mismo op_id en otra función es un error (no un "ya hecho").
    await fails(db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e1, p_scores: [1], p_op_id: op }), 'duplicado');
  });

  it('un op_id que falló se puede reintentar (no queda guardado)', async () => {
    const op = randomUUID();
    await fails(db.rpc(w.u.luis, 'submit_games', { p_op_id: op, p_league: w.priv, p_event: w.e.e1, p_scores: [999] }), INVALID);
    expect(await db.count('private.op_log', 'op_id = $1', [op])).toBe(0);
    const id = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: op, p_league: w.priv, p_event: w.e.e1, p_scores: [199] });
    expect(await db.admin('select result from private.op_log where op_id = $1', [op])).toEqual([{ result: id }]);
  });
});

describe('league_id siempre verificado', () => {
  it('las tablas no aceptan la liga de uno con el evento o el jugador de otra (ni con service_role)', async () => {
    const q = (sql: string, params: unknown[]) => fails(db.as(SERVICE, sql, params), '23503');
    await q('insert into public.entries (league_id, event_id, player_id) values ($1, $2, $3)', [w.pub, w.e.e1, w.p.p1]);
    await q('insert into public.entries (league_id, event_id, player_id) values ($1, $2, $3)', [w.priv, w.e.e1, w.p.p1]);
    await q(`insert into public.live_states (event_id, subject_key, league_id, player_id, state) values ($1, $2, $3, $4, '{}')`, [
      w.e.e9,
      `p:${w.p.luis}`,
      w.pub,
      w.p.luis,
    ]);
    await q('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)', [w.e.e1, w.p.p1, w.priv]);
    await q(`insert into public.submissions (league_id, player_id, event_id, scores) values ($1, $2, $3, '{1}')`, [w.pub, w.p.p1, w.e.e1]);
    await q(`insert into public.teams (league_id, event_id, name) values ($1, $2, 'X')`, [w.pub, w.e.e1]);
    await q(`insert into public.photos (id, league_id, event_id, path) values ($1, $2, $3, $4)`, [
      '11111111-1111-4111-8111-111111111111',
      w.pub,
      w.e.e1,
      `${w.pub}/11111111-1111-4111-8111-111111111111.webp`,
    ]);
    // Un jugador solo se vincula a un miembro de SU liga.
    await q('update public.players set user_id = $1 where id = $2', [w.u.luis, w.p.p1]);
  });

  it('las RPC sacan la liga del evento, jugador o participación (no del cliente)', async () => {
    await fails(db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e9, p_scores: [100] }), DENIED);
    const e9p1 = await entry(db, w.pub, w.e.e9, w.p.p1, [200], ['sin-foto']);
    await fails(db.rpc(w.u.sofi, 'update_entry', { p_entry: e9p1, p_patch: { scores: [1] } }), DENIED);
    await fails(db.rpc(w.u.sofi, 'add_entries', { p_event: w.e.e1, p_players: [{ player_id: w.p.p1, average: 0 }] }), '23503');
    await fails(db.rpc(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_event: w.e.e9, p_scores: [1] }), 'no_existe');
    // La foto va a la carpeta de su liga: la ruta sale del id y la liga.
    await fails(
      db.as(SERVICE, `insert into public.photos (id, league_id, path) values ($1, $2, $3)`, [
        '22222222-2222-4222-8222-222222222222',
        w.priv,
        `${w.pub}/22222222-2222-4222-8222-222222222222.webp`,
      ]),
      '23514',
    );
  });
});

describe('dueño y cuentas', () => {
  it('el dueño no sale de la liga: la traspasa (y queda de admin)', async () => {
    await fails(db.rpc(w.u.org, 'leave_league', { p_league: w.priv }), DENIED);
    await fails(db.rpc(w.u.sofi, 'transfer_ownership', { p_league: w.priv, p_user: w.u.sofi }), DENIED);
    await fails(db.rpc(w.u.org, 'transfer_ownership', { p_league: w.priv, p_user: w.u.nuevo }), 'no_existe');
    await db.rpc(w.u.org, 'transfer_ownership', { p_league: w.priv, p_user: w.u.sofi });
    expect(await db.admin('select owner_id from public.leagues where id = $1', [w.priv])).toEqual([{ owner_id: w.u.sofi }]);
    expect(await db.admin(`select user_id, role from public.league_members where league_id = $1 and role <> 'member' order by role`, [w.priv])).toEqual([
      { user_id: w.u.org, role: 'admin' },
      { user_id: w.u.sofi, role: 'owner' },
    ]);
    await db.rpc(w.u.org, 'leave_league', { p_league: w.priv });
    // Cambiar el dueño a mano no se puede ni con service_role (solo por transfer_ownership).
    await fails(db.as(SERVICE, 'update public.leagues set owner_id = $1 where id = $2', [w.u.luis, w.priv]), 'no_permitido');
  });

  it('la cuenta de un dueño no se borra sin traspasar; la de un miembro sí y suelta su jugador', async () => {
    await fails(db.admin('delete from auth.users where id = $1', [w.u.org]), '23001');
    await db.rpc(w.u.luis, 'add_comment', { p_entry: w.e1Luis, p_text: 'Hola' });
    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.luis])).toEqual([{ user_id: null }]);
    expect(await db.count('public.entries', 'player_id = $1', [w.p.luis])).toBe(1);
    expect(await db.count('public.comments')).toBe(0);
  });

  it('el perfil se crea siempre, aunque el nombre de Google venga vacío o largo', async () => {
    const name = async (id: string) => (await db.admin<{ name: string }>('select name from public.profiles where id = $1', [id]))[0]?.name;
    expect(await name(await db.createUser('maria.perez@gmail.com', null, { full_name: '   ' }))).toBe('maria.perez');
    expect(await name(await db.createUser('largo@x.com', null, { full_name: 'x'.repeat(80) }))).toBe('x'.repeat(60));
    expect(await name(await db.createUser('g@x.com', null, { full_name: 'María Pérez', avatar_url: 'x' }))).toBe('María Pérez');
    expect(await name(await db.createUser(null as unknown as string, null))).toBe('Jugador');
    const adult = await db.createUser('adulto@x.com', 'Adulto', { adult: true });
    expect(await db.admin('select adult_confirmed_at is not null as ok from public.profiles where id = $1', [adult])).toEqual([{ ok: true }]);
    // Si el perfil faltara, ensure_profile lo crea.
    await db.admin('delete from public.profiles where id = $1', [adult]);
    await db.rpc(adult, 'ensure_profile');
    expect(await name(adult)).toBe('Adulto');
    // El correo sigue al de Auth.
    await db.admin(`update auth.users set email = 'nuevo@x.com' where id = $1`, [adult]);
    expect(await db.admin('select email from public.profiles where id = $1', [adult])).toEqual([{ email: 'nuevo@x.com' }]);
  });
});

describe('invitaciones con límite de intentos', () => {
  it('join_league: 10 códigos malos por hora y después ni el bueno', async () => {
    for (let i = 0; i < 10; i++) expect(await db.rpc(w.u.otra, 'join_league', { p_code: `MALO${2345 + i}` })).toBeNull();
    await fails(db.rpc(w.u.otra, 'join_league', { p_code: 'ABCD2345' }), 'rate_limited');
    // Otra cuenta no está frenada; y una liga pública no pide código.
    expect(await db.rpc(w.u.extra, 'join_league', { p_code: 'ABCD2345' })).toMatchObject({ league_id: w.priv });
    expect(await db.rpc(w.u.otra, 'join_league', { p_league: w.pub })).toMatchObject({ league_id: w.pub });
    // Pasada la hora, vuelve a poder.
    await db.admin(`update private.rate_limits set window_start = now() - interval '2 hours'`);
    expect(await db.rpc(w.u.otra, 'join_league', { p_code: 'ABCD2345' })).toMatchObject({ league_id: w.priv });
  });

  it('invite_preview: solo id, nombre, deporte, tipo y logo; 30 malos por hora', async () => {
    for (let i = 0; i < 30; i++) expect(await db.rpcRows(ANON, 'invite_preview', { p_code: `MAL${i}` })).toEqual([]);
    await fails(db.rpcRows(ANON, 'invite_preview', { p_code: 'ABCD2345' }), 'rate_limited');
    // Con cuenta el límite es de la cuenta.
    expect(await db.rpcRows(w.u.luis, 'invite_preview', { p_code: 'ABCD2345' })).toEqual([
      { league_id: w.priv, name: 'Liga del Banco', sport: 'bowling', kind: 'liga', visibility: 'private', logo_path: null },
    ]);
  });

  it('unirse con un jugador preferido o con el mismo nombre deja el pedido (el admin lo aprueba y conserva sus juegos)', async () => {
    const r = await db.rpc<{ player_id: string; claim_id: string }>(w.u.nuevo, 'join_league', { p_league: w.priv, p_code: 'ABCD2345', p_prefer: w.p.pedro });
    expect(r.player_id).not.toBe(w.p.pedro);
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: r.claim_id, p_approve: true })).toBe('approved');
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.pedro])).toEqual([{ user_id: w.u.nuevo }]);
    // Mismo nombre normalizado (sin acentos ni mayúsculas): también queda pedido.
    const jose = await player(db, w.pub, 'José  Peña');
    const u = await db.createUser('jose@x.com', 'jose pena');
    const rj = await db.rpc<{ player_id: string; claim_id: string }>(u, 'join_league', { p_league: w.pub });
    expect(rj.player_id).not.toBe(jose);
    expect(await db.admin('select player_id, status from public.player_claims where id = $1', [rj.claim_id])).toEqual([{ player_id: jose, status: 'pending' }]);
    // Dos jugadores libres con el mismo nombre: no adivina, crea uno nuevo.
    await player(db, w.pub, 'Ana');
    await player(db, w.pub, 'ANA');
    const a = await db.rpc<{ player_id: string }>(w.u.ana, 'join_league', { p_league: w.pub });
    expect(await db.admin('select name from public.players where id = $1', [a.player_id])).toEqual([{ name: 'ana' }]);
  });
});

describe('lo que mantienen los triggers', () => {
  it('borrar deja tombstones; borrar la liga deja solo el de la liga', async () => {
    await db.rpc(w.u.sofi, 'delete_player', { p_player: w.p.pedro });
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: true });
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: false });
    expect(await db.asUser(w.u.luis, 'select tbl, row_key from public.tombstones where league_id = $1 order by id', [w.priv])).toEqual([
      { tbl: 'players', row_key: w.p.pedro },
      { tbl: 'event_rsvps', row_key: `${w.e.e1}:${w.p.luis}` },
    ]);
    // Quien no ve la liga no ve sus borrados.
    expect(await db.asUser(w.u.extra, 'select id from public.tombstones where league_id = $1', [w.priv])).toHaveLength(0);
    // Los de miembros solo los ven los miembros (también en una liga pública), y los del buzón los admins.
    await db.rpc(w.u.nuevo, 'join_league', { p_league: w.pub });
    await db.rpc(w.u.nuevo, 'leave_league', { p_league: w.pub });
    expect(await db.asAnon(`select row_key from public.tombstones where league_id = $1 and tbl = 'league_members'`, [w.pub])).toHaveLength(0);
    expect(await db.asUser(w.u.otro, `select row_key from public.tombstones where league_id = $1 and tbl = 'league_members'`, [w.pub])).toEqual([
      { row_key: `${w.pub}:${w.u.nuevo}` },
    ]);
    const note = await db.rpc<string>(w.u.luis, 'send_suggestion', { p_league: w.priv, p_text: 'Idea' });
    await db.rpc(w.u.sofi, 'delete_suggestion', { p_suggestion: note });
    expect(await db.asUser(w.u.luis, `select id from public.tombstones where tbl = 'suggestions'`)).toHaveLength(0);
    expect(await db.asUser(w.u.sofi, `select row_key from public.tombstones where tbl = 'suggestions'`)).toEqual([{ row_key: note }]);
    await db.admin('delete from public.tombstones');
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await db.admin('select tbl, row_key from public.tombstones')).toEqual([{ tbl: 'leagues', row_key: w.priv }]);
  });

  it('updated_at se pone solo en cada cambio', async () => {
    await db.admin(`update public.players set updated_at = '2020-01-01' where id = $1`, [w.p.pedro]);
    await db.rpc(w.u.sofi, 'update_player', { p_player: w.p.pedro, p_patch: { average_override: 185.5 } });
    expect(await db.admin('select updated_at = now() as fresh, average_override from public.players where id = $1', [w.p.pedro])).toEqual([
      { fresh: true, average_override: 185.5 },
    ]);
  });

  it('events.player_count cuenta los inscritos', async () => {
    const count = async () => (await db.admin<{ n: number }>('select player_count as n from public.events where id = $1', [w.e.e1]))[0].n;
    expect(await count()).toBe(1);
    expect(await db.rpc(w.u.sofi, 'add_entries', { p_event: w.e.e1, p_players: [{ player_id: w.p.pedro, average: 180 }, { player_id: w.p.luis, average: 1 }] })).toBe(1);
    expect(await count()).toBe(2);
    expect(await db.admin('select average, scores, photos from public.entries where player_id = $1', [w.p.pedro])).toEqual([
      { average: 180, scores: [null, null, null], photos: [null, null, null] },
    ]);
    await db.rpc(w.u.sofi, 'remove_entry', { p_entry: w.e1Luis });
    expect(await count()).toBe(1);
  });

  it('borrar fotos viejas devuelve las rutas y las deja en la cola de Storage', async () => {
    const r = await db.rpc<{ id: string; path: string }>(w.u.sofi, 'add_photo', { p_league: w.priv, p_event: w.e.e1, p_content_type: 'image/jpeg' });
    expect(r.path).toBe(`${w.priv}/${r.id}.jpg`);
    await db.rpc(w.u.sofi, 'add_photo', { p_league: w.priv });
    await db.admin(`update public.photos set created_at = now() - interval '7 months' where id = $1`, [r.id]);
    await fails(db.rpc(w.u.luis, 'delete_old_photos', { p_league: w.priv, p_months: 6 }), DENIED);
    expect(await db.rpc(w.u.sofi, 'delete_old_photos', { p_league: w.priv, p_months: 6 })).toEqual([r.path]);
    expect(await db.admin('select path from private.storage_purge_queue')).toEqual([{ path: r.path }]);
    expect(await db.count('public.photos')).toBe(1);
    await fails(db.rpc(w.u.sofi, 'add_photo', { p_league: w.priv, p_content_type: 'image/png' }), INVALID);
  });
});

describe('flujos del admin', () => {
  it('apply_teams reutiliza (y renombra) equipos, crea los que faltan y borra los que sobran', async () => {
    const t9 = await event(db, w.priv, 'torneo', '2026-10-10', 3, 'Copa');
    const a = await entry(db, w.priv, t9, w.p.luis, [], []);
    const b = await entry(db, w.priv, t9, w.p.pedro, [], []);
    const old1 = await db.rpc<string>(w.u.sofi, 'add_team', { p_event: t9, p_name: 'Equipo 1' });
    const old2 = await db.rpc<string>(w.u.sofi, 'add_team', { p_event: t9, p_name: 'Equipo 2' });
    await db.rpc(w.u.sofi, 'update_entry', { p_entry: b, p_patch: { team_id: old2 } });
    const teams = await db.rpc<string[]>(w.u.sofi, 'apply_teams', {
      p_event: t9,
      p_groups: [
        { team_id: old1, name: 'Los Tigres', entry_ids: [a] },
        { team_id: null, name: 'Nuevos', entry_ids: [b] },
      ],
    });
    expect(teams[0]).toBe(old1);
    expect(await db.admin('select id, name from public.teams where event_id = $1 order by sort_order', [t9])).toEqual([
      { id: old1, name: 'Los Tigres' },
      { id: teams[1], name: 'Nuevos' },
    ]);
    expect(await db.admin('select id, team_id from public.entries where event_id = $1 order by team_id = $2 desc', [t9, old1])).toEqual([
      { id: a, team_id: old1 },
      { id: b, team_id: teams[1] },
    ]);
    // Un equipo de otro evento no vale.
    await fails(db.rpc(w.u.sofi, 'update_entry', { p_entry: w.e1Luis, p_patch: { team_id: old1 } }), INVALID);
    await fails(db.rpc(w.u.luis, 'apply_teams', { p_event: t9, p_groups: [] }), DENIED);
    await db.rpc(w.u.sofi, 'delete_team', { p_team: old1 });
    expect(await db.admin('select team_id from public.entries where id = $1', [a])).toEqual([{ team_id: null }]);
  });

  it('vincular pasa lo pendiente al jugador nuevo y deja el viejo si ya jugó', async () => {
    // Ana tiene su jugador con un juego y cosas pendientes.
    const auto = await player(db, w.priv, 'Ana', w.u.ana);
    await entry(db, w.priv, w.e.e1, auto, [120], ['sin-foto']);
    const pending = await db.rpc<string>(w.u.ana, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_event: w.e.e1, p_scores: [130] });
    const done = await db.rpc<string>(w.u.ana, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_event: w.e.e1, p_scores: [140] });
    await db.rpc(w.u.sofi, 'reject_submission', { p_submission: done, p_note: 'Sin foto' });
    await db.rpc(w.u.ana, 'set_rsvp', { p_event: w.e.e1, p_going: true });
    expect(await db.rpc(w.u.sofi, 'link_account_to_player', { p_player: w.p.pedro, p_user: w.u.ana })).toEqual({ removed_old: false, old_player_id: auto });
    expect(await db.admin('select id, player_id from public.submissions order by player_id = $1 desc', [w.p.pedro])).toEqual([
      { id: pending, player_id: w.p.pedro },
      { id: done, player_id: auto },
    ]);
    expect(await db.admin('select player_id from public.event_rsvps')).toEqual([{ player_id: w.p.pedro }]);
    expect(await db.admin('select user_id from public.players where id = $1', [auto])).toEqual([{ user_id: null }]);
    expect(await db.admin('select note, reviewed_by from public.submissions where id = $1', [done])).toEqual([{ note: 'Sin foto', reviewed_by: w.u.sofi }]);
  });

  it('aprobar un envío por fecha lo pone en la práctica de ese día (y la crea si no hay)', async () => {
    const f = photo();
    const s = await db.rpc<string>(w.u.luis, 'submit_games', {
      p_op_id: randomUUID(),
      p_league: w.priv,
      p_date: '2026-09-30',
      p_scores: [150, 160, 170, 180],
      p_photo: f,
    });
    const r = await db.rpc<{ entry_id: string; event_id: string }>(w.u.sofi, 'approve_submission', {
      p_submission: s,
      p_values: { '0': 150, '1': 160, '2': 170, '3': 180 },
      p_average: 175,
    });
    expect(await db.admin('select type, date::text, games from public.events where id = $1', [r.event_id])).toEqual([
      { type: 'practica', date: '2026-09-30', games: 4 },
    ]);
    expect(await db.admin('select average, scores, photos from public.entries where id = $1', [r.entry_id])).toEqual([
      { average: 175, scores: [150, 160, 170, 180], photos: [f.id, f.id, f.id, f.id] },
    ]);
    expect(await db.admin('select event_id from public.photos where id = $1', [f.id])).toEqual([{ event_id: r.event_id }]);
    expect(await db.admin('select status, event_id, date::text from public.submissions where id = $1', [s])).toEqual([
      { status: 'aprobado', event_id: r.event_id, date: '2026-09-30' },
    ]);
    // Un segundo envío de ese día va a la misma práctica.
    const s2 = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_date: '2026-09-30', p_scores: [100] });
    const r2 = await db.rpc<{ event_id: string }>(w.u.sofi, 'approve_submission', { p_submission: s2, p_values: { '3': 100 } });
    expect(r2.event_id).toBe(r.event_id);
    await fails(db.rpc(w.u.sofi, 'approve_submission', { p_submission: s2, p_values: { '4': 100 } }), INVALID);
  });

  it('save_verified_games verifica con la foto e inscribe a quien falta', async () => {
    const f = photo();
    expect(
      await db.rpc(w.u.sofi, 'save_verified_games', {
        p_event: w.e.e1,
        p_photo: f,
        p_writes: [
          { player_id: w.p.luis, values: { '1': 190 } },
          { player_id: w.p.pedro, average: 170, values: { '0': 200, '2': 210 } },
        ],
      }),
    ).toBe(f.id);
    expect(await db.admin('select player_id, average, scores, photos from public.entries where event_id = $1 order by player_id = $2 desc', [w.e.e1, w.p.luis])).toEqual([
      { player_id: w.p.luis, average: 0, scores: [150, 190, null], photos: [null, f.id, null] },
      { player_id: w.p.pedro, average: 170, scores: [200, null, 210], photos: [f.id, null, f.id] },
    ]);
  });

  it('memberships y el perfil global: cada cuenta ve sus ligas con su jugador', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    expect(await db.asUser(w.u.luis, 'select league_id, role, player_id from public.memberships where user_id = $1 order by league_id = $2 desc', [w.u.luis, w.priv])).toEqual([
      { league_id: w.priv, role: 'member', player_id: w.p.luis },
      { league_id: w.pub, role: 'member', player_id: null },
    ]);
  });

  it('el mismo teléfono con otra cuenta pasa la suscripción a la cuenta nueva', async () => {
    const sub = { p_endpoint: 'https://fcm.googleapis.com/fcm/send/tel', p_p256dh: 'k', p_auth: 'a' };
    const id = await db.rpc<string>(w.u.ana, 'upsert_push_subscription', sub);
    expect(await db.rpc(w.u.luis, 'upsert_push_subscription', sub)).toBe(id);
    expect(await db.admin('select user_id from public.push_subscriptions')).toEqual([{ user_id: w.u.luis }]);
    expect(await db.asUser(w.u.ana, 'select id from public.push_subscriptions')).toHaveLength(0);
  });

  it('ping solo con la clave secreta', async () => {
    await fails(db.rpc(w.u.dios, 'ping'), '42501');
    await fails(db.rpc(ANON, 'ping'), '42501');
    expect(await db.rpc(SERVICE, 'ping')).toBeTruthy();
  });
});
