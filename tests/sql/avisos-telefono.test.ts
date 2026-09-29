/**
 * Avisos al teléfono (20260929000500_avisos_telefono.sql): preferencias por cuenta, private.queue_push, los push de
 * envíos aprobados o rechazados, felicitaciones, me gusta y comentarios (juntos por juego y uno cada 6 horas), el
 * resultado confirmado, los recordatorios de después del juego y de partidos sin resultado, el «¿Vas?» que ya no le
 * llega a quien marcó «voy», la cola de fotos por borrar, los archivos huérfanos y la alerta de espacio.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; luis juega e1, práctica del
 * 22 de septiembre, con [150]). Horas en Santo Domingo (UTC−4): 2026-10-06 es martes.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, MIGRATIONS_DIR, SERVICE, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';

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

type Json = Record<string, unknown>;

let phones = 0;
async function subscribe(...uids: string[]) {
  for (const uid of uids) {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
      uid,
      `https://fcm.googleapis.com/fcm/send/tel-${uid}-${phones++}`,
    ]);
  }
}

interface Push {
  user_id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl: number;
  urgency: string;
}

const pushes = (tag: string) =>
  db.admin<Push>('select user_id, title, body, url, tag, ttl, urgency from public.push_outbox where tag = $1 order by id', [tag]);
const pushesLike = (prefix: string) =>
  db.admin<Push>('select user_id, title, body, url, tag, ttl, urgency from public.push_outbox where tag like $1 order by id', [`${prefix}%`]);
/** Lo que recibió cada cuenta: { uid: [título, texto] }. */
const byUser = (rows: Push[]) => Object.fromEntries(rows.map((r) => [r.user_id, [r.title, r.body]]));
const markSent = () => db.admin('update public.push_outbox set sent_at = now() where sent_at is null');
const age = (hours: number) => db.admin(`update public.push_outbox set created_at = created_at - make_interval(hours => $1)`, [hours]);
const ageMinutes = (mins: number) => db.admin(`update public.push_outbox set created_at = created_at - make_interval(mins => $1)`, [mins]);
const prefs = (uid: string, p: Json) => db.rpc<Json>(uid, 'set_push_prefs', { p_prefs: p });
const block = (uid: string) => db.admin('update public.profiles set blocked_at = now() where id = $1', [uid]);
const queue = async (uid: string, category: string | null, title: string, tag: string, group: string | null = null) =>
  (
    await db.admin<{ ok: boolean }>(`select private.queue_push($1, $2, $3, 'Texto', '/x', $4, 60, $5) as ok`, [uid, category, title, tag, group])
  )[0].ok;

/** Liga de un deporte con dueño org y admin sofi; luis, ana y otra son miembros con jugador. pedro sin cuenta. */
async function club(sport: string, name: string) {
  const lid = await league(db, w.u.org, { name, visibility: 'private', sport, requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  await member(db, lid, w.u.otra, 'member', 'otra');
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    pedro: await player(db, lid, 'Pedro'),
  };
  return { lid, p };
}

const single = (n: 1 | 2, playerId: string) => ({ side: n, players: [{ player_id: playerId }] });
const SCORE = { text: '6-4 6-3', sides: [2, 0] };

async function oneMatch(lid: string, sides: unknown[], extra: Json = {}) {
  const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: lid, p_matches: [{ sides, ...extra }] });
  return id;
}

const submit = (uid: string, args: Json) => db.rpc<string>(uid, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, ...args });

describe('preferencias', () => {
  it('set_push_prefs cambia solo las que manda, devuelve las cuatro y la cuenta las lee en su perfil', async () => {
    expect(await db.asUser(w.u.luis, 'select push_prefs from public.profiles')).toEqual([{ push_prefs: {} }]);
    expect(await prefs(w.u.luis, { social: false })).toEqual({ resultados: true, social: false, recordatorios: true, liga: true });
    expect(await prefs(w.u.luis, { liga: false, social: true })).toEqual({ resultados: true, social: true, recordatorios: true, liga: false });
    expect(await db.asUser(w.u.luis, 'select push_prefs from public.profiles')).toEqual([{ push_prefs: { social: true, liga: false } }]);
    // Otra cuenta no las ve (el perfil es solo propio).
    expect(await db.asUser(w.u.ana, 'select push_prefs from public.profiles where id = $1', [w.u.luis])).toEqual([]);
  });

  it('solo las cuatro claves con true o false; sin cuenta no; una cuenta bloqueada no escribe', async () => {
    for (const bad of [{ otra: true }, { social: 'no' }, { social: null }, [], 'x']) {
      await fails(db.rpc(w.u.luis, 'set_push_prefs', { p_prefs: bad }), INVALID);
    }
    await fails(db.rpc(w.u.luis, 'set_push_prefs', { p_prefs: null }), INVALID);
    await fails(db.rpc(ANON, 'set_push_prefs', { p_prefs: { social: false } }), DENIED);
    await block(w.u.luis);
    await fails(prefs(w.u.luis, { social: false }), 'bloqueada');
  });

  it('el filtro de la cola apaga también los avisos de antes por su tag; lo que no tiene categoría sale siempre', async () => {
    await subscribe(w.u.luis, w.u.ana);
    await prefs(w.u.luis, { social: false, resultados: false, recordatorios: false, liga: false });
    expect(await db.admin(`select private.push_category(t) as c from unnest($1::text[]) t`, [
      ['envio:1', 'confirmar:1', 'resultado:1', 'reclamo:1', 'reaccion:1', 'comentario:1', 'seguir:1', 'recordatorio:1', 'partido:1',
       'despues:1', 'sinresultado:1', 'aviso:1', 'invitacion:1', 'invitacion-ok:1', 'claim:1', 'ronda:1', 'anuncio:1', 'espacio', null],
    ])).toEqual(
      ['resultados', 'resultados', 'resultados', 'resultados', 'social', 'social', 'social', 'recordatorios', 'recordatorios',
       'recordatorios', 'recordatorios', 'liga', 'liga', 'liga', null, null, null, null, null].map((c) => ({ c })),
    );
    // Seguir (follow_user encola directo): a luis no le llega.
    await db.rpc(w.u.ana, 'follow_user', { p_user: w.u.luis });
    expect(await pushesLike('seguir:')).toEqual([]);
    // Aviso de la liga: a ana sí, a luis no.
    expect(await db.rpc<number>(w.u.org, 'league_announce', { p_league: w.priv, p_body: 'El martes se juega a las 8' })).toBe(2);
    expect((await pushesLike('aviso:')).map((r) => r.user_id)).toEqual([w.u.ana]);
    // Lo que no tiene categoría entra igual.
    await db.admin(`insert into public.push_outbox (user_id, title, tag) values ($1, 'Reclamo', 'claim:x'), ($1, 'Seguir', 'seguir:x')`, [w.u.luis]);
    expect((await db.admin('select tag from public.push_outbox where user_id = $1', [w.u.luis])).map((r) => r.tag)).toEqual(['claim:x']);
    // Vuelve a activar lo social: el siguiente sí llega.
    await prefs(w.u.luis, { social: true });
    await db.rpc(w.u.sofi, 'follow_user', { p_user: w.u.luis });
    expect(byUser(await pushesLike('seguir:'))).toEqual({ [w.u.luis]: ['sofi te empezó a seguir', 'Toca para ver su perfil y sus juegos.'] });
  });

  it('las invitaciones a una liga (invite_to_league) y «aceptó tu invitación» son de «liga»: se apagan con ella, la invitación no', async () => {
    await subscribe(w.u.otra, w.u.extra, w.u.org);
    await prefs(w.u.otra, { liga: false });
    await prefs(w.u.org, { liga: false, social: true });
    // org (dueño de la privada) invita a otra (con «liga» apagada) y a extra: el push solo le llega a extra.
    const r = await db.rpc<{ sent: number }>(w.u.org, 'invite_to_league', { p_league: w.priv, p_users: [w.u.otra, w.u.extra] });
    expect(r.sent).toBe(2);
    expect(byUser(await pushesLike('invitacion:'))).toEqual({ [w.u.extra]: ['org te invitó a Liga del Banco', 'Toca para ver la invitación y unirte.'] });
    const invite = async (uid: string) =>
      (await db.asUser<{ id: string }>(uid, `select id from public.league_invites where user_id = $1 and status = 'pending'`, [uid]))[0].id;
    // La invitación de otra igual está (la ve en Avisos) y la acepta; a org, con «liga» apagada, no le llega «aceptó».
    expect(await db.rpc<Json>(w.u.otra, 'respond_league_invite', { p_invite: await invite(w.u.otra), p_accept: true })).toMatchObject({
      status: 'accepted',
      leagueId: w.priv,
    });
    expect(await pushesLike('invitacion-ok:')).toEqual([]);
    // org la vuelve a prender: cuando extra acepta, sí le llega.
    await prefs(w.u.org, { liga: true });
    expect(await db.rpc<Json>(w.u.extra, 'respond_league_invite', { p_invite: await invite(w.u.extra), p_accept: true })).toMatchObject({
      status: 'accepted',
    });
    expect(byUser(await pushesLike('invitacion-ok:'))).toEqual({ [w.u.org]: ['extra aceptó tu invitación', 'Ya está en Liga del Banco.'] });
  });
});

