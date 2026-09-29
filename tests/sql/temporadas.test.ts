/**
 * Temporadas (20260929000700_temporadas.sql): cada liga nace con su temporada, las fechas de la liga mueven la activa
 * (sin dejar juegos fuera), lo jugado antes de la primera (del mismo año, en ella; de otro, en una cerrada de ese
 * año), cerrar guarda la tabla y los premios y avisa a la liga (sin gastar los avisos del admin), empezar otra (con
 * los equipos copiados en las ligas de equipos), quién lee qué, los equipos por temporada (capitanes y reclamos), lo
 * que el boliche necesita para marcar récords y la temporada de las ligas que ya existían.
 *
 * Mundo: el de fixture.ts (liga privada «Liga del Banco» de org con admin sofi, miembros luis y ana, jugador pedro
 * sin cuenta; liga pública «Liga Abierta» de otro). Cada prueba en su transacción (se deshace al final).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, MIGRATIONS_DIR, SHIM_FILE, TestDb, fails, localMigrations } from './harness';
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

interface Season {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  status: string;
  closed_by: string | null;
  standings: unknown;
}

const seasons = (lid: string) =>
  db.admin<Season>(
    `select id, name, to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on, status, closed_by, standings
       from public.seasons where league_id = $1 order by starts_on`,
    [lid],
  );
const active = async (lid: string) => (await seasons(lid)).find((s) => s.status === 'active')!;
/** Hoy en la zona de la liga (RD). */
const today = async () => (await db.admin<{ d: string }>(`select to_char((now() at time zone 'America/Santo_Domingo')::date, 'YYYY-MM-DD') as d`))[0].d;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [uid, `https://fcm.googleapis.com/fcm/send/t-${uid}`]);
const close = (who: string, season: string, awards: unknown[] = [], standings: unknown = { rows: [] }) =>
  db.rpc(who, 'close_season', { p_season: season, p_standings: standings, p_awards: awards });
const start = (who: string, lid: string, args: Record<string, unknown>) => db.rpc<string>(who, 'start_season', { p_league: lid, ...args });

