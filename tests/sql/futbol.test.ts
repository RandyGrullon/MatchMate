/**
 * Fútbol y fútbol sala (20260927000900_futbol.sql): goles de 0 a 99, penales aparte, reglas de la misma modalidad
 * que la liga y las sanciones del comité (football_sanctions). La convocatoria y el anotador de mesa son los de
 * baloncesto.test.ts (lo común de equipos): aquí solo se comprueba que también sirven en fútbol.
 * Cada prueba en su transacción (se deshace al final).
 *
 * Mundo (liga pública «Liga de Campo» de org, admin sofi): Tigres (luis capitán, ana, pedro sin cuenta) contra
 * Leones (otra delegada, nuevo). mia es miembro con jugador pero sin equipo. Una liga de sala aparte (futsal).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

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

const FIELD_RULES = { match: { variant: 'football', halfMinutes: 45, clock: 'running', players: 11, shootoutKicks: 5 }, table: { win: 3, draw: 1, loss: 0 } };
const FUTSAL_RULES = { match: { variant: 'futsal', halfMinutes: 20, clock: 'stopped', players: 5, shootoutKicks: 5 }, table: { win: 3, draw: 1, loss: 0 } };

interface Pitch {
  lid: string;
  p: { luis: string; ana: string; pedro: string; otra: string; nuevo: string; mia: string };
  t1: string;
  t2: string;
  t3: string;
  match: string;
  other: string;
}

async function pitch(opts: { sport?: 'football' | 'futsal'; visibility?: 'public' | 'private' } = {}): Promise<Pitch> {
  const sport = opts.sport ?? 'football';
  const lid = await league(db, w.u.org, { name: sport === 'football' ? 'Liga de Campo' : 'Liga de Sala', visibility: opts.visibility ?? 'public', sport, requirePhoto: false });
  await db.admin('update public.leagues set rules = $2 where id = $1', [lid, sport === 'football' ? FIELD_RULES : FUTSAL_RULES]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const n of ['luis', 'ana', 'otra', 'nuevo'] as const) await member(db, lid, w.u[n], 'member', n);
  await member(db, lid, mia, 'member', 'mia');
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    pedro: await player(db, lid, 'Pedro'),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    mia: await player(db, lid, 'Mia', mia),
  };
  const t1 = await db.rpc<string>(w.u.org, 'create_season_team', {
    p_league: lid,
    p_name: 'Tigres',
    p_players: [
      { player_id: p.luis, jersey: 7, role: 'captain' },
      { player_id: p.ana, jersey: 10 },
      { player_id: p.pedro, jersey: 1, position: 'GK' },
    ],
  });
  const t2 = await db.rpc<string>(w.u.org, 'create_season_team', {
    p_league: lid,
    p_name: 'Leones',
    p_players: [{ player_id: p.otra, role: 'delegate' }, { player_id: p.nuevo, jersey: 4 }],
  });
  const t3 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Gatos' });
  const [match, other] = await db.rpc<string[]>(w.u.org, 'create_matches', {
    p_league: lid,
    p_matches: [
      { round: 1, court: 'Cancha 1', format: sport, sides: [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }] },
      { round: 2, court: 'Cancha 1', format: sport, sides: [{ side: 1, team_id: t2 }, { side: 2, team_id: t3 }] },
    ],
  });
  return { lid, p, t1, t2, t3, match, other };
}

const matchRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.matches where id = $1', [id]))[0];
const sanctions = (lid: string) =>
  db.admin<{ id: string; team_id: string; player_id: string; match_id: string; matches: number; note: string; created_by: string }>(
    'select id, team_id, player_id, match_id, matches, note, created_by from public.football_sanctions where league_id = $1 order by matches desc, id',
    [lid],
  );

describe('marcador de fútbol', () => {
  it('goles de 0 a 99 por lado; los penales van aparte y no cuentan en los goles', async () => {
    const f = await pitch();
    const r = await db.rpc(w.u.sofi, 'finish_match', {
      p_match: f.match,
      p_score: { text: '1-1 (pen. 4-3)', sides: [1, 1], pens: [4, 3], totals: { goals: [1, 1], shootout: [4, 3] } },
      p_winner: 1,
    });
    expect(r).toEqual({ ok: true, status: 'confirmed' });
    expect(await matchRow(f.match)).toMatchObject({ status: 'confirmed', winner_side: 1, score: { sides: [1, 1], pens: [4, 3] } });
    // Un empate sin penales también vale (null = empate en equipos).
    await db.rpc(w.u.sofi, 'finish_match', { p_match: f.other, p_score: { text: '0-0', sides: [0, 0] } });
    expect(await matchRow(f.other)).toMatchObject({ status: 'confirmed', winner_side: null });
  });

  it('más de 99 goles, penales mal escritos o decimales: invalido (también al corregir y en el W.O.)', async () => {
    const f = await pitch();
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: f.match, p_score: { text: '100-0', sides: [100, 0] }, p_winner: 1 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: f.match, p_score: { text: '1-1', sides: [1, 1], pens: [4] }, p_winner: 1 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: f.match, p_score: { text: '1-1', sides: [1, 1], pens: [4, 100] }, p_winner: 1 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: f.match, p_score: { text: '1-1', sides: [1, 1], pens: ['4', 3] }, p_winner: 1 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: f.match, p_score: { text: '1-1', sides: [1, 1], pens: [2.5, 3] }, p_winner: 2 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'set_walkover', { p_match: f.match, p_absent: 1, p_score: { text: '0-120', sides: [0, 120] } }), 'invalido');
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: f.match, p_absent: 1, p_score: { text: '0-3', sides: [0, 3] } });
    expect(await matchRow(f.match)).toMatchObject({ status: 'walkover', walkover_side: 1, score: { sides: [0, 3] } });
    await fails(db.rpc(w.u.sofi, 'admin_correct_result', { p_match: f.match, p_score: { text: '0-99', sides: [0, 199] }, p_winner: 2 }), 'invalido');
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: f.match, p_score: { text: '2-99', sides: [2, 99] }, p_winner: 2 });
    // pens: null se acepta (sin tanda).
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: f.match, p_score: { text: '2-2', sides: [2, 2], pens: null }, p_winner: null });
    // Ni el superusuario guarda un marcador de 100 en fútbol.
    await fails(db.admin(`update public.matches set score = '{"text":"100-1","sides":[100,1]}' where id = $1`, [f.match]), INVALID);
  });

  it('el en vivo del anotador también se revisa; otros deportes no cambian', async () => {
    const f = await pitch({ sport: 'futsal' });
    expect(await db.rpc(w.u.sofi, 'claim_scorer', { p_match: f.match })).toMatchObject({ ok: true });
    await fails(db.rpc(w.u.sofi, 'publish_match', { p_op_id: randomUUID(), p_match: f.match, p_seq: 1, p_state: { v: 1 }, p_score: { text: '120-0', sides: [120, 0] } }), 'invalido');
    expect(await db.rpc(w.u.sofi, 'publish_match', { p_op_id: randomUUID(), p_match: f.match, p_seq: 2, p_state: { v: 1 }, p_score: { text: '3-2', sides: [3, 2] } })).toMatchObject({
      ok: true,
      status: 'live',
    });
    // Baloncesto: 120 puntos siguen valiendo.
    const hoops = await league(db, w.u.org, { name: 'Baloncesto', visibility: 'public', sport: 'basketball', requirePhoto: false });
    await member(db, hoops, w.u.org, 'owner', 'org');
    const [bm] = await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: hoops, p_matches: [{ sides: [{ side: 1, label: 'A' }, { side: 2, label: 'B' }] }] });
    await db.rpc(w.u.org, 'finish_match', { p_match: bm, p_score: { text: '120-99', sides: [120, 99] }, p_winner: 1 });
    expect(await matchRow(bm)).toMatchObject({ status: 'confirmed' });
  });
});

describe('reglas del partido: la misma modalidad que la liga', () => {
  it('en una liga de sala no entra un partido con reglas de campo (ni al crear ni al cambiarlas)', async () => {
    const f = await pitch({ sport: 'futsal' });
    // Sin reglas: se copian las de la liga (sala).
    expect(await matchRow(f.match)).toMatchObject({ rules: { match: { variant: 'futsal' } } });
    await fails(
      db.rpc(w.u.org, 'create_matches', { p_league: f.lid, p_matches: [{ rules: FIELD_RULES, sides: [{ side: 1, team_id: f.t1 }, { side: 2, team_id: f.t2 }] }] }),
      'invalido',
    );
    const [ok] = await db.rpc<string[]>(w.u.org, 'create_matches', {
      p_league: f.lid,
      p_matches: [{ stage: 'Final', rules: { ...FUTSAL_RULES, match: { ...FUTSAL_RULES.match, shootout: true, shootoutKicks: 3 } }, sides: [{ side: 1, team_id: f.t1 }, { side: 2, team_id: f.t2 }] }],
    });
    expect(await matchRow(ok)).toMatchObject({ rules: { match: { variant: 'futsal', shootout: true, shootoutKicks: 3 } } });
    await fails(db.rpc(w.u.org, 'update_match_schedule', { p_match: ok, p_patch: { rules: FIELD_RULES } }), 'invalido');
    await db.rpc(w.u.org, 'update_match_schedule', { p_match: ok, p_patch: { rules: FUTSAL_RULES } });
    // Reglas sin variante (otras claves): se aceptan.
    await db.rpc(w.u.org, 'update_match_schedule', { p_match: ok, p_patch: { rules: { table: { win: 3 } } } });
  });

  it('en una liga de campo tampoco entran reglas de sala', async () => {
    const f = await pitch();
    await fails(
      db.rpc(w.u.org, 'create_matches', { p_league: f.lid, p_matches: [{ rules: FUTSAL_RULES, sides: [{ side: 1, team_id: f.t1 }, { side: 2, team_id: f.t2 }] }] }),
      'invalido',
    );
    expect(await matchRow(f.match)).toMatchObject({ rules: { match: { variant: 'football' } } });
  });
});

describe('convocatoria y anotador de mesa (lo común de equipos) en fútbol', () => {
  it('el jugador marca la suya y el delegado a los de su equipo; el designado confirma al terminar', async () => {
    const f = await pitch();
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: f.match, p_status: 'yes' });
    await db.rpc(w.u.otra, 'set_match_rsvp', { p_match: f.match, p_status: 'no', p_player: f.p.nuevo });
    expect(await db.count('public.match_rsvps', 'match_id = $1', [f.match])).toBe(2);
    await db.rpc(w.u.sofi, 'set_match_official', { p_match: f.match, p_user: w.u.luis });
    expect(await db.rpc(w.u.luis, 'claim_scorer', { p_match: f.match })).toMatchObject({ ok: true });
    expect(await db.rpc(w.u.luis, 'finish_match', { p_match: f.match, p_score: { text: '2-1', sides: [2, 1] }, p_winner: 1 })).toEqual({ ok: true, status: 'confirmed' });
  });
});

describe('sanciones del comité (football_sanctions)', () => {
  it('el admin pone, cambia (mismo id) y quita; deja tombstone', async () => {
    const f = await pitch();
    const id = await db.rpc<string>(w.u.sofi, 'save_football_sanction', { p_match: f.match, p_team: f.t1, p_player: f.p.luis, p_matches: 2, p_note: '  Agresión al árbitro  ' });
    expect(await sanctions(f.lid)).toEqual([{ id, team_id: f.t1, player_id: f.p.luis, match_id: f.match, matches: 2, note: 'Agresión al árbitro', created_by: w.u.sofi }]);
    // El teléfono puede generar el id (y reintentar con el mismo no duplica).
    const mine = randomUUID();
    expect(await db.rpc<string>(w.u.org, 'save_football_sanction', { p_id: mine, p_match: f.match, p_team: f.t2, p_player: f.p.nuevo, p_matches: 1 })).toBe(mine);
    expect(await db.rpc<string>(w.u.org, 'save_football_sanction', { p_id: mine, p_match: f.match, p_team: f.t2, p_player: f.p.nuevo, p_matches: 1 })).toBe(mine);
    await db.rpc(w.u.org, 'save_football_sanction', { p_id: id, p_match: f.match, p_team: f.t1, p_player: f.p.luis, p_matches: 4 });
    expect((await sanctions(f.lid)).map((s) => [s.id, s.matches, s.note])).toEqual([
      [id, 4, ''],
      [mine, 1, ''],
    ]);
    expect(await db.rpc(w.u.sofi, 'delete_football_sanction', { p_id: id })).toBe(true);
    expect(await db.rpc(w.u.sofi, 'delete_football_sanction', { p_id: id })).toBe(false);
    expect(await db.count('public.tombstones', `tbl = 'football_sanctions' and row_key = $1`, [id])).toBe(1);
    // Borrar el partido se lleva sus sanciones.
    await db.rpc(w.u.org, 'delete_match', { p_match: f.match });
    expect(await sanctions(f.lid)).toEqual([]);
  });

  it('solo el admin: capitán, delegado, jugador, alguien de fuera o sin cuenta no', async () => {
    const f = await pitch();
    const args = { p_match: f.match, p_team: f.t1, p_player: f.p.ana, p_matches: 1 };
    for (const who of [w.u.luis, w.u.otra, w.u.ana, w.u.otro, mia]) await fails(db.rpc(who, 'save_football_sanction', args), DENIED);
    await fails(db.rpc(ANON, 'save_football_sanction', args), DENIED);
    const id = await db.rpc<string>(w.u.sofi, 'save_football_sanction', args);
    await fails(db.rpc(w.u.luis, 'delete_football_sanction', { p_id: id }), DENIED);
    await fails(db.rpc(ANON, 'delete_football_sanction', { p_id: id }), DENIED);
    // Admin de otra liga: tampoco (ni cambiarla con su id desde un partido de su liga).
    const g = await pitch({ sport: 'futsal' });
    await fails(db.rpc(w.u.org, 'save_football_sanction', { p_id: id, p_match: g.match, p_team: g.t1, p_player: g.p.ana, p_matches: 1 }), 'no_existe');
    // Nadie escribe directo.
    await fails(db.as(w.u.sofi, `update public.football_sanctions set matches = 9`), '42501');
    await fails(db.as(w.u.sofi, `delete from public.football_sanctions`), '42501');
  });

  it('datos que no sirven: invalido o no_existe', async () => {
    const f = await pitch();
    const base = { p_match: f.match, p_team: f.t1, p_player: f.p.ana, p_matches: 1 };
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_matches: 0 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_matches: 51 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_match: randomUUID() }), 'no_existe');
    // Gatos no juega ese partido; mia no es de Tigres; nuevo es de Leones.
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_team: f.t3 }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_player: f.p.mia }), 'invalido');
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_player: f.p.nuevo }), 'invalido');
    // La nota se recorta a 200: no falla.
    const long = await db.rpc<string>(w.u.sofi, 'save_football_sanction', { ...base, p_note: 'x'.repeat(250) });
    expect((await sanctions(f.lid)).find((s) => s.id === long)?.note).toHaveLength(200);
    // Jugador de otra liga: la FK compuesta lo frena.
    await fails(db.rpc(w.u.sofi, 'save_football_sanction', { ...base, p_player: w.p.p1 }), INVALID);
  });

  it('un refuerzo que jugó ese partido por ese lado (sin estar en la plantilla) sí se puede sancionar', async () => {
    const f = await pitch();
    await db.rpc(w.u.sofi, 'set_match_players', { p_match: f.match, p_side: 1, p_players: [{ player_id: f.p.mia, sub: true }] });
    const id = await db.rpc<string>(w.u.sofi, 'save_football_sanction', { p_match: f.match, p_team: f.t1, p_player: f.p.mia, p_matches: 1 });
    expect((await sanctions(f.lid)).map((s) => s.id)).toEqual([id]);
  });

  it('solo en ligas de fútbol o sala (ni el superusuario mete una en baloncesto)', async () => {
    const hoops = await league(db, w.u.org, { name: 'Baloncesto', visibility: 'public', sport: 'basketball', requirePhoto: false });
    await member(db, hoops, w.u.org, 'owner', 'org');
    const pp = await player(db, hoops, 'Org', w.u.org);
    const t = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: hoops, p_name: 'A', p_players: [{ player_id: pp }] });
    const [m] = await db.rpc<string[]>(w.u.org, 'create_matches', { p_league: hoops, p_matches: [{ sides: [{ side: 1, team_id: t }, { side: 2, label: 'B' }] }] });
    await fails(db.rpc(w.u.org, 'save_football_sanction', { p_match: m, p_team: t, p_player: pp, p_matches: 1 }), 'invalido');
    await fails(
      db.admin('insert into public.football_sanctions (league_id, team_id, player_id, match_id, matches) values ($1, $2, $3, $4, 1)', [hoops, t, pp, m]),
      'invalido',
    );
    // Y la liga del renglón es la del partido: con otra liga falla la FK compuesta.
    const f = await pitch();
    await fails(
      db.admin('insert into public.football_sanctions (league_id, team_id, player_id, match_id, matches) values ($1, $2, $3, $4, 1)', [w.pub, f.t1, f.p.luis, f.match]),
      INVALID,
    );
  });

  it('las ve quien ve la liga (privada: sus miembros)', async () => {
    const f = await pitch({ visibility: 'private' });
    await db.rpc(w.u.sofi, 'save_football_sanction', { p_match: f.match, p_team: f.t1, p_player: f.p.ana, p_matches: 1 });
    expect(await db.asUser(w.u.nuevo, 'select id from public.football_sanctions where league_id = $1', [f.lid])).toHaveLength(1);
    expect(await db.asUser(w.u.otro, 'select id from public.football_sanctions where league_id = $1', [f.lid])).toHaveLength(0);
    expect(await db.asAnon('select id from public.football_sanctions where league_id = $1', [f.lid])).toHaveLength(0);
    const pub = await pitch({ sport: 'futsal' });
    await db.rpc(w.u.sofi, 'save_football_sanction', { p_match: pub.match, p_team: pub.t2, p_player: pub.p.otra, p_matches: 3 });
    expect(await db.asAnon('select matches from public.football_sanctions where league_id = $1', [pub.lid])).toEqual([{ matches: 3 }]);
  });
});
