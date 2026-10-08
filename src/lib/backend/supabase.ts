/**
 * Backend de producción: Supabase (PostgREST + RLS, Auth, Realtime Broadcast privado, Storage y Edge Functions).
 * Traduce el contrato de types.ts a supabase-js v2 y normaliza todos los errores a BackendError.
 */
import { createClient, type RealtimeChannel, type Session as SbSession, type SupabaseClient } from '@supabase/supabase-js';
import { isFetchFailure, mapAuthError, mapDbError, mapStorageError, toBackendError, type AuthErrorLike, type DbErrorLike } from './errors';
import { checkIdent, checkSelect, normalizeValue, parseColumns } from './query';
import { BackendError, type AuthEvent, type Backend, type BackendAuth, type BackendStorage, type RealtimeMessage, type SelectQuery, type Session } from './types';

export interface SupabaseBackendOptions {
  url: string;
  /** Clave publicable (`sb_publishable_…`). */
  publishableKey: string;
  /** Cliente ya creado (pruebas con un cliente simulado). */
  client?: SupabaseClient;
}

/** Última sesión conocida, para no sacar al usuario si abre la app sin señal con el token vencido. */
export const LAST_SESSION_KEY = 'mm:session';
/** Donde supabase-js guarda la sesión (prefijo mm:, nunca bowlingx:). */
export const AUTH_STORAGE_KEY = 'mm:auth';

/** Lo mínimo del constructor de consultas de PostgREST que se usa (así se puede simular en pruebas). */
interface FilterBuilder extends PromiseLike<{ data: unknown; error: DbErrorLike | null; status?: number }> {
  eq(col: string, v: unknown): FilterBuilder;
  neq(col: string, v: unknown): FilterBuilder;
  gt(col: string, v: unknown): FilterBuilder;
  gte(col: string, v: unknown): FilterBuilder;
  lt(col: string, v: unknown): FilterBuilder;
  lte(col: string, v: unknown): FilterBuilder;
  in(col: string, v: readonly unknown[]): FilterBuilder;
  is(col: string, v: null | boolean): FilterBuilder;
  contains(col: string, v: unknown): FilterBuilder;
  order(col: string, opts: { ascending: boolean }): FilterBuilder;
  limit(n: number): FilterBuilder;
  range(from: number, to: number): FilterBuilder;
}

/**
 * Filas por pedido. Supabase corta cada respuesta en `max_rows` (config.toml y el paso 3 de la guía: 500) sin
 * avisar; `select` pide de a páginas hasta traerlo todo (o hasta `limit`).
 */
export const PAGE_ROWS = 500;
/** Tope de páginas de una consulta (100 000 filas): una consulta así es un error, no una lista. */
const MAX_PAGES = 200;

/** Clave de las tablas sin `id` (para que las páginas salgan en un orden fijo y no se salte ni repita nada). */
const TABLE_KEYS: Record<string, readonly string[]> = {
  league_secrets: ['league_id'],
  league_members: ['league_id', 'user_id'],
  memberships: ['league_id', 'user_id'],
  player_private: ['player_id'],
  event_rsvps: ['event_id', 'player_id'],
  event_lanes: ['event_id', 'player_id'],
  live_states: ['event_id', 'subject_key'],
  match_sides: ['match_id', 'side'],
  match_players: ['match_id', 'player_id'],
  team_players: ['team_id', 'player_id'],
  golf_rounds: ['event_id'],
  swim_swimmers: ['player_id'],
  swim_meets: ['event_id'],
  ladder_rungs: ['event_id', 'entrant_id'],
  match_rsvps: ['match_id', 'player_id'],
  match_officials: ['match_id'],
  event_signups: ['event_id', 'entrant_id'],
  sport_status: ['id'],
  // Sin `id` (su clave es compuesta): pedirlas ordenadas por id daba 400 en Supabase.
  badge_progress: ['holder', 'badge_key', 'sport'],
  badge_stats: ['badge_key', 'sport', 'level'],
  legal_acceptances: ['user_id', 'doc', 'version'],
  // Esports: las tablas sin `id` (su clave es otra; pedirlas ordenadas por id da 400 en Supabase).
  esports_tournaments: ['event_id'],
  esports_matches: ['match_id'],
  esports_entry_members: ['entry_id', 'user_id'],
  esports_team_members: ['team_id', 'user_id'],
  esports_game_ids: ['user_id', 'game', 'platform'],
  esports_br_results: ['game_id', 'entry_id'],
};

