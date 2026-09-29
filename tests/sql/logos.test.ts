/**
 * Logo de ligas y torneos (20260929001000_sueltos_logos.sql y el Storage de 20260929001010_logos_supabase.sql):
 * leagues.logo_path, begin_logo_upload (la reserva de cada subida), set_league_logo, private.can_upload_logo_path y
 * private.can_remove_logo_path, la cola de Storage de lo que ya no se usa, lo que ve quien todavía no es de la liga
 * (invite_preview, invite_details, my_league_invites, league_invite_details) y la consola (admin_leagues). Las
 * políticas del bucket 'logos' se prueban en PGlite con el storage.objects mínimo del shim, como consola.test.ts.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; código ABCD2345) y liga
 * pública Abierta de otro. Cuentas sin liga: nuevo, otra y extra; dios es superadmin.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, MIGRATIONS_DIR, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

let db: TestDb;
let w: World;

type Json = Record<string, any>;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
});
afterEach(async () => {
  await db.rollback();
});

/** Una ruta nueva para el logo de esa liga, como la arma src/lib/logos.ts. */
const logo = (lid: string, ext = 'webp') => `${lid}/${randomUUID()}.${ext}`;
const reserve = (who: string, lid: string, path: string | null) => db.rpc(who, 'begin_logo_upload', { p_league: lid, p_path: path });
const setLogo = (who: string, lid: string, path: string | null) => db.rpc<string | null>(who, 'set_league_logo', { p_league: lid, p_path: path });
/** Como la app: reserva, (sube) y pone. */
const putLogo = async (who: string, lid: string, path: string) => {
  await reserve(who, lid, path);
  return setLogo(who, lid, path);
};
const logoOf = async (lid: string) => (await db.admin<{ logo_path: string | null }>('select logo_path from public.leagues where id = $1', [lid]))[0].logo_path;
const canUpload = async (who: string, path: string) =>
  (await db.as<{ ok: boolean }>(who, 'select private.can_upload_logo_path($1) as ok', [path]))[0].ok;
const canRemove = async (who: string, path: string) =>
  (await db.as<{ ok: boolean }>(who, 'select private.can_remove_logo_path($1) as ok', [path]))[0].ok;
const queued = () => db.admin<{ path: string; bucket: string }>(`select path, bucket from private.storage_purge_queue where bucket = 'logos' order by path`);
const reservations = () => db.admin<{ path: string }>('select path from private.logo_uploads order by path');
const hits = async (who: string) => (await db.admin<{ hits: number }>('select hits from private.rate_limits where key = $1', [`logo:${who}`]))[0]?.hits ?? 0;
const block = (id: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: id, p_reason: 'prueba' });
const sorted = (paths: string[]) => [...paths].sort().map((path) => ({ path, bucket: 'logos' }));

