/**
 * Ids de BowlingX (Firestore) → UUID de MatchMate. Son UUID versión 5 (RFC 9562, SHA-1 de un nombre dentro de
 * un espacio fijo): el mismo id viejo da siempre el mismo uuid, así la importación se puede repetir sin duplicar
 * y los links viejos (`/l/<liga>/jugador/<id>`) se pueden redirigir calculando el uuid nuevo.
 *
 * El nombre lleva el tipo y la ruta de Firestore separada con '/' (un id de Firestore nunca lleva '/'):
 * `league/<liga>`, `player/<liga>/<jugador>`, `team/<liga>/<evento>/<equipo>`, `user/<uid>`…
 *
 * SHA-1 va escrito aquí (sin WebCrypto, que es asíncrono) para que funcione igual en Node y en el navegador.
 */

/** Espacio de los ids de BowlingX. NO CAMBIARLO NUNCA: cambiaría todos los ids migrados. */
export const BOWLINGX_NAMESPACE = '33eae266-c714-4a33-b77c-118741a810db';

/** Espacio DNS del RFC (solo para las pruebas con los ejemplos conocidos). */
export const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** SHA-1 de unos bytes (20 bytes). */
export function sha1(input: Uint8Array): Uint8Array {
  const len = input.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const msg = new Uint8Array(total);
  msg.set(input);
  msg[len] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(total - 8, Math.floor((len * 8) / 2 ** 32));
  view.setUint32(total - 4, (len * 8) >>> 0);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`UUID inválido: ${uuid}`);
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

/** UUID v5 de `name` dentro del espacio `namespace`. */
export function uuidv5(name: string, namespace: string = BOWLINGX_NAMESPACE): string {
  const ns = uuidBytes(namespace);
  const text = new TextEncoder().encode(name);
  const buf = new Uint8Array(ns.length + text.length);
  buf.set(ns);
  buf.set(text, ns.length);
  const b = sha1(buf).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[b[i]];
  }
  return out;
}

/** Tipos de id que se convierten. */
export type LegacyKind = 'user' | 'league' | 'player' | 'event' | 'team' | 'entry' | 'photo' | 'submission' | 'reaction' | 'comment' | 'suggestion';

/** Uuid nuevo de un id de BowlingX: `legacyId('player', liga, jugador)`. */
export function legacyId(kind: LegacyKind, ...path: string[]): string {
  if (!path.length || path.some((p) => typeof p !== 'string' || p === '' || p.includes('/'))) {
    throw new Error(`Id de BowlingX inválido: ${kind}/${path.join('/')}`);
  }
  return uuidv5(`${kind}/${path.join('/')}`);
}

// Atajos con los nombres de la app (para redirigir links viejos de BowlingX a MatchMate).
export const userUuid = (uid: string) => legacyId('user', uid);
export const leagueUuid = (lid: string) => legacyId('league', lid);
export const playerUuid = (lid: string, pid: string) => legacyId('player', lid, pid);
export const eventUuid = (lid: string, eid: string) => legacyId('event', lid, eid);
export const teamUuid = (lid: string, eid: string, tid: string) => legacyId('team', lid, eid, tid);
/** La participación se identifica por (evento, jugador), no por el id del documento. */
export const entryUuid = (lid: string, eid: string, pid: string) => legacyId('entry', lid, eid, pid);
export const photoUuid = (lid: string, id: string) => legacyId('photo', lid, id);

/** Código de invitación de respaldo (8 letras sin O/0 ni I/1), sacado del uuid de la liga: siempre el mismo. */
export function fallbackInviteCode(leagueId: string, attempt = 0): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = sha1(new TextEncoder().encode(`invite/${leagueId}/${attempt}`));
  return Array.from(bytes.slice(0, 8), (b) => chars[b % 32]).join('');
}