/** El orden pedido más la clave de la tabla al final (desempate estable entre páginas). */
export function pagedOrder(q: SelectQuery): { col: string; asc?: boolean }[] {
  const order = [...(q.order ?? [])];
  for (const col of TABLE_KEYS[q.table] ?? ['id']) if (!order.some((o) => o.col === col)) order.push({ col });
  return order;
}

/** SelectQuery → llamadas de supabase-js (`.eq`, `.in`, `.order`…). Exportada para probarla. */
export function applySelect(client: SupabaseClient, q: SelectQuery): FilterBuilder {
  checkSelect(q);
  const cols = parseColumns(q.columns);
  let b = client.from(q.table).select(cols === '*' ? '*' : cols.join(',')) as unknown as FilterBuilder;
  for (const f of q.filters ?? []) {
    const v = normalizeValue(f.value);
    switch (f.op) {
      case 'in':
        b = b.in(f.col, v as unknown[]);
        break;
      case 'is':
        b = b.is(f.col, v as null | boolean);
        break;
      case 'contains':
        b = b.contains(f.col, v);
        break;
      default:
        b = b[f.op](f.col, v);
    }
  }
  for (const o of q.order ?? []) b = b.order(o.col, { ascending: o.asc !== false });
  if (q.limit !== undefined) b = b.limit(q.limit);
  return b;
}

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * A dónde vuelve el link de Google o del correo: el origen, más la ruta de la app a la que iba (si es una ruta
 * de la app: nunca otro sitio). La lista de «Redirect URLs» de Supabase tiene `<origen>/**`; si no la aceptara,
 * Supabase vuelve al «Site URL» y la app igual encuentra la ruta guardada en el teléfono.
 */
export function returnUrl(next?: string): string | undefined {
  const base = origin();
  if (!base) return undefined;
  const ok = !!next && next.startsWith('/') && !next.startsWith('//') && !/[\s\\]/.test(next);
  return ok ? base + next : base;
}

function readLastSession(): Session | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_SESSION_KEY) : null;
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeLastSession(s: Session | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (s) localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    // Sin almacenamiento: solo se pierde el respaldo sin señal.
  }
}

const PASS_EVENTS: readonly string[] = ['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'];

/** Error de una Edge Function → BackendError (lee el cuerpo {error|message} si la función lo mandó). */
async function mapFunctionError(e: unknown): Promise<BackendError> {
  const err = e as { name?: string; message?: string; context?: unknown };
  if (err?.name === 'FunctionsFetchError' || isFetchFailure(e)) return new BackendError('Sin conexión. Revisa tu internet.', 'network');
  if (err?.name === 'FunctionsRelayError') return new BackendError(err.message || 'Error de Supabase', 'network', 'relay');
  if (err?.name === 'FunctionsHttpError') {
    const res = err.context as { status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> } | undefined;
    const status = res?.status ?? 500;
    let message = '';
    let code: string | null = null;
    try {
      const body = (await res?.json?.()) as { error?: unknown; message?: unknown; code?: unknown } | undefined;
      message = String(body?.error ?? body?.message ?? '');
      code = typeof body?.code === 'string' ? body.code : null;
    } catch {
      // Cuerpo que no es JSON: queda el mensaje genérico.
    }
    if (message === 'rate_limited' || code === 'rate_limited') return new BackendError(message || 'rate_limited', 'rate_limited', code ?? String(status));
    return mapDbError({ status, message: message || err.message || `Error ${status}`, code });
  }
  return toBackendError(e);
}