describe('queue_push', () => {
  it('sin teléfonos, bloqueada o con la categoría apagada no encola; sin categoría no mira las preferencias', async () => {
    expect(await queue(w.u.luis, 'social', 'Hola', 'prueba:1')).toBe(false);
    await subscribe(w.u.luis, w.u.luis);
    expect(await queue(w.u.luis, 'social', 'Hola', 'prueba:1')).toBe(true);
    // Una fila por teléfono, urgencia normal y el ttl que se pidió.
    expect(await pushes('prueba:1')).toEqual([
      { user_id: w.u.luis, title: 'Hola', body: 'Texto', url: '/x', tag: 'prueba:1', ttl: 60, urgency: 'normal' },
      { user_id: w.u.luis, title: 'Hola', body: 'Texto', url: '/x', tag: 'prueba:1', ttl: 60, urgency: 'normal' },
    ]);
    await prefs(w.u.luis, { social: false });
    expect(await queue(w.u.luis, 'social', 'Hola', 'prueba:2')).toBe(false);
    expect(await queue(w.u.luis, null, 'Hola', 'prueba:3')).toBe(true);
    await block(w.u.luis);
    expect(await queue(w.u.luis, null, 'Hola', 'prueba:4')).toBe(false);
    expect(await queue(w.u.luis, null, '  ', 'prueba:5')).toBe(false);
    expect(await pushesLike('prueba:')).toHaveLength(4);
  });

  it('no repite un tag que sigue esperando; con título de grupo le cambia el texto; ya mandado, encola otro', async () => {
    await subscribe(w.u.luis);
    expect(await queue(w.u.luis, 'social', 'Uno', 'grupo:1')).toBe(true);
    expect(await queue(w.u.luis, 'social', 'Dos', 'grupo:1')).toBe(false);
    expect(await queue(w.u.luis, 'social', 'Tres', 'grupo:1', 'Uno y 1 más')).toBe(true);
    expect((await pushes('grupo:1')).map((r) => r.title)).toEqual(['Uno y 1 más']);
    // Tomado por send-push (en camino): ni se cambia ni se repite.
    await db.admin(`update public.push_outbox set claimed_at = now(), attempts = 1`);
    expect(await queue(w.u.luis, 'social', 'Cuatro', 'grupo:1', 'Uno y 2 más')).toBe(false);
    await markSent();
    expect(await queue(w.u.luis, 'social', 'Cinco', 'grupo:1', 'Uno y 3 más')).toBe(true);
    expect((await pushes('grupo:1')).map((r) => r.title)).toEqual(['Uno y 1 más', 'Cinco']);
  });

  it('nunca falla: si la cola se rompe, solo avisa y devuelve false', async () => {
    await subscribe(w.u.luis);
    await db.admin(`create function public.mm_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
    await db.admin(`create trigger mm_boom before insert on public.push_outbox for each row when (new.tag like 'boom%') execute function public.mm_boom()`);
    expect(await queue(w.u.luis, null, 'Hola', 'boom:1')).toBe(false);
    expect(await pushesLike('boom')).toEqual([]);
  });
});

describe('envíos del boliche', () => {
  it('aprobado: «Aprobaron tus juegos: serie de 550 en <liga>» a la cuenta del jugador, nunca a quien aprueba', async () => {
    await subscribe(w.u.luis, w.u.org, w.u.sofi);
    const id = await submit(w.u.luis, { p_scores: [180, 200, 170], p_event: w.e.e1 });
    expect(await pushes(`envio:${id}`)).toEqual([]);
    await db.rpc(w.u.org, 'approve_submission', { p_submission: id, p_values: { 0: 180, 1: 200, 2: 170 } });
    expect(await pushes(`envio:${id}`)).toEqual([
      {
        user_id: w.u.luis,
        title: 'Aprobaron tus juegos: serie de 550 en Liga del Banco',
        body: 'Práctica del 22 de septiembre.',
        url: `/l/${w.priv}/e/${w.e.e1}`,
        tag: `envio:${id}`,
        ttl: 172800,
        urgency: 'normal',
      },
    ]);
  });

  it('un solo juego por fecha: «Aprobaron tu juego de 210…» con el link a la práctica que se crea', async () => {
    await subscribe(w.u.luis);
    const id = await submit(w.u.luis, { p_scores: [210], p_date: '2026-09-25' });
    const r = await db.rpc<{ event_id: string }>(w.u.org, 'approve_submission', { p_submission: id, p_values: { 0: 210 } });
    expect(await pushes(`envio:${id}`)).toMatchObject([
      { user_id: w.u.luis, title: 'Aprobaron tu juego de 210 en Liga del Banco', body: 'Práctica del 25 de septiembre.', url: `/l/${w.priv}/e/${r.event_id}` },
    ]);
  });

  it('con foto: los pinos que quedaron aprobados (el admin los corrigió), no los enviados', async () => {
    await subscribe(w.u.luis);
    const photo = randomUUID();
    const id = await submit(w.u.luis, { p_scores: [180], p_event: w.e.e1, p_photo: { id: photo, width: 10, height: 10, bytes: 1000 } });
    await db.rpc(w.u.org, 'approve_submission', { p_submission: id, p_values: { 0: 190 } });
    expect((await pushes(`envio:${id}`)).map((r) => r.title)).toEqual(['Aprobaron tu juego de 190 en Liga del Banco']);
  });

  it('enviado por otra cuenta: le llega también a quien lo envió, con el nombre del jugador; a quien revisa, nunca', async () => {
    await subscribe(w.u.luis, w.u.org, w.u.sofi);
    const id = await submit(w.u.sofi, { p_scores: [180, 200], p_event: w.e.e1, p_player: w.p.luis });
    await db.rpc(w.u.org, 'approve_submission', { p_submission: id, p_values: { 0: 180, 1: 200 } });
    expect(byUser(await pushes(`envio:${id}`))).toEqual({
      [w.u.luis]: ['Aprobaron tus juegos: serie de 380 en Liga del Banco', 'Práctica del 22 de septiembre.'],
      [w.u.sofi]: ['Aprobaron los juegos de Luis: serie de 380 en Liga del Banco', 'Práctica del 22 de septiembre.'],
    });
    // La misma admin que lo envió lo aprueba: solo al jugador.
    const other = await submit(w.u.sofi, { p_scores: [150], p_date: '2026-09-26', p_player: w.p.luis });
    await db.rpc(w.u.sofi, 'approve_submission', { p_submission: other, p_values: { 0: 150 } });
    expect((await pushes(`envio:${other}`)).map((r) => r.user_id)).toEqual([w.u.luis]);
    // Quien lo envió se salió de la liga: ya no recibe; el jugador sí.
    const third = await submit(w.u.sofi, { p_scores: [160], p_date: '2026-09-27', p_player: w.p.luis });
    await db.admin('delete from public.league_members where league_id = $1 and user_id = $2', [w.priv, w.u.sofi]);
    await db.rpc(w.u.org, 'reject_submission', { p_submission: third, p_note: 'Otra fecha' });
    expect((await pushes(`envio:${third}`)).map((r) => r.user_id)).toEqual([w.u.luis]);
  });

  it('rechazado: «No aprobaron tus juegos del 22 de septiembre» con la nota; sin nota, qué hacer', async () => {
    await subscribe(w.u.luis);
    const id = await submit(w.u.luis, { p_scores: [150, 160], p_event: w.e.e1 });
    await db.rpc(w.u.sofi, 'reject_submission', { p_submission: id, p_note: ' Foto borrosa ' });
    expect(await pushes(`envio:${id}`)).toMatchObject([
      { user_id: w.u.luis, title: 'No aprobaron tus juegos del 22 de septiembre', body: 'Liga del Banco. Motivo: «Foto borrosa»', url: `/l/${w.priv}/e/${w.e.e1}` },
    ]);
    const one = await submit(w.u.luis, { p_scores: [150], p_date: '2026-09-25' });
    await db.rpc(w.u.sofi, 'reject_submission', { p_submission: one });
    expect(await pushes(`envio:${one}`)).toMatchObject([
      {
        title: 'No aprobaron tu juego del 25 de septiembre',
        body: 'Liga del Banco. Si crees que es un error, habla con el admin.',
        url: `/l/${w.priv}`,
      },
    ]);
  });

  it('bloqueada o con «resultados» apagado no recibe; el SQL sin sesión (importación) no avisa; si el push falla, se aprueba igual', async () => {
    await subscribe(w.u.luis, w.u.sofi);
    const a = await submit(w.u.sofi, { p_scores: [180], p_event: w.e.e1, p_player: w.p.luis });
    await prefs(w.u.luis, { resultados: false });
    await db.rpc(w.u.org, 'approve_submission', { p_submission: a, p_values: { 0: 180 } });
    expect((await pushes(`envio:${a}`)).map((r) => r.user_id)).toEqual([w.u.sofi]);

    await prefs(w.u.luis, { resultados: true });
    const b = await submit(w.u.luis, { p_scores: [180], p_date: '2026-09-25' });
    await block(w.u.luis);
    await db.rpc(w.u.org, 'reject_submission', { p_submission: b });
    expect(await pushes(`envio:${b}`)).toEqual([]);

    await db.admin('update public.profiles set blocked_at = null where id = $1', [w.u.luis]);
    const c = await submit(w.u.luis, { p_scores: [180], p_date: '2026-09-26' });
    await db.admin(`update public.submissions set status = 'aprobado' where id = $1`, [c]);
    expect(await pushes(`envio:${c}`)).toEqual([]);

    await db.admin(`create function public.mm_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
    await db.admin(`create trigger mm_boom before insert on public.push_outbox for each row when (new.tag like 'envio:%') execute function public.mm_boom()`);
    const d = await submit(w.u.luis, { p_scores: [180], p_date: '2026-09-27' });
    await db.rpc(w.u.org, 'approve_submission', { p_submission: d, p_values: { 0: 180 } });
    expect(await db.admin('select status from public.submissions where id = $1', [d])).toEqual([{ status: 'aprobado' }]);
    expect(await pushes(`envio:${d}`)).toEqual([]);
  });
});

describe('felicitaciones, me gusta y comentarios del boliche', () => {
  const tag = () => `reaccion:${w.e1Luis}`;
  const react = (uid: string, type: string | null) => db.rpc(uid, 'set_reaction', { p_entry: w.e1Luis, p_type: type });

  it('«ana te felicitó por tu juego de 150»; mientras espera se junta («sofi y 1 más reaccionaron…»)', async () => {
    await subscribe(w.u.luis);
    await react(w.u.ana, 'felicitar');
    expect(await pushes(tag())).toEqual([
      {
        user_id: w.u.luis,
        title: 'ana te felicitó por tu juego de 150',
        body: 'Práctica del 22 de septiembre · Liga del Banco',
        url: `/l/${w.priv}/juegos?juego=${w.e1Luis}`,
        tag: tag(),
        ttl: 86400,
        urgency: 'normal',
      },
    ]);
    await react(w.u.sofi, 'like');
    expect((await pushes(tag())).map((r) => r.title)).toEqual(['sofi y 1 más reaccionaron a tu juego de 150']);
    await react(w.u.org, 'felicitar');
    expect((await pushes(tag())).map((r) => r.title)).toEqual(['org y 2 más reaccionaron a tu juego de 150']);
  });

  it('solo me gusta: «A ana le gustó tu juego» y «A sofi y 1 más les gustó tu juego»; solo felicitaciones, «te felicitaron»', async () => {
    await subscribe(w.u.luis);
    await db.rpc(w.u.ana, 'set_game_like', { p_kind: 'bowling', p_id: w.e1Luis, p_liked: true });
    expect((await pushes(tag())).map((r) => r.title)).toEqual(['A ana le gustó tu juego']);
    await react(w.u.sofi, 'like');
    expect((await pushes(tag())).map((r) => r.title)).toEqual(['A sofi y 1 más les gustó tu juego']);

    // Otra participación, con serie: todos felicitan.
    const e2 = await event(db, w.priv, 'torneo', '2026-10-01', 3, 'Copa Octubre');
    const x = await entry(db, w.priv, e2, w.p.luis, [150, 160, 170], ['sin-foto', 'sin-foto', 'sin-foto']);
    await db.rpc(w.u.ana, 'set_reaction', { p_entry: x, p_type: 'felicitar' });
    await db.rpc(w.u.sofi, 'set_reaction', { p_entry: x, p_type: 'felicitar' });
    expect(await pushes(`reaccion:${x}`)).toMatchObject([
      { title: 'sofi y 1 más te felicitaron por tu serie de 480', body: 'Copa Octubre del 1 de octubre · Liga del Banco' },
    ]);
  });

  it('ya mandado: el siguiente sale después de 6 horas; cambiar a felicitar también cuenta', async () => {
    await subscribe(w.u.luis);
    await react(w.u.ana, 'like');
    await markSent();
    await react(w.u.sofi, 'like');
    expect(await pushes(tag())).toHaveLength(1);
    await age(5);
    await react(w.u.org, 'like');
    expect(await pushes(tag())).toHaveLength(1);
    await age(2);
    await react(w.u.ana, 'felicitar');
    expect((await pushes(tag())).map((r) => r.title)).toEqual(['A ana le gustó tu juego', 'ana y 2 más reaccionaron a tu juego de 150']);
    // La misma reacción otra vez (set_reaction la vuelve a guardar) no avisa.
    await markSent();
    await age(7);
    await react(w.u.ana, 'felicitar');
    expect(await pushes(tag())).toHaveLength(2);
  });

  it('nunca a uno mismo; bloqueada o con «social» apagado, nada; sin sesión (importación), nada', async () => {
    await subscribe(w.u.luis);
    await react(w.u.luis, 'felicitar');
    expect(await pushes(tag())).toEqual([]);
    await prefs(w.u.luis, { social: false });
    await react(w.u.ana, 'felicitar');
    expect(await pushes(tag())).toEqual([]);
    await prefs(w.u.luis, { social: true });
    await block(w.u.luis);
    await react(w.u.sofi, 'like');
    expect(await pushes(tag())).toEqual([]);
    await db.admin('update public.profiles set blocked_at = null where id = $1', [w.u.luis]);
    await db.admin(
      `insert into public.reactions (league_id, entry_id, event_id, player_id, user_id, author_name, type) values ($1, $2, $3, $4, $5, 'org', 'like')`,
      [w.priv, w.e1Luis, w.e.e1, w.p.luis, w.u.org],
    );
    expect(await pushes(tag())).toEqual([]);
  });

  it('comentario: «ana comentó tu juego: «…»» con los primeros 80; si espera, sale el último; el propio no; uno cada 30 minutos', async () => {
    await subscribe(w.u.luis);
    const text = 'Qué juegazo, de verdad que ese último cuadro estuvo increíble; sigue así que vas directo para el campeonato';
    await db.rpc(w.u.ana, 'add_comment', { p_entry: w.e1Luis, p_text: text });
    expect(await pushes(`comentario:${w.e1Luis}`)).toEqual([
      {
        user_id: w.u.luis,
        title: `ana comentó tu juego: «${text.slice(0, 80).trimEnd()}…»`,
        body: 'Práctica del 22 de septiembre · Liga del Banco',
        url: `/l/${w.priv}/juegos?juego=${w.e1Luis}`,
        tag: `comentario:${w.e1Luis}`,
        ttl: 86400,
        urgency: 'normal',
      },
    ]);
    await db.rpc(w.u.sofi, 'add_comment', { p_entry: w.e1Luis, p_text: '  Buen   juego ' });
    await db.rpc(w.u.luis, 'add_comment', { p_entry: w.e1Luis, p_text: 'Gracias' });
    expect((await pushes(`comentario:${w.e1Luis}`)).map((r) => r.title)).toEqual(['sofi comentó tu juego: «Buen juego»']);
    // Ya salió: lo que se comenta en los próximos 30 minutos no suena otra vez (se ve en la app).
    await markSent();
    const unpace = () => db.admin('delete from private.paces'); // add_comment deja comentar cada 3 s
    await db.rpc(w.u.org, 'add_comment', { p_entry: w.e1Luis, p_text: 'Felicidades' });
    await unpace();
    await db.rpc(w.u.ana, 'add_comment', { p_entry: w.e1Luis, p_text: 'Otra vez' });
    await ageMinutes(25);
    await unpace();
    await db.rpc(w.u.sofi, 'add_comment', { p_entry: w.e1Luis, p_text: 'Y otra' });
    expect((await pushes(`comentario:${w.e1Luis}`)).map((r) => r.title)).toEqual(['sofi comentó tu juego: «Buen juego»']);
    await ageMinutes(6);
    await unpace();
    await db.rpc(w.u.org, 'add_comment', { p_entry: w.e1Luis, p_text: 'Felicidades' });
    await unpace();
    await db.rpc(w.u.ana, 'add_comment', { p_entry: w.e1Luis, p_text: 'Qué bien' });
    expect((await pushes(`comentario:${w.e1Luis}`)).map((r) => r.title)).toEqual(['sofi comentó tu juego: «Buen juego»', 'ana comentó tu juego: «Qué bien»']);
  });
});

describe('me gusta en partidos y golf', () => {
  it('partido: «A ana le gustó tu partido», juntos por juego; nunca por el propio', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana);
    const id = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)]);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    const like = (uid: string, pid: string) => db.rpc(uid, 'set_game_like', { p_kind: 'match', p_id: id, p_liked: true, p_player: pid });
    await like(w.u.ana, c.p.luis);
    const tag = `reaccion:${id}:${c.p.luis}`;
    expect(await pushes(tag)).toEqual([
      { user_id: w.u.luis, title: 'A ana le gustó tu partido', body: 'Tenis Club', url: `/l/${c.lid}/juegos?partido=${id}`, tag, ttl: 86400, urgency: 'normal' },
    ]);
    await like(w.u.otra, c.p.luis);
    expect((await pushes(tag)).map((r) => r.title)).toEqual(['A otra y 1 más les gustó tu partido']);
    // Luis le da me gusta a su propio juego y al de ana: a él no le llega nada; a ana sí.
    await like(w.u.luis, c.p.luis);
    await like(w.u.luis, c.p.ana);
    expect((await pushes(tag)).map((r) => r.title)).toEqual(['A otra y 1 más les gustó tu partido']);
    expect(byUser(await pushes(`reaccion:${id}:${c.p.ana}`))).toEqual({ [w.u.ana]: ['A luis le gustó tu partido', 'Tenis Club'] });
  });

  it('golf: «A otra le gustó tu ronda» con el link a la ronda', async () => {
    const golf = await league(db, w.u.otro, { name: 'Golf Abierto', visibility: 'public', sport: 'golf', requirePhoto: false });
    await member(db, golf, w.u.otro, 'owner', 'otro');
    await member(db, golf, w.u.luis, 'member', 'luis');
    await player(db, golf, 'Luis', w.u.luis);
    const holes = Array.from({ length: 18 }, (_, i) => ({ par: i % 3 === 0 ? 5 : 4, si: i + 1 }));
    const course = await db.rpc<string>(w.u.otro, 'golf_save_course', {
      p_league: golf,
      p_name: 'Campo',
      p_holes: holes,
      p_tees: [{ id: 'azul', name: 'Azul', rating: 72, slope: 125, par: holes.reduce((a, h) => a + h.par, 0) }],
    });
    const round = await db.rpc<string>(w.u.otro, 'golf_create_round', { p_league: golf, p_date: '2026-09-26', p_course: course });
    const card = await db.rpc<string>(w.u.luis, 'golf_register', { p_event: round, p_tee: 'azul' });
    await db.rpc(w.u.luis, 'golf_save_hole_scores', {
      p_op_id: randomUUID(),
      p_event: round,
      p_cards: [{ card_id: card, holes: holes.map((h, i) => ({ i, s: h.par })) }],
    });
    await subscribe(w.u.luis);
    await db.rpc(w.u.otra, 'set_game_like', { p_kind: 'golf', p_id: card, p_liked: true });
    expect(await pushes(`reaccion:${card}`)).toMatchObject([
      { user_id: w.u.luis, title: 'A otra le gustó tu ronda', body: 'Golf Abierto', url: `/l/${golf}/e/${round}` },
    ]);
  });
});

