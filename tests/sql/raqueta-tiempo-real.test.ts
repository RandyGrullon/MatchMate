/**
 * Tiempo real de la escalera (20260927000700_raqueta.sql): ladder_rungs y ladder_challenges avisan por
 * private.emit (en PGlite, NOTIFY 'mm') al tema del evento y al de la liga con {t, op}. NOTIFY solo sale al
 * confirmar: cada llamada se confirma y el mundo se arma una vez.
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
let ev: string;
let pLuis: string;
let pAna: string;
let pOtra: string;

beforeAll(async () => {
  db = await TestDb.open();
  w = await makeWorld(db);
  lid = await league(db, w.u.org, { name: 'Tenis en vivo', visibility: 'public', sport: 'tennis', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  pLuis = await player(db, lid, 'Luis', w.u.luis);
  pAna = await player(db, lid, 'Ana', w.u.ana);
  pOtra = await player(db, lid, 'Otra');
  ev = await db.rpc<string>(w.u.org, 'create_event', { p_league: lid, p_type: 'escalera', p_date: '2026-10-01', p_config: { format: 'escalera' } });
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
  return msgs.filter((m) => m.event === 'ladder');
}

describe('tiempo real de la escalera', () => {
  it('los puestos: un aviso por sentencia al evento y a la liga', async () => {
    await db.rpc(w.u.org, 'set_ladder', { p_event: ev, p_entrants: [pAna, pOtra, pLuis] });
    const got = await settle();
    expect(got.some((m) => m.topic === `event:${ev}` && m.payload.t === 'rungs' && m.payload.op === 'insert')).toBe(true);
    expect(got.some((m) => m.topic === `league:${lid}` && m.payload.t === 'rungs' && m.payload.event_id === ev)).toBe(true);
  });

  it('el reto y su resultado: challenges y rungs', async () => {
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: ev, p_challenged: pAna });
    let got = await settle();
    expect(got.filter((m) => m.payload.t === 'challenges').map((m) => m.topic).sort()).toEqual([`event:${ev}`, `league:${lid}`].sort());
    msgs = [];
    const mid = (await db.admin<{ match_id: string }>('select match_id from public.ladder_challenges where id = $1', [id]))[0].match_id;
    await db.rpc(w.u.org, 'finish_match', { p_match: mid, p_score: { text: '6-4 6-4', sides: [2, 0] }, p_winner: 1 });
    got = await settle();
    expect(got.some((m) => m.payload.t === 'challenges' && m.payload.op === 'update')).toBe(true);
    expect(got.some((m) => m.payload.t === 'rungs' && m.payload.op === 'update')).toBe(true);
    // Y el partido avisa como siempre.
    expect(msgs.some((m) => m.event === 'match' && m.topic === `event:${ev}`)).toBe(true);
  });
});
