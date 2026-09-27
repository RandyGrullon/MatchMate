import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  createPushSender,
  decryptPayload,
  encryptPayload,
  generateVapidKeys,
  importVapidKeys,
  vapidAuthorization,
} from '../../supabase/functions/send-push/webpush';

// Vector del RFC 8291, apéndice A (el mismo que da http_ece, la librería de web-push).
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/** Clave privada P-256 desde d (base64url) y su pública sin comprimir. */
async function importEcdh(d: string, pub: string, usages: KeyUsage[] = ['deriveBits']) {
  const p = b64urlDecode(pub);
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', d, x: b64urlEncode(p.subarray(1, 33)), y: b64urlEncode(p.subarray(33)), ext: true };
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, usages),
    publicKey: await crypto.subtle.importKey('raw', p, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

/** Un «teléfono»: par ECDH y secreto de autenticación, como los da el navegador. */
async function phone() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  return { privateKey: pair.privateKey, p256dh, auth };
}

/** Separa y verifica la cabecera Authorization de VAPID. */
async function checkVapid(header: string, publicKey: string) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  expect(m, header).not.toBeNull();
  const [h, c, s] = m![1].split('.');
  expect(m![2]).toBe(publicKey);
  expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
  const verifier = await crypto.subtle.importKey('raw', b64urlDecode(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  expect(valid).toBe(true);
  return JSON.parse(new TextDecoder().decode(b64urlDecode(c))) as { aud: string; exp: number; sub: string };
}

describe('cifrado RFC 8291 (aes128gcm)', () => {
  it('da exactamente el mensaje del apéndice A', async () => {
    const serverKeys = await importEcdh(RFC.asPrivate, RFC.asPublic);
    const body = await encryptPayload(RFC.uaPublic, RFC.auth, RFC.plaintext, { salt: b64urlDecode(RFC.salt), serverKeys });
    expect(b64urlEncode(body)).toBe(RFC.message);
    // Y el teléfono del RFC lo descifra.
    const ua = await importEcdh(RFC.uaPrivate, RFC.uaPublic);
    expect(await decryptPayload(b64urlDecode(RFC.message), ua.privateKey, RFC.uaPublic, RFC.auth)).toBe(RFC.plaintext);
  });

  it('cada envío usa sal y clave nuevas, y el teléfono lo descifra (con acentos y emojis)', async () => {
    const p = await phone();
    const text = JSON.stringify({ title: 'Recuerda: mañana es la práctica', body: '¿Vas? Confírmalo en la app 🎳' });
    const a = await encryptPayload(p.p256dh, p.auth, text);
    const b = await encryptPayload(p.p256dh, p.auth, text);
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b));
    expect(new DataView(a.buffer).getUint32(16)).toBe(4096);
    expect(a[20]).toBe(65);
    expect(await decryptPayload(a, p.privateKey, p.p256dh, p.auth)).toBe(text);
    expect(await decryptPayload(b, p.privateKey, p.p256dh, p.auth)).toBe(text);
  });

  it('claves del teléfono que no sirven y mensajes muy largos: error', async () => {
    const p = await phone();
    await expect(encryptPayload('no-es-base64!', p.auth, 'x')).rejects.toThrow();
    await expect(encryptPayload(b64urlEncode(new Uint8Array(65)), p.auth, 'x')).rejects.toThrow();
    await expect(encryptPayload(p.p256dh, 'AAAA', 'x')).rejects.toThrow();
    await expect(encryptPayload(p.p256dh, p.auth, 'x'.repeat(4000))).rejects.toThrow('largo');
  });
});

