import { describe, expect, it } from 'vitest';
import { HASH_CONFIG, HASH_CONSOLE_TEXT } from './fixture';
import { firebaseHash, parseFbscrypt, parseHashConfig, toFbscrypt, verifyFbscrypt } from './hash';

// Caso de prueba de supabase/auth (internal/crypto/password_test.go): el mismo texto que GoTrue acepta.
const GOTRUE =
  '$fbscrypt$v=1,n=14,r=8,p=1,ss=Bw==,sk=ou9tdYTGyYm8kuR6Dt0Bp0kDuAYoXrK16mbZO4yGwAn3oLspjnN0/c41v8xZnO1n14J3MjKj1b2g6AUCAlFwMw==$C0sHCg9ek77hsg==$zKVTMvnWVw5BBOZNUdnsalx4c4c7y/w7IS5p6Ut2+CfEFFlz37J9huyQfov4iizN8dbjvEJlM5tQaJP84+hfTw==';

describe('hash de Firebase (scrypt modificado)', () => {
  it('verifica el caso de prueba de GoTrue igual que GoTrue', () => {
    expect(verifyFbscrypt('mytestpassword', GOTRUE)).toBe(true);
    expect(verifyFbscrypt('mytestpassword1', GOTRUE)).toBe(false);
  });

  it('rechaza lo mismo que GoTrue (versión, ceros, base64 malo)', () => {
    const bad = [
      GOTRUE.replace('v=1', 'v=2'),
      GOTRUE.replace('n=14', 'n=0'),
      GOTRUE.replace('r=8', 'r=0'),
      GOTRUE.replace('p=1', 'p=0'),
      GOTRUE.replace('p=1', 'p=256'),
      GOTRUE.replace('ss=Bw==', 'ss=!!!'),
      GOTRUE.replace('$C0sHCg9ek77hsg==$', '$!!!$'),
      GOTRUE.replace('$C0sHCg9ek77hsg==$', '$C0sHCg9ek77hsg$'), // sin relleno: Go no lo acepta
      '$2a$10$abc',
    ];
    for (const h of bad) expect(() => parseFbscrypt(h), h).toThrow();
  });

  it('lee los parámetros tal como se copian de la consola (y en JSON)', () => {
    expect(parseHashConfig(HASH_CONSOLE_TEXT)).toEqual(HASH_CONFIG);
    expect(
      parseHashConfig(JSON.stringify({ hash_config: { algorithm: 'SCRYPT', base64_signer_key: HASH_CONFIG.signerKey, base64_salt_separator: 'Bw==', rounds: 8, mem_cost: 10 } })),
    ).toEqual(HASH_CONFIG);
    expect(() => parseHashConfig('algorithm: BCRYPT')).toThrow(/SCRYPT/);
    expect(() => parseHashConfig('base64_signer_key: abc=,\nbase64_salt_separator: Bw==,\nrounds: 8')).toThrow(/mem_cost/);
  });

  it('arma el $fbscrypt$ de una cuenta exportada y la contraseña entra', () => {
    const salt = Buffer.from('sal-de-prueba').toString('base64');
    const hash = firebaseHash('secreto123', salt, HASH_CONFIG);
    const text = toFbscrypt(hash, salt, HASH_CONFIG);
    expect(text.startsWith('$fbscrypt$v=1,n=10,r=8,p=1,ss=Bw==,sk=')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(255); // cabe en auth.users.encrypted_password
    expect(verifyFbscrypt('secreto123', text)).toBe(true);
    expect(verifyFbscrypt('Secreto123', text)).toBe(false);
  });

  it('acepta base64 de URL (- y _) y lo pasa a base64 normal para GoTrue', () => {
    const salt = Buffer.from([251, 255, 190, 1, 2, 3]).toString('base64'); // lleva + y /
    const hash = firebaseHash('x', salt, HASH_CONFIG);
    const url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const text = toFbscrypt(url(hash), url(salt), HASH_CONFIG);
    expect(text).toBe(toFbscrypt(hash, salt, HASH_CONFIG));
    expect(verifyFbscrypt('x', text)).toBe(true);
  });
});
