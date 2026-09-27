/**
 * Tiempo real: los triggers avisan por private.emit. En PGlite sale por NOTIFY en el canal 'mm'
 * ({topic, event, payload}); en Supabase por realtime.send (Broadcast a canales privados).
 * Aquí cada llamada se confirma (NOTIFY solo sale al hacer commit), así que el mundo se arma una vez.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestDb } from './harness';
import { makeWorld, type World } from './fixture';

interface Msg {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

let db: TestDb;
let w: World;
let msgs: Msg[] = [];

beforeAll(async () => {
  db = await TestDb.open();
  w = await makeWorld(db);
  await db.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw) as Msg));
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(() => {
  msgs = [];
});

/** Los avisos llegan después de la consulta: se espera un momento. */
async function settle() {
  await new Promise((r) => setTimeout(r, 50));
  return msgs;
}

describe('tiempo real', () => {
  it('en vivo: el estado completo al canal del evento', async () => {
    await db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e1, p_scores: [190, 210] });
    const live = (await settle()).filter((m) => m.event === 'live');
    expect(live).toHaveLength(1);
    expect(live[0].topic).toBe(`event:${w.e.e1}`);
    expect(live[0].payload).toMatchObject({ k: `p:${w.p.luis}`, player_id: w.p.luis, s: { scores: [190, 210] }, v: 1 });
    msgs = [];
    await db.rpc(w.u.luis, 'delete_live', { p_event: w.e.e1 });
    expect((await settle()).find((m) => m.event === 'live')?.payload).toMatchObject({ k: `p:${w.p.luis}`, deleted: true });
  });

  it('participaciones: un aviso por sentencia con los ids que cambiaron', async () => {
    const n = await db.rpc<number>(w.u.sofi, 'add_entries', { p_event: w.e.e1, p_players: [{ player_id: w.p.pedro, average: 150 }] });
    expect(n).toBe(1);
    const entries = (await settle()).filter((m) => m.event === 'entries');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ topic: `event:${w.e.e1}`, payload: { op: 'insert' } });
    // Sumar un inscrito cambia player_count, pero eso solo no avisa a la liga.
    expect((await settle()).filter((m) => m.event === 'events')).toHaveLength(0);
    msgs = [];
    await db.rpc(w.u.sofi, 'update_event', { p_event: w.e.e1, p_patch: { name: 'Práctica del martes' } });
    expect((await settle()).filter((m) => m.event === 'events')).toEqual([
      { topic: `league:${w.priv}`, event: 'events', payload: { op: 'update', ids: [w.e.e1] } },
    ]);
  });

  it('envíos: la liga y el evento se enteran; quien envió, cuando se revisa', async () => {
    const s = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_event: w.e.e1, p_scores: [150] });
    const topics = (await settle()).filter((m) => m.event === 'submissions').map((m) => m.topic);
    expect(topics.sort()).toEqual([`event:${w.e.e1}`, `league:${w.priv}`].sort());
    msgs = [];
    await db.rpc(w.u.sofi, 'reject_submission', { p_submission: s, p_note: 'Falta la foto' });
    expect((await settle()).filter((m) => m.event === 'submission')).toEqual([
      { topic: `user:${w.u.luis}`, event: 'submission', payload: { id: s, status: 'rechazado' } },
    ]);
  });

  it('«voy» al canal del evento', async () => {
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: true });
    expect((await settle()).filter((m) => m.event === 'rsvps')).toEqual([
      { topic: `event:${w.e.e1}`, event: 'rsvps', payload: { op: 'insert', player_ids: [w.p.luis] } },
    ]);
  });

  it('borrar una liga no manda un aviso por cada fila', async () => {
    const r = await db.rpc<{ league_id: string }>(w.u.otra, 'create_league', { p_name: 'Efímera' });
    const e = await db.rpc<string>(w.u.otra, 'create_event', { p_league: r.league_id, p_type: 'practica', p_date: '2026-10-01' });
    await db.rpc(w.u.otra, 'publish_live', { p_event: e, p_scores: [100] });
    msgs = [];
    await db.rpc(w.u.otra, 'delete_league', { p_league: r.league_id });
    expect(await settle()).toEqual([]);
  });

  it('si existe realtime.send (Supabase), emit lo usa en lugar de NOTIFY', async () => {
    await db.admin(`create schema if not exists realtime`);
    await db.admin(`create table realtime.sent (payload jsonb, event text, topic text, private boolean)`);
    await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                    language sql as $$ insert into realtime.sent values (payload, event, topic, private) $$`);
    await db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e1, p_scores: [300] });
    expect(await settle()).toEqual([]);
    expect(await db.admin('select event, topic, private from realtime.sent')).toEqual([{ event: 'live', topic: `event:${w.e.e1}`, private: true }]);
  });
});