/** Liga de baloncesto (pública) con dos equipos de temporada: Tigres (luis capitán, ana) y Leones (pedro). */
async function hoops() {
  const lid = await league(db, w.u.org, { name: 'Liga de Barrio', visibility: 'public', sport: 'basketball', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  const p = { luis: await player(db, lid, 'Luis', w.u.luis), ana: await player(db, lid, 'Ana', w.u.ana), pedro: await player(db, lid, 'Pedro') };
  const tigres = await db.rpc<string>(w.u.org, 'create_season_team', {
    p_league: lid,
    p_name: 'Tigres',
    p_color: '#ff0000',
    p_players: [{ player_id: p.luis, jersey: 7, role: 'captain' }, { player_id: p.ana, jersey: 10, position: 'base' }],
  });
  const leones = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones', p_players: [{ player_id: p.pedro }] });
  return { lid, p, tigres, leones };
}

describe('la temporada de cada liga', () => {
  it('toda liga nace con una activa: con las fechas de la liga, o desde el día que se crea', async () => {
    expect(await seasons(w.priv)).toMatchObject([{ name: 'Temporada 2026', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'active', standings: null }]);
    const r = await db.rpc<{ league_id: string }>(w.u.otra, 'create_league', { p_name: 'Nueva' });
    expect(await seasons(r.league_id)).toMatchObject([{ starts_on: await today(), ends_on: null, status: 'active' }]);
    const t = await db.rpc<{ league_id: string }>(w.u.otra, 'create_tournament', { p_name: 'Copa', p_date: '2027-03-06' });
    expect(await seasons(t.league_id)).toMatchObject([{ name: 'Temporada 2027', starts_on: '2027-03-06', ends_on: '2027-03-06' }]);
    // Como mucho una activa por liga (también para service_role).
    await fails(db.admin(`insert into public.seasons (league_id, name, starts_on) values ($1, 'Otra', '2027-01-01')`, [w.priv]), '23505');
  });

  it('cambiar las fechas de la liga cambia las de la activa; un fin antes del inicio queda sin fin', async () => {
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: '2026-02-01', season_end: '2026-11-30' } });
    expect(await active(w.priv)).toMatchObject({ starts_on: '2026-02-01', ends_on: '2026-11-30' });
    // Sin inicio: se queda el que tenía.
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: null, season_end: '2026-01-15' } });
    expect(await active(w.priv)).toMatchObject({ starts_on: '2026-02-01', ends_on: null });
    // Otra cosa de la liga no la toca.
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { name: 'Liga del Banco Popular' } });
    expect(await active(w.priv)).toMatchObject({ starts_on: '2026-02-01', ends_on: null });
    // Un inicio después de un juego que ya es de ella lo dejaría sin temporada (la práctica del 22 de septiembre):
    // para eso se cierra y se empieza otra.
    await fails(db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: '2027-01-01', season_end: '2027-12-31' } }), 'invalido: temporada');
    expect(await active(w.priv)).toMatchObject({ starts_on: '2026-02-01', ends_on: null });
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: '2026-09-22' } });
    expect(await active(w.priv)).toMatchObject({ starts_on: '2026-09-22' });
    // Lo mismo con un partido (su día en la zona de la liga).
    const h = await hoops();
    await db.rpc(w.u.org, 'create_matches', {
      p_league: h.lid,
      p_matches: [{ scheduled_at: '2026-03-11T02:00:00Z', sides: [{ side: 1, team_id: h.tigres }, { side: 2, team_id: h.leones }] }],
    });
    await fails(db.rpc(w.u.org, 'update_league', { p_league: h.lid, p_patch: { season_start: '2026-03-11' } }), 'invalido: temporada');
    await db.rpc(w.u.org, 'update_league', { p_league: h.lid, p_patch: { season_start: '2026-03-10' } });
    expect(await active(h.lid)).toMatchObject({ starts_on: '2026-03-10' });
  });

  it('lo jugado antes de la primera temporada: del mismo año entra en ella; de otro año, en una cerrada de ese año', async () => {
    const row = (s: Season) => [s.name, s.starts_on, s.ends_on, s.status];
    // Del mismo año: la temporada empieza ese día.
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: '2026-03-01' } });
    await event(db, w.priv, 'practica', '2026-02-10');
    expect((await seasons(w.priv)).map(row)).toEqual([['Temporada 2026', '2026-02-10', '2026-12-31', 'active']]);
    // De otro año: una cerrada de todo ese año, sin tabla guardada; la activa no se estira.
    await event(db, w.priv, 'practica', '2025-11-04');
    const [old] = await seasons(w.priv);
    expect(old).toMatchObject({ name: 'Temporada 2025', starts_on: '2025-01-01', ends_on: '2025-12-31', status: 'closed', closed_by: null, standings: null });
    // Otra fecha de ese año cae en ella; una fecha cambiada a un año sin temporada arma la suya.
    const e = await event(db, w.priv, 'practica', '2026-03-03');
    await db.rpc(w.u.sofi, 'update_event', { p_event: e, p_patch: { date: '2025-10-07' } });
    await db.rpc(w.u.sofi, 'update_event', { p_event: e, p_patch: { date: '2023-06-01' } });
    // Lo de después no mueve nada.
    await event(db, w.priv, 'practica', '2027-02-02');
    expect((await seasons(w.priv)).map(row)).toEqual([
      ['Temporada 2023', '2023-01-01', '2023-12-31', 'closed'],
      ['Temporada 2025', '2025-01-01', '2025-12-31', 'closed'],
      ['Temporada 2026', '2026-02-10', '2026-12-31', 'active'],
    ]);
    // Partidos de varios años a la vez (su día en la zona de la liga: el 1 de enero a las 2 UTC aún es 2023).
    const h = await hoops();
    const sides = [{ side: 1, team_id: h.tigres }, { side: 2, team_id: h.leones }];
    await db.rpc(w.u.org, 'create_matches', {
      p_league: h.lid,
      p_matches: [
        { scheduled_at: '2025-12-20T23:00:00Z', sides },
        { scheduled_at: '2024-01-01T02:00:00Z', sides },
        { scheduled_at: '2026-01-05T23:00:00Z', sides },
      ],
    });
    expect((await seasons(h.lid)).map(row)).toEqual([
      ['Temporada 2023', '2023-01-01', '2023-12-31', 'closed'],
      ['Temporada 2025', '2025-01-01', '2025-12-31', 'closed'],
      ['Temporada 2026', '2026-01-01', '2026-12-31', 'active'],
    ]);
  });

  it('un juego entre dos temporadas: del año de la que sigue entra en ella; del año de la que se cerró, sin temporada', async () => {
    const s1 = await active(w.priv);
    await close(w.u.sofi, s1.id);
    const s2 = await start(w.u.sofi, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2027-01-10' });
    await event(db, w.priv, 'practica', '2026-12-15');
    await event(db, w.priv, 'practica', '2027-01-05');
    expect((await seasons(w.priv)).map((s) => [s.id, s.starts_on, s.ends_on])).toEqual([
      [s1.id, '2026-01-01', await today()],
      [s2, '2027-01-05', null],
    ]);
  });
});

