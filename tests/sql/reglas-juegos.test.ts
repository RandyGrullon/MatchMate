/**
 * tests/reglas.test.ts (BowlingX) pasado a Postgres, 3 de 4: juegos y envíos, anotadores, juegos de la
 * sesión y en vivo.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DENIED, INVALID, TestDb, fails } from './harness';
import { entry, event, makeWorld, member, withCopa, type Copa, type World } from './fixture';

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

const FRAMES = { '0': { rolls: [10, 10, 10] } };
const photo = () => ({ id: randomUUID(), width: 10, height: 10, bytes: 1000 });

/** Como sendGames de BowlingX: foto + envío juntos (aquí, una RPC). */
function sendGames(uid: string, lid: string, extra: Record<string, unknown> = {}, eventId: string | null = w.e.e1) {
  return db.rpc<string>(uid, 'submit_games', {
    p_op_id: randomUUID(),
    p_league: lid,
    p_event: eventId,
    p_scores: [150, 160, 170],
    p_frames: FRAMES,
    p_photo: photo(),
    ...extra,
  });
}

const sub = async (id: string) =>
  (
    await db.admin<{ status: string; scanned: number[] | null; scanned_name: string | null; photo_id: string | null; player_id: string }>(
      'select status, scanned, scanned_name, photo_id, player_id from public.submissions where id = $1',
      [id],
    )
  )[0];

