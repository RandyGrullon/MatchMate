/**
 * Boliche: equipos fijos de la liga, la práctica abierta y las bolas con catálogo y layout
 * (20261013000100_boliche_equipos_practicas_bolas.sql; contrato en docs/boliche-equipos-practicas-bolas.md).
 *
 * - Equipos fijos: set_bowling_teams, save_bowling_team, delete_bowling_team, la copia en cada torneo al inscribirse
 *   (trigger en entries) y apply_league_teams. Las prácticas no cambian.
 * - open_practice (hoy desde la hora de la liga, o ayer) y el cierre de las prácticas de antes de ayer para quien no es
 *   admin (submit_games con el evento o por fecha, add_practice_game, publish_live).
 * - set_ball_details (catálogo y layout, con private.ball_layout_ok) y my_balls con catalog y layout.
 *
 * Mundo (fixture): liga privada del Banco (boliche; org dueño, sofi admin, luis y ana miembros; luis y Pedro (sin cuenta)
 * juegan; ana no tiene jugador; práctica e1 del 2026-09-22) y liga pública Abierta de otro (jugador p1). extra no está en
 * ninguna liga; dios es superadmin.
 *
 * El reloj: cada prueba corre en una transacción, así que now() no se mueve dentro de ella. Para la hora de la práctica
 * se pone la liga en una zona donde ahora son las 12 y pico (Etc/GMT±n) y un horario antes o después de esa hora.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;
/** Más jugadores de la liga del Banco (sin cuenta). */
let p: { marta: string; juan: string; rosa: string; pedro: string; luis: string };

type Json = Record<string, any>;

const NEW_RPC = ['apply_league_teams', 'delete_bowling_team', 'open_practice', 'save_bowling_team', 'set_ball_details', 'set_bowling_teams'];

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  p = {
    marta: await player(db, w.priv, 'Marta'),
    juan: await player(db, w.priv, 'Juan'),
    rosa: await player(db, w.priv, 'Rosa'),
    pedro: w.p.pedro,
    luis: w.p.luis,
  };
});
afterEach(async () => {
  await db.rollback();
});

// ---------- Ayudas ----------

const setTeams = (who: string, teams: unknown, lid = w.priv) => db.rpc<string[]>(who, 'set_bowling_teams', { p_league: lid, p_teams: JSON.stringify(teams) });
const saveTeam = (who: string, args: { id?: string | null; name: string; color?: string | null; players?: string[] | null }, lid = w.priv) =>
  db.rpc<string>(who, 'save_bowling_team', {
    p_league: lid,
    p_id: args.id ?? null,
    p_name: args.name,
    p_color: args.color ?? null,
    p_players: args.players === undefined ? [] : args.players,
  });
/** Los equipos fijos de la liga con su plantilla (ordenada), en su orden. */
const fixed = async (lid = w.priv) =>
  db.admin<{ id: string; name: string; color: string | null; sort_order: number; season_id: string | null; players: string[] }>(
    `select t.id, t.name, t.color, t.sort_order, t.season_id,
            coalesce((select array_agg(tp.player_id::text order by tp.player_id) from public.team_players tp where tp.team_id = t.id), '{}') as players
       from public.teams t where t.league_id = $1 and t.event_id is null order by t.sort_order, t.created_at`,
    [lid],
  );
const sorted = (ids: string[]) => [...ids].sort();
/** Los equipos de un evento. */
const eventTeams = (ev: string) =>
  db.admin<{ id: string; name: string; color: string | null; league_team_id: string | null; sort_order: number }>(
    'select id, name, color, league_team_id, sort_order from public.teams where event_id = $1 order by sort_order, created_at',
    [ev],
  );
/** El equipo de la inscripción de cada jugador en el evento. */
const teamOf = async (ev: string, pid: string) =>
  (await db.admin<{ team_id: string | null }>('select team_id from public.entries where event_id = $1 and player_id = $2', [ev, pid]))[0]?.team_id ?? null;
const enter = (ev: string, players: string[], who = w.u.org) =>
  db.rpc<number>(who, 'add_entries', { p_event: ev, p_players: JSON.stringify(players.map((x) => ({ player_id: x, average: 180 }))) });

/** Hoy (o `n` días antes; negativo: después) en una zona, 'YYYY-MM-DD'. */
const dayIn = async (tz: string, n = 0) =>
  (await db.admin<{ d: string }>(`select to_char((now() at time zone $1)::date - $2::integer, 'YYYY-MM-DD') as d`, [tz, n]))[0].d;
const RD = 'America/Santo_Domingo';

/** Una zona Etc/GMT±n donde ahora son las 12 y pico (now() es la hora de la transacción: no se mueve en la prueba). */
async function noonZone(): Promise<string> {
  const [{ h }] = await db.admin<{ h: number }>(`select extract(hour from now() at time zone 'UTC')::int as h`);
  const o = 12 - h;
  return o === 0 ? 'Etc/GMT' : o > 0 ? `Etc/GMT-${o}` : `Etc/GMT+${-o}`;
}
/** Pone la liga a las 12 y pico con ese horario y devuelve hoy y ayer en su zona. */
async function atNoon(schedule: string, lid = w.priv) {
  const tz = await noonZone();
  await db.admin('update public.leagues set tz = $2, schedule = $3 where id = $1', [lid, tz, schedule]);
  const [{ local }] = await db.admin<{ local: string }>(`select to_char(now() at time zone $1, 'HH24:MI') as local`, [tz]);
  expect(local.startsWith('12:')).toBe(true);
  return { tz, today: await dayIn(tz), yesterday: await dayIn(tz, 1), twoAgo: await dayIn(tz, 2), tomorrow: await dayIn(tz, -1) };
}
const open = (who: string, date: string | null = null, lid = w.priv) => db.rpc<string>(who, 'open_practice', { p_league: lid, p_date: date });

const saveBall = (who: string, args: Record<string, unknown> = {}) =>
  db.rpc<string>(who, 'save_ball', { p_id: null, p_name: 'Phaze II', p_weight: 15, p_color: '#1d4ed8', ...args });