describe('cerrar la temporada', () => {
  it('guarda la tabla y los premios, termina hoy y avisa a la liga una sola vez', async () => {
    await phone(w.u.luis);
    await phone(w.u.ana);
    await phone(w.u.sofi);
    const s = await active(w.priv);
    const table = { kind: 'bowling', rows: [{ playerId: w.p.luis, average: 180, games: 12 }] };
    await close(w.u.sofi, s.id, [
      { kind: 'campeon', player_id: w.p.luis, note: 'Promedio 180' },
      { kind: 'subcampeon', player_id: w.p.pedro },
      { kind: 'otro', label: 'Mejor serie', player_id: w.p.pedro },
    ], table);
    expect(await active(w.priv)).toBeUndefined();
    const [row] = await seasons(w.priv);
    expect(row).toMatchObject({ status: 'closed', ends_on: await today(), closed_by: w.u.sofi, standings: table });
    expect(
      await db.admin('select kind, label, name, player_id, team_id, note from public.season_awards where season_id = $1 order by sort_order', [s.id]),
    ).toEqual([
      { kind: 'campeon', label: 'Campeón', name: 'Luis', player_id: w.p.luis, team_id: null, note: 'Promedio 180' },
      { kind: 'subcampeon', label: 'Subcampeón', name: 'Pedro', player_id: w.p.pedro, team_id: null, note: null },
      { kind: 'otro', label: 'Mejor serie', name: 'Pedro', player_id: w.p.pedro, team_id: null, note: null },
    ]);
    // El aviso: en el historial de la liga y por push a los miembros con avisos (menos quien cierra).
    expect(await db.admin('select body, sent_by, author_name, recipients from public.league_announcements where league_id = $1', [w.priv])).toEqual([
      { body: 'Terminó Temporada 2026: campeón Luis', sent_by: w.u.sofi, author_name: 'sofi', recipients: 2 },
    ]);
    expect(await db.admin('select user_id, title, body, url from public.push_outbox where tag = $1 order by user_id', [`temporada:${s.id}`])).toEqual(
      [w.u.luis, w.u.ana].sort().map((u) => ({ user_id: u, title: 'Liga del Banco', body: 'Terminó Temporada 2026: campeón Luis', url: `/l/${w.priv}/temporadas` })),
    );
    // Otra vez: corrige la tabla y los premios, sin otro aviso y sin cambiar quién ni cuándo cerró.
    await close(w.u.org, s.id, [{ kind: 'mvp', player_id: w.p.pedro }], { rows: [] });
    expect((await seasons(w.priv))[0]).toMatchObject({ status: 'closed', closed_by: w.u.sofi, standings: { rows: [] } });
    expect(await db.admin('select kind, label, name from public.season_awards where season_id = $1', [s.id])).toEqual([{ kind: 'mvp', label: 'MVP', name: 'Pedro' }]);
    expect(await db.count('public.league_announcements', 'league_id = $1', [w.priv])).toBe(1);
    // Es automático: no gasta los avisos del día del admin.
    expect(await db.rpc(w.u.sofi, 'league_announce_reach', { p_league: w.priv })).toMatchObject({ sentToday: 0, dailyLimit: 3 });
    for (const body of ['uno', 'dos', 'tres']) await db.rpc(w.u.sofi, 'league_announce', { p_league: w.priv, p_body: body });
    await fails(db.rpc(w.u.sofi, 'league_announce', { p_league: w.priv, p_body: 'cuatro' }), 'rate_limited');
    expect(await db.admin('select automatic, count(*)::int as n from public.league_announcements where league_id = $1 group by 1 order by 1', [w.priv])).toEqual([
      { automatic: false, n: 3 },
      { automatic: true, n: 1 },
    ]);
  });

  it('el push del cierre es de «Tus ligas» (push_category: liga): con esa categoría apagada no llega; con otras apagadas, sí', async () => {
    expect(await db.admin(`select private.push_category($1) as c`, ['temporada:x'])).toEqual([{ c: 'liga' }]);
    await phone(w.u.luis);
    await phone(w.u.ana);
    await db.rpc(w.u.luis, 'set_push_prefs', { p_prefs: { liga: false } });
    await db.rpc(w.u.ana, 'set_push_prefs', { p_prefs: { social: false, resultados: false, recordatorios: false } });
    const s = await active(w.priv);
    await close(w.u.sofi, s.id, [{ kind: 'campeon', player_id: w.p.luis }]);
    expect(await db.admin('select user_id from public.push_outbox where tag = $1', [`temporada:${s.id}`])).toEqual([{ user_id: w.u.ana }]);
    // El aviso queda en el historial de la liga igual (cuenta a quién se le mandó).
    expect(await db.admin('select recipients, automatic from public.league_announcements where league_id = $1', [w.priv])).toEqual([
      { recipients: 2, automatic: true },
    ]);
  });

  it('sin campeón el aviso solo dice que terminó; los premios de equipo llevan el nombre del equipo', async () => {
    const h = await hoops();
    await close(w.u.org, (await active(h.lid)).id, [{ kind: 'fair_play', team_id: h.leones }]);
    expect(await db.admin('select body from public.league_announcements where league_id = $1', [h.lid])).toEqual([{ body: 'Terminó Temporada 2026' }]);
    expect(await db.admin('select kind, label, name, team_id from public.season_awards where league_id = $1', [h.lid])).toEqual([
      { kind: 'fair_play', label: 'Fair play', name: 'Leones', team_id: h.leones },
    ]);
  });

  it('solo un admin; datos que no sirven no cambian nada', async () => {
    const s = await active(w.priv);
    await fails(close(w.u.luis, s.id), DENIED);
    await fails(close(w.u.otro, s.id), DENIED);
    await fails(close(ANON, s.id), DENIED);
    await fails(db.rpc(w.u.sofi, 'close_season', { p_season: '00000000-0000-4000-8000-000000000000', p_standings: {} }), 'no_existe');
    for (const bad of [
      [{ kind: 'rey', player_id: w.p.luis }],
      [{ kind: 'campeon' }],
      [{ kind: 'campeon', player_id: w.p.luis, team_id: w.p.luis }],
      [{ kind: 'campeon', player_id: w.p.p1 }],
      [{ kind: 'campeon', player_id: w.p.luis }, { kind: 'campeon', player_id: w.p.pedro }],
      [{ kind: 'otro', player_id: w.p.luis }],
      [{ kind: 'mvp', player_id: w.p.luis, label: 'x'.repeat(41) }],
      [{ kind: 'mvp', player_id: w.p.luis, note: 'x'.repeat(201) }],
      [{ kind: 'mvp', player_id: 'no-es-uuid' }],
      ['campeon'],
    ]) {
      await fails(close(w.u.sofi, s.id, bad), INVALID);
    }
    await fails(close(w.u.sofi, s.id, [], null), INVALID);
    await fails(close(w.u.sofi, s.id, [], 'texto'), INVALID);
    expect(await active(w.priv)).toMatchObject({ id: s.id, status: 'active' });
    expect(await db.count('public.season_awards')).toBe(0);
    // Nadie escribe directo.
    await fails(db.asUser(w.u.org, `update public.seasons set status = 'closed'`), '42501');
    await fails(db.asUser(w.u.org, `insert into public.season_awards (season_id, league_id, kind, label, name) values ($1, $2, 'mvp', 'MVP', 'X')`, [s.id, w.priv]), '42501');
  });
});

