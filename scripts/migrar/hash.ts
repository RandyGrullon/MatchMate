/**
 * Contraseñas de BowlingX: Firebase Auth las guarda con su scrypt modificado. Supabase Auth (GoTrue) ya sabe
 * verificarlas: al crear la cuenta con `auth.admin.createUser({ password_hash })` acepta
 *
 *   $fbscrypt$v=1,n=<mem_cost>,r=<rounds>,p=1,ss=<salt separator b64>,sk=<signer key b64>$<salt b64>$<hash b64>
 *
 * (internal/crypto/password.go de supabase/auth: n es el exponente, la memoria es 2^n). Así cada quien entra
 * con su contraseña de siempre, sin correo de «cambia tu contraseña» ni función aparte.
 *
 * Aquí: leer los parámetros que se copian de la consola de Firebase, armar ese texto y verificar una contraseña
 * igual que GoTrue (para probar ANTES de importar que los parámetros se copiaron bien).
 *
 * El algoritmo de Firebase: clave = scrypt(contraseña, sal + separador, N = 2^mem_cost, r = rounds, p = 1, 32 bytes);
 * hash = AES-256-CTR(clave, IV en ceros) aplicado a la signer key.
 */
import { createCipheriv, scryptSync, timingSafeEqual } from 'node:crypto';

/** Parámetros del hash (consola de Firebase › Authentication › Usuarios › ⋮ › Parámetros de hash de contraseña). */
export interface FirebaseHashConfig {
  /** base64_signer_key */
  signerKey: string;
  /** base64_salt_separator */
  saltSeparator: string;
  /** rounds (Firebase usa 8) */
  rounds: number;
  /** mem_cost (Firebase usa 14) */
  memCost: number;
}

export const FBSCRYPT_PREFIX = '$fbscrypt$';

/** base64 (normal o de URL, con o sin relleno) → bytes. Lanza si no es base64. */
export function fromBase64(text: string, what = 'base64'): Buffer {
  const clean = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw new Error(`${what} no es base64 válido`);
  return Buffer.from(clean, 'base64');
}

/** base64 estándar con relleno (lo único que acepta GoTrue). */
export const normalBase64 = (text: string, what?: string) => fromBase64(text, what).toString('base64');

/**
 * Lee los parámetros tal como se copian de la consola:
 *
 *   hash_config {
 *     algorithm: SCRYPT,
 *     base64_signer_key: jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==,
 *     base64_salt_separator: Bw==,
 *     rounds: 8,
 *     mem_cost: 14,
 *   }
 *
 * También acepta JSON con esas claves (o signerKey, saltSeparator, rounds, memCost).
 */
export function parseHashConfig(text: string): FirebaseHashConfig {
  let raw: Record<string, unknown> = {};
  try {
    const json = JSON.parse(text) as unknown;
    if (json && typeof json === 'object') {
      raw = (json as { hash_config?: Record<string, unknown> }).hash_config ?? (json as Record<string, unknown>);
    }
  } catch {
    for (const m of text.matchAll(/([A-Za-z0-9_]+)\s*[:=]\s*"?([^,\s"}]+)"?/g)) raw[m[1]] = m[2];
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return String(raw[k]);
    return undefined;
  };
  const algorithm = pick('algorithm');
  if (algorithm && algorithm.toUpperCase() !== 'SCRYPT') throw new Error(`El algoritmo tiene que ser SCRYPT (llegó ${algorithm})`);
  const signer = pick('base64_signer_key', 'signerKey', 'signer_key');
  const separator = pick('base64_salt_separator', 'saltSeparator', 'salt_separator');
  const rounds = Number(pick('rounds'));
  const memCost = Number(pick('mem_cost', 'memCost'));
  if (!signer) throw new Error('Falta base64_signer_key');
  if (!separator) throw new Error('Falta base64_salt_separator');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 8) throw new Error('rounds tiene que ser un número de 1 a 8');
  if (!Number.isInteger(memCost) || memCost < 1 || memCost > 14) throw new Error('mem_cost tiene que ser un número de 1 a 14');
  return { signerKey: normalBase64(signer, 'base64_signer_key'), saltSeparator: normalBase64(separator, 'base64_salt_separator'), rounds, memCost };
}

