/**
 * La exportación sintética (sintetico.ts, lo que escribe BowlingX de verdad) de punta a punta en PGlite con las
 * migraciones de hoy: primera carga, lo que ve la app (deporte, zona horaria, 18 años, superadmin, códigos de
 * invitación, rutas de las fotos), y VOLVER A CARGAR al corte con una exportación nueva (hay un solo proyecto):
 * lo borrado en BowlingX se borra, lo cambiado se pone al día, lo hecho en MatchMate que choca se quita, y una
 * tercera corrida no cambia nada.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalBackend, type LocalBackend } from '../../src/lib/backend/local';
import { createMemoryFileStore } from '../../src/lib/backend/localFiles';
import { firebaseHash, parseHashConfig, verifyFbscrypt } from './hash';
import { entryUuid, eventUuid, leagueUuid, legacyId, photoUuid, playerUuid, userUuid } from './ids';
import { checkCounts, checkParity, cleanNative, formatReport, formatScan, isMigratedId, runImport, scanTarget, type ImportResult, type TargetScan } from './importar';
import { makeSyntheticExport, scoreRolls, syntheticSummary } from './sintetico';
import { createLocalTarget, loadSqlFromDisk, memorySession, type LocalTarget } from './target';
import { BLOCKED_REASON, transformBackup } from './transform';
import type { FsBackup, FsLeague, MigrationPlan, PhotoFile } from './types';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SINCE = '2026-03-27';

// Pocos bytes por foto y un hash barato para que la prueba vaya rápido (lo demás, igual que el de verdad).
const exp = makeSyntheticExport({ photoBytes: 64, hash: { memCost: 10 } });
const files = createMemoryFileStore();
const readFile = async (f: PhotoFile) => ('file' in f.source ? exp.files.get(f.source.file)! : new Uint8Array());
const sessions: LocalBackend[] = [];
let target: LocalTarget;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const sizes = (m: Partial<Record<string, unknown[]>>) => Object.fromEntries(Object.entries(m).map(([t, rows]) => [t, rows?.length ?? 0]));
const uidOf = (email: string) => exp.auth.users.find((u) => u.email === email)!.localId;
const [L1, L2] = exp.backup.leagues;

async function load(backup: FsBackup, auth = exp.auth): Promise<{ plan: MigrationPlan; scan: TargetScan; result: ImportResult }> {
  const users = await target.listUsers();
  const plan = transformBackup(backup, { auth, hashConfig: exp.hash, existingUsers: users, photosSince: SINCE });
  const scan = await scanTarget(plan, target, users);
  const result = await runImport(plan, target, { readFile, scan });
  return { plan, scan, result };
}

/** El backend local con la sesión de una cuenta (uuid de MatchMate). */
async function as(userId: string): Promise<LocalBackend> {
  const b = await createLocalBackend({ sql: loadSqlFromDisk(ROOT), db: target.backend.db, sessionStore: memorySession(JSON.stringify({ userId, email: null })), files });
  sessions.push(b);
  return b;
}

const q = async <T>(sql: string, params: unknown[] = []) => (await target.backend.db.query<T>(sql, params)).rows;

let first: Awaited<ReturnType<typeof load>>;

beforeAll(async () => {
  target = await createLocalTarget({ root: ROOT, files });
  first = await load(exp.backup);
});

afterAll(async () => {
  for (const s of sessions) await s.close();
  await target?.close();
});

describe('exportación sintética (realista)', () => {
  it('trae lo que pide un ensayo de verdad', () => {
    const s = syntheticSummary(exp);
    expect(s.leagues).toBe(2);
    expect(s.players).toBeGreaterThanOrEqual(30);
    expect(s.games).toBeGreaterThanOrEqual(300);
    expect(s.submissions).toBeGreaterThan(20);
    const statuses = new Set(exp.backup.leagues.flatMap((l) => (l.submissions ?? []).map((x) => `${x.status}/${x.photoId ? 'foto' : 'sin'}/${x.eventId ? 'evento' : 'fecha'}`)));
    for (const k of ['aprobado/foto/evento', 'aprobado/sin/evento', 'rechazado/sin/fecha', 'pendiente/foto/fecha']) expect(statuses).toContain(k);
    const logins = exp.auth.users.map((u) => (u.providerUserInfo ?? []).map((p) => p.providerId).sort().join('+'));
    expect(new Set(logins)).toEqual(new Set(['password', 'google.com', 'google.com+password']));
    // Los tiros de los juegos anotados cuadro a cuadro dan el total.
    const withFrames = L1.entries!.filter((x) => x.frames);
    expect(withFrames.length).toBeGreaterThan(5);
    for (const x of withFrames) for (const [g, f] of Object.entries(x.frames!)) expect(scoreRolls(f.rolls)).toBe(x.scores![Number(g)]);
    // Como BowlingX: el orden de los equipos es Date.now().
    expect(Object.values(L1.events!.find((e) => e.name === 'Torneo Aniversario')!.teams!)[0]!.order).toBeGreaterThan(2 ** 31);
    // hash.txt se lee igual que lo que se copia de la consola.
    expect(parseHashConfig(exp.hashText)).toEqual(exp.hash);
  });
});

