import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  APP_URL,
  AZUL_PAYMENT_URLS,
  REQUEST_HASH_FIELDS,
  RESPONSE_HASH_FIELDS,
  appUrlFrom,
  azulAmount,
  azulHash,
  checkResponse,
  handlePayRequest,
  itbisIncluded,
  parsePayBody,
  paymentFields,
  pesosFromAzul,
  readAzulConfig,
  sameHash,
  type AzulConfig,
  type PayDeps,
} from '../../supabase/functions/azul-pay/core';

// Pruebas de la Edge Function azul-pay (su lógica vive en supabase/functions/azul-pay/core.ts). Lo de la base
// (begin_promotion_payment, finish_payment) se prueba en tests/sql/pagos-azul.test.ts. Valores ficticios: ni el
// comercio ni la clave existen.

const KEY = 'clave-de-prueba-12345678';
const CONFIG: AzulConfig = {
  merchantId: '39038540035',
  merchantName: 'MatchMate Prueba',
  merchantType: 'ECommerce',
  currencyCode: '$',
  authKey: KEY,
  env: 'pruebas',
  appUrl: 'https://app.ejemplo.test',
  itbisPct: 18,
};
const VENUE = '11111111-1111-4111-8111-111111111111';
const USER = '55555555-5555-4555-8555-555555555555';
const APP = 'https://app.ejemplo.test';

/** La referencia: Node (no Web Crypto), como el ejemplo de Azul en PHP (hash_hmac sobre UTF-16LE). */
const nodeHash = (text: string, key = KEY) => createHmac('sha512', key).update(Buffer.from(text, 'utf16le')).digest('hex');

/** Una respuesta de Azul firmada con la clave. */
function azulResponse(over: Record<string, string> = {}, key = KEY): Record<string, string> {
  const p: Record<string, string> = {
    OrderNumber: '1001',
    Amount: '250000',
    ITBIS: '38136',
    AuthorizationCode: 'OK0042',
    DateTime: '20261105103000',
    ResponseCode: 'ISO8583',
    IsoCode: '00',
    ResponseMessage: 'APROBADA',
    ErrorDescription: '',
    RRN: '2026110510300012345',
    AzulOrderId: '99887766',
    ...over,
  };
  p.AuthHash = nodeHash(RESPONSE_HASH_FIELDS.map((f) => p[f] ?? '').join('') + key, key);
  return p;
}

describe('formato de Azul', () => {
  it('montos en centavos sin punto; cero es 000', () => {
    expect(azulAmount(1500)).toBe('150000');
    expect(azulAmount(17483.21)).toBe('1748321');
    expect(azulAmount(10)).toBe('1000');
    expect(azulAmount(0)).toBe('000');
    expect(() => azulAmount(-1)).toThrow();
    expect(pesosFromAzul('150000')).toBe(1500);
    expect(pesosFromAzul('1748321')).toBe(17483.21);
    for (const bad of ['', '15.00', '-100', 'abc', null, undefined]) expect(pesosFromAzul(bad)).toBeNull();
  });

  it('el ITBIS que va dentro del precio', () => {
    expect(itbisIncluded(1180, 18)).toBe(180);
    expect(itbisIncluded(2500, 18)).toBe(381.36);
    expect(itbisIncluded(2500, 0)).toBe(0);
  });

  it('la firma es HMAC SHA-512 de UTF-16LE en hexadecimal minúscula (igual que Node), también con tildes', async () => {
    for (const text of ['hola', 'Pádel Los Prados ñ', '']) {
      const h = await azulHash(text, KEY);
      expect(h).toBe(nodeHash(text));
      expect(h).toMatch(/^[0-9a-f]{128}$/);
    }
    expect(sameHash('ABC', 'abc')).toBe(true);
    expect(sameHash('abc', 'abd')).toBe(false);
    expect(sameHash('abc', 'abcd')).toBe(false);
  });
});

