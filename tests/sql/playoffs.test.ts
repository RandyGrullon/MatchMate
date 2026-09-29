/**
 * Playoffs y series finales (20260929000700_temporadas.sql): la llave con la siembra estándar y pases directos, el
 * primer juego de cada serie, las victorias con el flujo del resultado de siempre (confirmado, propuesto que se
 * confirma o cuenta a las 48 h, W.O., anulado, empate), el siguiente juego con la localía alterna, el ganador que
 * pasa a la siguiente serie, el campeón, las correcciones, quién puede qué y el tiempo real.
 *
 * Mundo: liga pública de baloncesto «Liga de Barrio» (dueño org, admin sofi) con los equipos de la temporada Águilas,
 * Búhos, Cóndores, Delfines y Elefantes (en ese orden de siembra). luis es capitán de Águilas y otra delegada de
 * Delfines; ana es miembro sin equipo. Cada prueba en su transacción (se deshace al final); el tiempo real, con su
 * propia base.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

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

interface Hoops {
  lid: string;
  season: string;
  /** Equipos por inicial: a = Águilas, b = Búhos, c = Cóndores, d = Delfines, e = Elefantes. */
  t: Record<'a' | 'b' | 'c' | 'd' | 'e', string>;
}

interface Series {
  id: string;
  round: number;
  slot: number;
  best_of: number;
  team_a: string | null;
  team_b: string | null;
  seed_a: number | null;
  seed_b: number | null;
  label_a: string | null;
  label_b: string | null;
  wins_a: number;
  wins_b: number;
  winner: string | null;
  bye: boolean;
  next_series: string | null;
  next_side: string | null;
}

interface Game {
  id: string;
  round: number;
  stage: string;
  bracket_key: string;
  status: string;
  format: string;
  scheduled_at: string | null;
  home: string;
  away: string;
}

async function hoops(sport = 'basketball', opts: { visibility?: 'public' | 'private' } = {}): Promise<Hoops> {
  const lid = await league(db, w.u.org, { name: 'Liga de Barrio', visibility: opts.visibility ?? 'public', sport, requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const n of ['luis', 'ana', 'otra'] as const) await member(db, lid, w.u[n], 'member', n);
  const luis = await player(db, lid, 'Luis', w.u.luis);
  const otra = await player(db, lid, 'Otra', w.u.otra);
  await player(db, lid, 'Ana', w.u.ana);
  const team = (name: string, players: unknown[] = []) => db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: name, p_players: players });
  const t = {
    a: await team('Águilas', [{ player_id: luis, role: 'captain' }]),
    b: await team('Búhos'),
    c: await team('Cóndores'),
    d: await team('Delfines', [{ player_id: otra, role: 'delegate' }]),
    e: await team('Elefantes'),
  };
  const [{ id: season }] = await db.admin<{ id: string }>(`select id from public.seasons where league_id = $1 and status = 'active'`, [lid]);
  return { lid, season, t };
}

const create = (h: Hoops, teams: string[], bestOf: number[], who = w.u.org) =>
  db.rpc<string>(who, 'create_playoffs', { p_league: h.lid, p_season: h.season, p_teams: teams, p_best_of: bestOf });
const series = (po: string) => db.admin<Series>('select * from public.playoff_series where playoff_id = $1 order by round, slot', [po]);
const one = async (po: string, round: number, slot: number) => (await series(po)).find((s) => s.round === round && s.slot === slot)!;
/** Juegos de una serie (el local es el lado 1), del primero al último. */
const games = (seriesId: string) =>
  db.admin<Game>(
    `select m.id, m.round, m.stage, m.bracket_key, m.status, m.format, m.scheduled_at,
            (select s.team_id from public.match_sides s where s.match_id = m.id and s.side = 1) as home,
            (select s.team_id from public.match_sides s where s.match_id = m.id and s.side = 2) as away
       from public.matches m where m.series_id = $1 order by m.created_at, m.stage`,
    [seriesId],
  );
