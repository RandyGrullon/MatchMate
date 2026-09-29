import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackendError } from './backend/types';
import { rpc } from './data/client';
import { createLeague, deleteLeague, fetchLeague, getInvite, getInviteCode, joinLeague } from './data/leagues';
import { openWorld, type TestWorld } from './data/testkit';
import { uuidv7 } from './db/ids';
import type { CompressedLogo } from './image';
import { isLogoPathOf, LOGO_BUCKET, logoErrorText, logoPath, removeLeagueLogo, uploadLeagueLogo } from './logos';

/**
 * El logo de una liga contra la base de verdad (PGlite con las migraciones, y las mismas reglas de Storage en el
 * backend local): rosa (dueña) reserva, lo sube, lo cambia y lo quita; ana (miembro) no puede; sin reservar no se
 * sube nada; sin cuenta se ve; al borrar la liga se va el archivo (solo si la liga se borró).
 */

let w: TestWorld;
let rosa: string;
let lid: string;

const leagueInput = (name: string) => ({
  name,
  kind: 'liga' as const,
  visibility: 'public' as const,
  venue: 'Bolera',
  schedule: 'Martes 7:00 pm',
  seasonStart: '',
  seasonEnd: '',
  contactName: 'Rosa',
  contactPhone: '',
  requirePhoto: false,
});

/** Un logo "ya comprimido" (en Node no hay canvas): unos bytes con su tipo. */
const logo = (byte: number, contentType: CompressedLogo['contentType'] = 'image/webp'): CompressedLogo => ({
  blob: new Blob([new Uint8Array([byte, byte, byte, 7])], { type: contentType }),
  contentType,
  side: 256,
});

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;
const logoOf = async (id: string) => (await q<{ logo_path: string | null }>('select logo_path from public.leagues where id = $1', [id]))[0]?.logo_path ?? null;
const fileExists = (path: string) => w.b.storage.publicUrl(LOGO_BUCKET, path).then(
  () => true,
  (e: unknown) => {
    if (e instanceof BackendError && e.kind === 'not_found') return false;
    throw e;
  },
);

async function failure(p: Promise<unknown>): Promise<BackendError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof BackendError) return e;
    throw e;
  }
  throw new Error('debió fallar');
}