describe('empezar otra temporada', () => {
  it('primero se cierra la activa; la nueva empieza después de que terminó la anterior (sin tocarla); las fechas van a la liga', async () => {
    const s1 = await active(w.priv);
    await fails(start(w.u.sofi, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2027-01-05' }), 'invalido');
    await close(w.u.sofi, s1.id);
    const closedOn = await today();
    await fails(start(w.u.luis, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2027-01-05' }), DENIED);
    await fails(start(w.u.sofi, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2026-01-01' }), 'invalido');
    await fails(start(w.u.sofi, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2027-01-05', p_ends_on: '2027-01-01' }), 'invalido');
    await fails(start(w.u.sofi, w.priv, { p_name: '  ', p_starts_on: '2027-01-05' }), INVALID);
    await fails(start(w.u.sofi, w.priv, { p_name: 'X', p_starts_on: null }), 'invalido');
    // Antes de que termine la cerrada (o el mismo día): no, sus juegos siguen siendo de ella.
    await fails(start(w.u.sofi, w.priv, { p_name: 'Apertura 2026', p_starts_on: '2026-09-01' }), 'invalido');
    await fails(start(w.u.sofi, w.priv, { p_name: 'Apertura 2026', p_starts_on: closedOn }), 'invalido');
    const s2 = await start(w.u.sofi, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2027-01-05', p_ends_on: '2027-12-20' });
    expect(await seasons(w.priv)).toMatchObject([
      { id: s1.id, status: 'closed', starts_on: '2026-01-01', ends_on: closedOn },
      { id: s2, name: 'Temporada 2027', status: 'active', starts_on: '2027-01-05', ends_on: '2027-12-20' },
    ]);
    expect(await db.admin(`select to_char(season_start, 'YYYY-MM-DD') as s, to_char(season_end, 'YYYY-MM-DD') as e from public.leagues where id = $1`, [w.priv])).toEqual([
      { s: '2027-01-05', e: '2027-12-20' },
    ]);
    // La activa no puede empezar antes de que termine la anterior (update_league).
    await fails(db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: closedOn } }), 'invalido: temporada');
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { season_start: '2027-01-06' } });
    expect(await active(w.priv)).toMatchObject({ id: s2, starts_on: '2027-01-06' });
    // Lo jugado antes de la primera, de otro año, queda en una cerrada de ese año; no toca ni la cerrada ni la activa.
    await event(db, w.priv, 'practica', '2025-12-01');
    expect(await seasons(w.priv)).toMatchObject([
      { name: 'Temporada 2025', status: 'closed', starts_on: '2025-01-01', ends_on: '2025-12-31' },
      { id: s1.id, starts_on: '2026-01-01', ends_on: closedOn },
      { id: s2, starts_on: '2027-01-06' },
    ]);
  });

  it('liga de equipos: copia los equipos de la anterior con su plantilla; los nuevos equipos son de la activa', async () => {
    const h = await hoops();
    const s1 = await active(h.lid);
    expect(await db.admin('select name, season_id from public.teams where league_id = $1 order by sort_order', [h.lid])).toEqual([
      { name: 'Tigres', season_id: s1.id },
      { name: 'Leones', season_id: s1.id },
    ]);
    await close(w.u.org, s1.id);
    const s2 = await start(w.u.org, h.lid, { p_name: 'Temporada 2027', p_starts_on: '2027-01-10', p_copy_teams: true });
    const copies = await db.admin<{ id: string; name: string; color: string | null; sort_order: number }>(
      'select id, name, color, sort_order from public.teams where league_id = $1 and season_id = $2 order by sort_order',
      [h.lid, s2],
    );
    expect(copies.map(({ name, color, sort_order }) => ({ name, color, sort_order }))).toEqual([
      { name: 'Tigres', color: '#ff0000', sort_order: 1 },
      { name: 'Leones', color: null, sort_order: 2 },
    ]);
    expect(copies.every((c) => c.id !== h.tigres && c.id !== h.leones)).toBe(true);
    expect(await db.admin('select player_id, jersey, position, role from public.team_players where team_id = $1 order by jersey', [copies[0].id])).toEqual([
      { player_id: h.p.luis, jersey: 7, position: null, role: 'captain' },
      { player_id: h.p.ana, jersey: 10, position: 'base', role: 'player' },
    ]);
    // Los de la temporada vieja siguen ahí (su historia), con su temporada.
    expect(await db.count('public.teams', 'league_id = $1 and season_id = $2', [h.lid, s1.id])).toBe(2);
    const nuevo = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: h.lid, p_name: 'Águilas' });
    expect(await db.admin('select season_id from public.teams where id = $1', [nuevo])).toEqual([{ season_id: s2 }]);
    // El capitán suma a quien jugó en otro equipo la temporada pasada, pero no a quien ya está en otro equipo de esta.
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: copies[0].id, p_player: h.p.pedro }), 'invalido');
    await db.rpc(w.u.org, 'remove_team_player', { p_team: copies[1].id, p_player: h.p.pedro });
    await db.rpc(w.u.luis, 'set_team_player', { p_team: copies[0].id, p_player: h.p.pedro });
    await db.rpc(w.u.org, 'remove_team_player', { p_team: copies[0].id, p_player: h.p.pedro });
    await db.rpc(w.u.org, 'set_team_player', { p_team: nuevo, p_player: h.p.pedro });
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: copies[0].id, p_player: h.p.pedro }), 'invalido');
    // Sin p_copy_teams (o en una liga que no es de equipos) no se copia nada.
    await close(w.u.org, s2);
    await start(w.u.org, h.lid, { p_name: 'Temporada 2028', p_starts_on: '2028-01-10' });
    expect(await db.count('public.teams', 'league_id = $1 and season_id = $2', [h.lid, (await active(h.lid)).id])).toBe(0);
  });

  it('las parejas de raqueta y los equipos del boliche no llevan temporada', async () => {
    const lid = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', sport: 'padel', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    const pair = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Ana / Luis' });
    const team = await db.rpc<string>(w.u.org, 'add_team', { p_event: w.e.e1, p_name: 'Equipo 1' });
    expect(await db.admin('select season_id from public.teams where id = any ($1) order by name', [[pair, team]])).toEqual([{ season_id: null }, { season_id: null }]);
    await fails(db.admin('update public.teams set season_id = $2 where id = $1', [team, (await active(w.priv)).id]), '23514');
  });
});

