/**
 * Edge Function `azul-pay`: cobrar con la Página de Pagos de Azul que un espacio salga destacado
 * (docs/empresas.md › Pagos con Azul). Toda la lógica está aquí; index.ts solo arma las dependencias.
 * TypeScript puro y SIN imports (Deno exige la extensión `.ts` en las rutas y el tsc de la app no la acepta). Lo usan
 * la función, el modo local (src/lib/backend/local.ts, con una clave de prueba) y las pruebas
 * (src/lib/azulPayFunction.test.ts).
 *
 * El contrato de Azul (Documento E-Commerce AZUL Página de Pagos, 2023-08):
 * - El navegador de la persona hace un POST (formulario) a la Página de Pagos con los campos de `paymentFields`.
 *   `AuthHash` = HMAC SHA-512, en hexadecimal minúscula, de los campos de `REQUEST_HASH_FIELDS` uno detrás del otro y
 *   al final la AuthKey, en UTF-16LE (`Encoding.Unicode` de .NET), con la AuthKey de clave. La AuthKey nunca viaja.
 * - Montos sin punto ni coma: los dos últimos dígitos son los centavos (1000 = RD$10.00; el ITBIS igual, 000 = 0).
 * - Al terminar, Azul manda al navegador a ApprovedUrl o DeclinedUrl con la respuesta en el query string, firmada igual
 *   con los campos de `RESPONSE_HASH_FIELDS`. CancelUrl llega sin parámetros (por eso lleva el número de orden).
 * - No hay aviso de servidor a servidor: si la persona cierra el navegador antes de volver, el pago queda pendiente
 *   y el superadmin lo revisa en el portal de Azul.
 *
 * La función (POST con JSON, CORS solo para los orígenes de la app, SCAN_ALLOWED_ORIGINS):
 * 1. `{action: 'start', venueId, days}` con el JWT de la cuenta: `begin_promotion_payment` COMO LA CUENTA (la base
 *    pone el precio y revisa que sea la dueña de una empresa aprobada) → `{url, fields}` para el formulario.
 * 2. `{action: 'verify', params}` (lo que trajo la vuelta, sin JWT: lo protege la firma de Azul): revisa la firma, el
 *    número de orden y el monto, y llama `finish_payment` con la clave secreta → `{status, venueId, endsAt, days,
 *    amount}`. Aprobado = IsoCode '00' (tabla de códigos del documento); lo demás, declinado (o error si
 *    ResponseCode = 'Error').
 *
 * Respuestas de error (JSON `{code, message}`): 400 invalido · 401 sesion · 403 no_permitido/firma · 404 no_existe ·
 * 429 rate_limited · 500 config/servidor.
 */

export const AZUL_PAYMENT_URLS = {
  pruebas: 'https://pruebas.azul.com.do/PaymentPage/',
  produccion: 'https://pagos.azul.com.do/PaymentPage/Default.aspx',
} as const;
export type AzulEnv = keyof typeof AZUL_PAYMENT_URLS;

/** Producción. Si existe APP_ORIGIN (staging), gana ella (igual que esports-auth). */
export const APP_URL = 'https://matchmate.grullonb.com';
/** La pantalla de la app a la que vuelve Azul (src/pages/business/PaymentReturnPage.tsx). */
export const RETURN_PATH = '/empresa/pago';

export const REQUEST_HASH_FIELDS = [
  'MerchantId',
  'MerchantName',
  'MerchantType',
  'CurrencyCode',
  'OrderNumber',
  'Amount',
  'ITBIS',
  'ApprovedUrl',
  'DeclinedUrl',
  'CancelUrl',
  'UseCustomField1',
  'CustomField1Label',
  'CustomField1Value',
  'UseCustomField2',
  'CustomField2Label',
  'CustomField2Value',
] as const;

export const RESPONSE_HASH_FIELDS = [
  'OrderNumber',
  'Amount',
  'AuthorizationCode',
  'DateTime',
  'ResponseCode',
  'IsoCode',
  'ResponseMessage',
  'ErrorDescription',
  'RRN',
] as const;

export interface AzulConfig {
  merchantId: string;
  /** Lo que la Página de Pagos muestra arriba. */
  merchantName: string;
  merchantType: string;
  /** Lo da Azul con el acceso a cada ambiente ('$' = pesos). */
  currencyCode: string;
  authKey: string;
  env: AzulEnv;
  /** El origen de la app al que vuelve Azul (tiene que estar autorizado en Azul). */
  appUrl: string;
  /** ITBIS incluido en el precio (18 por defecto; 0 = exento). */
  itbisPct: number;
}