describe('partidos: «Confirmaron el resultado»', () => {
  it('al lado que lo propuso cuando el rival confirma; nunca a quien confirma', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana, w.u.sofi);
    const id = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)]);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    // Proponer ya avisaba al rival («Tienes un resultado por confirmar»).
    expect((await pushes(`confirmar:${id}`)).map((r) => r.user_id)).toEqual([w.u.ana]);
    expect(await pushes(`resultado:${id}`)).toEqual([]);
    await db.rpc(w.u.ana, 'confirm_result', { p_match: id });
    expect(await pushes(`resultado:${id}`)).toEqual([
      {
        user_id: w.u.luis,
        title: 'Confirmaron el resultado',
        body: 'Luis contra Ana: 6-4 6-3. Ya cuenta en la tabla.',
        url: `/l/${c.lid}/juegos?partido=${id}`,
        tag: `resultado:${id}`,
        ttl: 172800,
        urgency: 'normal',
      },
    ]);
  });

  it('el organizador resuelve el reclamo: a quien lo anotó; si lo anota el admin (queda confirmado), a nadie', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana, w.u.sofi);
    const id = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)]);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await db.rpc(w.u.ana, 'dispute_result', { p_match: id, p_note: 'Fue al revés' });
    await db.rpc(w.u.sofi, 'resolve_dispute', { p_match: id });
    expect(byUser(await pushes(`resultado:${id}`))).toEqual({
      [w.u.luis]: ['Confirmaron el resultado', 'Luis contra Ana: 6-4 6-3. El organizador resolvió el reclamo.'],
    });
    const other = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)]);
    await db.rpc(w.u.sofi, 'finish_match', { p_match: other, p_score: SCORE, p_winner: 1 });
    expect(await db.admin('select status from public.matches where id = $1', [other])).toEqual([{ status: 'confirmed' }]);
    expect(await pushes(`resultado:${other}`)).toEqual([]);
  });

  it('dobles: a los dos del lado que lo anotó; con «resultados» apagado, nada (tampoco el «por confirmar» de antes)', async () => {
    const c = await club('padel', 'Pádel Club');
    await subscribe(w.u.luis, w.u.ana, w.u.otra);
    const pair = (n: 1 | 2, ...ids: string[]) => ({ side: n, players: ids.map((player_id) => ({ player_id })) });
    const id = await oneMatch(c.lid, [pair(1, c.p.luis, c.p.otra), pair(2, c.p.ana, c.p.pedro)], { format: 'sets' });
    await db.rpc(w.u.otra, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await db.rpc(w.u.ana, 'confirm_result', { p_match: id });
    expect(Object.keys(byUser(await pushes(`resultado:${id}`))).sort()).toEqual([w.u.luis, w.u.otra].sort());
    expect((await pushes(`resultado:${id}`))[0].body).toBe('Luis / Otra contra Ana / Pedro: 6-4 6-3. Ya cuenta en la tabla.');

    await prefs(w.u.ana, { resultados: false });
    await prefs(w.u.luis, { resultados: false });
    const other = await oneMatch(c.lid, [pair(1, c.p.luis, c.p.otra), pair(2, c.p.ana, c.p.pedro)], { format: 'sets' });
    await db.rpc(w.u.otra, 'finish_match', { p_match: other, p_score: SCORE, p_winner: 1 });
    expect(await pushes(`confirmar:${other}`)).toEqual([]);
    await db.rpc(w.u.ana, 'confirm_result', { p_match: other });
    expect((await pushes(`resultado:${other}`)).map((r) => r.user_id)).toEqual([w.u.otra]);
  });

  it('quien lo anotó y se salió de la liga ya no recibe; su pareja sí', async () => {
    const c = await club('padel', 'Pádel Club');
    await subscribe(w.u.luis, w.u.ana, w.u.otra);
    const pair = (n: 1 | 2, ...ids: string[]) => ({ side: n, players: ids.map((player_id) => ({ player_id })) });
    const id = await oneMatch(c.lid, [pair(1, c.p.luis, c.p.otra), pair(2, c.p.ana, c.p.pedro)], { format: 'sets' });
    await db.rpc(w.u.otra, 'finish_match', { p_match: id, p_score: SCORE, p_winner: 1 });
    await db.admin('delete from public.league_members where league_id = $1 and user_id = $2', [c.lid, w.u.otra]);
    await db.rpc(w.u.ana, 'confirm_result', { p_match: id });
    expect((await pushes(`resultado:${id}`)).map((r) => r.user_id)).toEqual([w.u.luis]);
  });
});