describe('juegos', () => {
  it('solo los admins de la liga anotan en participaciones', async () => {
    await db.rpc(w.u.sofi, 'update_entry', { p_entry: w.e1Luis, p_patch: { scores: [200] } });
    expect(await db.admin('select scores from public.entries where id = $1', [w.e1Luis])).toEqual([{ scores: [200] }]);
    await fails(db.rpc(w.u.luis, 'update_entry', { p_entry: w.e1Luis, p_patch: { scores: [300] } }), DENIED);
    await fails(db.rpc(w.u.luis, 'save_game', { p_entry: w.e1Luis, p_game: 0, p_score: 300 }), DENIED);
    await fails(db.asUser(w.u.luis, 'update public.entries set scores = $1 where id = $2', [[300], w.e1Luis]), '42501');
  });

  it('un miembro envía juegos de su jugador con foto y cuadros', async () => {
    const id = await sendGames(w.u.luis, w.priv);
    const s = await sub(id);
    expect(s).toMatchObject({ status: 'pendiente', scanned: null, player_id: w.p.luis });
    expect(await db.admin('select path, event_id from public.photos where id = $1', [s.photo_id])).toEqual([
      { path: `${w.priv}/${s.photo_id}.webp`, event_id: w.e.e1 },
    ]);
    expect(await db.admin('select frames from public.submissions where id = $1', [id])).toEqual([{ frames: FRAMES }]);
  });

  it('no envía juegos de otro jugador, ni sin jugador, ni aprobados', async () => {
    await fails(sendGames(w.u.luis, w.priv, { p_player: w.p.pedro }), DENIED);
    await fails(sendGames(w.u.ana, w.priv), DENIED);
    await fails(sendGames(w.u.luis, w.priv, { p_status: 'aprobado' }), '42883');
    await fails(
      db.asUser(w.u.luis, `insert into public.submissions (league_id, player_id, event_id, scores, status) values ($1, $2, $3, '{150}', 'aprobado')`, [
        w.priv,
        w.p.luis,
        w.e.e1,
      ]),
      '42501',
    );
    expect(await db.count('public.submissions')).toBe(0);
  });

  it('sin foto se puede enviar (el admin decide), aunque la liga exija foto', async () => {
    const id = await sendGames(w.u.luis, w.priv, { p_photo: null });
    expect((await sub(id)).photo_id).toBeNull();
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    await db.admin('update public.players set user_id = $1 where id = $2', [w.u.luis, w.p.p1]);
    const id2 = await sendGames(w.u.luis, w.pub, { p_photo: null }, w.e.e9);
    expect(await sub(id2)).toMatchObject({ status: 'pendiente', player_id: w.p.p1 });
  });

  it('por fecha, sin evento', async () => {
    const id = await sendGames(w.u.luis, w.priv, { p_date: '2026-09-15' }, null);
    expect(await db.admin('select event_id, date::text from public.submissions where id = $1', [id])).toEqual([{ event_id: null, date: '2026-09-15' }]);
    // Evento y fecha a la vez, o ninguno: no.
    await fails(sendGames(w.u.luis, w.priv, { p_date: '2026-09-15' }), INVALID);
    await fails(sendGames(w.u.luis, w.priv, {}, null), INVALID);
  });

  it('lo que leyó la IA de la foto se agrega después, una vez, a su envío pendiente', async () => {
    const s1 = await sendGames(w.u.luis, w.priv);
    const scan = (uid: string, scanned: unknown, name: string | null = null) =>
      db.rpc(uid, 'set_submission_scan', { p_submission: s1, p_scanned: scanned, p_scanned_name: name });
    // Nada más que la lectura (no hay cómo tocar los pinos), y con pinos válidos.
    await fails(db.rpc(w.u.luis, 'set_submission_scan', { p_submission: s1, p_scanned: [150, 160, 170], p_scores: [300, 300, 300] }), '42883');
    await fails(scan(w.u.luis, [150, 999]), INVALID);
    await fails(scan(w.u.luis, []), INVALID);
    await fails(scan(w.u.luis, 'x'), INVALID);
    // Otro miembro no toca el envío de Luis.
    await fails(scan(w.u.ana, [150, 160, 170]), DENIED);
    await fails(scan(w.u.luis, [150, 160, 170], 'x'.repeat(61)), INVALID);
    await scan(w.u.luis, [150, null, 170], 'LUIS G');
    expect(await sub(s1)).toMatchObject({ scanned: [150, null, 170], scanned_name: 'LUIS G' });
    // Una sola vez: ya leída no se cambia.
    await fails(scan(w.u.luis, [300, 300, 300]), DENIED);
    // El admin sí (lee la foto él mismo o corrige la fila).
    await scan(w.u.sofi, [151, 160, 170]);
    expect((await sub(s1)).scanned).toEqual([151, 160, 170]);
  });

  it('los juegos enviados y lo leído son pinos válidos', async () => {
    const send = (fields: Record<string, unknown>) => sendGames(w.u.luis, w.priv, { p_photo: null, ...fields });
    await fails(send({ p_scores: [{ a: 1 }] }), INVALID);
    await fails(send({ p_scores: [150, 301] }), INVALID);
    await fails(send({ p_scores: [] }), INVALID);
    await fails(send({ p_scores: Array(11).fill(100) }), INVALID);
    await fails(send({ p_scanned: [999] }), INVALID);
    await fails(send({ p_scanned: ['150'] }), INVALID);
    const id = await send({ p_scores: [150, null, 170], p_scanned: [150, null, 171] });
    expect(await db.admin('select scores, scanned from public.submissions where id = $1', [id])).toEqual([
      { scores: [150, null, 170], scanned: [150, null, 171] },
    ]);
  });

  it('la lectura no se agrega a un envío sin foto ni a uno ya revisado', async () => {
    const s2 = await sendGames(w.u.luis, w.priv, { p_photo: null });
    await fails(db.rpc(w.u.luis, 'set_submission_scan', { p_submission: s2, p_scanned: [150, 160, 170] }), DENIED);
    const s1 = await sendGames(w.u.luis, w.priv);
    await db.rpc(w.u.sofi, 'approve_submission', { p_submission: s1, p_values: { '0': 150 } });
    await fails(db.rpc(w.u.luis, 'set_submission_scan', { p_submission: s1, p_scanned: [150, 160, 170] }), DENIED);
  });

  it('solo los admins aprueban', async () => {
    const s1 = await sendGames(w.u.luis, w.priv);
    await fails(db.rpc(w.u.luis, 'approve_submission', { p_submission: s1, p_values: { '0': 150 } }), DENIED);
    await fails(db.rpc(w.u.luis, 'reject_submission', { p_submission: s1 }), DENIED);
    await fails(db.asUser(w.u.luis, `update public.submissions set status = 'aprobado' where id = $1`, [s1]), '42501');
    const r = await db.rpc<{ entry_id: string; event_id: string }>(w.u.sofi, 'approve_submission', {
      p_submission: s1,
      p_values: { '0': 150, '1': 160, '2': 170 },
      p_frames: { '0': FRAMES['0'] },
    });
    expect(r).toEqual({ entry_id: w.e1Luis, event_id: w.e.e1 });
    const s = await sub(s1);
    expect(s.status).toBe('aprobado');
    expect(await db.admin('select reviewed_by from public.submissions where id = $1', [s1])).toEqual([{ reviewed_by: w.u.sofi }]);
    // Los juegos quedan verificados con la foto; los cuadros solo donde el teléfono los validó.
    expect(await db.admin('select scores, photos, frames from public.entries where id = $1', [w.e1Luis])).toEqual([
      { scores: [150, 160, 170], photos: [s.photo_id, s.photo_id, s.photo_id], frames: { '0': FRAMES['0'] } },
    ]);
  });

  it('asistencia: cada quien marca solo su "voy"', async () => {
    const going = () => db.admin<{ player_id: string }>('select player_id from public.event_rsvps where event_id = $1', [w.e.e1]);
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: true });
    expect(await going()).toEqual([{ player_id: w.p.luis }]);
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: false });
    expect(await going()).toEqual([]);
    await fails(db.rpc(w.u.luis, 'set_rsvp', { p_event: w.e.e1, p_going: true, p_player: w.p.pedro }), DENIED);
    await fails(db.rpc(w.u.ana, 'set_rsvp', { p_event: w.e.e1, p_going: true }), DENIED);
    await fails(db.asUser(w.u.luis, `update public.events set name = 'hack' where id = $1`, [w.e.e1]), '42501');
    // El admin sí marca el de otro.
    await db.rpc(w.u.sofi, 'set_rsvp', { p_event: w.e.e1, p_going: true, p_player: w.p.pedro });
    expect(await going()).toEqual([{ player_id: w.p.pedro }]);
  });
});