const ORIGIN = /^https?:\/\/[^/\s?#]+$/i;

export function appUrlFrom(appOrigin: string | undefined | null): string {
  const o = (appOrigin ?? '').trim().replace(/\/+$/, '');
  return ORIGIN.test(o) ? o : APP_URL;
}

/** Los secretos de la función → la configuración, o qué falta (sin mostrar ningún valor). */
export function readAzulConfig(get: (name: string) => string | undefined | null): { config: AzulConfig } | { error: string } {
  const val = (name: string) => (get(name) ?? '').trim();
  const missing = ['AZUL_MERCHANT_ID', 'AZUL_MERCHANT_NAME', 'AZUL_AUTH_KEY'].filter((n) => !val(n));
  if (missing.length) return { error: `faltan ${missing.join(', ')}` };
  const env = (val('AZUL_ENV') || 'pruebas').toLowerCase();
  if (env !== 'pruebas' && env !== 'produccion') return { error: 'AZUL_ENV tiene que ser pruebas o produccion' };
  const pctText = val('AZUL_ITBIS_PCT');
  const itbisPct = pctText === '' ? 18 : Number(pctText);
  if (!Number.isFinite(itbisPct) || itbisPct < 0 || itbisPct > 50) return { error: 'AZUL_ITBIS_PCT no es un porcentaje' };
  return {
    config: {
      merchantId: val('AZUL_MERCHANT_ID'),
      merchantName: val('AZUL_MERCHANT_NAME'),
      merchantType: val('AZUL_MERCHANT_TYPE') || 'ECommerce',
      currencyCode: val('AZUL_CURRENCY_CODE') || '$',
      authKey: val('AZUL_AUTH_KEY'),
      env,
      appUrl: appUrlFrom(get('APP_ORIGIN')),
      itbisPct,
    },
  };
}

/** Pesos → el formato de Azul: centavos sin punto (1500 → '150000'); cero es '000'. */
export function azulAmount(pesos: number): string {
  const cents = Math.round(pesos * 100);
  if (!Number.isFinite(cents) || cents < 0) throw new Error('monto inválido');
  return cents === 0 ? '000' : String(cents);
}

/** El formato de Azul → pesos ('150000' → 1500), o null si no es un monto. */
export function pesosFromAzul(value: string | null | undefined): number | null {
  const v = (value ?? '').trim();
  if (!/^\d{1,12}$/.test(v)) return null;
  return Number(v) / 100;
}

/** El ITBIS que va dentro de un precio que ya lo incluye (RD$1,180 al 18 % → 180). */
export function itbisIncluded(pesos: number, pct: number): number {
  if (!pct) return 0;
  const cents = Math.round(pesos * 100);
  return Math.round(cents - cents / (1 + pct / 100)) / 100;
}

/** HMAC SHA-512 en hexadecimal minúscula del texto en UTF-16LE, con la clave en UTF-8 (es ASCII). */
export async function azulHash(text: string, authKey: string): Promise<string> {
  const message = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    message[i * 2] = c & 0xff;
    message[i * 2 + 1] = c >> 8;
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compara sin cortar en la primera diferencia (que el tiempo no diga cuánto se acertó). */
export function sameHash(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export interface PaymentOrder {
  orderNumber: number;
  /** RD$, ITBIS incluido. */
  amount: number;
  days: number;
  venueName?: string;
}

/** Los campos del formulario que va a Azul (con AuthHash). Sin campos personalizados (UseCustomField = '0'). */
export async function paymentFields(config: AzulConfig, order: PaymentOrder): Promise<Record<string, string>> {
  const back = `${config.appUrl}${RETURN_PATH}`;
  const fields: Record<string, string> = {
    MerchantId: config.merchantId,
    MerchantName: config.merchantName,
    MerchantType: config.merchantType,
    CurrencyCode: config.currencyCode,
    OrderNumber: String(order.orderNumber),
    Amount: azulAmount(order.amount),
    ITBIS: azulAmount(itbisIncluded(order.amount, config.itbisPct)),
    ApprovedUrl: back,
    DeclinedUrl: back,
    CancelUrl: `${back}?cancelado=${order.orderNumber}`,
    UseCustomField1: '0',
    CustomField1Label: '',
    CustomField1Value: '',
    UseCustomField2: '0',
    CustomField2Label: '',
    CustomField2Value: '',
  };
  fields.AuthHash = await azulHash(REQUEST_HASH_FIELDS.map((f) => fields[f]).join('') + config.authKey, config.authKey);
  return { ...fields, Locale: 'ES' };
}

export type AzulResult = 'approved' | 'declined' | 'error';

export interface CheckedResponse {
  orderNumber: number;
  amount: number;
  status: AzulResult;
  data: {
    authorizationCode: string;
    rrn: string;
    azulOrderId: string;
    isoCode: string;
    responseMessage: string;
  };
}

/** La vuelta de Azul (query string) → lo que pasó, o null si la firma no es de Azul o le falta algo. */
export async function checkResponse(params: Record<string, string>, authKey: string): Promise<CheckedResponse | null> {
  const get = (k: string) => (typeof params[k] === 'string' ? params[k] : '');
  const hash = get('AuthHash');
  if (!/^[0-9a-f]{128}$/i.test(hash)) return null;
  const expected = await azulHash(RESPONSE_HASH_FIELDS.map(get).join('') + authKey, authKey);
  if (!sameHash(expected, hash)) return null;
  const order = get('OrderNumber').trim();
  const amount = pesosFromAzul(get('Amount'));
  if (!/^\d{1,18}$/.test(order) || amount === null) return null;
  const iso = get('IsoCode').trim();
  const status: AzulResult = iso === '00' ? 'approved' : get('ResponseCode').trim().toLowerCase() === 'error' ? 'error' : 'declined';
  return {
    orderNumber: Number(order),
    amount,
    status,
    data: {
      authorizationCode: get('AuthorizationCode').trim(),
      rrn: get('RRN').trim(),
      azulOrderId: get('AzulOrderId').trim(),
      isoCode: iso,
      responseMessage: (get('ResponseMessage').trim() || get('ErrorDescription').trim()).slice(0, 200),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// La función
// ---------------------------------------------------------------------------------------------------------------

export type PayFailureCode = 'invalido' | 'sesion' | 'no_permitido' | 'firma' | 'no_existe' | 'rate_limited' | 'config' | 'servidor';

export interface PayFailure {
  code: PayFailureCode;
  message: string;
}

export const PAY_STATUS: Record<PayFailureCode, number> = {
  invalido: 400,
  sesion: 401,
  no_permitido: 403,
  firma: 403,
  no_existe: 404,
  rate_limited: 429,
  config: 500,
  servidor: 500,
};

export const PAY_MESSAGES: Record<PayFailureCode, string> = {
  invalido: 'Esa promoción no tiene precio. Elige otra cantidad de días.',
  sesion: 'Tu sesión venció. Entra de nuevo para pagar.',
  no_permitido: 'Solo la dueña de una empresa aprobada puede pagar para destacar sus espacios.',
  firma: 'No pudimos confirmar ese pago con Azul. Si te cobraron, escríbenos con el número de orden.',
  no_existe: 'Ese pago no existe.',
  rate_limited: 'Ya intentaste pagar muchas veces. Espera un rato.',
  config: 'El pago con Azul no está listo todavía. Pide la promoción y te escribimos.',
  servidor: 'No se pudo hablar con el servidor. Intenta de nuevo en un rato.',
};

const fail = (code: PayFailureCode): PayFailure => ({ code, message: PAY_MESSAGES[code] });

export interface DbError {
  message?: string;
  code?: string;
  status?: number;
}

export interface PayDeps {
  allowedOrigins: string[];
  config: AzulConfig | null;
  /** Lo que falta configurar (sin valores). */
  configError?: string | null;
  getClaims(token: string): Promise<{ data: { claims?: Record<string, unknown> | null } | null; error: unknown }>;
  /** `begin_promotion_payment` con el JWT de la cuenta. */
  begin(token: string, venueId: string, days: number): Promise<{ data: unknown; error: DbError | null }>;
  /** `finish_payment` con la clave secreta. */
  finish(order: number, status: AzulResult, amount: number, data: Record<string, unknown>): Promise<{ data: unknown; error: DbError | null }>;
  log?(message: string, extra?: unknown): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const MAX_BODY_CHARS = 8192;

export const CORS_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage';

/** Orígenes exactos separados por coma o espacios (sin la barra final). */
export function parseOrigins(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o, i, all) => ORIGIN.test(o) && all.indexOf(o) === i);
}

/** Cabeceras CORS para ese origen, o null si no es de la app. */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

/** Error de la base → respuesta. */
export function dbFailure(e: DbError): PayFailure {
  const msg = (e.message ?? '').trim();
  for (const code of ['no_permitido', 'invalido', 'rate_limited'] as const) if (msg.startsWith(code)) return fail(code);
  if (msg.startsWith('bloqueada')) return { code: 'no_permitido', message: 'bloqueada' };
  if (e.code === '42501' || e.status === 401 || /jwt|token/i.test(msg)) return fail('sesion');
  return fail('servidor');
}

/** `{action, ...}` → lo que pide, o null si no tiene forma. */
export function parsePayBody(
  text: string,
): { action: 'start'; venueId: string; days: number } | { action: 'verify'; params: Record<string, string> } | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'start') {
    const days = b.days;
    if (typeof b.venueId !== 'string' || !UUID.test(b.venueId) || typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
      return null;
    }
    return { action: 'start', venueId: b.venueId.toLowerCase(), days };
  }
  if (b.action === 'verify') {
    const p = b.params;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v !== 'string' || v.length > 500 || k.length > 40) return null;
      params[k] = v;
    }
    return { action: 'verify', params };
  }
  return null;
}

async function verifyUser(deps: PayDeps, authorization: string | null): Promise<string | PayFailure> {
  const token = JWT.exec(authorization ?? '')?.[1];
  if (!token) return fail('sesion');
  let res: Awaited<ReturnType<PayDeps['getClaims']>>;
  try {
    res = await deps.getClaims(token);
  } catch (e) {
    deps.log?.('[azul-pay] getClaims falló', e);
    return fail('servidor');
  }
  if (res.error) {
    const err = res.error as { name?: string; status?: number };
    return err.name === 'AuthRetryableFetchError' || (err.status ?? 0) >= 500 ? fail('servidor') : fail('sesion');
  }
  const claims = res.data?.claims ?? null;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !UUID.test(sub) || claims?.role !== 'authenticated' || claims?.is_anonymous === true) return fail('sesion');
  return token;
}

