/**
 * Web Push sin librerías, solo con Web Crypto: corre igual en Deno (la Edge Function send-push) y en Node (las
 * pruebas). Sin imports: Deno exige la extensión `.ts` en las rutas y el tsc de la app no la acepta.
 *
 * - Cifrado del mensaje: RFC 8291 con «Content-Encoding: aes128gcm» (RFC 8188), un solo registro.
 * - Firma VAPID: RFC 8292 (JWT ES256), una por servicio de push (FCM, Apple, Mozilla, Windows) que se reusa 12 horas.
 *
 * Por mensaje cuesta un par ECDH nuevo, un ECDH, tres HKDF y un AES-GCM: alrededor de 1 ms de CPU, lejos de los
 * 2 s por llamada de las Edge Functions (crítica 28: `npm:web-push` usa el crypto de Node).
 *
 * Claves VAPID en el formato de siempre (`npx web-push generate-vapid-keys`, o generateVapidKeys() de aquí):
 * pública = punto P-256 sin comprimir (65 bytes) y privada = el número d (32 bytes), las dos en base64url.
 */

type Bytes = Uint8Array<ArrayBuffer>;

export type Urgency = 'very-low' | 'low' | 'normal' | 'high';

export interface PushTarget {
  endpoint: string;
  /** Clave pública del teléfono (base64url, 65 bytes). */
  p256dh: string;
  /** Secreto de autenticación del teléfono (base64url, 16 bytes). */
  auth: string;
}

export interface PushOptions {
  /** Segundos que el servicio de push guarda el mensaje si el teléfono está apagado. */
  ttl: number;
  urgency?: Urgency;
}

export interface PushResult {
  /** Respuesta del servicio de push; null = sin respuesta (red, tiempo agotado). */
  status: number | null;
  error?: 'invalid-subscription' | 'too-large' | 'network';
}

export interface PushSender {
  send(target: PushTarget, payload: string, options: PushOptions): Promise<PushResult>;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Contacto para los servicios de push: `mailto:…` o `https://…`. */
  subject: string;
}

/** Tamaño del registro (RFC 8188). Todo el mensaje va en uno. */
export const RECORD_SIZE = 4096;
/** Lo más largo que se cifra: los servicios de push aceptan hasta 4096 bytes (86 de cabecera, 17 de relleno y etiqueta). */
export const MAX_PLAINTEXT = 3993;
/** Vigencia de la firma VAPID (el máximo es 24 horas). */
const VAPID_TTL_S = 12 * 3600;

const encoder = new TextEncoder();

function copy(data: Uint8Array): Bytes {
  const out = new Uint8Array(new ArrayBuffer(data.length));
  out.set(data);
  return out;
}

const utf8 = (text: string): Bytes => copy(encoder.encode(text));

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function b64urlEncode(data: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Bytes {
  const clean = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error('base64url inválido');
  const raw = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

class InvalidSubscriptionError extends Error {}
class TooLargeError extends Error {}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Claves de contenido (RFC 8291 §3.4 y RFC 8188 §2.2): lo mismo al cifrar y al descifrar. */
async function contentKeys(ecdh: Bytes, auth: Bytes, uaPublic: Bytes, asPublic: Bytes, salt: Bytes) {
  const ikm = await hkdf(auth, ecdh, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  return { key: await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt', 'decrypt']), nonce };
}

function subscriptionKeys(p256dh: string, authSecret: string): { uaPublic: Bytes; auth: Bytes } {
  let uaPublic: Bytes;
  let auth: Bytes;
  try {
    uaPublic = b64urlDecode(p256dh);
    auth = b64urlDecode(authSecret);
  } catch {
    throw new InvalidSubscriptionError('claves del teléfono mal escritas');
  }
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length < 16) throw new InvalidSubscriptionError('claves del teléfono que no sirven');
  return { uaPublic, auth };
}

/**
 * Cifra `plaintext` para un teléfono. Devuelve el cuerpo de la petición: cabecera (sal, tamaño de registro y la
 * clave pública de este envío) + el registro cifrado. `salt` y `serverKeys` solo para las pruebas (vectores del RFC).
 */
export async function encryptPayload(
  p256dh: string,
  authSecret: string,
  plaintext: string | Uint8Array,
  options: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Bytes> {
  const { uaPublic, auth } = subscriptionKeys(p256dh, authSecret);
  const data = typeof plaintext === 'string' ? utf8(plaintext) : copy(plaintext);
  if (data.length > MAX_PLAINTEXT) throw new TooLargeError('mensaje demasiado largo');
  let uaKey: CryptoKey;
  try {
    uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  } catch {
    throw new InvalidSubscriptionError('la clave del teléfono no es un punto P-256');
  }
  const server = options.serverKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));
  const salt = options.salt ? copy(options.salt) : crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const { key, nonce } = await contentKeys(ecdh, auth, uaPublic, asPublic, salt);
  // Un solo registro: el texto + 0x02 (último registro), sin relleno.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, concat(data, new Uint8Array([2]))));
  const header = new Uint8Array(new ArrayBuffer(21));
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/**
 * Lo contrario (lo que hace el teléfono): para las pruebas y el servicio de push de mentira de tests/sql/push.test.ts.
 * `privateKey` es la clave ECDH privada del teléfono y `p256dh` su pública.
 */
export async function decryptPayload(body: Uint8Array, privateKey: CryptoKey, p256dh: string, authSecret: string): Promise<string> {
  const { uaPublic, auth } = subscriptionKeys(p256dh, authSecret);
  const data = copy(body);
  const salt = data.slice(0, 16);
  const idLength = data[20];
  const asPublic = data.slice(21, 21 + idLength);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, privateKey, 256));
  const { key, nonce } = await contentKeys(ecdh, auth, uaPublic, asPublic, salt);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, data.slice(21 + idLength)));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (end < 0 || plain[end] !== 2) throw new Error('registro sin el delimitador final');
  return new TextDecoder().decode(plain.slice(0, end));
}

