/**
 * Empresas (20261105000100_empresas.sql y 20261105000110_empresas_supabase.sql): registrar la empresa (una por cuenta)
 * y cambiar de modo sin perder la cuenta, sus espacios (canchas) con fotos, lo público (solo aprobadas, destacados
 * primero), pedir destacar y lo que hace el superadmin (aprobar, rechazar, suspender, comisión, promociones), la cola de
 * Storage y lo que pasa al borrar la cuenta.
 *
 * Mundo (fixture): luis y ana miembros de la liga privada del Banco (dueño org, admin sofi); extra sin liga; dios es
 * superadmin.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, MIGRATIONS_DIR, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

let db: TestDb;
let w: World;

type Json = Record<string, any>;

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

const uuid = () => randomUUID();
const register = (who: string, over: Json = {}) =>
  db.rpc<string>(who, 'register_business', { p_name: 'Club Los Prados', p_city: 'Santo Domingo', p_phone: '809 555 0000', ...over });
const saveVenue = (who: string, over: Json = {}) =>
  db.rpc<Json>(who, 'save_venue', {
    p_id: null,
    p_sport: 'padel',
    p_name: 'Pádel Los Prados',
    p_city: 'Santo Domingo',
    p_details: { canchas: 6, paredes: 'cristal', techada: true },
    p_price_hour: 1500,
    ...over,
  });
const approve = (business: string) => db.rpc(w.u.dios, 'admin_set_business_status', { p_business: business, p_status: 'approved' });
const search = (who: string, args: Json = {}) => db.rpc<{ rows: Json[]; total: number }>(who, 'search_venues', args);
const mode = async (id: string) => (await db.admin<{ m: string | null }>('select account_mode as m from public.profiles where id = $1', [id]))[0].m;
const queue = () => db.admin<{ path: string; bucket: string }>(`select path, bucket from private.storage_purge_queue where bucket = 'venues' order by path`);

describe('registrar la empresa y el modo', () => {
  it('una por cuenta, queda pendiente y la app pasa a modo empresa; se puede volver a jugador y otra vez a empresa', async () => {
    const id = await register(w.u.luis, { p_email: 'Ventas@Club.do', p_tax_id: '1-01-12345-6' });
    const mine = await db.rpc<Json>(w.u.luis, 'my_business');
    expect(mine).toMatchObject({ id, name: 'Club Los Prados', phone: '8095550000', email: 'ventas@club.do', taxId: '101123456', status: 'pending', commissionPct: 10, venues: [] });
    expect(await mode(w.u.luis)).toBe('business');
    await fails(register(w.u.luis, { p_name: 'Otra' }), 'duplicado');

    expect(await db.rpc(w.u.luis, 'set_account_mode', { p_mode: 'player' })).toBe('player');
    expect(await mode(w.u.luis)).toBe('player');
    // Su cuenta de jugador sigue igual: su liga y su jugador.
    expect(await db.count('public.league_members', 'user_id = $1', [w.u.luis])).toBeGreaterThan(0);
    expect(await db.rpc(w.u.luis, 'set_account_mode', { p_mode: 'business' })).toBe('business');
    expect(await db.rpc(w.u.luis, 'set_account_mode', { p_mode: null })).toBeNull();

    // Sin empresa no hay modo empresa; otros valores no.
    await fails(db.rpc(w.u.ana, 'set_account_mode', { p_mode: 'business' }), 'no_existe');
    await fails(db.rpc(w.u.ana, 'set_account_mode', { p_mode: 'Empresa' }), 'invalido');
    await fails(db.rpc(ANON, 'set_account_mode', { p_mode: 'player' }), DENIED);
    expect(await db.rpc(w.u.ana, 'my_business')).toBeNull();
  });

  it('valida lo que se llena', async () => {
    for (const bad of [{ p_name: 'X' }, { p_name: '' }, { p_city: '' }, { p_phone: '12' }, { p_email: 'sin-arroba' }, { p_tax_id: '123' }, { p_description: 'x'.repeat(501) }]) {
      await fails(register(w.u.extra, bad), INVALID);
    }
    await fails(register(ANON), DENIED);
  });

  it('corregir una rechazada la devuelve a revisión; borrar la empresa vuelve la app a jugador', async () => {
    const id = await register(w.u.luis);
    await db.rpc(w.u.dios, 'admin_set_business_status', { p_business: id, p_status: 'rejected', p_note: 'Falta el RNC' });
    expect(await db.rpc<Json>(w.u.luis, 'my_business')).toMatchObject({ status: 'rejected', statusNote: 'Falta el RNC' });
    const fixed = await db.rpc<Json>(w.u.luis, 'update_business', { p_name: 'Club Los Prados', p_city: 'Santo Domingo', p_tax_id: '101123456' });
    expect(fixed).toMatchObject({ status: 'pending', statusNote: null, taxId: '101123456' });
    await fails(db.rpc(w.u.ana, 'update_business', { p_name: 'Robo', p_city: 'Santiago' }), 'no_existe');

    expect(await db.rpc(w.u.luis, 'delete_business')).toBe(true);
    expect(await mode(w.u.luis)).toBeNull();
    expect(await db.rpc(w.u.luis, 'delete_business')).toBe(false);
  });
});

describe('espacios y fotos', () => {
  it('crear y cambiar un espacio: solo la dueña, deporte que existe y datos con forma; hasta 30', async () => {
    const id = await register(w.u.luis);
    const v = await saveVenue(w.u.luis);
    expect(v).toMatchObject({ businessId: id, sport: 'padel', name: 'Pádel Los Prados', details: { canchas: 6, paredes: 'cristal', techada: true }, priceHour: 1500, phone: '8095550000', active: true, leagues: 0, promotion: null, featuredUntil: null, photos: [] });
    const changed = await saveVenue(w.u.luis, { p_id: v.id, p_name: 'Pádel Prados', p_active: false, p_phone: '829-555-1111' });
    expect(changed).toMatchObject({ id: v.id, name: 'Pádel Prados', active: false, phone: '8295551111' });

    await register(w.u.ana, { p_name: 'Bolera Ana' });
    await fails(saveVenue(w.u.ana, { p_id: v.id }), 'no_existe');
    await fails(saveVenue(w.u.extra), DENIED);
    for (const bad of [{ p_sport: 'curling' }, { p_details: [] }, { p_details: { 'mal clave': 1 } }, { p_details: { canchas: { x: 1 } } }, { p_details: { superficie: 'x'.repeat(31) } }, { p_price_hour: -1 }, { p_name: 'X' }]) {
      await fails(saveVenue(w.u.luis, bad), INVALID);
    }
    for (let i = 1; i < 30; i++) await saveVenue(w.u.luis, { p_name: `Cancha ${i}` });
    await fails(saveVenue(w.u.luis, { p_name: 'La 31' }), 'limite');
  });

  it('fotos: la ruta es <mi cuenta>/<id>, hasta 8 por espacio, portada y borrar (el archivo va a la cola)', async () => {
    await register(w.u.luis);
    const v = await saveVenue(w.u.luis);
    const ids = Array.from({ length: 8 }, () => uuid());
    for (const p of ids) await db.rpc(w.u.luis, 'add_venue_photo', { p_venue: v.id, p_photo: p, p_path: `${w.u.luis}/${p}.webp`, p_width: 1200, p_height: 800 });
    const extra = uuid();
    await fails(db.rpc(w.u.luis, 'add_venue_photo', { p_venue: v.id, p_photo: extra, p_path: `${w.u.luis}/${extra}.webp` }), 'limite');
    // La ruta tiene que ser la de su carpeta y con su id.
    const other = uuid();
    await db.rpc(w.u.luis, 'delete_venue_photo', { p_photo: ids[7] });
    await fails(db.rpc(w.u.luis, 'add_venue_photo', { p_venue: v.id, p_photo: other, p_path: `${w.u.ana}/${other}.webp` }), INVALID);
    await fails(db.rpc(w.u.luis, 'add_venue_photo', { p_venue: v.id, p_photo: other, p_path: `${w.u.luis}/${uuid()}.webp` }), INVALID);
    await fails(db.rpc(w.u.ana, 'add_venue_photo', { p_venue: v.id, p_photo: other, p_path: `${w.u.ana}/${other}.webp` }), DENIED);

    const cover = await db.rpc<Json[]>(w.u.luis, 'set_venue_cover', { p_photo: ids[3] });
    expect(cover.map((f) => f.id)).toEqual([ids[3], ids[0], ids[1], ids[2], ids[4], ids[5], ids[6]]);
    expect(await queue()).toEqual([{ path: `${w.u.luis}/${ids[7]}.webp`, bucket: 'venues' }]);
    await fails(db.rpc(w.u.ana, 'delete_venue_photo', { p_photo: ids[0] }), 'no_existe');

    // Borrar el espacio manda sus fotos a la cola; la cola no borra lo que sigue en uso.
    expect(await db.rpc(w.u.luis, 'delete_venue', { p_venue: v.id })).toBe(true);
    expect(await queue()).toHaveLength(8);
    const taken = await db.as<{ path: string }>('service', `select * from public.purge_queue_take(p_limit => 50, p_bucket => 'venues')`);
    expect(taken).toHaveLength(8);
    expect(await db.as<{ n: number }>('service', `select public.purge_queue_done(p_paths => $1, p_bucket => 'venues') as n`, [taken.map((t) => t.path)])).toEqual([{ n: 8 }]);
  });
});

describe('lo público y destacar', () => {
  it('solo empresas aprobadas, espacios activos y dueños sin bloquear; también sin cuenta', async () => {
    const id = await register(w.u.luis);
    const v = await saveVenue(w.u.luis);
    expect((await search(ANON)).rows).toEqual([]);
    expect(await db.rpc(ANON, 'venue_detail', { p_venue: v.id })).toBeNull();
    // La dueña y el superadmin lo ven aunque esté pendiente.
    expect(await db.rpc(w.u.luis, 'venue_detail', { p_venue: v.id })).toMatchObject({ id: v.id, mine: true });
    expect(await db.rpc(w.u.dios, 'venue_detail', { p_venue: v.id })).toMatchObject({ id: v.id, mine: true });

    await approve(id);
    const found = await search(ANON, { p_sport: 'padel', p_city: 'santo' });
    expect(found).toMatchObject({ total: 1, rows: [{ id: v.id, name: 'Pádel Los Prados', business: { name: 'Club Los Prados', email: null } }] });
    expect(found.rows[0]).not.toHaveProperty('active');
    expect((await search(ANON, { p_sport: 'tennis' })).total).toBe(0);
    expect((await search(ANON, { p_search: 'prados' })).total).toBe(1);
    expect((await search(ANON, { p_search: '%' })).total).toBe(0);
    expect(await db.rpc(ANON, 'venue_detail', { p_venue: v.id })).toMatchObject({ id: v.id, mine: false, leagues: [] });

    await saveVenue(w.u.luis, { p_id: v.id, p_active: false });
    expect((await search(ANON)).total).toBe(0);
    await saveVenue(w.u.luis, { p_id: v.id, p_active: true });
    await db.rpc(w.u.dios, 'admin_set_business_status', { p_business: id, p_status: 'suspended', p_note: 'Quejas' });
    expect((await search(ANON)).total).toBe(0);
    await approve(id);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'prueba' });
    expect((await search(ANON)).total).toBe(0);
  });

  it('pedir destacar (aprobadas, una a la vez), el superadmin la activa con lo pagado y sale primero; termina y se puede retirar', async () => {
    const a = await register(w.u.luis);
    const va = await saveVenue(w.u.luis, { p_name: 'Zeta Pádel' });
    const b = await register(w.u.ana, { p_name: 'Club Ana' });
    const vb = await saveVenue(w.u.ana, { p_name: 'Alfa Pádel' });
    await fails(db.rpc(w.u.luis, 'request_promotion', { p_venue: va.id, p_days: 7 }), DENIED);
    await approve(a);
    await approve(b);
    expect((await search(ANON)).rows.map((r) => r.name)).toEqual(['Alfa Pádel', 'Zeta Pádel']);

    const asked = await db.rpc<Json>(w.u.luis, 'request_promotion', { p_venue: va.id, p_days: 7, p_note: 'Para el torneo' });
    expect(asked.promotion).toMatchObject({ status: 'requested', days: 7, note: 'Para el torneo' });
    await fails(db.rpc(w.u.luis, 'request_promotion', { p_venue: va.id, p_days: 3 }), 'duplicado');
    await fails(db.rpc(w.u.luis, 'request_promotion', { p_venue: vb.id, p_days: 3 }), DENIED);
    await fails(db.rpc(w.u.luis, 'request_promotion', { p_venue: va.id, p_days: 0 }), INVALID);

    await fails(db.rpc(w.u.luis, 'admin_decide_promotion', { p_promotion: asked.promotion.id, p_approve: true, p_amount: 0 }), DENIED);
    await fails(db.rpc(w.u.dios, 'admin_decide_promotion', { p_promotion: asked.promotion.id, p_approve: true }), INVALID);
    const on = await db.rpc<Json>(w.u.dios, 'admin_decide_promotion', { p_promotion: asked.promotion.id, p_approve: true, p_amount: 2500, p_days: 10 });
    expect(on.promotion).toMatchObject({ status: 'active', days: 10 });
    expect(on.featuredUntil).not.toBeNull();
    expect((await search(ANON)).rows.map((r) => r.name)).toEqual(['Zeta Pádel', 'Alfa Pádel']);
    expect(await db.rpc<Json>(w.u.dios, 'admin_business', { p_business: a })).toMatchObject({ paid: 2500, promotions: [{ status: 'active', amount: 2500, venueName: 'Zeta Pádel' }] });

    // Cuando vence, deja de salir primero.
    await db.admin(`update public.venue_promotions set starts_at = now() - interval '20 days', ends_at = now() - interval '1 day'`);
    expect((await search(ANON)).rows.map((r) => r.name)).toEqual(['Alfa Pádel', 'Zeta Pádel']);

    // Dar una directa, terminarla; pedir y retirar.
    const granted = await db.rpc<Json>(w.u.dios, 'admin_grant_promotion', { p_venue: vb.id, p_days: 5, p_amount: 1000 });
    expect(granted.featuredUntil).not.toBeNull();
    const ended = await db.rpc<Json>(w.u.dios, 'admin_end_promotion', { p_promotion: granted.promotion.id });
    expect(ended.featuredUntil).toBeNull();
    const again = await db.rpc<Json>(w.u.luis, 'request_promotion', { p_venue: va.id, p_days: 3 });
    expect(await db.rpc(w.u.ana, 'cancel_promotion', { p_promotion: again.promotion.id })).toBe(false);
    expect(await db.rpc(w.u.luis, 'cancel_promotion', { p_promotion: again.promotion.id })).toBe(true);
    const no = await db.rpc<Json>(w.u.luis, 'request_promotion', { p_venue: va.id, p_days: 3 });
    expect((await db.rpc<Json>(w.u.dios, 'admin_decide_promotion', { p_promotion: no.promotion.id, p_approve: false })).promotion).toMatchObject({ status: 'rejected' });
  });

  it('un torneo en un espacio: admin de la liga y dueña del espacio; sale en la ficha si es público', async () => {
    const id = await register(w.u.otro, { p_name: 'Club Otro' });
    const v = await saveVenue(w.u.otro);
    await approve(id);
    await fails(db.rpc(w.u.luis, 'set_league_venue', { p_league: w.pub, p_venue: v.id }), DENIED);
    expect(await db.rpc(w.u.otro, 'set_league_venue', { p_league: w.pub, p_venue: v.id })).toBe(true);
    expect((await db.rpc<Json>(ANON, 'venue_detail', { p_venue: v.id })).leagues).toEqual([expect.objectContaining({ id: w.pub })]);
    // La liga privada no sale en la ficha pública.
    await db.admin('update public.leagues set venue_id = $1 where id = $2', [v.id, w.priv]);
    expect((await db.rpc<Json>(ANON, 'venue_detail', { p_venue: v.id })).leagues).toHaveLength(1);
    expect((await db.rpc<Json>(w.u.dios, 'admin_business', { p_business: id })).leagues).toHaveLength(2);
    expect(await db.rpc(w.u.otro, 'set_league_venue', { p_league: w.pub, p_venue: null })).toBe(true);
  });
});

describe('la consola', () => {
  it('solo el superadmin: lista con conteos (pendientes primero), detalle, estado con motivo, comisión y auditoría', async () => {
    const a = await register(w.u.luis);
    const b = await register(w.u.ana, { p_name: 'Bolera Ana', p_city: 'Santiago' });
    await approve(b);
    await fails(db.rpc(w.u.luis, 'admin_businesses'), DENIED);
    await fails(db.rpc(w.u.luis, 'admin_business', { p_business: a }), DENIED);
    const list = await db.rpc<Json>(w.u.dios, 'admin_businesses');
    expect(list).toMatchObject({ total: 2, counts: { pending: 1, approved: 1, rejected: 0, suspended: 0, requests: 0 } });
    expect(list.rows.map((r: Json) => r.name)).toEqual(['Club Los Prados', 'Bolera Ana']);
    expect(list.rows[0]).toMatchObject({ status: 'pending', owner: { id: w.u.luis }, venues: 0 });
    expect((await db.rpc<Json>(w.u.dios, 'admin_businesses', { p_status: 'approved' })).rows.map((r: Json) => r.id)).toEqual([b]);
    expect((await db.rpc<Json>(w.u.dios, 'admin_businesses', { p_search: 'santiago' })).total).toBe(1);
    await fails(db.rpc(w.u.dios, 'admin_businesses', { p_status: 'x' }), INVALID);

    await fails(db.rpc(w.u.dios, 'admin_set_business_status', { p_business: a, p_status: 'rejected' }), INVALID);
    await fails(db.rpc(w.u.dios, 'admin_set_commission', { p_business: a, p_pct: 51 }), INVALID);
    expect(await db.rpc<Json>(w.u.dios, 'admin_set_commission', { p_business: a, p_pct: 12.5 })).toMatchObject({ commissionPct: 12.5 });
    expect(await db.rpc<Json>(w.u.dios, 'admin_business', { p_business: a })).toMatchObject({ owner: { id: w.u.luis, blocked: false }, promotions: [], leagues: [], paid: 0 });
    expect(await db.admin(`select action, target_type from public.admin_audit where target_id = $1 order by id`, [a])).toEqual([
      { action: 'business_commission', target_type: 'business' },
    ]);
  });
});

describe('permisos, datos y cuenta borrada', () => {
  it('nadie lee ni escribe las tablas directo; las ayudas no se ejecutan desde la app', async () => {
    await register(w.u.luis);
    for (const t of ['businesses', 'venues', 'venue_photos', 'venue_promotions']) {
      await fails(db.as(w.u.luis, `select * from public.${t}`), '42501');
      await fails(db.as(ANON, `select * from public.${t}`), '42501');
    }
    await fails(db.as(w.u.luis, `update public.profiles set account_mode = 'business' where id = $1`, [w.u.luis]), '42501');
    await fails(db.as(w.u.luis, `select private.business_json(null)`), '42501');
    await fails(db.as(w.u.luis, `select * from public.purge_queue_take()`), '42501');
  });

  it('«Descargar mis datos» trae la empresa; borrar la cuenta borra la empresa y manda sus fotos a la cola', async () => {
    const id = await register(w.u.extra, { p_name: 'Gimnasio Extra' });
    const v = await saveVenue(w.u.extra, { p_sport: 'basketball', p_details: { canchas: 1 } });
    const p = uuid();
    await db.rpc(w.u.extra, 'add_venue_photo', { p_venue: v.id, p_photo: p, p_path: `${w.u.extra}/${p}.jpg` });
    const data = await db.rpc<Json>(w.u.extra, 'export_my_data');
    expect(data.tables.businesses).toEqual([expect.objectContaining({ id, name: 'Gimnasio Extra' })]);

    await db.admin('delete from auth.users where id = $1', [w.u.extra]);
    expect(await db.count('public.businesses', 'id = $1', [id])).toBe(0);
    expect(await db.count('public.venues', 'id = $1', [v.id])).toBe(0);
    expect(await queue()).toEqual([{ path: `${w.u.extra}/${p}.jpg`, bucket: 'venues' }]);
  });
});

describe('Storage (20261105000110_empresas_supabase.sql, solo Supabase), probado en PGlite', () => {
  const FILE = '20261105000110_empresas_supabase.sql';
  const put = (who: string, name: string) => db.as(who, `insert into storage.objects (bucket_id, name) values ('venues', $1)`, [name]);
  const del = (who: string, name: string) => db.as(who, `delete from storage.objects where bucket_id = 'venues' and name = $1 returning name`, [name]);

  beforeEach(async () => {
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
    await db.pg.exec(`
      alter table storage.objects enable row level security;
      grant select, insert, delete on storage.objects to authenticated;
    `);
  });

  it('el bucket: público, 512 kB, WebP o JPEG; tres políticas y ninguna de UPDATE; se puede correr otra vez', async () => {
    expect(await db.admin(`select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'venues'`)).toEqual([
      { id: 'venues', public: true, file_size_limit: 524288, allowed_mime_types: ['image/webp', 'image/jpeg'] },
    ]);
    const policies = () => db.admin(`select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'mm_venues_%' order by 1`);
    expect(await policies()).toEqual([
      { policyname: 'mm_venues_delete', cmd: 'DELETE' },
      { policyname: 'mm_venues_read', cmd: 'SELECT' },
      { policyname: 'mm_venues_upload', cmd: 'INSERT' },
    ]);
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
    expect(await policies()).toHaveLength(3);
  });

  it('subir: solo con empresa (no suspendida), en mi carpeta y con la forma de la ruta; borrar solo lo mío', async () => {
    const path = (uid: string, ext = 'webp') => `${uid}/${uuid()}.${ext}`;
    await fails(put(w.u.luis, path(w.u.luis)), '42501');
    const id = await register(w.u.luis);
    const mine = path(w.u.luis);
    await put(w.u.luis, mine);
    await put(w.u.luis, path(w.u.luis, 'jpg'));
    await fails(put(w.u.luis, path(w.u.ana)), '42501');
    await fails(put(w.u.luis, `${w.u.luis}/foto.webp`), '42501');
    await fails(put(w.u.luis, path(w.u.luis, 'png')), '42501');
    await fails(put(ANON, path(w.u.luis)), '42501');
    await register(w.u.ana);
    expect(await del(w.u.ana, mine)).toEqual([]);
    expect(await del(w.u.luis, mine)).toEqual([{ name: mine }]);
    await db.rpc(w.u.dios, 'admin_set_business_status', { p_business: id, p_status: 'suspended', p_note: 'Quejas' });
    await fails(put(w.u.luis, path(w.u.luis)), '42501');
  });
});