describe('la configuración', () => {
  const read = (vars: Record<string, string>) => readAzulConfig((n) => vars[n]);
  const BASE = { AZUL_MERCHANT_ID: '39038540035', AZUL_MERCHANT_NAME: 'MatchMate', AZUL_AUTH_KEY: KEY };

  it('lo que falta, sin mostrar valores', () => {
    expect(read({})).toEqual({ error: 'faltan AZUL_MERCHANT_ID, AZUL_MERCHANT_NAME, AZUL_AUTH_KEY' });
    expect(read({ ...BASE, AZUL_ENV: 'prod' })).toEqual({ error: 'AZUL_ENV tiene que ser pruebas o produccion' });
    expect(read({ ...BASE, AZUL_ITBIS_PCT: 'mucho' })).toEqual({ error: 'AZUL_ITBIS_PCT no es un porcentaje' });
  });

  it('por defecto: pruebas, ECommerce, $, 18 % y la app de producción', () => {
    expect(read(BASE)).toEqual({
      config: { merchantId: '39038540035', merchantName: 'MatchMate', merchantType: 'ECommerce', currencyCode: '$', authKey: KEY, env: 'pruebas', appUrl: APP_URL, itbisPct: 18 },
    });
    const c = read({ ...BASE, AZUL_ENV: 'PRODUCCION', AZUL_ITBIS_PCT: '0', APP_ORIGIN: 'https://staging.ejemplo.test/' });
    expect(c).toMatchObject({ config: { env: 'produccion', itbisPct: 0, appUrl: 'https://staging.ejemplo.test' } });
    expect(appUrlFrom('javascript:alert(1)')).toBe(APP_URL);
    expect(AZUL_PAYMENT_URLS).toEqual({ pruebas: 'https://pruebas.azul.com.do/PaymentPage/', produccion: 'https://pagos.azul.com.do/PaymentPage/Default.aspx' });
  });
});

describe('el formulario (paymentFields)', () => {
  it('los campos del documento, la vuelta a la app y AuthHash en el orden de Azul con la AuthKey al final', async () => {
    const f = await paymentFields(CONFIG, { orderNumber: 1001, amount: 2500, days: 15 });
    expect(f).toMatchObject({
      MerchantId: '39038540035',
      MerchantName: 'MatchMate Prueba',
      MerchantType: 'ECommerce',
      CurrencyCode: '$',
      OrderNumber: '1001',
      Amount: '250000',
      ITBIS: '38136',
      ApprovedUrl: `${APP}/empresa/pago`,
      DeclinedUrl: `${APP}/empresa/pago`,
      CancelUrl: `${APP}/empresa/pago?cancelado=1001`,
      UseCustomField1: '0',
      UseCustomField2: '0',
      Locale: 'ES',
    });
    const text = REQUEST_HASH_FIELDS.map((k) => f[k]).join('') + KEY;
    // …CancelUrl + UseCustomField1 ('0', sin etiqueta ni valor) + UseCustomField2 ('0') + AuthKey.
    const cancel = `${APP}/empresa/pago?cancelado=1001`;
    expect(text).toBe(`39038540035MatchMate PruebaECommerce$100125000038136${APP}/empresa/pago${APP}/empresa/pago${cancel}00${KEY}`);
    expect(f.AuthHash).toBe(nodeHash(text));
    // La AuthKey nunca va en el formulario.
    expect(Object.values(f)).not.toContain(KEY);
    // Exento: ITBIS 000.
    expect((await paymentFields({ ...CONFIG, itbisPct: 0 }, { orderNumber: 7, amount: 100, days: 7 })).ITBIS).toBe('000');
  });
});