describe('permisos', () => {
  it('begin_logo_upload y set_league_logo: solo con sesión, security definer y pasan por require_uid; las ayudas de Storage, solo con sesión', async () => {
    const rows = await db.admin<Json>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('begin_logo_upload', 'set_league_logo') order by 1`,
    );
    expect(rows).toEqual(['begin_logo_upload', 'set_league_logo'].map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true })));
    await fails(reserve(ANON, w.priv, logo(w.priv)), '42501');
    await fails(setLogo(ANON, w.priv, logo(w.priv)), '42501');
    await fails(db.asAnon('select private.can_upload_logo_path($1)', [logo(w.priv)]), '42501');
    await fails(db.asAnon('select private.can_remove_logo_path($1)', [logo(w.priv)]), '42501');
    // La limpieza y el trigger no los ejecuta la app.
    for (const fn of ['private.logo_uploads_cleanup(timestamptz)', 'private.queue_logo_purge()']) {
      expect(await db.admin(`select has_function_privilege('authenticated', $1, 'execute') as x`, [fn])).toEqual([{ x: false }]);
    }
    // Nadie lo escribe directo, ni lee las reservas.
    await fails(db.as(w.u.org, 'update public.leagues set logo_path = $2 where id = $1', [w.priv, logo(w.priv)]), '42501');
    await fails(db.as(w.u.org, 'select path from private.logo_uploads'), '42501');
  });

  it('la columna solo acepta rutas de su propia liga (también por debajo)', async () => {
    for (const bad of [logo(w.pub), `${w.priv}/logo.webp`, logo(w.priv, 'gif'), `${w.priv}/x/${randomUUID()}.webp`, `/${w.priv}/${randomUUID()}.webp`]) {
      await fails(db.asService('update public.leagues set logo_path = $2 where id = $1', [w.priv, bad]), '23514');
    }
    for (const ext of ['webp', 'jpg', 'png']) await db.asService('update public.leagues set logo_path = $2 where id = $1', [w.priv, logo(w.priv, ext)]);
  });
});

describe('begin_logo_upload (la reserva de cada subida)', () => {
  it('el dueño, un admin o el superadmin reservan una ruta nueva de esa liga; cada una cuenta en el límite', async () => {
    const a = logo(w.priv);
    await reserve(w.u.sofi, w.priv, a);
    await reserve(w.u.org, w.priv, logo(w.priv, 'jpg'));
    await reserve(w.u.dios, w.pub, logo(w.pub, 'png'));
    expect(await db.admin('select league_id, user_id from private.logo_uploads where path = $1', [a])).toEqual([{ league_id: w.priv, user_id: w.u.sofi }]);
    expect(await db.count('private.logo_uploads')).toBe(3);
    expect(await hits(w.u.sofi)).toBe(1);
  });

  it('nadie más; liga que no existe; ruta que no sirve o que ya se usó', async () => {
    for (const who of [w.u.luis, w.u.ana, w.u.extra, w.u.otro]) await fails(reserve(who, w.priv, logo(w.priv)), DENIED);
    await fails(reserve(w.u.sofi, randomUUID(), logo(w.priv)), 'no_existe');
    const bad = [
      logo(w.pub),
      logo(w.priv, 'gif'),
      `${w.priv}/logo.webp`,
      `${w.priv}/${randomUUID().toUpperCase()}.webp`,
      `${w.priv}/${randomUUID()}.webp/x`,
      '',
      null,
    ];
    for (const path of bad) await fails(reserve(w.u.sofi, w.priv, path), 'invalido');
    // La misma ruta dos veces, la del logo de ahora o una que ya está en la cola de Storage: no.
    const a = logo(w.priv);
    await putLogo(w.u.sofi, w.priv, a);
    await fails(reserve(w.u.org, w.priv, a), 'invalido');
    const b = logo(w.priv);
    await reserve(w.u.sofi, w.priv, b);
    await fails(reserve(w.u.sofi, w.priv, b), 'invalido');
    await setLogo(w.u.sofi, w.priv, b);
    expect(await queued()).toEqual(sorted([a]));
    await fails(reserve(w.u.sofi, w.priv, a), 'invalido');
    expect(await db.count('private.logo_uploads')).toBe(0);
  });

  it('cuenta bloqueada: no reserva; ritmo: 30 por día (se use o no)', async () => {
    await block(w.u.sofi);
    await fails(reserve(w.u.sofi, w.priv, logo(w.priv)), 'bloqueada');
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ($1, now(), 29)`, [`logo:${w.u.org}`]);
    await reserve(w.u.org, w.priv, logo(w.priv));
    await fails(reserve(w.u.org, w.priv, logo(w.priv)), 'rate_limited');
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`logo:${w.u.org}`]);
    await reserve(w.u.org, w.priv, logo(w.priv));
  });
});

