import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIdbFileStore, createMemoryFileStore } from './localFiles';
import { createLocalBackend, type LocalBackend, type SessionStore } from './local';
import { hashPassword, verifyPassword } from './password';
import { BackendError, type RealtimeMessage } from './types';

// Mini shim (lo que hará supabase/local/shim.sql): roles, esquema auth con uid(), y emit por NOTIFY.
const SHIM = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  create schema private;
  create function private.emit(topic text, event text, payload jsonb) returns void
    language sql security definer set search_path = '' as $$
    select pg_notify('mm', json_build_object('topic', topic, 'event', event, 'payload', payload)::text) $$;
`;

// Mini migración: perfil por trigger, tabla con RLS, trigger que avisa, y RPC de todas las formas.
const MIGRATION = `
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public revoke execute on functions from public;

  create table public.profiles (id uuid primary key references auth.users (id) on delete cascade, name text not null);
  alter table public.profiles enable row level security;
  create policy profiles_own on public.profiles for select to authenticated using (id = (select auth.uid()));
  grant select on public.profiles to authenticated;

  create function private.on_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.profiles (id, name)
    values (new.id, left(coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)), 60));
    return new;
  end $$;
  create trigger on_auth_user after insert on auth.users for each row execute function private.on_new_user();

  create table public.notes (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null references auth.users (id),
    topic text not null,
    body text not null check (length(body) between 1 and 20),
    public boolean not null default false,
    tags text[] not null default '{}',
    n int not null default 0,
    created_at timestamptz not null default now(),
    unique (owner, body)
  );
  alter table public.notes enable row level security;
  create policy notes_read on public.notes for select to anon, authenticated using (public or owner = (select auth.uid()));
  grant select on public.notes to anon, authenticated;

  create function private.notes_emit() returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    perform private.emit(new.topic, 'note', jsonb_build_object('body', new.body, 'n', new.n));
    return null;
  end $$;
  create trigger notes_emit after insert on public.notes for each row execute function private.notes_emit();

  create function public.add_note(p_topic text, p_body text, p_public boolean default false, p_tags text[] default '{}', p_n int default 0)
  returns uuid language plpgsql security definer set search_path = '' as $$
  declare v_id uuid;
  begin
    if auth.uid() is null then raise exception 'no_permitido' using errcode = '42501'; end if;
    if p_body = 'spam' then raise exception 'rate_limited' using errcode = 'P0001'; end if;
    if p_body = 'raro' then raise exception 'invalido: cuerpo raro' using errcode = 'P0001'; end if;
    if p_body = 'ajeno' then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    insert into public.notes (owner, topic, body, public, tags, n) values (auth.uid(), p_topic, p_body, p_public, p_tags, p_n)
    returning id into v_id;
    return v_id;
  end $$;
  grant execute on function public.add_note to authenticated;

  -- Sin security definer: la escritura directa choca con los permisos de la tabla.
  create function public.raw_insert(p_body text) returns void language sql as $$
    insert into public.notes (owner, topic, body) values (auth.uid(), 'x', p_body) $$;
  grant execute on function public.raw_insert to authenticated;

  create function public.whoami() returns jsonb language sql stable as $$
    select jsonb_build_object('uid', auth.uid(), 'role', current_user) $$;
  create function public.count_notes() returns int language sql stable as $$ select count(*)::int from public.notes $$;
  create function public.my_notes() returns setof public.notes language sql stable as $$
    select * from public.notes where owner = auth.uid() order by n $$;
  create function public.pairs() returns table (a int, b text) language sql immutable as $$ values (1, 'x'), (2, 'y') $$;
  create function public.letters() returns setof text language sql immutable as $$ select unnest(array['a', 'b']) $$;
  create function public.first_note() returns public.notes language sql stable as $$
    select * from public.notes order by n limit 1 $$;
  create function public.noop() returns void language sql as $$ select $$;
  create function public.echo(p_data jsonb, p_when timestamptz default null) returns jsonb language sql immutable as $$
    select jsonb_build_object('data', p_data, 'when', p_when) $$;
  grant execute on function public.whoami, public.count_notes, public.my_notes, public.pairs, public.letters,
    public.first_note, public.noop, public.echo to anon, authenticated;