describe('recordatorio del día después: «¿Cómo te fue anoche?»', () => {
  const after = async (now: string) => (await db.admin<{ n: number }>('select private.remind_after_bowling($1) as n', [now]))[0].n;

  it('a quien marcó «voy» ayer y no tiene juegos ni envíos de ese evento o esa fecha; una vez', async () => {
    const e = await event(db, w.priv, 'practica', '2026-10-06');
    const pAna = await player(db, w.priv, 'Ana', w.u.ana);
    const pSofi = await player(db, w.priv, 'Sofi', w.u.sofi);
    const pOrg = await player(db, w.priv, 'Org', w.u.org);
    await subscribe(w.u.luis, w.u.ana, w.u.sofi, w.u.org);
    // Luis: voy y participación sin ningún juego. Ana: voy y un juego. Sofi: voy y un envío por fecha. Org: voy y un
    // envío del evento. Pedro (sin cuenta): voy.
    await entry(db, w.priv, e, w.p.luis, [null, null, null], [null, null, null]);
    await entry(db, w.priv, e, pAna, [180, null, null], [null, null, null]);
    for (const pid of [w.p.luis, pAna, pSofi, pOrg, w.p.pedro]) {
      await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)', [e, pid, w.priv]);
    }
    await submit(w.u.sofi, { p_scores: [150], p_date: '2026-10-06' });
    await submit(w.u.org, { p_scores: [150], p_event: e });

    // El martes a las 11:59 pm todavía es el mismo día.
    expect(await after('2026-10-07T03:59:00Z')).toBe(0);
    expect(await after('2026-10-07T13:00:00Z')).toBe(1);
    const tag = `despues:${e}:${w.p.luis}`;
    expect(await pushes(tag)).toEqual([
      {
        user_id: w.u.luis,
        title: '¿Cómo te fue anoche? Sube tus juegos de Liga del Banco',
        body: 'Anótalos o sube la foto del marcador para que cuenten en tu promedio.',
        url: `/l/${w.priv}/e/${e}?anotar=1`,
        tag,
        ttl: 43200,
        urgency: 'normal',
      },
    ]);
    expect(await pushesLike('despues:')).toHaveLength(1);
    // Otra corrida el mismo día (o con el aviso ya mandado): nada nuevo.
    await markSent();
    expect(await after('2026-10-07T20:00:00Z')).toBe(0);
    expect(await after('2026-10-08T13:00:00Z')).toBe(0);
    expect(await pushesLike('despues:')).toHaveLength(1);
    // Fuera del lote otra vez.
    expect(await db.admin(`select current_setting('mm.push_batch', true) as b`)).toEqual([{ b: '' }]);
  });

  it('«no voy» o la categoría apagada: nada (y no se repite al activarla); las marcas viejas se borran', async () => {
    const e = await event(db, w.priv, 'practica', '2026-10-06');
    await subscribe(w.u.luis);
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id, going) values ($1, $2, $3, false)', [e, w.p.luis, w.priv]);
    expect(await after('2026-10-07T13:00:00Z')).toBe(0);
    await db.admin('update public.event_rsvps set going = true');
    await prefs(w.u.luis, { recordatorios: false });
    expect(await after('2026-10-07T13:00:00Z')).toBe(0);
    await prefs(w.u.luis, { recordatorios: true });
    expect(await after('2026-10-07T14:00:00Z')).toBe(0);
    expect(await pushesLike('despues:')).toEqual([]);
    // Las marcas viejas se borran.
    await db.admin(`insert into private.push_once (key, sent_at) values ('despues:viejo', '2026-08-01T00:00:00Z')`);
    await after('2026-10-07T15:00:00Z');
    expect(await db.count('private.push_once', `key = 'despues:viejo'`)).toBe(0);
  });
});