const open = async (seriesId: string) => (await games(seriesId)).filter((g) => g.status === 'scheduled');
const playoff = async (po: string) => (await db.admin<{ status: string; winner: string | null }>('select status, winner from public.playoffs where id = $1', [po]))[0];
/** El admin anota el resultado (queda confirmado): gana ese equipo. */
async function win(game: Game, team: string, who = w.u.org) {
  const side = game.home === team ? 1 : 2;
  const sides = side === 1 ? [80, 70] : [70, 80];
  await db.rpc(who, 'finish_match', { p_match: game.id, p_score: { text: `${sides[0]}-${sides[1]}`, sides }, p_winner: side });
}
/** Gana la serie ese equipo, juego tras juego. */
async function sweep(seriesId: string, team: string) {
  for (let i = 0; i < 7; i++) {
    const [g] = await open(seriesId);
    if (!g) return;
    await win(g, team);
  }
}

describe('la llave', () => {
  it('siembra estándar (1 contra 4, 2 contra 3) y el primer juego de cada serie, sin fecha, con el mejor sembrado de local', async () => {
    const h = await hoops();
    const po = await create(h, [h.t.a, h.t.b, h.t.c, h.t.d], [3, 5]);
    expect(await db.admin('select name, status, best_of, seeds, winner, created_by from public.playoffs where id = $1', [po])).toEqual([
      { name: 'Playoffs', status: 'active', best_of: [3, 5], seeds: [h.t.a, h.t.b, h.t.c, h.t.d], winner: null, created_by: w.u.org },
    ]);
    const s = await series(po);
    expect(s.map(({ round, slot, best_of, team_a, team_b, seed_a, seed_b, label_a, label_b, bye }) => ({ round, slot, best_of, team_a, team_b, seed_a, seed_b, label_a, label_b, bye }))).toEqual([
      { round: 1, slot: 1, best_of: 3, team_a: h.t.a, team_b: h.t.d, seed_a: 1, seed_b: 4, label_a: 'Águilas', label_b: 'Delfines', bye: false },
      { round: 1, slot: 2, best_of: 3, team_a: h.t.b, team_b: h.t.c, seed_a: 2, seed_b: 3, label_a: 'Búhos', label_b: 'Cóndores', bye: false },
      { round: 2, slot: 1, best_of: 5, team_a: null, team_b: null, seed_a: null, seed_b: null, label_a: null, label_b: null, bye: false },
    ]);
    expect([s[0].next_series, s[0].next_side, s[1].next_series, s[1].next_side, s[2].next_series]).toEqual([s[2].id, 'a', s[2].id, 'b', null]);
    expect(await games(s[0].id)).toEqual([
      expect.objectContaining({ round: 1, stage: 'Semifinal · Juego 1', bracket_key: 'PO1-1', status: 'scheduled', format: 'fiba', scheduled_at: null, home: h.t.a, away: h.t.d }),
    ]);
    expect(await games(s[1].id)).toEqual([expect.objectContaining({ stage: 'Semifinal · Juego 1', bracket_key: 'PO1-2', home: h.t.b, away: h.t.c })]);
    expect(await games(s[2].id)).toEqual([]);
    // Los juegos son partidos como los demás: con las reglas de la liga y los nombres de los equipos.
    expect(await db.admin(`select side, label, seed from public.match_sides where match_id = $1 order by side`, [(await games(s[0].id))[0].id])).toEqual([
      { side: 1, label: 'Águilas', seed: 1 },
      { side: 2, label: 'Delfines', seed: 4 },
    ]);
  });

  it('pases directos: con 3 equipos el primero espera en la final; con 5, tres rondas', async () => {
    const h = await hoops();
    const po = await create(h, [h.t.a, h.t.b, h.t.c], [1, 1]);
    const [s1, s2, fin] = await series(po);
    expect(s1).toMatchObject({ team_a: h.t.a, team_b: null, bye: true, winner: h.t.a, wins_a: 0 });
    expect(await games(s1.id)).toEqual([]);
    expect(s2).toMatchObject({ team_a: h.t.b, team_b: h.t.c, bye: false });
    expect(fin).toMatchObject({ team_a: h.t.a, seed_a: 1, label_a: 'Águilas', team_b: null });
    expect(await games(fin.id)).toEqual([]);
    const [g] = await games(s2.id);
    expect(g.stage).toBe('Semifinal');
    await win(g, h.t.c);
    expect(await one(po, 2, 1)).toMatchObject({ team_a: h.t.a, team_b: h.t.c, seed_b: 3 });
    expect(await games(fin.id)).toEqual([expect.objectContaining({ stage: 'Final', bracket_key: 'PO2-1', home: h.t.a, away: h.t.c })]);

    const h5 = { ...h, season: h.season };
    await db.rpc(w.u.org, 'delete_playoffs', { p_playoff: po });
    await fails(create(h5, Object.values(h.t), [3, 3]), 'invalido');
    const po5 = await create(h5, Object.values(h.t), [1, 3, 5]);
    const s5 = await series(po5);
    expect(s5.filter((s) => s.round === 1).map((s) => [s.seed_a, s.seed_b, s.bye])).toEqual([
      [1, null, true],
      [4, 5, false],
      [2, null, true],
      [3, null, true],
    ]);
    expect(s5.filter((s) => s.round === 2).map((s) => [s.team_a, s.team_b])).toEqual([
      [h.t.a, null],
      [h.t.b, h.t.c],
    ]);
    expect(await games(s5.find((s) => s.round === 2 && s.slot === 2)!.id)).toEqual([
      expect.objectContaining({ stage: 'Semifinal · Juego 1', bracket_key: 'PO2-2', home: h.t.b, away: h.t.c }),
    ]);
    expect(await games(s5.find((s) => s.round === 1 && s.slot === 2)!.id)).toEqual([expect.objectContaining({ stage: 'Cuartos de final', home: h.t.d })]);
  });
});