`;

const memoryStore = (): SessionStore & { value: string | null } => {
  const s = { value: null as string | null, get: () => s.value, set: (v: string | null) => void (s.value = v) };
  return s;
};

const expectError = async (p: Promise<unknown>, kind: BackendError['kind'], code?: string | null) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(BackendError);
  expect((e as BackendError).kind).toBe(kind);
  if (code !== undefined) expect((e as BackendError).code).toBe(code);
  return e as BackendError;
};

describe('backend local (PGlite)', () => {
  let b: LocalBackend;
  let store: ReturnType<typeof memoryStore>;
  let ana: string;
  let beto: string;

  beforeAll(async () => {
    store = memoryStore();
    b = await createLocalBackend({ sql: [SHIM, MIGRATION], sessionStore: store });
    ana = (await b.auth.signUp('Ana@Example.com', 'secreto1', 'Ana'))!.userId;
    await b.rpc('add_note', { p_topic: 'league:1', p_body: 'privada de ana', p_n: 2 });
    await b.rpc('add_note', { p_topic: 'league:1', p_body: 'publica de ana', p_public: true, p_tags: ['a', 'b'], p_n: 1 });
    await b.auth.signOut();
    beto = (await b.auth.signUp('beto@example.com', 'secreto2', 'Beto'))!.userId;
    await b.rpc('add_note', { p_topic: 'league:2', p_body: 'privada de beto', p_n: 3 });
    await b.auth.signOut();
  }, 60_000);

  afterAll(async () => {
    await b?.close();
  });

  it('modo local y siempre en línea', () => {
    expect(b.mode).toBe('local');
    expect(b.online()).toBe(true);
  });

  describe('RLS por usuario', () => {
    it('anon solo ve lo público', async () => {
      const rows = await b.select<{ body: string }>({ table: 'notes', columns: 'body' });
      expect(rows.map((r) => r.body)).toEqual(['publica de ana']);
      expect(await b.rpc('whoami')).toEqual({ uid: null, role: 'anon' });
    });

    it('cada usuario ve lo suyo y lo público, nunca lo privado de otro', async () => {
      await b.auth.signIn('ana@example.com', 'secreto1');
      const deAna = await b.select<{ body: string }>({ table: 'notes', columns: 'body', order: [{ col: 'body' }] });
      expect(deAna.map((r) => r.body)).toEqual(['privada de ana', 'publica de ana']);
      expect(await b.rpc('whoami')).toEqual({ uid: ana, role: 'authenticated' });

      await b.auth.signIn('beto@example.com', 'secreto2');
      const deBeto = await b.select<{ body: string }>({ table: 'notes', columns: 'body', order: [{ col: 'body' }] });
      expect(deBeto.map((r) => r.body)).toEqual(['privada de beto', 'publica de ana']);
      // El perfil de otro no se ve (profiles solo el propio).
      expect(await b.select({ table: 'profiles', filters: [{ col: 'id', op: 'eq', value: ana }] })).toEqual([]);
      expect(await b.select({ table: 'profiles', columns: 'name' })).toEqual([{ name: 'Beto' }]);
      await b.auth.signOut();
    });

    it('la base como superusuario sí ve todo (la RLS es por el rol, no por la base)', async () => {
      const r = await b.db.query<{ n: number }>('select count(*)::int as n from public.notes');
      expect(r.rows[0].n).toBe(3);
    });
  });

  describe('select', () => {
    it('filtros, orden y límite', async () => {
      await b.auth.signIn('ana@example.com', 'secreto1');
      const q = (filters: Parameters<LocalBackend['select']>[0]['filters']) =>
        b.select<{ body: string }>({ table: 'notes', columns: 'body', filters, order: [{ col: 'n', asc: true }] }).then((r) => r.map((x) => x.body));
      expect(await q([{ col: 'n', op: 'eq', value: 1 }])).toEqual(['publica de ana']);
      expect(await q([{ col: 'n', op: 'neq', value: 1 }])).toEqual(['privada de ana']);
      expect(await q([{ col: 'n', op: 'gt', value: 1 }])).toEqual(['privada de ana']);
      expect(await q([{ col: 'n', op: 'gte', value: 1 }])).toEqual(['publica de ana', 'privada de ana']);
      expect(await q([{ col: 'n', op: 'lt', value: 2 }])).toEqual(['publica de ana']);
      expect(await q([{ col: 'n', op: 'lte', value: 2 }])).toEqual(['publica de ana', 'privada de ana']);
      expect(await q([{ col: 'n', op: 'in', value: [2, 99] }])).toEqual(['privada de ana']);
      expect(await q([{ col: 'n', op: 'in', value: [] }])).toEqual([]);
      expect(await q([{ col: 'public', op: 'is', value: true }])).toEqual(['publica de ana']);
      expect(await q([{ col: 'public', op: 'is', value: false }])).toEqual(['privada de ana']);
      expect(await q([{ col: 'tags', op: 'contains', value: ['b'] }])).toEqual(['publica de ana']);
      expect(await q([{ col: 'owner', op: 'eq', value: ana }, { col: 'public', op: 'is', value: false }])).toEqual(['privada de ana']);
      const desc = await b.select<{ n: number }>({ table: 'notes', columns: 'n', order: [{ col: 'n', asc: false }], limit: 1 });
      expect(desc).toEqual([{ n: 2 }]);
      await b.auth.signOut();
    });

    it('devuelve JSON como PostgREST: fechas en texto UTC, arreglos y uuid tal cual', async () => {
      const [row] = await b.select<{ id: string; tags: string[]; created_at: string; public: boolean }>({ table: 'notes' });
      expect(typeof row.id).toBe('string');
      expect(row.tags).toEqual(['a', 'b']);
      expect(row.public).toBe(true);
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$/);
      // Una fecha como filtro se manda en ISO.
      const later = await b.select({ table: 'notes', filters: [{ col: 'created_at', op: 'gt', value: new Date(Date.now() + 60_000) }] });
      expect(later).toEqual([]);
    });

    it('nombres inválidos o filtros mal formados son de validación y nunca llegan al SQL', async () => {
      await expectError(b.select({ table: 'notes; drop table notes' }), 'validation', 'invalid_identifier');
      await expectError(b.select({ table: 'notes', columns: 'body, "x"' }), 'validation');
      await expectError(b.select({ table: 'notes', filters: [{ col: 'n', op: 'eq', value: null }] }), 'validation', 'invalid_filter');
      await expectError(b.select({ table: 'notes', filters: [{ col: 'n', op: 'in', value: 3 }] }), 'validation');
      await expectError(b.select({ table: 'notes', limit: -1 }), 'validation');
      await expectError(b.select({ table: 'no_such_table' }), 'not_found', '42P01');
      await expectError(b.select({ table: 'notes', filters: [{ col: 'id', op: 'eq', value: 'no-es-uuid' }] }), 'validation', '22P02');
    });
  });

  describe('rpc', () => {
    it('argumentos por nombre, defaults y formas de respuesta', async () => {
      await b.auth.signIn('ana@example.com', 'secreto1');
      // Escalar → el valor.
      expect(await b.rpc<number>('count_notes')).toBe(2);
      // setof tabla → arreglo de filas.
      const mine = await b.rpc<{ body: string; n: number }[]>('my_notes');
      expect(mine.map((r) => r.body)).toEqual(['publica de ana', 'privada de ana']);
      // returns table → arreglo de filas; setof escalar → arreglo de valores.
      expect(await b.rpc('pairs')).toEqual([
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
      ]);
      expect(await b.rpc('letters')).toEqual(['a', 'b']);
      // returns <tabla> (una fila) → objeto.
      const first = await b.rpc<{ body: string } | null>('first_note');
      expect(first?.body).toBe('publica de ana');
      // void → null.
      expect(await b.rpc('noop')).toBeNull();
      // jsonb: objetos, textos y fechas como los mandaría supabase-js (JSON).
      expect(await b.rpc('echo', { p_data: { a: [1, 'dos'] } })).toEqual({ data: { a: [1, 'dos'] }, when: null });
      expect(await b.rpc('echo', { p_data: 'hola', p_when: undefined })).toEqual({ data: 'hola', when: null });
      const when = await b.rpc<{ when: string }>('echo', { p_data: null, p_when: new Date('2026-09-26T12:00:00Z') });
      expect(when.when).toBe('2026-09-26T12:00:00+00:00');
      await b.auth.signOut();
    });

    it('errores traducidos: permiso, check, único, rate_limited y P0001', async () => {
      // anon no tiene EXECUTE sobre add_note.
      await expectError(b.rpc('add_note', { p_topic: 't', p_body: 'x' }), 'permission', '42501');
      await b.auth.signIn('ana@example.com', 'secreto1');
      // Escritura directa sin security definer: la tabla no tiene INSERT para authenticated.
      await expectError(b.rpc('raw_insert', { p_body: 'x' }), 'permission', '42501');
      await expectError(b.rpc('add_note', { p_topic: 't', p_body: 'un cuerpo demasiado largo para la nota' }), 'validation', '23514');
      await expectError(b.rpc('add_note', { p_topic: 't', p_body: 'privada de ana' }), 'conflict', '23505');
      const rl = await expectError(b.rpc('add_note', { p_topic: 't', p_body: 'spam' }), 'rate_limited', 'P0001');
      expect(rl.retryable).toBe(false);
      const inv = await expectError(b.rpc('add_note', { p_topic: 't', p_body: 'raro' }), 'validation', 'P0001');
      expect(inv.message).toBe('invalido: cuerpo raro');
      await expectError(b.rpc('add_note', { p_topic: 't', p_body: 'ajeno' }), 'permission', 'P0001');
      await expectError(b.rpc('no_existe'), 'not_found', 'PGRST202');
      await expectError(b.rpc('add_note', { 'p_topic); drop table x; --': 1 }), 'validation', 'invalid_identifier');
      // Nada de lo anterior quedó a medias.
      expect(await b.rpc('count_notes')).toBe(2);
      await b.auth.signOut();
    });
  });

  describe('tiempo real', () => {
    it('cada suscriptor recibe solo los avisos de su tema', async () => {
      const got1: RealtimeMessage[] = [];
      const got2: RealtimeMessage[] = [];
      const off1 = b.subscribe('league:9', (m) => got1.push(m));
      const off2 = b.subscribe('league:8', (m) => got2.push(m));
      await b.auth.signIn('beto@example.com', 'secreto2');
      await b.rpc('add_note', { p_topic: 'league:9', p_body: 'aviso', p_n: 7 });
      await b.rpc('add_note', { p_topic: 'league:7', p_body: 'otro tema' });
      await new Promise((r) => setTimeout(r, 20));
      expect(got1).toEqual([{ event: 'note', payload: { body: 'aviso', n: 7 } }]);
      expect(got2).toEqual([]);

      // Cancelar: ya no llega nada; la misma función suscrita dos veces se cancela una por una.
      off1();
      const twice: RealtimeMessage[] = [];
      const cb = (m: RealtimeMessage) => twice.push(m);
      const offA = b.subscribe('league:9', cb);
      const offB = b.subscribe('league:9', cb);
      offA();
      await b.rpc('add_note', { p_topic: 'league:9', p_body: 'aviso 2' });
      await new Promise((r) => setTimeout(r, 20));
      expect(got1).toHaveLength(1);
      expect(twice).toHaveLength(1);
      offB();
      off2();
      // Un error en la transacción no avisa (NOTIFY sale al confirmar).
      await expectError(b.rpc('add_note', { p_topic: 'league:9', p_body: 'un cuerpo demasiado largo para la nota' }), 'validation');
      await b.auth.signOut();
    });
  });

  describe('cuentas', () => {
    it('registro, entrada, salida y eventos', async () => {
      const events: string[] = [];
      const off = b.auth.onChange((e, s) => events.push(`${e}:${s?.name ?? '-'}`));
      const s = await b.auth.signUp('carla@example.com', 'secreto3', '  Carla  ');
      expect(s).toMatchObject({ email: 'carla@example.com', name: 'Carla' });
      expect(await b.auth.getSession()).toEqual(s);
      await b.auth.signOut();
      expect(await b.auth.getSession()).toBeNull();
      const again = await b.auth.signIn(' CARLA@example.com ', 'secreto3');
      expect(again.userId).toBe(s!.userId);
      await b.auth.updatePassword('nueva123');
      await b.auth.signOut();
      await expectError(b.auth.signIn('carla@example.com', 'secreto3'), 'auth', 'invalid_credentials');
      await b.auth.signIn('carla@example.com', 'nueva123');
      await b.auth.signOut();
      off();
      expect(events).toEqual(['SIGNED_IN:Carla', 'SIGNED_OUT:-', 'SIGNED_IN:Carla', 'USER_UPDATED:Carla', 'SIGNED_OUT:-', 'SIGNED_IN:Carla', 'SIGNED_OUT:-']);
    });

    it('errores de cuenta con los códigos de Supabase', async () => {
      await expectError(b.auth.signUp('ana@example.com', 'otra123', 'Otra Ana'), 'conflict', 'email_exists');
      await expectError(b.auth.signUp('sin-arroba', 'secreto1', 'X'), 'validation', 'email_address_invalid');
      await expectError(b.auth.signUp('dani@example.com', '123', 'Dani'), 'validation', 'weak_password');
      await expectError(b.auth.signIn('nadie@example.com', 'secreto1'), 'auth', 'invalid_credentials');
      await expectError(b.auth.signIn('ana@example.com', 'mala'), 'auth', 'invalid_credentials');
      const g = await expectError(b.auth.signInWithGoogle(), 'auth');
      expect(g.message).toBe('Google no está disponible en modo local');
      await expectError(b.auth.updatePassword('nueva123'), 'auth', 'session_not_found');
      await expectError(b.auth.resetPassword('ana@example.com'), 'validation');
    });

    it('la contraseña no se guarda en claro y nadie más que la base la lee', async () => {
      const r = await b.db.query<{ hash: string }>('select hash from auth.local_passwords where user_id = $1', [ana]);
      expect(r.rows[0].hash).toMatch(/^pbkdf2-sha256\$100000\$/);
      expect(r.rows[0].hash).not.toContain('secreto1');
      const denied = await b.db
        .transaction(async (tx) => {
          await tx.exec('set local role authenticated');
          await tx.query('select * from auth.local_passwords');
        })
        .then(
          () => null,
          (e: { code?: string }) => e.code,
        );
      expect(denied).toBe('42501');
    });

    it('la sesión se recuerda entre aperturas y se olvida si la cuenta ya no existe', async () => {
      const s = await b.auth.signIn('beto@example.com', 'secreto2');
      expect(JSON.parse(store.value!)).toEqual({ userId: beto, email: 'beto@example.com' });
      // Otra "pestaña" sobre la misma base y el mismo almacenamiento: ya entra con la sesión.
      const other = await createLocalBackend({ sql: [SHIM, MIGRATION], db: b.db, sessionStore: store });
      expect(await other.auth.getSession()).toEqual(s);
      expect(await other.rpc('whoami')).toEqual({ uid: beto, role: 'authenticated' });
      // Si la sesión guardada es de una cuenta que no existe (base recreada), se descarta.
      const ghost = memoryStore();
      ghost.value = JSON.stringify({ userId: '00000000-0000-4000-8000-000000000000', email: 'x@example.com' });
      const fresh = await createLocalBackend({ sql: [SHIM, MIGRATION], db: b.db, sessionStore: ghost });
      expect(await fresh.auth.getSession()).toBeNull();
      expect(ghost.value).toBeNull();
      // Basura en el almacenamiento: sin sesión.
      const junk = memoryStore();
      junk.value = '{no es json';
      const j = await createLocalBackend({ sql: [SHIM, MIGRATION], db: b.db, sessionStore: junk });
      expect(await j.auth.getSession()).toBeNull();
      await Promise.all([other.close(), fresh.close(), j.close()]);
      await b.auth.signOut();
    });
  });

  describe('archivos', () => {
    it('subir, ver y borrar', async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/webp' });
      await expectError(b.storage.upload('scoreboards', 'l1/p1.webp', blob, 'image/webp'), 'permission');
      await b.auth.signIn('ana@example.com', 'secreto1');
      await b.storage.upload('scoreboards', 'l1/p1.webp', blob, 'image/webp');
      const url = await b.storage.signedUrl('scoreboards', 'l1/p1.webp', 60);
      expect(url).toBe(`data:image/webp;base64,${btoa(String.fromCharCode(1, 2, 3, 250))}`);
      await b.storage.remove('scoreboards', ['l1/p1.webp']);
      await expectError(b.storage.signedUrl('scoreboards', 'l1/p1.webp'), 'not_found');
      await expectError(b.storage.upload('scoreboards', '../fuera.webp', blob, 'image/webp'), 'validation');
      await expectError(b.storage.upload('Mal Bucket', 'a.webp', blob, 'image/webp'), 'validation');
      await b.auth.signOut();
    });

    it('IndexedDB guarda y lee los bytes', async () => {
      const store = createIdbFileStore('mm-local-files-test');
      const data = new Uint8Array([9, 8, 7]).buffer;
      await store.put('b/x', { data, contentType: 'image/jpeg' });
      const back = await store.get('b/x');
      expect(back?.contentType).toBe('image/jpeg');
      expect(Array.from(new Uint8Array(back!.data))).toEqual([9, 8, 7]);
      await store.delete(['b/x']);
      expect(await store.get('b/x')).toBeUndefined();
      const mem = createMemoryFileStore();
      await mem.put('k', { data, contentType: 'x' });
      expect((await mem.get('k'))?.contentType).toBe('x');
    });
  });

  describe('funciones (invoke)', () => {
    it('scan-bowling no está en local; se pueden registrar funciones de prueba', async () => {
      const e = await expectError(b.invoke('scan-bowling', {}), 'validation');
      expect(e.message).toBe('La lectura con IA no está disponible en modo local');
      await expectError(b.invoke('otra', {}), 'not_found');
      b.registerHandler('eco', (body, ctx) => ({ body, user: ctx.session?.email ?? null }));
      expect(await b.invoke('eco', { a: 1 })).toEqual({ body: { a: 1 }, user: null });
    });
  });

  describe('migraciones', () => {
    it('una base ya creada no vuelve a correr los scripts y rechaza un script cambiado', async () => {
      const again = await createLocalBackend({ sql: [SHIM, MIGRATION], db: b.db, sessionStore: memoryStore() });
      await again.close();
      const extra = `create table public.extra (id int primary key); alter table public.extra enable row level security;`;
      const more = await createLocalBackend({ sql: [SHIM, MIGRATION, extra], db: b.db, sessionStore: memoryStore() });
      expect((await b.db.query('select 1 from public.extra')).rows).toEqual([]);
      await more.close();
      await expect(createLocalBackend({ sql: [SHIM, MIGRATION + '\n-- cambio'], db: b.db, sessionStore: memoryStore() })).rejects.toBeInstanceOf(BackendError);
    });

    it('un script que falla dice cuál fue', async () => {
      const e = await createLocalBackend({ sql: [SHIM, 'select * from tabla_que_no_existe'], sessionStore: memoryStore() }).then(
        () => null,
        (err: unknown) => err as BackendError,
      );
      expect(e?.message).toMatch(/script 2 de 2/);
    }, 30_000);
  });
});

describe('contraseñas locales', () => {
  it('PBKDF2 con sal aleatoria', async () => {
    const a = await hashPassword('clave', 1000);
    const b = await hashPassword('clave', 1000);
    expect(a).not.toBe(b);
    expect(await verifyPassword('clave', a)).toBe(true);
    expect(await verifyPassword('otra', a)).toBe(false);
    expect(await verifyPassword('clave', 'basura')).toBe(false);
  });
});