describe('la vuelta (checkResponse)', () => {
  it('aprobada (IsoCode 00) con lo que contestó Azul', async () => {
    expect(await checkResponse(azulResponse(), KEY)).toEqual({
      orderNumber: 1001,
      amount: 2500,
      status: 'approved',
      data: { authorizationCode: 'OK0042', rrn: '2026110510300012345', azulOrderId: '99887766', isoCode: '00', responseMessage: 'APROBADA' },
    });
  });

  it('declinada, o error si ResponseCode es Error (el mensaje sale de ErrorDescription si no hay otro)', async () => {
    expect(await checkResponse(azulResponse({ IsoCode: '51', ResponseMessage: 'DECLINADA', AuthorizationCode: '' }), KEY)).toMatchObject({ status: 'declined' });
    const err = await checkResponse(azulResponse({ IsoCode: '', ResponseCode: 'Error', ResponseMessage: '', ErrorDescription: 'VALIDATION_ERROR:Amount' }), KEY);
    expect(err).toMatchObject({ status: 'error', data: { responseMessage: 'VALIDATION_ERROR:Amount' } });
  });

  it('firma de otra clave, cambiada, ausente o un dato tocado: null', async () => {
    expect(await checkResponse(azulResponse({}, 'otra-clave'), KEY)).toBeNull();
    const good = azulResponse();
    expect(await checkResponse({ ...good, Amount: '100' }, KEY)).toBeNull();
    expect(await checkResponse({ ...good, IsoCode: '01' }, KEY)).toBeNull();
    expect(await checkResponse({ ...good, AuthHash: '' }, KEY)).toBeNull();
    expect(await checkResponse({ ...good, AuthHash: 'z'.repeat(128) }, KEY)).toBeNull();
    // Mayúsculas en la firma: igual.
    expect(await checkResponse({ ...good, AuthHash: good.AuthHash.toUpperCase() }, KEY)).not.toBeNull();
    // Bien firmada pero sin número de orden o monto que sirva.
    expect(await checkResponse(azulResponse({ OrderNumber: 'abc' }), KEY)).toBeNull();
    expect(await checkResponse(azulResponse({ Amount: '25.00' }), KEY)).toBeNull();
  });
});

describe('el cuerpo', () => {
  it('start y verify; lo demás no', () => {
    expect(parsePayBody(JSON.stringify({ action: 'start', venueId: VENUE.toUpperCase(), days: 15 }))).toEqual({ action: 'start', venueId: VENUE, days: 15 });
    expect(parsePayBody(JSON.stringify({ action: 'verify', params: { OrderNumber: '1' } }))).toEqual({ action: 'verify', params: { OrderNumber: '1' } });
    for (const bad of [
      'no es json',
      '[]',
      JSON.stringify({ action: 'start', venueId: 'x', days: 7 }),
      JSON.stringify({ action: 'start', venueId: VENUE, days: 0 }),
      JSON.stringify({ action: 'start', venueId: VENUE, days: 7.5 }),
      JSON.stringify({ action: 'verify', params: { OrderNumber: 1 } }),
      JSON.stringify({ action: 'verify', params: { OrderNumber: 'x'.repeat(501) } }),
      JSON.stringify({ action: 'pagar' }),
    ]) {
      expect(parsePayBody(bad)).toBeNull();
    }
  });
});