describe('primera carga', () => {
  it('cada tabla con sus filas, sin nada que borrar, y paridad IDÉNTICO', async () => {
    expect(formatScan(first.scan)).toBe('Nada de una carga anterior en esas ligas.');
    const counts = await checkCounts(first.plan, target, first.result, first.scan);
    for (const c of counts) expect(c.actual, c.table).toBe(c.expected);
    expect(first.plan.report.dropped).toEqual([]);
    const parity = await checkParity(exp.backup, first.plan, target);
    expect(parity.diffs).toEqual([]);
    expect(formatReport(first.plan, counts, parity, first.result)).toContain('IDÉNTICO');
    expect(first.result.files.uploaded).toBe(first.plan.files.length);
  });

  it('todo es boliche en la zona de Santo Domingo, con su código de invitación de BowlingX', async () => {
    const leagues = await q<{ id: string; sport: string; tz: string; kind: string; code: string }>(
      'select l.id, l.sport, l.tz, l.kind, s.invite_code as code from public.leagues l join public.league_secrets s on s.league_id = l.id order by l.name',
    );
    expect(leagues).toEqual([
      { id: leagueUuid(L1.id), sport: 'bowling', tz: 'America/Santo_Domingo', kind: 'liga', code: 'RD7KX4MP' },
      { id: leagueUuid(L2.id), sport: 'bowling', tz: 'America/Santo_Domingo', kind: 'torneo', code: 'PX9HQ3TW' },
    ]);
  });

  it('cuentas: nadie con los 18 años confirmados, superadmin solo el de verdad, la deshabilitada bloqueada', async () => {
    const rows = await q<{ email: string; adult: string | null; sup: boolean; blocked: string | null; reason: string | null; fuid: string | null }>(
      'select email, adult_confirmed_at as adult, is_superadmin as sup, blocked_at as blocked, blocked_reason as reason, firebase_uid as fuid from public.profiles',
    );
    expect(rows).toHaveLength(exp.auth.users.length);
    expect(rows.every((r) => r.adult === null && r.fuid)).toBe(true);
    expect(rows.filter((r) => r.sup).map((r) => r.email)).toEqual(['randy@ejemplo.do']);
    expect(rows.filter((r) => r.blocked).map((r) => [r.email, r.reason])).toEqual([['bloqueado@ejemplo.do', BLOCKED_REASON]]);
    // La contraseña de siempre sirve (el hash de Firebase tal cual).
    const luis = uidOf('luispena@ejemplo.do');
    const [u] = await q<{ pw: string; confirmed: boolean }>('select encrypted_password as pw, email_confirmed_at is not null as confirmed from auth.users where id = $1', [userUuid(luis)]);
    expect(verifyFbscrypt(exp.passwords[luis], u.pw)).toBe(true);
    expect(u.confirmed).toBe(false);
  });

  it('el link de invitación viejo sirve: una cuenta nueva de MatchMate ve la liga y se une', async () => {
    const fresh = await as(randomUUID());
    await fresh.auth.signOut().catch(() => undefined);
    await fresh.auth.signUp('nueva@ejemplo.do', 'clave-nueva-123', 'Nueva', { adult: 'true' });
    const preview = await fresh.rpc<{ league_id: string; name: string; sport: string }[]>('invite_preview', { p_code: 'rd7kx4mp' });
    expect(preview).toMatchObject([{ league_id: leagueUuid(L1.id), name: 'Liga Dominicana de Boliche', sport: 'bowling' }]);
    const joined = await fresh.rpc<{ league_id: string }>('join_league', { p_code: 'RD7KX4MP' });
    expect(joined.league_id).toBe(leagueUuid(L1.id));
  });

  it('fotos: la ruta <liga>/<foto>.jpg que piden Storage y la tabla, con sus bytes; las viejas no suben pero el juego sigue verificado', async () => {
    const photos = await q<{ id: string; league_id: string; path: string }>('select id, league_id, path from public.photos');
    expect(photos.length).toBe(first.plan.files.length);
    for (const p of photos) {
      expect(p.path).toMatch(new RegExp(`^${p.league_id}/[0-9a-f-]{36}\\.(jpg|webp)$`));
      expect(p.path).toBe(`${p.league_id}/${p.id}.jpg`);
      expect(await files.get(`scoreboards/${p.path}`)).toBeDefined();
    }
    // Una práctica de enero: su foto ya no existe, pero los juegos cuentan (la marca es el uuid de la foto).
    const jan = L1.events!.find((e) => e.date === '2026-01-06')!;
    const x = L1.entries!.find((e) => e.eventId === jan.id && e.photos!.some((m) => m))!;
    const [row] = await q<{ photos: string[] }>('select photos from public.entries where id = $1', [entryUuid(L1.id, jan.id, x.playerId)]);
    expect(row.photos.filter(Boolean)[0]).toBe(photoUuid(L1.id, x.photos!.find((m) => m)!));
    expect(photos.some((p) => p.id === row.photos.filter(Boolean)[0])).toBe(false);
  });

  it('volver a correr con la misma exportación no cambia nada', async () => {
    const again = await load(exp.backup);
    expect(again.plan.users.every((u) => u.existing)).toBe(true);
    expect(again.result.users).toEqual({ created: 0, existed: 0 });
    expect(again.result.removed).toEqual({});
    expect(again.result.sync).toEqual({ confirmed: 0, passwords: 0, signedIn: 0 });
    // Solo lo que hizo la cuenta nueva al unirse (se deja): nada que borrar.
    expect(again.scan.stale).toEqual({});
    expect(again.scan.clashes).toEqual({});
    expect(sizes(again.scan.native)).toEqual({ league_members: 1, players: 1 });
    for (const c of await checkCounts(again.plan, target, again.result, again.scan)) expect(c.actual, c.table).toBe(c.expected);
  });
});