/** Empezar: la base pone el precio → el formulario firmado. */
export async function startPayment(
  deps: Pick<PayDeps, 'begin' | 'log'>,
  config: AzulConfig,
  token: string,
  venueId: string,
  days: number,
): Promise<{ url: string; fields: Record<string, string>; order: PaymentOrder } | PayFailure> {
  const res = await deps.begin(token, venueId, days);
  if (res.error) return dbFailure(res.error);
  const o = res.data as Partial<PaymentOrder> | null;
  if (!o || typeof o.orderNumber !== 'number' || typeof o.amount !== 'number' || !(o.amount > 0)) {
    deps.log?.('[azul-pay] begin_promotion_payment devolvió algo raro', o);
    return fail('servidor');
  }
  const order: PaymentOrder = { orderNumber: o.orderNumber, amount: o.amount, days: Number(o.days) || days, venueName: o.venueName };
  return { url: AZUL_PAYMENT_URLS[config.env], fields: await paymentFields(config, order), order };
}

/** La vuelta: firma, número y monto → finish_payment. */
export async function verifyPayment(
  deps: Pick<PayDeps, 'finish' | 'log'>,
  config: AzulConfig,
  params: Record<string, string>,
): Promise<{ result: Record<string, unknown> } | PayFailure> {
  const checked = await checkResponse(params, config.authKey);
  if (!checked) {
    deps.log?.('[azul-pay] firma de la respuesta no coincide', { order: params.OrderNumber ?? null });
    return fail('firma');
  }
  const res = await deps.finish(checked.orderNumber, checked.status, checked.amount, {
    ...checked.data,
    itbis: itbisIncluded(checked.amount, config.itbisPct),
  });
  if (res.error) {
    // El monto no es el cobrado (finish_payment da 'invalido'): es la misma firma de Azul con otro pago.
    if ((res.error.message ?? '').startsWith('invalido')) return fail('firma');
    deps.log?.('[azul-pay] finish_payment falló', res.error);
    return fail('servidor');
  }
  if (!res.data) return fail('no_existe');
  return { result: { ...(res.data as Record<string, unknown>), orderNumber: checked.orderNumber } };
}