describe('partidos sin resultado: «¿Cómo quedó A vs B?»', () => {
  const missing = async (now: string) => (await db.admin<{ n: number }>('select private.remind_missing_results($1) as n', [now]))[0].n;

  it('3 horas después de empezar, a los jugadores y al anotador; una vez; con resultado, viejo o en vivo, no', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana, w.u.otra, w.u.sofi, w.u.org);
    // Miércoles 7 de octubre, 2:00 pm en Santo Domingo.
    const at = '2026-10-07T18:00:00Z';
    const m1 = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)], { scheduled_at: at });
    const done = await oneMatch(c.lid, [single(1, c.p.otra), single(2, c.p.pedro)], { scheduled_at: at });
    await db.rpc(w.u.otra, 'finish_match', { p_match: done, p_score: SCORE, p_winner: 1 });
    await oneMatch(c.lid, [single(1, c.p.otra), single(2, c.p.ana)], { scheduled_at: '2026-10-03T18:00:00Z' });
    const live = await oneMatch(c.lid, [single(1, c.p.otra), single(2, c.p.luis)], { scheduled_at: at });
    await db.admin(`update public.matches set status = 'live', scorer_id = $2, lease_until = '2026-10-07T22:30:00Z' where id = $1`, [live, w.u.org]);
    await db.admin('update public.matches set scorer_id = $2 where id = $1', [m1, w.u.sofi]);

    expect(await missing('2026-10-07T20:59:00Z')).toBe(0);
    expect(await missing('2026-10-07T21:00:00Z')).toBe(1);
    const tag = `sinresultado:${m1}`;
    const rows = await pushes(tag);
    expect(byUser(rows)).toEqual(
      Object.fromEntries([w.u.luis, w.u.ana, w.u.sofi].map((u) => [u, ['¿Cómo quedó Luis vs Ana?', 'Tenis Club. Anota el resultado en la app.']])),
    );
    expect(rows[0]).toMatchObject({ url: `/l/${c.lid}/juegos?partido=${m1}`, ttl: 43200, urgency: 'normal' });
    expect(await missing('2026-10-07T22:00:00Z')).toBe(0);
    // El anotador en vivo dejó de publicar: ahora sí (a los dos jugadores y al anotador).
    expect(await missing('2026-10-07T23:00:00Z')).toBe(1);
    expect(Object.keys(byUser(await pushes(`sinresultado:${live}`))).sort()).toEqual([w.u.luis, w.u.otra, w.u.org].sort());
    expect(await pushesLike('sinresultado:')).toHaveLength(6);
  });

  it('equipos: a capitán y delegado, no a toda la plantilla', async () => {
    const c = await club('basketball', 'Basket RD');
    await subscribe(w.u.luis, w.u.ana, w.u.otra);
    const t1 = await db.rpc<string>(w.u.sofi, 'create_season_team', {
      p_league: c.lid,
      p_name: 'Tigres',
      p_players: [{ player_id: c.p.luis, role: 'captain' }, { player_id: c.p.ana }],
    });
    const t2 = await db.rpc<string>(w.u.sofi, 'create_season_team', {
      p_league: c.lid,
      p_name: 'Leones',
      p_players: [{ player_id: c.p.otra, role: 'delegate' }, { player_id: c.p.pedro }],
    });
    const id = await oneMatch(c.lid, [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }], { scheduled_at: '2026-10-07T18:00:00Z' });
    expect(await missing('2026-10-07T21:30:00Z')).toBe(1);
    expect(byUser(await pushes(`sinresultado:${id}`))).toEqual({
      [w.u.luis]: ['¿Cómo quedó Tigres vs Leones?', 'Basket RD. Anota el resultado en la app.'],
      [w.u.otra]: ['¿Cómo quedó Tigres vs Leones?', 'Basket RD. Anota el resultado en la app.'],
    });
  });

  it('de noche (10:00 pm a 8:00 am en la hora de la liga) no avisa ni deja la marca: el de las 9:00 pm sale a las 8', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana);
    // Miércoles 7 de octubre, 9:00 pm en Santo Domingo.
    const id = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)], { scheduled_at: '2026-10-08T01:00:00Z' });
    expect(await missing('2026-10-08T04:17:00Z')).toBe(0); // 12:17 am
    expect(await missing('2026-10-08T11:17:00Z')).toBe(0); // 7:17 am
    expect(await db.count('private.push_once', 'key = $1', [`sinresultado:${id}`])).toBe(0);
    expect(await pushesLike('sinresultado:')).toEqual([]);
    expect(await missing('2026-10-08T12:17:00Z')).toBe(1); // 8:17 am
    expect(Object.keys(byUser(await pushes(`sinresultado:${id}`))).sort()).toEqual([w.u.luis, w.u.ana].sort());
    // Una liga en otra zona cuenta con su hora (Madrid, UTC+2).
    await db.admin(`update public.leagues set tz = 'Europe/Madrid' where id = $1`, [c.lid]);
    const madrid = await oneMatch(c.lid, [single(1, c.p.luis), single(2, c.p.ana)], { scheduled_at: '2026-10-08T15:00:00Z' });
    expect(await missing('2026-10-08T21:17:00Z')).toBe(0); // 11:17 pm en Madrid (5:17 pm en Santo Domingo)
    expect(await missing('2026-10-09T07:17:00Z')).toBe(1); // 9:17 am en Madrid (3:17 am en Santo Domingo)
    expect(await pushes(`sinresultado:${madrid}`)).toHaveLength(2);
  });
});