/** El texto que se le pasa a GoTrue como password_hash. `salt` y `hash` son los de `firebase auth:export`. */
export function toFbscrypt(hash: string, salt: string, cfg: FirebaseHashConfig): string {
  return (
    `${FBSCRYPT_PREFIX}v=1,n=${cfg.memCost},r=${cfg.rounds},p=1,ss=${normalBase64(cfg.saltSeparator)},sk=${normalBase64(cfg.signerKey)}` +
    `$${normalBase64(salt, 'salt')}$${normalBase64(hash, 'passwordHash')}`
  );
}

interface ParsedFbscrypt {
  n: number;
  r: number;
  p: number;
  saltSeparator: Buffer;
  signerKey: Buffer;
  salt: Buffer;
  hash: Buffer;
}

// La misma forma que acepta GoTrue (fbscryptHashRegexp).
const FBSCRYPT_RE = /^\$fbscrypt\$v=([0-9]+),n=([0-9]+),r=([0-9]+),p=([0-9]+)(?:,ss=([^,]+))?(?:,sk=([^$]+))?\$([^$]+)\$(.+)$/;

/** Lee un $fbscrypt$ con las mismas reglas que GoTrue; lanza si GoTrue lo rechazaría. */
export function parseFbscrypt(text: string): ParsedFbscrypt {
  const m = FBSCRYPT_RE.exec(text);
  if (!m) throw new Error('No es un hash $fbscrypt$');
  const [, v, n, r, p, ss, sk, salt, hash] = m;
  if (v !== '1') throw new Error('Versión de $fbscrypt$ no soportada');
  const num = (s: string, max: number, what: string) => {
    const x = Number(s);
    if (!Number.isSafeInteger(x) || x < 1 || x > max) throw new Error(`${what} fuera de rango`);
    return x;
  };
  const strict = (s: string | undefined, what: string) => {
    if (s === undefined) return Buffer.alloc(0);
    // Go (base64.StdEncoding) exige el alfabeto normal y el relleno completo.
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 !== 0) throw new Error(`${what} no es base64 estándar`);
    return Buffer.from(s, 'base64');
  };
  return {
    // GoTrue: n hasta 32 bits (exponente), r hasta 64 y p hasta 8 bits. Aquí más estricto: lo que Node puede calcular.
    n: num(n, 30, 'n'),
    r: num(r, 2 ** 30, 'r'),
    p: num(p, 255, 'p'),
    saltSeparator: strict(ss, 'ss'),
    signerKey: strict(sk, 'sk'),
    salt: strict(salt, 'salt'),
    hash: strict(hash, 'hash'),
  };
}

function firebaseScrypt(password: string, salt: Buffer, saltSeparator: Buffer, signerKey: Buffer, n: number, r: number, p: number): Buffer {
  const N = 2 ** n;
  const key = scryptSync(Buffer.from(password, 'utf8'), Buffer.concat([salt, saltSeparator]), 32, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 });
  const cipher = createCipheriv('aes-256-ctr', key, Buffer.alloc(16));
  return Buffer.concat([cipher.update(signerKey), cipher.final()]);
}

/** ¿La contraseña corresponde a este $fbscrypt$? (igual que GoTrue al iniciar sesión). */
export function verifyFbscrypt(password: string, fbscrypt: string): boolean {
  const h = parseFbscrypt(fbscrypt);
  const derived = firebaseScrypt(password, h.salt, h.saltSeparator, h.signerKey, h.n, h.r, h.p);
  return derived.length === h.hash.length && timingSafeEqual(derived, h.hash);
}

/** passwordHash de Firebase para una contraseña (para armar datos de prueba; Firebase lo hace igual). */
export function firebaseHash(password: string, salt: string, cfg: FirebaseHashConfig): string {
  return firebaseScrypt(password, fromBase64(salt), fromBase64(cfg.saltSeparator), fromBase64(cfg.signerKey), cfg.memCost, cfg.rounds, 1).toString('base64');
}
