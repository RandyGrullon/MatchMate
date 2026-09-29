/**
 * tests/reglas.test.ts (BowlingX) pasado a Postgres, 1 de 4: visibilidad, crear ligas y unirse, roles.
 * Cada `it` es el mismo caso que en Firestore; donde allá se escribía un documento, aquí se llama la RPC,
 * y además se comprueba que la escritura directa en la tabla está cerrada.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

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

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('visibilidad', () => {
  it('una liga pública se ve sin login, con todo su contenido', async () => {
    expect(await db.asAnon('select id from public.leagues where id = $1', [w.pub])).toHaveLength(1);
    expect(await db.asAnon('select id from public.events where league_id = $1', [w.pub])).toHaveLength(1);
    expect(await db.asAnon('select id from public.players where league_id = $1', [w.pub])).toHaveLength(1);
    expect(ids(await db.asAnon(`select id from public.leagues where visibility = 'public'`))).toContain(w.pub);
  });

  it('una liga privada no se ve sin ser miembro', async () => {
    expect(await db.asAnon('select id from public.leagues where id = $1', [w.priv])).toHaveLength(0);
    expect(await db.asUser(w.u.nuevo, 'select id from public.leagues where id = $1', [w.priv])).toHaveLength(0);
    expect(await db.asUser(w.u.nuevo, 'select id from public.entries where league_id = $1', [w.priv])).toHaveLength(0);
    // Sin login, listar todas solo devuelve las públicas.
    const all = await db.asAnon<{ visibility: string }>('select visibility from public.leagues');
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((l) => l.visibility === 'public')).toBe(true);
  });

  it('los miembros ven su liga privada y la lista de miembros', async () => {
    expect(await db.asUser(w.u.ana, 'select id from public.leagues where id = $1', [w.priv])).toHaveLength(1);
    expect(await db.asUser(w.u.ana, 'select id from public.entries where league_id = $1', [w.priv])).toHaveLength(1);
    expect(await db.asUser(w.u.ana, 'select user_id from public.league_members where league_id = $1', [w.priv])).toHaveLength(4);
    expect(await db.asUser(w.u.nuevo, 'select user_id from public.league_members where league_id = $1', [w.priv])).toHaveLength(0);
    // La vista con el jugador de cada cuenta.
    const luis = await db.asUser<{ player_id: string }>(w.u.ana, 'select player_id from public.memberships where league_id = $1 and user_id = $2', [
      w.priv,
      w.u.luis,
    ]);
    expect(luis[0].player_id).toBe(w.p.luis);
  });

  it('cada quien ve sus membresías y el superadmin todo', async () => {
    expect(await db.asUser(w.u.nuevo, 'select league_id from public.league_members where user_id = $1', [w.u.nuevo])).toHaveLength(0);
    expect(await db.asUser(w.u.luis, 'select league_id from public.league_members where user_id = $1', [w.u.luis])).toHaveLength(1);
    expect(ids(await db.asUser(w.u.dios, 'select id from public.leagues'))).toEqual(expect.arrayContaining([w.priv, w.pub]));
    expect(await db.asUser(w.u.dios2, 'select id from public.entries where league_id = $1', [w.priv])).toHaveLength(1);
    expect((await db.asUser(w.u.dios, 'select id from public.profiles')).length).toBeGreaterThanOrEqual(10);
    // Un admin de liga solo ve su propio perfil.
    expect(ids(await db.asUser(w.u.sofi, 'select id from public.profiles'))).toEqual([w.u.sofi]);
  });

  it('el código vigente solo lo leen los admins de la liga', async () => {
    expect(await db.asUser(w.u.sofi, 'select invite_code from public.league_secrets where league_id = $1', [w.priv])).toEqual([
      { invite_code: 'ABCD2345' },
    ]);
    expect(await db.asUser(w.u.luis, 'select invite_code from public.league_secrets where league_id = $1', [w.priv])).toHaveLength(0);
    // Con el código se ve a qué liga invita, sin cuenta.
    const preview = await db.rpcRows(ANON, 'invite_preview', { p_code: 'ABCD2345' });
    expect(preview).toEqual([
      { league_id: w.priv, name: 'Liga del Banco', sport: 'bowling', kind: 'liga', visibility: 'private', logo_path: null },
    ]);
    // Pero los códigos no se listan.
    await fails(db.asAnon('select invite_code from public.league_secrets'), '42501');
  });
});

describe('crear ligas y unirse', () => {
  it('cualquiera con cuenta crea una liga y queda como dueño', async () => {
    const r = await db.rpc<{ league_id: string; player_id: string; invite_code: string }>(w.u.nuevo, 'create_league', {
      p_name: 'Liga Nueva',
      p_visibility: 'private',
    });
    expect(r.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await db.admin('select owner_id from public.leagues where id = $1', [r.league_id])).toEqual([{ owner_id: w.u.nuevo }]);
    expect(await db.asUser(w.u.nuevo, 'select role, player_id from public.memberships where league_id = $1', [r.league_id])).toEqual([
      { role: 'owner', player_id: r.player_id },
    ]);
  });

  it('también un torneo sin liga, y después crea el torneo adentro', async () => {
    const r = await db.rpc<{ league_id: string }>(w.u.nuevo, 'create_league', { p_name: 'Copa', p_kind: 'torneo', p_visibility: 'public' });
    await db.rpc(w.u.nuevo, 'create_event', { p_league: r.league_id, p_type: 'torneo', p_name: 'Copa', p_date: '2026-11-01' });
    expect(await db.count('public.events', 'league_id = $1', [r.league_id])).toBe(1);
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'Raro', p_kind: 'club' }), INVALID);
    // Y de una vez (create_tournament: liga de un solo torneo + el torneo).
    const t = await db.rpc<{ league_id: string; event_id: string }>(w.u.nuevo, 'create_tournament', { p_name: 'Copa 2', p_date: '2026-11-08' });
    expect(await db.admin('select type, games, hcp_base, hcp_percent, team_size from public.events where id = $1', [t.event_id])).toEqual([
      { type: 'torneo', games: 3, hcp_base: 230, hcp_percent: 80, team_size: 3 },
    ]);
  });

  it('no se crea una liga a nombre de otro, sin dueño o con campos raros', async () => {
    await fails(db.rpc(ANON, 'create_league', { p_name: 'Sin cuenta' }), '42501');
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'X3', p_visibility: 'secreta' }), INVALID);
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: '' }), INVALID);
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'x'.repeat(61) }), INVALID);
    // Campos que no existen: no hay RPC con ese argumento.
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'X4', p_hack: true }), '42883');
    // A nombre de otro: no hay cómo (el dueño es quien llama) y la tabla no se escribe directo.
    await fails(
      db.asUser(w.u.nuevo, `insert into public.leagues (name, owner_id) values ('X2', $1)`, [w.u.org]),
      '42501',
    );
    // Sin la membresía de dueño: create_league siempre la crea en la misma transacción.
    const r = await db.rpc<{ league_id: string }>(w.u.nuevo, 'create_league', { p_name: 'X5' });
    expect(await db.count('public.league_members', `league_id = $1 and role = 'owner'`, [r.league_id])).toBe(1);
  });

  it('no puede hacerse dueño de una liga que ya existe', async () => {
    await fails(
      db.asUser(w.u.nuevo, `insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'new')`, [
        w.priv,
        w.u.nuevo,
      ]),
      '42501',
    );
    await db.rpc(w.u.nuevo, 'join_league', { p_league: w.priv, p_code: 'ABCD2345' });
    expect(await db.admin('select role from public.league_members where league_id = $1 and user_id = $2', [w.priv, w.u.nuevo])).toEqual([
      { role: 'member' },
    ]);
  });

  it('a una pública se une cualquiera; a una privada solo con el código', async () => {
    expect(await db.rpc(w.u.nuevo, 'join_league', { p_league: w.pub })).toMatchObject({ league_id: w.pub });
    await fails(db.rpc(w.u.otra, 'join_league', { p_league: w.priv }), DENIED);
    // Código malo: no entra (devuelve null y cuenta el intento).
    expect(await db.rpc(w.u.otra, 'join_league', { p_league: w.priv, p_code: 'MALO2345' })).toBeNull();
    expect(await db.count('public.league_members', 'league_id = $1 and user_id = $2', [w.priv, w.u.otra])).toBe(0);
    expect(await db.rpc(w.u.nuevo, 'join_league', { p_league: w.priv, p_code: 'abcd2345 ' })).toMatchObject({ league_id: w.priv });
    // Solo con el código (el link de invitación).
    expect(await db.rpc(w.u.extra, 'join_league', { p_code: 'ABCD2345' })).toMatchObject({ league_id: w.priv });
  });

  it('no se une como admin ni por otra persona', async () => {
    await fails(
      db.asUser(w.u.nuevo, `insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'admin', 'new')`, [
        w.pub,
        w.u.nuevo,
      ]),
      '42501',
    );
    await fails(db.rpc(w.u.nuevo, 'join_league', { p_league: w.pub, p_user: w.u.otra }), '42883');
    await fails(db.rpc(w.u.nuevo, 'join_league', { p_league: w.pub, p_role: 'admin' }), '42883');
    await db.rpc(w.u.nuevo, 'join_league', { p_league: w.pub });
    expect(await db.admin('select user_id, role from public.league_members where league_id = $1 and user_id <> $2', [w.pub, w.u.otro])).toEqual([
      { user_id: w.u.nuevo, role: 'member' },
    ]);
  });

  it('los admins cambian el código de invitación', async () => {
    const code = await db.rpc<string>(w.u.sofi, 'renew_invite_code', { p_league: w.priv });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await db.rpcRows(ANON, 'invite_preview', { p_code: 'ABCD2345' })).toHaveLength(0);
    expect(await db.rpcRows(ANON, 'invite_preview', { p_code: code })).toHaveLength(1);
    // Un miembro no puede fabricar códigos.
    await fails(db.rpc(w.u.luis, 'renew_invite_code', { p_league: w.priv }), DENIED);
    await fails(db.asUser(w.u.luis, `update public.league_secrets set invite_code = 'LUIS2345' where league_id = $1`, [w.priv]), '42501');
    await fails(db.asUser(w.u.luis, `insert into public.league_secrets (league_id, invite_code) values ($1, 'LUIS2345')`, [w.pub]), '42501');
  });
});

describe('roles en la liga', () => {
  const role = (uid: string, lid = w.priv) =>
    db.admin<{ role: string }>('select role from public.league_members where league_id = $1 and user_id = $2', [lid, uid]).then((r) => r[0]?.role);

  it('solo el dueño nombra o quita admins, y nadie toca al dueño', async () => {
    await db.rpc(w.u.org, 'set_member_role', { p_league: w.priv, p_user: w.u.ana, p_role: 'admin' });
    expect(await role(w.u.ana)).toBe('admin');
    await db.rpc(w.u.org, 'set_member_role', { p_league: w.priv, p_user: w.u.sofi, p_role: 'member' });
    expect(await role(w.u.sofi)).toBe('member');
    await fails(db.rpc(w.u.org, 'set_member_role', { p_league: w.priv, p_user: w.u.org, p_role: 'member' }), DENIED);
    await fails(db.rpc(w.u.org, 'set_member_role', { p_league: w.priv, p_user: w.u.ana, p_role: 'owner' }), INVALID);
  });

  it('un admin que no es dueño no cambia roles, pero sí nombra anotadores y desvincula jugadores', async () => {
    await fails(db.rpc(w.u.sofi, 'set_member_role', { p_league: w.priv, p_user: w.u.luis, p_role: 'admin' }), DENIED);
    await db.rpc(w.u.sofi, 'set_member_scorer', { p_league: w.priv, p_user: w.u.ana, p_scorer: true });
    expect(await db.admin('select is_scorer from public.league_members where league_id = $1 and user_id = $2', [w.priv, w.u.ana])).toEqual([
      { is_scorer: true },
    ]);
    await db.rpc(w.u.sofi, 'unlink_account', { p_player: w.p.luis });
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.luis])).toEqual([{ user_id: null }]);
  });

  it('el superadmin también maneja los permisos', async () => {
    await db.rpc(w.u.dios, 'set_member_role', { p_league: w.priv, p_user: w.u.luis, p_role: 'admin' });
    expect(await role(w.u.luis)).toBe('admin');
  });

  it('un miembro no se sube de rol', async () => {
    await fails(db.rpc(w.u.ana, 'set_member_role', { p_league: w.priv, p_user: w.u.ana, p_role: 'admin' }), DENIED);
    await fails(db.asUser(w.u.ana, `update public.league_members set role = 'admin' where user_id = $1`, [w.u.ana]), '42501');
    expect(await role(w.u.ana)).toBe('member');
  });

  it('el admin de una liga no administra otra', async () => {
    await fails(db.rpc(w.u.org, 'create_event', { p_league: w.pub, p_type: 'torneo', p_date: '2026-11-01' }), DENIED);
    await fails(db.rpc(w.u.org, 'update_league', { p_league: w.pub, p_patch: { name: 'Mía' } }), DENIED);
  });

  it('el superadmin administra cualquier liga y nombra superadmins', async () => {
    await db.rpc(w.u.dios, 'create_event', { p_league: w.pub, p_type: 'torneo', p_date: '2026-11-01' });
    await db.rpc(w.u.dios2, 'update_league', { p_league: w.priv, p_patch: { name: 'Liga Renombrada' } });
    expect(await db.admin('select name from public.leagues where id = $1', [w.priv])).toEqual([{ name: 'Liga Renombrada' }]);
    await fails(db.rpc(w.u.org, 'set_superadmin', { p_user: w.u.ana, p_value: true }), DENIED);
    await fails(db.rpc(w.u.ana, 'set_superadmin', { p_user: w.u.ana, p_value: true }), DENIED);
    await db.rpc(w.u.dios, 'set_superadmin', { p_user: w.u.ana, p_value: true });
    expect(await db.admin('select is_superadmin from public.profiles where id = $1', [w.u.ana])).toEqual([{ is_superadmin: true }]);
  });

  it('los admins editan la liga pero no cambian el dueño', async () => {
    await db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { venue: 'Otra bolera', require_photo: false } });
    expect(await db.admin('select venue, require_photo from public.leagues where id = $1', [w.priv])).toEqual([
      { venue: 'Otra bolera', require_photo: false },
    ]);
    await fails(db.rpc(w.u.sofi, 'update_league', { p_league: w.priv, p_patch: { owner_id: w.u.sofi } }), INVALID);
    await fails(db.rpc(w.u.luis, 'update_league', { p_league: w.priv, p_patch: { venue: 'x' } }), DENIED);
  });

  it('solo el dueño (o el superadmin) borra la liga', async () => {
    await fails(db.rpc(w.u.sofi, 'delete_league', { p_league: w.priv }), DENIED);
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    for (const t of ['public.players', 'public.events', 'public.entries', 'public.league_members', 'public.league_secrets']) {
      expect(await db.count(t, 'league_id = $1', [w.priv]), t).toBe(0);
    }
    expect(await db.count('public.leagues', 'id = $1', [w.priv])).toBe(0);
    // La otra liga sigue.
    expect(await db.count('public.players', 'league_id = $1', [w.pub])).toBe(1);
  });

  it('salir de la liga: cualquiera menos el dueño; un admin saca miembros', async () => {
    await fails(db.rpc(w.u.sofi, 'remove_member', { p_league: w.priv, p_user: w.u.org }), DENIED);
    await db.rpc(w.u.ana, 'leave_league', { p_league: w.priv });
    await db.rpc(w.u.sofi, 'remove_member', { p_league: w.priv, p_user: w.u.luis });
    await fails(db.rpc(w.u.luis, 'remove_member', { p_league: w.priv, p_user: w.u.sofi }), DENIED);
    expect(await db.count('public.league_members', 'league_id = $1', [w.priv])).toBe(2);
  });

  it('un admin no saca a otro admin (eso es quitarle permisos); el dueño sí', async () => {
    await db.rpc(w.u.org, 'set_member_role', { p_league: w.priv, p_user: w.u.ana, p_role: 'admin' });
    await fails(db.rpc(w.u.sofi, 'remove_member', { p_league: w.priv, p_user: w.u.ana }), DENIED);
    await db.rpc(w.u.org, 'remove_member', { p_league: w.priv, p_user: w.u.sofi });
    expect(await role(w.u.sofi)).toBeUndefined();
  });
});