describe('volver a cargar al corte (exportación nueva)', () => {
  const next = clone(exp.backup);
  const auth = clone(exp.auth);
  const l1 = next.leagues[0] as FsLeague;
  const newPassword = 'Clave-Cambiada-2026';
  const luis = uidOf('luispena@ejemplo.do');
  const pedro = uidOf('pcastillo@ejemplo.do');
  const ana = uidOf('ana.rosario@ejemplo.do');
  const wendy = uidOf('wendyj@ejemplo.do');
  const yokasta = uidOf('yokasta.n@ejemplo.do');
  const newcomer = 'nuevoUid0000000000000000000A';
  const removedReactions = l1.reactions!.slice(0, 5).map((r) => r.id);
  const removedComment = l1.comments![0].id;
  const nextPractice = l1.events!.find((e) => e.date === '2026-09-29')!;
  let clashEntry = '';
  let nativeComment = '';
  let cutover: Awaited<ReturnType<typeof load>>;

  beforeAll(async () => {
    // ---- Entre la primera carga y el corte, en MatchMate ----
    // Pedro ya entró a MatchMate (su contraseña de allá manda). La cuenta de Randy agrega a un jugador a la próxima
    // práctica (en BowlingX también lo agregan: choca) y comenta un juego (se queda).
    await q('update auth.users set last_sign_in_at = now() where id = $1', [userUuid(pedro)]);
    const randy = await as(userUuid(uidOf('randy@ejemplo.do')));
    const tony = L1.players!.find((p) => p.name === 'Tony Encarnación')!;
    await randy.rpc('add_entries', { p_event: eventUuid(L1.id, nextPractice.id), p_players: [{ player_id: playerUuid(L1.id, tony.id), average: 188 }] });
    clashEntry = (await q<{ id: string }>('select id from public.entries where event_id = $1 and player_id = $2', [eventUuid(L1.id, nextPractice.id), playerUuid(L1.id, tony.id)]))[0].id;
    const someEntry = L1.entries!.find((x) => x.scores!.every((s) => s != null))!;
    nativeComment = await randy.rpc<string>('add_comment', { p_entry: entryUuid(L1.id, someEntry.eventId, someEntry.playerId), p_text: 'Prueba en MatchMate' });

    // ---- Entre la primera carga y el corte, en BowlingX ----
    // Quitaron 5 reacciones y un comentario; borraron las fotos de antes del 15 de abril; Yokasta salió de la liga.
    l1.reactions = l1.reactions!.filter((r) => !removedReactions.includes(r.id));
    l1.comments = l1.comments!.filter((c) => c.id !== removedComment);
    l1.photos = l1.photos!.filter((p) => String(p.createdAt) >= '2026-04-15');
    const yMember = l1.members!.find((m) => m.uid === yokasta)!;
    l1.players!.find((p) => p.id === yMember.playerId)!.uid = null;
    l1.members = l1.members!.filter((m) => m.uid !== yokasta);
    // Wendy quedó vinculada a la jugadora histórica «Lisa Hernández» (su jugador de antes queda sin cuenta).
    const wMember = l1.members!.find((m) => m.uid === wendy)!;
    const lisa = l1.players!.find((p) => p.name === 'Lisa Hernández')!;
    l1.players!.find((p) => p.id === wMember.playerId)!.uid = null;
    lisa.uid = wendy;
    wMember.playerId = lisa.id;
    // Alguien nuevo se registró, se unió y jugó la práctica del 29 (junto con Tony, como en MatchMate).
    auth.users.push({
      localId: newcomer,
      email: 'nuevo.jugador@ejemplo.do',
      emailVerified: false,
      passwordHash: firebaseHash('Nuevo-123', 'c2FsLW51ZXZh', exp.hash),
      salt: 'c2FsLW51ZXZh',
      createdAt: String(Date.parse('2026-09-25T20:00:00Z')),
      providerUserInfo: [{ providerId: 'password', rawId: 'nuevo.jugador@ejemplo.do', email: 'nuevo.jugador@ejemplo.do' }],
    });
    next.users.push({ id: newcomer, email: 'nuevo.jugador@ejemplo.do', name: 'Jugador Nuevo', createdAt: '2026-09-25T20:00:00.000Z' });
    l1.players!.push({ id: 'pNuevo', name: 'Jugador Nuevo', averageOverride: null, uid: newcomer, createdAt: '2026-09-25T20:01:00.000Z' });
    l1.members!.push({ id: `${L1.id}_${newcomer}`, leagueId: L1.id, uid: newcomer, name: 'Jugador Nuevo', role: 'member', playerId: 'pNuevo', joinedAt: '2026-09-25T20:01:00.000Z' });
    for (const pid of ['pNuevo', tony.id]) {
      l1.entries!.push({ id: `${nextPractice.id}_${pid}`, eventId: nextPractice.id, playerId: pid, teamId: null, average: 170, handicapOverride: null, scores: [170, 181, 165], photos: ['sin-foto', 'sin-foto', 'sin-foto'] });
    }
    // Un envío pendiente se aprobó.
    const pending = l1.submissions!.find((x) => x.status === 'pendiente' && x.eventId)!;
    pending.status = 'aprobado';
    pending.reviewedAt = '2026-09-28T12:00:00.000Z';
    pending.reviewedBy = uidOf('randy@ejemplo.do');
    // Luis cambió su contraseña y Ana verificó su correo.
    const la = auth.users.find((u) => u.localId === luis)!;
    la.passwordHash = firebaseHash(newPassword, la.salt!, exp.hash);
    auth.users.find((u) => u.localId === pedro)!.passwordHash = firebaseHash(newPassword, auth.users.find((u) => u.localId === pedro)!.salt!, exp.hash);
    auth.users.find((u) => u.localId === ana)!.emailVerified = true;
    next.exportedAt = '2026-09-28T23:00:00.000Z';

    cutover = await load(next, auth);
  });

  it('antes de cargar dice qué borra y qué deja', () => {
    const s = cutover.scan;
    expect(s.stale.reactions).toHaveLength(5);
    expect(s.stale.comments).toHaveLength(1);
    expect(s.stale.league_members?.map((r) => r.user_id)).toEqual([userUuid(yokasta)]);
    expect(s.stale.photos!.length).toBeGreaterThan(0);
    expect(s.files).toHaveLength(s.stale.photos!.length);
    expect(s.clashes.entries?.map((r) => r.id)).toEqual([clashEntry]);
    expect(s.unlink).toHaveLength(1);
    expect(sizes(s.native)).toEqual({ comments: 1, league_members: 1, players: 1 });
    expect(isMigratedId(clashEntry)).toBe(false);
    expect(formatScan(s)).toContain('Se BORRAN');
  });

  it('queda igual que BowlingX: conteos ok (más lo hecho en MatchMate que se deja) y paridad IDÉNTICO', async () => {
    const counts = await checkCounts(cutover.plan, target, cutover.result, cutover.scan);
    for (const c of counts) expect(c.actual, c.table).toBe(c.expected);
    expect(counts.find((c) => c.table === 'comments')!.native).toBe(1);
    const parity = await checkParity(next, cutover.plan, target);
    expect(parity.diffs).toEqual([]);
    expect(await q('select id from public.comments where id = $1', [nativeComment])).toHaveLength(1);
    expect(await q('select id from public.entries where id = $1', [clashEntry])).toHaveLength(0);
    // Las fotos borradas en BowlingX ya no están en Storage.
    for (const p of cutover.scan.files) expect(await files.get(`scoreboards/${p}`)).toBeUndefined();
  });

  it('cuentas al día: la nueva se crea, la contraseña cambiada pasa (si no entró a MatchMate) y el correo verificado se confirma', async () => {
    expect(cutover.result.users.created).toBe(1);
    expect(cutover.result.sync).toMatchObject({ confirmed: 1, passwords: 1, signedIn: 1 });
    const pw = async (uid: string) => (await q<{ pw: string }>('select encrypted_password as pw from auth.users where id = $1', [userUuid(uid)]))[0].pw;
    expect(verifyFbscrypt(newPassword, await pw(luis))).toBe(true);
    // Pedro ya había entrado a MatchMate: se queda con la de antes.
    expect(verifyFbscrypt(exp.passwords[pedro], await pw(pedro))).toBe(true);
    const [a] = await q<{ ok: boolean }>('select email_confirmed_at is not null as ok from auth.users where id = $1', [userUuid(ana)]);
    expect(a.ok).toBe(true);
    // Wendy juega con Lisa; su jugador de antes queda sin cuenta. Yokasta ya no es miembro.
    const w = await q<{ id: string }>('select id from public.players where user_id = $1', [userUuid(wendy)]);
    expect(w.map((r) => r.id)).toEqual([playerUuid(L1.id, L1.players!.find((p) => p.name === 'Lisa Hernández')!.id)]);
    expect(await q('select 1 from public.league_members where user_id = $1 and league_id = $2', [userUuid(yokasta), leagueUuid(L1.id)])).toHaveLength(0);
  });

  it('una tercera corrida con la misma exportación no borra ni cambia nada', async () => {
    const again = await load(next, auth);
    expect(again.result.removed).toEqual({});
    expect(again.result.users).toEqual({ created: 0, existed: 0 });
    expect(again.result.sync).toMatchObject({ confirmed: 0, passwords: 0 });
    expect(sizes(again.scan.native)).toEqual({ comments: 1, league_members: 1, players: 1 });
    for (const c of await checkCounts(again.plan, target, again.result, again.scan)) expect(c.actual, c.table).toBe(c.expected);
    expect((await checkParity(next, again.plan, target)).ok).toBe(true);
    expect(legacyId('comment', L1.id, removedComment)).not.toBe(nativeComment);
  });

  it('--limpiar: también se borra lo hecho en MatchMate en esas ligas (la cuenta de prueba que se unió, el comentario)', async () => {
    const users = await target.listUsers();
    const plan = transformBackup(next, { auth, hashConfig: exp.hash, existingUsers: users, photosSince: SINCE });
    const scan = cleanNative(await scanTarget(plan, target, users));
    expect(sizes(scan.clashes)).toEqual({ comments: 1, league_members: 1, players: 1 });
    const result = await runImport(plan, target, { readFile, scan });
    expect(result.removed).toEqual({ comments: 1, league_members: 1, players: 1 });
    for (const c of await checkCounts(plan, target, result)) expect(c.actual, c.table).toBe(c.expected);
    expect((await checkParity(next, plan, target)).ok).toBe(true);
    // La cuenta de prueba sigue existiendo (solo salió de la liga); las cuentas no se borran.
    expect(await q("select 1 from auth.users where email = 'nueva@ejemplo.do'")).toHaveLength(1);
  });
});