describe('anotadores', () => {
  let c: Copa;
  beforeEach(async () => {
    c = await withCopa(db, w);
  });
  const scorer = (uid: string) =>
    db.admin<{ is_scorer: boolean }>('select is_scorer from public.league_members where league_id = $1 and user_id = $2', [c.copa, uid]).then((r) => r[0].is_scorer);

  it('el dueño o un admin nombran anotadores; un admin no se nombra a sí mismo ni a otro admin', async () => {
    await fails(db.rpc(w.u.ana, 'set_member_scorer', { p_league: c.copa, p_user: w.u.ana, p_scorer: true }), DENIED);
    await db.rpc(w.u.sofi, 'set_member_scorer', { p_league: c.copa, p_user: w.u.ana, p_scorer: true });
    await fails(db.rpc(w.u.sofi, 'set_member_scorer', { p_league: c.copa, p_user: w.u.org, p_scorer: true }), DENIED);
    await db.rpc(w.u.org, 'set_member_scorer', { p_league: c.copa, p_user: w.u.luis, p_scorer: false });
    expect([await scorer(w.u.ana), await scorer(w.u.luis)]).toEqual([true, false]);
  });

  it('el anotador anota pinos, fotos y cuadros de quien ya está inscrito', async () => {
    await db.rpc(w.u.luis, 'update_entry', {
      p_entry: c.t1Px,
      p_patch: { scores: [190, null, null], photos: ['sin-foto', null, null], frames: { '0': { rolls: [10] } } },
    });
    expect(await db.admin('select scores, photos, frames from public.entries where id = $1', [c.t1Px])).toEqual([
      { scores: [190, null, null], photos: ['sin-foto', null, null], frames: { '0': { rolls: [10] } } },
    ]);
    // Guardar un juego (como saveGame): la copa exige foto, así que queda en borrador hasta verificarlo.
    await db.rpc(w.u.luis, 'save_game', { p_entry: c.t1Px, p_game: 1, p_score: 201, p_frames: { rolls: [9, 1] } });
    expect(await db.admin('select scores, photos, frames from public.entries where id = $1', [c.t1Px])).toEqual([
      { scores: [190, 201, null], photos: ['sin-foto', null, null], frames: { '0': { rolls: [10] }, '1': { rolls: [9, 1] } } },
    ]);
    // Sin foto obligatoria cuenta de una; borrar el juego quita sus cuadros.
    await db.admin('update public.leagues set require_photo = false where id = $1', [c.copa]);
    await db.rpc(w.u.luis, 'save_game', { p_entry: c.t1Px, p_game: 2, p_score: 150 });
    await db.rpc(w.u.luis, 'save_game', { p_entry: c.t1Px, p_game: 1, p_score: null });
    expect(await db.admin('select scores, photos, frames from public.entries where id = $1', [c.t1Px])).toEqual([
      { scores: [190, null, 150], photos: ['sin-foto', null, 'sin-foto'], frames: { '0': { rolls: [10] } } },
    ]);
    const r = await db.rpc<{ id: string; path: string }>(w.u.luis, 'add_photo', { p_league: c.copa, p_event: c.t1, p_width: 1, p_height: 1 });
    expect(r.path).toBe(`${c.copa}/${r.id}.webp`);
  });

  it('el anotador no cambia equipos, no inscribe ni crea eventos', async () => {
    const team = await db.rpc<string>(w.u.org, 'add_team', { p_event: c.t1, p_name: 'Equipo 1' });
    await fails(db.rpc(w.u.luis, 'update_entry', { p_entry: c.t1Px, p_patch: { team_id: team } }), DENIED);
    await fails(db.rpc(w.u.luis, 'add_entries', { p_event: c.t1, p_players: [{ player_id: c.jl, average: 0 }] }), DENIED);
    await fails(db.rpc(w.u.luis, 'create_event', { p_league: c.copa, p_type: 'torneo', p_date: '2026-11-01' }), DENIED);
    await fails(db.rpc(w.u.luis, 'update_league', { p_league: c.copa, p_patch: { name: 'Mía' } }), DENIED);
    // Tampoco inscribe con la foto (solo verifica a quien ya está).
    await fails(
      db.rpc(w.u.luis, 'save_verified_games', { p_event: c.t1, p_photo: photo(), p_writes: [{ player_id: c.jl, average: 0, values: { '0': 200 } }] }),
      DENIED,
    );
    await db.rpc(w.u.luis, 'save_verified_games', { p_event: c.t1, p_photo: photo(), p_writes: [{ player_id: c.px, values: { '2': 180 } }] });
    expect(await db.admin('select scores from public.entries where id = $1', [c.t1Px])).toEqual([{ scores: [null, null, 180] }]);
  });

  it('un admin no saca a un anotador (sería quitarle el permiso); el dueño sí', async () => {
    await fails(db.rpc(w.u.sofi, 'remove_member', { p_league: c.copa, p_user: w.u.luis }), DENIED);
    await db.rpc(w.u.sofi, 'remove_member', { p_league: c.copa, p_user: w.u.ana });
    await db.rpc(w.u.org, 'remove_member', { p_league: c.copa, p_user: w.u.luis });
    expect(await db.count('public.league_members', 'league_id = $1', [c.copa])).toBe(2);
  });

  it('un admin deja de ser admin por su cuenta, pero no se nombra anotador', async () => {
    await fails(db.rpc(w.u.sofi, 'set_member_scorer', { p_league: c.copa, p_user: w.u.sofi, p_scorer: true }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_member_role', { p_league: c.copa, p_user: w.u.luis, p_role: 'admin' }), DENIED);
    await db.rpc(w.u.sofi, 'step_down_admin', { p_league: c.copa });
    expect(await db.admin('select role from public.league_members where league_id = $1 and user_id = $2', [c.copa, w.u.sofi])).toEqual([
      { role: 'member' },
    ]);
    // También como lo hace hoy la pantalla (setMemberRole de sí mismo a 'member'), pero no al revés.
    await db.rpc(w.u.org, 'set_member_role', { p_league: c.copa, p_user: w.u.sofi, p_role: 'admin' });
    await db.rpc(w.u.sofi, 'set_member_role', { p_league: c.copa, p_user: w.u.sofi, p_role: 'member' });
    await fails(db.rpc(w.u.sofi, 'set_member_role', { p_league: c.copa, p_user: w.u.sofi, p_role: 'admin' }), DENIED);
    // Un miembro no "baja" de admin.
    await fails(db.rpc(w.u.luis, 'step_down_admin', { p_league: c.copa }), DENIED);
  });

  it('en una liga (no torneo) no hay anotadores', async () => {
    await fails(db.rpc(w.u.ana, 'update_entry', { p_entry: w.e1Luis, p_patch: { scores: [300] } }), DENIED);
    await fails(db.rpc(w.u.ana, 'save_game', { p_entry: w.e1Luis, p_game: 0, p_score: 300 }), DENIED);
  });
});

describe('juegos de la sesión', () => {
  it('en una práctica un jugador suma un juego (de uno en uno, hasta 10); en un torneo no', async () => {
    const games = (eid: string) => db.admin<{ games: number }>('select games from public.events where id = $1', [eid]).then((r) => r[0].games);
    expect(await db.rpc(w.u.luis, 'add_practice_game', { p_event: w.e.e1, p_expected: 3 })).toBe(4);
    // Otro teléfono lo pidió viendo 3 juegos: ya se sumó, no suma otro (de uno en uno).
    expect(await db.rpc(w.u.luis, 'add_practice_game', { p_event: w.e.e1, p_expected: 3 })).toBe(4);
    expect(await games(w.e.e1)).toBe(4);
    await fails(db.rpc(w.u.ana, 'add_practice_game', { p_event: w.e.e1 }), DENIED);
    await fails(db.asUser(w.u.luis, 'update public.events set games = 6 where id = $1', [w.e.e1]), '42501');
    const p10 = await event(db, w.priv, 'practica', '2026-09-22', 10);
    const t1 = await event(db, w.priv, 'torneo', '2026-09-22', 3, 'Copa');
    await fails(db.rpc(w.u.luis, 'add_practice_game', { p_event: p10 }), INVALID);
    await fails(db.rpc(w.u.luis, 'add_practice_game', { p_event: t1 }), DENIED);
    await db.rpc(w.u.sofi, 'update_event', { p_event: t1, p_patch: { games: 4 } });
    expect(await games(t1)).toBe(4);
  });
});

describe('juegos en vivo desde el teléfono', () => {
  const live = (uid: string, scores: unknown, eventId = w.e.e1) => db.rpc(uid, 'publish_live', { p_event: eventId, p_scores: scores });
  const liveRows = (eventId = w.e.e1) =>
    db.admin<{ player_id: string; state: { scores: (number | null)[] } }>('select player_id, state from public.live_states where event_id = $1', [
      eventId,
    ]);

  it('el jugador publica sus juegos en vivo y todos los de la liga los ven', async () => {
    await live(w.u.luis, [190, 210]);
    expect(await db.asUser(w.u.ana, 'select player_id, state from public.live_states where league_id = $1', [w.priv])).toEqual([
      { player_id: w.p.luis, state: { scores: [190, 210] } },
    ]);
    expect(await db.asUser(w.u.extra, 'select player_id from public.live_states where league_id = $1', [w.priv])).toHaveLength(0);
    expect(await db.rpc(w.u.luis, 'delete_live', { p_event: w.e.e1 })).toBe(true);
    expect(await liveRows()).toEqual([]);
    // Publicar sin juegos también lo quita (como publishLiveScores).
    await live(w.u.luis, [190]);
    await live(w.u.luis, [null, null]);
    expect(await liveRows()).toEqual([]);
  });

  it('al salir de la liga se quitan sus juegos en vivo en el mismo lote', async () => {
    await live(w.u.luis, [190]);
    await db.rpc(w.u.luis, 'leave_league', { p_league: w.priv });
    expect(await liveRows()).toEqual([]);
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.luis])).toEqual([{ user_id: null }]);
  });

  it('al enviar sus juegos, en el mismo lote sale de "en vivo" (tenga o no fila)', async () => {
    const send = () => db.rpc(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_event: w.e.e1, p_scores: [150] });
    await send();
    await live(w.u.luis, [190]);
    expect(await liveRows()).toHaveLength(1);
    await send();
    expect(await liveRows()).toEqual([]);
  });

  it('solo puntajes de 0 a 300 (o vacíos)', async () => {
    await live(w.u.luis, [0, null, 300]);
    expect(await liveRows()).toEqual([{ player_id: w.p.luis, state: { scores: [0, null, 300] } }]);
    await fails(live(w.u.luis, [301]), INVALID);
    await fails(live(w.u.luis, ['x'.repeat(1000)]), INVALID);
    await fails(live(w.u.luis, [190.5]), INVALID);
    // Los vacíos del final se quitan.
    await live(w.u.luis, [180, null, null]);
    expect((await liveRows())[0].state).toEqual({ scores: [180] });
  });

  it('en un torneo solo publica quien está inscrito', async () => {
    const t9 = await event(db, w.priv, 'torneo', '2026-09-22', 3, 'Copa');
    await fails(live(w.u.luis, [200], t9), DENIED);
    await entry(db, w.priv, t9, w.p.luis, [], []);
    await live(w.u.luis, [200], t9);
    expect(await liveRows(t9)).toHaveLength(1);
  });

  it('nadie publica por otro, ni sin jugador, ni en un evento que no existe', async () => {
    await fails(
      db.asUser(w.u.luis, `insert into public.live_states (event_id, subject_key, league_id, player_id, state) values ($1, $2, $3, $4, '{}')`, [
        w.e.e1,
        `p:${w.p.pedro}`,
        w.priv,
        w.p.pedro,
      ]),
      '42501',
    );
    await fails(db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e1, p_scores: [300], p_player: w.p.pedro }), '42883');
    await fails(live(w.u.ana, [300]), DENIED);
    await fails(live(w.u.luis, [190], randomUUID()), 'no_existe');
    await fails(live(w.u.luis, Array(11).fill(100)), INVALID);
    expect(await liveRows()).toEqual([]);
  });
});
