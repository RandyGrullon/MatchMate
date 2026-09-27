/**
 * Lectura de fotos con IA (20260926001000_scan.sql): quién puede leer, los cupos (8 s entre fotos, 40 al día por
 * cuenta, 900 al día para todos, tope por minuto y modelo), la caché de 24 h y que nada de esto se ve desde la app.
 * Todo corre en la transacción de la prueba: now() no avanza, así que "pasar el tiempo" es mover las fechas a mano.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, SERVICE, TestDb, fails, ok } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { photoPath } from '../../src/lib/photos';
import { uuidv7 } from '../../src/lib/db/ids';

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

const M1 = 'gemini-3.5-flash-lite';
const M2 = 'gemini-3.1-flash-lite';
const KEY = 'a'.repeat(64);
const KEY2 = 'b'.repeat(64);

interface Begin {
  status: 'cached' | 'ok' | 'limit';
  model?: string | null;
  left?: number;
  result?: unknown;
  reason?: string;
  retry_after?: number;
  limit?: number;
}

/** Evento de boliche a `offset` días de hoy (hora de la liga, Santo Domingo por defecto). */
async function eventIn(lid: string, offset = 0): Promise<string> {
  const rows = await db.admin<{ id: string }>(
    `insert into public.events (league_id, type, date) values ($1, 'practica', (now() at time zone 'America/Santo_Domingo')::date + $2::int) returning id`,
    [lid, offset],
  );
  return rows[0].id;
}

const begin = (user: string | null, lid: string, event: string | null, key = KEY, extra: Record<string, unknown> = {}) =>
  db.rpc<Begin>(SERVICE, 'scan_begin', { p_user: user, p_league: lid, p_event: event, p_key: key, p_models: [M1, M2], ...extra });

const usage = async (uid: string) =>
  (await db.admin<{ n: number; last_at: string | null }>('select n, last_at from private.scan_usage where user_id = $1 and day = private.scan_day()', [uid]))[0] ??
  null;
const dayTotal = async () => (await db.admin<{ n: number }>('select n from private.scan_days where day = private.scan_day()'))[0]?.n ?? 0;
const minuteCount = async (model: string) =>
  (await db.admin<{ n: number }>(`select n from private.scan_minutes where model = $1 and minute = date_trunc('minute', now())`, [model]))[0]?.n ?? 0;
/** Mueve la última lectura de la cuenta al pasado (como si pasaran unos segundos). */
const waitGap = (uid: string, secs = 9) =>
  db.admin(`update private.scan_usage set last_at = now() - make_interval(secs => $2) where user_id = $1`, [uid, secs]);

