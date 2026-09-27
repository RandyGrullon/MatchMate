/**
 * Tiempo real del baloncesto (convocatoria y anotador designado): los triggers avisan por private.emit (en
 * PGlite, NOTIFY 'mm'). NOTIFY solo sale al confirmar: cada llamada se confirma y el mundo se arma una vez.
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
let night: string;
let t1: string;
let t2: string;
let pAna: string;

beforeAll(async () => {
  db = await TestDb.open();
  w = await makeWorld(db);
  lid = await league(db, w.u.org, { name: 'Baloncesto en vivo', visibility: 'public', sport: 'basketball', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.ana, 'member', 'ana');
  await member(db, lid, w.u.otra, 'member', 'otra');
  pAna = await player(db, lid, 'Ana', w.u.ana);
  const pOtra = await player(db, lid, 'Otra', w.u.otra);
  night = (await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'jornada', 'Jornada 1', '2026-10-05') returning id`, [lid]))[0]
    .id;
  t1 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Tigres', p_players: [{ player_id: pAna }] });
  t2 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones', p_players: [{ player_id: pOtra, role: 'delegate' }] });
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

const create = async (eventId: string | null) =>
  (
    await db.rpc<string[]>(w.u.org, 'create_matches', {
      p_league: lid,
      p_matches: [{ ...(eventId ? { event_id: eventId } : {}), sides: [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }] }],
    })
  )[0];

describe('tiempo real del baloncesto', () => {
  it('convocatoria: {op, ids} a la liga y al evento del partido', async () => {
    const id = await create(night);
    msgs = [];
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: id, p_status: 'yes' });
    let got = (await settle()).filter((m) => m.event === 'match_rsvps');
    expect(got.map((m) => m.topic).sort()).toEqual([`event:${night}`, `league:${lid}`].sort());
    for (const m of got) expect(m.payload).toEqual({ op: 'insert', ids: [id] });
    msgs = [];
    // Repetir lo mismo no cambia la fila y no avisa.
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: id, p_status: 'yes' });
    expect((await settle()).filter((m) => m.event === 'match_rsvps')).toEqual([]);
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: id, p_status: null });
    got = (await settle()).filter((m) => m.event === 'match_rsvps');
    expect(got.map((m) => m.payload.op)).toEqual(['delete', 'delete']);
  });

  it('anotador designado: solo a la liga si el partido no es de un evento', async () => {
    const id = await create(null);
    msgs = [];
    await db.rpc(w.u.org, 'set_match_official', { p_match: id, p_user: w.u.otra });
    const got = (await settle()).filter((m) => m.event === 'match_officials');
    expect(got).toEqual([{ topic: `league:${lid}`, event: 'match_officials', payload: { op: 'insert', ids: [id] } }]);
  });

  it('borrar el partido no avisa de su convocatoria (ya avisó el partido)', async () => {
    const id = await create(night);
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: id, p_status: 'maybe' });
    msgs = [];
    await db.rpc(w.u.org, 'delete_match', { p_match: id });
    const got = await settle();
    expect(got.filter((m) => m.event === 'match_rsvps')).toEqual([]);
    expect(got.filter((m) => m.event === 'matches').map((m) => m.payload.op)).toEqual(['delete', 'delete']);
  });
});