describe('leer temporadas y campeones', () => {
  it('league_seasons y league_champions: quien ve la liga (también sin cuenta en una pública)', async () => {
    const s = await active(w.pub);
    await close(w.u.otro, s.id, [{ kind: 'campeon', player_id: w.p.p1 }, { kind: 'mvp', player_id: w.p.p1, note: 'Serie de 700' }], { rows: [1] });
    const s2 = await start(w.u.otro, w.pub, { p_name: 'Temporada 2027', p_starts_on: '2027-01-01' });
    const list = await db.rpc<Record<string, unknown>[]>(ANON, 'league_seasons', { p_league: w.pub });
    expect(list.map((x) => [x.id, x.status])).toEqual([
      [s2, 'active'],
      [s.id, 'closed'],
    ]);
    expect(list[1]).toMatchObject({
      name: 'Temporada 2026',
      startsOn: '2026-01-01',
      endsOn: await today(),
      closedBy: w.u.otro,
      standings: { rows: [1] },
      awards: [
        { kind: 'campeon', label: 'Campeón', name: 'Jugador Uno', playerId: w.p.p1, teamId: null, note: null },
        { kind: 'mvp', label: 'MVP', name: 'Jugador Uno', playerId: w.p.p1, teamId: null, note: 'Serie de 700' },
      ],
      playoffs: [],
    });
    expect(String(list[1].closedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(list[0]).toMatchObject({ endsOn: null, closedAt: null, awards: [], standings: null });
    const champs = await db.rpc<Record<string, unknown>[]>(w.u.extra, 'league_champions', { p_league: w.pub });
    expect(champs).toEqual([
      expect.objectContaining({
        seasonId: s.id,
        name: 'Temporada 2026',
        champion: { label: 'Campeón', name: 'Jugador Uno', playerId: w.p.p1, teamId: null },
        awards: [expect.objectContaining({ kind: 'campeon' }), expect.objectContaining({ kind: 'mvp', note: 'Serie de 700' })],
      }),
    ]);
    // Liga privada: nada para quien no es de ella; sus miembros sí.
    expect(await db.rpc(ANON, 'league_seasons', { p_league: w.priv })).toBeNull();
    expect(await db.rpc(w.u.otro, 'league_champions', { p_league: w.priv })).toBeNull();
    expect(await db.rpc(w.u.luis, 'league_champions', { p_league: w.priv })).toEqual([]);
    expect(await db.rpc<unknown[]>(w.u.luis, 'league_seasons', { p_league: w.priv })).toHaveLength(1);
    // Lo mismo leyendo las tablas.
    expect(await db.asAnon('select id from public.seasons where league_id = $1', [w.priv])).toEqual([]);
    expect(await db.asAnon('select id from public.season_awards where league_id = $1', [w.pub])).toHaveLength(2);
  });

  it('borrar la liga deja solo su tombstone (no los de sus temporadas)', async () => {
    const r = await db.rpc<{ league_id: string }>(w.u.otra, 'create_league', { p_name: 'Efímera' });
    await db.rpc(w.u.otra, 'delete_league', { p_league: r.league_id });
    expect(await db.admin('select tbl from public.tombstones where league_id = $1', [r.league_id])).toEqual([{ tbl: 'leagues' }]);
  });
});

describe('reclamos y juntar jugadores con temporadas', () => {
  it('los premios y la tabla guardada pasan al jugador reclamado; equipos de otra temporada no chocan', async () => {
    const h = await hoops();
    const guest = await player(db, h.lid, 'Ana G.');
    await db.rpc(w.u.org, 'set_team_player', { p_team: h.leones, p_player: guest });
    const s1 = await active(h.lid);
    const mine = h.p.ana;
    await close(w.u.org, s1.id, [{ kind: 'mvp', player_id: mine }], { rows: [{ player: mine, points: 30 }] });
    const s2 = await start(w.u.org, h.lid, { p_name: 'Temporada 2027', p_starts_on: '2027-01-10', p_copy_teams: true });
    // En la temporada nueva, Ana G. ya no está en ningún equipo: Ana (Tigres) y Ana G. (Leones de la pasada) no chocan.
    await db.admin('delete from public.team_players tp using public.teams t where t.id = tp.team_id and t.season_id = $1 and tp.player_id = $2', [s2, guest]);
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: guest });
    expect(await db.rpc(w.u.org, 'player_claim_conflicts', { p_claim: id })).toEqual([
      { what: 'team_players', label: 'Equipos distintos de la temporada', count: 1 },
    ]);
    // La plantilla de la temporada pasada sí choca (Tigres y Leones en la misma temporada): el admin la arregla.
    await db.rpc(w.u.org, 'remove_team_player', { p_team: h.leones, p_player: guest });
    expect(await db.rpc(w.u.org, 'player_claim_conflicts', { p_claim: id })).toEqual([]);
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect(await db.admin('select player_id, name from public.season_awards where season_id = $1', [s1.id])).toEqual([{ player_id: guest, name: 'Ana' }]);
    expect((await seasons(h.lid))[0].standings).toEqual({ rows: [{ player: guest, points: 30 }] });
  });

  it('juntar dos jugadores (Admin › Jugadores): el premio, la tabla guardada y la pista del que se va pasan al que queda', async () => {
    const dup = await player(db, w.priv, 'Pedro P.');
    // La pista del boliche (20260929000600_organizador.sql): solo el que se va tiene en ese evento.
    const ev = await event(db, w.priv, 'torneo', '2026-09-15', 3, 'Copa');
    await db.admin('insert into public.event_lanes (event_id, player_id, league_id, lane) values ($1, $2, $3, 7)', [ev, dup, w.priv]);
    const s = await active(w.priv);
    await close(w.u.sofi, s.id, [{ kind: 'mas_mejorado', player_id: dup }], { rows: [{ playerId: dup, average: 170 }] });
    await db.rpc(w.u.sofi, 'merge_league_players', { p_league: w.priv, p_keep: w.p.pedro, p_drop: dup });
    expect(await db.count('public.players', 'id = $1', [dup])).toBe(0);
    expect(await db.admin('select kind, player_id, name from public.season_awards where season_id = $1', [s.id])).toEqual([
      { kind: 'mas_mejorado', player_id: w.p.pedro, name: 'Pedro P.' },
    ]);
    expect((await seasons(w.priv))[0].standings).toEqual({ rows: [{ playerId: w.p.pedro, average: 170 }] });
    expect(await db.admin('select player_id, lane from public.event_lanes where event_id = $1', [ev])).toEqual([{ player_id: w.p.pedro, lane: 7 }]);
  });

  it('un jugador de la temporada pasada en otro equipo no choca con el de esta', async () => {
    const h = await hoops();
    const guest = await player(db, h.lid, 'Ana G.');
    await db.rpc(w.u.org, 'set_team_player', { p_team: h.leones, p_player: guest });
    await close(w.u.org, (await active(h.lid)).id);
    await start(w.u.org, h.lid, { p_name: 'Temporada 2027', p_starts_on: '2027-01-10' });
    // Ana está en Tigres (temporada pasada); Ana G. en Leones (temporada pasada): chocan. Se saca a Ana G. de Leones
    // y se la pone en un equipo nuevo de esta temporada: ya no chocan.
    await db.rpc(w.u.org, 'remove_team_player', { p_team: h.leones, p_player: guest });
    const nuevo = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: h.lid, p_name: 'Águilas', p_players: [{ player_id: guest }] });
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: guest });
    expect(await db.rpc(w.u.org, 'player_claim_conflicts', { p_claim: id })).toEqual([]);
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect(await db.admin('select team_id from public.team_players where player_id = $1 order by team_id', [guest])).toEqual(
      [{ team_id: h.tigres }, { team_id: nuevo }].sort((a, b) => a.team_id.localeCompare(b.team_id)),
    );
  });
});

