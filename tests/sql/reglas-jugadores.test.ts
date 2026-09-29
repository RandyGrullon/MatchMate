/**
 * tests/reglas.test.ts (BowlingX) pasado a Postgres, 2 de 4: vincular jugador (la cuenta es el jugador).
 * Allá el vínculo eran dos datos (member.playerId y player.uid) escritos en el mismo lote; aquí es uno
 * solo (players.user_id), que solo cambian las RPC.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DENIED, TestDb, fails } from './harness';
import { makeWorld, player, type World } from './fixture';

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

const ownerOf = async (pid: string) => (await db.admin<{ user_id: string | null }>('select user_id from public.players where id = $1', [pid]))[0]?.user_id;
const playersOf = (uid: string, lid = w.priv) =>
  db.admin<{ id: string; name: string }>('select id, name from public.players where league_id = $1 and user_id = $2', [lid, uid]);

describe('vincular jugador', () => {
  it('un miembro reclama un jugador libre y, cuando el admin lo aprueba, quedan jugador + membresía juntos', async () => {
    const claim = await db.rpc<string>(w.u.ana, 'claim_player', { p_player: w.p.pedro });
    expect(await ownerOf(w.p.pedro)).toBeNull();
    expect(await db.rpc(w.u.sofi, 'decide_player_claim', { p_claim: claim, p_approve: true })).toBe('approved');
    expect(await ownerOf(w.p.pedro)).toBe(w.u.ana);
    expect(await db.asUser(w.u.ana, 'select player_id from public.memberships where league_id = $1 and user_id = $2', [w.priv, w.u.ana])).toEqual([
      { player_id: w.p.pedro },
    ]);
  });

  it('no reclama un jugador que ya tiene cuenta ni uno de otra liga', async () => {
    await fails(db.rpc(w.u.ana, 'claim_player', { p_player: w.p.luis }), 'duplicado');
    await fails(db.rpc(w.u.ana, 'claim_player', { p_player: w.p.p1 }), DENIED);
    await fails(db.asUser(w.u.ana, 'update public.players set user_id = $1 where id = $2', [w.u.ana, w.p.pedro]), '42501');
    expect(await ownerOf(w.p.luis)).toBe(w.u.luis);
    expect(await ownerOf(w.p.p1)).toBeNull();
  });

  it('crea su propio jugador si no está en la lista', async () => {
    const pid = await db.rpc<string>(w.u.ana, 'ensure_my_player', { p_league: w.priv });
    expect(await playersOf(w.u.ana)).toEqual([{ id: pid, name: 'ana' }]);
    // Pedro sigue libre (no se llama como ella).
    expect(await ownerOf(w.p.pedro)).toBeNull();
  });

  it('quien ya tiene jugador no crea otro', async () => {
    expect(await db.rpc(w.u.luis, 'ensure_my_player', { p_league: w.priv })).toBe(w.p.luis);
    // Pedir otro jugador no le crea otro: queda el pedido (al aprobarlo se juntan en uno).
    expect(await db.rpc(w.u.luis, 'claim_player', { p_player: w.p.pedro })).toBeTruthy();
    expect(await ownerOf(w.p.pedro)).toBeNull();
    await fails(db.rpc(w.u.luis, 'create_player', { p_league: w.priv, p_name: 'Luis 2' }), DENIED);
    await fails(db.asUser(w.u.luis, `insert into public.players (league_id, user_id, name) values ($1, $2, 'Luis 2')`, [w.priv, w.u.luis]), '42501');
    expect(await playersOf(w.u.luis)).toHaveLength(1);
  });

  it('el dueño también juega: al crear la liga se crea su jugador con su cuenta', async () => {
    const r = await db.rpc<{ league_id: string; player_id: string }>(w.u.otra, 'create_league', { p_name: 'Mía' });
    expect(await playersOf(w.u.otra, r.league_id)).toEqual([{ id: r.player_id, name: 'otra' }]);
    // Pedirlo otra vez no crea otro.
    expect(await db.rpc(w.u.otra, 'ensure_my_player', { p_league: r.league_id })).toBe(r.player_id);
  });

  it('un admin también tiene su jugador (se crea con su cuenta)', async () => {
    const pid = await db.rpc<string>(w.u.sofi, 'ensure_my_player', { p_league: w.priv });
    expect(await playersOf(w.u.sofi)).toEqual([{ id: pid, name: 'sofi' }]);
  });

  it('un admin no se crea un segundo jugador propio (dos teléfonos a la vez), pero sí jugadores de la lista', async () => {
    const first = await db.rpc<string>(w.u.sofi, 'ensure_my_player', { p_league: w.priv });
    expect(await db.rpc(w.u.sofi, 'ensure_my_player', { p_league: w.priv })).toBe(first);
    expect(await playersOf(w.u.sofi)).toHaveLength(1);
    const guest = await db.rpc<string>(w.u.sofi, 'create_player', { p_league: w.priv, p_name: 'Invitado' });
    expect(await ownerOf(guest)).toBeNull();
    await db.rpc(w.u.sofi, 'update_player', { p_player: first, p_patch: { name: 'Sofía' } });
    expect(await playersOf(w.u.sofi)).toEqual([{ id: first, name: 'Sofía' }]);
    // La cuenta no se cambia editando el jugador.
    await fails(db.rpc(w.u.sofi, 'update_player', { p_player: guest, p_patch: { user_id: w.u.sofi } }), 'invalido');
  });

  it('el admin separa una cuenta mal vinculada y le da su jugador nuevo en el mismo momento', async () => {
    const fresh = await db.rpc<string>(w.u.sofi, 'unlink_account', { p_player: w.p.luis });
    expect(fresh).not.toBe(w.p.luis);
    expect(await ownerOf(w.p.luis)).toBeNull();
    expect(await playersOf(w.u.luis)).toEqual([{ id: fresh, name: 'luis' }]);
    // Sus juegos se quedan con el jugador de la lista.
    expect(await db.count('public.entries', 'player_id = $1', [w.p.luis])).toBe(1);
  });

  it('el admin une la cuenta de alguien con un jugador de la lista sin cuenta (y borra el que se le creó)', async () => {
    const auto = await player(db, w.priv, 'Ana', w.u.ana);
    const link = (who: string) => db.rpc(who, 'link_account_to_player', { p_player: w.p.pedro, p_user: w.u.ana });
    // Un miembro no puede hacerlo por otro (ni por sí mismo con un jugador que no es suyo).
    await fails(link(w.u.luis), DENIED);
    await fails(link(w.u.ana), DENIED);
    expect(await link(w.u.sofi)).toEqual({ removed_old: true, old_player_id: auto });
    expect(await ownerOf(w.p.pedro)).toBe(w.u.ana);
    expect(await db.count('public.players', 'id = $1', [auto])).toBe(0);
  });

  it('al salir suelta su jugador', async () => {
    await db.rpc(w.u.luis, 'leave_league', { p_league: w.priv });
    expect(await ownerOf(w.p.luis)).toBeNull();
    expect(await db.count('public.league_members', 'league_id = $1 and user_id = $2', [w.priv, w.u.luis])).toBe(0);
    // El jugador y sus juegos se quedan en la liga.
    expect(await db.count('public.entries', 'player_id = $1', [w.p.luis])).toBe(1);
  });
});
