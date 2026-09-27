/**
 * Natación en tiempo real: los cambios del encuentro avisan a `event:<id>` y los de clubes y nadadores a
 * `league:<id>`, con evento 'swim' y {t, op}. NOTIFY solo sale al confirmar, así que aquí no hay rollback.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestDb } from './harness';
import { league, makeWorld, member, type World } from './fixture';

interface Msg {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

let db: TestDb;
let w: World;
let lid: string;
let msgs: Msg[] = [];

beforeAll(async () => {
  db = await TestDb.open();
  w = await makeWorld(db);
  lid = await league(db, w.u.org, { name: 'Natación', visibility: 'private', requirePhoto: false, sport: 'swimming', hasMinors: true });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.ana, 'member', 'ana', true);
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
  return msgs.filter((m) => m.event === 'swim');
}

describe('natación en tiempo real', () => {
  it('encuentro, pruebas, inscripciones y resultados avisan al canal del evento', async () => {
    const m = await db.rpc<string>(w.u.org, 'swim_create_meet', { p_league: lid, p_date: '2026-10-10' });
    expect((await settle()).map((x) => [x.topic, x.payload.t])).toEqual(
      expect.arrayContaining([
        [`event:${m}`, 'meet'],
        [`league:${lid}`, 'meets'],
      ]),
    );
    msgs = [];
    const [ev] = await db.rpc<string[]>(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'libre', gender: 'X' }] });
    expect(await settle()).toEqual([{ topic: `event:${m}`, event: 'swim', payload: { t: 'events', op: 'insert' } }]);
    msgs = [];
    const club = await db.rpc<string>(w.u.org, 'swim_save_club', { p_league: lid, p_name: 'Delfines' });
    const kid = await db.rpc<string>(w.u.org, 'swim_register_swimmer', {
      p_league: lid,
      p_name: 'Nena',
      p_club: club,
      p_is_minor: true,
      p_birth_year: 2016,
      p_sex: 'F',
      p_consent: true,
    });
    const league_msgs = (await settle()).filter((x) => x.topic === `league:${lid}`).map((x) => x.payload.t);
    expect(league_msgs).toContain('clubs');
    expect(league_msgs).toContain('swimmers');
    msgs = [];
    await db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: kid, seed_cs: 4000 }] });
    const entries = (await settle()).filter((x) => x.payload.t === 'entries');
    expect(entries).toEqual([{ topic: `event:${m}`, event: 'swim', payload: { t: 'entries', op: 'insert' } }]);
    const [en] = await db.admin<{ id: string }>('select id from public.swim_entries where swim_event_id = $1', [ev]);
    await db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes: [{ entry_id: en.id, heat: 1, lane: 3 }] }] });
    msgs = [];
    await db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: [{ entry_id: en.id, time_cs: 3999, status: 'ok' }] });
    // Una sola serie = un solo aviso (no uno por carril).
    expect(await settle()).toEqual([{ topic: `event:${m}`, event: 'swim', payload: { t: 'entries', op: 'update' } }]);
    msgs = [];
    await db.rpc(w.u.org, 'delete_event', { p_event: m });
    const del = await settle();
    expect(del.some((x) => x.topic === `event:${m}` && x.payload.op === 'delete')).toBe(true);
    // Borrar la liga no avisa nada.
    msgs = [];
    await db.rpc(w.u.org, 'delete_league', { p_league: lid });
    expect(await settle()).toEqual([]);
  });
});
