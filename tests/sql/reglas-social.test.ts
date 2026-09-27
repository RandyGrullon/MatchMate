/**
 * tests/reglas.test.ts (BowlingX) pasado a Postgres, 4 de 4: social, buzón de sugerencias, teléfonos
 * suscritos y cuentas. Las marcas de ritmo (limits/{uid} en Firestore) ahora son private.paces: nadie las
 * lee ni las toca por la API.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { entry, makeWorld, type World } from './fixture';

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

describe('social: me gusta, felicitar y comentarios', () => {
  const react = (uid: string, type: string | null, entryId = w.e1Luis) => db.rpc(uid, 'set_reaction', { p_entry: entryId, p_type: type });
  const comment = (uid: string, text: string, entryId = w.e1Luis) => db.rpc<string>(uid, 'add_comment', { p_entry: entryId, p_text: text });
  const reactions = () =>
    db.admin<{ id: string; user_id: string; author_name: string; type: string }>(
      'select id, user_id, author_name, type from public.reactions where entry_id = $1',
      [w.e1Luis],
    );

  it('un miembro felicita el juego de otro (una reacción suya por juego) y la cambia o la quita', async () => {
    await react(w.u.ana, 'felicitar');
    await react(w.u.ana, 'like');
    const [r] = await reactions();
    expect(await reactions()).toEqual([{ id: r.id, user_id: w.u.ana, author_name: 'ana', type: 'like' }]);
    await fails(db.rpc(w.u.luis, 'delete_reaction', { p_reaction: r.id }), DENIED);
    await react(w.u.ana, null);
    expect(await reactions()).toEqual([]);
    // Quitarla otra vez (otra pestaña ya la quitó) no da error.
    await react(w.u.ana, null);
    expect(await db.rpc(w.u.ana, 'delete_reaction', { p_reaction: r.id })).toBe(false);
  });

  it('el nombre es el de su membresía: nadie se hace pasar por otro', async () => {
    await fails(db.rpc(w.u.ana, 'set_reaction', { p_entry: w.e1Luis, p_type: 'like', p_name: 'Admin de la liga' }), '42883');
    await react(w.u.ana, 'felicitar');
    expect((await reactions())[0]).toMatchObject({ user_id: w.u.ana, author_name: 'ana' });
  });

  it('no se reacciona por otro, ni con otro id, ni a un juego que no existe o diciendo mal de quién es', async () => {
    await fails(
      db.asUser(
        w.u.ana,
        `insert into public.reactions (league_id, entry_id, event_id, player_id, user_id, author_name, type) values ($1, $2, $3, $4, $5, 'sofi', 'like')`,
        [w.priv, w.e1Luis, w.e.e1, w.p.luis, w.u.sofi],
      ),
      '42501',
    );
    await fails(react(w.u.ana, 'like', '00000000-0000-4000-8000-000000000000'), 'no_existe');
    await fails(react(w.u.ana, 'odio'), INVALID);
    // Liga, evento y jugador salen de la participación, no del cliente…
    await react(w.u.ana, 'like');
    expect(await db.admin('select league_id, event_id, player_id from public.reactions where entry_id = $1', [w.e1Luis])).toEqual([
      { league_id: w.priv, event_id: w.e.e1, player_id: w.p.luis },
    ]);
    // …y la tabla no acepta decir mal de quién es el juego (FK compuesta), ni siquiera con service_role.
    await fails(
      db.asService(
        `insert into public.reactions (league_id, entry_id, event_id, player_id, user_id, author_name, type) values ($1, $2, $3, $4, $5, 'ana', 'like')`,
        [w.priv, w.e1Luis, w.e.e1, w.p.pedro, w.u.sofi],
      ),
      '23503',
    );
  });

  it('quien no es miembro no reacciona ni comenta, pero en una liga pública lo ve', async () => {
    await fails(react(w.u.extra, 'like'), DENIED);
    await fails(comment(w.u.extra, 'Hola'), DENIED);
    await comment(w.u.luis, 'Mío');
    expect(await db.asUser(w.u.extra, 'select id from public.comments where league_id = $1', [w.priv])).toHaveLength(0);
    // En la pública, cualquiera (también sin cuenta) ve los comentarios.
    const e9p1 = await entry(db, w.pub, w.e.e9, w.p.p1, [200], ['sin-foto']);
    await db.admin(
      `insert into public.comments (league_id, entry_id, event_id, player_id, user_id, author_name, text) values ($1, $2, $3, $4, $5, 'otro', '¡Bien!')`,
      [w.pub, e9p1, w.e.e9, w.p.p1, w.u.otro],
    );
    expect(await db.asAnon('select text from public.comments where league_id = $1', [w.pub])).toEqual([{ text: '¡Bien!' }]);
  });

  it('comentar: texto de 1 a 500 letras; lo borra el autor o un admin, nadie lo edita', async () => {
    const c1 = await comment(w.u.luis, '¡Gracias!');
    const c2 = await comment(w.u.ana, '¡Qué juegazo! 🎉');
    await fails(comment(w.u.sofi, ''), INVALID);
    await fails(comment(w.u.sofi, '   '), INVALID);
    await fails(comment(w.u.sofi, 'x'.repeat(501)), INVALID);
    // El autor y su nombre salen de la base (no hay cómo decir otro).
    expect(await db.admin('select user_id, author_name, player_id from public.comments where id = $1', [c2])).toEqual([
      { user_id: w.u.ana, author_name: 'ana', player_id: w.p.luis },
    ]);
    await fails(db.asUser(w.u.ana, `update public.comments set text = 'editado' where id = $1`, [c2]), '42501');
    await fails(db.rpc(w.u.luis, 'delete_comment', { p_comment: c2 }), DENIED);
    expect(await db.rpc(w.u.sofi, 'delete_comment', { p_comment: c2 })).toBe(true);
    expect(await db.rpc(w.u.luis, 'delete_comment', { p_comment: c1 })).toBe(true);
    expect(await db.rpc(w.u.luis, 'delete_comment', { p_comment: c1 })).toBe(false);
    expect(await db.count('public.comments')).toBe(0);
  });

  it('un comentario cada 3 segundos por persona (nadie llena de spam un juego)', async () => {
    await comment(w.u.ana, 'Uno');
    await fails(comment(w.u.ana, 'Dos seguido'), 'rate_limited');
    await comment(w.u.luis, 'Otro sí puede');
    // Pasados los 3 s, sí.
    await db.admin(`update private.paces set last_at = now() - interval '4 seconds' where user_id = $1`, [w.u.ana]);
    await comment(w.u.ana, 'Ya pasó el rato');
    expect(await db.count('public.comments')).toBe(3);
  });

  it('no se salta el ritmo borrando su marca ni metiendo muchos en un lote', async () => {
    await comment(w.u.ana, 'Uno');
    await fails(db.asUser(w.u.ana, 'delete from private.paces where user_id = $1', [w.u.ana]), '42501');
    await fails(db.asUser(w.u.ana, 'select * from private.paces'), '42501');
    // Muchos en una sola petición: el segundo choca con el ritmo y se deshace todo.
    await fails(
      db.asUser(w.u.sofi, `select public.add_comment($1, 'Spam 1'), public.add_comment($1, 'Spam 2')`, [w.e1Luis]),
      'rate_limited',
    );
    expect(await db.count('public.comments', 'user_id = $1', [w.u.sofi])).toBe(0);
  });

  it('no se borra el me gusta, comentario o juego en vivo de otro', async () => {
    await react(w.u.luis, 'like');
    const k1 = await comment(w.u.luis, 'mío');
    await db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e1, p_scores: [190] });
    const [r] = await reactions();
    await fails(db.rpc(w.u.ana, 'delete_reaction', { p_reaction: r.id }), DENIED);
    await fails(db.rpc(w.u.ana, 'delete_comment', { p_comment: k1 }), DENIED);
    await fails(db.rpc(w.u.ana, 'delete_live', { p_event: w.e.e1, p_player: w.p.luis }), DENIED);
    // Un admin sí (al limpiar un evento, un jugador o una participación).
    expect(await db.rpc(w.u.sofi, 'delete_reaction', { p_reaction: r.id })).toBe(true);
    expect(await db.rpc(w.u.sofi, 'delete_live', { p_event: w.e.e1, p_player: w.p.luis })).toBe(true);
    expect(await db.asUser(w.u.sofi, 'select id from public.comments where event_id = $1', [w.e.e1])).toHaveLength(1);
    expect(await db.asUser(w.u.sofi, 'select id from public.reactions where entry_id = $1', [w.e1Luis])).toHaveLength(0);
  });
});

describe('buzón de sugerencias', () => {
  const suggest = (uid: string, text: string, lid = w.priv) => db.rpc<string>(uid, 'send_suggestion', { p_league: lid, p_text: text });

  it('un miembro deja una nota anónima; no puede decir quién la escribió', async () => {
    const id = await suggest(w.u.luis, 'Más prácticas los jueves');
    expect(await db.admin('select text, read from public.suggestions where id = $1', [id])).toEqual([{ text: 'Más prácticas los jueves', read: false }]);
    // La tabla no tiene columna de autor.
    const cols = await db.admin<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'suggestions' order by 1`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(['created_at', 'id', 'league_id', 'read', 'text', 'updated_at']);
    await fails(db.rpc(w.u.ana, 'send_suggestion', { p_league: w.priv, p_text: 'Con autor', p_uid: w.u.ana }), '42883');
    await fails(db.asUser(w.u.ana, `insert into public.suggestions (league_id, text, read) values ($1, 'Ya leída', true)`, [w.priv]), '42501');
    await fails(suggest(w.u.ana, ''), INVALID);
    await fails(suggest(w.u.ana, 'x'.repeat(1001)), INVALID);
    await fails(suggest(w.u.extra, 'No soy de la liga'), DENIED);
  });

  it('una por minuto por persona', async () => {
    await suggest(w.u.ana, 'Una');
    await fails(suggest(w.u.ana, 'Otra enseguida'), 'rate_limited');
    await suggest(w.u.luis, 'La de Luis');
    // Comentar no cuenta para el buzón (y viceversa).
    await db.rpc(w.u.ana, 'add_comment', { p_entry: w.e1Luis, p_text: 'Comentario' });
  });

  it('solo los organizadores leen, marcan y borran las notas; nadie lee quién escribió', async () => {
    const n1 = await suggest(w.u.luis, 'Idea');
    expect(await db.asUser(w.u.luis, 'select id from public.suggestions')).toHaveLength(0);
    await fails(db.asUser(w.u.ana, 'select * from private.paces'), '42501');
    await fails(db.asUser(w.u.org, 'select * from private.paces'), '42501');
    expect(await db.asUser(w.u.sofi, 'select id, text from public.suggestions')).toEqual([{ id: n1, text: 'Idea' }]);
    await fails(db.asUser(w.u.sofi, `update public.suggestions set text = 'cambiada' where id = $1`, [n1]), '42501');
    expect(await db.rpc(w.u.sofi, 'mark_suggestions_read', { p_ids: [n1], p_read: true })).toBe(1);
    expect(await db.admin('select read from public.suggestions where id = $1', [n1])).toEqual([{ read: true }]);
    await fails(db.rpc(w.u.luis, 'mark_suggestions_read', { p_ids: [n1], p_read: false }), DENIED);
    await fails(db.rpc(w.u.luis, 'delete_suggestion', { p_suggestion: n1 }), DENIED);
    expect(await db.rpc(w.u.org, 'delete_suggestion', { p_suggestion: n1 })).toBe(true);
  });

  it('la marca de ritmo no se adelanta, no se borra la otra ni la propia', async () => {
    await db.rpc(w.u.ana, 'add_comment', { p_entry: w.e1Luis, p_text: 'Hola' });
    await fails(db.asUser(w.u.ana, `update private.paces set last_at = '2020-01-01' where user_id = $1`, [w.u.ana]), '42501');
    await fails(db.asUser(w.u.ana, `insert into private.paces values ($1, $2, 'suggestion', '2020-01-01')`, [w.u.luis, w.priv]), '42501');
    await fails(db.asUser(w.u.ana, 'delete from private.paces'), '42501');
    // Tampoco con la función del ritmo (no es de la API).
    await fails(db.asUser(w.u.ana, `select private.check_pace($1, 'comment', 0)`, [w.priv]), '42501');
    expect(await db.count('private.paces', 'user_id = $1', [w.u.ana])).toBe(1);
  });

  it('muchas notas en un solo lote no pasan', async () => {
    await fails(db.asUser(w.u.luis, `select public.send_suggestion($1, 'Uno'), public.send_suggestion($1, 'Dos')`, [w.priv]), 'rate_limited');
    expect(await db.count('public.suggestions')).toBe(0);
  });

  it('al borrar la liga, el dueño borra las marcas de cada miembro sin poder leerlas', async () => {
    await suggest(w.u.luis, 'Idea');
    await fails(db.asUser(w.u.org, 'select * from private.paces'), '42501');
    expect(await db.count('private.paces', 'league_id = $1', [w.priv])).toBe(1);
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await db.count('private.paces', 'league_id = $1', [w.priv])).toBe(0);
  });
});

describe('teléfonos suscritos a notificaciones', () => {
  const sub = { p_endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p_p256dh: 'BPk', p_auth: 'xyz', p_ua: 'Android' };

  it('cada cuenta guarda y borra solo los suyos; nadie más los ve', async () => {
    await db.rpc(w.u.ana, 'upsert_push_subscription', sub);
    expect(await db.admin('select user_id, ua from public.push_subscriptions')).toEqual([{ user_id: w.u.ana, ua: 'Android' }]);
    await fails(db.rpc(w.u.ana, 'upsert_push_subscription', { ...sub, p_user: w.u.luis }), '42883');
    expect(await db.asUser(w.u.org, 'select id from public.push_subscriptions')).toHaveLength(0);
    await fails(db.asAnon('select id from public.push_subscriptions'), '42501');
    await fails(db.rpc(w.u.ana, 'upsert_push_subscription', { ...sub, p_endpoint: 'http://malo' }), INVALID);
    // Solo servicios de push conocidos (el envío no le escribe a cualquier dirección).
    await fails(db.rpc(w.u.ana, 'upsert_push_subscription', { ...sub, p_endpoint: 'https://mi-servidor.com/fcm.googleapis.com/x' }), INVALID);
    await fails(db.rpc(w.u.ana, 'upsert_push_subscription', { ...sub, p_endpoint: 'https://fcm.googleapis.com.malo.com/x' }), INVALID);
    for (const endpoint of ['https://web.push.apple.com/QGx', 'https://updates.push.services.mozilla.com/wpush/v2/g', 'https://wns2-bl2p.notify.windows.com/w/?token=a']) {
      await db.rpc(w.u.ana, 'upsert_push_subscription', { ...sub, p_endpoint: endpoint });
    }
    await fails(db.rpc(w.u.ana, 'upsert_push_subscription', { ...sub, p_p256dh: 'x'.repeat(200) }), INVALID);
    await fails(db.asUser(w.u.ana, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'a', 'b')`, [w.u.ana, sub.p_endpoint]), '42501');
    expect(await db.asUser(w.u.ana, 'select id from public.push_subscriptions')).toHaveLength(4);
    expect(await db.rpc(w.u.luis, 'delete_push_subscription', { p_endpoint: sub.p_endpoint })).toBe(false);
    expect(await db.rpc(w.u.ana, 'delete_push_subscription', { p_endpoint: sub.p_endpoint })).toBe(true);
    expect(await db.asUser(w.u.ana, 'select id from public.push_subscriptions')).toHaveLength(3);
  });
});

describe('cuentas', () => {
  it('crea su perfil sin flag de superadmin', async () => {
    // El perfil lo crea el trigger de auth.users; la metadata que escribe quien se registra no hace superadmin.
    const id = await db.createUser('new2@x.com', 'Nuevo', { is_superadmin: true, superadmin: true });
    expect(await db.asUser(id, 'select email, name, is_superadmin from public.profiles')).toEqual([
      { email: 'new2@x.com', name: 'Nuevo', is_superadmin: false },
    ]);
    await fails(db.asUser(id, `insert into public.profiles (id, email, name, is_superadmin) values ($1, 'x@x.com', 'X', true)`, [id]), '42501');
    // ensure_profile no duplica ni cambia nada.
    await db.rpc(id, 'ensure_profile');
    expect(await db.count('public.profiles', 'id = $1', [id])).toBe(1);
  });

  it('cambia su nombre pero no se hace superadmin', async () => {
    await db.rpc(w.u.ana, 'rename_profile', { p_name: ' Ana María ' });
    expect(await db.asUser(w.u.ana, 'select name, is_superadmin from public.profiles')).toEqual([{ name: 'Ana María', is_superadmin: false }]);
    await fails(db.rpc(w.u.ana, 'rename_profile', { p_name: '' }), INVALID);
    await fails(db.asUser(w.u.ana, 'update public.profiles set is_superadmin = true where id = $1', [w.u.ana]), '42501');
    await fails(db.rpc(w.u.ana, 'set_superadmin', { p_user: w.u.ana, p_value: true }), DENIED);
    await fails(db.rpc(ANON, 'rename_profile', { p_name: 'Nadie' }), '42501');
  });
});
