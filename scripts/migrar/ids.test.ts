import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DNS_NAMESPACE, entryUuid, fallbackInviteCode, leagueUuid, legacyId, playerUuid, sha1, userUuid, uuidv5 } from './ids';

describe('SHA-1 y UUID v5', () => {
  it('SHA-1 igual que node:crypto (vacío, corto, 55/56/64 bytes y largo)', () => {
    for (const len of [0, 1, 3, 55, 56, 63, 64, 65, 1000]) {
      const bytes = randomBytes(len);
      expect(Buffer.from(sha1(bytes)).toString('hex')).toBe(createHash('sha1').update(bytes).digest('hex'));
    }
  });

  it('da los UUID v5 conocidos (espacio DNS)', () => {
    expect(uuidv5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    expect(uuidv5('python.org', DNS_NAMESPACE)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('los ids de BowlingX dan siempre el mismo uuid y no chocan entre tipos', () => {
    expect(leagueUuid('L1')).toBe(leagueUuid('L1'));
    expect(leagueUuid('L1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set([leagueUuid('x'), userUuid('x'), playerUuid('x', 'x'), legacyId('event', 'x', 'x')]).size).toBe(4);
    // El jugador p1 de dos ligas son dos jugadores.
    expect(playerUuid('L1', 'p1')).not.toBe(playerUuid('L2', 'p1'));
    expect(entryUuid('L1', 'e1', 'p1')).toBe(legacyId('entry', 'L1', 'e1', 'p1'));
  });

  it('no acepta ids con / ni vacíos (no se podrían separar)', () => {
    expect(() => legacyId('player', 'L1', '')).toThrow();
    expect(() => legacyId('player', 'L1/x', 'p')).toThrow();
  });

  it('código de invitación de respaldo: 8 letras válidas y fijo', () => {
    const code = fallbackInviteCode(leagueUuid('L1'));
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(fallbackInviteCode(leagueUuid('L1'))).toBe(code);
    expect(fallbackInviteCode(leagueUuid('L1'), 1)).not.toBe(code);
  });
});