export interface ImportedVapid {
  key: CryptoKey;
  publicKey: string;
  subject: string;
}

/** Lee las claves VAPID y comprueba que sean pareja (si no, los servicios de push rechazarían todo con 403). */
export async function importVapidKeys(keys: VapidKeys): Promise<ImportedVapid> {
  const bad = new Error('Claves VAPID mal escritas (pública de 65 bytes y privada de 32, en base64url)');
  let pub: Bytes;
  let d: Bytes;
  try {
    pub = b64urlDecode(keys.publicKey);
    d = b64urlDecode(keys.privateKey);
  } catch {
    throw bad;
  }
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) throw bad;
  const subject = keys.subject.trim();
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) throw new Error('VAPID_SUBJECT tiene que ser mailto:correo o https://…');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.subarray(1, 33)), y: b64urlEncode(pub.subarray(33)), d: b64urlEncode(d), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const check = utf8('matchmate');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, check);
  const verifier = await crypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, signature, check))) {
    throw new Error('Las claves VAPID no son pareja');
  }
  return { key, publicKey: b64urlEncode(pub), subject };
}

/** Cabecera Authorization de VAPID para un servicio de push (`audience` = su origen). */
export async function vapidAuthorization(vapid: ImportedVapid, audience: string, nowSeconds: number, ttlSeconds = VAPID_TTL_S): Promise<string> {
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(utf8(JSON.stringify({ aud: audience, exp: nowSeconds + ttlSeconds, sub: vapid.subject })));
  const unsigned = `${header}.${claims}`;
  // Web Crypto ya firma en el formato de JWS (r || s, 64 bytes).
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.key, utf8(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

/**
 * El que manda: cifra, firma (una vez por servicio de push) y hace el POST al endpoint del teléfono. Nunca lanza:
 * devuelve la respuesta del servicio de push o por qué no se pudo.
 */
export async function createPushSender(
  keys: VapidKeys,
  fetchFn: typeof fetch = fetch,
  options: { timeoutMs?: number; now?: () => number } = {},
): Promise<PushSender> {
  const vapid = await importVapidKeys(keys);
  const timeoutMs = options.timeoutMs ?? 8000;
  const now = options.now ?? (() => Date.now());
  const signed = new Map<string, { value: string; exp: number }>();

  async function authorization(audience: string): Promise<string> {
    const nowS = Math.floor(now() / 1000);
    const cached = signed.get(audience);
    if (cached && cached.exp - nowS > 3600) return cached.value;
    const value = await vapidAuthorization(vapid, audience, nowS);
    signed.set(audience, { value, exp: nowS + VAPID_TTL_S });
    return value;
  }

  return {
    async send(target, payload, opts) {
      let body: Bytes;
      let audience: string;
      try {
        const url = new URL(target.endpoint);
        if (url.protocol !== 'https:') throw new InvalidSubscriptionError('endpoint sin https');
        audience = url.origin;
        body = await encryptPayload(target.p256dh, target.auth, payload);
      } catch (e) {
        return { status: null, error: e instanceof TooLargeError ? 'too-large' : 'invalid-subscription' };
      }
      const headers = {
        TTL: String(Math.max(0, Math.floor(opts.ttl))),
        Urgency: opts.urgency ?? 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: await authorization(audience),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchFn(target.endpoint, { method: 'POST', headers, body, signal: controller.signal });
        await res.body?.cancel().catch(() => undefined);
        return { status: res.status };
      } catch {
        return { status: null, error: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Un par VAPID nuevo en el formato de siempre (el mismo de `npx web-push generate-vapid-keys`). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d! };
}