describe('set_league_logo', () => {
  it('el admin lo pone, lo cambia y lo quita; cada vez devuelve el anterior para borrarlo', async () => {
    const a = logo(w.priv);
    const b = logo(w.priv, 'jpg');
    expect(await putLogo(w.u.sofi, w.priv, a)).toBeNull();
    expect(await logoOf(w.priv)).toBe(a);
    expect(await putLogo(w.u.org, w.priv, b)).toBe(a);
    // El mismo: nada que borrar (y no cuenta en el límite: solo contó la reserva).
    expect(await setLogo(w.u.org, w.priv, b)).toBeNull();
    expect(await hits(w.u.org)).toBe(1);
    expect(await setLogo(w.u.sofi, w.priv, null)).toBe(b);
    expect(await logoOf(w.priv)).toBeNull();
    expect(await setLogo(w.u.sofi, w.priv, null)).toBeNull();
    // Quitarlo sí cuenta (reserva de a + quitar).
    expect(await hits(w.u.sofi)).toBe(2);
    // El superadmin, en cualquier liga.
    const c = logo(w.pub, 'png');
    expect(await putLogo(w.u.dios, w.pub, c)).toBeNull();
    expect(await logoOf(w.pub)).toBe(c);
  });

  it('solo el dueño, un admin o el superadmin; liga que no existe; ruta que no sirve', async () => {
    const reserved = logo(w.priv);
    await reserve(w.u.sofi, w.priv, reserved);
    for (const who of [w.u.luis, w.u.ana, w.u.extra, w.u.otro]) await fails(setLogo(who, w.priv, reserved), DENIED);
    await fails(setLogo(w.u.sofi, randomUUID(), reserved), 'no_existe');
    const bad = [
      logo(w.pub),
      logo(w.priv, 'gif'),
      `${w.priv}/logo.webp`,
      `${w.priv}/${randomUUID().toUpperCase()}.webp`,
      `${w.priv.toUpperCase()}/${randomUUID()}.webp`,
      `${w.priv}/${randomUUID()}.webp/x`,
      `${w.priv}/${randomUUID()}xwebp`,
      '',
    ];
    for (const path of bad) await fails(setLogo(w.u.sofi, w.priv, path), 'invalido');
    expect(await logoOf(w.priv)).toBeNull();
  });

  it('solo una ruta que reservó esa cuenta para esa liga, hace menos de un día, y una sola vez', async () => {
    // Sin reservar (bien formada), reservada por otra cuenta o para otra liga: no.
    await fails(setLogo(w.u.sofi, w.priv, logo(w.priv)), 'invalido');
    const byOrg = logo(w.priv);
    await reserve(w.u.org, w.priv, byOrg);
    await fails(setLogo(w.u.sofi, w.priv, byOrg), 'invalido');
    // Vencida: no.
    const old = logo(w.priv);
    await reserve(w.u.sofi, w.priv, old);
    await db.admin(`update private.logo_uploads set created_at = now() - interval '25 hours' where path = $1`, [old]);
    await fails(setLogo(w.u.sofi, w.priv, old), 'invalido');
    // La buena se usa y se va de las reservas: después ya no se puede poner otra vez ni subir otro archivo ahí.
    const a = logo(w.priv);
    await reserve(w.u.sofi, w.priv, a);
    expect(await setLogo(w.u.sofi, w.priv, a)).toBeNull();
    expect(await db.count('private.logo_uploads', 'path = $1', [a])).toBe(0);
    expect(await canUpload(w.u.sofi, a)).toBe(false);
    await setLogo(w.u.sofi, w.priv, null);
    await fails(setLogo(w.u.sofi, w.priv, a), 'invalido');
    expect(await logoOf(w.priv)).toBeNull();
  });

  it('cuenta bloqueada: no cambia el logo; ritmo: quitarlo cuenta en los mismos 30 por día', async () => {
    const a = logo(w.priv);
    await putLogo(w.u.org, w.priv, a);
    await block(w.u.sofi);
    await fails(setLogo(w.u.sofi, w.priv, null), 'bloqueada');
    await db.admin(`update private.rate_limits set hits = 30 where key = $1`, [`logo:${w.u.org}`]);
    await fails(setLogo(w.u.org, w.priv, null), 'rate_limited');
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`logo:${w.u.org}`]);
    expect(await setLogo(w.u.org, w.priv, null)).toBe(a);
  });
});

