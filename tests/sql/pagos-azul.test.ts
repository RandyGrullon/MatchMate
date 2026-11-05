/**
 * Pagos con Azul (20261105000200_pagos_azul.sql): los precios por días que pone el superadmin, empezar el pago de una
 * promoción (la dueña), la respuesta ya revisada por azul-pay (solo service_role: activa la promoción y es segura de
 * repetir), cancelar al volver de Azul y lo que ve la consola.
 *
 * Mundo (fixture): luis y ana miembros de la liga privada del Banco; extra sin liga; dios es superadmin.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

let db: TestDb;
let w: World;
let biz: { id: string; venue: string };

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
  const id = await db.rpc<string>(w.u.luis, 'register_business', { p_name: 'Club Los Prados', p_city: 'Santo Domingo' });
  const venue = await db.rpc<{ id: string }>(w.u.luis, 'save_venue', {
    p_id: null,
    p_sport: 'padel',
    p_name: 'Pádel Los Prados',
    p_city: 'Santo Domingo',
    p_details: { canchas: 4 },
  });
  await db.rpc(w.u.dios, 'admin_set_business_status', { p_business: id, p_status: 'approved' });
  biz = { id, venue: venue.id };
});
afterEach(async () => {
  await db.rollback();
});

const setPrice = (days: number, amount: number | null) =>
  db.rpc<Json[]>(w.u.dios, 'admin_set_promotion_price', { p_days: days, p_amount: amount });
const begin = (who: string, days = 7, venue = biz.venue) =>
  db.rpc<Json>(who, 'begin_promotion_payment', { p_venue: venue, p_days: days });
const finish = (order: number, status: string, amount: number | string, data: Json = {}) =>
  db.rpc<Json>(SERVICE, 'finish_payment', { p_order: order, p_status: status, p_amount: amount, p_data: data });
const payment = async (order: number) =>
  (await db.admin<Json>('select * from public.payments where order_number = $1', [order]))[0];
const promotion = async (id: string) => (await db.admin<Json>('select * from public.venue_promotions where id = $1', [id]))[0];

describe('precios', () => {
  it('el superadmin los pone, los cambia y los quita; queda en la auditoría', async () => {
    expect(await setPrice(30, 4500)).toEqual([{ days: 30, amount: 4500 }]);
    expect(await setPrice(7, 1500.456)).toEqual([{ days: 7, amount: 1500.46 }, { days: 30, amount: 4500 }]);
    expect(await setPrice(7, 1200)).toEqual([{ days: 7, amount: 1200 }, { days: 30, amount: 4500 }]);
    expect(await setPrice(30, null)).toEqual([{ days: 7, amount: 1200 }]);
    expect(await db.rpc(w.u.luis, 'promotion_prices')).toEqual([{ days: 7, amount: 1200 }]);
    const audit = await db.admin<Json>(`select action, target_type, target_id from public.admin_audit where action = 'promotion_price' order by id`);
    expect(audit).toHaveLength(4);
    expect(audit[0]).toMatchObject({ target_type: 'app', target_id: '30' });
  });

  it('valida y solo el superadmin; leerlos pide sesión', async () => {
    for (const [days, amount] of [[0, 100], [366, 100], [7, 0], [7, -5], [7, 1000001]]) await fails(setPrice(days, amount), INVALID);
    await fails(db.rpc(w.u.luis, 'admin_set_promotion_price', { p_days: 7, p_amount: 100 }), DENIED);
    await fails(db.rpc(ANON, 'promotion_prices'), DENIED);
    expect(await db.rpc(w.u.extra, 'promotion_prices')).toEqual([]);
  });
});

describe('empezar el pago', () => {
  it('con un precio vigente: pide la promoción y deja el pago pendiente con el monto de la base', async () => {
    await setPrice(15, 2500);
    const started = await begin(w.u.luis, 15);
    expect(started).toMatchObject({ amount: 2500, days: 15, venueName: 'Pádel Los Prados' });
    expect(typeof started.orderNumber).toBe('number');
    const p = await payment(started.orderNumber);
    expect(p).toMatchObject({ business_id: biz.id, status: 'pending', amount: '2500.00', itbis: '0.00', created_by: w.u.luis, provider: 'azul' });
    expect(await promotion(p.promotion_id)).toMatchObject({ venue_id: biz.venue, status: 'requested', days: 15, note: 'Pago con Azul' });
  });

  it('usa la que ya estaba pedida (con los días nuevos) y cancela el pago pendiente de antes', async () => {
    await setPrice(7, 1000);
    await setPrice(30, 3000);
    const asked = await db.rpc<Json>(w.u.luis, 'request_promotion', { p_venue: biz.venue, p_days: 7, p_note: 'Para el torneo' });
    const first = await begin(w.u.luis, 7);
    const second = await begin(w.u.luis, 30);
    expect(second.orderNumber).toBeGreaterThan(first.orderNumber);
    expect(await payment(first.orderNumber)).toMatchObject({ status: 'cancelled', promotion_id: asked.promotion.id });
    expect(await payment(second.orderNumber)).toMatchObject({ status: 'pending', promotion_id: asked.promotion.id, amount: '3000.00' });
    expect(await promotion(asked.promotion.id)).toMatchObject({ status: 'requested', days: 30, note: 'Para el torneo' });
    expect(await db.count('public.venue_promotions', 'venue_id = $1', [biz.venue])).toBe(1);
  });

  it('sin precio para esos días no; solo la dueña de una empresa aprobada; sin cuenta no', async () => {
    await setPrice(7, 1000);
    await fails(begin(w.u.luis, 15), INVALID);
    await fails(begin(w.u.ana), 'no_permitido');
    await fails(begin(ANON), DENIED);
    await db.rpc(w.u.dios, 'admin_set_business_status', { p_business: biz.id, p_status: 'suspended', p_note: 'Fotos falsas' });
    await fails(begin(w.u.luis), 'no_permitido');
    expect(await db.count('public.payments')).toBe(0);
  });

  it('hasta 10 intentos por hora', async () => {
    await setPrice(7, 1000);
    for (let i = 0; i < 10; i++) await begin(w.u.luis);
    await fails(begin(w.u.luis), 'rate_limited');
  });
});

describe('la respuesta de Azul (finish_payment)', () => {
  it('aprobado: activa la promoción desde ahora con lo pagado y guarda lo que contestó Azul; repetir no cambia nada', async () => {
    await setPrice(7, 1500);
    const { orderNumber } = await begin(w.u.luis);
    const data = { authorizationCode: 'OK1234', rrn: '2026110512345', azulOrderId: '987654', isoCode: '00', responseMessage: 'APROBADA' };
    const done = await finish(orderNumber, 'approved', '1500.00', { ...data, itbis: 228.81 });
    expect(done).toMatchObject({ status: 'approved', venueId: biz.venue, days: 7, amount: 1500 });
    const p = await payment(orderNumber);
    expect(p).toMatchObject({ status: 'approved', authorization_code: 'OK1234', rrn: '2026110512345', azul_order_id: '987654', iso_code: '00', response_message: 'APROBADA', itbis: '228.81' });
    const promo = await promotion(p.promotion_id);
    expect(promo).toMatchObject({ status: 'active', amount: '1500.00' });
    const days = (new Date(promo.ends_at).getTime() - new Date(promo.starts_at).getTime()) / 86_400_000;
    expect(days).toBe(7);
    // Sale destacado en Dónde jugar.
    const found = await db.rpc<{ rows: Json[] }>(ANON, 'search_venues', {});
    expect(found.rows[0]).toMatchObject({ id: biz.venue });
    expect(found.rows[0].featuredUntil).toBeTruthy();

    // Otra vez (la persona recargó la página de vuelta): igual.
    expect(await finish(orderNumber, 'approved', 1500, data)).toMatchObject({ status: 'approved', endsAt: done.endsAt });
    expect(await finish(orderNumber, 'declined', 1500)).toMatchObject({ status: 'approved' });
    expect(await promotion(p.promotion_id)).toMatchObject({ status: 'active', ends_at: promo.ends_at });
  });

  it('si ya estaba destacado, la pagada empieza cuando termina la que va', async () => {
    await setPrice(7, 1500);
    await db.rpc(w.u.dios, 'admin_grant_promotion', { p_venue: biz.venue, p_days: 3 });
    const { orderNumber } = await begin(w.u.luis);
    await finish(orderNumber, 'approved', 1500);
    const rows = await db.admin<Json>(
      `select starts_at, ends_at from public.venue_promotions where venue_id = $1 and status = 'active' order by starts_at`,
      [biz.venue],
    );
    expect(rows).toHaveLength(2);
    expect(new Date(rows[1].starts_at).getTime()).toBe(new Date(rows[0].ends_at).getTime());
    expect((new Date(rows[1].ends_at).getTime() - new Date(rows[0].starts_at).getTime()) / 86_400_000).toBe(10);
  });

  it('declinado o error: queda anotado y la promoción sigue pedida; si después se aprueba, se activa', async () => {
    await setPrice(7, 1500);
    const { orderNumber } = await begin(w.u.luis);
    expect(await finish(orderNumber, 'declined', 1500, { isoCode: '51', responseMessage: 'DECLINADA' })).toMatchObject({ status: 'declined' });
    const p = await payment(orderNumber);
    expect(p).toMatchObject({ status: 'declined', iso_code: '51', response_message: 'DECLINADA', authorization_code: null });
    expect(await promotion(p.promotion_id)).toMatchObject({ status: 'requested' });
    expect(await finish(orderNumber, 'error', 1500)).toMatchObject({ status: 'declined' });
    expect(await finish(orderNumber, 'approved', 1500, { authorizationCode: 'OK1' })).toMatchObject({ status: 'approved' });
    expect(await promotion(p.promotion_id)).toMatchObject({ status: 'active' });
  });

  it('el monto tiene que ser el cobrado; un número que no existe da null; el estado se valida', async () => {
    await setPrice(7, 1500);
    const { orderNumber } = await begin(w.u.luis);
    await fails(finish(orderNumber, 'approved', 15), INVALID);
    await fails(finish(orderNumber, 'approved', 1500.01), INVALID);
    await fails(finish(orderNumber, 'pending', 1500), INVALID);
    await fails(finish(orderNumber, 'cancelled', 1500), INVALID);
    expect(await finish(orderNumber + 999, 'approved', 1500)).toBeNull();
    expect(await payment(orderNumber)).toMatchObject({ status: 'pending' });
    // Un ITBIS que no es un número entre 0 y el monto no se guarda.
    await finish(orderNumber, 'declined', 1500, { itbis: 9999 });
    expect(await payment(orderNumber)).toMatchObject({ status: 'declined', itbis: '0.00' });
  });

  it('solo la clave secreta (azul-pay): ni la dueña, ni el superadmin, ni sin cuenta', async () => {
    await setPrice(7, 1500);
    const { orderNumber } = await begin(w.u.luis);
    for (const who of [w.u.luis, w.u.dios, ANON]) {
      await fails(db.rpc(who, 'finish_payment', { p_order: orderNumber, p_status: 'approved', p_amount: 1500 }), '42501');
    }
    expect(await payment(orderNumber)).toMatchObject({ status: 'pending' });
  });
});

describe('cancelar al volver', () => {
  it('solo el pago pendiente de la propia cuenta; la promoción sigue pedida', async () => {
    await setPrice(7, 1500);
    const { orderNumber } = await begin(w.u.luis);
    expect(await db.rpc(w.u.ana, 'cancel_payment', { p_order: orderNumber })).toBe(false);
    await fails(db.rpc(ANON, 'cancel_payment', { p_order: orderNumber }), DENIED);
    expect(await db.rpc(w.u.luis, 'cancel_payment', { p_order: orderNumber })).toBe(true);
    expect(await db.rpc(w.u.luis, 'cancel_payment', { p_order: orderNumber })).toBe(false);
    const p = await payment(orderNumber);
    expect(p.status).toBe('cancelled');
    expect(await promotion(p.promotion_id)).toMatchObject({ status: 'requested' });
    // Si Azul igual lo aprobó (volvió atrás y pagó), cuenta.
    expect(await finish(orderNumber, 'approved', 1500)).toMatchObject({ status: 'approved' });
  });
});

describe('la consola', () => {
  it('admin_payments con filtro y lo cobrado; admin_business trae sus pagos', async () => {
    await setPrice(7, 1500);
    await setPrice(30, 4000);
    const a = await begin(w.u.luis);
    await finish(a.orderNumber, 'approved', 1500, { authorizationCode: 'OK1' });
    const b = await begin(w.u.luis, 30);
    await finish(b.orderNumber, 'declined', 4000, { responseMessage: 'DECLINADA' });
    const c = await begin(w.u.luis, 30);

    const all = await db.rpc<Json>(w.u.dios, 'admin_payments', {});
    expect(all).toMatchObject({ total: 3, approvedTotal: 1500 });
    expect(all.rows.map((r: Json) => r.orderNumber)).toEqual([c.orderNumber, b.orderNumber, a.orderNumber]);
    expect(all.rows[2]).toMatchObject({ businessName: 'Club Los Prados', amount: 1500, status: 'approved', authorizationCode: 'OK1' });
    const declined = await db.rpc<Json>(w.u.dios, 'admin_payments', { p_status: 'declined' });
    expect(declined).toMatchObject({ total: 1, rows: [{ orderNumber: b.orderNumber, responseMessage: 'DECLINADA' }] });
    await fails(db.rpc(w.u.dios, 'admin_payments', { p_status: 'otro' }), INVALID);

    const one = await db.rpc<Json>(w.u.dios, 'admin_business', { p_business: biz.id });
    expect(one.payments.map((r: Json) => r.status)).toEqual(['pending', 'declined', 'approved']);
    expect(one.paid).toBe(1500);
  });

  it('nadie lee ni escribe las tablas directo', async () => {
    for (const who of [w.u.luis, w.u.dios, ANON]) {
      await fails(db.as(who, 'select * from public.payments'), '42501');
      await fails(db.as(who, 'select * from public.promotion_prices'), '42501');
      await fails(db.as(who, `insert into public.promotion_prices (days, amount) values (7, 1)`), '42501');
    }
  });

  it('borrar la empresa deja el pago (sin empresa) para las cuentas de la app', async () => {
    await setPrice(7, 1500);
    const { orderNumber } = await begin(w.u.luis);
    await finish(orderNumber, 'approved', 1500);
    await db.rpc(w.u.luis, 'delete_business');
    const p = await payment(orderNumber);
    expect(p).toMatchObject({ status: 'approved', business_id: null, business_name: 'Club Los Prados', amount: '1500.00' });
    expect(await db.count('public.venue_promotions', 'id = $1', [p.promotion_id])).toBe(0);
    const all = await db.rpc<Json>(w.u.dios, 'admin_payments', {});
    expect(all.rows[0]).toMatchObject({ businessId: null, businessName: 'Club Los Prados' });
  });
});