describe('el «¿Vas?» del día antes', () => {
  it('ya no le llega a quien marcó «voy»; los del mismo día sí, a todos', async () => {
    const e = await event(db, w.priv, 'practica', '2026-10-06');
    await subscribe(w.u.org, w.u.sofi, w.u.luis, w.u.ana);
    await db.rpc(w.u.luis, 'set_rsvp', { p_event: e, p_going: true });
    // Lunes 12:05 pm en Santo Domingo.
    expect(await db.admin('select private.enqueue_due_reminders($1) as n', ['2026-10-05T16:05:00Z'])).toEqual([{ n: 1 }]);
    const before = await pushes(`recordatorio:${e}`);
    expect(before.map((r) => r.user_id).sort()).toEqual([w.u.org, w.u.sofi, w.u.ana].sort());
    expect(before[0]).toMatchObject({ title: 'Recuerda: mañana es la práctica', body: 'Liga del Banco · martes a las 7:00 pm. ¿Vas? Confírmalo en la app.' });
    await db.admin('delete from public.push_outbox');
    // Martes 12:05 pm: el del mismo día, también a luis.
    expect(await db.admin('select private.enqueue_due_reminders($1) as n', ['2026-10-06T16:05:00Z'])).toEqual([{ n: 1 }]);
    const today = await pushes(`recordatorio:${e}`);
    expect(today.map((r) => r.user_id).sort()).toEqual([w.u.org, w.u.sofi, w.u.luis, w.u.ana].sort());
    expect(today[0].title).toBe('Hoy es la práctica');
    // Con «recordatorios» apagado, nada.
    await db.admin('delete from public.push_outbox');
    await prefs(w.u.ana, { recordatorios: false });
    expect(await db.admin('select private.enqueue_due_reminders($1) as n', ['2026-10-06T22:30:00Z'])).toEqual([{ n: 1 }]);
    expect((await pushes(`recordatorio:${e}`)).map((r) => r.user_id).sort()).toEqual([w.u.org, w.u.sofi, w.u.luis].sort());
  });
});