describe('las series', () => {
  it('cada resultado confirmado suma; la localía alterna; al ganar pasa a la final; el ganador de la final es el campeón', async () => {
    const h = await hoops();
    const po = await create(h, [h.t.a, h.t.b, h.t.c, h.t.d], [3, 5]);
    const semi1 = (await one(po, 1, 1)).id;
    const [g1] = await games(semi1);
    await win(g1, h.t.a);
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 1, wins_b: 0, winner: null });
    const [g2] = await open(semi1);
    expect(g2).toMatchObject({ stage: 'Semifinal · Juego 2', home: h.t.d, away: h.t.a });
    await win(g2, h.t.a);
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 2, winner: h.t.a });
    expect(await open(semi1)).toEqual([]);
    expect(await one(po, 2, 1)).toMatchObject({ team_a: h.t.a, seed_a: 1, label_a: 'Águilas', team_b: null });
    // La otra semifinal a tres juegos: Cóndores gana uno, Búhos dos.
    const semi2 = (await one(po, 1, 2)).id;
    await win((await open(semi2))[0], h.t.c);
    await win((await open(semi2))[0], h.t.b);
    const [g3] = await open(semi2);
    expect(g3).toMatchObject({ stage: 'Semifinal · Juego 3', home: h.t.b });
    await win(g3, h.t.b);
    expect(await one(po, 1, 2)).toMatchObject({ wins_a: 2, wins_b: 1, winner: h.t.b });
    const fin = (await one(po, 2, 1)).id;
    expect(await games(fin)).toEqual([expect.objectContaining({ stage: 'Final · Juego 1', bracket_key: 'PO2-1', home: h.t.a, away: h.t.b })]);
    await sweep(fin, h.t.a);
    expect(await one(po, 2, 1)).toMatchObject({ wins_a: 3, wins_b: 0, winner: h.t.a });
    expect(await playoff(po)).toEqual({ status: 'finished', winner: h.t.a });
    // league_seasons lo propone para cerrar la temporada.
    const list = await db.rpc<{ id: string; playoffs: unknown[] }[]>(ANON, 'league_seasons', { p_league: h.lid });
    expect(list[0].playoffs).toEqual([
      {
        id: po,
        name: 'Playoffs',
        status: 'finished',
        champion: { teamId: h.t.a, name: 'Águilas' },
        runnerUp: { teamId: h.t.b, name: 'Búhos' },
        semifinalists: [
          { teamId: h.t.d, name: 'Delfines' },
          { teamId: h.t.c, name: 'Cóndores' },
        ],
      },
    ]);
    // Ya terminado, otro playoff en la misma temporada se puede armar.
    await create(h, [h.t.c, h.t.d], [1]);
    // Con ese en curso, la final del primero no se puede volver a abrir (anulando su último juego).
    const last = (await games(fin)).at(-1)!;
    await fails(db.rpc(w.u.org, 'void_match', { p_match: last.id }), 'invalido: playoff');
    expect(await playoff(po)).toEqual({ status: 'finished', winner: h.t.a });
    expect(await db.admin('select status from public.matches where id = $1', [last.id])).toEqual([{ status: 'confirmed' }]);
  });

  it('un resultado propuesto por un lado cuenta al confirmarlo el otro, o a las 48 h (sync_playoffs)', async () => {
    const h = await hoops();
    const po = await create(h, [h.t.a, h.t.b, h.t.c, h.t.d], [3, 3]);
    const semi1 = (await one(po, 1, 1)).id;
    const [g1] = await games(semi1);
    await db.rpc(w.u.luis, 'finish_match', { p_match: g1.id, p_score: { text: '80-70', sides: [80, 70] }, p_winner: 1 });
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 0 });
    expect(await games(semi1)).toHaveLength(1);
    await db.rpc(w.u.otra, 'confirm_result', { p_match: g1.id });
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 1 });
    const [g2] = await open(semi1);
    // Juego 2: Delfines de local. Luis (visitante) propone; nadie confirma.
    await db.rpc(w.u.luis, 'finish_match', { p_match: g2.id, p_score: { text: '70-80', sides: [70, 80] }, p_winner: 2 });
    expect(await db.rpc(w.u.ana, 'sync_playoffs', { p_playoff: po })).toBe(0);
    await db.admin(`update public.matches set proposed_at = now() - interval '49 hours' where id = $1`, [g2.id]);
    expect(await db.rpc(w.u.ana, 'sync_playoffs', { p_playoff: po })).toBe(2);
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 2, winner: h.t.a });
    expect(await one(po, 2, 1)).toMatchObject({ team_a: h.t.a });
    // Un reclamo no cuenta hasta que el admin lo resuelve.
    const semi2 = (await one(po, 1, 2)).id;
    const [g3] = await games(semi2);
    await db.rpc(w.u.org, 'admin_correct_result', { p_match: g3.id, p_score: { text: '1-0', sides: [1, 0] }, p_winner: 1 });
    expect(await one(po, 1, 2)).toMatchObject({ wins_a: 1 });
  });

  it('W.O. cuenta; un juego anulado se reemplaza; ninguno se presentó: se juega otro', async () => {
    const h = await hoops();
    const po = await create(h, [h.t.a, h.t.b], [3]);
    const fin = (await one(po, 1, 1)).id;
    const [g1] = await games(fin);
    await db.rpc(w.u.org, 'set_walkover', { p_match: g1.id, p_absent: 2, p_score: { text: '20-0', sides: [20, 0] } });
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 1 });
    const [g2] = await open(fin);
    expect(g2.stage).toBe('Final · Juego 2');
    await db.rpc(w.u.org, 'void_match', { p_match: g2.id, p_note: 'Se fue la luz' });
    const [g2b] = await open(fin);
    expect(g2b).toMatchObject({ stage: 'Final · Juego 2', home: h.t.b });
    await db.rpc(w.u.org, 'set_walkover', { p_match: g2b.id, p_absent: 0 });
    const [g3] = await open(fin);
    expect(g3).toMatchObject({ stage: 'Final · Juego 3', home: h.t.a });
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 1, wins_b: 0, winner: null });
  });

  it('fútbol: un empate no suma y se juega otro; los juegos no cuentan en la tabla (bracket_key)', async () => {
    const h = await hoops('football');
    const po = await create(h, [h.t.a, h.t.b], [1]);
    const fin = (await one(po, 1, 1)).id;
    const [g1] = await games(fin);
    expect(g1).toMatchObject({ stage: 'Final', format: 'football', bracket_key: 'PO1-1' });
    await db.rpc(w.u.org, 'finish_match', { p_match: g1.id, p_score: { text: '1-1', sides: [1, 1] } });
    const [g2] = await open(fin);
    expect(g2).toMatchObject({ stage: 'Final · Juego 2', home: h.t.b });
    await win(g2, h.t.b);
    expect(await playoff(po)).toEqual({ status: 'finished', winner: h.t.b });
  });

  it('una corrección cambia quién pasa mientras la serie siguiente no empezó; si ya empezó, no se deja hasta anular sus juegos', async () => {
    const h = await hoops();
    const po = await create(h, [h.t.a, h.t.b, h.t.c, h.t.d], [3, 3]);
    const semi1 = (await one(po, 1, 1)).id;
    const semi2 = (await one(po, 1, 2)).id;
    await sweep(semi1, h.t.a);
    await sweep(semi2, h.t.b);
    const fin = (await one(po, 2, 1)).id;
    expect(await games(fin)).toHaveLength(1);
    // El juego 2 de la primera semifinal lo ganó Delfines: 1-1, se juega el 3 y la final vuelve a esperar.
    const [, g2] = await games(semi1);
    await db.rpc(w.u.org, 'admin_correct_result', { p_match: g2.id, p_score: { text: '90-60', sides: [90, 60] }, p_winner: 1 });
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 1, wins_b: 1, winner: null });
    expect(await one(po, 2, 1)).toMatchObject({ team_a: null, team_b: h.t.b });
    expect(await games(fin)).toEqual([]);
    const [g3] = await open(semi1);
    expect(g3.stage).toBe('Semifinal · Juego 3');
    await win(g3, h.t.d);
    expect(await one(po, 2, 1)).toMatchObject({ team_a: h.t.d, seed_a: 4, label_a: 'Delfines' });
    const [f1] = await games(fin);
    expect(f1).toMatchObject({ home: h.t.b, away: h.t.d });
    // La final empezó: otra corrección de la semifinal que cambia quién pasa no se deja (no cambia nada).
    await win(f1, h.t.b);
    expect(g3).toMatchObject({ home: h.t.a, away: h.t.d });
    const fix = () => db.rpc(w.u.org, 'admin_correct_result', { p_match: g3.id, p_score: { text: '90-60', sides: [90, 60] }, p_winner: 1 });
    await fails(fix(), 'cerrado: serie');
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 1, wins_b: 2, winner: h.t.d });
    expect(await one(po, 2, 1)).toMatchObject({ team_a: h.t.d, wins_b: 1 });
    // El admin anula el juego de la final y vuelve a corregir: pasa Águilas y la final empieza de nuevo.
    await db.rpc(w.u.org, 'void_match', { p_match: f1.id, p_note: 'Jugó quien no era' });
    await fix();
    expect(await one(po, 1, 1)).toMatchObject({ wins_a: 2, wins_b: 1, winner: h.t.a });
    expect(await one(po, 2, 1)).toMatchObject({ team_a: h.t.a, seed_a: 1, label_a: 'Águilas', team_b: h.t.b, wins_a: 0, wins_b: 0, winner: null });
    expect(await open(fin)).toEqual([expect.objectContaining({ stage: 'Final · Juego 1', home: h.t.a, away: h.t.b })]);
    // sync_playoffs no se traba con lo que ya no se puede aplicar: pone al día lo demás.
    expect(await db.rpc(w.u.ana, 'sync_playoffs', { p_playoff: po })).toBe(0);
  });
});