export async function handlePayRequest(req: Request, deps: PayDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  if (origin && !cors) return new Response('Origen no permitido', { status: 403, headers: { vary: 'Origin' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ?? {} });

  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...(cors ?? {}), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  const failWith = (f: PayFailure) => send(PAY_STATUS[f.code], f);
  if (req.method !== 'POST') return send(405, { code: 'invalido', message: 'Usa POST.' });
  if (deps.configError || !deps.config) {
    deps.log?.('[azul-pay] configuración', deps.configError ?? 'sin configuración');
    return failWith(fail('config'));
  }

  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_CHARS) return failWith({ code: 'invalido', message: 'Petición muy grande.' });
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return failWith({ code: 'invalido', message: 'Petición muy grande.' });
    const body = parsePayBody(text);
    if (!body) return failWith({ code: 'invalido', message: 'Petición inválida.' });

    if (body.action === 'start') {
      const token = await verifyUser(deps, req.headers.get('authorization'));
      if (typeof token !== 'string') return failWith(token);
      const started = await startPayment(deps, deps.config, token, body.venueId, body.days);
      if ('code' in started) return failWith(started);
      return send(200, { url: started.url, fields: started.fields, orderNumber: started.order.orderNumber, amount: started.order.amount });
    }
    const done = await verifyPayment(deps, deps.config, body.params);
    if ('code' in done) return failWith(done);
    return send(200, done.result);
  } catch (e) {
    deps.log?.('[azul-pay] error', e);
    return failWith(fail('servidor'));
  }
}
