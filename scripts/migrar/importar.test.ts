/**
 * De punta a punta: respaldo de prueba → transformador → PGlite con las migraciones de verdad (CHECK, FK, triggers
 * y RLS) → conteos, lo que ve cada quien (RLS) y paridad de números con BowlingX.
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalBackend, type LocalBackend } from '../../src/lib/backend/local';
import { createMemoryFileStore } from '../../src/lib/backend/localFiles';
import { HASH_CONFIG, makeAuthExport, makeBackup, passwordOf, PHOTO_BYTES } from './fixture';
import { verifyFbscrypt } from './hash';
import { entryUuid, eventUuid, leagueUuid, photoUuid, playerUuid, teamUuid, userUuid } from './ids';
import { checkCounts, checkParity, dataUrlBytes, formatReport, runImport } from './importar';
import { createLocalTarget, loadSqlFromDisk, memorySession, type LocalTarget } from './target';
import { transformBackup } from './transform';
import type { MigrationPlan, PhotoFile } from './types';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const L1 = leagueUuid('L1banco');
const L2 = leagueUuid('L2copa');
const readFile = async (f: PhotoFile) => ('dataUrl' in f.source ? dataUrlBytes(f.source.dataUrl) : new Uint8Array());

let target: LocalTarget;
let plan: MigrationPlan;
const backup = makeBackup();
const files = createMemoryFileStore();
const sessions: LocalBackend[] = [];

/** El backend local con la sesión de una cuenta migrada (o sin sesión). */
async function as(uid: string | null): Promise<LocalBackend> {
  const session = uid ? JSON.stringify({ userId: userUuid(uid), email: null }) : null;
  const b = await createLocalBackend({ sql: loadSqlFromDisk(ROOT), db: target.backend.db, sessionStore: memorySession(session), files });
  sessions.push(b);
  return b;
}

beforeAll(async () => {
  target = await createLocalTarget({ root: ROOT, files });
  plan = transformBackup(backup, { auth: makeAuthExport(), hashConfig: HASH_CONFIG, existingUsers: await target.listUsers(), photosSince: '2025-06-01' });
  await runImport(plan, target, { readFile });
});

afterAll(async () => {
  for (const s of sessions) await s.close();
  await target?.close();
});

describe('importar en PGlite (migraciones de verdad)', () => {
  it('quedan las filas del plan en cada tabla', async () => {
    const counts = await checkCounts(plan, target);
    for (const c of counts) expect(c.actual, c.table).toBe(c.expected);
    expect(counts.find((c) => c.table === 'entries')!.actual).toBe(14);
    // player_count lo lleva la base (trigger), no el respaldo.
    const [e2] = (await target.backend.db.query<{ player_count: number }>('select player_count from public.events where id = $1', [eventUuid('L1banco', 'e2')])).rows;
    expect(e2.player_count).toBe(5);
  });

  it('volver a correrla no duplica nada ni falla (upsert por id)', async () => {
    const again = transformBackup(backup, { auth: makeAuthExport(), hashConfig: HASH_CONFIG, existingUsers: await target.listUsers(), photosSince: '2025-06-01' });
    // Las cuentas ya existen con el mismo id: no se crean de nuevo.
    expect(again.users.every((u) => u.existing)).toBe(true);
    const r = await runImport(again, target, { readFile });
    expect(r.users).toEqual({ created: 0, existed: 0 });
    for (const c of await checkCounts(plan, target)) expect(c.actual, c.table).toBe(c.expected);
  });

  it('la cuenta queda con su hash de Firebase y el perfil con firebase_uid', async () => {
    const [u] = (
      await target.backend.db.query<{ encrypted_password: string; email_confirmed_at: string | null }>(
        'select encrypted_password, email_confirmed_at from auth.users where id = $1',
        [userUuid('uLuis')],
      )
    ).rows;
    expect(verifyFbscrypt(passwordOf('uLuis'), u.encrypted_password)).toBe(true);
    expect(u.email_confirmed_at).toBeNull();
    const [p] = (await target.backend.db.query<{ name: string; firebase_uid: string; is_superadmin: boolean }>('select * from public.profiles where id = $1', [userUuid('uDios')])).rows;
    expect(p).toMatchObject({ name: 'Randy', firebase_uid: 'uDios', is_superadmin: true });
  });

  it('las fotos quedan en Storage (local) con sus bytes', async () => {
    const id = photoUuid('L1banco', 'ph1');
    const url = await (await as('uLuis')).storage.signedUrl('scoreboards', `${L1}/${id}.jpg`);
    expect(Buffer.from(url.split(',')[1], 'base64')).toEqual(Buffer.from([...PHOTO_BYTES, 1]));
  });
});

