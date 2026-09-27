/**
 * Tiempo real de los partidos: los triggers avisan por private.emit (en PGlite, NOTIFY 'mm').
 * NOTIFY solo sale al confirmar: cada llamada se confirma y el mundo se arma una vez.
 */
import { randomUUID } from 'node:crypto';
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
let night: string;
let pairA: string;
let pairB: string;
let pLuis: string;
let pOtra: string;

beforeAll(async () => {
  db = await TestDb.open();
  w = await makeWorld(db);
  lid = await league(db, w.u.org, { name: 'Pádel en vivo', visibility: 'public', sport: 'padel', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.otra, 'member', 'otra');
  pLuis = await player(db, lid, 'Luis', w.u.luis);
  pOtra = await player(db, lid, 'Otra', w.u.otra);
  night = (await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'noche', 'Americano', '2026-10-05') returning id`, [lid]))[0].id;
  pairA = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'A', p_players: [{ player_id: pLuis }] });
  pairB = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'B', p_players: [{ player_id: pOtra }] });
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

const create = (extra: Record<string, unknown> = {}) =>
  db.rpc<string[]>(w.u.org, 'create_matches', {
    p_league: lid,
    p_matches: [{ event_id: night, sides: [{ side: 1, team_id: pairA }, { side: 2, team_id: pairB }], ...extra }],
  });

describe('tiempo real de los partidos', () => {
  it('crear en lote: un solo aviso por tema (los lados no avisan aparte)', async () => {
    const ids = await db.rpc<string[]>(w.u.org, 'create_matches', {
      p_league: lid,
      p_matches: [
        { event_id: night, sides: [{ side: 1, team_id: pairA }, { side: 2, team_id: pairB }] },
        { event_id: night, sides: [{ side: 1, team_id: pairB }, { side: 2, team_id: pairA }] },
      ],
    });
    const got = (await settle()).filter((m) => m.event === 'matches');
    expect(got).toHaveLength(2);
    expect(got.map((m) => m.topic).sort()).toEqual([`event:${night}`, `league:${lid}`].sort());
    for (const m of got) expect(m.payload).toEqual({ op: 'insert', ids });
  });

  it('publicar: la fila del partido (sin el estado completo) a la liga y al evento', async () => {
    const [id] = await create();
    msgs = [];
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 2, p_state: { log: [1, 2] }, p_score: { text: '1-0', sides: [1, 0] } });
    const got = (await settle()).filter((m) => m.event === 'match');
    expect(got.map((m) => m.topic).sort()).toEqual([`event:${night}`, `league:${lid}`].sort());
    const p = got[0].payload;
    expect(p).toMatchObject({ id, status: 'live', seq: 2, score: { text: '1-0', sides: [1, 0] }, scorer_id: w.u.luis, league_id: lid });
    expect(p).not.toHaveProperty('state');
    expect(p).not.toHaveProperty('history');
    expect(p).not.toHaveProperty('rules');
  });

  it('confirmar y cambiar la alineación también avisan', async () => {
    const [id] = await create();
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: { text: '6-0 6-0', sides: [2, 0] }, p_winner: 1 });
    msgs = [];
    await db.rpc(w.u.otra, 'confirm_result', { p_match: id });
    expect((await settle()).find((m) => m.event === 'match' && m.topic === `league:${lid}`)?.payload).toMatchObject({ id, status: 'confirmed' });
    const [id2] = await create();
    msgs = [];
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id2, p_side: 1, p_players: [{ player_id: pLuis }] });
    expect((await settle()).filter((m) => m.event === 'matches')).toEqual([
      { topic: `league:${lid}`, event: 'matches', payload: { op: 'update', ids: [id2] } },
      { topic: `event:${night}`, event: 'matches', payload: { op: 'update', ids: [id2] } },
    ]);
  });

  it('borrar: un aviso de baja (sin avisos de los lados que se van con el partido)', async () => {
    const [id] = await create();
    msgs = [];
    await db.rpc(w.u.org, 'delete_match', { p_match: id });
    const got = (await settle()).filter((m) => m.event === 'matches');
    expect(got.map((m) => [m.topic, m.payload]).sort()).toEqual(
      [
        [`league:${lid}`, { op: 'delete', ids: [id] }],
        [`event:${night}`, { op: 'delete', ids: [id] }],
      ].sort(),
    );
  });

  it('equipos de temporada y plantillas: league:<id> teams', async () => {
    const t = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Nuevos' });
    expect((await settle()).filter((m) => m.event === 'teams')).toEqual([{ topic: `league:${lid}`, event: 'teams', payload: { op: 'insert', ids: [t] } }]);
    msgs = [];
    await db.rpc(w.u.org, 'set_team_player', { p_team: t, p_player: pLuis, p_jersey: 9 });
    expect((await settle()).filter((m) => m.event === 'teams')).toEqual([{ topic: `league:${lid}`, event: 'teams', payload: { op: 'update', ids: [t] } }]);
    // Los equipos de un evento del boliche no avisan por aquí.
    msgs = [];
    await db.rpc(w.u.org, 'add_team', { p_event: w.e.e1, p_name: 'Boliche' });
    expect((await settle()).filter((m) => m.event === 'teams')).toEqual([]);
  });
});