const setDetails = (who: string, ball: string, catalog: string | null, layout: unknown) =>
  db.rpc<null>(who, 'set_ball_details', { p_ball: ball, p_catalog: catalog, p_layout: layout === undefined ? null : JSON.stringify(layout) });
const ballRow = async (id: string) => (await db.admin<Json>('select catalog, layout from public.bowling_balls where id = $1', [id]))[0];

describe('las RPC nuevas', () => {
  it('solo con sesión: authenticated sí, anon no', async () => {
    const rows = await db.admin<{ fn: string; auth: boolean; anon: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, auth: true, anon: false })));
    // Las ayudas no las ejecuta nadie de la app (la revisión del layout, también la clave secreta: la usa el CHECK).
    const helpers = await db.admin<{ fn: string; auth: boolean; svc: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as svc
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname in ('practice_locked', 'league_team_copy', 'entry_league_team', 'ball_layout_ok', 'ball_step_ok')
        order by 1`,
    );
    expect(helpers).toEqual([
      { fn: 'ball_layout_ok', auth: false, svc: true },
      { fn: 'ball_step_ok', auth: false, svc: true },
      { fn: 'entry_league_team', auth: false, svc: false },
      { fn: 'league_team_copy', auth: false, svc: false },
      { fn: 'practice_locked', auth: false, svc: false },
    ]);
  });
});

// =====================================================================
// 1. Equipos fijos
// =====================================================================

describe('set_bowling_teams', () => {
  it('crea los equipos fijos (sin evento ni temporada) con su plantilla y devuelve los ids en orden', async () => {
    const ids = await setTeams(w.u.org, [
      { name: '  Rojos ', color: '#FF0000', players: [p.luis, p.pedro] },
      { name: 'Azules', players: [p.marta] },
      { name: 'Vacío', color: null, players: [] },
      { name: 'Sin lista' },
    ]);
    expect(ids).toHaveLength(4);
    expect(await fixed()).toEqual([
      { id: ids[0], name: 'Rojos', color: '#ff0000', sort_order: 1, season_id: null, players: sorted([p.luis, p.pedro]) },
      { id: ids[1], name: 'Azules', color: null, sort_order: 2, season_id: null, players: [p.marta] },
      { id: ids[2], name: 'Vacío', color: null, sort_order: 3, season_id: null, players: [] },
      { id: ids[3], name: 'Sin lista', color: null, sort_order: 4, season_id: null, players: [] },
    ]);
    // Un admin (no solo el dueño) también.
    expect(await setTeams(w.u.sofi, [])).toEqual([]);
    expect(await fixed()).toEqual([]);
  });

  it('un id que ya existe se conserva (nombre, color y plantilla nuevos); los que no vienen se borran; un id nuevo del teléfono se usa', async () => {
    const [rojos, azules] = await setTeams(w.u.org, [
      { name: 'Rojos', color: '#ff0000', players: [p.luis, p.pedro] },
      { name: 'Azules', color: '#0000ff', players: [p.marta] },
    ]);
    const mine = randomUUID();
    const ids = await setTeams(w.u.org, [
      { id: azules, name: 'Azules 2', color: '', players: [p.luis, p.marta] },
      { id: mine, name: 'Verdes', color: '#00ff00', players: [p.pedro, p.juan] },
    ]);
    expect(ids).toEqual([azules, mine]);
    expect(await fixed()).toEqual([
      { id: azules, name: 'Azules 2', color: null, sort_order: 1, season_id: null, players: sorted([p.luis, p.marta]) },
      { id: mine, name: 'Verdes', color: '#00ff00', sort_order: 2, season_id: null, players: sorted([p.pedro, p.juan]) },
    ]);
    expect(await db.count('public.teams', 'id = $1', [rojos])).toBe(0);
    expect(await db.count('public.team_players', 'team_id = $1', [rojos])).toBe(0);
    // Lo borrado queda en tombstones (sincronización).
    expect(await db.count('public.tombstones', `tbl = 'teams' and row_key = $1`, [rojos])).toBe(1);
  });

  it('borrar un equipo fijo deja sus copias en los torneos (league_team_id null)', async () => {
    const [rojos] = await setTeams(w.u.org, [{ name: 'Rojos', players: [p.luis] }]);
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    await enter(t, [p.luis]);
    const [copy] = await eventTeams(t);
    expect(copy).toMatchObject({ name: 'Rojos', league_team_id: rojos });
    await setTeams(w.u.org, []);
    expect(await eventTeams(t)).toEqual([{ ...copy, league_team_id: null }]);
    expect(await teamOf(t, p.luis)).toBe(copy.id);
  });

  it("'invalido': jugador repetido, de otra liga, más de 40 equipos, nombre, color o id que no vale", async () => {
    const before = await setTeams(w.u.org, [{ name: 'Rojos', players: [p.luis] }]);
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    const eventTeam = await db.rpc<string>(w.u.org, 'add_team', { p_event: t, p_name: 'Del torneo' });
    const pubTeam = await setTeams(w.u.otro, [{ name: 'Otros' }], w.pub);
    const bad: unknown[] = [
      [{ name: 'A', players: [p.luis, p.luis] }],
      [{ name: 'A', players: [p.luis] }, { name: 'B', players: [p.luis] }],
      [{ name: 'A', players: [w.p.p1] }],
      [{ name: 'A', players: [randomUUID()] }],
      [{ name: 'A', players: ['no-es-uuid'] }],
      [{ name: 'A', players: [1] }],
      [{ name: 'A', players: 'luis' }],
      Array.from({ length: 41 }, (_, i) => ({ name: `Equipo ${i + 1}` })),
      [{ name: '' }],
      [{ name: '   ' }],
      [{ name: 'x'.repeat(61) }],
      [{ players: [] }],
      [{ name: 7 }],
      [{ name: 'A', color: 'rojo' }],
      [{ name: 'A', color: '#ff00' }],
      [{ name: 'A', color: 5 }],
      [{ id: 'nada', name: 'A' }],
      [{ id: eventTeam, name: 'A' }],
      [{ id: pubTeam[0], name: 'A' }],
      [{ id: before[0], name: 'A' }, { id: before[0], name: 'B' }],
      ['Rojos'],
      { name: 'A' },
    ];
    for (const teams of bad) await fails(setTeams(w.u.org, teams), INVALID);
    // Nada cambió.
    expect((await fixed()).map((x) => [x.id, x.name, x.players])).toEqual([[before[0], 'Rojos', [p.luis]]]);
    // Justo 40 sí.
    expect(await setTeams(w.u.org, Array.from({ length: 40 }, (_, i) => ({ name: `Equipo ${i + 1}` })))).toHaveLength(40);
  });

  it('solo los admins de una liga de boliche', async () => {
    const teams = [{ name: 'Rojos', players: [p.luis] }];
    for (const who of [w.u.luis, w.u.ana, w.u.extra, w.u.otro]) await fails(setTeams(who, teams), DENIED);
    await fails(setTeams(ANON, teams), DENIED);
    await fails(setTeams(w.u.org, teams, randomUUID()), 'no_existe');
    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', sport: 'padel', requirePhoto: false });
    await member(db, padel, w.u.org, 'owner', 'org');
    await fails(setTeams(w.u.org, [{ name: 'A' }], padel), 'invalido');
    expect(await fixed()).toEqual([]);
    // El superadmin es admin de todas.
    expect(await setTeams(w.u.dios, teams)).toHaveLength(1);
  });
});

describe('save_bowling_team y delete_bowling_team', () => {
  it('crea y cambia un equipo; quien estaba en otro equipo fijo sale de ese; sin lista no toca la plantilla', async () => {
    const rojos = await saveTeam(w.u.org, { name: 'Rojos', color: '#FF0000', players: [p.luis, p.pedro] });
    const azules = await saveTeam(w.u.sofi, { name: 'Azules', players: [p.marta] });
    expect(await fixed()).toEqual([
      { id: rojos, name: 'Rojos', color: '#ff0000', sort_order: 1, season_id: null, players: sorted([p.luis, p.pedro]) },
      { id: azules, name: 'Azules', color: null, sort_order: 2, season_id: null, players: [p.marta] },
    ]);
    // Luis pasa a los Azules (y Marta sale de ellos).
    expect(await saveTeam(w.u.org, { id: azules, name: 'Azules', color: '#0000ff', players: [p.luis, p.juan] })).toBe(azules);
    expect((await fixed()).map((x) => [x.name, x.color, x.players])).toEqual([
      ['Rojos', '#ff0000', [p.pedro]],
      ['Azules', '#0000ff', sorted([p.luis, p.juan])],
    ]);
    // p_players null: solo nombre y color.
    expect(await saveTeam(w.u.org, { id: rojos, name: 'Rojos FC', color: null, players: null })).toBe(rojos);
    expect((await fixed())[0]).toMatchObject({ name: 'Rojos FC', color: null, players: [p.pedro] });
    // Un id nuevo del teléfono.
    const mine = randomUUID();
    expect(await saveTeam(w.u.org, { id: mine, name: 'Verdes' })).toBe(mine);
    expect((await fixed()).map((x) => x.sort_order)).toEqual([1, 2, 3]);
  });

  it("'invalido' y permisos", async () => {
    const rojos = await saveTeam(w.u.org, { name: 'Rojos', players: [p.luis] });
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    const eventTeam = await db.rpc<string>(w.u.org, 'add_team', { p_event: t, p_name: 'Del torneo' });
    const pubTeam = await saveTeam(w.u.otro, { name: 'Otros' }, w.pub);
    await fails(saveTeam(w.u.org, { name: '' }), INVALID);
    await fails(saveTeam(w.u.org, { name: 'A', color: 'azul' }), INVALID);
    await fails(saveTeam(w.u.org, { name: 'A', players: [p.luis, p.luis] }), INVALID);
    await fails(saveTeam(w.u.org, { name: 'A', players: [w.p.p1] }), INVALID);
    await fails(saveTeam(w.u.org, { id: eventTeam, name: 'A' }), INVALID);
    await fails(saveTeam(w.u.org, { id: pubTeam, name: 'A' }), INVALID);
    for (const who of [w.u.luis, w.u.ana, w.u.extra]) {
      await fails(saveTeam(who, { name: 'A' }), DENIED);
      await fails(saveTeam(who, { id: rojos, name: 'A' }), DENIED);
      await fails(db.rpc(who, 'delete_bowling_team', { p_team: rojos }), DENIED);
    }
    await fails(db.rpc(ANON, 'delete_bowling_team', { p_team: rojos }), DENIED);
    // Hasta 40 equipos.
    await setTeams(w.u.org, Array.from({ length: 40 }, (_, i) => ({ name: `Equipo ${i + 1}` })));
    await fails(saveTeam(w.u.org, { name: 'El 41' }), INVALID);
    const [first] = await fixed();
    expect(await saveTeam(w.u.org, { id: first.id, name: 'Cambiado' })).toBe(first.id);
  });

  it('delete_bowling_team: solo equipos fijos del boliche', async () => {
    const rojos = await saveTeam(w.u.org, { name: 'Rojos', players: [p.luis] });
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    await enter(t, [p.luis]);
    const eventTeam = await db.rpc<string>(w.u.org, 'add_team', { p_event: t, p_name: 'Del torneo' });
    await fails(db.rpc(w.u.org, 'delete_bowling_team', { p_team: eventTeam }), 'no_existe');
    await fails(db.rpc(w.u.org, 'delete_bowling_team', { p_team: randomUUID() }), 'no_existe');
    await db.rpc(w.u.sofi, 'delete_bowling_team', { p_team: rojos });
    expect(await fixed()).toEqual([]);
    expect(await db.count('public.team_players', 'team_id = $1', [rojos])).toBe(0);
    // La copia del torneo se queda, sin equipo fijo.
    expect((await eventTeams(t)).map((x) => [x.name, x.league_team_id])).toEqual([
      ['Rojos', null],
      ['Del torneo', null],
    ]);
    await fails(db.rpc(w.u.org, 'delete_bowling_team', { p_team: rojos }), 'no_existe');
  });

  it('las RPC de equipos de temporada no tocan los equipos fijos del boliche', async () => {
    const rojos = await saveTeam(w.u.org, { name: 'Rojos', players: [p.luis] });
    await fails(db.rpc(w.u.org, 'update_season_team', { p_team: rojos, p_patch: { name: 'X' } }), 'no_existe');
    await fails(db.rpc(w.u.org, 'set_team_player', { p_team: rojos, p_player: p.pedro }), 'no_existe');
    await fails(db.rpc(w.u.org, 'set_roster', { p_team: rojos, p_players: JSON.stringify([]) }), 'no_existe');
    await fails(db.rpc(w.u.luis, 'remove_team_player', { p_team: rojos, p_player: p.luis }), 'no_existe');
    await fails(db.rpc(w.u.org, 'delete_season_team', { p_team: rojos }), 'no_existe');
    await fails(db.rpc(w.u.org, 'create_season_team', { p_league: w.priv, p_name: 'X' }), 'invalido');
    // La base deja un equipo sin evento en el boliche, pero no en el golf (ni con temporada en el boliche).
    const golf = await league(db, w.u.org, { name: 'Golf', visibility: 'private', sport: 'golf', requirePhoto: false });
    await fails(db.admin(`insert into public.teams (league_id, name) values ($1, 'X')`, [golf]), 'invalido');
    expect(await db.admin(`insert into public.teams (league_id, name) values ($1, 'X') returning season_id, event_id`, [w.priv])).toEqual([
      { season_id: null, event_id: null },
    ]);
  });

  it('se leen por tabla: los de la liga sí (y sin cuenta en una pública), los de fuera no', async () => {
    const rojos = await saveTeam(w.u.org, { name: 'Rojos', players: [p.luis, p.pedro] });
    const otros = await saveTeam(w.u.otro, { name: 'Otros', players: [w.p.p1] }, w.pub);
    expect(await db.asUser(w.u.luis, 'select id, name from public.teams where event_id is null and league_id = $1', [w.priv])).toEqual([
      { id: rojos, name: 'Rojos' },
    ]);
    expect(await db.asUser(w.u.ana, 'select player_id from public.team_players where team_id = $1 order by player_id', [rojos])).toHaveLength(2);
    expect(await db.asUser(w.u.extra, 'select id from public.teams where league_id = $1', [w.priv])).toEqual([]);
    expect(await db.asUser(w.u.extra, 'select player_id from public.team_players where team_id = $1', [rojos])).toEqual([]);
    expect(await db.asAnon('select player_id from public.team_players where team_id = $1', [otros])).toEqual([{ player_id: w.p.p1 }]);
  });
});

describe('equipos fijos en los torneos', () => {
  it('al inscribirse en un torneo, el jugador queda en la copia de su equipo (se crea una vez y se reutiliza)', async () => {
    const [rojos, azules] = await setTeams(w.u.org, [
      { name: 'Rojos', color: '#ff0000', players: [p.luis, p.pedro] },
      { name: 'Azules', color: '#0000ff', players: [p.marta, p.juan] },
    ]);
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    await db.rpc<string>(w.u.org, 'add_team', { p_event: t, p_name: 'A mano' });
    expect(await enter(t, [p.marta, p.luis, p.rosa])).toBe(3);
    let teams = await eventTeams(t);
    expect(teams.map((x) => [x.name, x.color, x.league_team_id, x.sort_order])).toEqual([
      ['A mano', null, null, 1],
      ['Azules', '#0000ff', azules, 2],
      ['Rojos', '#ff0000', rojos, 3],
    ]);
    const copyOf = (id: string) => teams.find((x) => x.league_team_id === id)!.id;
    expect(await teamOf(t, p.marta)).toBe(copyOf(azules));
    expect(await teamOf(t, p.luis)).toBe(copyOf(rojos));
    // Sin equipo fijo, sin equipo.
    expect(await teamOf(t, p.rosa)).toBeNull();
    // Los que llegan después usan la copia que ya hay.
    await enter(t, [p.pedro]);
    await entry(db, w.priv, t, p.juan, [null, null, null], [null, null, null]);
    expect(await teamOf(t, p.pedro)).toBe(copyOf(rojos));
    expect(await teamOf(t, p.juan)).toBe(copyOf(azules));
    teams = await eventTeams(t);
    expect(teams).toHaveLength(3);
    // Volver a inscribir a quien ya está no crea nada (add_entries no lo toca).
    await db.admin('delete from public.teams where id = $1', [copyOf(azules)]);
    expect(await enter(t, [p.marta, p.juan])).toBe(0);
    expect(await eventTeams(t)).toHaveLength(2);
    // Una inscripción que trae su equipo se queda con ese.
    const t2 = await event(db, w.priv, 'torneo', '2026-10-27', 3, 'Copa 2');
    const own = (await db.admin<{ id: string }>(`insert into public.teams (league_id, event_id, name) values ($1, $2, 'Propio') returning id`, [w.priv, t2]))[0].id;
    await db.admin('insert into public.entries (league_id, event_id, player_id, team_id) values ($1, $2, $3, $4)', [w.priv, t2, p.luis, own]);
    expect(await teamOf(t2, p.luis)).toBe(own);
    expect(await eventTeams(t2)).toHaveLength(1);
  });

  it('las prácticas no cambian: sin equipos', async () => {
    await setTeams(w.u.org, [{ name: 'Rojos', players: [p.luis, p.pedro] }]);
    const prac = await event(db, w.priv, 'practica', '2026-10-20');
    await enter(prac, [p.luis, p.pedro]);
    expect(await teamOf(prac, p.luis)).toBeNull();
    expect(await eventTeams(prac)).toEqual([]);
    // Aprobar un envío por fecha (crea la práctica) tampoco.
    const sub = await db.rpc<string>(w.u.sofi, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180], p_date: '2026-10-21', p_player: p.pedro });
    const r = await db.rpc<Json>(w.u.sofi, 'approve_submission', { p_submission: sub, p_values: JSON.stringify({ 0: 180 }) });
    expect(await teamOf(r.event_id, p.pedro)).toBeNull();
    // En un torneo, aprobar un envío inscribe al jugador con su equipo.
    const t = await event(db, w.priv, 'torneo', '2026-10-22', 3, 'Copa');
    const sub2 = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [200], p_event: t });
    await db.rpc(w.u.sofi, 'approve_submission', { p_submission: sub2, p_values: JSON.stringify({ 0: 200 }) });
    expect((await eventTeams(t)).map((x) => x.name)).toEqual(['Rojos']);
    expect(await teamOf(t, p.luis)).toBe((await eventTeams(t))[0].id);
  });

  it('apply_league_teams vuelve a aplicarlos a un torneo con inscritos', async () => {
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    for (const x of [p.luis, p.pedro, p.marta, p.juan, p.rosa]) await entry(db, w.priv, t, x, [null, null, null], [null, null, null]);
    // Rosa en un equipo armado a mano (no está en ningún equipo fijo).
    const manual = (await db.admin<{ id: string }>(`insert into public.teams (league_id, event_id, name, sort_order) values ($1, $2, 'A mano', 1) returning id`, [w.priv, t]))[0].id;
    await db.admin('update public.entries set team_id = $1 where event_id = $2 and player_id = $3', [manual, t, p.rosa]);
    const [rojos, azules] = await setTeams(w.u.org, [
      { name: 'Rojos', players: [p.luis, p.pedro] },
      { name: 'Azules', players: [p.marta, p.juan] },
    ]);
    expect(await db.rpc<number>(w.u.sofi, 'apply_league_teams', { p_event: t })).toBe(5);
    let teams = await eventTeams(t);
    expect(teams.map((x) => [x.name, x.league_team_id])).toEqual([
      ['A mano', null],
      ['Rojos', rojos],
      ['Azules', azules],
    ]);
    const copy = (id: string) => teams.find((x) => x.league_team_id === id)!.id;
    expect(await teamOf(t, p.luis)).toBe(copy(rojos));
    expect(await teamOf(t, p.juan)).toBe(copy(azules));
    expect(await teamOf(t, p.rosa)).toBe(manual);
    // Pedro pasa a los Azules, Luis sale de todos y los Rojos cambian de nombre: al volver a aplicar, Pedro cambia de
    // copia, Luis queda sin equipo, la copia de los Rojos toma el nombre nuevo y, vacía, se borra.
    await setTeams(w.u.org, [
      { id: rojos, name: 'Rojos FC', players: [] },
      { id: azules, name: 'Azules', color: '#0000ff', players: [p.marta, p.juan, p.pedro] },
    ]);
    expect(await db.rpc<number>(w.u.org, 'apply_league_teams', { p_event: t })).toBe(4);
    teams = await eventTeams(t);
    expect(teams.map((x) => [x.name, x.color, x.league_team_id])).toEqual([
      ['A mano', null, null],
      ['Azules', '#0000ff', azules],
    ]);
    expect(await teamOf(t, p.pedro)).toBe(copy(azules));
    expect(await teamOf(t, p.luis)).toBeNull();
    expect(await teamOf(t, p.rosa)).toBe(manual);
    // Otra vez: no cambia nada.
    expect(await db.rpc<number>(w.u.org, 'apply_league_teams', { p_event: t })).toBe(4);
    // Las pistas por equipo juntan a cada copia.
    await db.rpc(w.u.org, 'assign_lanes', { p_event: t, p_lanes: [1, 2, 3], p_per_lane: 3, p_mode: 'equipo' });
    const lanes = await db.admin<{ lane: number; players: string[] }>(
      'select lane, array_agg(player_id::text order by player_id) as players from public.event_lanes where event_id = $1 group by lane order by lane',
      [t],
    );
    expect(lanes.map((x) => x.players)).toContainEqual(sorted([p.marta, p.juan, p.pedro]));
  });

  it('apply_league_teams: solo admins y solo torneos de boliche', async () => {
    const t = await event(db, w.priv, 'torneo', '2026-10-20', 3, 'Copa');
    for (const who of [w.u.luis, w.u.ana, w.u.extra]) await fails(db.rpc(who, 'apply_league_teams', { p_event: t }), DENIED);
    await fails(db.rpc(ANON, 'apply_league_teams', { p_event: t }), DENIED);
    await fails(db.rpc(w.u.org, 'apply_league_teams', { p_event: randomUUID() }), 'no_existe');
    await fails(db.rpc(w.u.org, 'apply_league_teams', { p_event: w.e.e1 }), 'invalido');
    expect(await db.rpc<number>(w.u.org, 'apply_league_teams', { p_event: t })).toBe(0);
  });
});

// =====================================================================
// 2. La práctica abierta
// =====================================================================

describe('open_practice', () => {
  it('un jugador abre la de hoy después de la hora; otra vez, otro jugador o un admin reciben la misma', async () => {
    const { today } = await atNoon('11:00 am');
    const id = await open(w.u.luis);
    expect(await db.admin('select league_id, type, name, to_char(date, \'YYYY-MM-DD\') as date, games, hcp_base, hcp_percent, individual_rank_by, team_rank_by, category_cuts, team_size, created_by from public.events where id = $1', [id])).toEqual([
      {
        league_id: w.priv,
        type: 'practica',
        name: '',
        date: today,
        games: 3,
        hcp_base: 0,
        hcp_percent: 0,
        individual_rank_by: 'scratch',
        team_rank_by: 'scratch',
        category_cuts: [200, 175, 160],
        team_size: 0,
        created_by: w.u.luis,
      },
    ]);
    expect(await open(w.u.luis)).toBe(id);
    expect(await open(w.u.luis, today)).toBe(id);
    expect(await open(w.u.sofi)).toBe(id);
    expect(await open(w.u.org, today)).toBe(id);
    expect(await db.count('public.events', `league_id = $1 and type = 'practica' and date = $2`, [w.priv, today])).toBe(1);
    // El jugador ya puede anotar en ella.
    await db.rpc(w.u.luis, 'publish_live', { p_event: id, p_scores: [150] });
    expect(await db.rpc<number>(w.u.luis, 'add_practice_game', { p_event: id, p_expected: 3 })).toBe(4);
  });

  it("antes de la hora de hoy: 'cerrado' (también para el admin); sin hora en el horario, a cualquier hora", async () => {
    const { today } = await atNoon('2:00 pm');
    await fails(open(w.u.luis), 'cerrado');
    await fails(open(w.u.luis, today), 'cerrado');
    await fails(open(w.u.org), 'cerrado');
    expect(await db.count('public.events', `league_id = $1 and date = $2`, [w.priv, today])).toBe(0);
    // Ya pasó la hora.
    await db.admin(`update public.leagues set schedule = '12:00 pm' where id = $1`, [w.priv]);
    expect(await open(w.u.luis)).toBeTruthy();
    // Sin hora (o una hora sin am/pm que no se sabe): a cualquier hora.
    const other = await league(db, w.u.org, { name: 'Otra', visibility: 'private' });
    await member(db, other, w.u.org, 'owner', 'org');
    for (const schedule of ['Todos los días', '7:00', '']) {
      await atNoon(schedule, other);
      expect(await open(w.u.org, null, other)).toBeTruthy();
    }
  });

  it("ayer sí (aunque hoy todavía no sea la hora); antes de ayer y mañana: 'cerrado'", async () => {
    const { yesterday, twoAgo, tomorrow } = await atNoon('2:00 pm');
    const id = await open(w.u.luis, yesterday);
    expect((await db.admin<{ date: string }>(`select to_char(date, 'YYYY-MM-DD') as date from public.events where id = $1`, [id]))[0].date).toBe(yesterday);
    expect(await open(w.u.org, yesterday)).toBe(id);
    await fails(open(w.u.luis, twoAgo), 'cerrado');
    await fails(open(w.u.luis, tomorrow), 'cerrado');
    await fails(open(w.u.org, twoAgo), 'cerrado');
  });

  it('si ya hay una práctica ese día, devuelve esa (un torneo no cuenta)', async () => {
    const { today } = await atNoon('11:00 am');
    await event(db, w.priv, 'torneo', today, 3, 'Copa');
    const prac = await event(db, w.priv, 'practica', today);
    expect(await open(w.u.luis)).toBe(prac);
    expect(await db.count('public.events', 'league_id = $1 and date = $2', [w.priv, today])).toBe(2);
  });

  it("'no_permitido' a quien no es jugador ni admin de la liga; 'invalido' en otro deporte", async () => {
    await atNoon('11:00 am');
    for (const who of [w.u.extra, w.u.ana, w.u.otro]) await fails(open(who), DENIED);
    await fails(open(ANON), DENIED);
    await fails(open(w.u.org, null, randomUUID()), 'no_existe');
    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', sport: 'padel', requirePhoto: false });
    await member(db, padel, w.u.org, 'owner', 'org');
    await fails(open(w.u.org, null, padel), 'invalido');
    // El superadmin es admin de todas.
    expect(await open(w.u.dios)).toBeTruthy();
  });
});

describe('la práctica se cierra al otro día', () => {
  /** Práctica de la liga del Banco `n` días atrás (en RD, su zona). */
  const practiceAgo = async (n: number) => event(db, w.priv, 'practica', await dayIn(RD, n));
  const submit = (who: string, ev: string, extra: Record<string, unknown> = {}) =>
    db.rpc<string>(who, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180], p_event: ev, ...extra });

  it("antes de ayer: el jugador no envía, no suma juegos ni publica ('cerrado'); el admin sí", async () => {
    const old = await practiceAgo(2);
    await fails(submit(w.u.luis, old), 'cerrado');
    await fails(db.rpc(w.u.luis, 'add_practice_game', { p_event: old }), 'cerrado');
    await fails(db.rpc(w.u.luis, 'publish_live', { p_event: old, p_scores: [150] }), 'cerrado');
    await fails(db.rpc(w.u.luis, 'publish_live', { p_event: old, p_scores: [] }), 'cerrado');
    expect(await db.count('public.submissions', 'event_id = $1', [old])).toBe(0);
    // El admin (o el superadmin) siempre puede, también jugando él mismo.
    expect(await submit(w.u.sofi, old, { p_player: p.luis })).toBeTruthy();
    expect(await db.rpc<number>(w.u.org, 'add_practice_game', { p_event: old })).toBe(4);
    await player(db, w.priv, 'Org', w.u.org);
    await db.rpc(w.u.org, 'publish_live', { p_event: old, p_scores: [150] });
    expect(await submit(w.u.org, old)).toBeTruthy();
    expect(await submit(w.u.dios, old, { p_player: p.pedro })).toBeTruthy();
    // La del fixture (2026-09-22) también está cerrada para el jugador.
    await fails(submit(w.u.luis, w.e.e1), 'cerrado');
  });

  it('ayer y hoy siguen abiertas; los torneos no cambian', async () => {
    for (const n of [1, 0]) {
      const ev = await practiceAgo(n);
      expect(await submit(w.u.luis, ev)).toBeTruthy();
      expect(await db.rpc<number>(w.u.luis, 'add_practice_game', { p_event: ev })).toBe(4);
      await db.rpc(w.u.luis, 'publish_live', { p_event: ev, p_scores: [150] });
    }
    const t = await event(db, w.priv, 'torneo', await dayIn(RD, 5), 3, 'Copa vieja');
    await entry(db, w.priv, t, p.luis, [null, null, null], [null, null, null]);
    await db.rpc(w.u.luis, 'publish_live', { p_event: t, p_scores: [150] });
    expect(await submit(w.u.luis, t)).toBeTruthy();
  });

  it('cuenta en la zona de la liga', async () => {
    // En Kiritimati (UTC+14) el día va adelantado: la práctica de «ayer» en RD puede ser de antes de ayer allá.
    const [{ ahead }] = await db.admin<{ ahead: boolean }>(
      `select (now() at time zone 'Pacific/Kiritimati')::date > (now() at time zone $1)::date as ahead`,
      [RD],
    );
    const ev = await practiceAgo(1);
    await db.admin(`update public.leagues set tz = 'Pacific/Kiritimati' where id = $1`, [w.priv]);
    if (ahead) await fails(submit(w.u.luis, ev), 'cerrado');
    else expect(await submit(w.u.luis, ev)).toBeTruthy();
  });

  it("por fecha (sin evento): de antes de ayer, 'cerrado' para el jugador; ayer y hoy sí; el admin siempre", async () => {
    const byDate = async (who: string, n: number, extra: Record<string, unknown> = {}) =>
      db.rpc<string>(who, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180], p_date: await dayIn(RD, n), ...extra });
    for (const n of [2, 5, 30]) await fails(byDate(w.u.luis, n), 'cerrado');
    expect(await db.count('public.submissions', 'player_id = $1', [p.luis])).toBe(0);
    for (const n of [1, 0]) expect(await byDate(w.u.luis, n)).toBeTruthy();
    expect(await db.count('public.submissions', 'player_id = $1', [p.luis])).toBe(2);
    // El admin (o el superadmin), por otro o por él mismo, con cualquier fecha.
    expect(await byDate(w.u.sofi, 5, { p_player: p.luis })).toBeTruthy();
    await player(db, w.priv, 'Org', w.u.org);
    expect(await byDate(w.u.org, 30)).toBeTruthy();
    expect(await byDate(w.u.dios, 2, { p_player: p.pedro })).toBeTruthy();
    // Cuenta en la zona de la liga: en Kiritimati (UTC+14) el día va adelantado, y «ayer» en RD puede ser antes de ayer.
    const [{ ahead }] = await db.admin<{ ahead: boolean }>(
      `select (now() at time zone 'Pacific/Kiritimati')::date > (now() at time zone $1)::date as ahead`,
      [RD],
    );
    await db.admin(`update public.leagues set tz = 'Pacific/Kiritimati' where id = $1`, [w.priv]);
    if (ahead) await fails(byDate(w.u.luis, 1), 'cerrado');
    else expect(await byDate(w.u.luis, 1)).toBeTruthy();
  });

  it('por fecha: reintentar un envío que ya se hizo (mismo p_op_id) devuelve el mismo aunque esa fecha ya cerró', async () => {
    const op = randomUUID();
    const args = { p_op_id: op, p_league: w.priv, p_scores: [180], p_date: await dayIn(RD, 1) };
    const id = await db.rpc<string>(w.u.luis, 'submit_games', args);
    // La cola lo vuelve a mandar cuando esa fecha ya cerró (aquí, con una fecha de antes de ayer: el reloj no se mueve
    // en la prueba). Con el mismo p_op_id devuelve el envío que ya se hizo, sin revisar nada otra vez.
    expect(await db.rpc<string>(w.u.luis, 'submit_games', { ...args, p_date: await dayIn(RD, 3) })).toBe(id);
    expect(await db.count('public.submissions', 'player_id = $1', [p.luis])).toBe(1);
    // Uno nuevo con esa fecha, no.
    await fails(db.rpc(w.u.luis, 'submit_games', { ...args, p_op_id: randomUUID(), p_date: await dayIn(RD, 3) }), 'cerrado');
  });

  it('reintentar un envío que ya se hizo devuelve el mismo aunque la práctica ya esté cerrada', async () => {
    const ev = await practiceAgo(1);
    const op = randomUUID();
    const id = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: op, p_league: w.priv, p_scores: [180], p_event: ev });
    await db.admin('update public.events set date = date - 5 where id = $1', [ev]);
    expect(await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: op, p_league: w.priv, p_scores: [180], p_event: ev })).toBe(id);
  });
});

// =====================================================================
// 3. Bolas: catálogo y layout
// =====================================================================

describe('set_ball_details', () => {
  const FULL = { drillingAngle: 45, pinToPap: 4.375, valAngle: 50, pinBuffer: 2.5, notes: 'Dual Angle, mano derecha' };

  it('pone y quita el catálogo y el layout; my_balls los trae', async () => {
    const id = await saveBall(w.u.luis);
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls[0]).toMatchObject({ id, catalog: null, layout: null });
    await setDetails(w.u.luis, id, ' Storm:Phaze-II ', FULL);
    expect(await ballRow(id)).toEqual({ catalog: 'storm:phaze-ii', layout: FULL });
    const balls = (await db.rpc<Json>(w.u.luis, 'my_balls')).balls;
    expect(Object.keys(balls[0]).sort()).toEqual(
      ['brand', 'catalog', 'color', 'cover', 'createdAt', 'design', 'drilledOn', 'id', 'layout', 'name', 'resurfacedOn', 'retired', 'updatedAt', 'weight'].sort(),
    );
    expect(balls[0]).toMatchObject({ catalog: 'storm:phaze-ii', layout: FULL });
    // Solo algunos campos; los null y las notas vacías se quitan; las notas se recortan.
    await setDetails(w.u.luis, id, 'hammer:black-widow-2-0', { pinToPap: 0, valAngle: null, notes: '  Zurdo  ' });
    expect(await ballRow(id)).toEqual({ catalog: 'hammer:black-widow-2-0', layout: { pinToPap: 0, notes: 'Zurdo' } });
    // Vacío: null.
    for (const empty of [{}, { notes: '   ' }, { drillingAngle: null, pinBuffer: null }, null]) {
      await setDetails(w.u.luis, id, 'storm:phaze-ii', empty);
      expect(await ballRow(id)).toEqual({ catalog: 'storm:phaze-ii', layout: null });
    }
    await setDetails(w.u.luis, id, '  ', FULL);
    expect(await ballRow(id)).toEqual({ catalog: null, layout: FULL });
    await db.rpc(w.u.luis, 'set_ball_details', { p_ball: id, p_catalog: null, p_layout: 'null' });
    expect(await ballRow(id)).toEqual({ catalog: null, layout: null });
    // save_ball no toca el catálogo ni el layout.
    await setDetails(w.u.luis, id, 'storm:phaze-ii', FULL);
    await saveBall(w.u.luis, { p_id: id, p_name: 'Otra' });
    expect(await ballRow(id)).toEqual({ catalog: 'storm:phaze-ii', layout: FULL });
  });

  it('revisa cada campo (rangos, pasos de 1/8, notas hasta 60) y la clave del catálogo', async () => {
    const id = await saveBall(w.u.luis);
    const good = [
      { drillingAngle: 0 },
      { drillingAngle: 90 },
      { drillingAngle: 37.5 },
      { valAngle: 0 },
      { valAngle: 90 },
      { pinToPap: 7 },
      { pinToPap: 0.125 },
      { pinToPap: 3.875 },
      { pinBuffer: 0 },
      { pinBuffer: 7 },
      { pinBuffer: 1.3 },
      { notes: 'x'.repeat(60) },
      { notes: 'ñ'.repeat(60) },
    ];
    for (const layout of good) {
      await setDetails(w.u.luis, id, null, layout);
      expect((await ballRow(id)).layout).toEqual(layout);
    }
    const bad: unknown[] = [
      { drillingAngle: -1 },
      { drillingAngle: 90.5 },
      { drillingAngle: '45' },
      { valAngle: 91 },
      { valAngle: true },
      { pinToPap: 7.125 },
      { pinToPap: -0.125 },
      { pinToPap: 4.1 },
      { pinToPap: '4' },
      { pinBuffer: 7.5 },
      { pinBuffer: -1 },
      { notes: 'x'.repeat(61) },
      { notes: 5 },
      { notes: ['a'] },
      { otra: 1 },
      { drillingAngle: 45, x: 1 },
      [],
      [45],
      'texto',
      5,
    ];
    for (const layout of bad) await fails(setDetails(w.u.luis, id, null, layout), INVALID);
    for (const catalog of ['x'.repeat(75) + ':abcde' + 'y', 'storm', ':phaze', 'storm:', 'storm phaze:ii', 'storm:phaze/ii', 'storm:pháze']) {
      await fails(setDetails(w.u.luis, id, catalog, null), INVALID);
    }
    const max = 'a'.repeat(40) + ':' + 'b'.repeat(39);
    await setDetails(w.u.luis, id, max, null);
    expect(await ballRow(id)).toEqual({ catalog: max, layout: null });
    // La revisión de la base, sola: nunca falla.
    const rows = await db.admin<{ ok: boolean }>(
      `select private.ball_layout_ok(x::jsonb) as ok from unnest($1::text[]) with ordinality as a (x, n) order by n`,
      [['{"pinToPap": 4.375}', '{}', '{"notes": " a"}', '{"notes": ""}', '{"pinToPap": null}', 'null', '[1]', '{"valAngle": "x"}']],
    );
    expect(rows.map((r) => r.ok)).toEqual([true, false, false, false, false, false, false, false]);
  });

  it('solo el dueño; el mismo dato no cuenta en el límite de las bolas', async () => {
    const id = await saveBall(w.u.luis);
    await fails(setDetails(w.u.sofi, id, 'storm:phaze-ii', null), DENIED);
    await fails(setDetails(w.u.dios, id, 'storm:phaze-ii', null), DENIED);
    await fails(setDetails(ANON, id, 'storm:phaze-ii', null), DENIED);
    await fails(setDetails(w.u.luis, randomUUID(), 'storm:phaze-ii', null), 'no_existe');
    expect(await ballRow(id)).toEqual({ catalog: null, layout: null });
    const hits = async () => (await db.admin<{ hits: number }>('select hits from private.rate_limits where key = $1', [`balls:${w.u.luis}`]))[0].hits;
    const before = await hits();
    await setDetails(w.u.luis, id, 'storm:phaze-ii', { pinToPap: 4 });
    expect(await hits()).toBe(before + 1);
    await setDetails(w.u.luis, id, 'Storm:Phaze-II', { pinToPap: 4, notes: ' ' });
    expect(await hits()).toBe(before + 1);
    await db.admin(`update private.rate_limits set hits = 100 where key = $1`, [`balls:${w.u.luis}`]);
    await fails(setDetails(w.u.luis, id, 'storm:phaze-ii', { pinToPap: 5 }), 'rate_limited');
    // Lo mismo que ya tiene sigue sin fallar.
    await setDetails(w.u.luis, id, 'storm:phaze-ii', { pinToPap: 4 });
    // Una cuenta bloqueada no cambia nada.
    await db.admin(`update private.rate_limits set hits = 0 where key = $1`, [`balls:${w.u.luis}`]);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'prueba' });
    await fails(setDetails(w.u.luis, id, null, null), 'bloqueada');
  });

  it('el CHECK de la columna también para la clave secreta', async () => {
    const id = await saveBall(w.u.luis);
    await fails(db.asService(`update public.bowling_balls set layout = '{"pinToPap": 9}' where id = $1`, [id]), '23514');
    await fails(db.asService(`update public.bowling_balls set layout = '{}' where id = $1`, [id]), '23514');
    await fails(db.asService(`update public.bowling_balls set catalog = $2 where id = $1`, [id, 'x'.repeat(81)]), '23514');
    await db.asService(`update public.bowling_balls set layout = '{"valAngle": 45}', catalog = 'storm:phaze-ii' where id = $1`, [id]);
    expect(await ballRow(id)).toEqual({ catalog: 'storm:phaze-ii', layout: { valAngle: 45 } });
  });
});