describe('VAPID (RFC 8292)', () => {
  it('firma un JWT ES256 que se verifica con la clave pública', async () => {
    const keys = await generateVapidKeys();
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const vapid = await importVapidKeys({ ...keys, subject: 'mailto:dueno@matchmate.app' });
    const claims = await checkVapid(await vapidAuthorization(vapid, 'https://fcm.googleapis.com', 1_800_000_000), keys.publicKey);
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'mailto:dueno@matchmate.app' });
  });

  it('claves mal escritas, que no son pareja o sin contacto: error claro', async () => {
    const a = await generateVapidKeys();
    const b = await generateVapidKeys();
    await expect(importVapidKeys({ publicKey: 'corta', privateKey: a.privateKey, subject: 'mailto:a@b.c' })).rejects.toThrow('mal escritas');
    await expect(importVapidKeys({ publicKey: a.publicKey, privateKey: b.privateKey, subject: 'mailto:a@b.c' })).rejects.toThrow();
    await expect(importVapidKeys({ ...a, subject: 'yo@correo.com' })).rejects.toThrow('VAPID_SUBJECT');
  });
});

describe('createPushSender', () => {
  it('hace el POST de Web Push con las cabeceras y el cuerpo cifrado', async () => {
    const keys = await generateVapidKeys();
    const p = await phone();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const sender = await createPushSender({ ...keys, subject: 'mailto:dueno@matchmate.app' }, fetchFn, { now: () => 1_800_000_000_000 });
    const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: p.p256dh, auth: p.auth };
    expect(await sender.send(target, '{"title":"Hola"}', { ttl: 3600.7, urgency: 'high' })).toEqual({ status: 201 });
    const { url, init } = calls[0];
    expect(url).toBe(target.endpoint);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.TTL).toBe('3600');
    expect(headers.Urgency).toBe('high');
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    const claims = await checkVapid(headers.Authorization, keys.publicKey);
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(await decryptPayload(init.body as Uint8Array, p.privateKey, p.p256dh, p.auth)).toBe('{"title":"Hola"}');

    // La firma se reusa para el mismo servicio de push; otro servicio tiene la suya.
    await sender.send(target, 'x', { ttl: 60 });
    await sender.send({ ...target, endpoint: 'https://web.push.apple.com/QGx' }, 'x', { ttl: 60 });
    const auths = calls.map((c) => (c.init.headers as Record<string, string>).Authorization);
    expect(auths[1]).toBe(auths[0]);
    expect(auths[2]).not.toBe(auths[0]);
    expect((calls[1].init.headers as Record<string, string>).Urgency).toBe('normal');
  });

  it('nunca lanza: sin red, teléfono que no sirve o mensaje muy largo', async () => {
    const keys = await generateVapidKeys();
    const p = await phone();
    let fetched = 0;
    const fetchFn = (async () => {
      fetched++;
      throw new TypeError('sin red');
    }) as typeof fetch;
    const sender = await createPushSender({ ...keys, subject: 'https://matchmate.app' }, fetchFn);
    const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: p.p256dh, auth: p.auth };
    expect(await sender.send(target, 'x', { ttl: 60 })).toEqual({ status: null, error: 'network' });
    expect(await sender.send({ ...target, p256dh: 'malo' }, 'x', { ttl: 60 })).toEqual({ status: null, error: 'invalid-subscription' });
    expect(await sender.send({ ...target, endpoint: 'http://fcm.googleapis.com/x' }, 'x', { ttl: 60 })).toEqual({ status: null, error: 'invalid-subscription' });
    expect(await sender.send(target, 'x'.repeat(5000), { ttl: 60 })).toEqual({ status: null, error: 'too-large' });
    expect(fetched).toBe(1);
  });

  it('se rinde si el servicio de push no contesta a tiempo', async () => {
    const keys = await generateVapidKeys();
    const p = await phone();
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abortado'))))) as typeof fetch;
    const sender = await createPushSender({ ...keys, subject: 'mailto:a@b.co' }, fetchFn, { timeoutMs: 20 });
    expect(await sender.send({ endpoint: 'https://fcm.googleapis.com/x', p256dh: p.p256dh, auth: p.auth }, 'x', { ttl: 60 })).toEqual({
      status: null,
      error: 'network',
    });
  });
});
