/**
 * Exportación de BowlingX (Firestore) para la migración, sin instalar nada: la API REST de Firestore con la
 * cuenta de servicio de Firebase (JWT firmado con node:crypto). La cuenta de servicio no pasa por las reglas,
 * así que trae también lo que el respaldo de la app no trae: las fotos, el código de invitación de cada liga
 * (`leagues/{id}/private/invite`) y `invites/{código}`.
 *
 * Sale en la forma del «Respaldo completo» de la app (backup.ts de BowlingX): `{ app, exportedAt, leagues[],
 * users[], invites[] }`, cada liga con players, events, entries, submissions, reactions, comments, suggestions,
 * members, photos e inviteCode. Las fotos NO van dentro del JSON (serían cientos de MB): cada una se guarda como
 * archivo y la foto lleva `file` (ruta relativa) y `bytes`.
 *
 * No se exporta: `live` (en vivo), `limits` (ritmo), ni `users/{uid}/push` (las suscripciones están atadas al
 * dominio viejo: cada quien las vuelve a activar en MatchMate).
 */
import { createSign } from 'node:crypto';
import type { FsBackup, FsLeague, FsPhoto } from './types';

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT (RS256) para pedir el token de acceso de Google con la cuenta de servicio. */
export function signServiceJwt(sa: ServiceAccount, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key);
  return `${head}.${body}.${b64url(sig)}`;
}

export async function getAccessToken(sa: ServiceAccount, fetchFn: Fetch): Promise<string> {
  const res = await fetchFn(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${signServiceJwt(sa)}`,
  });
  if (!res.ok) throw new Error(`Google no dio el token (${res.status}): ${await res.text()}`);
  const token = (await res.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('Google no dio el token de acceso');
  return token.access_token;
}

// ---------- Valores de Firestore (REST) ----------

export type FsValue = Record<string, unknown>;

/** Un valor de la API REST → JSON, igual que plain() de backup.ts (fechas en texto ISO). */
export function decodeValue(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(String(v.timestampValue)).toISOString();
  if ('mapValue' in v) return decodeFields(((v.mapValue ?? {}) as { fields?: Record<string, FsValue> }).fields);
  if ('arrayValue' in v) return (((v.arrayValue ?? {}) as { values?: FsValue[] }).values ?? []).map(decodeValue);
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}

export function decodeFields(fields: Record<string, FsValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, decodeValue(v)]));
}

export interface FsDoc {
  id: string;
  data: Record<string, unknown>;
  createTime?: string;
}

export interface FirestoreReader {
  list(path: string, pageSize?: number): Promise<FsDoc[]>;
}

/** Lector de colecciones por REST. Con `FIRESTORE_EMULATOR_HOST` usa el emulador (token 'owner'). */
export function createFirestoreReader(opts: { projectId: string; token: string; fetchFn: Fetch; baseUrl?: string }): FirestoreReader {
  const base = `${opts.baseUrl ?? 'https://firestore.googleapis.com/v1'}/projects/${opts.projectId}/databases/(default)/documents`;
  return {
    async list(path, pageSize = 300) {
      const out: FsDoc[] = [];
      let pageToken = '';
      do {
        const url = `${base}/${path}?pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const res = await opts.fetchFn(url, { headers: { authorization: `Bearer ${opts.token}` } });
        if (!res.ok) throw new Error(`Firestore ${path} (${res.status}): ${await res.text()}`);
        const page = (await res.json()) as { documents?: { name: string; fields?: Record<string, FsValue>; createTime?: string }[]; nextPageToken?: string };
        for (const d of page.documents ?? []) {
          out.push({ id: d.name.slice(d.name.lastIndexOf('/') + 1), data: decodeFields(d.fields), createTime: d.createTime });
        }
        pageToken = page.nextPageToken ?? '';
      } while (pageToken);
      return out;
    },
  };
}

// ---------- Exportación ----------

const LEAGUE_COLLECTIONS = ['players', 'events', 'entries', 'submissions', 'reactions', 'comments', 'suggestions'] as const;

/** Documento → fila del respaldo (`{ id, ...campos }`); sin createdAt se usa la hora de creación del documento. */
const row = (d: FsDoc) => ({ id: d.id, ...d.data, createdAt: d.data.createdAt ?? d.createTime ?? null });

export interface ExportOptions {
  /** Guarda los bytes de una foto y devuelve su ruta relativa (p. ej. 'fotos/<liga>/<foto>.jpg'). */
  savePhoto: (leagueId: string, photoId: string, bytes: Buffer, contentType: string) => Promise<string>;
  log?: (msg: string) => void;
  now?: () => Date;
}

export async function exportBowlingX(fs: FirestoreReader, opts: ExportOptions): Promise<FsBackup> {
  const log = opts.log ?? (() => undefined);
  const users = (await fs.list('users')).map(row);
  const members = (await fs.list('members')).map(row) as unknown as { leagueId?: string }[];
  const invites = (await fs.list('invites')).map((d) => ({ id: d.id, leagueId: String(d.data.leagueId ?? '') }));
  const leagues: FsLeague[] = [];
  for (const l of await fs.list('leagues')) {
    const league: FsLeague = { ...(row(l) as FsLeague) };
    for (const name of LEAGUE_COLLECTIONS) (league as unknown as Record<string, unknown>)[name] = (await fs.list(`leagues/${l.id}/${name}`)).map(row);
    league.members = members.filter((m) => m.leagueId === l.id) as FsLeague['members'];
    const priv = await fs.list(`leagues/${l.id}/private`);
    league.inviteCode = (priv.find((d) => d.id === 'invite')?.data.code as string | undefined) ?? null;
    // Fotos de a pocas por página (cada una pesa hasta ~560 KB).
    const photos: FsPhoto[] = [];
    for (const d of await fs.list(`leagues/${l.id}/photos`, 20)) {
      const data = typeof d.data.data === 'string' ? d.data.data : '';
      const m = /^data:(image\/(?:jpeg|webp));base64,/.exec(data);
      const base = { id: d.id, width: d.data.width as number, height: d.data.height as number, eventId: (d.data.eventId as string) ?? null, createdAt: row(d).createdAt as string };
      if (!m) {
        photos.push({ ...base, file: null, bytes: null });
        continue;
      }
      const bytes = Buffer.from(data.slice(m[0].length), 'base64');
      photos.push({ ...base, file: await opts.savePhoto(l.id, d.id, bytes, m[1]), bytes: bytes.length, contentType: m[1] });
    }
    league.photos = photos;
    leagues.push(league);
    log(`${league.name ?? l.id}: ${league.players?.length ?? 0} jugadores, ${league.events?.length ?? 0} eventos, ${league.entries?.length ?? 0} juegos, ${photos.length} fotos`);
  }
  return { app: 'BowlingX', exportedAt: (opts.now?.() ?? new Date()).toISOString(), leagues, users: users as FsBackup['users'], invites };
}
