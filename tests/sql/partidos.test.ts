/**
 * Partidos (20260927000100_partidos.sql): quién crea, anota, publica, termina, confirma, disputa y corrige,
 * y quién maneja los equipos y parejas de temporada. Cada prueba en su transacción (se deshace al final).
 *
 * Mundo de pádel (liga privada «Pádel Club», dueño org, admin sofi):
 * - pareja A (luis + ana) contra pareja B (otra + nuevo); mia es miembro sin partido; extra es anotador de la liga;
 *   pedro es jugador sin cuenta (suplente).
 * - otro no es de la liga (ve nada por ser privada).
 * Mundo de baloncesto (liga pública de otro): equipo T1 (luis capitán, ana jugadora) y T2 (otra delegada, nuevo jugador).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { event, league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;
let mia: string;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  mia = await db.createUser('mia@x.com', 'mia');
});
afterEach(async () => {
  await db.rollback();
});

interface Padel {
  lid: string;
  p: { luis: string; ana: string; otra: string; nuevo: string; mia: string; pedro: string; extra: string };
  pairA: string;
  pairB: string;
  night: string;
}

async function padel(): Promise<Padel> {
  const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'private', sport: 'padel', requirePhoto: false });
  await db.admin(`update public.leagues set rules = '{"match": {"sport": "padel", "deuce": "golden"}}' where id = $1`, [lid]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  await member(db, lid, w.u.otra, 'member', 'otra');
  await member(db, lid, w.u.nuevo, 'member', 'nuevo');
  await member(db, lid, mia, 'member', 'mia');
  await member(db, lid, w.u.extra, 'member', 'extra', true);
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    mia: await player(db, lid, 'Mia', mia),
    extra: await player(db, lid, 'Extra', w.u.extra),
    pedro: await player(db, lid, 'Pedro'),
  };
  const pairA = await db.rpc<string>(w.u.sofi, 'create_season_team', {
    p_league: lid,
    p_name: 'Luis / Ana',
    p_players: [{ player_id: p.luis }, { player_id: p.ana }],
  });
  const pairB = await db.rpc<string>(w.u.sofi, 'create_season_team', {
    p_league: lid,
    p_name: 'Otra / Nuevo',
    p_players: [{ player_id: p.otra }, { player_id: p.nuevo }],
  });
  const night = await db.admin<{ id: string }>(
    `insert into public.events (league_id, type, name, date) values ($1, 'liga', 'Jornada 1', '2026-10-05') returning id`,
    [lid],
  );
  return { lid, p, pairA, pairB, night: night[0].id };
}

const sides = (x: Padel, extra: Record<string, unknown> = {}) => ({
  sides: [
    { side: 1, team_id: x.pairA, players: [{ player_id: x.p.luis }, { player_id: x.p.ana }] },
    { side: 2, team_id: x.pairB, players: [{ player_id: x.p.otra }, { player_id: x.p.nuevo }] },
  ],
  ...extra,
});

async function oneMatch(x: Padel, extra: Record<string, unknown> = {}): Promise<string> {
  const ids = await db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: x.lid, p_matches: [sides(x, extra)] });
  return ids[0];
}

const matchRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.matches where id = $1', [id]))[0];

const SCORE = { text: '6-4 6-3', sides: [2, 0] };
const STATE = { v: 1, seq: 3, log: [{ type: 'point', side: 1 }] };

describe('crear partidos', () => {
  it('el admin crea en lote, con ids del teléfono y en el mismo orden; lados y nombres copiados', async () => {
    const x = await padel();
    const a = randomUUID();
    const b = randomUUID();
    const ids = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: x.lid,
      p_matches: [
        { id: a, event_id: x.night, round: 1, court: 'Cancha 1', scheduled_at: '2026-10-05T23:00:00Z', format: 'sets', ...sides(x) },
        {
          id: b,
          round: 1,
          court: 'Cancha 2',
          require_confirm: false,
          rules: { match: { sport: 'padel', deuce: 'ad' } },
          sides: [
            { side: 1, players: [{ player_id: x.p.luis }, { player_id: x.p.otra }] },
            { side: 2, label: 'Los de siempre', players: [{ player_id: x.p.ana, position: 'reves' }, { player_id: x.p.nuevo }] },
          ],
        },
      ],
    });
    expect(ids).toEqual([a, b]);
    const ma = await matchRow(a);
    expect(ma).toMatchObject({ league_id: x.lid, event_id: x.night, round: 1, court: 'Cancha 1', status: 'scheduled', format: 'sets', seq: 0 });
    // Sin reglas propias, copia las de la liga.
    expect(ma.rules).toEqual({ match: { sport: 'padel', deuce: 'golden' } });
    expect((await matchRow(b)).rules).toEqual({ match: { sport: 'padel', deuce: 'ad' } });
    expect((await matchRow(b)).require_confirm).toBe(false);
    const s = await db.admin<{ match_id: string; side: number; team_id: string | null; label: string }>(
      'select match_id, side, team_id, label from public.match_sides where match_id = any ($1) order by match_id = $2 desc, side',
      [[a, b], a],
    );
    expect(s.map((r) => [r.side, r.team_id, r.label])).toEqual([
      [1, x.pairA, 'Luis / Ana'],
      [2, x.pairB, 'Otra / Nuevo'],
      [1, null, 'Luis / Otra'],
      [2, null, 'Los de siempre'],
    ]);
    expect(await db.count('public.match_players', 'match_id = $1', [b])).toBe(4);
    expect(await db.count('public.match_players', `match_id = $1 and position = 'reves'`, [b])).toBe(1);
  });

  it('solo el admin; solo ligas de partidos; nada de otra liga', async () => {
    const x = await padel();
    await fails(db.rpc(w.u.luis, 'create_matches', { p_league: x.lid, p_matches: [sides(x)] }), DENIED);
    await fails(db.rpc(w.u.extra, 'create_matches', { p_league: x.lid, p_matches: [sides(x)] }), DENIED);
    await fails(db.rpc(w.u.otro, 'create_matches', { p_league: x.lid, p_matches: [sides(x)] }), DENIED);
    await fails(db.rpc(ANON, 'create_matches', { p_league: x.lid, p_matches: [sides(x)] }), DENIED);
    // Boliche: no hay partidos.
    await fails(
      db.rpc(w.u.org, 'create_matches', { p_league: w.priv, p_matches: [{ sides: [{ side: 1, label: 'A' }, { side: 2, label: 'B' }] }] }),
      'invalido',
    );
    await fails(db.admin(`insert into public.matches (league_id) values ($1)`, [w.priv]), 'invalido');
    // Jugador de otra liga, evento de otra liga, lados mal armados.
    await fails(
      db.rpc(w.u.sofi, 'create_matches', {
        p_league: x.lid,
        p_matches: [{ sides: [{ side: 1, players: [{ player_id: w.p.pedro }] }, { side: 2, label: 'B' }] }],
      }),
      INVALID,
    );
    await fails(db.rpc(w.u.sofi, 'create_matches', { p_league: x.lid, p_matches: [sides(x, { event_id: w.e.e1 })] }), INVALID);
    await fails(db.rpc(w.u.sofi, 'create_matches', { p_league: x.lid, p_matches: [{ sides: [{ side: 1, label: 'A' }] }] }), 'invalido');
    await fails(
      db.rpc(w.u.sofi, 'create_matches', { p_league: x.lid, p_matches: [{ sides: [{ side: 1, label: 'A' }, { side: 1, label: 'B' }] }] }),
      'invalido',
    );
    await fails(db.rpc(w.u.sofi, 'create_matches', { p_league: x.lid, p_matches: [] }), 'invalido');
    expect(await db.count('public.matches', 'league_id = $1', [x.lid])).toBe(0);
  });

  it('un lado del cuadro sin rival todavía queda «Por definir» y el admin lo llena después', async () => {
    const x = await padel();
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: x.lid,
      p_matches: [{ bracket_key: 'R2-1', stage: 'Final', sides: [{ side: 1 }, { side: 2 }] }],
    });
    expect((await db.admin<{ label: string }>('select label from public.match_sides where match_id = $1 order by side', [id])).map((r) => r.label)).toEqual([
      'Por definir',
      'Por definir',
    ]);
    await fails(db.rpc(w.u.luis, 'set_match_sides', { p_match: id, p_sides: sides(x).sides }), DENIED);
    await db.rpc(w.u.sofi, 'set_match_sides', { p_match: id, p_sides: sides(x).sides });
    expect(await db.count('public.match_players', 'match_id = $1', [id])).toBe(4);
    expect((await matchRow(id)).bracket_key).toBe('R2-1');
  });
});

describe('quién ve los partidos', () => {
  it('liga privada: sus miembros; nadie de fuera ni sin cuenta', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    expect(await db.asUser(mia, 'select id from public.matches where id = $1', [id])).toHaveLength(1);
    expect(await db.asUser(w.u.otro, 'select id from public.matches where id = $1', [id])).toHaveLength(0);
    expect(await db.asAnon('select id from public.matches where id = $1', [id])).toHaveLength(0);
    expect(await db.asAnon('select match_id from public.match_sides where match_id = $1', [id])).toHaveLength(0);
    expect(await db.asUser(w.u.otro, 'select team_id from public.team_players where team_id = $1', [x.pairA])).toHaveLength(0);
    expect(await db.asUser(w.u.luis, 'select player_id from public.team_players where team_id = $1', [x.pairA])).toHaveLength(2);
  });

  it('nadie escribe directo en las tablas', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    for (const t of ['matches', 'match_sides', 'match_players', 'team_players']) {
      await fails(db.asUser(w.u.sofi, `delete from public.${t}`), '42501');
      await fails(db.asUser(w.u.org, `update public.${t} set league_id = league_id`), '42501');
    }
    await fails(db.asUser(w.u.luis, `update public.matches set status = 'confirmed' where id = $1`, [id]), '42501');
  });
});

describe('turno del anotador', () => {
  it('lo pide alguien del partido; el segundo ve quién lo tiene; el admin se lo quita con p_force', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    const first = await db.rpc<Record<string, unknown>>(w.u.luis, 'claim_scorer', { p_match: id });
    expect(first).toMatchObject({ ok: true, scorer_id: w.u.luis, scorer_name: 'luis', expired: false, seq: 0, status: 'scheduled' });
    // Pedirlo otra vez (otro teléfono de la misma cuenta) sirve.
    expect(await db.rpc(w.u.luis, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true });
    // Otro jugador: no se lo quita, ni aunque el turno haya vencido.
    expect(await db.rpc(w.u.otra, 'claim_scorer', { p_match: id })).toMatchObject({ ok: false, scorer_id: w.u.luis, scorer_name: 'luis', state: null });
    await db.admin(`update public.matches set lease_until = now() - interval '1 hour' where id = $1`, [id]);
    expect(await db.rpc(w.u.otra, 'claim_scorer', { p_match: id, p_force: true })).toMatchObject({ ok: false, expired: true });
    // Sin permiso: miembro que no juega, alguien de fuera, sin cuenta.
    await fails(db.rpc(mia, 'claim_scorer', { p_match: id }), DENIED);
    await fails(db.rpc(w.u.otro, 'claim_scorer', { p_match: id }), DENIED);
    await fails(db.rpc(ANON, 'claim_scorer', { p_match: id }), DENIED);
    // El admin: sin p_force ve quién lo tiene; con p_force se lo queda (queda en el historial).
    expect(await db.rpc(w.u.sofi, 'claim_scorer', { p_match: id })).toMatchObject({ ok: false, scorer_id: w.u.luis });
    expect(await db.rpc(w.u.sofi, 'claim_scorer', { p_match: id, p_force: true })).toMatchObject({ ok: true, scorer_id: w.u.sofi });
    const m = await matchRow(id);
    expect(m.scorer_id).toBe(w.u.sofi);
    expect((m.history as { a: string; from?: string }[]).at(-1)).toMatchObject({ a: 'takeover', from: w.u.luis, by: w.u.sofi });
  });

  it('el anotador de la liga también puede; no en partidos terminados', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    expect(await db.rpc(w.u.extra, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true, scorer_id: w.u.extra });
    await db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await fails(db.rpc(w.u.luis, 'claim_scorer', { p_match: id }), 'cerrado');
  });

  it('soltar y entregar el control: quien lo tiene o el admin, y solo a quien puede anotar', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    await fails(db.rpc(w.u.otra, 'release_scorer', { p_match: id }), DENIED);
    await fails(db.rpc(w.u.luis, 'release_scorer', { p_match: id, p_to: mia }), 'invalido');
    await db.rpc(w.u.luis, 'release_scorer', { p_match: id, p_to: w.u.otra });
    expect((await matchRow(id)).scorer_id).toBe(w.u.otra);
    await db.rpc(w.u.otra, 'release_scorer', { p_match: id });
    expect((await matchRow(id)).scorer_id).toBeNull();
    // Soltar sin tenerlo: nada (sin error) si puede anotar.
    await db.rpc(w.u.luis, 'release_scorer', { p_match: id });
    // El admin se lo da a quien quiera.
    await db.rpc(w.u.sofi, 'release_scorer', { p_match: id, p_to: w.u.extra });
    const m = await matchRow(id);
    expect(m.scorer_id).toBe(w.u.extra);
    expect((m.history as { a: string }[]).map((h) => h.a)).toEqual(['handoff', 'release', 'handoff']);
  });
});

describe('publicar el marcador', () => {
  it('quien tiene el turno publica: pasa a en vivo y el turno se renueva; reintentar no repite', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    const op = randomUUID();
    const r = await db.rpc<Record<string, unknown>>(w.u.luis, 'publish_match', { p_op_id: op, p_match: id, p_seq: 3, p_state: STATE, p_score: SCORE });
    expect(r).toMatchObject({ ok: true, status: 'live', seq: 3 });
    const v = (await matchRow(id)).version;
    expect(await db.rpc(w.u.luis, 'publish_match', { p_op_id: op, p_match: id, p_seq: 3, p_state: STATE, p_score: SCORE })).toEqual(r);
    expect((await matchRow(id)).version).toBe(v);
    expect(await matchRow(id)).toMatchObject({ status: 'live', seq: 3, state: STATE, score: SCORE, scorer_id: w.u.luis });
  });

  it('otro teléfono con otra cuenta: no pisa, se entera de quién anota; publicación vieja: no pisa', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 5, p_state: { ...STATE, seq: 5 }, p_score: SCORE });
    // Nadie tenía el turno: publicar lo toma (anotó sin señal y luego llegó).
    expect((await matchRow(id)).scorer_id).toBe(w.u.luis);
    expect(await db.rpc(w.u.otra, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 9, p_state: {}, p_score: null })).toMatchObject({
      ok: false,
      reason: 'lease',
      scorer_id: w.u.luis,
    });
    expect(await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 4, p_state: {}, p_score: null })).toMatchObject({
      ok: false,
      reason: 'stale',
      seq: 5,
    });
    expect(await matchRow(id)).toMatchObject({ seq: 5, state: { ...STATE, seq: 5 } });
    await fails(db.rpc(mia, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 6, p_state: {}, p_score: null }), DENIED);
    await fails(db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 6, p_state: [1], p_score: null }), 'invalido');
    await fails(db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 6, p_state: {}, p_score: { sides: [1, -1] } }), 'invalido');
    await fails(db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 6, p_state: {}, p_score: { sides: ['1', 2] } }), 'invalido');
    // Terminado: la publicación que llega tarde no cambia nada.
    await db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    expect(await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 50, p_state: {}, p_score: null })).toMatchObject({
      ok: false,
      reason: 'cerrado',
      status: 'confirmed',
    });
  });

  it('seq con tope y el mismo que el del estado: nadie deja a los demás siempre «viejos»', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    const pub = (who: string, seq: number, state: Record<string, unknown>) =>
      db.rpc(who, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: seq, p_state: state, p_score: SCORE });
    await fails(pub(w.u.luis, 2147483647, { v: 1, seq: 2147483647 }), 'invalido');
    await fails(pub(w.u.luis, 10001, { v: 1, seq: 10001 }), 'invalido');
    // El seq del estado (lo que toma el que sigue) tiene que ser el que se publica.
    await fails(pub(w.u.luis, 3, { v: 1, seq: 2147483647 }), 'invalido');
    await fails(pub(w.u.luis, 3, { v: 1, seq: '3' }), 'invalido');
    expect(await matchRow(id)).toMatchObject({ seq: 0, status: 'scheduled' });
    expect(await pub(w.u.luis, 3, { v: 1, seq: 3 })).toMatchObject({ ok: true, seq: 3 });
    expect(await pub(w.u.luis, 10003, { v: 1, seq: 10003 })).toMatchObject({ ok: true, seq: 10003 });
    // Terminar y suspender: el mismo tope.
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1, p_seq: 2147483647 }), 'invalido');
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1, p_seq: 10004, p_state: { v: 1, seq: 9 } }), 'invalido');
    await fails(db.rpc(w.u.luis, 'suspend_match', { p_match: id, p_seq: 2147483647 }), 'invalido');
    // Suelta el turno: quien sigue publica desde el número del partido (no queda bloqueado).
    await db.rpc(w.u.luis, 'release_scorer', { p_match: id });
    expect(await db.rpc(w.u.otra, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true, seq: 10003, state: { seq: 10003 } });
    expect(await pub(w.u.otra, 10004, { v: 1, seq: 10004 })).toMatchObject({ ok: true, seq: 10004 });
  });

  it('suspendido: publicar lo mismo que ya estaba solo renueva el turno (no lo pone en vivo); algo nuevo sí', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 4, p_state: { ...STATE, seq: 4 }, p_score: SCORE });
    await db.rpc(w.u.luis, 'suspend_match', { p_match: id, p_seq: 4, p_state: { ...STATE, seq: 4 }, p_score: SCORE });
    // Otra abre la cancha (toma el turno) y sale sin anotar: su teléfono manda lo que ya había.
    expect(await db.rpc(w.u.otra, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true, status: 'suspended', seq: 4 });
    expect(
      await db.rpc(w.u.otra, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 4, p_state: { ...STATE, seq: 4 }, p_score: SCORE }),
    ).toMatchObject({ ok: true, status: 'suspended', seq: 4 });
    expect(await matchRow(id)).toMatchObject({ status: 'suspended', seq: 4 });
    // Con una jugada nueva, sí se retoma.
    expect(
      await db.rpc(w.u.otra, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 5, p_state: { ...STATE, seq: 5 }, p_score: SCORE }),
    ).toMatchObject({ ok: true, status: 'live', seq: 5 });
  });

  it('suspendido por el admin: lo que llega de la cola sin haber pedido el turno no lo toma ni lo pone en vivo', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    const st = (seq: number) => ({ v: 1, seq, config: {}, base: null, log: [], at: 0, origin: 'tel-luis' });
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 3, p_state: st(3), p_score: SCORE });
    // Lluvia: el admin toma el control y suspende (el turno queda libre).
    await db.rpc(w.u.sofi, 'claim_scorer', { p_match: id, p_force: true });
    await db.rpc(w.u.sofi, 'suspend_match', { p_match: id, p_note: 'Lluvia' });
    // La siguiente publicación del teléfono de luis (no se enteró), y la de otro teléfono sin señal: no.
    expect(await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 4, p_state: st(4), p_score: SCORE })).toMatchObject({
      ok: false,
      reason: 'lease',
      status: 'suspended',
      scorer_id: null,
    });
    expect(await db.rpc(w.u.otra, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 1, p_state: { v: 1, seq: 1 }, p_score: null })).toMatchObject({
      ok: false,
      reason: 'lease',
    });
    expect(await matchRow(id)).toMatchObject({ status: 'suspended', scorer_id: null, seq: 3, state: st(3) });
    // Retomar es pedir el turno: después sí.
    expect(await db.rpc(w.u.luis, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true, seq: 3 });
    expect(await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 4, p_state: st(4), p_score: SCORE })).toMatchObject({
      ok: true,
      status: 'live',
    });
  });

  it('dos teléfonos de la misma cuenta: la lista vieja que llega de la cola no pisa la que se siguió en el otro', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    const st = (origin: string, seq: number, parent?: { origin: string; seq: number }) => ({
      v: 1,
      seq,
      config: {},
      base: null,
      log: [],
      at: 0,
      origin,
      ...(parent ? { parent } : {}),
    });
    const pub = (seq: number, state: Record<string, unknown>) =>
      db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: seq, p_state: state, p_score: SCORE });
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    expect(await pub(8, st('A', 8))).toMatchObject({ ok: true });
    // El teléfono B (misma cuenta) pide el turno, sigue desde lo de A (8) y publica.
    expect(await db.rpc(w.u.luis, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true, seq: 8, state: { origin: 'A' } });
    expect(await pub(9, st('B', 9, { origin: 'A', seq: 8 }))).toMatchObject({ ok: true });
    expect(await pub(15, st('B', 15, { origin: 'A', seq: 8 }))).toMatchObject({ ok: true });
    // A vuelve con señal: lo que anotó sin señal (30) llega tarde. Aunque el número es más alto, es otra lista.
    expect(await pub(30, st('A', 30))).toMatchObject({ ok: false, reason: 'stale', seq: 15 });
    // Un tercero que tomó una lista vieja tampoco.
    expect(await pub(16, st('C', 16, { origin: 'A', seq: 8 }))).toMatchObject({ ok: false, reason: 'stale' });
    expect(await pub(16, st('C', 16, { origin: 'B', seq: 14 }))).toMatchObject({ ok: false, reason: 'stale' });
    expect((await matchRow(id)).state).toMatchObject({ origin: 'B', seq: 15 });
    // Terminar o suspender desde la lista vieja tampoco la pisa.
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1, p_seq: 30, p_state: st('A', 30) })).toMatchObject({
      ok: false,
      reason: 'stale',
    });
    await db.rpc(w.u.luis, 'suspend_match', { p_match: id, p_seq: 30, p_state: st('A', 30), p_score: { text: 'viejo' } });
    expect(await matchRow(id)).toMatchObject({ status: 'suspended', seq: 15, state: { origin: 'B', seq: 15 }, score: SCORE });
    // B lo retoma y termina.
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1, p_seq: 16, p_state: st('B', 16, { origin: 'A', seq: 8 }) })).toEqual({
      ok: true,
      status: 'finished',
    });
  });
});

describe('resultado: proponer, confirmar, disputar', () => {
  it('un jugador propone; el rival confirma; su compañero y alguien de fuera no', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    const op = randomUUID();
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1, p_state: STATE, p_seq: 3, p_op_id: op })).toEqual({
      ok: true,
      status: 'finished',
    });
    // Reintento con el mismo op_id: lo mismo.
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1, p_op_id: op })).toEqual({ ok: true, status: 'finished' });
    expect(await matchRow(id)).toMatchObject({
      status: 'finished',
      winner_side: 1,
      proposed_by: w.u.luis,
      proposed_side: 1,
      scorer_id: null,
      lease_until: null,
      state: STATE,
      seq: 3,
    });
    await fails(db.rpc(w.u.ana, 'confirm_result', { p_match: id }), DENIED);
    await fails(db.rpc(mia, 'confirm_result', { p_match: id }), DENIED);
    await fails(db.rpc(w.u.otro, 'confirm_result', { p_match: id }), DENIED);
    await db.rpc(w.u.nuevo, 'confirm_result', { p_match: id, p_op_id: randomUUID() });
    expect(await matchRow(id)).toMatchObject({ status: 'confirmed', confirmed_by: w.u.nuevo });
    // Confirmar otra vez: nada.
    await db.rpc(w.u.otra, 'confirm_result', { p_match: id });
    expect((await matchRow(id)).confirmed_by).toBe(w.u.nuevo);
  });

  it('push al otro lado: «Tienes un resultado por confirmar» (a cada teléfono de sus cuentas)', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    for (const [uid, n] of [[w.u.otra, 1], [w.u.nuevo, 2], [w.u.ana, 3]] as const) {
      await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
        uid,
        `https://fcm.googleapis.com/fcm/send/${n}`,
      ]);
    }
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    const rows = await db.admin<{ user_id: string; title: string; body: string; url: string; tag: string }>(
      'select user_id, title, body, url, tag from public.push_outbox where tag = $1 order by user_id',
      [`confirmar:${id}`],
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual([w.u.otra, w.u.nuevo].sort());
    expect(rows[0]).toMatchObject({
      title: 'Tienes un resultado por confirmar',
      body: 'Luis / Ana anotó 6-4 6-3. Confírmalo o reclama antes de 48 horas.',
      url: `/l/${x.lid}/juegos?partido=${id}`,
    });
    // Lo que anota el admin queda final: no hay nada que confirmar.
    const other = await oneMatch(x);
    await db.rpc(w.u.sofi, 'finish_match', { p_match: other, p_score: SCORE, p_winner: 1 });
    expect(await db.count('public.push_outbox', 'tag = $1', [`confirmar:${other}`])).toBe(0);
  });

  it('lo que anota el admin o el anotador de la liga queda final; también si el partido no pide confirmación', async () => {
    const x = await padel();
    const a = await oneMatch(x);
    const b = await oneMatch(x);
    const c = await oneMatch(x, { require_confirm: false });
    expect(await db.rpc(w.u.sofi, 'finish_match', { p_match: a, p_score: SCORE, p_winner: 2 })).toEqual({ ok: true, status: 'confirmed' });
    expect(await db.rpc(w.u.extra, 'finish_match', { p_match: b, p_score: SCORE, p_winner: 1 })).toEqual({ ok: true, status: 'confirmed' });
    expect(await db.rpc(w.u.otra, 'finish_match', { p_match: c, p_score: SCORE, p_winner: 2 })).toEqual({ ok: true, status: 'confirmed' });
    expect(await matchRow(a)).toMatchObject({ confirmed_by: w.u.sofi, proposed_side: null, winner_side: 2 });
    expect(await matchRow(c)).toMatchObject({ confirmed_by: w.u.otra, proposed_side: 2 });
  });

  it('reglas del resultado: sin empate en raqueta, con marcador, y sin pisar a quien anota en vivo', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE }), 'invalido');
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 3 }), 'invalido');
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: null, p_winner: 1 }), 'invalido');
    await fails(db.rpc(mia, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 }), DENIED);
    await db.rpc(w.u.otra, 'claim_scorer', { p_match: id });
    await db.rpc(w.u.otra, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 8, p_state: { ...STATE, seq: 8 }, p_score: SCORE });
    // Otra anota en vivo: luis no lo cierra desde su teléfono; el admin sí.
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 }), DENIED);
    // Un final viejo del mismo anotador (de otro teléfono): no pisa.
    expect(await db.rpc(w.u.otra, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 2, p_seq: 7 })).toMatchObject({ ok: false, reason: 'stale' });
    expect(await db.rpc(w.u.otra, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 2, p_seq: 8 })).toEqual({ ok: true, status: 'finished' });
    // Corregir la propuesta: su lado sí (dentro de 48 h); el rival no (disputa).
    await db.rpc(w.u.nuevo, 'finish_match', { p_match: id, p_score: { text: '6-4 7-5', sides: [0, 2] }, p_winner: 2 });
    expect((await matchRow(id)).score).toEqual({ text: '6-4 7-5', sides: [0, 2] });
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 }), DENIED);
  });

  it('disputa del rival dentro de 48 h; después cuenta solo (se calcula al leer) y se puede cerrar', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await fails(db.rpc(w.u.ana, 'dispute_result', { p_match: id, p_note: 'no' }), DENIED);
    await fails(db.rpc(w.u.sofi, 'dispute_result', { p_match: id }), DENIED);
    await fails(db.rpc(w.u.otra, 'dispute_result', { p_match: id, p_note: 'x'.repeat(501) }), 'invalido');
    await db.rpc(w.u.otra, 'dispute_result', { p_match: id, p_note: 'Fue 6-4 4-6 10-8', p_op_id: randomUUID() });
    expect(await matchRow(id)).toMatchObject({ status: 'disputed', disputed_by: w.u.otra, dispute_note: 'Fue 6-4 4-6 10-8' });
    await fails(db.rpc(w.u.otra, 'confirm_result', { p_match: id }), 'cerrado');

    const late = await oneMatch(x);
    await db.rpc(w.u.luis, 'finish_match', { p_match: late, p_score: SCORE, p_winner: 1 });
    const final = async () => (await db.admin<{ f: boolean }>('select private.match_final(status, proposed_at) as f from public.matches where id = $1', [late]))[0].f;
    expect(await final()).toBe(false);
    await db.admin(`update public.matches set proposed_at = now() - interval '48 hours 1 minute' where id = $1`, [late]);
    expect(await final()).toBe(true);
    await fails(db.rpc(w.u.otra, 'dispute_result', { p_match: late, p_note: 'tarde' }), 'cerrado');
    // Su lado ya no corrige; el admin sí; el rival puede cerrarlo formalmente.
    await fails(db.rpc(w.u.luis, 'finish_match', { p_match: late, p_score: SCORE, p_winner: 1 }), 'cerrado');
    await db.rpc(w.u.nuevo, 'confirm_result', { p_match: late });
    expect((await matchRow(late)).status).toBe('confirmed');
  });

  it('el admin resuelve la disputa: con el propuesto o con su marcador', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await fails(db.rpc(w.u.sofi, 'resolve_dispute', { p_match: id }), 'cerrado');
    await db.rpc(w.u.otra, 'dispute_result', { p_match: id });
    await fails(db.rpc(w.u.luis, 'resolve_dispute', { p_match: id }), DENIED);
    await fails(db.rpc(w.u.extra, 'resolve_dispute', { p_match: id }), DENIED);
    await db.rpc(w.u.sofi, 'resolve_dispute', { p_match: id, p_score: { text: '6-4 4-6 10-8', sides: [1, 2] }, p_winner: 2, p_note: 'Vi el partido' });
    expect(await matchRow(id)).toMatchObject({
      status: 'confirmed',
      winner_side: 2,
      score: { text: '6-4 4-6 10-8', sides: [1, 2] },
      confirmed_by: w.u.sofi,
      note: 'Vi el partido',
    });
    const other = await oneMatch(x);
    await db.rpc(w.u.luis, 'finish_match', { p_match: other, p_score: SCORE, p_winner: 1 });
    await db.rpc(w.u.otra, 'dispute_result', { p_match: other });
    await db.rpc(w.u.org, 'resolve_dispute', { p_match: other });
    expect(await matchRow(other)).toMatchObject({ status: 'confirmed', winner_side: 1, score: SCORE });
  });

  it('corrección del admin en cualquier momento (con historial)', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await fails(db.rpc(w.u.luis, 'admin_correct_result', { p_match: id, p_score: SCORE, p_winner: 2 }), DENIED);
    await fails(db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: SCORE }), 'invalido');
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: { text: '4-6 3-6', sides: [0, 2] }, p_winner: 2, p_note: 'Estaba al revés' });
    const m = await matchRow(id);
    expect(m).toMatchObject({ status: 'confirmed', winner_side: 2, note: 'Estaba al revés' });
    expect((m.history as { a: string; from?: string; score?: string }[]).at(-1)).toMatchObject({ a: 'correct', from: '6-4 6-3', score: '4-6 3-6' });
  });
});

describe('W.O., aplazado, suspendido, anulado y borrado', () => {
  it('W.O. del admin: gana el que vino; W.O. doble sin ganador', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await fails(db.rpc(w.u.luis, 'set_walkover', { p_match: id, p_absent: 2 }), DENIED);
    await fails(db.rpc(w.u.sofi, 'set_walkover', { p_match: id, p_absent: 3 }), 'invalido');
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: id, p_absent: 1, p_score: { text: '0-6 0-6', sides: [0, 2] }, p_note: 'No llegaron' });
    expect(await matchRow(id)).toMatchObject({ status: 'walkover', walkover_side: 1, winner_side: 2, note: 'No llegaron', confirmed_by: w.u.sofi });
    const both = await oneMatch(x);
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: both, p_absent: 0 });
    expect(await matchRow(both)).toMatchObject({ status: 'walkover', walkover_side: 0, winner_side: null });
  });

  it('aplazar y reprogramar (con historial); no un partido terminado', async () => {
    const x = await padel();
    const id = await oneMatch(x, { scheduled_at: '2026-10-05T23:00:00Z', court: 'Cancha 1' });
    await fails(db.rpc(w.u.luis, 'postpone_match', { p_match: id }), DENIED);
    await db.rpc(w.u.sofi, 'postpone_match', { p_match: id, p_note: 'Lluvia' });
    expect(await matchRow(id)).toMatchObject({ status: 'postponed', note: 'Lluvia' });
    await fails(db.rpc(w.u.luis, 'claim_scorer', { p_match: id }), 'cerrado');
    await fails(db.rpc(w.u.luis, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-12T23:00:00Z' }), DENIED);
    await db.rpc(w.u.sofi, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-12T23:00:00Z', p_court: 'Cancha 3' });
    const m = await matchRow(id);
    expect(m).toMatchObject({ status: 'scheduled', court: 'Cancha 3' });
    expect(new Date(m.scheduled_at as string).toISOString()).toBe('2026-10-12T23:00:00.000Z');
    expect((m.history as { a: string }[]).map((h) => h.a)).toEqual(['postpone', 'reschedule']);
    await db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await fails(db.rpc(w.u.sofi, 'postpone_match', { p_match: id }), 'cerrado');
    await fails(db.rpc(w.u.sofi, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-19T23:00:00Z' }), 'cerrado');
  });

  it('suspender con marcador parcial y retomar después (en otro teléfono)', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 3, p_state: STATE, p_score: SCORE });
    await fails(db.rpc(w.u.otra, 'suspend_match', { p_match: id }), DENIED);
    const partial = { text: '6-4 2-1', sides: [1, 0] };
    await db.rpc(w.u.luis, 'suspend_match', { p_match: id, p_state: { ...STATE, seq: 4 }, p_score: partial, p_seq: 4, p_note: 'Se fue la luz' });
    expect(await matchRow(id)).toMatchObject({ status: 'suspended', scorer_id: null, seq: 4, score: partial, note: 'Se fue la luz' });
    // Otro jugador lo retoma: recibe el estado para seguir.
    const claim = await db.rpc<Record<string, unknown>>(w.u.otra, 'claim_scorer', { p_match: id });
    expect(claim).toMatchObject({ ok: true, seq: 4, state: { ...STATE, seq: 4 }, status: 'suspended' });
    await db.rpc(w.u.otra, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 5, p_state: { ...STATE, seq: 5 }, p_score: SCORE });
    expect((await matchRow(id)).status).toBe('live');
  });

  it('anular y borrar: solo el admin', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await fails(db.rpc(w.u.luis, 'void_match', { p_match: id }), DENIED);
    await db.rpc(w.u.sofi, 'void_match', { p_match: id, p_note: 'Mal armado' });
    expect((await matchRow(id)).status).toBe('void');
    await fails(db.rpc(w.u.luis, 'delete_match', { p_match: id }), DENIED);
    await fails(db.rpc(w.u.sofi, 'delete_match', { p_match: randomUUID() }), 'no_existe');
    await db.rpc(w.u.sofi, 'delete_match', { p_match: id });
    expect(await db.count('public.matches', 'id = $1', [id])).toBe(0);
    expect(await db.count('public.match_sides', 'match_id = $1', [id])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'matches' and row_key = $1`, [id])).toBe(1);
  });
});

describe('datos del partido y jugadores de cada lado', () => {
  it('el admin cambia hora y cancha (historial); las reglas solo antes de empezar', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    await fails(db.rpc(w.u.luis, 'update_match_schedule', { p_match: id, p_patch: { court: 'X' } }), DENIED);
    await fails(db.rpc(w.u.sofi, 'update_match_schedule', { p_match: id, p_patch: { status: 'confirmed' } }), 'invalido');
    await db.rpc(w.u.sofi, 'update_match_schedule', {
      p_match: id,
      p_patch: { court: 'Cancha 4', scheduled_at: '2026-10-06T00:00:00Z', round: 2, stage: 'Grupo A', rules: { match: { sport: 'padel' } } },
    });
    expect(await matchRow(id)).toMatchObject({ court: 'Cancha 4', round: 2, stage: 'Grupo A', rules: { match: { sport: 'padel' } } });
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: id, p_seq: 1, p_state: {}, p_score: null });
    await fails(db.rpc(w.u.sofi, 'update_match_schedule', { p_match: id, p_patch: { rules: {} } }), 'invalido');
  });

  it('suplente: el jugador de ese lado lo pone; el rival no; la pareja sigue siendo la misma', async () => {
    const x = await padel();
    const id = await oneMatch(x);
    const lineup = [{ player_id: x.p.luis }, { player_id: x.p.pedro, sub: true }];
    await fails(db.rpc(w.u.otra, 'set_match_players', { p_match: id, p_side: 1, p_players: lineup }), DENIED);
    await fails(db.rpc(mia, 'set_match_players', { p_match: id, p_side: 1, p_players: lineup }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 3, p_players: lineup }), 'invalido');
    const v0 = (await matchRow(id)).version as number;
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: lineup, p_op_id: randomUUID() });
    // La versión sube (quien consulta cada 15–20 s baja solo lo que cambió).
    expect((await matchRow(id)).version).toBe(v0 + 1);
    const rows = await db.admin<{ player_id: string; sub: boolean }>('select player_id, sub from public.match_players where match_id = $1 and side = 1', [id]);
    expect(rows.map((r) => [r.player_id, r.sub]).sort()).toEqual([[x.p.luis, false], [x.p.pedro, true]].sort());
    expect((await db.admin<{ team_id: string }>('select team_id from public.match_sides where match_id = $1 and side = 1', [id]))[0].team_id).toBe(x.pairA);
    // Ana ya no está en la alineación, pero sigue en la pareja: sigue siendo de su lado.
    await db.rpc(w.u.ana, 'claim_scorer', { p_match: id });
  });

  it('un jugador no pasa a un rival a su lado ni le vacía el lado; con el resultado propuesto, la alineación no se toca', async () => {
    const x = await padel();
    // Americano: el lado es solo quién juega (sin pareja de temporada).
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: x.lid,
      p_matches: [
        {
          sides: [
            { side: 1, players: [{ player_id: x.p.luis }, { player_id: x.p.ana }] },
            { side: 2, players: [{ player_id: x.p.otra }, { player_id: x.p.nuevo }] },
          ],
        },
      ],
    });
    const lineup = async (side: number) =>
      (await db.admin<{ player_id: string }>('select player_id from public.match_players where match_id = $1 and side = $2', [id, side])).map((r) => r.player_id).sort();
    const rivals = [x.p.otra, x.p.nuevo].sort();
    const withOtra = [{ player_id: x.p.luis }, { player_id: x.p.ana }, { player_id: x.p.otra }];
    // Pasar a otra a su lado (le quitaría su lado para confirmar o reclamar): no.
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: withOtra }), 'invalido');
    // Con el turno: del lado rival no quita ni agrega (ni lo vacía); sí cambia posición, dorsal o suplente.
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [] }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: x.p.otra }] }), 'invalido');
    await fails(
      db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: x.p.otra }, { player_id: x.p.nuevo }, { player_id: x.p.pedro }] }),
      'invalido',
    );
    await db.rpc(w.u.luis, 'set_match_players', {
      p_match: id,
      p_side: 2,
      p_players: [{ player_id: x.p.otra, position: 'drive' }, { player_id: x.p.nuevo, position: 'reves' }],
    });
    expect(await lineup(2)).toEqual(rivals);
    expect(await db.count('public.match_players', `match_id = $1 and position = 'reves'`, [id])).toBe(1);
    // Propone el resultado: ya no cambia nada (ni su propio lado).
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: withOtra }), 'cerrado');
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: x.p.luis }] }), 'cerrado');
    expect(await lineup(2)).toEqual(rivals);
    // El rival sigue teniendo su lado: reclama. En disputa, tampoco la cambia él.
    await db.rpc(w.u.otra, 'dispute_result', { p_match: id, p_note: 'No fue así' });
    await fails(db.rpc(w.u.otra, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: x.p.otra }] }), 'cerrado');
    // El admin sí la arregla (también pasa a alguien de lado).
    await db.rpc(w.u.sofi, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: x.p.luis }, { player_id: x.p.nuevo }] });
    expect(await lineup(1)).toEqual([x.p.luis, x.p.nuevo].sort());
  });

  it('con parejas: tampoco entra a su lado alguien de la pareja rival (aunque no esté en la alineación)', async () => {
    const x = await padel();
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: x.lid,
      p_matches: [{ sides: [{ side: 1, team_id: x.pairA }, { side: 2, team_id: x.pairB, players: [{ player_id: x.p.otra }] }] }],
    });
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: x.p.luis }, { player_id: x.p.nuevo }] }), 'invalido');
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: x.p.luis }, { player_id: x.p.pedro, sub: true }] });
    // nuevo sigue siendo del lado 2.
    expect(await db.rpc(w.u.nuevo, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true });
  });

  it('mis partidos en todas mis ligas (por jugador o por pareja)', async () => {
    const x = await padel();
    const a = await oneMatch(x);
    const [b] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: x.lid,
      p_matches: [{ sides: [{ side: 1, team_id: x.pairB }, { side: 2, team_id: x.pairA }] }],
    });
    const mine = await db.rpcRows<{ match_id: string; league_id: string; side: number }>(w.u.luis, 'my_matches');
    expect(mine.map((r) => [r.match_id, r.side]).sort()).toEqual([[a, 1], [b, 2]].sort());
    expect(await db.rpcRows(mia, 'my_matches')).toEqual([]);
    await fails(db.rpcRows(ANON, 'my_matches'), '42501');
    // Terminados antes de la fecha: fuera; abiertos: siguen.
    await db.rpc(w.u.sofi, 'finish_match', { p_match: b, p_score: SCORE, p_winner: 1 });
    expect((await db.rpcRows<{ match_id: string }>(w.u.luis, 'my_matches', { p_since: '2100-01-01T00:00:00Z' })).map((r) => r.match_id)).toEqual([]);
  });
});

describe('equipos y parejas de temporada', () => {
  interface Hoops {
    lid: string;
    p: { luis: string; ana: string; otra: string; nuevo: string };
    t1: string;
    t2: string;
  }

  async function hoops(): Promise<Hoops> {
    const lid = await league(db, w.u.otro, { name: 'Liga de Barrio', visibility: 'public', sport: 'basketball', requirePhoto: false });
    await member(db, lid, w.u.otro, 'owner', 'otro');
    for (const n of ['luis', 'ana', 'otra', 'nuevo'] as const) await member(db, lid, w.u[n], 'member', n);
    const p = {
      luis: await player(db, lid, 'Luis', w.u.luis),
      ana: await player(db, lid, 'Ana', w.u.ana),
      otra: await player(db, lid, 'Otra', w.u.otra),
      nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    };
    const t1 = await db.rpc<string>(w.u.otro, 'create_season_team', {
      p_league: lid,
      p_name: 'Tigres',
      p_color: '#ff8800',
      p_players: [
        { player_id: p.luis, jersey: 7, role: 'captain' },
        { player_id: p.ana, jersey: 10 },
      ],
    });
    const t2 = await db.rpc<string>(w.u.otro, 'create_season_team', {
      p_league: lid,
      p_name: 'Leones',
      p_players: [{ player_id: p.otra, role: 'delegate' }, { player_id: p.nuevo, jersey: 4 }],
    });
    return { lid, p, t1, t2 };
  }

  it('solo el admin crea, cambia y borra; solo en ligas de partidos', async () => {
    const h = await hoops();
    expect(await db.admin('select name, color, event_id, sort_order from public.teams where id = any ($1) order by sort_order', [[h.t1, h.t2]])).toEqual([
      { name: 'Tigres', color: '#ff8800', event_id: null, sort_order: 1 },
      { name: 'Leones', color: null, event_id: null, sort_order: 2 },
    ]);
    await fails(db.rpc(w.u.luis, 'create_season_team', { p_league: h.lid, p_name: 'X' }), DENIED);
    await fails(db.rpc(w.u.org, 'create_season_team', { p_league: w.priv, p_name: 'X' }), 'invalido');
    await fails(db.admin(`insert into public.teams (league_id, name) values ($1, 'X')`, [w.priv]), 'invalido');
    await fails(db.rpc(w.u.luis, 'update_season_team', { p_team: h.t1, p_patch: { name: 'Gatos' } }), DENIED);
    await fails(db.rpc(w.u.otro, 'update_season_team', { p_team: h.t1, p_patch: { event_id: null } }), 'invalido');
    await db.rpc(w.u.otro, 'update_season_team', { p_team: h.t1, p_patch: { name: 'Gatos', color: '#000000' } });
    expect((await db.admin<{ name: string }>('select name from public.teams where id = $1', [h.t1]))[0].name).toBe('Gatos');
    // Los equipos de un evento del boliche no se tocan por aquí.
    const bowlingTeam = await db.rpc<string>(w.u.org, 'add_team', { p_event: w.e.e1, p_name: 'Equipo 1' });
    await fails(db.rpc(w.u.org, 'update_season_team', { p_team: bowlingTeam, p_patch: { name: 'X' } }), 'no_existe');
    await fails(db.rpc(w.u.org, 'set_team_player', { p_team: bowlingTeam, p_player: w.p.luis }), 'no_existe');
    await fails(db.rpc(w.u.luis, 'delete_season_team', { p_team: h.t1 }), DENIED);
    // Anon ve la plantilla de una liga pública.
    expect(await db.asAnon('select player_id from public.team_players where team_id = $1', [h.t1])).toHaveLength(2);
  });

  it('plantilla: el capitán pone dorsales y jugadores, pero no cambia roles ni toca otro equipo', async () => {
    const h = await hoops();
    await fails(db.rpc(w.u.ana, 'set_team_player', { p_team: h.t1, p_player: h.p.ana, p_jersey: 11 }), DENIED);
    await db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: h.p.ana, p_jersey: 11, p_position: 'base' });
    expect(await db.admin('select jersey, position, role from public.team_players where team_id = $1 and player_id = $2', [h.t1, h.p.ana])).toEqual([
      { jersey: 11, position: 'base', role: 'player' },
    ]);
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: h.p.ana, p_role: 'captain' }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t2, p_player: h.p.nuevo, p_jersey: 5 }), DENIED);
    // Un jugador de la liga sin equipo entra como jugador. Dorsal repetido: no.
    const libre = await player(db, h.lid, 'Libre');
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: libre, p_jersey: 7 }), '23505');
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: libre, p_jersey: 100 }), INVALID);
    await db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: libre, p_jersey: 8 });
    expect((await db.admin<{ role: string }>('select role from public.team_players where team_id = $1 and player_id = $2', [h.t1, libre]))[0].role).toBe('player');
    // Jugador de otra liga: no.
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: w.p.pedro }), INVALID);
    // El admin sí cambia roles.
    await db.rpc(w.u.otro, 'set_team_player', { p_team: h.t1, p_player: h.p.ana, p_role: 'delegate' });
    expect((await db.admin<{ role: string }>('select role from public.team_players where team_id = $1 and player_id = $2', [h.t1, h.p.ana]))[0].role).toBe('delegate');
  });

  it('quitar de la plantilla y reemplazarla entera', async () => {
    const h = await hoops();
    // La delegada saca a un jugador de su equipo; no a alguien de otro equipo.
    await fails(db.rpc(w.u.otra, 'remove_team_player', { p_team: h.t1, p_player: h.p.ana }), DENIED);
    expect(await db.rpc(w.u.otra, 'remove_team_player', { p_team: h.t2, p_player: h.p.nuevo })).toBe(true);
    expect(await db.rpc(w.u.otra, 'remove_team_player', { p_team: h.t2, p_player: h.p.nuevo })).toBe(false);
    // Uno mismo se sale.
    expect(await db.rpc(w.u.ana, 'remove_team_player', { p_team: h.t1, p_player: h.p.ana })).toBe(true);
    // El capitán reemplaza la plantilla: él se queda (aunque no venga en la lista) y los nuevos entran como jugadores.
    await db.rpc(w.u.luis, 'set_roster', { p_team: h.t1, p_players: [{ player_id: h.p.nuevo, jersey: 23, role: 'captain' }] });
    expect(await db.admin('select player_id, jersey, role from public.team_players where team_id = $1 order by role', [h.t1])).toEqual([
      { player_id: h.p.luis, jersey: 7, role: 'captain' },
      { player_id: h.p.nuevo, jersey: 23, role: 'player' },
    ]);
    await fails(db.rpc(w.u.nuevo, 'set_roster', { p_team: h.t1, p_players: [] }), DENIED);
    // El admin reemplaza todo, con roles.
    await db.rpc(w.u.otro, 'set_roster', { p_team: h.t1, p_players: [{ player_id: h.p.ana, role: 'captain' }] });
    expect(await db.admin('select player_id, role from public.team_players where team_id = $1', [h.t1])).toEqual([{ player_id: h.p.ana, role: 'captain' }]);
    await fails(db.rpc(w.u.otro, 'set_roster', { p_team: h.t1, p_players: [{ player_id: h.p.ana, role: 'jefe' }] }), 'invalido');
  });

  it('partido entre equipos: anota y confirma el capitán o delegado (no cualquier jugador); se puede empatar', async () => {
    const h = await hoops();
    const [id] = await db.rpc<string[]>(w.u.otro, 'create_matches', {
      p_league: h.lid,
      p_matches: [{ round: 1, sides: [{ side: 1, team_id: h.t1 }, { side: 2, team_id: h.t2 }] }],
    });
    expect((await db.admin<{ label: string }>('select label from public.match_sides where match_id = $1 order by side', [id])).map((r) => r.label)).toEqual([
      'Tigres',
      'Leones',
    ]);
    await fails(db.rpc(w.u.ana, 'claim_scorer', { p_match: id }), DENIED);
    // Alineación del lado 1 por su capitán (con dorsales del partido); el otro lado no.
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: h.p.luis, jersey: 7 }, { player_id: h.p.ana, jersey: 11 }] });
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [] }), DENIED);
    // Con el turno de anotar (mesa), anota los presentes de los dos lados.
    expect(await db.rpc(w.u.luis, 'claim_scorer', { p_match: id })).toMatchObject({ ok: true });
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: h.p.nuevo, jersey: 4 }] });
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: { text: '70-70', sides: [70, 70] } })).toEqual({ ok: true, status: 'finished' });
    expect((await matchRow(id)).winner_side).toBeNull();
    await fails(db.rpc(w.u.nuevo, 'confirm_result', { p_match: id }), DENIED);
    // Ana juega en el lado 1 pero en equipos solo cuenta el capitán o delegado.
    await fails(db.rpc(w.u.ana, 'dispute_result', { p_match: id }), DENIED);
    await db.rpc(w.u.otra, 'confirm_result', { p_match: id });
    expect((await matchRow(id)).status).toBe('confirmed');
    // Borrar el equipo deja el nombre en el partido.
    await db.rpc(w.u.otro, 'delete_season_team', { p_team: h.t1 });
    expect(await db.admin('select team_id, label from public.match_sides where match_id = $1 and side = 1', [id])).toEqual([{ team_id: null, label: 'Tigres' }]);
  });

  it('el capitán no suma a su plantilla a un jugador de otro equipo (el admin sí)', async () => {
    const h = await hoops();
    await fails(db.rpc(w.u.luis, 'set_team_player', { p_team: h.t1, p_player: h.p.nuevo }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_roster', { p_team: h.t1, p_players: [{ player_id: h.p.ana }, { player_id: h.p.nuevo }] }), 'invalido');
    await fails(db.rpc(w.u.otra, 'set_roster', { p_team: h.t2, p_players: [{ player_id: h.p.nuevo }, { player_id: h.p.luis }] }), 'invalido');
    expect(await db.admin('select team_id from public.team_players where player_id = $1', [h.p.nuevo])).toEqual([{ team_id: h.t2 }]);
    // Sus partidos siguen igual: nuevo marca su convocatoria con los Leones.
    const [id] = await db.rpc<string[]>(w.u.otro, 'create_matches', {
      p_league: h.lid,
      p_matches: [{ sides: [{ side: 1, team_id: h.t1 }, { side: 2, team_id: h.t2 }] }],
    });
    await db.rpc(w.u.nuevo, 'set_match_rsvp', { p_match: id, p_status: 'yes' });
    // Su plantilla sí la toca: dorsales de los que ya están y quien no tiene equipo.
    const libre = await player(db, h.lid, 'Libre');
    await db.rpc(w.u.luis, 'set_roster', { p_team: h.t1, p_players: [{ player_id: h.p.ana, jersey: 5 }, { player_id: libre }] });
    expect(await db.count('public.team_players', 'team_id = $1', [h.t1])).toBe(3);
    // El admin lo puede poner en los dos (decisión suya).
    await db.rpc(w.u.otro, 'set_team_player', { p_team: h.t1, p_player: h.p.nuevo });
    expect(await db.count('public.team_players', 'player_id = $1', [h.p.nuevo])).toBe(2);
  });

  it('equipos: el capitán no pone en su lado a alguien del otro equipo; la mesa anota los presentes de los dos lados', async () => {
    const h = await hoops();
    const [id] = await db.rpc<string[]>(w.u.otro, 'create_matches', {
      p_league: h.lid,
      p_matches: [{ sides: [{ side: 1, team_id: h.t1 }, { side: 2, team_id: h.t2 }] }],
    });
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: h.p.luis }, { player_id: h.p.nuevo }] }), 'invalido');
    // Con el turno (mesa): los presentes del otro lado, también quitar y agregar.
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: id });
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: h.p.otra }, { player_id: h.p.nuevo }] });
    await db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: h.p.otra }] });
    // Pero no pasa a alguien de los Tigres al lado de los Leones.
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [{ player_id: h.p.ana }] }), 'invalido');
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: { text: '60-50', sides: [60, 50] }, p_winner: 1 });
    // Propuesto: el turno se soltó (el lado rival ya no es suyo) y su lado tampoco cambia.
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 2, p_players: [] }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_match_players', { p_match: id, p_side: 1, p_players: [{ player_id: h.p.luis }] }), 'cerrado');
    expect(await db.count('public.match_players', 'match_id = $1 and side = 2', [id])).toBe(1);
    await db.rpc(w.u.otra, 'dispute_result', { p_match: id });
  });
});

describe('permisos de esta migración', () => {
  const RPC = [
    'admin_correct_result', 'claim_scorer', 'confirm_result', 'create_matches', 'create_season_team', 'delete_match', 'delete_season_team',
    'dispute_result', 'finish_match', 'my_matches', 'postpone_match', 'publish_match', 'release_scorer', 'remove_team_player',
    'reschedule_match', 'resolve_dispute', 'set_match_players', 'set_match_sides', 'set_roster', 'set_team_player', 'set_walkover',
    'suspend_match', 'update_match_schedule', 'update_season_team', 'void_match',
  ];

  it('las RPC nuevas: solo con sesión; los helpers de private, de nadie', async () => {
    const rows = await db.admin<{ fn: string; auth: boolean; anon: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [RPC],
    );
    expect(rows.map((r) => r.fn)).toEqual(RPC);
    expect(rows.every((r) => r.auth && !r.anon)).toBe(true);
    const helpers = await db.admin<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname in ('match_side', 'can_score_as', 'write_sides', 'match_final', 'check_score')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`,
    );
    expect(helpers).toEqual([]);
  });

  it('las tablas nuevas tienen RLS y un evento de pádel admite partidos', async () => {
    const rows = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('matches', 'match_sides', 'match_players', 'team_players') order by 1`,
    );
    expect(rows).toEqual([
      { relname: 'match_players', rls: true },
      { relname: 'match_sides', rls: true },
      { relname: 'matches', rls: true },
      { relname: 'team_players', rls: true },
    ]);
    // El evento de una liga de pádel (tipo libre) sirve como jornada.
    const x = await padel();
    const e = await event(db, w.priv, 'practica', '2026-10-01');
    await fails(db.rpc(w.u.sofi, 'create_matches', { p_league: x.lid, p_matches: [sides(x, { event_id: e })] }), INVALID);
    expect(await oneMatch(x, { event_id: x.night })).toBeTruthy();
  });
});