describe('quién puede qué', () => {
  it('solo el admin arma o borra; datos que no sirven no crean nada', async () => {
    const h = await hoops();
    const four = [h.t.a, h.t.b, h.t.c, h.t.d];
    await fails(create(h, four, [3, 3], w.u.luis), DENIED);
    await fails(create(h, four, [3, 3], ANON), DENIED);
    await fails(create(h, four, [3, 3], w.u.otro), DENIED);
    for (const [teams, bestOf] of [
      [[h.t.a], [1]],
      [[h.t.a, h.t.a], [1]],
      [four, [3]],
      [four, [3, 2]],
      [four, [3, 9]],
      [[h.t.a, w.p.luis], [1]],
    ] as [string[], number[]][]) {
      await fails(create(h, teams, bestOf), INVALID);
    }
    // Un equipo de otra temporada no entra.
    await db.rpc(w.u.org, 'close_season', { p_season: h.season, p_standings: {} });
    const s2 = await db.rpc<string>(w.u.org, 'start_season', { p_league: h.lid, p_name: 'Temporada 2027', p_starts_on: '2027-01-10', p_copy_teams: true });
    await fails(create(h, four, [3, 3]), 'cerrado');
    await fails(db.rpc(w.u.org, 'create_playoffs', { p_league: h.lid, p_season: s2, p_teams: [h.t.a, h.t.b], p_best_of: [1] }), 'invalido');
    const copies = (await db.admin<{ id: string }>('select id from public.teams where season_id = $1 order by sort_order', [s2])).map((r) => r.id);
    const po = await db.rpc<string>(w.u.org, 'create_playoffs', { p_league: h.lid, p_season: s2, p_teams: copies.slice(0, 2), p_best_of: [3] });
    await fails(db.rpc(w.u.org, 'create_playoffs', { p_league: h.lid, p_season: s2, p_teams: copies.slice(2, 4), p_best_of: [1] }), 'duplicado');
    // Otra liga u otro deporte.
    await fails(db.rpc(w.u.org, 'create_playoffs', { p_league: w.priv, p_season: h.season, p_teams: four, p_best_of: [3, 3] }), 'invalido');
    expect(await db.count('public.playoffs')).toBe(1);
    // Borrar: solo el admin; los juegos sin jugar se van, los jugados se quedan sin serie.
    const [g1] = await games((await one(po, 1, 1)).id);
    await win(g1, copies[0]);
    await fails(db.rpc(w.u.luis, 'delete_playoffs', { p_playoff: po }), DENIED);
    await db.rpc(w.u.sofi, 'delete_playoffs', { p_playoff: po });
    expect(await db.count('public.playoffs')).toBe(0);
    expect(await db.count('public.playoff_series')).toBe(0);
    expect(await db.admin('select id, series_id, status from public.matches where league_id = $1', [h.lid])).toEqual([{ id: g1.id, series_id: null, status: 'confirmed' }]);
    expect(await db.count('public.tombstones', `tbl = 'playoffs' and row_key = $1`, [po])).toBe(1);
    await fails(db.rpc(w.u.sofi, 'delete_playoffs', { p_playoff: po }), 'no_existe');
    // Nadie escribe directo.
    await fails(db.asUser(w.u.org, `update public.playoff_series set winner = null`), '42501');
  });

  it('la llave la ve quien ve la liga; sync_playoffs pide sesión', async () => {
    const pub = await hoops();
    const po = await create(pub, [pub.t.a, pub.t.b], [1]);
    expect(await db.asAnon('select id from public.playoffs where id = $1', [po])).toHaveLength(1);
    expect(await db.asAnon('select id from public.playoff_series where playoff_id = $1', [po])).toHaveLength(1);
    await fails(db.rpc(ANON, 'sync_playoffs', { p_playoff: po }), DENIED);
    expect(await db.rpc(w.u.otro, 'sync_playoffs', { p_playoff: po })).toBe(0);
    await db.admin('update public.leagues set visibility = $2 where id = $1', [pub.lid, 'private']);
    expect(await db.asAnon('select id from public.playoffs where id = $1', [po])).toEqual([]);
    expect(await db.asUser(w.u.otro, 'select id from public.playoff_series where playoff_id = $1', [po])).toEqual([]);
    await fails(db.rpc(w.u.otro, 'sync_playoffs', { p_playoff: po }), 'no_existe');
    expect(await db.rpc(w.u.ana, 'sync_playoffs', { p_playoff: po })).toBe(0);
  });
});