describe('fotos: cola de borrado y archivos huérfanos (purge-photos)', () => {
  const bucket = () => db.admin(`insert into storage.buckets (id, name) values ('scoreboards', 'scoreboards') on conflict do nothing`);
  const photoRow = async (eid: string) => {
    const id = randomUUID();
    await db.admin(`insert into public.photos (id, league_id, event_id, path) values ($1, $2, $3, $4)`, [id, w.priv, eid, `${w.priv}/${id}.webp`]);
    return `${w.priv}/${id}.webp`;
  };
  const take = (limit = 500) => db.as<{ path: string }>(SERVICE, 'select path from public.purge_queue_take($1) order by path', [limit]);

  it('purge_queue_take aparta las rutas 10 minutos; purge_queue_done las saca de la cola', async () => {
    const a = await photoRow(w.e.e1);
    const b = await photoRow(w.e.e1);
    // Borrar el evento borra sus fotos (cascada) y sus archivos van a la cola.
    await db.rpc(w.u.org, 'delete_event', { p_event: w.e.e1 });
    expect((await take()).map((r) => r.path)).toEqual([a, b].sort());
    expect(await take()).toEqual([]);
    await db.admin(`update private.storage_purge_queue set claimed_at = now() - interval '11 minutes' where path = $1`, [a]);
    expect(await take(1)).toEqual([{ path: a }]);
    expect(await db.as(SERVICE, 'select public.purge_queue_done($1) as n', [[a, 'no/existe.webp']])).toEqual([{ n: 1 }]);
    expect(await db.admin('select path, attempts from private.storage_purge_queue')).toEqual([{ path: b, attempts: 1 }]);
    // A los 10 intentos se deja de tomar.
    await db.admin(`update private.storage_purge_queue set attempts = 10, claimed_at = null`);
    expect(await take()).toEqual([]);
  });

  it('una foto que se vuelve a registrar con la misma ruta sale de la cola: su archivo no se borra', async () => {
    const id = randomUUID();
    const path = `${w.priv}/${id}.webp`;
    const register = () => db.admin(`insert into public.photos (id, league_id, event_id, path) values ($1, $2, $3, $4)`, [id, w.priv, w.e.e1, path]);
    await register();
    await db.admin('delete from public.photos where id = $1', [id]);
    expect(await db.admin('select path from private.storage_purge_queue')).toEqual([{ path }]);
    // La importación de BowlingX corre otra vez (mismo id, misma ruta): ya no está por borrar.
    await register();
    expect(await db.admin('select path from private.storage_purge_queue')).toEqual([]);
    // Encolada de antes (sin el trigger): purge_queue_take no la entrega y la saca de la cola.
    const other = await photoRow(w.e.e1);
    await db.admin('insert into private.storage_purge_queue (path) values ($1), ($2)', [path, other]);
    await db.admin('delete from public.photos where path = $1', [other]);
    expect(await take()).toEqual([{ path: other }]);
    expect(await db.admin('select path from private.storage_purge_queue')).toEqual([{ path: other }]);
  });

  it('storage_orphans: archivos del bucket sin fila en photos y de hace más de 30 días (lo que op_log recuerda)', async () => {
    await bucket();
    await db.admin(`insert into storage.buckets (id, name) values ('otro', 'otro')`);
    const kept = await photoRow(w.e.e1);
    const orphan = `${w.priv}/${randomUUID()}.webp`;
    const recent = `${w.priv}/${randomUUID()}.webp`;
    await db.admin(
      `insert into storage.objects (bucket_id, name, created_at) values
         ('scoreboards', $1, now() - interval '60 days'), ('scoreboards', $2, now() - interval '31 days'),
         ('scoreboards', $3, now() - interval '29 days'), ('otro', $4, now() - interval '60 days')`,
      [kept, orphan, recent, `x/${randomUUID()}.webp`],
    );
    expect(await db.as(SERVICE, 'select path from public.storage_orphans()')).toEqual([{ path: orphan }]);
    expect(await db.as(SERVICE, 'select path from public.storage_orphans(0)')).toHaveLength(1);
  });

  it('solo service_role: ni anon ni una cuenta (tampoco el superadmin) tocan la cola', async () => {
    for (const who of [ANON, w.u.luis, w.u.dios]) {
      await fails(db.as(who, 'select * from public.purge_queue_take()'), DENIED);
      await fails(db.as(who, `select public.purge_queue_done('{}')`), DENIED);
      await fails(db.as(who, 'select * from public.storage_orphans()'), DENIED);
    }
  });
});