describe('lo que ve cada quien (RLS)', () => {
  it('miembro de la liga privada: ve sus dos ligas, sus jugadores y su membresía con jugador; no el buzón', async () => {
    const b = await as('uLuis');
    expect((await b.select<{ id: string }>({ table: 'leagues', columns: 'id' })).map((r) => r.id).sort()).toEqual([L1, L2].sort());
    expect(await b.select({ table: 'players', filters: [{ col: 'league_id', op: 'eq', value: L1 }] })).toHaveLength(6);
    expect(await b.select({ table: 'suggestions' })).toEqual([]);
    const mine = await b.select<{ league_id: string; player_id: string | null }>({
      table: 'memberships',
      columns: 'league_id,player_id',
      filters: [{ col: 'user_id', op: 'eq', value: userUuid('uLuis') }],
    });
    expect(Object.fromEntries(mine.map((m) => [m.league_id, m.player_id]))).toEqual({ [L1]: playerUuid('L1banco', 'pLuis'), [L2]: playerUuid('L2copa', 'pLuis2') });
    expect((await b.select<{ firebase_uid: string }>({ table: 'profiles', columns: 'firebase_uid' })).map((r) => r.firebase_uid)).toEqual(['uLuis']);
    const [luisE1] = await b.select<{ scores: number[]; photos: string[] }>({ table: 'entries', filters: [{ col: 'id', op: 'eq', value: entryUuid('L1banco', 'e1', 'pLuis') }] });
    expect(luisE1).toMatchObject({ scores: [150, 180, null], photos: [photoUuid('L1banco', 'ph1'), photoUuid('L1banco', 'ph1'), null] });
  });

  it('admin: ve el buzón y el código de su liga', async () => {
    const b = await as('uSofi');
    expect((await b.select<{ text: string }>({ table: 'suggestions', columns: 'text' })).map((r) => r.text).sort()).toEqual(['Cambiar el horario a las 8', 'Más torneos']);
    expect(await b.select({ table: 'league_secrets', columns: 'league_id,invite_code' })).toEqual([{ league_id: L1, invite_code: 'ABCD2345' }]);
  });

  it('dueña del torneo: su buzón; en la otra liga es miembro sin jugador', async () => {
    const b = await as('uAna');
    expect(await b.select({ table: 'suggestions', columns: 'text' })).toEqual([{ text: 'Que el torneo sea mensual' }]);
    const m = await b.select<{ league_id: string; role: string; player_id: string | null }>({
      table: 'memberships',
      columns: 'league_id,role,player_id',
      filters: [{ col: 'user_id', op: 'eq', value: userUuid('uAna') }],
    });
    expect(m.find((x) => x.league_id === L1)).toEqual({ league_id: L1, role: 'member', player_id: null });
    expect(m.find((x) => x.league_id === L2)).toMatchObject({ role: 'owner' });
  });

  it('sin cuenta: solo la liga pública y sus juegos', async () => {
    const b = await as(null);
    expect((await b.select<{ id: string }>({ table: 'leagues', columns: 'id' })).map((r) => r.id)).toEqual([L2]);
    expect(await b.select({ table: 'entries' })).toHaveLength(4);
    expect(await b.select({ table: 'reactions' })).toHaveLength(1);
  });

  it('admin@admin.com ya no es superadmin; el superadmin migrado ve todo', async () => {
    const admin = await as('uAdmin');
    expect((await admin.select<{ id: string }>({ table: 'leagues', columns: 'id' })).map((r) => r.id)).toEqual([L2]);
    const dios = await as('uDios');
    expect(await dios.select({ table: 'profiles', columns: 'id' })).toHaveLength(9);
    expect(await dios.select({ table: 'leagues', columns: 'id' })).toHaveLength(2);
  });

  it('la cuenta migrada escribe con las RPC de siempre (su «voy» y su comentario)', async () => {
    const b = await as('uLuis');
    await b.rpc('set_rsvp', { p_event: eventUuid('L1banco', 'e3'), p_going: true });
    const id = await b.rpc<string>('add_comment', { p_entry: entryUuid('L1banco', 'e1', 'pOrg'), p_text: 'Tremenda noche' });
    const [c] = await b.select<{ author_name: string }>({ table: 'comments', filters: [{ col: 'id', op: 'eq', value: id }] });
    expect(c.author_name).toBe('Luis');
  });
});

describe('paridad con BowlingX (stats.ts de los dos lados)', () => {
  it('respaldo limpio: todo idéntico', async () => {
    const clean = makeBackup({ dirty: false });
    const t = await createLocalTarget({ root: ROOT });
    try {
      const p = transformBackup(clean, { auth: makeAuthExport(), hashConfig: HASH_CONFIG, existingUsers: await t.listUsers() });
      await runImport(p, t, { readFile });
      const parity = await checkParity(clean, p, t);
      expect(parity.diffs).toEqual([]);
      expect(parity.ok).toBe(true);
      expect(parity.checked).toEqual({ leagues: 2, players: 9, events: 4, seasons: 3, accounts: 5 });
      expect(formatReport(p, await checkCounts(p, t), parity)).toContain('IDÉNTICO');
    } finally {
      await t.close();
    }
  });

  it('respaldo con errores: las diferencias son justo las que el reporte explica', async () => {
    const parity = await checkParity(backup, plan, target);
    expect(parity.ok).toBe(false);
    // Pedro tenía un 301 (se quitó), el juego de un jugador borrado no pasa, el nombre largo se recortó, el
    // equipo sin nombre quedó «Equipo 2» y el evento con fecha mala no pasa. Nada más.
    const explained = [playerUuid('L1banco', 'pPedro'), playerUuid('L1banco', 'pGone'), playerUuid('L1banco', 'pLong'), eventUuid('L1banco', 'eBad'), 'Equipo 2'];
    for (const d of parity.diffs) {
      const text = `${d.path} ${JSON.stringify(d.bowlingx)} ${JSON.stringify(d.matchmate)}`;
      const inE1 = d.path.startsWith(`events.${L1}/${eventUuid('L1banco', 'e1')}`) || d.path.startsWith(`seasons.${L1}/2026`);
      expect(inE1 || explained.some((x) => text.includes(x)), text).toBe(true);
    }
    expect(parity.diffs.some((d) => d.path === `players.${L1}/${playerUuid('L1banco', 'pPedro')}.pins`)).toBe(true);
    expect(parity.diffs).toContainEqual({ path: `events.${L2}/${eventUuid('L2copa', 't1')}.teams.${teamUuid('L2copa', 't1', 'b')}.name`, bowlingx: '', matchmate: 'Equipo 2' });
    const text = formatReport(plan, await checkCounts(plan, target), parity);
    expect(text).toContain('diferencias');
    expect(text).toContain('809-555-1234');
  });
});