describe('lo que ya no se usa va a la cola de Storage (bucket logos)', () => {
  it('cambiar o quitar el logo manda el anterior; las fotos siguen entrando como scoreboards', async () => {
    const a = logo(w.priv);
    const b = logo(w.priv);
    await putLogo(w.u.sofi, w.priv, a);
    expect(await queued()).toEqual([]);
    await putLogo(w.u.sofi, w.priv, b);
    expect(await queued()).toEqual(sorted([a]));
    await setLogo(w.u.sofi, w.priv, null);
    expect(await queued()).toEqual(sorted([a, b]));
    // Lo de las fotos (private.queue_photo_purge) no cambia: sin decir el bucket.
    await db.admin(`insert into private.storage_purge_queue (path) values ('foto/x.webp')`);
    expect(await db.admin(`select bucket from private.storage_purge_queue where path = 'foto/x.webp'`)).toEqual([{ bucket: 'scoreboards' }]);
  });

  it('borrar la liga manda su logo y las reservas que no usó', async () => {
    const a = logo(w.priv);
    const unused = logo(w.priv, 'jpg');
    const other = logo(w.pub);
    await putLogo(w.u.org, w.priv, a);
    await reserve(w.u.sofi, w.priv, unused);
    await reserve(w.u.otro, w.pub, other);
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await queued()).toEqual(sorted([a, unused]));
    expect(await reservations()).toEqual([{ path: other }]);
  });

  it('la limpieza diaria manda las reservas de hace más de un día que no se usaron', async () => {
    const stale = logo(w.priv);
    const fresh = logo(w.priv);
    await reserve(w.u.sofi, w.priv, stale);
    await reserve(w.u.sofi, w.priv, fresh);
    await db.admin(`update private.logo_uploads set created_at = now() - interval '25 hours' where path = $1`, [stale]);
    expect(await db.admin<{ n: number }>('select private.logo_uploads_cleanup() as n')).toEqual([{ n: 1 }]);
    expect(await queued()).toEqual(sorted([stale]));
    expect(await reservations()).toEqual([{ path: fresh }]);
    expect(await canUpload(w.u.sofi, stale)).toBe(false);
    expect(await db.admin<{ n: number }>('select private.logo_uploads_cleanup() as n')).toEqual([{ n: 0 }]);
  });
});

describe('quién ve el logo', () => {
  it('con la liga (RLS de leagues): la pública cualquiera, la privada sus miembros', async () => {
    const pub = logo(w.pub);
    const priv = logo(w.priv);
    await putLogo(w.u.otro, w.pub, pub);
    await putLogo(w.u.org, w.priv, priv);
    expect(await db.asAnon('select logo_path from public.leagues where id = $1', [w.pub])).toEqual([{ logo_path: pub }]);
    expect(await db.asAnon('select logo_path from public.leagues where id = $1', [w.priv])).toEqual([]);
    expect(await db.asUser(w.u.luis, 'select logo_path from public.leagues where id = $1', [w.priv])).toEqual([{ logo_path: priv }]);
  });

  it('quien todavía no es de la liga: invite_preview, invite_details, my_league_invites y league_invite_details', async () => {
    const path = logo(w.priv);
    await putLogo(w.u.sofi, w.priv, path);
    expect(await db.rpcRows(ANON, 'invite_preview', { p_code: 'ABCD2345' })).toEqual([
      { league_id: w.priv, name: 'Liga del Banco', sport: 'bowling', kind: 'liga', visibility: 'private', logo_path: path },
    ]);
    expect(await db.rpc<Json>(w.u.nuevo, 'invite_details', { p_code: 'ABCD2345' })).toMatchObject({ leagueId: w.priv, logoPath: path });
    await db.rpc(w.u.org, 'invite_to_league', { p_league: w.priv, p_users: [w.u.nuevo] });
    const [mine] = await db.rpc<Json[]>(w.u.nuevo, 'my_league_invites');
    expect(mine).toMatchObject({ leagueId: w.priv, logoPath: path });
    expect(await db.rpc<Json>(w.u.nuevo, 'league_invite_details', { p_invite: mine.id })).toMatchObject({
      league: { id: w.priv, logoPath: path },
    });
    // La invitación que ya no vale igual trae el logo (es una imagen pública), aunque no el lugar ni el horario.
    await block(w.u.org);
    expect(await db.rpc<Json>(w.u.nuevo, 'league_invite_details', { p_invite: mine.id })).toMatchObject({
      status: 'cancelled',
      league: { logoPath: path, venue: null },
    });
  });

  it('la consola del superadmin (admin_leagues)', async () => {
    const path = logo(w.pub);
    await putLogo(w.u.otro, w.pub, path);
    const { rows } = await db.rpc<Json>(w.u.dios, 'admin_leagues', {});
    expect(rows.find((r: Json) => r.id === w.pub)).toMatchObject({ logoPath: path });
    expect(rows.find((r: Json) => r.id === w.priv)).toMatchObject({ logoPath: null });
  });
});