describe('espacio del plan gratis', () => {
  const objects = (...sizes: (number | string)[]) =>
    db.admin(
      `insert into storage.objects (bucket_id, name, metadata)
       select 'scoreboards', 'x/' || gen_random_uuid() || '.webp', jsonb_build_object('size', s) from unnest($1::text[]) s`,
      [sizes.map(String)],
    );
  const usage = async () => (await db.admin<{ u: Json }>('select private.storage_usage() as u'))[0].u;
  const alert = async (now: string) => (await db.admin<{ a: boolean }>('select private.check_storage_alert($1) as a', [now]))[0].a;

  beforeEach(async () => {
    await db.admin(`insert into storage.buckets (id, name) values ('scoreboards', 'scoreboards') on conflict do nothing`);
  });

  it('storage_usage: bytes, topes y porcentajes (los tamaños que no son números no cuentan)', async () => {
    await objects(268435456, 268435456, 'x');
    const u = await usage();
    expect(u).toMatchObject({ dbLimit: 524288000, storageBytes: 536870912, storageLimit: 1073741824, storagePct: 50 });
    expect(u.dbBytes as number).toBeGreaterThan(0);
    expect(u.dbPct).toBe(Math.round(((u.dbBytes as number) * 1000) / 524288000) / 10);
  });

  it('al 70 % avisa a los superadmins una vez cada 3 días; debajo, nada', async () => {
    await subscribe(w.u.dios, w.u.dios2, w.u.org);
    await objects(536870912);
    expect(await alert('2026-10-01T12:00:00Z')).toBe(false);
    await objects(268435456);
    expect(await alert('2026-10-01T12:00:00Z')).toBe(true);
    const rows = await pushes('espacio');
    expect(rows.map((r) => r.user_id).sort()).toEqual([w.u.dios, w.u.dios2].sort());
    for (const r of rows) {
      expect(r.title).toBe('El espacio de MatchMate va por 75 %');
      expect(r.body).toMatch(/^Base de datos: \d+ % de 500 MB\. Fotos: 75 % de 1 GB\. Toca para ver el detalle\.$/);
    }
    expect(rows[0]).toMatchObject({ url: '/superadmin/sistema', ttl: 86400 });
    expect(await alert('2026-10-02T12:00:00Z')).toBe(false);
    expect(await alert('2026-10-04T11:59:00Z')).toBe(false);
    await markSent();
    expect(await alert('2026-10-04T12:01:00Z')).toBe(true);
    expect(await pushes('espacio')).toHaveLength(4);
    expect(await db.admin('select pct::text as pct from private.storage_alerts order by at')).toEqual([{ pct: '75.0' }, { pct: '75.0' }]);
  });

  it('si no se encoló ningún push (ningún superadmin con teléfono), no cuenta como aviso: se intenta otra vez al día siguiente', async () => {
    await objects(805306368);
    expect(await alert('2026-10-01T12:00:00Z')).toBe(false);
    expect(await db.count('private.storage_alerts')).toBe(0);
    await subscribe(w.u.dios);
    expect(await alert('2026-10-02T12:00:00Z')).toBe(true);
    expect((await pushes('espacio')).map((r) => r.user_id)).toEqual([w.u.dios]);
    // El anterior todavía no sale (send-push caído): tampoco cuenta.
    await db.admin('delete from private.storage_alerts');
    expect(await alert('2026-10-03T12:00:00Z')).toBe(false);
    expect(await db.count('private.storage_alerts')).toBe(0);
  });

  it('admin_storage_usage: la consola lo lee (solo el superadmin), con la última alerta y lo que falta borrar', async () => {
    await subscribe(w.u.dios);
    await objects(805306368);
    const before = await db.rpc<Json>(w.u.dios, 'admin_storage_usage');
    expect(before).toMatchObject({ storagePct: 75, lastAlertAt: null, purgePending: 0 });
    await alert('2026-10-01T12:00:00Z');
    await db.admin(`insert into private.storage_purge_queue (path) values ('a/b.webp')`);
    expect(await db.rpc<Json>(w.u.dios, 'admin_storage_usage')).toMatchObject({ lastAlertAt: '2026-10-01T12:00:00.000Z', purgePending: 1 });
    await fails(db.rpc(w.u.org, 'admin_storage_usage'), DENIED);
    await fails(db.rpc(ANON, 'admin_storage_usage'), DENIED);
  });
});

describe('cron y permisos', () => {
  it('kick_function: sin pg_net ni Vault (PGlite) no llama a nadie; un nombre raro, tampoco', async () => {
    expect(await db.admin(`select private.kick_function('purge-photos') as a, private.kick_function('../x') as b`)).toEqual([{ a: false, b: false }]);
  });

  it('el archivo _supabase corre en una base sin pg_cron sin fallar (solo avisa)', async () => {
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, '20260929000510_avisos_telefono_supabase.sql'), 'utf8'));
  });

  it('las ayudas y los recordatorios: nadie de la app; la cola de fotos: solo service_role; las RPC: con sesión', async () => {
    const rows = await db.admin<{ fn: string; anon: boolean; auth: boolean; service: boolean }>(
      `select n.nspname || '.' || p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname = 'private' and p.proname in ('push_categories', 'push_pref', 'push_prefs_of', 'push_category', 'push_outbox_prefs',
                 'queue_push', 'push_due', 'push_day', 'push_event_label', 'push_who', 'push_score', 'push_submission_review', 'push_reaction',
                 'push_comment', 'push_game_like', 'push_result_confirmed', 'remind_after_bowling', 'remind_missing_results', 'storage_usage',
                 'check_storage_alert', 'kick_function', 'enqueue_due_reminders', 'photo_unqueue_purge'))
           or (n.nspname = 'public' and p.proname in ('purge_queue_take', 'purge_queue_done', 'storage_orphans', 'set_push_prefs', 'admin_storage_usage'))
        order by 1`,
    );
    expect(rows).toHaveLength(28);
    for (const r of rows) {
      const service = ['public.purge_queue_take', 'public.purge_queue_done', 'public.storage_orphans'].includes(r.fn);
      const app = ['public.set_push_prefs', 'public.admin_storage_usage'].includes(r.fn);
      expect([r.fn, r.anon, r.auth, r.service && !app]).toEqual([r.fn, false, app, service]);
    }
    for (const who of [w.u.luis, w.u.dios, SERVICE]) {
      await fails(db.as(who, 'select private.remind_after_bowling()'), DENIED);
      await fails(db.as(who, 'select private.remind_missing_results()'), DENIED);
      await fails(db.as(who, 'select private.check_storage_alert()'), DENIED);
      await fails(db.as(who, `select private.queue_push($1, null, 'x', 'y', '/', 't', 60)`, [w.u.luis]), DENIED);
      await fails(db.as(who, 'select * from private.push_once'), DENIED);
      await fails(db.as(who, 'select * from private.storage_alerts'), DENIED);
    }
  });
});