export function createSupabaseBackend(opts: SupabaseBackendOptions): Backend {
  const client =
    opts.client ??
    createClient(opts.url, opts.publishableKey, {
      auth: { storageKey: AUTH_STORAGE_KEY, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

  // ---- Sesión ----
  // profiles.name se lee una vez por usuario (se olvida al salir o si cambia la cuenta).
  const names = new Map<string, string | null>();

  async function toSession(s: SbSession | null): Promise<Session | null> {
    if (!s?.user) return null;
    const u = s.user;
    let name = names.get(u.id);
    if (name === undefined) {
      const meta = (u.user_metadata ?? {}) as { name?: unknown; full_name?: unknown };
      const fallback = typeof meta.name === 'string' ? meta.name : typeof meta.full_name === 'string' ? meta.full_name : null;
      try {
        const { data, error } = await client.from('profiles').select('name').eq('id', u.id).maybeSingle();
        const row = data as { name?: string | null } | null;
        name = row?.name ?? fallback;
        if (!error) names.set(u.id, name);
      } catch {
        name = fallback;
      }
    }
    const session: Session = { userId: u.id, email: u.email ?? null, name };
    writeLastSession(session);
    return session;
  }

  // Oyente interno: el token nuevo al canal de tiempo real (si no, el canal privado se cae) y limpiar al salir.
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && session) void client.realtime.setAuth(session.access_token).catch(() => undefined);
    if (event === 'SIGNED_OUT') {
      names.clear();
      writeLastSession(null);
    }
    if (event === 'USER_UPDATED' && session) names.delete(session.user.id);
  });

  const auth: BackendAuth = {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) {
        // Sin señal y con el token vencido: se sigue con la última sesión conocida (la cola reintenta al volver).
        if (mapAuthError(error as AuthErrorLike).kind === 'network') return readLastSession();
        return null;
      }
      return toSession(data.session);
    },
    onChange(cb) {
      // Nunca se llama a supabase dentro del callback de onAuthStateChange (se traba): se hace después y en orden.
      let chain = Promise.resolve();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!PASS_EVENTS.includes(event)) return;
        chain = chain
          .then(() => new Promise<void>((r) => setTimeout(r, 0)))
          .then(() => toSession(session))
          .then((s) => cb(event as AuthEvent, s))
          .catch((e: unknown) => console.error(e));
      });
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password, name, meta, captchaToken, next) {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { ...meta, name: name.trim() }, emailRedirectTo: returnUrl(next), captchaToken },
      });
      if (error) throw mapAuthError(error as AuthErrorLike);
      // Con «Confirm email» activado, un correo ya registrado vuelve sin identidades y sin error.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw mapAuthError({ code: 'email_exists' });
      if (!data.session) return null;
      if (data.user) names.set(data.user.id, name.trim() || null);
      return toSession(data.session);
    },
    async signIn(email, password, captchaToken) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } });
      if (error) throw mapAuthError(error as AuthErrorLike);
      const s = await toSession(data.session);
      if (!s) throw mapAuthError({ code: 'session_not_found' });
      return s;
    },
    async signInWithGoogle(next) {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: returnUrl(next), queryParams: { prompt: 'select_account' } },
      });
      if (error) throw mapAuthError(error as AuthErrorLike);
    },
    async signOut() {
      // Solo este teléfono (como Firebase): las demás sesiones de la cuenta siguen abiertas.
      const { error } = await client.auth.signOut({ scope: 'local' });
      names.clear();
      writeLastSession(null);
      if (error) throw mapAuthError(error as AuthErrorLike);
    },
    async resendConfirmation(email, captchaToken, next) {
      const { error } = await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: returnUrl(next), captchaToken } });
      if (error) throw mapAuthError(error as AuthErrorLike);
    },
    async resetPassword(email, captchaToken) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/cuenta?recuperar=1`, captchaToken });
      if (error) throw mapAuthError(error as AuthErrorLike);
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw mapAuthError(error as AuthErrorLike);
    },
  };

  // ---- Tiempo real: un canal privado por tema, compartido por todos los que lo escuchan ----
  interface TopicEntry {
    listeners: Set<(msg: RealtimeMessage) => void>;
    channel: RealtimeChannel | null;
    closed: boolean;
  }
  const topics = new Map<string, TopicEntry>();
  // Canales que se están cerrando: supabase-js reutiliza el canal por nombre, así que uno nuevo espera a que se cierre el viejo.
  const removing = new Map<string, Promise<unknown>>();

  function open(topic: string, entry: TopicEntry) {
    (removing.get(topic) ?? Promise.resolve())
      .catch(() => undefined)
      // Token actual al socket antes de entrar a un canal privado.
      .then(() => client.realtime.setAuth().catch(() => undefined))
      .then(() => {
        if (entry.closed || topics.get(topic) !== entry) return;
        const channel = client.channel(topic, { config: { private: true } });
        entry.channel = channel;
        channel.on('broadcast', { event: '*' }, (m: { event: string; payload?: unknown }) => {
          if (topics.get(topic) !== entry) return;
          for (const cb of [...entry.listeners]) {
            try {
              cb({ event: m.event, payload: m.payload ?? null });
            } catch (e) {
              console.error(e);
            }
          }
        });
        try {
          channel.subscribe();
        } catch (e) {
          // Canal reutilizado que ya estaba suscrito: los mensajes igual llegan.
          console.warn(e);
        }
      })
      .catch((e: unknown) => console.error(e));
  }

  function close(topic: string, entry: TopicEntry) {
    entry.closed = true;
    if (topics.get(topic) === entry) topics.delete(topic);
    if (!entry.channel) return;
    const p = client.removeChannel(entry.channel).finally(() => {
      if (removing.get(topic) === p) removing.delete(topic);
    });
    removing.set(topic, p);
  }

  // ---- Archivos ----
  const storage: BackendStorage = {
    async upload(bucket, path, data, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, data, { contentType, upsert: false });
      if (!error) return;
      const e = error as { name?: string; message?: string; status?: number; statusCode?: string; code?: string };
      // Reintento de la cola: la ruta ya existe (misma foto, mismo id) = ya se subió.
      if (e.statusCode === '409' || e.status === 409 || e.code === 'ResourceAlreadyExists' || /already exists|Duplicate/i.test(e.message ?? '')) return;
      throw mapStorageError(e);
    },
    async signedUrl(bucket, path, expiresInSeconds = 3600) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error) throw mapStorageError(error as { message?: string; status?: number; statusCode?: string });
      return data.signedUrl;
    },
    async publicUrl(bucket, path) {
      // Solo arma la URL (no pregunta al servidor): si el archivo no existe, la imagen no carga.
      return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
    async remove(bucket, paths) {
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw mapStorageError(error as { message?: string; status?: number; statusCode?: string });
    },
  };

  return {
    mode: 'supabase',
    auth,
    storage,
    async select<T = Record<string, unknown>>(q: SelectQuery): Promise<T[]> {
      const page = async (query: SelectQuery, from?: number, to?: number): Promise<T[]> => {
        let res: { data: unknown; error: DbErrorLike | null; status?: number };
        try {
          const b = applySelect(client, query);
          res = await (from !== undefined && to !== undefined ? b.range(from, to) : b);
        } catch (e) {
          throw toBackendError(e);
        }
        if (res.error) throw mapDbError({ ...res.error, status: res.status ?? res.error.status });
        return (Array.isArray(res.data) ? res.data : []) as T[];
      };
      // Lo que cabe en una respuesta: un solo pedido, como siempre.
      if (q.limit !== undefined && q.limit <= PAGE_ROWS) return page(q);
      // Si no, de a páginas con un orden fijo hasta traerlo todo (o hasta `limit`).
      const want = q.limit ?? Infinity;
      const paged: SelectQuery = { ...q, order: pagedOrder(q), limit: undefined };
      const out: T[] = [];
      for (let i = 0; i < MAX_PAGES && out.length < want; i++) {
        const from = i * PAGE_ROWS;
        const rows = await page(paged, from, from + Math.min(PAGE_ROWS, want - from) - 1);
        out.push(...rows);
        if (rows.length < PAGE_ROWS) break;
      }
      return out;
    },
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
      // Los mismos nombres que acepta el backend local (así un error de nombre sale igual en los dos).
      checkIdent(fn, 'Función');
      for (const k of Object.keys(args ?? {})) checkIdent(k, 'Argumento');
      let res: { data: unknown; error: DbErrorLike | null; status?: number };
      try {
        res = (await client.rpc(fn, args ?? {})) as typeof res;
      } catch (e) {
        throw toBackendError(e);
      }
      if (res.error) throw mapDbError({ ...res.error, status: res.status ?? res.error.status });
      return (res.data ?? null) as T;
    },
    subscribe(topic, onMessage) {
      let entry = topics.get(topic);
      if (!entry) {
        entry = { listeners: new Set(), channel: null, closed: false };
        topics.set(topic, entry);
        open(topic, entry);
      }
      const cb = (m: RealtimeMessage) => onMessage(m);
      entry.listeners.add(cb);
      const mine = entry;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        mine.listeners.delete(cb);
        if (!mine.listeners.size && !mine.closed) close(topic, mine);
      };
    },
    async invoke<T = unknown>(fn: string, body: unknown): Promise<T> {
      let res: { data: unknown; error: unknown };
      try {
        res = await client.functions.invoke(fn, { body: body as Record<string, unknown> });
      } catch (e) {
        throw await mapFunctionError(e);
      }
      if (res.error) throw await mapFunctionError(res.error);
      return res.data as T;
    },
    online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  };
}