describe('quién puede leer', () => {
  it('solo service_role (la Edge Function) llama las RPC de la lectura', async () => {
    const args = { p_user: w.u.luis, p_league: w.priv, p_event: null, p_key: KEY, p_models: [M1] };
    for (const who of [w.u.luis, w.u.dios, ANON]) {
      await fails(db.rpc(who, 'scan_begin', args), DENIED);
      await fails(db.rpc(who, 'scan_next_model', { p_models: [M1] }), DENIED);
      await fails(db.rpc(who, 'scan_finish', { p_user: w.u.luis, p_key: KEY, p_refund: true }), DENIED);
    }
    expect(await usage(w.u.luis)).toBeNull();
  });

  it('miembro con el evento abierto: lee con el primer modelo y gasta una lectura', async () => {
    const e = await eventIn(w.priv);
    expect(await begin(w.u.luis, w.priv, e)).toEqual({ status: 'ok', model: M1, left: 39 });
    expect(await usage(w.u.luis)).toMatchObject({ n: 1 });
    expect(await dayTotal()).toBe(1);
    expect(await minuteCount(M1)).toBe(1);
    expect(await minuteCount(M2)).toBe(0);
  });

  it('sin evento (envío por fecha) basta con estar en la liga; el superadmin también lee', async () => {
    expect((await begin(w.u.ana, w.priv, null)).status).toBe('ok');
    expect((await begin(w.u.dios, w.priv, null)).status).toBe('ok');
    expect((await begin(w.u.org, w.priv, null)).status).toBe('ok');
  });

  it('quien no está en la liga no lee (aunque la liga sea pública)', async () => {
    await fails(begin(w.u.extra, w.priv, null), DENIED);
    await fails(begin(w.u.luis, w.pub, null), DENIED);
    await fails(begin(w.u.nuevo, w.pub, await eventIn(w.pub)), DENIED);
    expect(await dayTotal()).toBe(0);
  });

  it('ligas con menores o de otro deporte: no', async () => {
    const minors = await league(db, w.u.org, { name: 'Infantil', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, minors, w.u.org, 'owner', 'org');
    await member(db, minors, w.u.luis, 'member', 'luis');
    await player(db, minors, 'Luis', w.u.luis);
    await fails(begin(w.u.luis, minors, null), DENIED);
    await fails(begin(w.u.org, minors, await eventIn(minors)), DENIED);

    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', requirePhoto: false, sport: 'padel' });
    await member(db, padel, w.u.org, 'owner', 'org');
    await fails(begin(w.u.org, padel, null), DENIED);
    expect(await usage(w.u.luis)).toBeNull();
  });

  it('evento de otra liga o que no existe; liga que no existe', async () => {
    await fails(begin(w.u.luis, w.priv, await eventIn(w.pub)), 'no_existe');
    await fails(begin(w.u.luis, w.priv, uuidv7()), 'no_existe');
    await fails(begin(w.u.luis, uuidv7(), null), 'no_existe');
  });

  it('evento abierto: de las últimas 2 semanas hasta mañana', async () => {
    await fails(begin(w.u.luis, w.priv, await eventIn(w.priv, -15)), 'cerrado');
    await fails(begin(w.u.luis, w.priv, await eventIn(w.priv, 2)), 'cerrado');
    expect((await begin(w.u.luis, w.priv, await eventIn(w.priv, -14))).status).toBe('ok');
    await waitGap(w.u.luis);
    expect((await begin(w.u.luis, w.priv, await eventIn(w.priv, 1))).status).toBe('ok');
  });

  it('datos inválidos', async () => {
    await fails(begin(w.u.luis, w.priv, null, 'no-es-un-hash'), 'invalido');
    await fails(begin(w.u.luis, w.priv, null, KEY.toUpperCase()), 'invalido');
    await fails(begin(null, w.priv, null), 'invalido');
    await fails(begin(w.u.luis, w.priv, null, KEY, { p_models: ['Modelo Raro'] }), 'invalido');
    expect(await dayTotal()).toBe(0);
  });
});

describe('cupos', () => {
  it('8 s entre fotos de la misma cuenta (otra cuenta no espera)', async () => {
    expect((await begin(w.u.luis, w.priv, null)).status).toBe('ok');
    const again = await begin(w.u.luis, w.priv, null, KEY2);
    expect(again).toMatchObject({ status: 'limit', reason: 'espera', limit: 8 });
    expect(again.retry_after).toBeGreaterThanOrEqual(1);
    expect(again.retry_after).toBeLessThanOrEqual(8);
    expect(await usage(w.u.luis)).toMatchObject({ n: 1 });
    expect((await begin(w.u.sofi, w.priv, null, KEY2)).status).toBe('ok');
    await waitGap(w.u.luis);
    expect(await begin(w.u.luis, w.priv, null, KEY2)).toMatchObject({ status: 'ok', left: 38 });
    expect(await usage(w.u.luis)).toMatchObject({ n: 2 });
    expect(await dayTotal()).toBe(3);
  });

  it('40 al día por cuenta', async () => {
    expect((await begin(w.u.luis, w.priv, null)).status).toBe('ok');
    await db.admin(`update private.scan_usage set n = 40, last_at = now() - interval '1 minute' where user_id = $1`, [w.u.luis]);
    const r = await begin(w.u.luis, w.priv, null, KEY2);
    expect(r).toMatchObject({ status: 'limit', reason: 'usuario', limit: 40 });
    // Hasta la medianoche del Pacífico: como mucho un día (más la hora del cambio de horario).
    expect(r.retry_after).toBeGreaterThanOrEqual(1);
    expect(r.retry_after).toBeLessThanOrEqual(25 * 3600);
    expect(await dayTotal()).toBe(1);
    expect(await usage(w.u.luis)).toMatchObject({ n: 40 });
  });

  it('900 al día para todos, sin gastar la lectura de la cuenta', async () => {
    await db.admin('insert into private.scan_days (day, n) values (private.scan_day(), 900)');
    expect(await begin(w.u.luis, w.priv, null)).toMatchObject({ status: 'limit', reason: 'global', limit: 900 });
    expect(await usage(w.u.luis)).toMatchObject({ n: 0, last_at: null });
    expect(await dayTotal()).toBe(900);
    // Con uno menos, pasa.
    await db.admin('update private.scan_days set n = 899 where day = private.scan_day()');
    expect((await begin(w.u.luis, w.priv, null)).status).toBe('ok');
    expect(await dayTotal()).toBe(900);
  });

  it('tope por minuto y modelo: pasa al segundo; con los dos llenos espera al otro minuto sin gastar nada', async () => {
    await db.admin(`insert into private.scan_minutes (model, minute, n) values ($1, date_trunc('minute', now()), 12)`, [M1]);
    expect(await begin(w.u.luis, w.priv, null)).toMatchObject({ status: 'ok', model: M2 });
    expect(await minuteCount(M1)).toBe(12);
    expect(await minuteCount(M2)).toBe(1);

    await db.admin(`update private.scan_minutes set n = 12 where model = $1`, [M2]);
    await waitGap(w.u.luis);
    const busy = await begin(w.u.luis, w.priv, null, KEY2);
    expect(busy).toMatchObject({ status: 'limit', reason: 'ocupado', limit: 12 });
    expect(busy.retry_after).toBeGreaterThanOrEqual(1);
    expect(busy.retry_after).toBeLessThanOrEqual(60);
    expect(await usage(w.u.luis)).toMatchObject({ n: 1 });
    expect(await dayTotal()).toBe(1);
  });

  it('el tope por minuto lo decide la función (p_per_minute) y scan_next_model toma otro modelo', async () => {
    expect(await begin(w.u.luis, w.priv, null, KEY, { p_per_minute: 1 })).toMatchObject({ status: 'ok', model: M1 });
    // El primero no respondió: la función pide el siguiente de la lista.
    expect(await db.rpc(SERVICE, 'scan_next_model', { p_models: [M1, M2], p_per_minute: 1 })).toBe(M2);
    expect(await db.rpc(SERVICE, 'scan_next_model', { p_models: [M2], p_per_minute: 1 })).toBeNull();
    expect(await db.rpc(SERVICE, 'scan_next_model', { p_models: [M2], p_per_minute: 2 })).toBe(M2);
    expect(await db.rpc(SERVICE, 'scan_next_model', { p_models: [] })).toBeNull();
    expect(await minuteCount(M2)).toBe(2);
  });
});

describe('caché y cierre de la lectura', () => {
  const RESULT = { esPantallaDeBoliche: true, jugadores: [{ nombre: 'LUIS', handicap: null, juegos: [180, 200], total: 380 }] };

  it('la misma foto en 24 h sale de la caché sin gastar cupo (también para otra cuenta)', async () => {
    expect((await begin(w.u.luis, w.priv, null)).status).toBe('ok');
    await ok(db.rpc(SERVICE, 'scan_finish', { p_user: w.u.luis, p_key: KEY, p_model: M1, p_result: RESULT }));
    // Dentro de los 8 s y sin gastar: viene de la caché.
    expect(await begin(w.u.luis, w.priv, null)).toEqual({ status: 'cached', result: RESULT, model: M1 });
    expect(await begin(w.u.sofi, w.priv, null)).toMatchObject({ status: 'cached' });
    expect(await usage(w.u.luis)).toMatchObject({ n: 1 });
    expect(await usage(w.u.sofi)).toBeNull();
    // Pero la caché no se salta los permisos.
    await fails(begin(w.u.extra, w.priv, null), DENIED);

    // Pasadas 24 h ya no vale.
    await db.admin(`update private.scan_cache set created_at = now() - interval '25 hours'`);
    expect(await begin(w.u.sofi, w.priv, null)).toMatchObject({ status: 'ok' });
  });

  it('si ningún modelo respondió, la lectura se le devuelve a la cuenta (la espera de 8 s sigue)', async () => {
    expect((await begin(w.u.luis, w.priv, null)).status).toBe('ok');
    await ok(db.rpc(SERVICE, 'scan_finish', { p_user: w.u.luis, p_key: KEY, p_refund: true }));
    const u = await usage(w.u.luis);
    expect(u?.n).toBe(0);
    expect(u?.last_at).not.toBeNull();
    expect(await dayTotal()).toBe(1);
    expect(await db.count('private.scan_cache')).toBe(0);
    expect(await begin(w.u.luis, w.priv, null)).toMatchObject({ status: 'limit', reason: 'espera' });
    // Devolver de más no baja de 0.
    await ok(db.rpc(SERVICE, 'scan_finish', { p_user: w.u.luis, p_key: KEY, p_refund: true }));
    expect((await usage(w.u.luis))?.n).toBe(0);
  });

  it('guardar en la caché valida la clave y el resultado; lo viejo se borra solo', async () => {
    await fails(db.rpc(SERVICE, 'scan_finish', { p_user: w.u.luis, p_key: 'x', p_result: RESULT }), 'invalido');
    await fails(db.rpc(SERVICE, 'scan_finish', { p_user: w.u.luis, p_key: KEY, p_result: [1, 2] }), 'invalido');
    await db.admin(`insert into private.scan_cache (key, result, model, created_at) values ($1, '{}', $2, now() - interval '2 days')`, [KEY2, M1]);
    await db.admin(`insert into private.scan_minutes (model, minute, n) values ($1, now() - interval '4 days', 3)`, [M1]);
    await ok(db.rpc(SERVICE, 'scan_finish', { p_user: w.u.luis, p_key: KEY, p_model: M2, p_result: RESULT }));
    expect(await db.admin('select key, model from private.scan_cache')).toEqual([{ key: KEY, model: M2 }]);
    expect(await db.count('private.scan_minutes')).toBe(0);
  });
});

describe('seguridad', () => {
  it('nadie de la app lee ni escribe las tablas de la lectura', async () => {
    for (const t of ['private.scan_usage', 'private.scan_days', 'private.scan_minutes', 'private.scan_cache']) {
      for (const who of [ANON, w.u.luis, w.u.dios]) {
        await fails(db.as(who, `select * from ${t}`), '42501');
        await fails(db.as(who, `delete from ${t}`), '42501');
      }
    }
    for (const fn of ['private.can_scan(null, null, null)', 'private.consume_scan(null, null, null)', 'private.scan_cleanup()']) {
      await fails(db.as(w.u.dios, `select ${fn}`), '42501');
    }
  });

  it('la ruta que arma photos.ts pasa la política de subida de Storage (can_upload_photo_path)', async () => {
    const can = async (who: string, path: string) =>
      (await db.as<{ ok: boolean }>(who, 'select private.can_upload_photo_path($1) as ok', [path]))[0].ok;
    const webp = photoPath(w.priv, uuidv7(), 'image/webp');
    const jpg = photoPath(w.priv, uuidv7(), 'image/jpeg');
    expect(webp).toMatch(/\.webp$/);
    expect(jpg).toMatch(/\.jpg$/);
    // Miembro con jugador, admin y dueño: sí. Miembro sin jugador o de fuera: no.
    expect(await can(w.u.luis, webp)).toBe(true);
    expect(await can(w.u.luis, jpg)).toBe(true);
    expect(await can(w.u.sofi, webp)).toBe(true);
    expect(await can(w.u.ana, webp)).toBe(false);
    expect(await can(w.u.extra, webp)).toBe(false);
    // Liga con menores: nunca.
    const minors = await league(db, w.u.org, { name: 'Infantil', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, minors, w.u.org, 'owner', 'org');
    expect(await can(w.u.org, photoPath(minors, uuidv7(), 'image/webp'))).toBe(false);
  });
});