describe('private.can_upload_logo_path (la política de subir)', () => {
  it('solo quien reservó la ruta (dueño, admin o superadmin de esa liga, sin bloquear), con la forma de ruta', async () => {
    const path = logo(w.priv);
    await reserve(w.u.sofi, w.priv, path);
    expect(await canUpload(w.u.sofi, path)).toBe(true);
    // La reserva es de sofi: ni el dueño ni el superadmin suben ahí; los que no son admin, nada.
    for (const who of [w.u.org, w.u.dios, w.u.luis, w.u.ana, w.u.extra, w.u.otro]) expect(await canUpload(who, path)).toBe(false);
    // Sin reservar, nadie.
    for (const who of [w.u.org, w.u.sofi, w.u.dios]) expect(await canUpload(who, logo(w.priv))).toBe(false);
    for (const ext of ['jpg', 'png']) {
      const other = logo(w.priv, ext);
      await reserve(w.u.org, w.priv, other);
      expect(await canUpload(w.u.org, other)).toBe(true);
    }
    for (const bad of [logo(w.priv, 'gif'), `${w.priv}/logo.webp`, `x/${randomUUID()}.webp`, 'nada', '', `${w.priv}/${randomUUID()}.webp/x`]) {
      expect(await canUpload(w.u.sofi, bad)).toBe(false);
    }
    // Una liga que no existe: ni el superadmin.
    expect(await canUpload(w.u.dios, logo(randomUUID()))).toBe(false);
    // Si deja de ser admin o la bloquean, su reserva ya no sirve.
    await block(w.u.sofi);
    expect(await canUpload(w.u.sofi, path)).toBe(false);
  });
});

describe('private.can_remove_logo_path (las políticas de leer y borrar)', () => {
  it('los admins de la liga sin bloquear; lo que está en la cola, cualquier cuenta sin bloquear', async () => {
    const path = logo(w.priv);
    for (const who of [w.u.org, w.u.sofi, w.u.dios]) expect(await canRemove(who, path)).toBe(true);
    for (const who of [w.u.luis, w.u.extra, w.u.otro]) expect(await canRemove(who, path)).toBe(false);
    // Un logo que se quitó ya no lo usa nadie: cualquiera lo puede borrar (así se borra también el de una liga borrada).
    await putLogo(w.u.org, w.priv, path);
    await setLogo(w.u.org, w.priv, null);
    for (const who of [w.u.luis, w.u.extra]) expect(await canRemove(who, path)).toBe(true);
    // Uno de las fotos en la cola no cuenta (es de otro bucket).
    const photo = logo(w.priv);
    await db.admin('insert into private.storage_purge_queue (path) values ($1)', [photo]);
    expect(await canRemove(w.u.extra, photo)).toBe(false);
    await block(w.u.extra);
    await block(w.u.sofi);
    expect(await canRemove(w.u.extra, path)).toBe(false);
    expect(await canRemove(w.u.sofi, logo(w.priv))).toBe(false);
  });
});