describe('tiempo real', () => {
  interface Msg {
    topic: string;
    event: string;
    payload: { op: string; ids: string[] };
  }
  let rt: TestDb;
  let world: World;
  let msgs: Msg[] = [];
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 50));
    return msgs;
  };

  beforeAll(async () => {
    rt = await TestDb.open();
    world = await makeWorld(rt);
    await rt.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw) as Msg));
  });
  afterAll(async () => {
    await rt.pg.close();
  });

  it("'playoffs' al armar la llave y al jugar; 'seasons' al cerrar y empezar temporadas", async () => {
    const lid = await league(rt, world.u.org, { name: 'Barrio', visibility: 'public', sport: 'basketball', requirePhoto: false });
    await member(rt, lid, world.u.org, 'owner', 'org');
    const a = await rt.rpc<string>(world.u.org, 'create_season_team', { p_league: lid, p_name: 'A' });
    const b = await rt.rpc<string>(world.u.org, 'create_season_team', { p_league: lid, p_name: 'B' });
    const [{ id: season }] = await rt.admin<{ id: string }>(`select id from public.seasons where league_id = $1`, [lid]);
    msgs = [];
    const po = await rt.rpc<string>(world.u.org, 'create_playoffs', { p_league: lid, p_season: season, p_teams: [a, b], p_best_of: [1] });
    const got = (await settle()).filter((m) => m.event === 'playoffs');
    expect(got.every((m) => m.topic === `league:${lid}` && m.payload.ids.includes(po))).toBe(true);
    expect(got.map((m) => m.payload.op)).toContain('insert');
    const [{ id: game }] = await rt.admin<{ id: string }>('select id from public.matches where league_id = $1', [lid]);
    msgs = [];
    await rt.rpc(world.u.org, 'finish_match', { p_match: game, p_score: { text: '2-1', sides: [2, 1] }, p_winner: 1 });
    expect((await settle()).filter((m) => m.event === 'playoffs').map((m) => m.payload)).toContainEqual({ op: 'update', ids: [po] });
    msgs = [];
    await rt.rpc(world.u.org, 'close_season', { p_season: season, p_standings: [], p_awards: [{ kind: 'campeon', team_id: a }] });
    const closed = await settle();
    expect(closed.filter((m) => m.event === 'seasons').map((m) => m.payload)).toContainEqual({ op: 'update', ids: [season] });
    expect(closed.filter((m) => m.event === 'announcements' && m.topic === `league:${lid}`)).toHaveLength(1);
    msgs = [];
    const s2 = await rt.rpc<string>(world.u.org, 'start_season', { p_league: lid, p_name: 'Otra', p_starts_on: '2027-01-01' });
    expect((await settle()).filter((m) => m.event === 'seasons').map((m) => m.payload)).toContainEqual({ op: 'insert', ids: [s2] });
  });
});
