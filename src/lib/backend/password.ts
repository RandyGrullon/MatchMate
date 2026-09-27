/**
 * Contraseñas del modo local (solo demo y desarrollo: en producción las guarda Supabase Auth).
 * PBKDF2-SHA256 con WebCrypto, 100.000 vueltas y sal aleatoria. Formato: `pbkdf2-sha256$<vueltas>$<sal>$<hash>` (base64).
 */

const ITERATIONS = 100_000;
const PREFIX = 'pbkdf2-sha256';

const toB64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, iter, salt, hash] = stored.split('$');
  const iterations = Number(iter);
  if (prefix !== PREFIX || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false;
  const expected = fromB64(hash);
  const actual = await derive(password, fromB64(salt), iterations);
  // Comparación de tiempo constante.
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}