beforeAll(async () => {
  w = await openWorld();
  await w.signUp('ana@x.com', 'Ana');
  rosa = await w.signUp('rosa@x.com', 'Rosa');
  lid = await createLeague({ uid: rosa, name: 'Rosa' }, leagueInput('Liga con logo'));
  await w.as('ana@x.com');
  await joinLeague(lid, { uid: 'ana', name: 'Ana' }, null);
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('logo de la liga', () => {
  let first: string;

  it('la dueña lo sube: queda en la liga y el archivo se ve (también sin cuenta)', async () => {
    await w.as('rosa@x.com');
    first = await uploadLeagueLogo(lid, logo(1));
    expect(isLogoPathOf(lid, first)).toBe(true);
    expect(first.endsWith('.webp')).toBe(true);
    expect(await logoOf(lid)).toBe(first);
    expect((await fetchLeague(lid))?.logoPath).toBe(first);
    expect(await w.b.storage.publicUrl(LOGO_BUCKET, first)).toBe(`data:image/webp;base64,${btoa(String.fromCharCode(1, 1, 1, 7))}`);
  });

  it('quien abre la invitación ve el logo (invite_preview, sin cuenta)', async () => {
    const code = await getInviteCode(lid);
    expect(code).toBeTruthy();
    await w.b.auth.signOut();
    expect((await getInvite(code!))?.logoPath).toBe(first);
    expect(await fileExists(first)).toBe(true);
  });

  it('un miembro no lo puede subir, poner ni borrar', async () => {
    await w.as('ana@x.com');
    const upload = await failure(uploadLeagueLogo(lid, logo(2)));
    expect(upload.kind).toBe('permission');
    expect(logoErrorText(upload)).toBe('Solo el dueño o un admin puede cambiar el logo de la liga.');
    // La RPC tampoco (con una ruta bien formada que alguien más subió).
    const path = logoPath(lid, uuidv7(), 'image/webp');
    expect((await failure(rpc('set_league_logo', { p_league: lid, p_path: path }))).kind).toBe('permission');
    expect((await failure(removeLeagueLogo(lid))).kind).toBe('permission');
    // Borrar el archivo: Storage se lo salta sin error (no es admin de la liga).
    await w.b.storage.remove(LOGO_BUCKET, [first]);
    expect(await fileExists(first)).toBe(true);
    expect(await logoOf(lid)).toBe(first);
  });

  it('una ruta que no es de la liga, o que no se reservó antes, no sirve (ni para subir ni para ponerla)', async () => {
    await w.as('rosa@x.com');
    const otra = logoPath(uuidv7(), uuidv7(), 'image/webp');
    expect((await failure(rpc('set_league_logo', { p_league: lid, p_path: otra }))).kind).toBe('validation');
    expect((await failure(rpc('set_league_logo', { p_league: lid, p_path: `${lid}/logo.webp` }))).kind).toBe('validation');
    // Bien formada pero sin begin_logo_upload: Storage no la acepta y la liga no la toma.
    const unreserved = logoPath(lid, uuidv7(), 'image/webp');
    expect((await failure(w.b.storage.upload(LOGO_BUCKET, unreserved, logo(9).blob, 'image/webp'))).kind).toBe('permission');
    expect(await fileExists(unreserved)).toBe(false);
    expect((await failure(rpc('set_league_logo', { p_league: lid, p_path: unreserved }))).kind).toBe('validation');
    expect(await logoOf(lid)).toBe(first);
  });

  it('cambiarlo sube uno nuevo (JPEG si el teléfono no hace WebP) y borra el anterior', async () => {
    const second = await uploadLeagueLogo(lid, logo(3, 'image/jpeg'));
    expect(second).not.toBe(first);
    expect(second.endsWith('.jpg')).toBe(true);
    expect(await logoOf(lid)).toBe(second);
    expect(await fileExists(first)).toBe(false);
    expect(await fileExists(second)).toBe(true);
  });

  it('quitarlo deja la liga sin logo y borra el archivo', async () => {
    const current = (await logoOf(lid))!;
    await removeLeagueLogo(lid);
    expect(await logoOf(lid)).toBeNull();
    expect((await fetchLeague(lid))?.logoPath).toBeNull();
    expect(await fileExists(current)).toBe(false);
    // Quitarlo otra vez no hace nada.
    await removeLeagueLogo(lid);
    expect(await logoOf(lid)).toBeNull();
  });

  it('al borrar la liga se borra también el archivo del logo (después de borrarla)', async () => {
    const other = await createLeague({ uid: rosa, name: 'Rosa' }, leagueInput('Liga que se borra'));
    const path = await uploadLeagueLogo(other, logo(4));
    expect(await fileExists(path)).toBe(true);
    await deleteLeague(other, rosa);
    expect(await fetchLeague(other)).toBeNull();
    expect(await fileExists(path)).toBe(false);
  });

  it('un admin que no es dueño no puede borrar la liga: el logo se queda (archivo y liga)', async () => {
    const other = await createLeague({ uid: rosa, name: 'Rosa' }, leagueInput('Liga que no se borra'));
    const path = await uploadLeagueLogo(other, logo(5));
    const [{ id: ana }] = await q<{ id: string }>(`select id from public.profiles where email = 'ana@x.com'`);
    await w.as('ana@x.com');
    await joinLeague(other, { uid: 'ana', name: 'Ana' }, null);
    await w.as('rosa@x.com');
    await rpc('set_member_role', { p_league: other, p_user: ana, p_role: 'admin' });
    // Ana es admin (Storage la deja borrar los archivos de la liga), pero solo la dueña borra la liga.
    await w.as('ana@x.com');
    expect((await failure(deleteLeague(other, ana))).kind).toBe('permission');
    expect((await fetchLeague(other))?.logoPath).toBe(path);
    expect(await fileExists(path)).toBe(true);
    await w.as('rosa@x.com');
    await deleteLeague(other, rosa);
    expect(await fileExists(path)).toBe(false);
  });
});
