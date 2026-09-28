/**
 * Liga (20260927001300_liga.sql): avisos del admin a toda su liga (league_announce, league_announce_reach y el
 * historial league_announcements), «¿Quién eres?» al unirse (invite_details + join_league con p_prefer) y lo que
 * manda el formulario de la liga al activar «Liga con menores» y la zona horaria.
 *
 * Ojo: cada prueba corre en UNA transacción, así que now() es la misma hora en toda la prueba.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { TIMEZONES } from '../../src/components/league/logic';

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

type Json = Record<string, unknown>;

/** Teléfono con avisos push de la cuenta (n = cuál de sus teléfonos). */
const phone = (uid: string, n = 1) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}-${n}`,
  ]);

const outbox = () =>
  db.admin<{ user_id: string; title: string; body: string; url: string; tag: string; ttl: number; urgency: string }>(
    'select user_id, title, body, url, tag, ttl, urgency from public.push_outbox order by user_id, id',
  );

const history = (lid: string) =>
  db.admin<{ id: string; body: string; sent_by: string | null; author_name: string; recipients: number; local_day: string }>(
    `select id, body, sent_by, author_name, recipients, to_char(local_day, 'YYYY-MM-DD') as local_day
       from public.league_announcements where league_id = $1 order by body`,
    [lid],
  );

const localToday = async (lid: string) =>
  (await db.admin<{ d: string }>(`select to_char((now() at time zone l.tz)::date, 'YYYY-MM-DD') as d from public.leagues l where l.id = $1`, [lid]))[0].d;

describe('league_announce: aviso del admin a toda la liga', () => {
  it('llega a los miembros con avisos activados (no a quien lo manda) y queda en el historial', async () => {
    await phone(w.u.org);
    await phone(w.u.luis);
    await phone(w.u.luis, 2);
    await phone(w.u.sofi);
    // ana no tiene avisos; extra tiene avisos pero no es de la liga.
    await phone(w.u.extra);

    const n = await db.rpc<number>(w.u.sofi, 'league_announce', { p_league: w.priv, p_body: '  Se suspende por lluvia  ' });
    expect(n).toBe(2);

    const rows = await outbox();
    // Una fila por teléfono (luis tiene dos), ninguna para sofi ni para extra.
    expect(rows.map((r) => r.user_id).sort()).toEqual([w.u.luis, w.u.luis, w.u.org].sort());
    const [h] = await history(w.priv);
    for (const r of rows) {
      expect(r).toMatchObject({ title: 'Liga del Banco', body: 'Se suspende por lluvia', url: `/l/${w.priv}`, ttl: 43200, urgency: 'high' });
      expect(r.tag).toBe(`aviso:${h.id}`);
    }
    expect(h).toMatchObject({ body: 'Se suspende por lluvia', sent_by: w.u.sofi, author_name: 'sofi', recipients: 2, local_day: await localToday(w.priv) });
  });

  it('las cuentas bloqueadas no lo reciben; si no le llega a nadie igual queda en el historial', async () => {
    await phone(w.u.luis);
    await db.admin('update public.profiles set blocked_at = now() where id = $1', [w.u.luis]);
    expect(await db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: 'Cambio de cancha: la 3' })).toBe(0);
    expect(await outbox()).toEqual([]);
    expect(await history(w.priv)).toMatchObject([{ body: 'Cambio de cancha: la 3', recipients: 0, author_name: 'org' }]);
  });

  it('solo el dueño, los admins y el superadmin; un miembro, alguien de fuera o sin cuenta no', async () => {
    await fails(db.rpc(w.u.luis, 'league_announce', { p_league: w.priv, p_body: 'hola' }), DENIED);
    await fails(db.rpc(w.u.extra, 'league_announce', { p_league: w.priv, p_body: 'hola' }), DENIED);
    await fails(db.rpc(ANON, 'league_announce', { p_league: w.priv, p_body: 'hola' }), '42501');
    expect(await db.count('public.league_announcements')).toBe(0);

    // El superadmin (no es miembro): firma con el nombre de su cuenta.
    await db.rpc(w.u.dios, 'league_announce', { p_league: w.pub, p_body: 'Mañana no hay cancha' });
    expect(await history(w.pub)).toMatchObject([{ sent_by: w.u.dios, author_name: 'dios' }]);
    await fails(db.rpc(w.u.dios, 'league_announce', { p_league: '00000000-0000-4000-8000-000000000000', p_body: 'x' }), 'no_existe');
  });

  it('una cuenta bloqueada no manda avisos (aunque sea admin)', async () => {
    await db.admin('update public.profiles set blocked_at = now() where id = $1', [w.u.sofi]);
    const err = await fails(db.rpc(w.u.sofi, 'league_announce', { p_league: w.priv, p_body: 'hola' }), 'bloqueada');
    expect(err.code).toBe('42501');
  });

  it('texto de 1 a 180 (recortado, con saltos de línea), sin caracteres de control', async () => {
    for (const bad of ['', '   ', 'x'.repeat(181), 'Hola\u0007', 'Hola\tadiós']) {
      await fails(db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: bad }), INVALID);
    }
    await fails(db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: null }), INVALID);
    expect(await db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: `${'x'.repeat(180)}` })).toBe(0);
    await db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: 'Se suspende.\r\nNos vemos el martes.\n' });
    expect((await history(w.priv)).map((h) => h.body)).toEqual(['Se suspende.\nNos vemos el martes.', 'x'.repeat(180)]);
  });

  it('máximo 3 por día de la liga (en su zona); los de ayer y los de otra liga no cuentan', async () => {
    // Uno de ayer (en la hora de la liga) no cuenta para hoy.
    await db.admin(
      `insert into public.league_announcements (league_id, body, author_name, local_day)
       select l.id, 'ayer', 'org', (now() at time zone l.tz)::date - 1 from public.leagues l where l.id = $1`,
      [w.priv],
    );
    for (const body of ['uno', 'dos', 'tres']) await db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: body });
    await fails(db.rpc(w.u.sofi, 'league_announce', { p_league: w.priv, p_body: 'cuatro' }), 'rate_limited');
    expect(await db.count('public.league_announcements', 'league_id = $1', [w.priv])).toBe(4);
    // Otra liga tiene su propio tope.
    await db.rpc(w.u.otro, 'league_announce', { p_league: w.pub, p_body: 'hola' });
  });

  it('el día es el de la zona horaria de la liga', async () => {
    await db.admin(`update public.leagues set tz = 'Pacific/Kiritimati' where id = $1`, [w.pub]);
    await db.rpc(w.u.otro, 'league_announce', { p_league: w.pub, p_body: 'hola' });
    const [h] = await history(w.pub);
    const kiri = (await db.admin<{ d: string }>(`select to_char((now() at time zone 'Pacific/Kiritimati')::date, 'YYYY-MM-DD') as d`))[0].d;
    expect(h.local_day).toBe(kiri);
  });

  it('league_announce_reach: miembros, a cuántos llega y cuántos quedan hoy', async () => {
    await phone(w.u.luis);
    await phone(w.u.org);
    expect(await db.rpc<Json>(w.u.org, 'league_announce_reach', { p_league: w.priv })).toEqual({ members: 4, reach: 1, sentToday: 0, dailyLimit: 3 });
    expect(await db.rpc<Json>(w.u.sofi, 'league_announce_reach', { p_league: w.priv })).toEqual({ members: 4, reach: 2, sentToday: 0, dailyLimit: 3 });
    await db.rpc(w.u.sofi, 'league_announce', { p_league: w.priv, p_body: 'hola' });
    expect(await db.rpc<Json>(w.u.org, 'league_announce_reach', { p_league: w.priv })).toMatchObject({ sentToday: 1 });
    await fails(db.rpc(w.u.luis, 'league_announce_reach', { p_league: w.priv }), DENIED);
    await fails(db.rpc(ANON, 'league_announce_reach', { p_league: w.priv }), '42501');
  });
});

describe('historial de avisos (league_announcements)', () => {
  it('lo ve quien ve la liga (pública: también sin cuenta); nadie escribe directo', async () => {
    await db.rpc(w.u.org, 'league_announce', { p_league: w.priv, p_body: 'privado' });
    await db.rpc(w.u.otro, 'league_announce', { p_league: w.pub, p_body: 'público' });
    const bodies = async (who: string) => (await db.as<{ body: string }>(who, 'select body from public.league_announcements order by body')).map((r) => r.body);
    expect(await bodies(w.u.luis)).toEqual(['privado', 'público']);
    expect(await bodies(w.u.extra)).toEqual(['público']);
    expect(await bodies(ANON)).toEqual(['público']);
    expect(await bodies(w.u.dios)).toEqual(['privado', 'público']);

    for (const who of [ANON, w.u.org, w.u.dios]) {
      await fails(db.as(who, `insert into public.league_announcements (league_id, body, local_day) values ($1, 'x', current_date)`, [w.priv]), '42501');
      await fails(db.as(who, `update public.league_announcements set body = 'y'`), '42501');
      await fails(db.as(who, 'delete from public.league_announcements'), '42501');
    }
  });

  it('se borra con la liga', async () => {
    await db.rpc(w.u.otro, 'league_announce', { p_league: w.pub, p_body: 'hola' });
    await db.rpc(w.u.otro, 'delete_league', { p_league: w.pub });
    expect(await db.count('public.league_announcements')).toBe(0);
  });
});

describe('invite_details y «¿Quién eres?»', () => {
  it('con el código: la liga, los miembros y los jugadores libres (sin cuenta y no menores)', async () => {
    const d = await db.rpc<Json>(w.u.nuevo, 'invite_details', { p_code: ' abcd2345 ' });
    expect(d).toEqual({
      leagueId: w.priv,
      name: 'Liga del Banco',
      sport: 'bowling',
      kind: 'liga',
      visibility: 'private',
      venue: 'Bolera',
      schedule: 'Martes 7 pm',
      seasonStart: '2026-01-01',
      seasonEnd: '2026-12-31',
      hasMinors: false,
      members: 4,
      member: false,
      // Luis ya tiene cuenta: no sale.
      players: [{ id: w.p.pedro, name: 'Pedro' }],
    });
    expect(await db.rpc<Json>(w.u.luis, 'invite_details', { p_code: 'ABCD2345' })).toMatchObject({ member: true });
  });

  it('los menores no salen (no se pueden reclamar); la lista va por nombre', async () => {
    const club = await league(db, w.u.otro, { name: 'Club Delfines', visibility: 'private', requirePhoto: false, sport: 'swimming', hasMinors: true });
    await member(db, club, w.u.otro, 'owner', 'otro');
    await db.admin(`insert into public.league_secrets (league_id, invite_code) values ($1, 'DELF2345')`, [club]);
    const zoe = await player(db, club, 'Zoe Adulta');
    const ana = await player(db, club, 'Ana Adulta');
    await db.admin(`insert into public.players (league_id, name, is_minor) values ($1, 'Nene', true)`, [club]);
    const d = await db.rpc<Json>(w.u.nuevo, 'invite_details', { p_code: 'DELF2345' });
    expect(d).toMatchObject({ sport: 'swimming', hasMinors: true, members: 1 });
    expect(d.players).toEqual([
      { id: ana, name: 'Ana Adulta' },
      { id: zoe, name: 'Zoe Adulta' },
    ]);
  });

  it('código malo: null, y cuenta en el mismo límite que join_league', async () => {
    expect(await db.rpc(w.u.otra, 'invite_details', { p_code: '' })).toBeNull();
    for (let i = 0; i < 9; i++) expect(await db.rpc(w.u.otra, 'invite_details', { p_code: `MALO${2345 + i}` })).toBeNull();
    await fails(db.rpc(w.u.otra, 'invite_details', { p_code: 'ABCD2345' }), 'rate_limited');
    await fails(db.rpc(w.u.otra, 'join_league', { p_code: 'ABCD2345' }), 'rate_limited');
    // Otra cuenta sigue bien.
    expect(await db.rpc<Json>(w.u.extra, 'invite_details', { p_code: 'ABCD2345' })).toMatchObject({ leagueId: w.priv });
  });

  it('solo con sesión y sin bloquear', async () => {
    await fails(db.rpc(ANON, 'invite_details', { p_code: 'ABCD2345' }), '42501');
    await db.admin('update public.profiles set blocked_at = now() where id = $1', [w.u.nuevo]);
    await fails(db.rpc(w.u.nuevo, 'invite_details', { p_code: 'ABCD2345' }), 'bloqueada');
  });

  it('elegir «soy Pedro» al unirse vincula ese jugador (no crea otro)', async () => {
    const r = await db.rpc<Json>(w.u.nuevo, 'join_league', { p_code: 'ABCD2345', p_prefer: w.p.pedro });
    expect(r).toEqual({ league_id: w.priv, player_id: w.p.pedro });
    expect(await db.count('public.players', 'league_id = $1', [w.priv])).toBe(2);
    // Ya no sale como libre para el siguiente.
    expect(await db.rpc<Json>(w.u.extra, 'invite_details', { p_code: 'ABCD2345' })).toMatchObject({ players: [], members: 5 });
  });

  it('«No estoy en la lista»: se crea su jugador y los libres siguen libres', async () => {
    const r = await db.rpc<Json>(w.u.nuevo, 'join_league', { p_code: 'ABCD2345' });
    expect(r.player_id).not.toBe(w.p.pedro);
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.pedro])).toEqual([{ user_id: null }]);
  });

  it('en una liga pública, los jugadores libres se leen directo (sin código)', async () => {
    const rows = await db.asUser<{ id: string }>(w.u.nuevo, 'select id from public.players where league_id = $1 and user_id is null and not is_minor', [w.pub]);
    expect(rows.map((r) => r.id)).toEqual([w.p.p1]);
    expect(await db.rpc<Json>(w.u.nuevo, 'join_league', { p_league: w.pub, p_prefer: w.p.p1 })).toEqual({ league_id: w.pub, player_id: w.p.p1 });
  });
});

describe('formulario de la liga: menores y zona horaria (update_league)', () => {
  it('el admin activa «Liga con menores» (privada y sin foto obligatoria) y cambia la zona', async () => {
    await db.rpc(w.u.otro, 'update_league', {
      p_league: w.pub,
      p_patch: { has_minors: true, visibility: 'private', require_photo: false, tz: 'America/New_York' },
    });
    expect(await db.admin('select has_minors, visibility, tz from public.leagues where id = $1', [w.pub])).toEqual([
      { has_minors: true, visibility: 'private', tz: 'America/New_York' },
    ]);
    // Pública o con foto obligatoria no se puede.
    await fails(db.rpc(w.u.otro, 'update_league', { p_league: w.pub, p_patch: { visibility: 'public' } }), INVALID);
    await fails(db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { has_minors: true } }), INVALID);
    await fails(db.rpc(w.u.otro, 'update_league', { p_league: w.pub, p_patch: { tz: 'Marte/Base' } }), INVALID);
  });

  it('todas las zonas del formulario las acepta la base', async () => {
    for (const z of TIMEZONES) await db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { tz: z.id } });
    expect(await db.admin('select tz from public.leagues where id = $1', [w.priv])).toEqual([{ tz: TIMEZONES.at(-1)!.id }]);
    // Y al crear la liga.
    const r = await db.rpc<{ league_id: string }>(w.u.nuevo, 'create_league', { p_name: 'Liga en Bogotá', p_tz: 'America/Bogota', p_has_minors: false });
    expect(await db.admin('select tz from public.leagues where id = $1', [r.league_id])).toEqual([{ tz: 'America/Bogota' }]);
  });

  it('crear la liga ya con menores (privada y sin foto obligatoria)', async () => {
    const r = await db.rpc<{ league_id: string }>(w.u.nuevo, 'create_league', {
      p_name: 'Escuelita',
      p_visibility: 'private',
      p_require_photo: false,
      p_has_minors: true,
    });
    expect(await db.admin('select has_minors, visibility from public.leagues where id = $1', [r.league_id])).toEqual([{ has_minors: true, visibility: 'private' }]);
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'Mala', p_visibility: 'public', p_has_minors: true }), INVALID);
  });

  it('apagarlo: el admin no; el superadmin sí, y solo sin menores adentro', async () => {
    await db.rpc(w.u.otro, 'update_league', { p_league: w.pub, p_patch: { has_minors: true, visibility: 'private', require_photo: false } });
    await fails(db.rpc(w.u.otro, 'update_league', { p_league: w.pub, p_patch: { has_minors: false } }), DENIED);
    // Mandar el mismo valor (el formulario manda todo) no es apagarlo.
    await db.rpc(w.u.otro, 'update_league', { p_league: w.pub, p_patch: { has_minors: true, name: 'Liga Abierta 2' } });
    const minor = await db.admin<{ id: string }>(`insert into public.players (league_id, name, is_minor) values ($1, 'Nene', true) returning id`, [w.pub]);
    await fails(db.rpc(w.u.dios, 'update_league', { p_league: w.pub, p_patch: { has_minors: false } }), INVALID);
    await db.admin('delete from public.players where id = $1', [minor[0].id]);
    await db.rpc(w.u.dios, 'update_league', { p_league: w.pub, p_patch: { has_minors: false } });
    expect(await db.admin('select has_minors from public.leagues where id = $1', [w.pub])).toEqual([{ has_minors: false }]);
  });
});