describe('boliche: lo que hace falta para las marcas de un juego', () => {
  it('antes del evento (en la liga), en la temporada y en la anterior; solo juegos verificados', async () => {
    const e1 = await event(db, w.priv, 'practica', '2026-02-03');
    const e2 = await event(db, w.priv, 'practica', '2026-03-03');
    await entry(db, w.priv, e1, w.p.pedro, [150, 170, 99], ['importado', 'sin-foto', null]);
    await entry(db, w.priv, e2, w.p.pedro, [210], ['importado']);
    const s1 = await active(w.priv);
    await close(w.u.sofi, s1.id);
    await start(w.u.sofi, w.priv, { p_name: 'Temporada 2027', p_starts_on: '2027-01-01' });
    const e3 = await event(db, w.priv, 'practica', '2027-01-12');
    const e4 = await event(db, w.priv, 'torneo', '2027-01-19');
    await entry(db, w.priv, e3, w.p.pedro, [180, 190], ['importado', 'importado']);
    const x4 = await entry(db, w.priv, e4, w.p.pedro, [230, 100], ['importado', null]);
    // El promedio congelado al inscribirse (el que usa la pantalla del evento para «+15 sobre tu promedio»).
    await db.admin('update public.entries set average = 155 where id = $1', [x4]);
    const x2 = (await db.admin<{ id: string }>('select id from public.entries where event_id = $1', [e2]))[0].id;
    const s2 = (await active(w.priv)).id;
    const ctx = await db.rpc<Record<string, unknown>[]>(w.u.luis, 'bowling_game_context', { p_entries: [x4, x2] });
    expect(ctx).toEqual([
      {
        entryId: x4,
        playerId: w.p.pedro,
        leagueId: w.priv,
        seasonId: s2,
        averageOverride: null,
        average: 155,
        before: { games: 5, high: 210 },
        season: { games: 2, pins: 370 },
        prevSeason: { id: s1.id, games: 3, pins: 530 },
      },
      {
        entryId: x2,
        playerId: w.p.pedro,
        leagueId: w.priv,
        seasonId: s1.id,
        averageOverride: null,
        average: 0,
        before: { games: 2, high: 170 },
        season: { games: 2, pins: 320 },
        prevSeason: null,
      },
    ]);
    // Quien no ve la liga no recibe nada.
    expect(await db.rpc(w.u.otro, 'bowling_game_context', { p_entries: [x4] })).toEqual([]);
    expect(await db.rpc(ANON, 'bowling_game_context', { p_entries: [x4] })).toEqual([]);
  });
});