describe('la función (handlePayRequest)', () => {
  const claims = { sub: USER, role: 'authenticated' };
  function deps(patch: Partial<PayDeps> = {}): PayDeps & { calls: unknown[][] } {
    const calls: unknown[][] = [];
    return {
      allowedOrigins: [APP],
      config: CONFIG,
      getClaims: async () => ({ data: { claims }, error: null }),
      begin: async (token, venueId, days) => {
        calls.push(['begin', token, venueId, days]);
        return { data: { orderNumber: 1001, amount: 2500, days, venueName: 'Pádel Los Prados' }, error: null };
      },
      finish: async (order, status, amount, data) => {
        calls.push(['finish', order, status, amount, data]);
        return { data: { status, venueId: VENUE, endsAt: '2026-11-20T10:30:00Z', days: 15, amount }, error: null };
      },
      ...patch,
      calls,
    };
  }
  const JWT = 'aaa.bbb.ccc';
  const req = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://x.supabase.co/functions/v1/azul-pay', {
      method: 'POST',
      headers: { origin: APP, authorization: `Bearer ${JWT}`, 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const json = async (r: Response) => ({ status: r.status, body: await r.json() });

  it('start: la base con el JWT de la cuenta → url de pruebas y el formulario firmado', async () => {
    const d = deps();
    const res = await json(await handlePayRequest(req({ action: 'start', venueId: VENUE, days: 15 }), d));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ url: AZUL_PAYMENT_URLS.pruebas, orderNumber: 1001, amount: 2500, fields: { OrderNumber: '1001', Amount: '250000' } });
    expect(res.body.fields.AuthHash).toMatch(/^[0-9a-f]{128}$/);
    expect(d.calls).toEqual([['begin', JWT, VENUE, 15]]);
  });

  it('start: sin sesión 401; errores de la base a su código', async () => {
    expect((await json(await handlePayRequest(req({ action: 'start', venueId: VENUE, days: 7 }, { authorization: '' }), deps()))).status).toBe(401);
    const anon = deps({ getClaims: async () => ({ data: { claims: { sub: USER, role: 'anon' } }, error: null }) });
    expect((await json(await handlePayRequest(req({ action: 'start', venueId: VENUE, days: 7 }), anon))).status).toBe(401);
    for (const [message, status, code] of [
      ['no_permitido', 403, 'no_permitido'],
      ['invalido', 400, 'invalido'],
      ['rate_limited', 429, 'rate_limited'],
      ['algo raro', 500, 'servidor'],
    ] as const) {
      const d = deps({ begin: async () => ({ data: null, error: { message } }) });
      const res = await json(await handlePayRequest(req({ action: 'start', venueId: VENUE, days: 7 }), d));
      expect(res).toMatchObject({ status, body: { code } });
    }
  });

  it('verify: sin JWT, con la firma de Azul → finish_payment con el ITBIS', async () => {
    const d = deps();
    const res = await json(await handlePayRequest(req({ action: 'verify', params: azulResponse() }, { authorization: '' }), d));
    expect(res).toEqual({ status: 200, body: { status: 'approved', venueId: VENUE, endsAt: '2026-11-20T10:30:00Z', days: 15, amount: 2500, orderNumber: 1001 } });
    expect(d.calls).toEqual([
      ['finish', 1001, 'approved', 2500, { authorizationCode: 'OK0042', rrn: '2026110510300012345', azulOrderId: '99887766', isoCode: '00', responseMessage: 'APROBADA', itbis: 381.36 }],
    ]);
  });

  it('verify: firma mala 403 sin tocar la base; monto distinto 403; orden que no existe 404', async () => {
    const d = deps();
    expect(await json(await handlePayRequest(req({ action: 'verify', params: azulResponse({}, 'otra') }), d))).toMatchObject({ status: 403, body: { code: 'firma' } });
    expect(d.calls).toEqual([]);
    const other = deps({ finish: async () => ({ data: null, error: { message: 'invalido' } }) });
    expect(await json(await handlePayRequest(req({ action: 'verify', params: azulResponse() }), other))).toMatchObject({ status: 403, body: { code: 'firma' } });
    const none = deps({ finish: async () => ({ data: null, error: null }) });
    expect(await json(await handlePayRequest(req({ action: 'verify', params: azulResponse() }), none))).toMatchObject({ status: 404, body: { code: 'no_existe' } });
  });

  it('CORS, método, cuerpo y configuración', async () => {
    const other = await handlePayRequest(req({ action: 'start', venueId: VENUE, days: 7 }, { origin: 'https://otra.test' }), deps());
    expect(other.status).toBe(403);
    const pre = await handlePayRequest(new Request('https://x.supabase.co/functions/v1/azul-pay', { method: 'OPTIONS', headers: { origin: APP } }), deps());
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(APP);
    const get = await handlePayRequest(new Request('https://x.supabase.co/functions/v1/azul-pay', { headers: { origin: APP } }), deps());
    expect(get.status).toBe(405);
    expect((await json(await handlePayRequest(req('nada'), deps()))).status).toBe(400);
    expect((await json(await handlePayRequest(req({ action: 'verify', params: { x: 'y'.repeat(400) }, more: 'z'.repeat(9000) }), deps()))).status).toBe(400);
    const off = await json(await handlePayRequest(req({ action: 'start', venueId: VENUE, days: 7 }), deps({ config: null, configError: 'faltan AZUL_AUTH_KEY' })));
    expect(off).toMatchObject({ status: 500, body: { code: 'config' } });
    expect(JSON.stringify(off.body)).not.toContain('AZUL_AUTH_KEY');
  });
});
