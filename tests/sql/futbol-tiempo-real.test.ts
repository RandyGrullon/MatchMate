/**
 * Tiempo real del fútbol (sanciones del comité): los triggers avisan por private.emit (en PGlite, NOTIFY 'mm').
 * NOTIFY solo sale al confirmar: cada llamada se confirma y el mundo se arma una vez.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestDb } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

interface Msg {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

let db: TestDb;
let w: World;
let msgs: Msg[] = [];
let lid: string;
let t1: string;
let pAna: string;
let match: string;

beforeAll(async () => {
  db = await TestDb.open();
  w = await makeWorld(db);
  lid = await league(db, w.u.org, { name: 'Sala en vivo', visibility: 'public', sport: 'futsal', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.ana, 'member', 'ana');
  pAna = await player(db, lid, 'Ana', w.u.ana);
  t1 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Tigres', p_players: [{ player_id: pAna, jersey: 9 }] });
  const t2 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones' });
  [match] = await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: lid, p_matches: [{ sides: [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }] }] });
  await db.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw) as Msg));
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(() => {
  msgs = [];
});

async function settle() {
  await new Promise((r) => setTimeout(r, 50));
  return msgs;
}

describe('tiempo real del fútbol', () => {
  it('sanciones del comité: {op, ids} a la liga; repetir lo mismo no avisa', async () => {
    const id = await db.rpc<string>(w.u.org, 'save_football_sanction', { p_match: match, p_team: t1, p_player: pAna, p_matches: 2 });
    let got = (await settle()).filter((m) => m.event === 'football_sanctions');
    expect(got).toEqual([{ topic: `league:${lid}`, event: 'football_sanctions', payload: { op: 'insert', ids: [id] } }]);
    msgs = [];
    await db.rpc(w.u.org, 'save_football_sanction', { p_id: id, p_match: match, p_team: t1, p_player: pAna, p_matches: 2 });
    expect((await settle()).filter((m) => m.event === 'football_sanctions')).toEqual([]);
    await db.rpc(w.u.org, 'save_football_sanction', { p_id: id, p_match: match, p_team: t1, p_player: pAna, p_matches: 3 });
    got = (await settle()).filter((m) => m.event === 'football_sanctions');
    expect(got.map((m) => m.payload)).toEqual([{ op: 'update', ids: [id] }]);
    msgs = [];
    await db.rpc(w.u.org, 'delete_football_sanction', { p_id: id });
    got = (await settle()).filter((m) => m.event === 'football_sanctions');
    expect(got.map((m) => m.payload)).toEqual([{ op: 'delete', ids: [id] }]);
  });

  it('borrar la liga no avisa', async () => {
    await db.rpc(w.u.org, 'save_football_sanction', { p_match: match, p_team: t1, p_player: pAna, p_matches: 1 });
    msgs = [];
    await db.rpc(w.u.org, 'delete_league', { p_league: lid });
    expect((await settle()).filter((m) => m.event === 'football_sanctions')).toEqual([]);
  });
});