describe('Storage (20260929001010_logos_supabase.sql, solo Supabase), probado en PGlite', () => {
  const put = (who: string, name: string) => db.as(who, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [name]);
  const del = (who: string, name: string) => db.as(who, `delete from storage.objects where bucket_id = 'logos' and name = $1 returning name`, [name]);
  const list = (who: string) => db.as<{ name: string }>(who, `select name from storage.objects where bucket_id = 'logos' order by name`);

  beforeEach(async () => {
    // El archivo entero: crea el bucket y las políticas. Después, lo que Supabase ya trae: RLS y permisos.
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, '20260929001010_logos_supabase.sql'), 'utf8'));
    await db.pg.exec(`
      alter table storage.objects enable row level security;
      grant select, insert, delete on storage.objects to authenticated;
    `);
  });

  it('el bucket: público, 256 kB, WebP, JPEG o PNG; tres políticas y ninguna de UPDATE', async () => {
    expect(await db.admin('select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', ['logos'])).toEqual([
      { public: true, file_size_limit: 262144, allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'] },
    ]);
    expect(await db.admin(`select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'mm_logos_%' order by 1`)).toEqual([
      { policyname: 'mm_logos_delete', cmd: 'DELETE' },
      { policyname: 'mm_logos_read', cmd: 'SELECT' },
      { policyname: 'mm_logos_upload', cmd: 'INSERT' },
    ]);
    // Correrlo otra vez no duplica nada.
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, '20260929001010_logos_supabase.sql'), 'utf8'));
    expect(await db.count('pg_policies', `tablename = 'objects' and policyname like 'mm_logos_%'`)).toBe(3);
    expect(await db.count('storage.buckets', `id = 'logos'`)).toBe(1);
  });

  it('subir: solo en una ruta que reservó (admin de la liga, en su carpeta); nadie más, ni otra forma de ruta', async () => {
    const path = logo(w.priv);
    await reserve(w.u.sofi, w.priv, path);
    await put(w.u.sofi, path);
    const png = logo(w.priv, 'png');
    await reserve(w.u.dios, w.priv, png);
    await put(w.u.dios, png);
    // Sin reserva no se sube nada: ni el dueño, aunque la ruta tenga la forma.
    await fails(put(w.u.org, logo(w.priv)), '42501');
    for (const who of [w.u.luis, w.u.extra]) await fails(put(who, logo(w.priv)), '42501');
    await fails(put(w.u.sofi, logo(w.pub)), '42501');
    await fails(put(w.u.sofi, `${w.priv}/logo.webp`), '42501');
    await fails(db.as(w.u.sofi, `insert into storage.objects (bucket_id, name) values ('otro', $1)`, [logo(w.priv)]), ['42501', '23503']);
    const later = logo(w.priv);
    await reserve(w.u.sofi, w.priv, later);
    await block(w.u.sofi);
    await fails(put(w.u.sofi, later), '42501');
    expect(await db.count('storage.objects', `bucket_id = 'logos'`)).toBe(2);
  });

  it('leer por la API y borrar: los admins de la liga (bloqueado, no borra)', async () => {
    const path = logo(w.priv);
    await db.admin(`insert into storage.objects (bucket_id, name) values ('logos', $1)`, [path]);
    expect(await list(w.u.luis)).toEqual([]);
    expect(await list(w.u.sofi)).toEqual([{ name: path }]);
    expect(await del(w.u.luis, path)).toEqual([]);
    expect(await del(w.u.otro, path)).toEqual([]);
    await block(w.u.sofi);
    expect(await del(w.u.sofi, path)).toEqual([]);
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.sofi });
    expect(await del(w.u.sofi, path)).toEqual([{ name: path }]);
    expect(await db.count('storage.objects', `bucket_id = 'logos'`)).toBe(0);
  });

  it('el logo de una liga borrada (ya en la cola) se puede borrar después, también quien ya no es admin de nada', async () => {
    const path = logo(w.priv);
    await putLogo(w.u.org, w.priv, path);
    await db.admin(`insert into storage.objects (bucket_id, name) values ('logos', $1)`, [path]);
    expect(await del(w.u.extra, path)).toEqual([]);
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await del(w.u.org, path)).toEqual([{ name: path }]);
    expect(await db.count('storage.objects', `bucket_id = 'logos'`)).toBe(0);
  });
});