describe('ligas que ya existían al llegar las temporadas', () => {
  it('reciben una activa desde su inicio (lo de antes de otros años, en cerradas por año), y sus equipos de temporada quedan en ella', async () => {
    // Base aparte: todas las migraciones antes de esta, datos «viejos», y después esta y las que sigan.
    const pg = new PGlite();
    try {
      await pg.exec(readFileSync(SHIM_FILE, 'utf8'));
      const files = localMigrations();
      const at = files.findIndex((f) => f.startsWith('20260929000700'));
      for (const f of files.slice(0, at)) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
      const uid = (await pg.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('v@x.com', '{"name":"Vieja"}') returning id`)).rows[0].id;
      const mk = async (name: string, sport: string, start: string | null, end: string | null) =>
        (
          await pg.query<{ id: string }>(
            `insert into public.leagues (name, sport, owner_id, season_start, season_end, created_at) values ($1, $2, $3, $4, $5, '2026-05-05T15:00:00Z') returning id`,
            [name, sport, uid, start, end],
          )
        ).rows[0].id;
      const a = await mk('Con fechas', 'bowling', '2026-03-01', '2026-11-30');
      const b = await mk('Sin fechas', 'bowling', null, null);
      const c = await mk('Nueva', 'bowling', null, '2026-01-01');
      const d = await mk('Baloncesto', 'basketball', '2026-02-01', null);
      const e = await mk('De BowlingX', 'bowling', '2026-01-06', '2026-12-15');
      const f = await mk('Sin fechas, varios años', 'bowling', null, null);
      await pg.query(`insert into public.events (league_id, type, date) values ($1, 'practica', '2026-02-10'), ($2, 'practica', '2025-08-05')`, [a, b]);
      await pg.query(
        `insert into public.events (league_id, type, date)
         values ($1, 'practica', '2024-03-05'), ($1, 'practica', '2025-11-04'), ($1, 'torneo', '2025-02-01'), ($1, 'practica', '2026-01-02'),
                ($1, 'practica', '2026-02-03'), ($2, 'practica', '2024-06-01'), ($2, 'practica', '2026-04-01')`,
        [e, f],
      );
      const team = (await pg.query<{ id: string }>(`insert into public.teams (league_id, name) values ($1, 'Tigres') returning id`, [d])).rows[0].id;
      await pg.query(`insert into public.matches (league_id, scheduled_at) values ($1, '2026-01-15T23:00:00Z')`, [d]);
      for (const f of files.slice(at)) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
      const rows = (
        await pg.query<{ league_id: string; name: string; s: string; e: string | null; status: string }>(
          `select league_id, name, to_char(starts_on, 'YYYY-MM-DD') as s, to_char(ends_on, 'YYYY-MM-DD') as e, status from public.seasons`,
        )
      ).rows;
      const of = (lid: string) => rows.filter((r) => r.league_id === lid).map(({ league_id: _l, ...r }) => r);
      // Con fechas pero con una práctica antes del inicio: empieza con la práctica.
      expect(of(a)).toEqual([{ name: 'Temporada 2026', s: '2026-02-10', e: '2026-11-30', status: 'active' }]);
      // Sin fechas: desde lo primero que se jugó.
      expect(of(b)).toEqual([{ name: 'Temporada 2025', s: '2025-08-05', e: null, status: 'active' }]);
      // Sin nada jugado: desde que se creó (un fin antes del inicio no sirve).
      expect(of(c)).toEqual([{ name: 'Temporada 2026', s: '2026-05-05', e: null, status: 'active' }]);
      // Un partido antes del inicio también cuenta; y el equipo de temporada queda en ella.
      expect(of(d)).toEqual([{ name: 'Temporada 2026', s: '2026-01-15', e: null, status: 'active' }]);
      // Con juegos de años anteriores: la activa no se estira a esos años; cada uno queda en una cerrada (sin tabla).
      expect(of(e).sort((x, y) => x.s.localeCompare(y.s))).toEqual([
        { name: 'Temporada 2024', s: '2024-01-01', e: '2024-12-31', status: 'closed' },
        { name: 'Temporada 2025', s: '2025-01-01', e: '2025-12-31', status: 'closed' },
        { name: 'Temporada 2026', s: '2026-01-02', e: '2026-12-15', status: 'active' },
      ]);
      // Sin inicio: desde lo primero que se jugó (como pide la liga sin fechas).
      expect(of(f)).toEqual([{ name: 'Temporada 2024', s: '2024-06-01', e: null, status: 'active' }]);
      const [season] = (await pg.query<{ id: string }>(`select id from public.seasons where league_id = $1`, [d])).rows;
      expect((await pg.query(`select season_id from public.teams where id = $1`, [team])).rows).toEqual([{ season_id: season.id }]);
    } finally {
      await pg.close();
    }
  });
});
