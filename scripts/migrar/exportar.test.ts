import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFirestoreReader, decodeValue, exportBowlingX, getAccessToken, signServiceJwt, type FirestoreReader, type FsDoc } from './exportar';
import { leagueUuid, photoUuid } from './ids';
import { transformBackup } from './transform';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = {
  project_id: 'bowlinx-prueba',
  client_email: 'exportar@bowlinx-prueba.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  token_uri: 'https://oauth2.googleapis.com/token',
};

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe('cuenta de servicio', () => {
  it('firma el JWT con RS256 para el alcance de Firestore', () => {
    const jwt = signServiceJwt(SA, Date.UTC(2026, 8, 1));
    const [head, body, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toMatchObject({
      iss: SA.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: SA.token_uri,
      exp: Date.UTC(2026, 8, 1) / 1000 + 3600,
    });
    expect(createVerify('RSA-SHA256').update(`${head}.${body}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('cambia el JWT por el token de acceso', async () => {
    const calls: { url: string; body?: string }[] = [];
    const token = await getAccessToken(SA, async (url, init) => {
      calls.push({ url, body: init?.body });
      return json({ access_token: 'ya29.token' });
    });
    expect(token).toBe('ya29.token');
    expect(calls[0].url).toBe(SA.token_uri);
    expect(calls[0].body).toMatch(/^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=ey/);
    await expect(getAccessToken(SA, async () => json({ error: 'invalid_grant' }, 400))).rejects.toThrow(/400/);
  });
});

describe('valores de Firestore (REST)', () => {
  it('pasa cada tipo a JSON como el respaldo de la app', () => {
    expect(
      decodeValue({
        mapValue: {
          fields: {
            s: { stringValue: 'hola' },
            i: { integerValue: '190' },
            d: { doubleValue: 172.5 },
            b: { booleanValue: true },
            n: { nullValue: null },
            t: { timestampValue: '2026-03-10T16:00:00.123456Z' },
            a: { arrayValue: { values: [{ integerValue: '150' }, { nullValue: null }] } },
            e: { arrayValue: {} },
            m: { mapValue: {} },
          },
        },
      }),
    ).toEqual({ s: 'hola', i: 190, d: 172.5, b: true, n: null, t: '2026-03-10T16:00:00.123Z', a: [150, null], e: [], m: {} });
  });

  it('lee todas las páginas de una colección con el token', async () => {
    const urls: string[] = [];
    const reader = createFirestoreReader({
      projectId: 'p',
      token: 'tok',
      fetchFn: async (url, init) => {
        urls.push(url);
        expect(init?.headers?.authorization).toBe('Bearer tok');
        return url.includes('pageToken=dos')
          ? json({ documents: [{ name: 'projects/p/databases/(default)/documents/leagues/L1/players/b', fields: { name: { stringValue: 'B' } } }] })
          : json({
              documents: [{ name: 'projects/p/databases/(default)/documents/leagues/L1/players/a', fields: { name: { stringValue: 'A' } }, createTime: '2026-01-01T00:00:00Z' }],
              nextPageToken: 'dos',
            });
      },
    });
    const docs = await reader.list('leagues/L1/players', 1);
    expect(docs).toEqual([
      { id: 'a', data: { name: 'A' }, createTime: '2026-01-01T00:00:00Z' },
      { id: 'b', data: { name: 'B' }, createTime: undefined },
    ]);
    expect(urls[0]).toBe('https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/leagues/L1/players?pageSize=1');
  });
});

describe('exportBowlingX', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const db: Record<string, FsDoc[]> = {
    users: [{ id: 'u1', data: { email: 'a@b.do', name: 'Ana', createdAt: '2026-01-01T00:00:00.000Z' } }],
    members: [
      { id: 'L1_u1', data: { leagueId: 'L1', uid: 'u1', name: 'Ana', role: 'owner', playerId: 'p1' } },
      { id: 'L9_u1', data: { leagueId: 'L9', uid: 'u1', name: 'Ana', role: 'member', playerId: null } },
    ],
    invites: [{ id: 'ABCD2345', data: { leagueId: 'L1', leagueName: 'Liga' } }],
    leagues: [{ id: 'L1', data: { name: 'Liga', visibility: 'private', ownerUid: 'u1', requirePhoto: true }, createTime: '2025-12-01T00:00:00Z' }],
    'leagues/L1/players': [{ id: 'p1', data: { name: 'Ana', averageOverride: null, uid: 'u1' } }],
    'leagues/L1/events': [{ id: 'e1', data: { type: 'practica', name: '', date: '2026-03-10', games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 1 } }],
    'leagues/L1/entries': [{ id: 'e1_p1', data: { eventId: 'e1', playerId: 'p1', teamId: null, average: 0, handicapOverride: null, scores: [150], photos: ['ph1'] } }],
    'leagues/L1/private': [{ id: 'invite', data: { code: 'ABCD2345' } }],
    'leagues/L1/photos': [
      { id: 'ph1', data: { data: `data:image/jpeg;base64,${jpeg.toString('base64')}`, width: 10, height: 20, eventId: 'e1', createdAt: '2026-03-10T00:00:00.000Z' } },
      { id: 'ph2', data: { data: 'no es una foto', width: 10, height: 20 } },
    ],
  };
  const reader: FirestoreReader = { list: async (path) => db[path] ?? [] };

  it('sale en la forma del respaldo completo, con fotos aparte, el código y los invites', async () => {
    const saved: Record<string, Buffer> = {};
    const backup = await exportBowlingX(reader, {
      now: () => new Date('2026-09-20T00:00:00Z'),
      savePhoto: async (lid, id, bytes, type) => {
        const rel = `fotos/${lid}/${id}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
        saved[rel] = bytes;
        return rel;
      },
    });
    expect(backup).toMatchObject({ app: 'BowlingX', exportedAt: '2026-09-20T00:00:00.000Z', invites: [{ id: 'ABCD2345', leagueId: 'L1' }] });
    const l = backup.leagues[0];
    expect(l).toMatchObject({ id: 'L1', name: 'Liga', inviteCode: 'ABCD2345', createdAt: '2025-12-01T00:00:00Z' });
    expect(l.members).toHaveLength(1);
    expect(l.photos).toEqual([
      { id: 'ph1', width: 10, height: 20, eventId: 'e1', createdAt: '2026-03-10T00:00:00.000Z', file: 'fotos/L1/ph1.jpg', bytes: 4, contentType: 'image/jpeg' },
      { id: 'ph2', width: 10, height: 20, eventId: null, createdAt: null, file: null, bytes: null },
    ]);
    expect(saved['fotos/L1/ph1.jpg']).toEqual(jpeg);

    // Y el transformador la entiende: la foto sale del archivo.
    const plan = transformBackup(backup);
    const id = photoUuid('L1', 'ph1');
    expect(plan.files).toEqual([{ bucket: 'scoreboards', path: `${leagueUuid('L1')}/${id}.jpg`, contentType: 'image/jpeg', bytes: 4, source: { file: 'fotos/L1/ph1.jpg' } }]);
    expect(plan.report.photos).toMatchObject({ found: 2, migrated: 1, missingData: 1 });
    expect(plan.rows.league_secrets[0].invite_code).toBe('ABCD2345');
  });
});
